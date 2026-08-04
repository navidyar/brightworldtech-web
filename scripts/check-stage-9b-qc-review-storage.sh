#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT code, name, is_active
FROM roles
WHERE code = 'qc';

SELECT
  TABLE_NAME,
  TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks';

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
ORDER BY ORDINAL_POSITION;

SELECT DISTINCT INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
ORDER BY INDEX_NAME;

SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
ORDER BY CONSTRAINT_NAME;

SELECT
  expected.child_column,
  child_column.COLUMN_TYPE AS child_column_type,
  CONCAT(expected.parent_table, '.', expected.parent_column) AS referenced_column,
  parent_column.COLUMN_TYPE AS referenced_column_type,
  LOWER(child_column.COLUMN_TYPE) = LOWER(parent_column.COLUMN_TYPE) AS type_matches
FROM (
  SELECT 'unit_id' AS child_column, 'units' AS parent_table, 'unit_id' AS parent_column
  UNION ALL
  SELECT 'unit_work_completion_id', 'unit_work_completions', 'unit_work_completion_id'
  UNION ALL
  SELECT 'reviewed_by_user_id', 'users', 'user_id'
) AS expected
LEFT JOIN information_schema.COLUMNS AS child_column
  ON child_column.TABLE_SCHEMA = DATABASE()
 AND child_column.TABLE_NAME = 'unit_qc_checks'
 AND child_column.COLUMN_NAME = expected.child_column
LEFT JOIN information_schema.COLUMNS AS parent_column
  ON parent_column.TABLE_SCHEMA = DATABASE()
 AND parent_column.TABLE_NAME = expected.parent_table
 AND parent_column.COLUMN_NAME = expected.parent_column
ORDER BY FIELD(expected.child_column, 'unit_id', 'unit_work_completion_id', 'reviewed_by_user_id');

SELECT COUNT(*) AS qc_review_row_count
FROM unit_qc_checks;
SQL
