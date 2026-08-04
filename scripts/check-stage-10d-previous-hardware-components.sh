#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --table)

printf '%s\n' 'Stage 10D structured Previous hardware schema:'
"${MYSQL[@]}" <<'SQL'
SELECT
  TABLE_NAME,
  COUNT(DISTINCT COLUMN_NAME) AS column_count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('unit_previous_memory_modules', 'unit_previous_storage_devices')
GROUP BY TABLE_NAME
ORDER BY TABLE_NAME;

SELECT
  TABLE_NAME,
  INDEX_NAME,
  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('unit_previous_memory_modules', 'unit_previous_storage_devices')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT
  TABLE_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('unit_previous_memory_modules', 'unit_previous_storage_devices')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT
  'Previous Memory' AS component,
  COUNT(*) AS row_count,
  COUNT(DISTINCT unit_id) AS unit_count,
  COALESCE(SUM(size_gb), 0) AS total_gb
FROM unit_previous_memory_modules
UNION ALL
SELECT
  'Previous Storage',
  COUNT(*),
  COUNT(DISTINCT unit_id),
  COALESCE(SUM(size_gb), 0)
FROM unit_previous_storage_devices;
SQL
