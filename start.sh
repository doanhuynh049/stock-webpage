#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"
PORT="${PORT:-4962}"

log()  { echo "[start.sh] $*"; }
warn() { echo "[start.sh] WARNING: $*" >&2; }
die()  { echo "[start.sh] ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."
}

load_env_flags() {
  if [[ -f .env ]]; then
    grep -qE '^DB_CACHE_FIRST=1' .env && export DB_CACHE_FIRST=1
    grep -qE '^CACHE_USER_ID=' .env && export CACHE_USER_ID="$(grep '^CACHE_USER_ID=' .env | cut -d= -f2- | tr -d '"')"
    local env_port
    env_port="$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    [[ -n "$env_port" ]] && PORT="$env_port"
  fi
}

setup_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      log "Creating .env from .env.example..."
      cp .env.example .env
      echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
    else
      die ".env not found."
    fi
  fi

  if ! grep -q '^AUTH_SECRET=.\+' .env 2>/dev/null; then
    warn "AUTH_SECRET missing — generating..."
    echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
  fi

  if ! grep -q '^AUTH_URL=.\+' .env 2>/dev/null; then
    echo "AUTH_URL=\"http://localhost:${PORT}\"" >> .env
  fi

  if ! grep -q '^PORT=.\+' .env 2>/dev/null; then
    echo "PORT=${PORT}" >> .env
  fi

  load_env_flags
}

start_database() {
  if [[ "${USE_LOCAL_DB:-}" == "1" ]]; then
    log "USE_LOCAL_DB=1 — starting local Docker Postgres."
  elif grep -qE 'neon\.tech|supabase\.co' .env 2>/dev/null; then
    log "Using Neon DATABASE_URL — skipping local Docker."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker not found. Set DATABASE_URL to a working Postgres instance."
    return
  fi

  log "Starting local Postgres (Docker, port 5433)..."
  docker compose up -d db

  log "Waiting for database..."
  for i in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U vnstocks -d vnstocks >/dev/null 2>&1; then
      log "Database is ready."
      return
    fi
    sleep 1
  done
  warn "Database may not be ready yet. Run: docker compose logs db"
}

install_deps() {
  if [[ ! -d node_modules ]]; then
    log "Installing npm dependencies..."
    npm install
  fi
}

prisma_prepare() {
  if [[ -d src/generated/prisma ]] && [[ "${FORCE_PRISMA_GENERATE:-}" != "1" ]]; then
    log "Prisma client present — skip generate (set FORCE_PRISMA_GENERATE=1 to refresh)."
    return
  fi
  log "Generating Prisma client..."
  npx prisma generate
}

db_push() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
    log "PERSISTENCE_ENABLED=false — skipping db:push."
    return
  fi
  if [[ "${DB_CACHE_FIRST:-}" == "1" ]] && [[ "${FORCE_DB_PUSH:-}" != "1" ]]; then
    log "DB_CACHE_FIRST=1 — skipping db:push (schema assumed synced)."
    return
  fi
  log "Pushing database schema..."
  npm run db:push || warn "db:push failed."
}

LOCAL_RUNTIME_URL='postgresql://vnstocks:vnstocks@localhost:5433/vnstocks?schema=public'

use_local_runtime_db() {
  start_database
  log "Pushing schema to local Postgres..."
  DATABASE_URL="$LOCAL_RUNTIME_URL" npx prisma db push --accept-data-loss >/dev/null 2>&1 \
    || warn "Local db:push failed."
  export RUNTIME_DATABASE_URL="$LOCAL_RUNTIME_URL"
  export DB_DRIVER="pg"
  if [[ -f scripts/sync-users-from-neon.sh ]]; then
    chmod +x scripts/sync-users-from-neon.sh 2>/dev/null || true
    bash scripts/sync-users-from-neon.sh || warn "User sync skipped (Neon psql export failed)."
  fi
}

sync_neon_cache() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
    return
  fi
  if ! grep -qE 'neon\.tech' .env 2>/dev/null; then
    return
  fi
  if ! command -v psql >/dev/null 2>&1; then
    warn "psql not found — skipping Neon cache sync."
    return
  fi

  local cache_file="data/neon-cache/recommendations.json"
  if [[ -f "$cache_file" ]] && [[ "${FORCE_CACHE_SYNC:-}" != "1" ]]; then
    local age=$(( $(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || echo 0) ))
    if (( age < 1800 )); then
      log "Neon cache fresh (${age}s) — skip sync (FORCE_CACHE_SYNC=1 to refresh)."
      return
    fi
  fi

  log "Syncing Neon → JSON cache (psql)..."
  npx tsx scripts/sync-neon-cache.ts 2>/dev/null \
    && log "Neon cache sync: OK" \
    || warn "Neon cache sync failed."
}

