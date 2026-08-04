#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --table)

printf '%s\n' 'Stage 10J zero-capacity slot schema:'
"${MYSQL[@]}" <<'SQL'
SELECT
  tc.TABLE_NAME,
  tc.CONSTRAINT_NAME,
  cc.CHECK_CLAUSE
FROM information_schema.TABLE_CONSTRAINTS tc
INNER JOIN information_schema.CHECK_CONSTRAINTS cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
  AND tc.CONSTRAINT_NAME IN (
    'chk_units_previous_ram_gb',
    'chk_units_ram_gb',
    'chk_units_previous_storage_gb',
    'chk_units_storage_gb',
    'chk_unit_memory_modules_size',
    'chk_unit_storage_devices_size',
    'chk_unit_previous_memory_modules_size',
    'chk_unit_previous_storage_devices_size'
  )
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME;

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('unit_memory_modules', 'unit_previous_memory_modules')
  AND COLUMN_NAME = 'memory_install_type_code'
ORDER BY TABLE_NAME;

SELECT 'Current Memory' AS component, COUNT(*) AS zero_rows
FROM unit_memory_modules WHERE size_gb = 0
UNION ALL
SELECT 'Current Storage', COUNT(*)
FROM unit_storage_devices WHERE size_gb = 0
UNION ALL
SELECT 'Previous Memory', COUNT(*)
FROM unit_previous_memory_modules WHERE size_gb = 0
UNION ALL
SELECT 'Previous Storage', COUNT(*)
FROM unit_previous_storage_devices WHERE size_gb = 0;
SQL
