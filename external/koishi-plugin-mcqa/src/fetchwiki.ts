import { Context } from "koishi"
import { fetchWikiContent } from "./go/fetchWiki"
import { processHtmlWithJSDOM } from "./htmlPro"


export async function fetchwiki(ctx: Context, keyword: string) {
  try {
    const wikiRawContent = (await fetchWikiContent(ctx, { message: keyword }))
    if (wikiRawContent.error) {
      ctx.logger.info(`从Wiki获取[${keyword}]失败或不存在该条目: ${wikiRawContent.error}`)
      return ""
    }
    const wikiContext = processHtmlWithJSDOM(wikiRawContent.content)
    return wikiContext
  }
  catch (err) {
    ctx.logger.error("获取维基内容时出错:", err)
    return ""
  }
}
