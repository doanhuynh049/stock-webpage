#!/usr/bin/env bash
# Copy app_user from Neon (psql) into local Docker Postgres for dev login.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log()  { echo "[sync-users] $*"; }
warn() { echo "[sync-users] WARNING: $*" >&2; }

if [[ ! -f .env ]]; then
  warn ".env not found"
  exit 1
fi

REMOTE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"

# psql rejects uselibpqcompat (node-postgres only)
REMOTE_URL="${REMOTE_URL//[?&]uselibpqcompat=true/}"
REMOTE_URL="${REMOTE_URL//uselibpqcompat=true&/}"
REMOTE_URL="${REMOTE_URL%\?}"

if [[ -z "$REMOTE_URL" ]] || [[ ! "$REMOTE_URL" == *neon.tech* ]]; then
  warn "DATABASE_URL is not Neon — nothing to sync."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  warn "psql not installed — cannot sync users."
  exit 1
fi

if ! docker compose exec -T db pg_isready -U vnstocks -d vnstocks >/dev/null 2>&1; then
  warn "Local Docker Postgres not ready."
  exit 1
fi

log "Syncing app_user from Neon → local Docker..."

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Hide harmless libpq .so version warnings from mixed client installs
if ! psql "$REMOTE_URL" -v ON_ERROR_STOP=1 -c "\copy (SELECT * FROM app_user ORDER BY created_at) TO '$TMP' WITH CSV HEADER" 2>/dev/null; then
  warn "Failed to export users from Neon."
  exit 1
fi

ROWS="$(tail -n +2 "$TMP" | wc -l | tr -d ' ')"
if [[ "$ROWS" == "0" ]]; then
  warn "No app_user rows on Neon."
  exit 0
fi

docker compose exec -T db psql -U vnstocks -d vnstocks -v ON_ERROR_STOP=1 -q -c "TRUNCATE app_user CASCADE;" >/dev/null
docker compose exec -T db psql -U vnstocks -d vnstocks -v ON_ERROR_STOP=1 -q -c "\copy app_user FROM STDIN WITH CSV HEADER" < "$TMP" >/dev/null

log "Synced $ROWS user(s) to local Postgres."
