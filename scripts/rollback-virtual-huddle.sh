#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

row_counts="$(scalar_query <<'SQL'
SELECT CONCAT(
  IF(EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_messages'), (SELECT COUNT(*) FROM virtual_huddle_messages), 0), ':',
  IF(EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_targets'), (SELECT COUNT(*) FROM virtual_huddle_targets), 0), ':',
  IF(EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_recipients'), (SELECT COUNT(*) FROM virtual_huddle_recipients), 0)
);
SQL
)"

if [[ "$row_counts" != "0:0:0" ]]; then
  printf 'Virtual Huddle rollback refused: Virtual Huddle data exists (messages:targets:recipients = %s). Preserve the additive schema and revert application code only.\n' "$row_counts" >&2
  exit 1
fi

"${MYSQL[@]}" < sql/2026-09-virtual-huddle-rollback.sql
printf '%s\n' 'Virtual Huddle schema rollback completed; no Huddle data existed.'
