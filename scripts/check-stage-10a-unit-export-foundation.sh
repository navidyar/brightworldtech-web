#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'units' AND COLUMN_NAME = 'battery_health_percent')
    OR (TABLE_NAME = 'processor_families' AND COLUMN_NAME = 'export_short_form')
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT CONSTRAINT_NAME, CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'chk_units_battery_health_percent';

SELECT processor_family_id, code, name, export_short_form
FROM processor_families
ORDER BY sort_order, processor_family_id;

SELECT
  COUNT(*) AS units_with_battery_health,
  MIN(battery_health_percent) AS minimum_battery_health,
  MAX(battery_health_percent) AS maximum_battery_health
FROM units
WHERE battery_health_percent IS NOT NULL;
SQL
