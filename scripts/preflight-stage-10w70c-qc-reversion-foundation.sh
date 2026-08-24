#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
     AND COLUMN_NAME = 'user_id'
     AND DATA_TYPE IN ('tinyint','smallint','mediumint','int','bigint'))
);
SQL
)"

if [[ "$readiness" != "1:1:1" ]]; then
  printf 'Stage 10W70C read-only preflight failed (received %s; expected 1:1:1).\n' "$readiness" >&2
  exit 1
fi

existing_columns="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
  AND COLUMN_NAME IN ('reverted_at','reverted_by_user_id','reversion_reason');
SQL
)"

if [[ "$existing_columns" != "0" && "$existing_columns" != "3" ]]; then
  printf 'Stage 10W70C found a partial QC reversion schema (%s of 3 columns). Stop for manual inspection.\n' "$existing_columns" >&2
  exit 1
fi

if [[ "$existing_columns" == "3" ]]; then
  compatibility="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
     AND COLUMN_NAME = 'reverted_at' AND DATA_TYPE = 'datetime'
     AND DATETIME_PRECISION = 6 AND IS_NULLABLE = 'YES'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS child
   JOIN information_schema.COLUMNS parent
     ON parent.TABLE_SCHEMA = child.TABLE_SCHEMA
    AND parent.TABLE_NAME = 'users'
    AND parent.COLUMN_NAME = 'user_id'
   WHERE child.TABLE_SCHEMA = DATABASE()
     AND child.TABLE_NAME = 'unit_qc_checks'
     AND child.COLUMN_NAME = 'reverted_by_user_id'
     AND LOWER(child.COLUMN_TYPE) = LOWER(parent.COLUMN_TYPE)
     AND child.IS_NULLABLE = 'YES'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
     AND COLUMN_NAME = 'reversion_reason' AND DATA_TYPE = 'varchar'
     AND CHARACTER_MAXIMUM_LENGTH = 2000 AND IS_NULLABLE = 'YES')
);
SQL
)"
  if [[ "$compatibility" != "1:1:1" ]]; then
    printf 'Stage 10W70C found incompatible existing QC reversion columns (received %s; expected 1:1:1).\n' "$compatibility" >&2
    exit 1
  fi
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  COUNT(*) AS qc_review_rows,
  SUM(decision_code = 'accepted') AS accepted_rows,
  SUM(decision_code = 'rejected') AS rejected_rows
FROM unit_qc_checks;

SELECT
  COUNT(*) AS completion_cycles_with_qc,
  SUM(latest.decision_code = 'accepted') AS latest_accepted,
  SUM(latest.decision_code = 'rejected') AS latest_rejected
FROM (
  SELECT qc.*
  FROM unit_qc_checks qc
  INNER JOIN (
    SELECT unit_work_completion_id, MAX(unit_qc_check_id) AS latest_qc_check_id
    FROM unit_qc_checks
    GROUP BY unit_work_completion_id
  ) newest ON newest.latest_qc_check_id = qc.unit_qc_check_id
) latest;
SQL

printf 'Stage 10W70C read-only preflight passed. Existing reversion columns: %s of 3. No database changes were made.\n' "$existing_columns"
