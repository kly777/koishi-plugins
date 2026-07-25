#!/bin/bash
set -euo pipefail

# ============================================================
# Koishi 插件同步脚本
# 配置方式（优先级：环境变量 > .env 文件 > 默认值）
# ============================================================

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

# 加载 .env 文件（如果存在）
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${KOISHI_HOST:=your-server.com}"
: "${KOISHI_USER:=root}"
: "${KOISHI_BASE:=/root/.koishi/data/instances/default}"

SERVER="${KOISHI_USER}@${KOISHI_HOST}"

usage() {
  echo "用法: $0 <plugin> [--restart]"
  echo ""
  echo "插件:"
  echo "  mcserver    构建并同步 koishi-plugin-mcserver"
  echo "  mcqa        构建并同步 koishi-plugin-mcqa"
  echo "  ai          同步 koishi-plugin-ai-auto-reply"
  echo "  ai-provider 构建并同步 koishi-plugin-ai-provider"
  echo "  all         构建并同步所有插件"
  echo ""
  echo "选项:"
  echo "  --restart   同步后重启 Koishi 服务"
  echo ""
  echo "环境变量 / .env 文件:"
  echo "  KOISHI_HOST   服务器地址 (默认: your-server.com)"
  echo "  KOISHI_USER   SSH 用户 (默认: root)"
  echo "  KOISHI_BASE   远程路径 (默认: /root/.koishi/data/instances/default)"
  exit 1
}

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="${1:-}"
RESTART=false
shift 2>/dev/null || true

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=true ;;
    *) echo "未知选项: $arg"; usage ;;
  esac
done

[ -n "$PLUGIN" ] || usage

sync_mcserver() {
  echo ">>> 构建 mcserver..."
  cd "$WORKSPACE/external/koishi-plugin-mcserver"
  npm run build
  echo ">>> 同步 mcserver..."
  ssh $SSH_OPTS "${SERVER}" "mkdir -p ${KOISHI_BASE}/plugins/mcserver/lib"
  scp $SSH_OPTS lib/index.js "${SERVER}:${KOISHI_BASE}/plugins/mcserver/lib/"
  scp $SSH_OPTS package.json "${SERVER}:${KOISHI_BASE}/plugins/mcserver/"
  echo "    mcserver ✓"
}

sync_mcqa() {
  echo ">>> 构建 mcqa..."
  cd "$WORKSPACE/external/koishi-plugin-mcqa"
  npm run build
  echo ">>> 同步 mcqa..."
  ssh $SSH_OPTS "${SERVER}" "mkdir -p ${KOISHI_BASE}/plugins/mcqa/lib"
  scp $SSH_OPTS lib/index.js "${SERVER}:${KOISHI_BASE}/plugins/mcqa/lib/"
  scp $SSH_OPTS package.json "${SERVER}:${KOISHI_BASE}/plugins/mcqa/"
  echo "    mcqa ✓"
}

sync_ai() {
  echo ">>> 同步 ai-auto-reply..."
  cd "$WORKSPACE/external/koishi-plugin-ai-auto-reply"
  npm run build
  ssh $SSH_OPTS "${SERVER}" "mkdir -p ${KOISHI_BASE}/plugins/ai-auto-reply/lib"
  scp $SSH_OPTS lib/index.js "${SERVER}:${KOISHI_BASE}/plugins/ai-auto-reply/lib/index.js"
  echo "    ai-auto-reply ✓"
}

sync_ai_provider() {
  echo ">>> 构建 ai-provider..."
  cd "$WORKSPACE/external/koishi-plugin-ai-provider"
  npm run build
  echo ">>> 同步 ai-provider..."
  ssh $SSH_OPTS "${SERVER}" "mkdir -p ${KOISHI_BASE}/plugins/ai-provider/lib"
  scp $SSH_OPTS lib/index.js "${SERVER}:${KOISHI_BASE}/plugins/ai-provider/lib/"
  scp $SSH_OPTS package.json "${SERVER}:${KOISHI_BASE}/plugins/ai-provider/"
  echo "    ai-provider ✓"
}

case "$PLUGIN" in
  mcserver)    sync_mcserver ;;
  mcqa)        sync_mcqa ;;
  ai)          sync_ai ;;
  ai-provider) sync_ai_provider ;;
  all)
    sync_ai_provider
    sync_mcserver
    sync_mcqa
    sync_ai
    ;;
  *) echo "未知插件: $PLUGIN"; usage ;;
esac

if [ "$RESTART" = true ]; then
  echo ">>> 重启 Koishi 服务..."
  ssh $SSH_OPTS "${SERVER}" "systemctl restart koishi.service"
  echo "    重启完成 ✓"
fi

echo ""
echo "✅ 同步完成"
