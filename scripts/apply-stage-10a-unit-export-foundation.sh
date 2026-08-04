#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10A filtered Unit export foundation migration...'

preflight="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processor_families')
);
SQL
)"

if [[ "$preflight" != "1:1" ]]; then
  printf 'Stage 10A preflight failed (received %s; expected 1:1).\n' "$preflight" >&2
  printf '%s\n' 'The units and processor_families tables must exist before Stage 10A.' >&2
  exit 1
fi

battery_column_exists="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'units'
  AND COLUMN_NAME = 'battery_health_percent';
SQL
)"

if [[ "$battery_column_exists" == "1" ]]; then
  invalid_existing_battery_values="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM units
WHERE battery_health_percent IS NOT NULL
  AND (
    TRIM(CAST(battery_health_percent AS CHAR)) = ''
    OR TRIM(CAST(battery_health_percent AS CHAR)) NOT REGEXP '^(100([.]0+)?|[0-9]{1,2}([.][0-9]0*)?)$'
  );
SQL
)"

  if [[ "$invalid_existing_battery_values" != "0" ]]; then
    printf 'Stage 10A stopped: existing battery_health_percent contains %s incompatible value(s).\n' "$invalid_existing_battery_values" >&2
    printf '%s\n' 'Correct or preserve those values before rerunning the idempotent migration.' >&2
    exit 1
  fi
fi

"${MYSQL[@]}" < sql/2026-07-stage-10a-unit-export-foundation.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
     AND COLUMN_NAME = 'battery_health_percent'
     AND COLUMN_TYPE = 'decimal(5,1) unsigned'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processor_families'
     AND COLUMN_NAME = 'export_short_form'
     AND CHARACTER_MAXIMUM_LENGTH = 40
     AND IS_NULLABLE = 'NO'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
     AND CONSTRAINT_NAME = 'chk_units_battery_health_percent'
     AND CONSTRAINT_TYPE = 'CHECK'),
  ':',
  (SELECT COUNT(*) FROM units
   WHERE battery_health_percent IS NOT NULL
     AND battery_health_percent NOT BETWEEN 0 AND 100),
  ':',
  (SELECT COUNT(*) FROM processor_families
   WHERE TRIM(COALESCE(export_short_form, '')) = '')
);
SQL
)"

if [[ "$readiness" != "1:1:1:0:0" ]]; then
  printf 'Stage 10A readiness check failed (received %s; expected 1:1:1:0:0).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-10a-unit-export-foundation.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 10A filtered Unit export foundation migration verified complete.'
