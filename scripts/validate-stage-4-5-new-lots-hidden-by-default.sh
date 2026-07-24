#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$APP_DIR"

if ! docker compose ps --status running --services | grep -qx 'mysql'; then
  echo "The mysql Compose service is not running." >&2
  echo "Run: docker compose up -d mysql" >&2
  exit 1
fi

column_default="$(
  docker compose exec -T mysql sh -lc \
    'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -NBe "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '''lots''' AND COLUMN_NAME = '''is_active''' LIMIT 1"'
)"

if [[ "$column_default" != "0" ]]; then
  echo "Stage 4.5 validation failed: lots.is_active default is '$column_default'; expected '0'." >&2
  exit 1
fi

echo "Stage 4.5 database default valid: new Lots default to hidden (is_active = 0)."
