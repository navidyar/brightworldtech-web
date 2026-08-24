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
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='units'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_work_completions'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_checks'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'), ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_checks' AND COLUMN_NAME='reverted_at')
);
SQL
)"

if [[ "$readiness" != "1:1:1:1:1:1" ]]; then
  printf 'Stage 10W70D read-only preflight failed (received %s; expected 1:1:1:1:1:1). Stage 10W70C must already be deployed.\n' "$readiness" >&2
  exit 1
fi

existing_table="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests';
SQL
)"

base_qc_requests="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_requests WHERE request_type='qc_reversion';
SQL
)"

if [[ "$existing_table" == "0" && "$base_qc_requests" != "0" ]]; then
  printf 'Stage 10W70D found %s qc_reversion base request row(s) without the linkage table. Stop for manual inspection.\n' "$base_qc_requests" >&2
  exit 1
fi

if [[ "$existing_table" == "1" ]]; then
  signature="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*)
   FROM information_schema.COLUMNS c
   WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME='unit_qc_reversion_requests'
     AND (
       (c.COLUMN_NAME='unit_request_id' AND LOWER(c.COLUMN_TYPE)=LOWER((SELECT p.COLUMN_TYPE FROM information_schema.COLUMNS p WHERE p.TABLE_SCHEMA=DATABASE() AND p.TABLE_NAME='unit_requests' AND p.COLUMN_NAME='unit_request_id' LIMIT 1)) AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='unit_id' AND LOWER(c.COLUMN_TYPE)=LOWER((SELECT p.COLUMN_TYPE FROM information_schema.COLUMNS p WHERE p.TABLE_SCHEMA=DATABASE() AND p.TABLE_NAME='units' AND p.COLUMN_NAME='unit_id' LIMIT 1)) AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='unit_work_completion_id' AND LOWER(c.COLUMN_TYPE)=LOWER((SELECT p.COLUMN_TYPE FROM information_schema.COLUMNS p WHERE p.TABLE_SCHEMA=DATABASE() AND p.TABLE_NAME='unit_work_completions' AND p.COLUMN_NAME='unit_work_completion_id' LIMIT 1)) AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='unit_qc_check_id' AND LOWER(c.COLUMN_TYPE)=LOWER((SELECT p.COLUMN_TYPE FROM information_schema.COLUMNS p WHERE p.TABLE_SCHEMA=DATABASE() AND p.TABLE_NAME='unit_qc_checks' AND p.COLUMN_NAME='unit_qc_check_id' LIMIT 1)) AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='decision_code' AND c.DATA_TYPE='varchar' AND c.CHARACTER_MAXIMUM_LENGTH=20 AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='qc_reviewed_by_user_id' AND LOWER(c.COLUMN_TYPE)=LOWER((SELECT p.COLUMN_TYPE FROM information_schema.COLUMNS p WHERE p.TABLE_SCHEMA=DATABASE() AND p.TABLE_NAME='users' AND p.COLUMN_NAME='user_id' LIMIT 1)) AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='qc_reviewed_at' AND c.DATA_TYPE='datetime' AND c.DATETIME_PRECISION=6 AND c.IS_NULLABLE='NO') OR
       (c.COLUMN_NAME='qc_review_notes' AND c.DATA_TYPE='text' AND c.IS_NULLABLE='YES') OR
       (c.COLUMN_NAME='created_at' AND c.DATA_TYPE='datetime' AND c.IS_NULLABLE='NO')
     )), ':',
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND INDEX_NAME='PRIMARY' AND SEQ_IN_INDEX=1 AND COLUMN_NAME='unit_request_id'), ':',
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND ((INDEX_NAME='idx_unit_qc_reversion_requests_qc_check' AND SEQ_IN_INDEX=1 AND COLUMN_NAME='unit_qc_check_id') OR (INDEX_NAME='idx_unit_qc_reversion_requests_unit' AND SEQ_IN_INDEX=1 AND COLUMN_NAME='unit_id') OR (INDEX_NAME='idx_unit_qc_reversion_requests_completion' AND SEQ_IN_INDEX=1 AND COLUMN_NAME='unit_work_completion_id'))), ':',
  (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND ((CONSTRAINT_NAME='fk_unit_qc_reversion_request' AND COLUMN_NAME='unit_request_id' AND REFERENCED_TABLE_NAME='unit_requests' AND REFERENCED_COLUMN_NAME='unit_request_id') OR (CONSTRAINT_NAME='fk_unit_qc_reversion_unit' AND COLUMN_NAME='unit_id' AND REFERENCED_TABLE_NAME='units' AND REFERENCED_COLUMN_NAME='unit_id') OR (CONSTRAINT_NAME='fk_unit_qc_reversion_completion' AND COLUMN_NAME='unit_work_completion_id' AND REFERENCED_TABLE_NAME='unit_work_completions' AND REFERENCED_COLUMN_NAME='unit_work_completion_id') OR (CONSTRAINT_NAME='fk_unit_qc_reversion_qc_check' AND COLUMN_NAME='unit_qc_check_id' AND REFERENCED_TABLE_NAME='unit_qc_checks' AND REFERENCED_COLUMN_NAME='unit_qc_check_id') OR (CONSTRAINT_NAME='fk_unit_qc_reversion_reviewer' AND COLUMN_NAME='qc_reviewed_by_user_id' AND REFERENCED_TABLE_NAME='users' AND REFERENCED_COLUMN_NAME='user_id')))
);
SQL
)"
  if [[ "$signature" != "9:1:3:5" ]]; then
    printf 'Stage 10W70D found an incompatible existing unit_qc_reversion_requests table (signature %s; expected 9:1:3:5). No changes were made. Stop for manual inspection.\n' "$signature" >&2
    exit 1
  fi

  integrity="$(scalar_query <<'SQL'