probe_runtime_db() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
    return
  fi
  if [[ "${DB_CACHE_FIRST:-}" == "1" ]] && [[ -z "${RUNTIME_DATABASE_URL:-}" ]]; then
    log "DB_CACHE_FIRST=1 — probing DB for login (reads still use JSON cache)..."
    if npx tsx scripts/probe-db.ts 2>/dev/null; then
      log "Neon runtime probe: OK"
      return
    fi
    if command -v docker >/dev/null 2>&1 \
      && docker compose exec -T db pg_isready -U vnstocks -d vnstocks >/dev/null 2>&1; then
      warn "Node cannot reach Neon — using local Docker Postgres for login/writes."
      export RUNTIME_DATABASE_URL="$LOCAL_RUNTIME_URL"
      export DB_DRIVER="pg"
      bash scripts/sync-users-from-neon.sh 2>/dev/null \
        || warn "User sync to Docker skipped."
      return
    fi
    if command -v psql >/dev/null 2>&1; then
      npx tsx scripts/sync-users-cache.ts 2>/dev/null \
        && log "User cache for offline login: OK" \
        || warn "User cache sync failed — login may not work until Neon is reachable."
    fi
    return
  fi
  if ! command -v npx >/dev/null 2>&1; then
    return
  fi
  if [[ "${USE_LOCAL_DB:-}" == "1" ]]; then
    use_local_runtime_db
    RUNTIME_DATABASE_URL="$LOCAL_RUNTIME_URL" npx tsx scripts/probe-db.ts 2>/dev/null \
      && log "Local runtime DB probe: OK" \
      || warn "Local runtime DB probe failed."
    return
  fi
  log "Probing Neon runtime connectivity (Node)..."
  if npx tsx scripts/probe-db.ts 2>/dev/null; then
    log "Neon runtime probe: OK"
    return
  fi
  export DB_CACHE_FIRST=1
  warn "Neon TCP unreachable — enabling DB_CACHE_FIRST=1 for this session."
}

check_api_keys() {
  local has_groq=false has_gemini=false
  grep -qE '^GROQ_API_KEY=.+' .env 2>/dev/null && has_groq=true
  grep -qE '^GEMINI_API_KEY=.+' .env 2>/dev/null && has_gemini=true

  if ! $has_groq && ! $has_gemini; then
    warn "No AI API key — AI Analyst uses rule-based fallback."
  fi
}

port_pids() {
  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${PORT}" 2>/dev/null || true
  fi
}

free_port() {
  local pids
  pids=$(port_pids)
  [[ -z "$pids" ]] && return

  warn "Port ${PORT} in use (pid(s): $(echo "$pids" | tr '\n' ' ')) — killing..."
  echo "$pids" | xargs -r kill 2>/dev/null || true

  # Wait up to 5 s for the port to be released; escalate to SIGKILL after 3 s.
  local i
  for i in 1 2 3 4 5; do
    sleep 1
    pids=$(port_pids)
    if [[ -z "$pids" ]]; then
      log "Port ${PORT} freed."
      return
    fi
    if [[ "$i" -eq 3 ]]; then
      warn "Port ${PORT} still busy after ${i}s — sending SIGKILL..."
      echo "$pids" | xargs -r kill -9 2>/dev/null || true
    else
      log "Waiting for port ${PORT} to be released (${i}/5)..."
    fi
  done
  warn "Port ${PORT} may still be in use — proceeding anyway."
}

run_dev() {
  free_port
  log "Starting → http://localhost:${PORT}"
  load_env_flags
  export PORT
  export DB_CACHE_FIRST="${DB_CACHE_FIRST:-}"
  export CACHE_USER_ID="${CACHE_USER_ID:-}"
  export RUNTIME_DATABASE_URL="${RUNTIME_DATABASE_URL:-}"
  export DB_DRIVER="${DB_DRIVER:-}"
  exec npm run dev
}

run_prod() {
  if [[ ! -d .next ]]; then
    npm run build
  fi
  export PORT
  exec npm run start
}

run_setup() {
  setup_env
  install_deps
  start_database
  FORCE_PRISMA_GENERATE=1 prisma_prepare
  FORCE_DB_PUSH=1 db_push
  check_api_keys
  log ""
  log "Setup complete!"
  log "  ./start.sh dev     → http://localhost:${PORT}"
}

sync_trades_db() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
    return
  fi
  if [[ -d data/user-trades ]] && [[ -n "$(ls -A data/user-trades 2>/dev/null)" ]]; then
    log "Syncing JSON trading records → Neon..."
    npx tsx scripts/sync-trades-to-db.ts 2>/dev/null \
      && log "Trading JSON→DB sync: OK" \
      || warn "Trading JSON→DB sync failed."
  fi
}

run_sync() {
  setup_env
  FORCE_CACHE_SYNC=1 sync_neon_cache
  sync_trades_db
  npx tsx scripts/sync-market.ts
}

require_cmd node
require_cmd npm
require_cmd openssl

# Resolve PORT from .env before any function uses it (overrides the shell default above).
load_env_flags

case "$MODE" in
  dev)
    setup_env
    install_deps
    start_database
    prisma_prepare
    db_push
    sync_neon_cache
    probe_runtime_db
    check_api_keys
    run_dev
    ;;
  prod|production)
    setup_env
    install_deps
    prisma_prepare
    run_prod
    ;;
  setup)
    run_setup
    ;;
  sync)
    run_sync
    ;;
  cache)
    setup_env
    FORCE_CACHE_SYNC=1 sync_neon_cache
    sync_trades_db
    ;;
  trades)
    setup_env
    sync_trades_db
    ;;
  *)
    echo "Usage: ./start.sh [dev|prod|setup|sync|cache|trades]"
    exit 1
    ;;
esac
