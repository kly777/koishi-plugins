import { Context, Schema, Logger } from 'koishi'
import http from 'http'
import { randomUUID } from 'crypto'

export const name = 'http-adapter'
export const inject = ['ai']

const logger = new Logger('http-adapter')

export interface Config {
  port: number
  token: string
}

export const Config: Schema<Config> = Schema.object({
  port: Schema.number().default(6240).description('HTTP 监听端口'),
  token: Schema.string().default(() => randomUUID().slice(0, 8)).description('认证 Token'),
})

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function json(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data, null, 2))
}

export function apply(ctx: Context, config: Config) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Token')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const token = req.headers['x-token'] as string
    if (token !== config.token) { json(res, 401, { error: 'X-Token 错误' }); return }

    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const path = url.pathname

    try {
      // GET /ping
      if (req.method === 'GET' && path === '/ping') {
        json(res, 200, { status: 'ok', time: new Date().toISOString() })
        return
      }

      // GET /commands
      if (req.method === 'GET' && path === '/commands') {
        const bot = ctx.bots[Object.keys(ctx.bots)[0]]
        json(res, 200, { selfId: bot?.selfId || '无', bots: Object.keys(ctx.bots).length })
        return
      }

      // POST /send — 模拟消息，直接执行路由 + 返回结果
      if (req.method === 'POST' && path === '/send') {
        const body = await parseBody(req)
        const { text } = body
        if (!text) { json(res, 400, { error: '缺少 text' }); return }

        // 清洗文本
        const clean = text.replace(/<[^>]+>/g, '').replace(/@\S+/g, '').trim() || text

        // guard 的关键词路由逻辑
        const MC_KW = ['mc','minecraft','我的世界','合成','配方','生物','方块','物品','武器','工具','附魔','红石','建筑','mod','模组','种子','地形','群系','村民','交易','成就','进度','铜','铁','金','钻','下界','末地','鞘翅']
        const isMC = MC_KW.some(k => clean.toLowerCase().includes(k))
        const isQ = /(怎么|如何|什么|多少|能不能|在哪|什么是|有哪些|怎么用|做什么|如何做|最新|更新|版本)/.test(clean)

        const result: any = { text, cleaned: clean, method: 'ai直接回答' }

        if (isMC || isQ) {
          result.routed = true
          result.to = '/q'
          // 用 AI 回答（模拟 /q 的行为）
          const answer = await ctx.ai.chat({
            system: '你是Minecraft游戏助手。回答简洁准确，注明版本，合成配方列出材料。',
            user: `在Minecraft中，${clean}`,
            max_tokens: 800,
          })
          result.reply = answer
          result.method = 'routed_to_q'
        } else {
          result.routed = false
          // 普通 AI 回答
          result.reply = await ctx.ai.chat({ user: clean, max_tokens: 500 })
        }

        logger.success(`[send] 回复: ${result.reply.substring(0, 120)}`)
        json(res, 200, result)
        return
      }

      // POST /ask — 直接 AI 问答
      if (req.method === 'POST' && path === '/ask') {
        const body = await parseBody(req)
        const { text } = body
        if (!text) { json(res, 400, { error: '缺少 text' }); return }

        const answer = await ctx.ai.chat({ user: text, max_tokens: 500 })
        json(res, 200, { answer })
        return
      }

      // POST /q — 模拟 /q 指令
      if (req.method === 'POST' && path === '/q') {
        const body = await parseBody(req)
        const { question } = body
        if (!question) { json(res, 400, { error: '缺少 question' }); return }

        const answer = await ctx.ai.chat({
          system: '你是Minecraft游戏助手。回答简洁准确，注明版本，合成配方列出材料。',
          user: `在Minecraft中，${question}`,
          max_tokens: 800,
        })
        json(res, 200, { question, answer })
        return
      }

      // POST /route — AI 路由检测（同 guard 逻辑）
      if (req.method === 'POST' && path === '/route') {
        const body = await parseBody(req)
        const { text } = body
        if (!text) { json(res, 400, { error: '缺少 text' }); return }

        const prompt = `你是一个指令路由分析器。根据用户消息判断是否应调用某个指令。
可用指令：/q - MC问题解答, /status - 服务器状态, /listserver - 列表服务器, /addserver - 添加服务器, /removeserver - 删除服务器
规则：如果用户意图匹配某个指令返回 CMD:指令名 参数，否则返回 NONE
用户: "${text}"`

        const result = await ctx.ai.chat({ user: prompt, temperature: 0.1, max_tokens: 50 })
        const match = result.match(/^CMD:(\S+)\s*(.*)$/i)

        if (match) {
          json(res, 200, { routed: true, to: match[1].toLowerCase(), args: match[2]?.trim() || text })
        } else {
          json(res, 200, { routed: false, reason: result })
        }
        return
      }

      json(res, 404, { error: `未知路径 ${path}` })
    } catch (e: any) {
      json(res, 500, { error: e.message })
    }
  })

  server.listen(config.port, () => {
    logger.success(`HTTP 适配器已启动: http://0.0.0.0:${config.port}`)
    logger.info(`Token: ${config.token}`)
    logger.info(`POST /send - 模拟消息, body: {text, timeout?}`)
    logger.info(`POST /ask  - AI问答, body: {text}`)
    logger.info(`POST /route - 路由测试, body: {text}`)
  })

  ctx.on('dispose', () => server.close())
}
