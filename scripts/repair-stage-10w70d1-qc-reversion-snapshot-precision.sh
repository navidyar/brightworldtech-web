#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"

printf '%s\n' 'Repairing Stage 10W70D pending QC reversion snapshot precision...'
bash scripts/preflight-stage-10w70d1-qc-reversion-snapshot-precision.sh

bash "$MYSQL_RUNNER" <<'SQL'
UPDATE unit_qc_reversion_requests qrr
JOIN unit_requests ur
  ON ur.unit_request_id=qrr.unit_request_id
 AND ur.request_type='qc_reversion'
 AND ur.status='pending'
JOIN unit_qc_checks qc
  ON qc.unit_qc_check_id=qrr.unit_qc_check_id
SET
  qrr.qc_reviewed_at = qc.reviewed_at,
  qrr.qc_review_notes = qc.review_notes
WHERE qrr.unit_id = qc.unit_id
  AND qrr.unit_work_completion_id = qc.unit_work_completion_id
  AND qrr.decision_code = qc.decision_code
  AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
  AND (qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes));

SELECT ROW_COUNT() AS repaired_pending_snapshot_rows;
SQL

remaining="$(bash "$MYSQL_RUNNER" --batch --skip-column-names <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*)
FROM unit_qc_reversion_requests qrr
JOIN unit_requests ur ON ur.unit_request_id=qrr.unit_request_id AND ur.request_type='qc_reversion'
JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id
WHERE qrr.unit_id <> qc.unit_id
   OR qrr.unit_work_completion_id <> qc.unit_work_completion_id
   OR qrr.decision_code <> qc.decision_code
   OR qrr.qc_reviewed_by_user_id <> qc.reviewed_by_user_id
   OR qrr.qc_reviewed_at <> qc.reviewed_at
   OR NOT (qrr.qc_review_notes <=> qc.review_notes);
SQL
)"

if [[ "$remaining" != "0" ]]; then
  printf 'Stage 10W70D1 repair verification failed: %s snapshot mismatch row(s) remain.\n' "$remaining" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W70D1 snapshot precision repair verified.'
