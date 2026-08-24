#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_reversion_requests'
ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_reversion_requests'
  AND INDEX_NAME <> 'PRIMARY'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_reversion_requests'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME;

SELECT
  COUNT(*) AS qc_reversion_requests,
  COALESCE(SUM(ur.status = 'pending'), 0) AS pending_requests,
  COALESCE(SUM(ur.status = 'approved'), 0) AS approved_requests,
  COALESCE(SUM(ur.status = 'rejected'), 0) AS rejected_requests,
  COALESCE(SUM(ur.status = 'withdrawn'), 0) AS withdrawn_requests,
  COALESCE(SUM(ur.unit_request_id IS NULL OR qc.unit_qc_check_id IS NULL OR completion.unit_work_completion_id IS NULL OR u.unit_id IS NULL), 0) AS orphaned_linkage_rows,
  COALESCE(SUM(qrr.unit_id <> qc.unit_id OR qrr.unit_work_completion_id <> qc.unit_work_completion_id OR qrr.decision_code <> qc.decision_code OR qrr.qc_reviewed_by_user_id <> qc.reviewed_by_user_id OR qrr.qc_reviewed_at <> qc.reviewed_at OR NOT (qrr.qc_review_notes <=> qc.review_notes)), 0) AS snapshot_mismatch_rows
FROM unit_qc_reversion_requests qrr
LEFT JOIN unit_requests ur ON ur.unit_request_id = qrr.unit_request_id AND ur.request_type = 'qc_reversion'
LEFT JOIN unit_qc_checks qc ON qc.unit_qc_check_id = qrr.unit_qc_check_id
LEFT JOIN unit_work_completions completion ON completion.unit_work_completion_id = qrr.unit_work_completion_id
LEFT JOIN units u ON u.unit_id = qrr.unit_id;

SELECT COUNT(*) AS qc_reversion_base_requests_without_linkage
FROM unit_requests ur
LEFT JOIN unit_qc_reversion_requests qrr ON qrr.unit_request_id = ur.unit_request_id
WHERE ur.request_type = 'qc_reversion'
  AND qrr.unit_request_id IS NULL;
SQL
