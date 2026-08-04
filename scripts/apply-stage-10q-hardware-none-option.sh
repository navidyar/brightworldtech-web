#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10Q Hardware Issue None option...'

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
  (SELECT COUNT(*) FROM config_categories
   WHERE code IN ('hardware_issue_types', 'hardware_issue_type', 'hardware_issues'))
);
SQL
)"

IFS=':' read -r category_table value_table value_columns category_count <<< "$preflight"

if [[ "$category_table" != "1" || "$value_table" != "1" || "$value_columns" != "7" || "$category_count" -lt 1 ]]; then
  printf 'Stage 10Q preflight failed (received %s; expected 1:1:7:<at least 1>).\n' "$preflight" >&2
  printf '%s\n' 'The Configuration tables and Hardware Issue Type category must exist before Stage 10Q.' >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10q-hardware-none-option.sql

none_count="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM config_values cv
INNER JOIN config_categories cc
  ON cc.config_category_id = cv.config_category_id
WHERE cc.code IN ('hardware_issue_types', 'hardware_issue_type', 'hardware_issues')
  AND COALESCE(cv.is_active, 1) = 1
  AND (
    LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.code, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.label, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
    OR LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(cv.value, '')), ' ', '_'), '-', '_'), '__', '_')) IN (
      'none', 'no_issue', 'no_issues', 'hardware_none', 'hardware_issue_none', 'no_hardware_issue', 'no_hardware_issues'
    )
  );
SQL
)"

if [[ ! "$none_count" =~ ^[0-9]+$ || "$none_count" -lt 1 ]]; then
  printf 'Stage 10Q readiness check failed: found %s active Hardware None option(s).\n' "$none_count" >&2
  exit 1
fi

printf 'Stage 10Q Hardware Issue None option verified complete: %s active semantic None option(s).\n' "$none_count"
