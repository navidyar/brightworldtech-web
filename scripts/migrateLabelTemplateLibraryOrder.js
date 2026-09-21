'use strict';

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');

async function columnExists(connection, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'label_templates' AND COLUMN_NAME = ?`,
    [columnName]
  );
  return Number(row?.count || 0) > 0;
}

async function indexExists(connection, indexName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'label_templates' AND INDEX_NAME = ?`,
    [indexName]
  );
  return Number(row?.count || 0) > 0;
}

async function currentTemplateIds(connection, hasColumn) {
  if (hasColumn) {
    const [rows] = await connection.query(
      'SELECT label_template_id FROM label_templates ORDER BY library_sort_order, label_template_id'
    );
    return rows.map((row) => Number(row.label_template_id));
  }

  const [rows] = await connection.query(`
    WITH RECURSIVE lot_ancestry AS (
      SELECT lot.lot_id AS target_lot_id, lot.lot_id AS ancestor_lot_id, lot.parent_lot_id, 0 AS depth
      FROM lots lot
      UNION ALL
      SELECT ancestry.target_lot_id, parent.lot_id, parent.parent_lot_id, ancestry.depth + 1
      FROM lot_ancestry ancestry
      INNER JOIN lots parent ON parent.lot_id = ancestry.parent_lot_id
      WHERE ancestry.depth < 100
    ),
    configured_sources AS (
      SELECT
        ancestry.target_lot_id,
        ancestry.ancestor_lot_id,
        ROW_NUMBER() OVER (PARTITION BY ancestry.target_lot_id ORDER BY ancestry.depth) AS source_rank
      FROM lot_ancestry ancestry
      INNER JOIN lot_label_template_sets setrow ON setrow.lot_id = ancestry.ancestor_lot_id
    ),
    effective_sources AS (
      SELECT target_lot_id, ancestor_lot_id
      FROM configured_sources
      WHERE source_rank = 1
    )
    SELECT template.label_template_id
    FROM label_templates template
    LEFT JOIN (
      SELECT assignment.label_template_id, COUNT(*) AS attached_lot_count
      FROM effective_sources source
      INNER JOIN lot_label_templates assignment
        ON assignment.lot_id = source.ancestor_lot_id
       AND assignment.is_active = 1
      GROUP BY assignment.label_template_id
    ) lot_usage ON lot_usage.label_template_id = template.label_template_id
    ORDER BY
      CASE WHEN template.new_until IS NOT NULL AND template.new_until > CURRENT_TIMESTAMP(6) THEN 0 ELSE 1 END,
      COALESCE(lot_usage.attached_lot_count, 0) DESC,
      template.print_count DESC,
      template.last_used_at DESC,
      template.name ASC,
      template.label_template_id ASC
  `);
  return rows.map((row) => Number(row.label_template_id));
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const hasColumn = await columnExists(connection, 'library_sort_order');
    const hasIndex = await indexExists(connection, 'idx_label_templates_library_order');
    const ids = await currentTemplateIds(connection, hasColumn);
    console.log(`\nLabel Template Library Order migration (${APPLY ? 'apply' : 'dry-run'})`);
    console.log(`library_sort_order column: ${hasColumn ? 'present' : 'missing'}`);
    console.log(`library-order index: ${hasIndex ? 'present' : 'missing'}`);
    console.log(`Templates to order: ${ids.length}`);
    if (!APPLY) {
      console.log('\nNo changes were made. Existing visible Library order will be preserved as the initial draggable order.');
      return;
    }

    if (!hasColumn) {
      await connection.query('ALTER TABLE label_templates ADD COLUMN library_sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER print_count');
    }
    for (let index = 0; index < ids.length; index += 1) {
      await connection.query('UPDATE label_templates SET library_sort_order = ? WHERE label_template_id = ?', [(index + 1) * 10, ids[index]]);
    }
    if (!hasIndex) {
      await connection.query('ALTER TABLE label_templates ADD KEY idx_label_templates_library_order (library_sort_order, label_template_id)');
    }
    console.log('\nApplied successfully.');
  } finally {
    connection.release();
  }
}

main().finally(() => pool.end()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
