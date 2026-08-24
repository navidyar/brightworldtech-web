#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Stage 10W70A Pass/Fail request linkage migration...'

bash scripts/preflight-stage-10w70a-pass-fail-request-linkage.sh

preflight="$(scalar_query <<'SQL'
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

if [[ "$preflight" != "1:1:1" ]]; then
  printf 'Stage 10W70A preflight failed (received %s; expected 1:1:1).\n' "$preflight" >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10w70a-pass-fail-request-linkage.sql

readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS child
   JOIN information_schema.COLUMNS parent
     ON parent.TABLE_SCHEMA = child.TABLE_SCHEMA
    AND parent.TABLE_NAME = 'unit_outcomes'
    AND parent.COLUMN_NAME = 'unit_outcome_id'
   WHERE child.TABLE_SCHEMA = DATABASE()
     AND child.TABLE_NAME = 'unit_override_requests'
     AND child.COLUMN_NAME = 'unit_outcome_id'
     AND LOWER(child.COLUMN_TYPE) = LOWER(parent.COLUMN_TYPE)),
  ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_override_requests'
     AND INDEX_NAME = 'idx_unit_override_requests_outcome'),
  ':',
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_override_requests'
     AND CONSTRAINT_NAME = 'fk_unit_override_requests_outcome')
);
SQL
)"

if [[ "$readiness" != "1:1:1" ]]; then
  printf 'Stage 10W70A readiness failed (received %s; expected 1:1:1).\n' "$readiness" >&2
  exit 1
fi

pending_unlinked="$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM unit_override_requests
WHERE request_type = 'outcome_confirmation'
  AND LOWER(request_status) = 'pending'
  AND unit_outcome_id IS NULL;
SQL
)"

printf 'Stage 10W70A migration verified. Pending legacy Pass/Fail requests without exact linkage: %s\n' "$pending_unlinked"
