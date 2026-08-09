#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W.1 Battery Health Lot requirement configuration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_categories'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_values'),
  ':',
  (SELECT COUNT(DISTINCT COLUMN_NAME) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_values'
     AND COLUMN_NAME IN ('config_value_id', 'config_category_id', 'code', 'label', 'value', 'sort_order', 'is_active')),
  ':',
  (SELECT COUNT(*) FROM config_categories WHERE code = 'lot_requirement_types'),
  ':',
  (SELECT COUNT(*)
   FROM config_values cv
   INNER JOIN config_categories cc ON cc.config_category_id = cv.config_category_id
   WHERE cv.code = 'battery_health' AND cc.code <> 'lot_requirement_types')
);
SQL
)"

IFS=':' read -r category_table value_table value_columns category_count conflicting_count <<< "$preflight"

if [[ "$category_table" != "1" || "$value_table" != "1" || "$value_columns" != "7" || "$category_count" != "1" ]]; then
  printf 'Stage 10W.1 preflight failed (received %s; expected 1:1:7:1:0).\n' "$preflight" >&2
  printf '%s\n' 'The Configuration tables and lot_requirement_types category must exist before this repair.' >&2
  exit 1
fi

if [[ "$conflicting_count" != "0" ]]; then
  printf 'Stage 10W.1 stopped: found %s battery_health value(s) outside lot_requirement_types.\n' "$conflicting_count" >&2
  printf '%s\n' 'Resolve the conflicting Configuration value before applying this repair.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10w1-unit-browser-responsive-battery-requirement.sql

readiness="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM config_values cv
INNER JOIN config_categories cc
  ON cc.config_category_id = cv.config_category_id
WHERE cc.code = 'lot_requirement_types'
  AND cv.code = 'battery_health'
  AND cv.label = 'Battery Health'
  AND cv.value = 'battery_health'
  AND COALESCE(cv.is_active, 1) = 1;
SQL
)"

if [[ "$readiness" != "1" ]]; then
  printf 'Stage 10W.1 readiness check failed: found %s active Battery Health requirement type(s).\n' "$readiness" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W.1 Battery Health Lot requirement configuration verified complete.'
