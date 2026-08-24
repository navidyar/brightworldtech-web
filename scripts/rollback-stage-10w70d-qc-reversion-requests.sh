#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

request_rows="$(scalar_query <<'SQL'
SELECT IF(
  EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='unit_qc_reversion_requests'),
  (SELECT COUNT(*) FROM unit_qc_reversion_requests),
  0
);
SQL
)"

base_rows="$(scalar_query <<'SQL'
SELECT COUNT(*) FROM unit_requests WHERE request_type='qc_reversion';
SQL
)"

if [[ "$request_rows" != "0" || "$base_rows" != "0" ]]; then
  printf 'Stage 10W70D rollback refused: found %s QC reversion linkage row(s) and %s QC reversion base request row(s). Preserve the additive table and revert application code only.\n' "$request_rows" "$base_rows" >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-08-stage-10w70d-qc-reversion-requests-rollback.sql
printf 'Stage 10W70D schema rollback completed. No QC reversion request audit data existed.\n'
