#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"

printf '%s\n' 'Repairing rejected QC reversion request Unit History...'
bash scripts/preflight-stage-10w70d2-qc-reversion-rejection-history.sh

bash "$MYSQL_RUNNER" <<'SQL'
START TRANSACTION;

INSERT INTO unit_audit_events (
  unit_id,
  actor_user_id,
  event_type,
  event_source,
  event_summary,
  correlation_key,
  event_metadata_json,
  occurred_at
)
SELECT
  qrr.unit_id,
  ur.reviewed_by_user_id,
  'unit_qc_reversion_request_rejected',
  'quality_control_reversion_request',
  'Rejected QC decision reversion request',
  UUID(),
  JSON_OBJECT(
    'unitRequestId', ur.unit_request_id,
    'unitWorkCompletionId', qrr.unit_work_completion_id,
    'qcCheckId', qrr.unit_qc_check_id,
    'decisionCode', qrr.decision_code,
    'requestedByUserId', ur.requested_by_user_id
  ),
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
  );

SELECT ROW_COUNT() AS inserted_rejection_history_events;

INSERT INTO unit_audit_event_changes (
  unit_audit_event_id, field_key, field_label, change_type,
  old_value_text, new_value_text, old_value_json, new_value_json, sort_order
)
SELECT
  uae.unit_audit_event_id,
  changes.field_key,
  changes.field_label,
  changes.change_type,
  changes.old_value_text,
  changes.new_value_text,
  NULL,
  NULL,
  changes.sort_order
FROM unit_audit_events uae
JOIN unit_requests ur
  ON ur.request_type='qc_reversion'
 AND ur.status='rejected'
 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(uae.event_metadata_json, '$.unitRequestId')) AS UNSIGNED)=ur.unit_request_id
JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id=ur.unit_request_id
LEFT JOIN users requester ON requester.user_id=ur.requested_by_user_id
CROSS JOIN (
  SELECT 'qc_reversion_request' AS field_key, 'QC Reversion Request' AS field_label, 'rejected' AS change_type, 'Pending' AS old_value_text, 'Rejected' AS new_value_text, 10 AS sort_order
  UNION ALL SELECT 'qc_decision', 'Quality Control Decision Retained', 'recorded', NULL, NULL, 20
  UNION ALL SELECT 'qc_reversion_requested_by', 'Requested By', 'recorded', NULL, NULL, 30
  UNION ALL SELECT 'qc_reversion_request_reason', 'Reversion Request Reason', 'recorded', NULL, NULL, 40
  UNION ALL SELECT 'qc_reversion_reviewer_note', 'Rejection Note', 'recorded', NULL, NULL, 50
) changes
WHERE uae.event_type='unit_qc_reversion_request_rejected'
  AND NOT EXISTS (
    SELECT 1
    FROM unit_audit_event_changes uaec
    WHERE uaec.unit_audit_event_id=uae.unit_audit_event_id
      AND uaec.field_key=changes.field_key
  );

UPDATE unit_audit_event_changes uaec
JOIN unit_audit_events uae ON uae.unit_audit_event_id=uaec.unit_audit_event_id
JOIN unit_requests ur
  ON ur.request_type='qc_reversion'
 AND ur.status='rejected'
 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(uae.event_metadata_json, '$.unitRequestId')) AS UNSIGNED)=ur.unit_request_id
JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id=ur.unit_request_id
LEFT JOIN users requester ON requester.user_id=ur.requested_by_user_id
SET uaec.new_value_text = CASE uaec.field_key
  WHEN 'qc_decision' THEN CASE qrr.decision_code WHEN 'accepted' THEN 'Accepted' ELSE 'Rejected' END
  WHEN 'qc_reversion_requested_by' THEN COALESCE(NULLIF(TRIM(CONCAT_WS(' ', requester.first_name, requester.last_name)), ''), CONCAT('User #', ur.requested_by_user_id))
  WHEN 'qc_reversion_request_reason' THEN COALESCE(NULLIF(TRIM(ur.requester_note), ''), 'No reason recorded.')
  WHEN 'qc_reversion_reviewer_note' THEN ur.reviewer_note
  ELSE uaec.new_value_text
END
WHERE uae.event_type='unit_qc_reversion_request_rejected'
  AND uaec.field_key IN ('qc_decision', 'qc_reversion_requested_by', 'qc_reversion_request_reason', 'qc_reversion_reviewer_note');

COMMIT;
SQL

remaining="$(bash "$MYSQL_RUNNER" --batch --skip-column-names <<'SQL' | tr -d '[:space:]'
SELECT COUNT(*)
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
  );
SQL
)"

if [[ "$remaining" != "0" ]]; then
  printf 'Stage 10W70D2 repair verification failed: %s rejected QC reversion request(s) still lack Unit History audit events.\n' "$remaining" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W70D2 rejected QC reversion request history repair verified.'
