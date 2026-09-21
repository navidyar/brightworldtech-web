#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/mysql-app.sh <<'SQL'
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('virtual_huddle_messages','virtual_huddle_targets','virtual_huddle_recipients')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('virtual_huddle_messages','virtual_huddle_targets','virtual_huddle_recipients')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('virtual_huddle_messages','virtual_huddle_targets','virtual_huddle_recipients')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT
  (SELECT COUNT(*) FROM virtual_huddle_messages) AS messages,
  (SELECT COUNT(*) FROM virtual_huddle_targets) AS targets,
  (SELECT COUNT(*) FROM virtual_huddle_recipients) AS recipients,
  (SELECT COUNT(*) FROM virtual_huddle_messages WHERE message_type_code NOT IN ('notice','standard','priority','urgent')) AS invalid_message_types,
  (SELECT COUNT(*) FROM virtual_huddle_recipients WHERE acknowledgment_mode_code NOT IN ('informational','optional_ack','required_ack')) AS invalid_ack_modes,
  (SELECT COUNT(*) FROM virtual_huddle_recipients WHERE recipient_state_code NOT IN ('available','awaiting_confirmation','acknowledged','revoked')) AS invalid_recipient_states;
SQL
