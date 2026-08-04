#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose exec -T mysql sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-stage-6a-unit-audit-event-foundation.sql

echo "Stage 6A Unit audit-event foundation migration complete"
