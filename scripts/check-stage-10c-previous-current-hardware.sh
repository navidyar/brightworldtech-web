#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --table)

printf '%s\n' 'Stage 10C previous/current hardware schema:'
"${MYSQL[@]}" <<'SQL'
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'units'
  AND COLUMN_NAME IN ('ram_gb', 'previous_ram_gb', 'storage_gb', 'previous_storage_gb')
ORDER BY FIELD(COLUMN_NAME, 'previous_ram_gb', 'ram_gb', 'previous_storage_gb', 'storage_gb');

SELECT
  CONSTRAINT_NAME,
  CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'units'
  AND CONSTRAINT_NAME IN ('chk_units_previous_ram_gb', 'chk_units_previous_storage_gb')
ORDER BY CONSTRAINT_NAME;

SELECT
  COUNT(*) AS total_units,
  SUM(previous_ram_gb IS NOT NULL) AS previous_memory_recorded_units,
  COALESCE(SUM(previous_ram_gb), 0) AS previous_memory_total_gb,
  SUM(ram_gb IS NOT NULL) AS current_memory_recorded_units,
  COALESCE(SUM(ram_gb), 0) AS current_memory_total_gb,
  SUM(previous_storage_gb IS NOT NULL) AS previous_storage_recorded_units,
  COALESCE(SUM(previous_storage_gb), 0) AS previous_storage_total_gb,
  SUM(storage_gb IS NOT NULL) AS current_storage_recorded_units,
  COALESCE(SUM(storage_gb), 0) AS current_storage_total_gb
FROM units;
SQL
