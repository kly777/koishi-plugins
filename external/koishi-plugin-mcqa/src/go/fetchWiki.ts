import { Context } from 'koishi'
import https from 'https'

export interface WikiInput {
  message: string
}

export interface WikiResponse {
  status: number
  content: string
  error?: string
}

// Chrome 125 的 TLS 密码套件（按优先级）
const CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-SHA256',
  'ECDHE-RSA-AES128-SHA256',
  'ECDHE-ECDSA-AES256-SHA384',
  'ECDHE-RSA-AES256-SHA384',
  'ECDHE-ECDSA-AES128-SHA',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-ECDSA-AES256-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA256',
  'AES256-SHA256',
  'AES128-SHA',
  'AES256-SHA',
].join(':')

// Chrome 125 的签名算法
const SIGALGS = 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512'

/**
 * 使用原生 https 请求抓取 Minecraft Wiki 页面
 * 替代原 Go 实现的 fetch_wiki
 */
export async function fetchWikiContent (ctx: Context, input: WikiInput): Promise<WikiResponse> {
  const keyword = encodeURIComponent(input.message)
  const url = `https://zh.minecraft.wiki/w/${keyword}`

  ctx.logger.info(`[fetchWiki] 正在请求: ${url}`)

  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: 'zh.minecraft.wiki',
      path: `/w/${keyword}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Chromium";v="125", "Google Chrome";v="125"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
      },
      // TLS 配置 - 模拟 Chrome 指纹
      ciphers: CIPHERS,
      honorCipherOrder: true,
      sigalgs: SIGALGS,
      minVersion: 'TLSv1.2' as any,
      maxVersion: 'TLSv1.3' as any,
      ecdhCurve: 'X25519:prime256v1:secp384r1',
    }

    const req = https.request(url, options, (res) => {
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')

        if (res.statusCode !== 200) {
          resolve({
            status: res.statusCode || 500,
            content: '',
            error: `HTTP ${res.statusCode}`,
          })
          return
        }

        resolve({
          status: 200,
          content: body,
        })
      })
    })

    req.on('error', (err) => {
      ctx.logger.error(`[fetchWiki] 请求失败: ${err.message}`)
      resolve({
        status: 500,
        content: '',
        error: `请求失败: ${err.message}`,
      })
    })

    req.setTimeout(15000, () => {
      req.destroy()
      resolve({
        status: 504,
        content: '',
        error: '请求超时',
      })
    })

    req.end()
  })
}