SELECT CONCAT(
  COALESCE(SUM(CASE WHEN ur.unit_request_id IS NULL OR qc.unit_qc_check_id IS NULL OR completion.unit_work_completion_id IS NULL OR u.unit_id IS NULL THEN 1 ELSE 0 END), 0), ':',
  COALESCE(SUM(CASE WHEN qrr.unit_id <> qc.unit_id OR qrr.unit_work_completion_id <> qc.unit_work_completion_id OR qrr.decision_code <> qc.decision_code OR qrr.qc_reviewed_by_user_id <> qc.reviewed_by_user_id OR qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes) THEN 1 ELSE 0 END), 0), ':',
  (SELECT COUNT(*) FROM unit_requests ur LEFT JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id=ur.unit_request_id WHERE ur.request_type='qc_reversion' AND qrr.unit_request_id IS NULL)
)
FROM unit_qc_reversion_requests qrr
LEFT JOIN unit_requests ur ON ur.unit_request_id=qrr.unit_request_id AND ur.request_type='qc_reversion'
LEFT JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id
LEFT JOIN unit_work_completions completion ON completion.unit_work_completion_id=qrr.unit_work_completion_id
LEFT JOIN units u ON u.unit_id=qrr.unit_id;
SQL
)"
  if [[ "$integrity" != "0:0:0" ]]; then
    printf 'Stage 10W70D existing request linkage integrity failed (orphan:snapshot-mismatch:base-without-link = %s). No changes were made.\n' "$integrity" >&2
    exit 1
  fi

  request_rows="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_qc_reversion_requests;
SQL
)"
  printf 'Existing unit_qc_reversion_requests table: yes (%s row(s)); signature 9:1:3:5; linkage integrity clean.\n' "$request_rows"
else
  printf 'Existing unit_qc_reversion_requests table: no.\n'
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  COUNT(*) AS qc_review_rows,
  COALESCE(SUM(reverted_at IS NOT NULL), 0) AS reverted_qc_decisions
FROM unit_qc_checks;

SELECT
  COUNT(*) AS existing_qc_reversion_base_requests,
  COALESCE(SUM(status = 'pending'), 0) AS pending_qc_reversion_base_requests
FROM unit_requests
WHERE request_type = 'qc_reversion';
SQL

printf 'Stage 10W70D read-only preflight passed. No database changes were made.\n'
