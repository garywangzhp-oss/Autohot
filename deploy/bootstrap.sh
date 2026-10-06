#!/usr/bin/env bash
# 一键部署：装 Docker、检查 .env、构建并启动这个站。
# 用法（在仓库根目录）：bash deploy/bootstrap.sh
#
# 可选环境变量：
#   NPM_REGISTRY=https://registry.npmmirror.com  构建时换 npm 源（中国大陆服务器）
#   SKIP_BUILD=1                                 跳过构建，只用现有镜像启动
set -euo pipefail

cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m提示：%s\033[0m\n' "$*"; }
die()  { printf '\033[31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

say "1/6 检查系统"
[ "$(id -u)" -eq 0 ] && SUDO="" || SUDO="sudo"
command -v apt-get >/dev/null 2>&1 || warn "这不是 Debian/Ubuntu 系统，Docker 安装脚本可能需要手动处理。"

say "2/6 安装 Docker（已安装则跳过）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker 2>/dev/null || true
fi
if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="$SUDO docker"; fi
$DOCKER compose version >/dev/null 2>&1 || die "docker compose 不可用，请先安装 docker-compose-plugin。"

say "3/6 检查内存与 swap"
mem_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
swap_mb=$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [ "${mem_mb:-0}" -gt 0 ] && [ "${mem_mb:-0}" -lt 3800 ] && [ "${swap_mb:-0}" -lt 1024 ]; then
  warn "内存 ${mem_mb}MB 偏小，构建镜像容易 OOM，创建 4GB swap"
  $SUDO fallocate -l 4G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
  $SUDO chmod 600 /swapfile && $SUDO mkswap /swapfile >/dev/null && $SUDO swapon /swapfile
  grep -q '^/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
fi

say "4/6 检查 .env"
if [ ! -f .env ]; then
  cp .env.example .env
  die "已从 .env.example 生成 .env。请先填好 SITE_URL、LLM_*、ADMIN_PASSWORD、SESSION_SECRET、IMG_PROXY_SIGN_SECRET、POSTGRES_PASSWORD，然后重新运行。"
fi
missing=""
for k in SITE_URL ADMIN_PASSWORD SESSION_SECRET IMG_PROXY_SIGN_SECRET POSTGRES_PASSWORD LLM_BASE_URL LLM_API_KEY LLM_MODEL; do
  v=$(grep -E "^${k}=" .env | head -1 | cut -d= -f2- || true)
  [ -n "${v:-}" ] || missing="$missing $k"
done
[ -z "$missing" ] || die "这些必填项还是空的：$missing"
grep -qE '^COLLECT_ENABLED=true' .env || warn "COLLECT_ENABLED 不是 true，站点不会抓取内容。"
grep -qE '^MODEL_CALLS_ENABLED=true' .env || warn "MODEL_CALLS_ENABLED 不是 true，站点不会调用模型。"

PROFILE=""
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env; then
  PROFILE="--profile tunnel"
  say "检测到 CLOUDFLARE_TUNNEL_TOKEN，会一并启动 cloudflared（Cloudflare Tunnel）"
else
  warn "没看到 CLOUDFLARE_TUNNEL_TOKEN，只起本地端口；要公网访问请到 Cloudflare 建隧道并把 token 填进 .env。"
fi

say "5/6 构建镜像"
if [ "${SKIP_BUILD:-}" = "1" ]; then
  warn "SKIP_BUILD=1，跳过构建"
else
  REGISTRY_ARG=""
  [ -n "${NPM_REGISTRY:-}" ] && REGISTRY_ARG="--build-arg NPM_REGISTRY=${NPM_REGISTRY}"
  # shellcheck disable=SC2086
  $DOCKER compose $PROFILE build $REGISTRY_ARG
fi

say "6/6 启动"
# shellcheck disable=SC2086
$DOCKER compose $PROFILE up -d

say "完成"
$DOCKER compose ps

site=$(grep -E '^SITE_URL=' .env | head -1 | cut -d= -f2- || true)
admin=$(grep -E '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- || true)
printf '\n站点：%s\n后台：%s/admin\n管理员密码：%s\n' "$site" "$site" "$admin"
printf '看日志：%s compose logs -f --tail 100 api worker web\n' "$DOCKER"
printf '第一次启动会跑数据库迁移 + 导入信源，一两分钟后开始出内容。\n'
