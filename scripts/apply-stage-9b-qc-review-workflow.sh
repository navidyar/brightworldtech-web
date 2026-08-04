#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 9B Quality Control review workflow migration...'

parent_readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  COUNT(*),
  ':',
  SUM(DATA_TYPE IN ('tinyint', 'smallint', 'mediumint', 'int', 'bigint'))
)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'units' AND COLUMN_NAME = 'unit_id')
    OR (TABLE_NAME = 'unit_work_completions' AND COLUMN_NAME = 'unit_work_completion_id')
    OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'user_id')
  );
SQL
)"

if [[ "$parent_readiness" != "3:3" ]]; then
  printf 'Stage 9B parent ID preflight failed (received %s; expected 3:3).\n' "$parent_readiness" >&2
  printf '%s\n' 'The units, unit_work_completions, and users identifier columns must all exist and use integer-compatible types.' >&2
  exit 1
fi

parent_types="$(scalar_query <<'SQL'
SELECT GROUP_CONCAT(
  CONCAT(TABLE_NAME, '.', COLUMN_NAME, '=', COLUMN_TYPE)
  ORDER BY FIELD(TABLE_NAME, 'units', 'unit_work_completions', 'users')
  SEPARATOR ';'
)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'units' AND COLUMN_NAME = 'unit_id')
    OR (TABLE_NAME = 'unit_work_completions' AND COLUMN_NAME = 'unit_work_completion_id')
    OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'user_id')
  );
SQL
)"

printf 'Using live foreign-key column types: %s\n' "$parent_types"

existing_table_count="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks';
SQL
)"

if [[ "$existing_table_count" != "0" && "$existing_table_count" != "1" ]]; then
  printf 'Stage 9B could not determine whether unit_qc_checks exists (received %s).\n' "$existing_table_count" >&2
  exit 1
fi

if [[ "$existing_table_count" == "1" ]]; then
  existing_signature="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*)
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_qc_checks'
     AND COLUMN_NAME IN (
       'unit_qc_check_id',
       'unit_id',
       'unit_work_completion_id',
       'reviewed_by_user_id',
       'decision_code',
       'review_notes',
       'reviewed_at'
     )),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME)
   FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_qc_checks'
     AND INDEX_NAME IN (
       'PRIMARY',
       'idx_unit_qc_checks_unit_latest',
       'idx_unit_qc_checks_completion_latest',
       'idx_unit_qc_checks_reviewer_time',
       'idx_unit_qc_checks_decision_time'
     )),
  ':',
  (SELECT COUNT(*)
   FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_qc_checks'
     AND CONSTRAINT_NAME IN (
       'fk_unit_qc_checks_unit',
       'fk_unit_qc_checks_completion',
       'fk_unit_qc_checks_reviewer'
     ))
);
SQL
)"

  if [[ "$existing_signature" != "7:5:3" ]]; then
    existing_row_count="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_qc_checks;
SQL
)"

    if ! [[ "$existing_row_count" =~ ^[0-9]+$ ]]; then
      printf 'Stage 9B could not determine the existing unit_qc_checks row count (received %s).\n' "$existing_row_count" >&2
      exit 1
    fi

    if [[ "$existing_row_count" != "0" ]]; then
      printf 'Stage 9B found an incompatible unit_qc_checks table with %s existing row(s).\n' "$existing_row_count" >&2
      printf '%s\n' 'The migration will not remove or rewrite legacy QC data automatically.' >&2
      printf '%s\n' 'Run: bash scripts/check-stage-9b-qc-review-storage.sh' >&2
      exit 1
    fi

    printf 'Replacing empty legacy unit_qc_checks table (schema signature %s; expected 7:5:3)...\n' "$existing_signature"
    "${MYSQL[@]}" <<'SQL'
DROP TABLE unit_qc_checks;
SQL
  fi
fi

"${MYSQL[@]}" < sql/2026-07-stage-9b-qc-review-workflow.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM roles WHERE code = 'qc' AND name = 'Quality Control' AND is_active = 1),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'unit_qc_checks'
      AND COLUMN_NAME IN (
        'unit_qc_check_id',
        'unit_id',
        'unit_work_completion_id',
        'reviewed_by_user_id',
        'decision_code',
        'review_notes',
        'reviewed_at'
      )),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME)
   FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_qc_checks'
     AND INDEX_NAME IN (
       'PRIMARY',
       'idx_unit_qc_checks_unit_latest',
       'idx_unit_qc_checks_completion_latest',
       'idx_unit_qc_checks_reviewer_time',
       'idx_unit_qc_checks_decision_time'
     )),
  ':',
  (SELECT COUNT(*)
   FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'unit_qc_checks'
     AND CONSTRAINT_NAME IN (
       'fk_unit_qc_checks_unit',
       'fk_unit_qc_checks_completion',
       'fk_unit_qc_checks_reviewer'
     )),
  ':',
  (SELECT COUNT(*)
   FROM (
     SELECT 'unit_id' AS child_column, 'units' AS parent_table, 'unit_id' AS parent_column
     UNION ALL
     SELECT 'unit_work_completion_id', 'unit_work_completions', 'unit_work_completion_id'
     UNION ALL
     SELECT 'reviewed_by_user_id', 'users', 'user_id'
   ) AS expected_types
   JOIN information_schema.COLUMNS AS child_column
     ON child_column.TABLE_SCHEMA = DATABASE()
    AND child_column.TABLE_NAME = 'unit_qc_checks'
    AND child_column.COLUMN_NAME = expected_types.child_column
   JOIN information_schema.COLUMNS AS parent_column
     ON parent_column.TABLE_SCHEMA = DATABASE()
    AND parent_column.TABLE_NAME = expected_types.parent_table
    AND parent_column.COLUMN_NAME = expected_types.parent_column
   WHERE LOWER(child_column.COLUMN_TYPE) = LOWER(parent_column.COLUMN_TYPE))
);
SQL
)"

if [[ "$readiness" != "1:1:7:5:3:3" ]]; then
  printf 'Stage 9B migration readiness check failed (received %s; expected 1:1:7:5:3:3).\n' "$readiness" >&2
  printf '%s\n' 'The QC role, unit_qc_checks schema, or foreign-key column types are incomplete.' >&2
  printf '%s\n' 'Run: bash scripts/check-stage-9b-qc-review-storage.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 9B Quality Control review workflow migration verified complete.'
