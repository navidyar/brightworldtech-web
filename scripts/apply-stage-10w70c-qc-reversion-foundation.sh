#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W70C QC reversion foundation migration...'
bash scripts/preflight-stage-10w70c-qc-reversion-foundation.sh

"${MYSQL[@]}" < sql/2026-08-stage-10w70c-qc-reversion-foundation.sql

readiness="$(scalar_query <<'SQL'
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
     AND CHARACTER_MAXIMUM_LENGTH = 2000 AND IS_NULLABLE = 'YES'),
  ':',
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
     AND INDEX_NAME = 'idx_unit_qc_checks_reverted_at' AND COLUMN_NAME = 'reverted_at'),
  ':',
  (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_qc_checks'
     AND CONSTRAINT_NAME = 'fk_unit_qc_checks_reverted_by'
     AND COLUMN_NAME = 'reverted_by_user_id'
     AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'user_id')
);
SQL
)"

if [[ "$readiness" != "1:1:1:1:1" ]]; then
  printf 'Stage 10W70C readiness failed (received %s; expected 1:1:1:1:1).\n' "$readiness" >&2
  exit 1
fi

reverted_count="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_qc_checks WHERE reverted_at IS NOT NULL;
SQL
)"
printf 'Stage 10W70C migration verified. Reverted QC decisions currently stored: %s\n' "$reverted_count"
