#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --table)

printf '%s\n' 'Stage 10M operational option ranking cache:'
"${MYSQL[@]}" <<'SQL'
SELECT
  TABLE_NAME,
  COUNT(DISTINCT COLUMN_NAME) AS column_count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'operational_option_usage_rankings',
    'operational_option_usage_refresh_state'
  )
GROUP BY TABLE_NAME
ORDER BY TABLE_NAME;

SELECT
  refresh_key,
  status,
  completed_at,
  duration_ms,
  ranking_row_count,
  LEFT(COALESCE(last_error, ''), 120) AS last_error
FROM operational_option_usage_refresh_state
ORDER BY refresh_key;

SELECT
  option_scope,
  context_scope,
  COUNT(*) AS ranking_rows,
  MAX(refreshed_at) AS refreshed_at
FROM operational_option_usage_rankings
GROUP BY option_scope, context_scope
ORDER BY option_scope, context_scope;
SQL
