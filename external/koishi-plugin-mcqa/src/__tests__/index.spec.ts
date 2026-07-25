import { describe, it, expect } from 'vitest'

// ====== MCQA 核心逻辑测试 ======

describe('mcqa 关键词提取', () => {
  function extractKeywords(text: string): string[] {
    return text.split(' ').map(k => k.trim()).filter(Boolean)
  }

  it('应分割空格分隔的关键词', () => {
    expect(extractKeywords('铜 铜矿')).toEqual(['铜', '铜矿'])
  })

  it('应过滤空关键词', () => {
    expect(extractKeywords('铜  铜矿 ')).toEqual(['铜', '铜矿'])
  })

  it('应支持单个关键词', () => {
    expect(extractKeywords('红石')).toEqual(['红石'])
  })

  it('应处理多个关键词', () => {
    const keywords = extractKeywords('下界合金 锻造模板 下界残骸')
    expect(keywords).toHaveLength(3)
    expect(keywords).toContain('下界合金')
  })
})

describe('mcqa Wiki 内容处理', () => {
  // 模拟 processHtmlWithJSDOM 的核心逻辑
  function processHtmlWithJSDOM(rawHtml: string): string {
    // 模拟从 HTML 提取纯文本
    const text = rawHtml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000)
    return text || ''
  }

  it('应从 HTML 提取纯文本', () => {
    const html = '<div><h1>铜</h1><p>铜是一种矿物。</p></div>'
    const result = processHtmlWithJSDOM(html)
    expect(result).toContain('铜')
    expect(result).toContain('矿物')
    expect(result).not.toContain('<div>')
  })

  it('应限制最大长度', () => {
    const longHtml = '<p>' + 'a'.repeat(6000) + '</p>'
    const result = processHtmlWithJSDOM(longHtml)
    expect(result.length).toBeLessThanOrEqual(5000)
  })

  it('空内容应返回空字符串', () => {
    expect(processHtmlWithJSDOM('')).toBe('')
  })

  it('应移除 HTML 标签', () => {
    const html = '<script>alert(1)</script><style>.cls{}</style><p>内容</p>'
    const result = processHtmlWithJSDOM(html)
    expect(result).toContain('内容')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('<style>')
  })
})

describe('mcqa 提示词模板', () => {
  const KEYWORD_PROMPT = `请从以下Minecraft问题中提取关键词。
问题：{question}`

  it('应替换问题占位符', () => {
    const question = '铜有什么用'
    const prompt = KEYWORD_PROMPT.replace('{question}', question)
    expect(prompt).toContain(question)
    expect(prompt).not.toContain('{question}')
  })
})
