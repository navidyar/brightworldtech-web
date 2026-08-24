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
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_outcomes'
     AND COLUMN_NAME = 'unit_outcome_id'
     AND DATA_TYPE IN ('tinyint','smallint','mediumint','int','bigint'))
);
SQL
)"

if [[ "$readiness" != "1:1:1" ]]; then
  printf 'Stage 10W70A read-only preflight failed (received %s; expected 1:1:1).\n' "$readiness" >&2
  exit 1
fi

existing_column_count="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unit_override_requests'
  AND COLUMN_NAME = 'unit_outcome_id';
SQL
)"

if [[ "$existing_column_count" == "1" ]]; then
  type_match="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.COLUMNS child
JOIN information_schema.COLUMNS parent
  ON parent.TABLE_SCHEMA = child.TABLE_SCHEMA
 AND parent.TABLE_NAME = 'unit_outcomes'
 AND parent.COLUMN_NAME = 'unit_outcome_id'
WHERE child.TABLE_SCHEMA = DATABASE()
  AND child.TABLE_NAME = 'unit_override_requests'
  AND child.COLUMN_NAME = 'unit_outcome_id'
  AND LOWER(child.COLUMN_TYPE) = LOWER(parent.COLUMN_TYPE);
SQL
)"
  if [[ "$type_match" != "1" ]]; then
    printf '%s\n' 'Stage 10W70A found an existing incompatible unit_override_requests.unit_outcome_id column.' >&2
    exit 1
  fi
elif [[ "$existing_column_count" != "0" ]]; then
  printf 'Stage 10W70A could not determine existing linkage-column state (received %s).\n' "$existing_column_count" >&2
  exit 1
fi

bash "$MYSQL_RUNNER" <<'SQL'
SELECT
  COUNT(*) AS pending_confirmation_requests,
  SUM(exact_match_count = 1) AS safely_backfillable,
  SUM(exact_match_count = 0) AS no_exact_current_match,
  SUM(exact_match_count > 1) AS ambiguous_current_matches
FROM (
  SELECT
    request.unit_override_request_id,
    COUNT(outcome.unit_outcome_id) AS exact_match_count
  FROM unit_override_requests request
  LEFT JOIN unit_outcomes outcome
    ON outcome.unit_id = request.unit_id
   AND outcome.is_current = 1
   AND outcome.approval_status_code = 'pending'
   AND outcome.approval_requested_by_user_id = request.requested_by_user_id
  WHERE request.request_type = 'outcome_confirmation'
    AND LOWER(request.request_status) = 'pending'
  GROUP BY request.unit_override_request_id
) pending;

SELECT
  request.unit_override_request_id,
  request.unit_id,
  request.requested_by_user_id,
  request.created_at,
  COUNT(outcome.unit_outcome_id) AS exact_match_count
FROM unit_override_requests request
LEFT JOIN unit_outcomes outcome
  ON outcome.unit_id = request.unit_id
 AND outcome.is_current = 1
 AND outcome.approval_status_code = 'pending'
 AND outcome.approval_requested_by_user_id = request.requested_by_user_id
WHERE request.request_type = 'outcome_confirmation'
  AND LOWER(request.request_status) = 'pending'
GROUP BY
  request.unit_override_request_id,
  request.unit_id,
  request.requested_by_user_id,
  request.created_at
HAVING COUNT(outcome.unit_outcome_id) <> 1
ORDER BY request.unit_override_request_id;
SQL

printf '%s\n' 'Stage 10W70A read-only preflight completed. No database changes were made.'
