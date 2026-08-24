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
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_checks'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_audit_events'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_audit_event_changes')
);
SQL
)"

if [[ "$ready" != "1:1:1:1:1" ]]; then
  printf 'Stage 10W70D2 read-only preflight failed (received %s; expected 1:1:1:1:1). No changes were made.\n' "$ready" >&2
  exit 1
fi

counts="$(scalar_query <<'SQL'
SELECT CONCAT(
  COALESCE(SUM(CASE
    WHEN ur.request_type='qc_reversion'
      AND ur.status='rejected'
      AND ur.reviewed_by_user_id IS NOT NULL
      AND ur.reviewed_at IS NOT NULL
      AND qrr.unit_request_id IS NOT NULL
      AND qc.unit_qc_check_id IS NOT NULL
      AND qrr.unit_id = qc.unit_id
      AND qrr.unit_work_completion_id = qc.unit_work_completion_id
      AND qrr.unit_qc_check_id = qc.unit_qc_check_id
      AND qrr.decision_code = qc.decision_code
      AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
      AND qrr.qc_reviewed_at = qc.reviewed_at
      AND qrr.qc_review_notes <=> qc.review_notes
      AND NOT EXISTS (
        SELECT 1
        FROM unit_audit_events uae
        WHERE uae.event_type='unit_qc_reversion_request_rejected'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(uae.event_metadata_json, '$.unitRequestId')) AS UNSIGNED)=ur.unit_request_id
      )
    THEN 1 ELSE 0 END), 0), ':',
  COALESCE(SUM(CASE
    WHEN ur.request_type='qc_reversion'
      AND ur.status='rejected'
      AND (
        ur.reviewed_by_user_id IS NULL
        OR ur.reviewed_at IS NULL
        OR qrr.unit_request_id IS NULL
        OR qc.unit_qc_check_id IS NULL
        OR qrr.unit_id <> qc.unit_id
        OR qrr.unit_work_completion_id <> qc.unit_work_completion_id
        OR qrr.unit_qc_check_id <> qc.unit_qc_check_id
        OR qrr.decision_code <> qc.decision_code
        OR qrr.qc_reviewed_by_user_id <> qc.reviewed_by_user_id
        OR qrr.qc_reviewed_at <> qc.reviewed_at
        OR NOT (qrr.qc_review_notes <=> qc.review_notes)
      )
    THEN 1 ELSE 0 END), 0)
)
FROM unit_requests ur
LEFT JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id=ur.unit_request_id
LEFT JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id;
SQL
)"

IFS=':' read -r safe_missing unsafe_rejected <<< "$counts"

if [[ "$unsafe_rejected" != "0" ]]; then
  printf 'Stage 10W70D2 found %s rejected QC reversion request(s) with incomplete or mismatched immutable linkage. No changes were made; stop for manual inspection.\n' "$unsafe_rejected" >&2
  exit 1
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  ur.unit_request_id,
  qrr.unit_id,
  qrr.unit_work_completion_id,
  qrr.unit_qc_check_id,
  qrr.decision_code,
  ur.requested_by_user_id,
  ur.reviewed_by_user_id,
  ur.requester_note,
  ur.reviewer_note,
  ur.reviewed_at
FROM unit_requests ur
JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id=ur.unit_request_id
JOIN unit_qc_checks qc ON qc.unit_qc_check_id=qrr.unit_qc_check_id
WHERE ur.request_type='qc_reversion'
  AND ur.status='rejected'
  AND ur.reviewed_by_user_id IS NOT NULL
  AND ur.reviewed_at IS NOT NULL
  AND qrr.unit_id = qc.unit_id
  AND qrr.unit_work_completion_id = qc.unit_work_completion_id
  AND qrr.unit_qc_check_id = qc.unit_qc_check_id
  AND qrr.decision_code = qc.decision_code
  AND qrr.qc_reviewed_by_user_id = qc.reviewed_by_user_id
  AND qrr.qc_reviewed_at = qc.reviewed_at
  AND qrr.qc_review_notes <=> qc.review_notes
  AND NOT EXISTS (
    SELECT 1
    FROM unit_audit_events uae
    WHERE uae.event_type='unit_qc_reversion_request_rejected'
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(uae.event_metadata_json, '$.unitRequestId')) AS UNSIGNED)=ur.unit_request_id
  )
ORDER BY ur.unit_request_id;
SQL

printf 'Stage 10W70D2 read-only preflight passed. Rejected QC reversion request history repairs needed: %s. No database changes were made.\n' "$safe_missing"
