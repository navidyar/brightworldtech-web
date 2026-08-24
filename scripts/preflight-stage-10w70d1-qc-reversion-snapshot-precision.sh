#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

ready="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_checks')
);
SQL
)"

if [[ "$ready" != "1:1:1" ]]; then
  printf 'Stage 10W70D1 read-only preflight failed (received %s; expected 1:1:1). Stage 10W70D must already be deployed.\n' "$ready" >&2
  exit 1
fi

counts="$(scalar_query <<'SQL'
SELECT CONCAT(
  COALESCE(SUM(CASE
    WHEN ur.request_type='qc_reversion'
      AND ur.status='pending'
      AND qrr.unit_id = qc.unit_id
      AND qrr.unit_work_completion_id = qc.unit_work_completion_id
      AND qrr.unit_qc_check_id = qc.unit_qc_check_id
      AND qrr.decision_code = qc.decision_code
      AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
      AND (qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes))
    THEN 1 ELSE 0 END), 0), ':',
  COALESCE(SUM(CASE
    WHEN ur.unit_request_id IS NULL OR qc.unit_qc_check_id IS NULL
      OR qrr.unit_id <> qc.unit_id
      OR qrr.unit_work_completion_id <> qc.unit_work_completion_id
      OR qrr.unit_qc_check_id <> qc.unit_qc_check_id
      OR qrr.decision_code <> qc.decision_code
      OR qrr.qc_reviewed_by_user_id <> qc.reviewed_by_user_id
    THEN 1 ELSE 0 END), 0), ':',
  COALESCE(SUM(CASE
    WHEN ur.request_type='qc_reversion'
      AND ur.status <> 'pending'
      AND qrr.unit_id = qc.unit_id
      AND qrr.unit_work_completion_id = qc.unit_work_completion_id
      AND qrr.unit_qc_check_id = qc.unit_qc_check_id
      AND qrr.decision_code = qc.decision_code
      AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
      AND (qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes))
    THEN 1 ELSE 0 END), 0)
)
FROM unit_qc_reversion_requests qrr
LEFT JOIN unit_requests ur ON ur.unit_request_id=qrr.unit_request_id
LEFT JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id;
SQL
)"

IFS=':' read -r safe_pending unsafe_identity historical_mismatch <<< "$counts"

if [[ "$unsafe_identity" != "0" ]]; then
  printf 'Stage 10W70D1 found %s unsafe QC reversion linkage mismatch row(s). No changes were made; stop for manual inspection.\n' "$unsafe_identity" >&2
  exit 1
fi

if [[ "$historical_mismatch" != "0" ]]; then
  printf 'Stage 10W70D1 found %s already-reviewed QC reversion snapshot mismatch row(s). No changes were made; stop for manual inspection.\n' "$historical_mismatch" >&2
  exit 1
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  ur.unit_request_id,
  ur.status,
  qrr.unit_qc_check_id,
  qrr.qc_reviewed_at AS stored_reviewed_at,
  qc.reviewed_at AS exact_reviewed_at,
  qrr.qc_review_notes AS stored_review_notes,
  qc.review_notes AS exact_review_notes
FROM unit_qc_reversion_requests qrr
JOIN unit_requests ur ON ur.unit_request_id=qrr.unit_request_id AND ur.request_type='qc_reversion'
JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id
WHERE ur.status='pending'
  AND qrr.unit_id = qc.unit_id
  AND qrr.unit_work_completion_id = qc.unit_work_completion_id
  AND qrr.decision_code = qc.decision_code
  AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
  AND (qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes))
ORDER BY ur.unit_request_id;
SQL

printf 'Stage 10W70D1 read-only preflight passed. Safe pending snapshot precision repairs: %s. No database changes were made.\n' "$safe_pending"
