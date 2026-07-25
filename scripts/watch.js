/**
 * 开发监听脚本 — 文件变动自动构建+同步到服务器
 *
 * 用法: node scripts/watch.js [plugin]
 *   node scripts/watch.js       监听所有插件
 *   node scripts/watch.js mcqa 只监听 mcqa
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SYNC_SH = path.join(ROOT, 'scripts/sync.sh')

// 插件 → src 路径映射
const PLUGINS = {
  'ai-provider':    'external/koishi-plugin-ai-provider/src',
  'guard':          'external/koishi-plugin-guard/src',
  'mcserver':       'external/koishi-plugin-mcserver/src',
  'mcqa':           'external/koishi-plugin-mcqa/src',
  'ai-auto-reply':  'external/koishi-plugin-ai-auto-reply/src',
}

const TARGET = process.argv[2]
const targets = TARGET ? [TARGET] : Object.keys(PLUGINS)

// 校验
for (const t of targets) {
  if (!PLUGINS[t]) {
    console.error(`未知插件: ${t}，可用: ${Object.keys(PLUGINS).join(', ')}`)
    process.exit(1)
  }
}

console.log(`👀 监听中: ${targets.join(', ')}`)
console.log('   按 Ctrl+C 停止\n')

// 防抖
const debounce = (fn, ms = 1000) => {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// 部署
const deploy = debounce((plugin) => {
  const ts = new Date().toLocaleTimeString()
  console.log(`\n[${ts}] 🔄 变更检测: ${plugin}`)
  try {
    execSync(`bash "${SYNC_SH}" ${plugin} --restart`, {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } catch (e) {
    console.error(`[${ts}] ❌ 部署失败:`, e.message)
  }
}, 1500)

// 监听每个插件的 src 目录
for (const plugin of targets) {
  const srcDir = path.join(ROOT, PLUGINS[plugin])

  if (!fs.existsSync(srcDir)) {
    console.warn(`⚠ 目录不存在: ${srcDir}`)
    continue
  }

  fs.watch(srcDir, { recursive: true }, (event, file) => {
    if (!file || file.startsWith('.')) return
    // 只关注 .ts / .js 文件
    if (!/\.(ts|js)$/i.test(file)) return
    deploy(plugin)
  })

  // 也监听 src 的子目录（如 mcserver/src/fonts, mcqa/src/go）
  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(srcDir, entry.name)
        fs.watch(subDir, { recursive: false }, (event, file) => {
          if (!file || !/\.(ts|js)$/i.test(file)) return
          deploy(plugin)
        })
      }
    }
  } catch {}

  console.log(`  ✓ ${plugin} → ${PLUGINS[plugin]}`)
}

console.log('')
