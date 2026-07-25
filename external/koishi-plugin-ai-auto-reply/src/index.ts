import { Context, Schema, Logger, Service } from 'koishi'
import fs from 'fs'
import path from 'path'

const logger = new Logger('ai-auto-reply')

export const name = 'ai-auto-reply'
export const inject = ['ai']

// 类型扩展：让其他插件可以调用 ctx.autoReply.markHandled()
declare module 'koishi' {
  interface Context {
    autoReply: AutoReplyService
  }
}

// ======== 消息记录类型 ========
interface StoredMessage {
  id: string
  platform: string
  channelId: string
  guildId?: string
  userId: string
  username: string
  content: string
  timestamp: number
  replied: boolean
  isMention: boolean
}

// ======== 配置 ========
export interface Config {
  systemPrompt: string
  checkInterval: number
  maxHistory: number
}

export const Config: Schema<Config> = Schema.object({
  systemPrompt: Schema.string()
    .default(`你是一个QQ群智能助手。请根据群聊消息上下文，判断是否需要回复。

规则：
1. 如果有人@机器人或直接提问，必须回复
2. 如果是闲聊、打卡、签到等无意义消息，不需要回复
3. 如果有人在求助或询问技术问题，需要回复
4. 如果是群内正常聊天，不需要插话
5. 回复要简洁友好，不要长篇大论

每次会给你最近N条未回复的消息，请分析是否需要回复。
如果需要回复，请输出回复内容；如果不需要，请回复 NO_REPLY`)
    .description('AI 系统提示词'),
  checkInterval: Schema.number().default(60).description('检查间隔（秒）'),
  maxHistory: Schema.number().default(50).description('每次检查考虑的最大消息数'),
})

// ======== 对外服务：允许其他插件（如 guard）标记消息已处理 ========
class AutoReplyService extends Service {
  private _markFn: ((channelId: string, userId: string, content: string) => void) | null = null

  constructor(ctx: Context) {
    super(ctx, 'autoReply')
  }

  /** 标记某条消息为已处理，避免二次 AI 判断 */
  markHandled(channelId: string, userId: string, content: string) {
    this._markFn?.(channelId, userId, content)
  }

  setHandler(fn: (channelId: string, userId: string, content: string) => void) {
    this._markFn = fn
  }
}

// ======== 插件入口 ========
export function apply (ctx: Context, config: Config) {
  const dataFile = path.join(ctx.baseDir, 'data/ai-auto-reply-messages.json')
  let messageQueue: StoredMessage[] = []

  // 注册服务
  const service = new AutoReplyService(ctx)
  service.setHandler((channelId, userId, content) => {
    let count = 0
    for (const msg of messageQueue) {
      if (!msg.replied && msg.channelId === channelId && msg.userId === userId && msg.content === content) {
        msg.replied = true
        count++
      }
    }
    if (count > 0) {
      logger.info(`外部标记已处理: ${count} 条消息 (${userId})`)
      saveMessages()
    }
  })

  function loadMessages () {
    try {
      if (fs.existsSync(dataFile)) {
        messageQueue = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
      }
    } catch (e) {
      logger.warn('加载消息失败:', (e as Error).message)
    }
  }

  function saveMessages () {
    try {
      const dir = path.dirname(dataFile)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(dataFile, JSON.stringify(messageQueue.slice(-200)))
    } catch (e) {
      logger.warn('保存消息失败:', (e as Error).message)
    }
  }

  loadMessages()

  // 1. 监听所有消息
  ctx.on('message', (session) => {
    if (session.author?.id === session.bot?.selfId) return
    if (session.content?.startsWith('/') || session.content?.startsWith('。')) return

    messageQueue.push({
      id: session.messageId,
      platform: session.platform,
      channelId: session.channelId,
      guildId: session.guildId,
      userId: session.author?.id || session.userId,
      username: session.author?.name || session.author?.nickname || session.username || '未知',
      content: session.content,
      timestamp: Date.now(),
      replied: false,
      isMention: !!session.parsed?.appel || !!session.content?.includes(`@${session.bot?.selfId}`),
    })
  })

  // 2. 定时检查
  const timer = setInterval(() => {
    processMessages().catch(e => logger.warn('处理消息失败:', (e as Error).message))
  }, config.checkInterval * 1000)

  // 3. AI 判断并回复
  async function processMessages () {
    const unreplied = messageQueue.filter(m => !m.replied)
    if (unreplied.length === 0) return

    const groups = new Map<string, StoredMessage[]>()
    for (const msg of unreplied) {
      const key = `${msg.platform}:${msg.channelId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(msg)
    }

    for (const [channelKey, msgs] of groups) {
      await processChannel(channelKey, msgs.slice(-config.maxHistory))
    }
  }

  async function processChannel (channelKey: string, msgs: StoredMessage[]) {
    const [, channelId] = channelKey.split(':')
    const hasMention = msgs.some(m => m.isMention)

    const context = msgs.map(m =>
      `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.username}: ${m.content}${m.isMention ? ' (@我)' : ''}`
    ).join('\n')

    try {
      const reply = await ctx.ai.chat({
        system: config.systemPrompt,
        user: context,
        temperature: 0.5,
        max_tokens: 300,
      })

      if (reply && reply !== 'NO_REPLY') {
        const truncated = reply.length > 120 ? reply.slice(0, 120) + '...' : reply
        logger.info(`[回复] ch=${channelId} msgs=${msgs.length} mention=${hasMention} 内容: ${truncated}`)

        for (const msg of msgs) {
          msg.replied = true
        }

        try {
          const bot = ctx.bots[Object.keys(ctx.bots)[0]]
          if (bot) {
            await bot.sendMessage(channelId, reply)
            logger.success(`[已发送] ch=${channelId}`)
          }
        } catch (e) {
          logger.warn(`[发送失败] ch=${channelId}: ${(e as Error).message}`)
        }
      } else {
        if (!hasMention && msgs.length <= 5) {
          for (const msg of msgs) {
            msg.replied = true
          }
        }
        logger.info(`[不回复] ch=${channelId} msgs=${msgs.length} mention=${hasMention}`)
      }
    } catch (e) {
      logger.warn('AI 判断失败:', (e as Error).message)
    }

    saveMessages()
  }

  // 4. 消息队列查看指令
  ctx.command('msgq', '查看消息队列状态').action(() => {
    const total = messageQueue.length
    const pending = messageQueue.filter(m => !m.replied).length
    return `消息队列: ${total} 条, 待处理: ${pending} 条`
  })

  // 5. 清理
  ctx.on('dispose', () => {
    clearInterval(timer)
    saveMessages()
  })

  logger.success(`AI 自动回复已启动, 间隔=${config.checkInterval}s, 最大历史=${config.maxHistory}`)
}
