#!/usr/bin/env bash
#
# Upload every worker secret in one go.
#
#   ./scripts/setup-secrets.sh ~/Downloads/<project>-firebase-adminsdk-*.json
#
# Secrets are piped into wrangler on stdin rather than typed at its prompt.
# The prompt reads a single line, so pasting a pretty-printed service account
# JSON silently truncates it at the first newline — the usual reason a freshly
# deployed worker fails with "FIREBASE_SERVICE_ACCOUNT is not valid JSON".

set -euo pipefail

cd "$(dirname "$0")/.."

SERVICE_ACCOUNT="${1:-}"
VAPID_FILE=".vapid.json"

if [[ -z "$SERVICE_ACCOUNT" ]]; then
  echo "Usage: $0 <path-to-firebase-service-account.json>" >&2
  exit 1
fi

if [[ ! -f "$SERVICE_ACCOUNT" ]]; then
  echo "Service account file not found: $SERVICE_ACCOUNT" >&2
  exit 1
fi

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run this first, then re-run this script:" >&2
  echo "" >&2
  echo "  npx wrangler login" >&2
  exit 1
fi

# Compact to a single line. jq also validates the JSON while it is at it.
compact_json() {
  if command -v jq >/dev/null 2>&1; then
    jq -c . "$1"
  else
    node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))))' "$1"
  fi
}

if [[ ! -f "$VAPID_FILE" ]]; then
  echo "No $VAPID_FILE yet — generating VAPID keys."
  node scripts/generate-vapid.mjs
  echo ""
fi

read_vapid() {
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(".vapid.json","utf8"))[process.argv[1]])' "$1"
}

echo "Uploading FIREBASE_SERVICE_ACCOUNT..."
compact_json "$SERVICE_ACCOUNT" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT

echo "Uploading VAPID_PUBLIC_KEY..."
read_vapid publicKey | npx wrangler secret put VAPID_PUBLIC_KEY

echo "Uploading VAPID_PRIVATE_KEY..."
read_vapid privateKey | npx wrangler secret put VAPID_PRIVATE_KEY

echo "Uploading TRIGGER_SECRET..."
TRIGGER_SECRET="$(openssl rand -hex 24)"
printf '%s' "$TRIGGER_SECRET" | npx wrangler secret put TRIGGER_SECRET

echo ""
echo "Done. Next steps:"
echo ""
echo "  1. Add to .env.local and to the Vercel project:"
echo "     NEXT_PUBLIC_VAPID_PUBLIC_KEY=$(read_vapid publicKey)"
echo ""
echo "  2. Manual test run after deploying:"
echo "     curl -H \"Authorization: Bearer $TRIGGER_SECRET\" https://<worker>.workers.dev/run"
