#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROLLBACK_FILE="$APP_DIR/sql/2026-07-stage-2-lot-unit-form-rules-rollback.sql"

cd "$APP_DIR"

if [[ ! -f "$ROLLBACK_FILE" ]]; then
  echo "Rollback SQL not found: $ROLLBACK_FILE" >&2
  exit 1
fi

if ! docker compose ps --status running --services | grep -qx 'mysql'; then
  echo "The mysql Compose service is not running." >&2
  echo "Run: docker compose up -d mysql" >&2
  exit 1
fi

echo "Rolling back Stage 2 lot-controlled Unit form rules..."
docker compose exec -T mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < "$ROLLBACK_FILE"
