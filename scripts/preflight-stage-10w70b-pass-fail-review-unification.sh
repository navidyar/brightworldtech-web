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
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_override_requests'),
  ':',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_outcomes'),
  ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_override_requests'
     AND COLUMN_NAME = 'unit_outcome_id')
);
SQL
)"

if [[ "$readiness" != "1:1:1" ]]; then
  printf 'Stage 10W70B read-only preflight failed (received %s; expected 1:1:1).\n' "$readiness" >&2
  exit 1
fi

invalid_pending_targets="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM unit_override_requests request
LEFT JOIN unit_outcomes outcome
  ON outcome.unit_outcome_id = request.unit_outcome_id
 AND outcome.unit_id = request.unit_id
 AND outcome.is_current = 1
 AND outcome.approval_status_code = 'pending'
 AND outcome.approval_requested_by_user_id = request.requested_by_user_id
WHERE request.request_type = 'outcome_confirmation'
  AND LOWER(request.request_status) = 'pending'
  AND outcome.unit_outcome_id IS NULL;
SQL
)"

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  COUNT(*) AS pending_confirmation_requests,
  COALESCE(SUM(request.unit_outcome_id IS NOT NULL), 0) AS pending_linked_requests,
  COALESCE(SUM(
    outcome.unit_outcome_id IS NOT NULL
    AND outcome.unit_id = request.unit_id
    AND outcome.is_current = 1
    AND outcome.approval_status_code = 'pending'
    AND outcome.approval_requested_by_user_id = request.requested_by_user_id
  ), 0) AS exact_reviewable_targets
FROM unit_override_requests request
LEFT JOIN unit_outcomes outcome
  ON outcome.unit_outcome_id = request.unit_outcome_id
WHERE request.request_type = 'outcome_confirmation'
  AND LOWER(request.request_status) = 'pending';

SELECT
  request.unit_override_request_id,
  request.unit_id,
  request.unit_outcome_id,
  request.requested_by_user_id,
  request.request_status,
  outcome.unit_id AS target_unit_id,
  outcome.outcome_code AS target_outcome_code,
  outcome.is_current AS target_is_current,
  outcome.approval_status_code AS target_approval_status,
  outcome.approval_requested_by_user_id AS target_requested_by_user_id
FROM unit_override_requests request
LEFT JOIN unit_outcomes outcome
  ON outcome.unit_outcome_id = request.unit_outcome_id
WHERE request.request_type = 'outcome_confirmation'
  AND LOWER(request.request_status) = 'pending'
ORDER BY request.unit_override_request_id;
SQL

if [[ "$invalid_pending_targets" != "0" ]]; then
  printf 'Stage 10W70B preflight blocked deployment: invalid_pending_targets=%s. No database changes were made.\n' "$invalid_pending_targets" >&2
  exit 1
fi

printf '%s\n' 'Stage 10W70B read-only preflight passed. No database changes were made.'
