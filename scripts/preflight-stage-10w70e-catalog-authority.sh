#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

readiness="$(${MYSQL[@]} <<'SQL' | tr -d '[:space:]'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_model_catalog_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_processor_catalog_requests'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users')
);
SQL
)"

if [[ "$readiness" != "1:1:1:1" ]]; then
  printf 'Stage 10W70E read-only preflight failed (received %s; expected 1:1:1:1). No changes were made.\n' "$readiness" >&2
  exit 1
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  COALESCE(SUM(request_type='model_catalog_addition' AND status='pending'), 0) AS pending_model_requests,
  COALESCE(SUM(request_type='processor_catalog_addition' AND status='pending'), 0) AS pending_processor_requests,
  COALESCE(SUM(request_type IN ('model_catalog_addition','processor_catalog_addition') AND status='pending'), 0) AS pending_catalog_requests
FROM unit_requests;

SELECT
  ur.unit_request_id,
  ur.request_type,
  ur.status,
  ur.requested_by_user_id,
  CONCAT_WS(' ', u.first_name, u.last_name) AS requested_by,
  ur.submitted_at
FROM unit_requests ur
LEFT JOIN users u ON u.user_id=ur.requested_by_user_id
WHERE ur.request_type IN ('model_catalog_addition','processor_catalog_addition')
  AND ur.status='pending'
ORDER BY ur.unit_request_id;
SQL

printf 'Stage 10W70E read-only preflight passed. No database changes were made.\n'
