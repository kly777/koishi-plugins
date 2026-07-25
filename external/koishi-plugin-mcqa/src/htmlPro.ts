import { JSDOM } from 'jsdom';

/**
 * 使用 JSDOM 处理原始 HTML 内容
 * @param rawHtml 原始 HTML 字符串
 * @returns 处理后的文本内容
 */
export function processHtmlWithJSDOM(rawHtml: string): string {
  // 创建 DOM 环境
  const dom = new JSDOM(rawHtml);
  const { document } = dom.window;

  // 移除不需要的元素
  const elementsToRemove = [
    ...document.querySelectorAll('script, style, noscript, iframe, object, embed'),
  ];
  elementsToRemove.forEach(el => el.remove());

  // 提取主要内容区域（根据常见网站结构）
  const mainContent =
    document.querySelector('.mw-content-ltr') ||
    document.querySelector('main') ||
    document.querySelector('.mw-body') || // MediaWiki 结构
    document.querySelector('#content') ||
    document.querySelector('.content') ||
    document.body;

  // 清理内部元素
  const elementsToClean = [
    ...mainContent.querySelectorAll('.navbox, .infobox, .sidebar, .mw-editsection'),
  ];
  elementsToClean.forEach(el => el.remove());

  // 提取文本并优化格式
  let content = mainContent.textContent || '';

  // 优化文本格式
  content = content
    .replace(/\s+/g, ' ') // 合并连续空格
    .replace(/(\r\n|\n|\r)/gm, ' ') // 替换换行符
    .replace(/(\[编辑\])/g, '') // 移除编辑标记
    .replace(/(查看源代码|查看历史)/g, '') // 移除无关文本
    .replace(/\[\d+\]/g, '') // 移除引用标记
    .trim();

  // 限制最大长度
  const MAX_LENGTH = 5000;
  if (content.length > MAX_LENGTH) {
    content = content.substring(0, MAX_LENGTH) + '...';
  }

  return content;
}
