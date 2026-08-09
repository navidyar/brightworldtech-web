#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --table)

printf '%s\n' 'Stage 10W operational ranking administration:'

"${MYSQL[@]}" <<'SQL'
SELECT
  refresh_key,
  refresh_interval_minutes,
  status,
  started_at,
  completed_at AS last_successful_refresh,
  duration_ms AS last_successful_duration_ms,
  ranking_row_count AS last_successful_ranking_rows,
  LEFT(last_error, 240) AS last_error,
  updated_at
FROM operational_option_usage_refresh_state
WHERE refresh_key = 'operational_options';

SELECT
  option_scope,
  context_scope,
  COUNT(DISTINCT option_key) AS cached_values,
  COUNT(DISTINCT context_key) AS contexts,
  COUNT(*) AS ranking_rows,
  MAX(refreshed_at) AS refreshed_at
FROM operational_option_usage_rankings
GROUP BY option_scope, context_scope
ORDER BY option_scope, context_scope;
SQL
