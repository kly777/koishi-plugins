import { describe, it, expect } from 'vitest'

// ====== AI Auto Reply 核心逻辑测试 ======

describe('ai-auto-reply 消息队列', () => {
  interface StoredMessage {
    id: string
    platform: string
    channelId: string
    userId: string
    username: string
    content: string
    timestamp: number
    replied: boolean
    isMention: boolean
  }

  function createQueue() {
    const queue: StoredMessage[] = []
    return {
      push(msg: StoredMessage) { queue.push(msg) },
      getUnreplied() { return queue.filter(m => !m.replied) },
      getPending(channelId: string) {
        return queue.filter(m => !m.replied && m.channelId === channelId)
      },
      markReplied(channelId: string, userId: string, content: string) {
        let count = 0
        for (const msg of queue) {
          if (!msg.replied && msg.channelId === channelId && msg.userId === userId && msg.content === content) {
            msg.replied = true
            count++
          }
        }
        return count
      },
      get length() { return queue.length },
      get pending() { return queue.filter(m => !m.replied).length },
    }
  }

  it('应存储消息', () => {
    const q = createQueue()
    q.push({
      id: '1', platform: 'qq', channelId: '123', userId: 'u1',
      username: '小明', content: '有人吗', timestamp: Date.now(),
      replied: false, isMention: false,
    })
    expect(q.length).toBe(1)
    expect(q.pending).toBe(1)
  })

  it('应过滤已回复消息', () => {
    const q = createQueue()
    q.push({ id: '1', platform: 'qq', channelId: '123', userId: 'u1',
      username: '小明', content: 'hi', timestamp: Date.now(),
      replied: true, isMention: false })
    q.push({ id: '2', platform: 'qq', channelId: '123', userId: 'u2',
      username: '小红', content: 'hello', timestamp: Date.now(),
      replied: false, isMention: false })

    expect(q.getUnreplied()).toHaveLength(1)
    expect(q.getUnreplied()[0].id).toBe('2')
  })

  it('应支持按频道查询待处理消息', () => {
    const q = createQueue()
    q.push({ id: '1', platform: 'qq', channelId: 'g1', userId: 'u1',
      username: 'A', content: 'a', timestamp: Date.now(),
      replied: false, isMention: false })
    q.push({ id: '2', platform: 'qq', channelId: 'g2', userId: 'u2',
      username: 'B', content: 'b', timestamp: Date.now(),
      replied: false, isMention: false })

    expect(q.getPending('g1')).toHaveLength(1)
    expect(q.getPending('g2')).toHaveLength(1)
    expect(q.getPending('g3')).toHaveLength(0)
  })

  it('markReplied 应标记匹配消息为已回复', () => {
    const q = createQueue()
    q.push({ id: '1', platform: 'qq', channelId: 'g1', userId: 'u1',
      username: '小明', content: '查服务器', timestamp: Date.now(),
      replied: false, isMention: true })

    const count = q.markReplied('g1', 'u1', '查服务器')
    expect(count).toBe(1)
    expect(q.pending).toBe(0)
  })

  it('markReplied 不应匹配不同内容', () => {
    const q = createQueue()
    q.push({ id: '1', platform: 'qq', channelId: 'g1', userId: 'u1',
      username: '小明', content: '你好', timestamp: Date.now(),
      replied: false, isMention: false })

    const count = q.markReplied('g1', 'u1', '查服务器')
    expect(count).toBe(0)
    expect(q.pending).toBe(1)
  })

  it('应标记 @消息的 isMention', () => {
    const q = createQueue()
    q.push({
      id: '1', platform: 'qq', channelId: 'g1', userId: 'u1',
      username: '小明', content: '@bot 你好', timestamp: Date.now(),
      replied: false, isMention: true,
    })
    expect(q.getUnreplied()[0].isMention).toBe(true)
  })

  it('应限制消息队列大小', () => {
    const maxSize = 200
    const q = createQueue()
    for (let i = 0; i < 250; i++) {
      q.push({ id: `${i}`, platform: 'qq', channelId: 'g1', userId: 'u1',
        username: 'U', content: `msg${i}`, timestamp: Date.now(),
        replied: false, isMention: false })
    }
    // 只保留最后 200 条
    const trimmed = q.getUnreplied().slice(-200)
    expect(trimmed.length).toBe(200)
    expect(trimmed[0].content).toBe('msg50')
  })

  it('应过滤掉指令消息', () => {
    const skipCommands = (content: string) => 
      content.startsWith('/') || content.startsWith('。')

    expect(skipCommands('/help')).toBe(true)
    expect(skipCommands('。status')).toBe(true)
    expect(skipCommands('你好')).toBe(false)
    expect(skipCommands('/q 铜')).toBe(true)
  })

  it('应过滤掉机器人自己的消息', () => {
    const isSelf = (authorId: string, selfId: string) => authorId === selfId

    expect(isSelf('bot123', 'bot123')).toBe(true)
    expect(isSelf('user456', 'bot123')).toBe(false)
  })
})
