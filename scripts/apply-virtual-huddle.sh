#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

printf '%s\n' 'Applying Virtual Huddle schema migration...'
bash scripts/preflight-virtual-huddle.sh

"${MYSQL[@]}" < sql/2026-09-virtual-huddle.sql

signature="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_messages'), ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_messages'), ':',
  (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_messages' AND REFERENCED_TABLE_NAME IS NOT NULL), ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_targets'), ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_targets'), ':',
  (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_targets' AND REFERENCED_TABLE_NAME IS NOT NULL), ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_recipients'), ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_recipients'), ':',
  (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='virtual_huddle_recipients' AND REFERENCED_TABLE_NAME IS NOT NULL)
);
SQL
)"

if [[ "$signature" != "11:5:3:7:4:2:15:5:3" ]]; then
  printf 'Virtual Huddle migration verification failed (received %s; expected 11:5:3:7:4:2:15:5:3).\n' "$signature" >&2
  exit 1
fi

bash scripts/preflight-virtual-huddle.sh
printf '%s\n' 'Virtual Huddle schema migration verified.'
