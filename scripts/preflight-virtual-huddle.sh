#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MYSQL_RUNNER="${MYSQL_RUNNER:-scripts/mysql-app.sh}"
MYSQL=(bash "$MYSQL_RUNNER" --batch --skip-column-names)

scalar_query() {
  "${MYSQL[@]}" | tr -d '[:space:]'
}

base_readiness="$(scalar_query <<'SQL'
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'), ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='user_id' AND DATA_TYPE='int'), ':',
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='roles'), ':',
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='roles' AND COLUMN_NAME='code')
);
SQL
)"

if [[ "$base_readiness" != "1:1:1:1" ]]; then
  printf 'Virtual Huddle read-only preflight failed (received %s; expected 1:1:1:1 for users/user_id/roles/roles.code).\n' "$base_readiness" >&2
  exit 1
fi

validate_existing_table() {
  local table_name="$1"
  local expected_columns="$2"
  local expected_indexes="$3"
  local expected_fks="$4"

  local present
  present="$(scalar_query <<SQL
SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table_name}';
SQL
)"

  if [[ "$present" == "0" ]]; then
    printf 'Existing %s table: no.\n' "$table_name"
    return
  fi

  local signature
  signature="$(scalar_query <<SQL
SELECT CONCAT(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table_name}'), ':',
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table_name}'), ':',
  (SELECT COUNT(DISTINCT CONSTRAINT_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='${table_name}' AND REFERENCED_TABLE_NAME IS NOT NULL)
);
SQL
)"

  local expected_signature="${expected_columns}:${expected_indexes}:${expected_fks}"
  if [[ "$signature" != "$expected_signature" ]]; then
    printf 'Virtual Huddle found an incompatible existing %s table (signature %s; expected %s). No changes were made.\n' "$table_name" "$signature" "$expected_signature" >&2
    exit 1
  fi

  printf 'Existing %s table: yes; signature %s.\n' "$table_name" "$signature"
}

validate_existing_table virtual_huddle_messages 11 5 3
validate_existing_table virtual_huddle_targets 7 4 2
validate_existing_table virtual_huddle_recipients 15 5 3

if [[ "$(scalar_query <<'SQL'
SELECT COUNT(*)
FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME IN ('virtual_huddle_messages','virtual_huddle_targets','virtual_huddle_recipients');
SQL
)" != "0" ]]; then
  integrity="$(scalar_query <<'SQL'
SELECT CONCAT(
  COALESCE((SELECT SUM(message_type_code NOT IN ('notice','standard','priority','urgent')) FROM virtual_huddle_messages), 0), ':',
  COALESCE((SELECT SUM(acknowledgment_mode_code NOT IN ('informational','optional_ack','required_ack')) FROM virtual_huddle_recipients), 0), ':',
  COALESCE((SELECT SUM(recipient_state_code NOT IN ('available','awaiting_confirmation','acknowledged','revoked')) FROM virtual_huddle_recipients), 0)
);
SQL
  )" 2>/dev/null || true

  if [[ -n "$integrity" && "$integrity" != "0:0:0" ]]; then
    printf 'Virtual Huddle existing Huddle data failed code integrity checks (message-type:ack-mode:recipient-state = %s). No changes were made.\n' "$integrity" >&2
    exit 1
  fi
fi

printf 'Virtual Huddle read-only preflight passed. No database changes were made.\n'
