import { Context, Schema } from 'koishi'
import { processHtmlWithJSDOM } from './htmlPro'
import { fetchwiki } from './fetchwiki'

export const name = 'mcqa'
export const inject = ['ai']

/** mcqa 不再需要 ai 配置，统一由 ai-provider 管理 */
export interface Config {}
export const Config: Schema<Config> = Schema.object({})

// 关键词提取提示词模板
const KEYWORD_PROMPT = `请从以下Minecraft问题中提取1-4个最核心的中文关键词（如游戏版本、生物名、物品名等）。要求：
- 只返回关键词本身，不要解释，关键词之间用空格分开
- 关键词必须是游戏中的具体实体、机制或概念
- 避免你的先验知识对你对关键词的选择的影响，例如不要想当然的认为现在的最新版本是多少，因为你的知识库没有及时更新
- 选择Minecraft Wiki中存在的条目名称(重要)
- 例如：铜有什么用 -> 铜 铜矿

问题：在我的世界中，{question}`

const systemPrompt = `你是一个专业的Minecraft游戏助手，请严格遵循：
1. 回答必须基于Minecraft Wiki提供的信息
2. 涉及游戏机制需注明适用版本
3. 涉及合成配方需列出精确材料（数量+名称）
4. 涉及生物行为需注明难度模式
5. 使用自然对话语气（16岁女孩风格），但保持信息准确性
6. 当Wiki信息冲突时优先采用最新正式版内容`

async function extractKeywords (ctx: Context, question: string): Promise<string[]> {
  try {
    const keywordPrompt = KEYWORD_PROMPT.replace('{question}', question)
    const text = await ctx.ai.chat({
      user: keywordPrompt,
      temperature: 0.3,
      max_tokens: 30,
    })
    return text.split(' ').map(k => k.trim()).filter(Boolean)
  } catch (error) {
    ctx.logger('mcqa').warn('关键词提取失败:', error)
    return []
  }
}

export function apply (ctx: Context) {
  const log = ctx.logger('mcqa')

  ctx.command('q <question:text>', 'Minecraft问题解答')
    .action(async ({ session }, question) => {
      const startTime = Date.now()
      const userId = session?.author?.id || session?.userId || '?'
      const ch = session?.channelId || '?'

      if (!question) return '请输入问题'

      log.info(`[/q invoked] user=${userId} ch=${ch} question="${question.substring(0, 80)}"`)

      try {
        // 1. AI 提取关键词
        const t0 = Date.now()
        const keywords = await extractKeywords(ctx, question)
        const t1 = Date.now()
        keywords.push('')
        log.info(`[关键词] ${keywords.filter(Boolean).join(', ')} (${(t1 - t0) / 1000}s)`)

        // 2. 抓取 Wiki 内容
        let wikiContexts = ''
        try {
          const t2 = Date.now()
          const wikiResults = await Promise.all(
            keywords.map(keyword => fetchwiki(ctx, keyword))
          )
          const t3 = Date.now()
          for (let i = 0; i < keywords.length; i++) {
            const kw = keywords[i]
            const content = wikiResults[i]
            if (content) {
              log.info(`[Wiki/${kw}] ${content.substring(0, 100)}... (${(t3 - t2) / 1000}s)`)
              wikiContexts += `[${kw}]: ${content}\n\n`
            } else {
              log.info(`[Wiki/${kw}] 无内容`)
            }
          }
        } catch (e) {
          log.info(`[Wiki] 抓取失败: ${e}`)
        }

        // 3. AI 生成最终回答
        const fullPrompt = `请根据提供的Wiki信息回答Minecraft问题：
### 回答规则：
1. 涉及游戏机制 → 说明[版本]和[平台]
2. 涉及合成配方 → 格式: "合成表: 3x木头 + 2x木棍"
3. 涉及生物行为 → 注明[难度模式]
4. 涉及红石 → 只说明功能原理，不说明电路图
5. 使用自然对话但保持专业
6. 避免使用与问题无关的wiki信息

### 思考流程：
1. 明确问题，让问题清晰
2. 对wiki信息进行逐一分析，剔除无关或误导信息(重要)
3. 结合有帮助的wiki信息，回答问题

### Wiki参考信息(可能与问题无关甚至有误导性，注意辨别)：
${wikiContexts.trim()}

### 问题：
在Minecraft中，${question}`

        log.info(`[AI生成回答] wiki=${wikiContexts ? wikiContexts.length : 0}字符`)
        const t4 = Date.now()
        const answer = await ctx.ai.chat({
          system: systemPrompt,
          user: fullPrompt,
        })
        const t5 = Date.now()
        const truncated = answer.length > 100 ? answer.substring(0, 100) + '...' : answer
        log.info(`[回答完成] "${truncated}" (${(t5 - t4) / 1000}s, 总计${(t5 - startTime) / 1000}s)`)

        return answer
      } catch (error) {
        log.error(`[失败] 耗时=${(Date.now() - startTime) / 1000}s:`, error)
        return '问答服务暂时不可用，请稍后再试'
      }
    })
}
