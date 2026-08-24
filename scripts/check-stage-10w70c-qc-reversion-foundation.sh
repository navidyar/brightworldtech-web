#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
  AND COLUMN_NAME IN ('reverted_at','reverted_by_user_id','reversion_reason')
ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
  AND INDEX_NAME = 'idx_unit_qc_checks_reverted_at';

SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_qc_checks'
  AND CONSTRAINT_NAME = 'fk_unit_qc_checks_reverted_by';

SELECT
  COUNT(*) AS qc_review_rows,
  SUM(reverted_at IS NOT NULL) AS reverted_qc_decisions,
  SUM(reverted_at IS NOT NULL AND (reverted_by_user_id IS NULL OR reversion_reason IS NULL OR TRIM(reversion_reason) = '')) AS incomplete_reversion_audit_rows
FROM unit_qc_checks;
SQL
