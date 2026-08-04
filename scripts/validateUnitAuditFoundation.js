'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function getColumns(tableName) {
  const [rows] = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
    `,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

async function main() {
  const eventColumns = await getColumns('unit_audit_events');
  const changeColumns = await getColumns('unit_audit_event_changes');
  const requiredEventColumns = [
    'unit_audit_event_id', 'unit_id', 'actor_user_id', 'event_type',
    'event_source', 'event_summary', 'correlation_key', 'event_metadata_json', 'occurred_at'
  ];
  const requiredChangeColumns = [
    'unit_audit_event_change_id', 'unit_audit_event_id', 'field_key', 'field_label',
    'change_type', 'old_value_text', 'new_value_text', 'old_value_json', 'new_value_json', 'sort_order'
  ];
  const missing = [
    ...requiredEventColumns.filter((column) => !eventColumns.has(column)).map((column) => `unit_audit_events.${column}`),
    ...requiredChangeColumns.filter((column) => !changeColumns.has(column)).map((column) => `unit_audit_event_changes.${column}`)
  ];

  if (missing.length > 0) {
    throw new Error(`Unit audit foundation is missing: ${missing.join(', ')}`);
  }

  const [[eventCountRow], [changeCountRow]] = await Promise.all([
    pool.query('SELECT COUNT(*) AS count FROM unit_audit_events').then(([rows]) => rows),
    pool.query('SELECT COUNT(*) AS count FROM unit_audit_event_changes').then(([rows]) => rows)
  ]);

  console.log(
    `Unit audit foundation valid: ${Number(eventCountRow.count || 0)} events, ${Number(changeCountRow.count || 0)} changes.`
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
