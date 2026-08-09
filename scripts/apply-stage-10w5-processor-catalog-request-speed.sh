#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W.5 Processor Catalog request-speed migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_processor_catalog_requests'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_processor_catalog_requests'
     AND COLUMN_NAME IN ('unit_request_id', 'unit_model_id', 'requested_processor_type', 'requested_processor_name'))
);
SQL
)"

if [[ "$preflight" != "1:4" ]]; then
  printf 'Stage 10W.5 preflight failed (received %s; expected 1:4).\n' "$preflight" >&2
  printf '%s\n' 'Apply the existing Catalog Exception workflow migration before Stage 10W.5.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10w5-processor-catalog-request-speed.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_processor_catalog_requests'
     AND COLUMN_NAME = 'requested_processor_speed_ghz'
     AND DATA_TYPE = 'decimal'
     AND NUMERIC_PRECISION = 5
     AND NUMERIC_SCALE = 2
     AND IS_NULLABLE = 'YES'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_processor_catalog_requests'
     AND CONSTRAINT_TYPE = 'CHECK'
     AND CONSTRAINT_NAME = 'chk_unit_processor_catalog_requested_speed')
);
SQL
)"

if [[ "$readiness" != "1:1" ]]; then
  printf 'Stage 10W.5 readiness check failed (received %s; expected 1:1).\n' "$readiness" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W.5 Processor Catalog request-speed migration verified complete.'
