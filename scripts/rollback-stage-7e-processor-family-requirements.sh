#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage_count="$({
  docker compose exec -T mysql sh -lc \
    'mysql -N -B -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM lot_requirements WHERE processor_family_id IS NOT NULL"'
} | tr -d '\r[:space:]')"

if [[ "${usage_count:-0}" != "0" ]]; then
  echo "Rollback refused: ${usage_count} Lot requirement(s) still reference Processor Families." >&2
  echo "Remove or replace those requirements before rolling back Stage 7E." >&2
  exit 1
fi

docker compose exec -T mysql sh -lc 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-stage-7e-processor-family-requirements-rollback.sql

echo "Stage 7E Processor Family requirements rollback complete"
