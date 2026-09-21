'use strict';

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(row?.count || 0) > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(row?.count || 0) > 0;
}

async function readState(connection, hasColumn) {
  if (!hasColumn) {
    const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM label_templates');
    return {
      total: Number(row?.total || 0),
      lot: 0,
      standalone: 0,
      invalid: 0,
      standaloneLotAssignments: 0
    };
  }
  const [[counts]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(print_scope = 'lot') AS lot_count,
      SUM(print_scope = 'standalone') AS standalone_count,
      SUM(print_scope IS NULL OR print_scope NOT IN ('lot', 'standalone')) AS invalid_count
    FROM label_templates
  `);
  const [[assignments]] = await connection.query(`
    SELECT COUNT(*) AS count
    FROM lot_label_templates assignment
    INNER JOIN label_templates template ON template.label_template_id = assignment.label_template_id
    WHERE template.print_scope = 'standalone'
  `);
  return {
    total: Number(counts?.total || 0),
    lot: Number(counts?.lot_count || 0),
    standalone: Number(counts?.standalone_count || 0),
    invalid: Number(counts?.invalid_count || 0),
    standaloneLotAssignments: Number(assignments?.count || 0)
  };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const hasColumn = await columnExists(connection, 'label_templates', 'print_scope');
    const hasIndex = await indexExists(connection, 'label_templates', 'idx_label_templates_print_scope_status');
    const before = await readState(connection, hasColumn);

    console.log(`\nLabel Template Print Availability migration (${APPLY ? 'apply' : 'dry-run'})`);
    console.log(`print_scope column: ${hasColumn ? 'present' : 'missing'}`);
    console.log(`print-scope index: ${hasIndex ? 'present' : 'missing'}`);
    console.log(`Templates: ${before.total}`);
    if (hasColumn) {
      console.log(`Lot Selection: ${before.lot}`);
      console.log(`Standalone: ${before.standalone}`);
      console.log(`Invalid print_scope values: ${before.invalid}`);
      console.log(`Standalone templates assigned to Lots: ${before.standaloneLotAssignments}`);
    } else {
      console.log(`Existing templates to initialize as Lot Selection: ${before.total}`);
    }

    if (!APPLY) {
      console.log('\nNo changes were made. Existing templates will default to Lot Selection.');
      return;
    }

    if (!hasColumn) {
      await connection.query(
        "ALTER TABLE label_templates ADD COLUMN print_scope VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'lot' AFTER category_code"
      );
    } else {
      await connection.query("UPDATE label_templates SET print_scope = 'lot' WHERE print_scope IS NULL OR print_scope NOT IN ('lot', 'standalone')");
    }
    if (!hasIndex) {
      await connection.query('ALTER TABLE label_templates ADD KEY idx_label_templates_print_scope_status (print_scope, status, name)');
    }

    const after = await readState(connection, true);
    console.log('\nApplied successfully.');
    console.log(`Lot Selection: ${after.lot}`);
    console.log(`Standalone: ${after.standalone}`);
    console.log(`Invalid print_scope values: ${after.invalid}`);
    console.log(`Standalone templates assigned to Lots: ${after.standaloneLotAssignments}`);
  } finally {
    connection.release();
  }
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
