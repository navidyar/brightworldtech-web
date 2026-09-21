'use strict';

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const [rows] = await pool.query(`
    SELECT
      COUNT(DISTINCT CASE WHEN g.is_active = 1 THEN g.label_printer_group_id END) AS active_groups,
      COUNT(CASE WHEN g.is_active = 1 AND m.is_active = 1 AND p.is_enabled = 1 THEN 1 END) AS active_members,
      COUNT(CASE WHEN g.is_active = 1 AND m.is_active = 1 AND p.is_enabled = 1 AND p.last_probe_status = 'reachable' THEN 1 END) AS last_reachable,
      COUNT(CASE WHEN g.is_active = 1 AND m.is_active = 1 AND p.is_enabled = 1 AND p.last_probe_status = 'offline' THEN 1 END) AS last_offline,
      COUNT(CASE WHEN g.is_active = 1 AND m.is_active = 1 AND p.is_enabled = 1 AND (p.last_probe_status IS NULL OR p.last_probe_status NOT IN ('reachable','offline')) THEN 1 END) AS last_unknown
    FROM label_printer_groups g
    LEFT JOIN label_printer_group_members m ON m.group_id = g.label_printer_group_id
    LEFT JOIN label_printers p ON p.label_printer_id = m.printer_id
  `);
  const row = rows[0] || {};
  console.log('\nStage 10W96 Label Fast Group Discovery C7B audit (read-only)');
  console.log(`Active printer groups: ${Number(row.active_groups || 0)}`);
  console.log(`Active enabled group members: ${Number(row.active_members || 0)}`);
  console.log(`Last probe reachable: ${Number(row.last_reachable || 0)}`);
  console.log(`Last probe offline: ${Number(row.last_offline || 0)}`);
  console.log(`Last probe unknown: ${Number(row.last_unknown || 0)}`);
  console.log('Routing behavior: 500 ms fast responsive pass; 3500 ms tolerant retry only when the fast pass finds nobody.');
  console.log('CUPS routing metadata is collected with one shared printer/job snapshot instead of one queue command per member.');
  console.log('No database, filesystem, CUPS, or printer changes were made.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
