#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose exec -T mysql sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-stage-5d-lot-validation-management-acceptance-rollback.sql

echo "Stage 5D Lot-validation Management acceptance rollback complete"
