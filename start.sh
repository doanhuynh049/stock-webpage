#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"
PORT="${PORT:-4873}"

log()  { echo "[start.sh] $*"; }
warn() { echo "[start.sh] WARNING: $*" >&2; }
die()  { echo "[start.sh] ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."
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
  log "Generating Prisma client..."
  npx prisma generate
}

db_push() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
    log "PERSISTENCE_ENABLED=false — skipping db:push."
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
  log "Syncing Neon → JSON cache (psql, for when Node runtime is blocked)..."
  npx tsx scripts/sync-neon-cache.ts 2>/dev/null \
    && log "Neon cache sync: OK" \
    || warn "Neon cache sync failed — portfolio may be empty if Node cannot reach Neon."
}

probe_runtime_db() {
  if grep -qE '^PERSISTENCE_ENABLED=false' .env 2>/dev/null; then
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
  warn "Neon unreachable from Node (ETIMEDOUT) — using JSON cache first (DB_CACHE_FIRST=1)."
  warn "  Optional local fallback: USE_LOCAL_DB=1 ./start.sh dev"
}

check_api_keys() {
  local has_groq=false has_gemini=false
  grep -qE '^GROQ_API_KEY=.+' .env 2>/dev/null && has_groq=true
  grep -qE '^GEMINI_API_KEY=.+' .env 2>/dev/null && has_gemini=true

  if ! $has_groq && ! $has_gemini; then
    warn "No AI API key — AI Analyst uses rule-based fallback."
    warn "  Groq (free):   https://console.groq.com"
    warn "  Gemini (free): https://aistudio.google.com/apikey"
  fi
}

run_dev() {
  log "Starting → http://localhost:${PORT}"
  log "If you see JWT errors, clear browser cookies for localhost."
  export PORT
  export DB_CACHE_FIRST="${DB_CACHE_FIRST:-}"
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
  prisma_prepare
  db_push
  check_api_keys
  log ""
  log "Setup complete!"
  log "  ./start.sh dev     → http://localhost:${PORT}"
  log "  ./start.sh sync    → refresh stock data"
  log ""
  log "For Neon: set DATABASE_URL in .env (see .env.example)"
}

run_sync() {
  setup_env
  npx tsx scripts/sync-market.ts
}

require_cmd node
require_cmd npm
require_cmd openssl

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
  *)
    echo "Usage: ./start.sh [dev|prod|setup|sync]"
    echo ""
    echo "  dev    Start on port ${PORT} (default)"
    echo "  setup  Docker Postgres + Prisma + schema"
    echo "  sync   Refresh live stock data"
    exit 1
    ;;
esac
