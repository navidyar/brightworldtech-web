#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_override_requests'
  AND COLUMN_NAME = 'unit_outcome_id';

SELECT INDEX_NAME, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_override_requests'
  AND INDEX_NAME = 'idx_unit_override_requests_outcome';

SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_override_requests'
  AND CONSTRAINT_NAME = 'fk_unit_override_requests_outcome';

SELECT
  COUNT(*) AS pending_outcome_confirmation_requests,
  SUM(unit_outcome_id IS NOT NULL) AS pending_linked_requests,
  SUM(unit_outcome_id IS NULL) AS pending_legacy_unlinked_requests
FROM unit_override_requests
WHERE request_type = 'outcome_confirmation'
  AND LOWER(request_status) = 'pending';
SQL
