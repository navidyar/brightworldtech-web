#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$APP_DIR/sql/2026-07-stage-4-5-new-lots-hidden-by-default.sql"

cd "$APP_DIR"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "Migration not found: $MIGRATION_FILE" >&2
  exit 1
fi

if ! docker compose ps --status running --services | grep -qx 'mysql'; then
  echo "The mysql Compose service is not running." >&2
  echo "Run: docker compose up -d mysql" >&2
  exit 1
fi

echo "Applying Stage 4.5 new-Lot visibility migration..."
docker compose exec -T mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < "$MIGRATION_FILE"
