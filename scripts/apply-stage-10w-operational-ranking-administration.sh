#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W operational ranking administration migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_rankings'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_refresh_state'),
  ':',
  (SELECT COUNT(*) FROM operational_option_usage_refresh_state
   WHERE refresh_key = 'operational_options')
);
SQL
)"

if [[ "$preflight" != "1:1:1" ]]; then
  printf 'Stage 10W preflight failed (received %s; expected 1:1:1).\n' "$preflight" >&2
  printf '%s\n' 'Apply and refresh Stage 10M before Stage 10W.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10w-operational-option-ranking-administration.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'operational_option_usage_refresh_state'
     AND COLUMN_NAME = 'refresh_interval_minutes'
     AND DATA_TYPE = 'smallint'
     AND COLUMN_TYPE = 'smallint unsigned'
     AND IS_NULLABLE = 'NO'
     AND COLUMN_DEFAULT = '120'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'operational_option_usage_refresh_state'
     AND CONSTRAINT_TYPE = 'CHECK'
     AND CONSTRAINT_NAME = 'chk_operational_option_refresh_interval'),
  ':',
  (SELECT COUNT(*) FROM operational_option_usage_refresh_state
   WHERE refresh_key = 'operational_options'
     AND refresh_interval_minutes IN (60, 120, 360, 1440))
);
SQL
)"

if [[ "$readiness" != "1:1:1" ]]; then
  printf 'Stage 10W readiness check failed (received %s; expected 1:1:1).\n' "$readiness" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W operational ranking administration migration verified complete.'
