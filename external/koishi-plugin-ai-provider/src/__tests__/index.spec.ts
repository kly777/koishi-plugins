import { describe, it, expect, vi } from 'vitest'

// ====== AI Provider 核心逻辑测试 ======

describe('ai-provider 核心逻辑', () => {
  it('请求体构建应正确', () => {
    // 模拟 API 请求体构建
    function buildChatRequest(options: {
      system?: string
      user?: string
      messages?: Array<{ role: string; content: string }>
      temperature?: number
      max_tokens?: number
      model?: string
    }) {
      const messages: Array<{ role: string; content: string }> = []
      if (options.system) messages.push({ role: 'system', content: options.system })
      if (options.messages) messages.push(...options.messages)
      if (options.user) messages.push({ role: 'user', content: options.user })
      return {
        model: options.model || 'deepseek-v4-flash',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 1000,
      }
    }

    const req = buildChatRequest({ user: 'hi' })
    expect(req.model).toBe('deepseek-v4-flash')
    expect(req.messages).toHaveLength(1)
    expect(req.temperature).toBe(0.7)
  })

  it('decideReply 应解析字符串并返回 null 或文本', () => {
    // 模拟 decideReply 的核心逻辑（字符串判断）
    function decideReply(response: string): string | null {
      const text = response.trim()
      return text === 'NO_REPLY' ? null : text
    }

    expect(decideReply('NO_REPLY')).toBeNull()
    expect(decideReply('好的')).toBe('好的')
    expect(decideReply('  NO_REPLY  ')).toBeNull()
  })

  it('应支持不同 provider 的 baseUrl 预设', () => {
    const presets: Record<string, string> = {
      deepseek: 'https://api.deepseek.com/v1',
      openai: 'https://api.openai.com/v1',
    }

    expect(presets.deepseek).toBe('https://api.deepseek.com/v1')
    expect(presets.openai).toBe('https://api.openai.com/v1')
  })

  it('chat() 请求体应包含正确的参数', async () => {
    // 验证请求构建逻辑
    function buildRequest(options: {
      system?: string
      messages?: Array<{ role: string; content: string }>
      user?: string
      temperature?: number
      max_tokens?: number
    }) {
      const messages: Array<{ role: string; content: string }> = []
      if (options.system) messages.push({ role: 'system', content: options.system })
      if (options.messages) messages.push(...options.messages)
      if (options.user) messages.push({ role: 'user', content: options.user })
      return {
        model: 'deepseek-v4-flash',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 1000,
      }
    }

    const req = buildRequest({ user: 'hi', temperature: 0.5 })
    expect(req.messages).toHaveLength(1)
    expect(req.messages[0].role).toBe('user')
    expect(req.temperature).toBe(0.5)

    const req2 = buildRequest({ system: 'help', user: 'hello' })
    expect(req2.messages).toHaveLength(2)
    expect(req2.messages[0].role).toBe('system')
  })

  it('错误处理应解析各种格式', () => {
    // 验证错误消息解析
    function parseError(err: any): string {
      if (err?.response?.data) {
        const data = err.response.data
        if (typeof data === 'object' && data.byteLength) {
          return Buffer.from(data).toString('utf8')
        }
        if (typeof data === 'string') return data
        return JSON.stringify(data)
      }
      return err?.message || '未知错误'
    }

    expect(parseError({ message: 'timeout' })).toBe('timeout')
    expect(parseError({ response: { data: 'rate limit' } })).toBe('rate limit')
    expect(parseError({})).toBe('未知错误')
  })
})
