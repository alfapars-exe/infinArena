#!/bin/sh
set -eu

log() {
  printf '%s\n' "[space-entrypoint] $*"
}

fail() {
  printf '%s\n' "[space-entrypoint] ERROR: $*" >&2
  exit 1
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

require_var() {
  key="$1"
  eval "value=\${$key:-}"
  if [ -z "$value" ]; then
    fail "$key is required."
  fi
}

require_var "AUTH_TOKEN_SECRET"
require_var "ADMIN_PASSWORD"

export NODE_ENV="${NODE_ENV:-production}"
export BACKEND_ROLE="${BACKEND_ROLE:-all}"
export FRONTEND_ROLE="${FRONTEND_ROLE:-all}"
export BACKEND_PORT="${BACKEND_PORT:-7860}"
export FRONTEND_PORT="${FRONTEND_PORT:-3001}"
export PUBLIC_PORT="${PUBLIC_PORT:-3000}"
export REQUIRE_PERSISTENT_STORAGE="${REQUIRE_PERSISTENT_STORAGE:-false}"

if [ -z "${ADMIN_USERNAME:-}" ]; then
  export ADMIN_USERNAME="admin"
fi

if [ -z "${APP_STORAGE_DIR:-}" ]; then
  if [ -d "/data" ] && [ -w "/data" ]; then
    export APP_STORAGE_DIR="/data/infinarena"
  else
    if is_truthy "${REQUIRE_PERSISTENT_STORAGE}"; then
      fail "REQUIRE_PERSISTENT_STORAGE=true but /data is not writable."
    fi
    export APP_STORAGE_DIR="/tmp/infinarena"
  fi
fi

if [ -z "${ALLOWED_ORIGINS:-}" ] && [ -n "${SPACE_HOST:-}" ]; then
  export ALLOWED_ORIGINS="https://${SPACE_HOST}"
fi

mkdir -p "${APP_STORAGE_DIR}" "${APP_STORAGE_DIR}/uploads"

frontend_server="/app/server.js"
if [ ! -f "${frontend_server}" ] && [ -f "/app/frontend/server.js" ]; then
  frontend_server="/app/frontend/server.js"
fi
if [ ! -f "${frontend_server}" ]; then
  fail "Frontend standalone server.js not found."
fi

shutdown() {
  signal="$1"
  log "Received ${signal}; stopping child processes."
  if [ -n "${backend_pid:-}" ] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null || true
  fi
  if [ -n "${frontend_pid:-}" ] && kill -0 "${frontend_pid}" 2>/dev/null; then
    kill "${frontend_pid}" 2>/dev/null || true
  fi
  if [ -n "${caddy_pid:-}" ] && kill -0 "${caddy_pid}" 2>/dev/null; then
    kill "${caddy_pid}" 2>/dev/null || true
  fi
}

trap 'shutdown SIGTERM; exit 143' TERM
trap 'shutdown SIGINT; exit 130' INT

log "Using APP_STORAGE_DIR=${APP_STORAGE_DIR}"
log "Starting backend on ${BACKEND_PORT}"
(cd /app/backend && PORT="${BACKEND_PORT}" node --import=tsx src/server.ts) &
backend_pid="$!"

log "Starting frontend on ${FRONTEND_PORT}"
(cd /app && PORT="${FRONTEND_PORT}" HOSTNAME="0.0.0.0" FRONTEND_ROLE="${FRONTEND_ROLE}" node "${frontend_server}") &
frontend_pid="$!"

log "Starting Caddy on ${PUBLIC_PORT}"
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid="$!"

while :; do
  if ! kill -0 "${backend_pid}" 2>/dev/null; then
    wait "${backend_pid}" || true
    fail "Backend process exited."
  fi
  if ! kill -0 "${frontend_pid}" 2>/dev/null; then
    wait "${frontend_pid}" || true
    fail "Frontend process exited."
  fi
  if ! kill -0 "${caddy_pid}" 2>/dev/null; then
    wait "${caddy_pid}" || true
    fail "Caddy process exited."
  fi
  sleep 1
done
