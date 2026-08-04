#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose exec -T mysql sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-stage-9a-qc-role-permission-foundation-rollback.sql

echo "Stage 9A QC role and permission foundation rollback complete"
