#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10M operational option ranking cache migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_values'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manufacturers'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_models'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processor_models')
);
SQL
)"

if [[ "$preflight" != "1:1:1:1:1" ]]; then
  printf 'Stage 10M preflight failed (received %s; expected 1:1:1:1:1).\n' "$preflight" >&2
  printf '%s\n' 'The Unit, Configuration, Manufacturer, Unit Model, and Processor catalogs must exist before Stage 10M.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10m-operational-option-usage-rankings.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_rankings'
     AND COLUMN_NAME IN ('option_scope', 'option_key', 'context_scope', 'context_key', 'lifetime_count', 'count_90d', 'count_30d', 'weighted_score', 'last_selected_at', 'refreshed_at')),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_rankings'
     AND INDEX_NAME IN ('PRIMARY', 'idx_operational_option_rankings_scope_score', 'idx_operational_option_rankings_refreshed')),
  ':',
  (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_refresh_state'
     AND COLUMN_NAME IN ('refresh_key', 'status', 'started_at', 'completed_at', 'duration_ms', 'ranking_row_count', 'last_error', 'updated_at')),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'operational_option_usage_refresh_state'
     AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'chk_operational_option_refresh_status'),
  ':',
  (SELECT COUNT(*) FROM operational_option_usage_refresh_state WHERE refresh_key = 'operational_options')
);
SQL
)"

if [[ "$readiness" != "10:3:8:1:1" ]]; then
  printf 'Stage 10M readiness check failed (received %s; expected 10:3:8:1:1).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-10m-operational-option-rankings.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 10M operational option ranking cache migration verified complete.'
