#!/usr/bin/env bash
# Deploy stock-webpage to Vercel (requires: vercel CLI + logged-in account).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking build..."
npm run build

echo ""
echo "==> Deploying to Vercel..."
echo "    Required env vars in Vercel dashboard:"
echo "      DATABASE_URL, AUTH_SECRET, AUTH_URL=https://<your-app>.vercel.app"
echo "      PERSISTENCE_ENABLED=true, DB_DRIVER=http"
echo "      GROQ_API_KEY (optional), CRON_SECRET (optional)"
echo ""

if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

vercel --prod "$@"
