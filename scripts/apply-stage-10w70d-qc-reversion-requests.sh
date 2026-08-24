#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W70D QC reversion request migration...'
bash scripts/preflight-stage-10w70d-qc-reversion-requests.sh

"${MYSQL[@]}" < sql/2026-08-stage-10w70d-qc-reversion-requests.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND COLUMN_NAME IN ('unit_request_id','unit_id','unit_work_completion_id','unit_qc_check_id','decision_code','qc_reviewed_by_user_id','qc_reviewed_at','qc_review_notes','created_at')), ':',
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND INDEX_NAME='PRIMARY' AND COLUMN_NAME='unit_request_id'), ':',
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND INDEX_NAME IN ('idx_unit_qc_reversion_requests_qc_check','idx_unit_qc_reversion_requests_unit','idx_unit_qc_reversion_requests_completion')), ':',
  (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests' AND REFERENCED_TABLE_NAME IS NOT NULL)
);
SQL
)"

if [[ "$readiness" != "9:1:3:5" ]]; then
  printf 'Stage 10W70D readiness failed (received %s; expected 9:1:3:5).\n' "$readiness" >&2
  exit 1
fi

# Re-run the read-only gate against the created/verified table so type, FK, and linkage checks are authoritative.
bash scripts/preflight-stage-10w70d-qc-reversion-requests.sh

request_rows="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_qc_reversion_requests;
SQL
)"
printf 'Stage 10W70D migration verified. QC reversion requests currently stored: %s\n' "$request_rows"
