#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 9G Quality Control correction workflow migration...'

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
    OR (TABLE_NAME = 'unit_qc_checks' AND COLUMN_NAME = 'unit_qc_check_id')
    OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'user_id')
  );
SQL
)"

if [[ "$parent_readiness" != "4:4" ]]; then
  printf 'Stage 9G parent ID preflight failed (received %s; expected 4:4).\n' "$parent_readiness" >&2
  printf '%s\n' 'Run and validate the Stage 9B QC review migration before Stage 9G.' >&2
  exit 1
fi

existing_table_count="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_corrections';
SQL
)"

if [[ "$existing_table_count" == "1" ]]; then
  existing_signature="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND COLUMN_NAME IN (
       'unit_qc_correction_id', 'unit_id', 'unit_work_completion_id',
       'rejected_qc_check_id', 'submitted_by_user_id', 'correction_notes', 'submitted_at'
     )),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND INDEX_NAME IN (
       'PRIMARY', 'uq_unit_qc_corrections_rejection',
       'idx_unit_qc_corrections_unit_latest',
       'idx_unit_qc_corrections_completion_latest',
       'idx_unit_qc_corrections_submitter_time'
     )),
  ':',
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND CONSTRAINT_NAME IN (
       'fk_unit_qc_corrections_unit', 'fk_unit_qc_corrections_completion',
       'fk_unit_qc_corrections_rejection', 'fk_unit_qc_corrections_submitter'
     ))
);
SQL
)"

  if [[ "$existing_signature" != "7:5:4" ]]; then
    existing_row_count="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_qc_corrections;
SQL
)"

    if ! [[ "$existing_row_count" =~ ^[0-9]+$ ]]; then
      printf 'Stage 9G could not determine the existing correction row count (received %s).\n' "$existing_row_count" >&2
      exit 1
    fi

    if [[ "$existing_row_count" != "0" ]]; then
      printf 'Stage 9G found an incompatible unit_qc_corrections table with %s existing row(s).\n' "$existing_row_count" >&2
      printf '%s\n' 'The migration will not remove or rewrite existing correction data automatically.' >&2
      exit 1
    fi

    printf 'Replacing empty legacy unit_qc_corrections table (schema signature %s; expected 7:5:4)...\n' "$existing_signature"
    "${MYSQL[@]}" <<'SQL'
DROP TABLE unit_qc_corrections;
SQL
  fi
elif [[ "$existing_table_count" != "0" ]]; then
  printf 'Stage 9G could not determine whether unit_qc_corrections exists (received %s).\n' "$existing_table_count" >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-07-stage-9g-qc-correction-workflow.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND COLUMN_NAME IN (
       'unit_qc_correction_id', 'unit_id', 'unit_work_completion_id',
       'rejected_qc_check_id', 'submitted_by_user_id', 'correction_notes', 'submitted_at'
     )),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND INDEX_NAME IN (
       'PRIMARY', 'uq_unit_qc_corrections_rejection',
       'idx_unit_qc_corrections_unit_latest',
       'idx_unit_qc_corrections_completion_latest',
       'idx_unit_qc_corrections_submitter_time'
     )),
  ':',
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_corrections'
     AND CONSTRAINT_NAME IN (
       'fk_unit_qc_corrections_unit', 'fk_unit_qc_corrections_completion',
       'fk_unit_qc_corrections_rejection', 'fk_unit_qc_corrections_submitter'
     )),
  ':',
  (SELECT COUNT(*)
   FROM (
     SELECT 'unit_id' AS child_column, 'units' AS parent_table, 'unit_id' AS parent_column
     UNION ALL SELECT 'unit_work_completion_id', 'unit_work_completions', 'unit_work_completion_id'
     UNION ALL SELECT 'rejected_qc_check_id', 'unit_qc_checks', 'unit_qc_check_id'
     UNION ALL SELECT 'submitted_by_user_id', 'users', 'user_id'
   ) expected
   JOIN information_schema.COLUMNS child_column
     ON child_column.TABLE_SCHEMA = DATABASE()
    AND child_column.TABLE_NAME = 'unit_qc_corrections'
    AND child_column.COLUMN_NAME = expected.child_column
   JOIN information_schema.COLUMNS parent_column
     ON parent_column.TABLE_SCHEMA = DATABASE()
    AND parent_column.TABLE_NAME = expected.parent_table
    AND parent_column.COLUMN_NAME = expected.parent_column
   WHERE LOWER(child_column.COLUMN_TYPE) = LOWER(parent_column.COLUMN_TYPE))
);
SQL
)"

if [[ "$readiness" != "1:7:5:4:4" ]]; then
  printf 'Stage 9G migration readiness check failed (received %s; expected 1:7:5:4:4).\n' "$readiness" >&2
  printf '%s\n' 'Run: bash scripts/check-stage-9g-qc-correction-storage.sh' >&2
  exit 1
fi

printf '%s\n' 'Stage 9G Quality Control correction workflow migration verified complete.'
