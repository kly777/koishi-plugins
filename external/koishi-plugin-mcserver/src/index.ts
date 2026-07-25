import { Context, h, Schema } from 'koishi'
import { status } from 'minecraft-server-util'
import { generateStatusImage } from './toImg'

export const name = 'mcserver'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

/**
 * Minecraft服务器信息
 */
interface MCServer {
  id: number
  address: string
  port: number
  name: string
  createdAt: Date
}

declare module 'koishi' {
  interface Tables {
    mcserver: MCServer
  }
}

export interface ServerStatus {
  name: string
  address: string
  port: number
  online: boolean
  version?: string
  players?: {
    online: number
    max: number
    sample?: string[]
  }
}

/**
 * 处理添加服务器命令
 * @param ctx 插件上下文
 * @param name 服务器名称
 * @param host 服务器地址（host:port格式）
 * @returns 执行结果
 */
async function addServerCommand(ctx: Context, name: string, host: string) {
  if (!name || !host) {
    return '参数错误:请提供服务器名称和地址'
  }

  // 解析host:port格式
  const match = host.match(/^(.*?)(?::(\d+))?$/)
  if (!match) {
    return '地址格式错误:正确格式为host:port'
  }

  const [, address, portStr] = match
  const port = portStr ? parseInt(portStr) : 25565 // 默认Minecraft端口

  // 验证端口有效性
  if (isNaN(port)) {
    return `端口无效：${portStr} 不是有效的数字`
  }

  if (port < 0 || port > 65535) {
    return `端口超出范围：必须在0-65535之间`
  }

  try {
    // 检查是否已存在相同名称的服务器
    const existing = await ctx.database.get('mcserver', { name })
    if (existing.length > 0) {
      return `服务器名称重复: '${name}' 已存在`
    }

    // 保存到数据库
    await ctx.database.create('mcserver', {
      address,
      port,
      name,
      createdAt: new Date(),
    })
  } catch (e) {
    ctx.logger('mcserver').error('数据库操作失败', e)
    return '服务器添加失败，请检查数据库状态'
  }

  const text = `已添加服务器: ${name}@${address}:${port}`
  try {
    const buffer = await generateStatusImage(text)
    return h.image(buffer, 'image/png')
  } catch (e) {
    ctx.logger('mcserver').error('图片生成失败', e)
    return text // 回退到文本响应
  }
}

/**
 * 获取服务器状态信息
 * @param server 服务器信息
 * @returns 服务器状态数据
 */
async function getServerStatus(server: MCServer): Promise<ServerStatus> {
  try {
    const response = await status(server.address, server.port,{
      timeout: 7000
    })
    return {
      name: server.name,
      address: server.address,
      port: server.port,
      online: true,
      version: response.version.name,
      players: {
        online: response.players.online,
        max: response.players.max,
        sample: response.players.sample?.map(p => p.name)
      }
    }
  } catch (error) {
    return {
      name: server.name,
      address: server.address,
      port: server.port,
      online: false
    }
  }
}

/**
 * 处理服务器状态查询
 * @param ctx 插件上下文
 * @param name 服务器名称（可选）
 * @returns 查询结果
 */
async function statusCommand(ctx: Context, name?: string) {
  let statusData: ServerStatus[] = []

  if (name) {
    // 查询单个服务器
    let servers: string | any[]
    try {
      servers = await ctx.database.get('mcserver', { name })
    } catch (e) {
      ctx.logger('mcserver').error('查询服务器失败', e)
      return `查询服务器失败: ${name}`
    }
    if (servers.length === 0) return `找不到服务器: ${name}`

    const server = servers[0]
    statusData.push(await getServerStatus(server))
  } else {
    // 查询所有服务器
    let servers: MCServer[]
    try {
      servers = await ctx.database.get('mcserver', {})
    } catch (e) {
      ctx.logger('mcserver').error('获取服务器列表失败', e)
      return '获取服务器列表失败'
    }
    if (servers.length === 0) return '没有添加任何服务器'

    // 并行查询所有服务器状态
    const results = await Promise.all(servers.map(getServerStatus))
    statusData = results
  }

  try {
    // 生成结构化状态图片
    const buffer = await generateStatusImage(statusData)
    return h.image(buffer, 'image/png')
  } catch (err) {
    ctx.logger('mcserver').warn(`图片生成失败: ${err.message}`)

    // 生成文本格式的状态信息
    const textResponse = statusData.map(server => {
      if (server.online) {
        return `${server.name} 在线\n` +
          `地址: ${server.address}:${server.port}\n` +
          `版本: ${server.version}\n` +
          `玩家: ${server.players.online}/${server.players.max}` +
          (server.players.sample ? '\n' + server.players.sample.join('\n') : '')
      } else {
        return `${server.name} 离线`
      }
    }).join('\n\n')

    return textResponse
  }
}

/**
 * 处理服务器列表命令
 * @param ctx 插件上下文
 * @returns 服务器列表结果
 */
async function listServersCommand(ctx: Context) {
  let servers: any[]
  try {
    servers = await ctx.database.get('mcserver', {})
  } catch (e) {
    ctx.logger('mcserver').error('获取服务器列表失败', e)
    return '获取服务器列表失败'
  }
  if (servers.length === 0) return '没有添加任何服务器'

  const text = servers.map(s => `${s.name}@${s.address}:${s.port}`).join('\n')
  try {
    const buffer = await generateStatusImage(text)
    return h.image(buffer, 'image/png')
  } catch (e) {
    ctx.logger('mcserver').error('图片生成失败', e)
    return text // 回退到文本响应
  }
}

// 全局未捕获异常处理器
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise rejection:', promise, '原因:', reason)
})

export function apply(ctx: Context) {
  // 初始化数据库表
  ctx.database.extend('mcserver', {
    id: "integer",
    address: 'string',
    port: 'integer',
    name: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
  })

  // 注册命令
  ctx.command('addserver <name:string> <host:string>')
    .action((_, name, host) => addServerCommand(ctx, name, host))

  ctx.command('removeserver <name:string>')
    .action(async (_, name) => {
      const result = await ctx.database.remove('mcserver', { name })
      return result.removed ? `已删除服务器: ${name}` : `找不到服务器: ${name}`
    })

  ctx.command('listserver')
    .action(() => listServersCommand(ctx))

  ctx.command('status [name:string]')
    .action((_, name) => statusCommand(ctx, name))
}


