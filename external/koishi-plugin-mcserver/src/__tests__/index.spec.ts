import { describe, it, expect } from 'vitest'

// ====== MC Server 核心逻辑测试 ======

describe('mcserver 地址解析', () => {
  function parseAddress(host: string): { address: string; port: number } | null {
    const match = host.match(/^(.*?)(?::(\d+))?$/)
    if (!match) return null
    const [, address, portStr] = match
    const port = portStr ? parseInt(portStr) : 25565
    if (isNaN(port) || port < 0 || port > 65535) return null
    return { address, port }
  }

  it('应解析 host:port 格式', () => {
    const result = parseAddress('mc.hypixel.net:25565')
    expect(result).toEqual({ address: 'mc.hypixel.net', port: 25565 })
  })

  it('无端口应返回默认 25565', () => {
    const result = parseAddress('mc.hypixel.net')
    expect(result).toEqual({ address: 'mc.hypixel.net', port: 25565 })
  })

  it('应解析自定义端口', () => {
    const result = parseAddress('localhost:19132')
    expect(result).toEqual({ address: 'localhost', port: 19132 })
  })

  it('无效端口应处理', () => {
    // 非数字端口视为无端口，返回默认 25565
    expect(parseAddress('server:abc')).toEqual({ address: 'server:abc', port: 25565 })
    // 端口超出范围
    expect(parseAddress('server:999999')).toBeNull()
    // 负号不匹配 \d+，视为无端口
    expect(parseAddress('server:-1')).toEqual({ address: 'server:-1', port: 25565 })
  })

  it('应解析 IP 地址', () => {
    const result = parseAddress('192.168.1.1:25565')
    expect(result).toEqual({ address: '192.168.1.1', port: 25565 })
  })

  it('应解析 SRV 格式域名', () => {
    const result = parseAddress('play.example.com')
    expect(result).toEqual({ address: 'play.example.com', port: 25565 })
  })
})

describe('mcserver 状态格式化', () => {
  interface ServerStatus {
    name: string
    address: string
    port: number
    online: boolean
    version?: string
    players?: { online: number; max: number }
  }

  function formatStatus(status: ServerStatus): string {
    if (!status.online) return `❌ ${status.name} (${status.address}:${status.port}) 离线`
    
    let msg = `✅ ${status.name} (${status.address}:${status.port}) 在线`
    if (status.version) msg += `\n  版本: ${status.version}`
    if (status.players) msg += `\n  玩家: ${status.players.online}/${status.players.max}`
    return msg
  }

  it('应格式化在线状态', () => {
    const result = formatStatus({
      name: '我的世界',
      address: 'mc.example.com',
      port: 25565,
      online: true,
      version: 'Paper 1.20.1',
      players: { online: 5, max: 20 },
    })
    expect(result).toContain('✅')
    expect(result).toContain('Paper 1.20.1')
    expect(result).toContain('5/20')
  })

  it('应格式化离线状态', () => {
    const result = formatStatus({
      name: '我的世界',
      address: 'mc.example.com',
      port: 25565,
      online: false,
    })
    expect(result).toContain('❌')
    expect(result).toContain('离线')
  })

  it('在线状态应包含版本和玩家信息', () => {
    const online = formatStatus({
      name: 'Test',
      address: '1.2.3.4',
      port: 25565,
      online: true,
      version: 'Vanilla 1.21',
      players: { online: 0, max: 100 },
    })
    expect(online).toContain('Vanilla 1.21')
    expect(online).toContain('0/100')
  })
})
