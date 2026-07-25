import { Service, Context, Schema, Logger } from 'koishi'

// ======== Type augmentation: all plugins can use ctx.ai ========
declare module 'koishi' {
  interface Context {
    ai: AIProvider
  }
}

const logger = new Logger('ai-provider')

// ======== Public chat options ========
export interface ChatOptions {
  /** 系统提示词 */
  system?: string
  /** 消息历史 */
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  /** 单条用户消息（快捷方式） */
  user?: string
  /** 生成温度 0-2 */
  temperature?: number
  /** 最大输出 token */
  max_tokens?: number
}

// ======== Configuration ========
export interface Config {
  provider: 'deepseek' | 'openai' | 'custom'
  apiKey: string
  apiBaseUrl: string
  model: string
  maxRetries: number
  timeout: number
}

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['deepseek', 'openai', 'custom'])
    .default('deepseek')
    .description('AI 提供商'),
  apiKey: Schema.string()
    .required()
    .description('API Key'),
  apiBaseUrl: Schema.string()
    .default('https://api.deepseek.com/v1')
    .description('API 地址（自定义提供商时修改）'),
  model: Schema.string()
    .default('deepseek-v4-flash')
    .description('模型名称'),
  maxRetries: Schema.number()
    .default(2)
    .min(0)
    .max(10)
    .description('失败重试次数'),
  timeout: Schema.number()
    .default(30000)
    .description('请求超时（毫秒）'),
})

// ======== Provider presets ========
const PRESETS: Record<string, { baseUrl: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1' },
  openai: { baseUrl: 'https://api.openai.com/v1' },
}

// ======== Service ========
export class AIProvider extends Service {
  private config: Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'ai')
    this.config = { ...config }

    // 应用 provider 预设
    const preset = PRESETS[config.provider]
    if (preset && !config.apiBaseUrl) {
      this.config.apiBaseUrl = preset.baseUrl
    }
  }

  /**
   * 发送对话请求，返回 AI 回复文本。
   * 自动重试、统一错误处理。
   */
  async chat(options: ChatOptions): Promise<string> {
    const messages: ChatOptions['messages'] = []

    if (options.system) {
      messages.push({ role: 'system', content: options.system })
    }
    if (options.messages) {
      messages.push(...options.messages)
    }
    if (options.user) {
      messages.push({ role: 'user', content: options.user })
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.ctx.http.post(
          `${this.config.apiBaseUrl}/chat/completions`,
          {
            model: this.config.model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 1000,
          },
          {
            headers: {
              Authorization: `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.timeout,
          },
        )

        const text = result?.choices?.[0]?.message?.content?.trim()
        if (text) return text

        throw new Error('AI 返回了空回复')
      } catch (err: any) {
        lastError = err
        const detail = err.response?.data
          ? typeof err.response.data === 'object' && err.response.data.byteLength
            ? Buffer.from(err.response.data).toString('utf8')
            : typeof err.response.data === 'string'
              ? err.response.data
              : JSON.stringify(err.response.data)
          : err.message

        if (attempt < this.config.maxRetries) {
          logger.warn(`请求失败 (${attempt + 1}/${this.config.maxRetries + 1}): ${detail}，正在重试...`)
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        } else {
          logger.error(`请求失败 (已重试 ${this.config.maxRetries} 次): ${detail}`)
          throw err
        }
      }
    }

    throw lastError || new Error('未知错误')
  }

  /**
   * 快速判断：给定上下文，是否需要回复？
   * 返回 AI 的回复内容，或 null（不需要回复）。
   */
  async decideReply(context: string): Promise<string | null> {
    const prompt = [
      '你是一个群聊消息分析器。请分析以下群聊消息，判断是否需要回复。',
      '规则：',
      '1. @机器人或直接提问 → 必须回复',
      '2. 闲聊、打卡、签到等无意义消息 → 不需要回复',
      '3. 求助或技术问题 → 需要回复',
      '4. 正常聊天不需要插话',
      '',
      '如果需要回复，输出回复内容；如果不需要，只输出 NO_REPLY',
      '',
      '消息：',
      context,
    ].join('\n')

    try {
      const reply = await this.chat({ user: prompt, temperature: 0.3, max_tokens: 300 })
      return reply === 'NO_REPLY' ? null : reply
    } catch {
      return null
    }
  }
}

// ======== Plugin entry ========
export const name = 'ai-provider'

export function apply(ctx: Context, config: Config) {
  ctx.plugin(AIProvider, config)
  logger.success(`AI 服务已启动: ${config.provider} / ${config.model}`)
}
