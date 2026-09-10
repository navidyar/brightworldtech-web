'use strict';

require('dotenv').config();

const { pool } = require('../models/db');

const APPLY = process.argv.includes('--apply');
const GRAPHICS_BASE_COLUMNS = [
  'unit_graphics_adapter_id', 'unit_id', 'gpu_type_config_value_id', 'gpu_model', 'vram_mb'
];
const GRAPHICS_ADDITIVE_COLUMNS = Object.freeze({
  gpu_vendor: 'VARCHAR(120) NULL',
  gpu_role_code: "VARCHAR(24) NOT NULL DEFAULT 'unknown'",
  vram_source: 'VARCHAR(120) NULL',
  sort_order: 'INT UNSIGNED NOT NULL DEFAULT 1'
});
const SPEC_ADDITIVE_COLUMNS = Object.freeze({
  touchscreen_hardware_state_code: "VARCHAR(24) NOT NULL DEFAULT 'unknown'"
});

async function loadColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type, IS_NULLABLE AS is_nullable
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Map(rows.map((row) => [String(row.column_name || row.COLUMN_NAME || ''), row]));
}

async function assertSchema(connection) {
  const graphics = await loadColumns(connection, 'unit_graphics_adapters');
  const missingGraphics = GRAPHICS_BASE_COLUMNS.filter((column) => !graphics.has(column));
  if (missingGraphics.length) throw new Error(`unit_graphics_adapters is missing required columns: ${missingGraphics.join(', ')}.`);

  const units = await loadColumns(connection, 'units');
  if (!units.has('screen_size_config_value_id')) throw new Error('units.screen_size_config_value_id is required for Stage 10W79G.');

  const specs = await loadColumns(connection, 'unit_specifications');
  if (!specs.has('native_screen_resolution_config_value_id')) {
    throw new Error('unit_specifications.native_screen_resolution_config_value_id is required for Stage 10W79G.');
  }
  return { graphics, specs };
}

async function main() {
  const connection = await pool.getConnection();
  try {
    let { graphics, specs } = await assertSchema(connection);
    const missingGraphics = Object.keys(GRAPHICS_ADDITIVE_COLUMNS).filter((column) => !graphics.has(column));
    const missingSpecs = Object.keys(SPEC_ADDITIVE_COLUMNS).filter((column) => !specs.has(column));
    const gpuType = graphics.get('gpu_type_config_value_id');
    const gpuTypeNeedsNullable = String(gpuType?.is_nullable || gpuType?.IS_NULLABLE || '').toUpperCase() !== 'YES';
    const [[graphicsCount]] = await connection.query('SELECT COUNT(*) AS row_count FROM unit_graphics_adapters');

    console.log('\nStage 10W79G API Graphics & Display preflight');
    console.log(`Existing graphics adapter rows: ${Number(graphicsCount?.row_count || 0)}`);
    console.log(`Graphics tool columns present: ${Object.keys(GRAPHICS_ADDITIVE_COLUMNS).length - missingGraphics.length}/${Object.keys(GRAPHICS_ADDITIVE_COLUMNS).length}`);
    console.log(`Touchscreen hardware-state column: ${missingSpecs.length ? 'not installed' : 'present'}`);
    console.log(`GPU type allows Unknown/null role: ${gpuTypeNeedsNullable ? 'no (migration will relax nullability)' : 'yes'}`);

    if (!APPLY) {
      if (missingGraphics.length || missingSpecs.length || gpuTypeNeedsNullable) {
        console.log('\nPending schema operations:');
        for (const column of missingGraphics) console.log(`- add unit_graphics_adapters.${column}`);
        for (const column of missingSpecs) console.log(`- add unit_specifications.${column}`);
        if (gpuTypeNeedsNullable) console.log('- allow unit_graphics_adapters.gpu_type_config_value_id to be NULL when a tool cannot determine Integrated/Dedicated');
      } else {
        console.log('\nNo schema operations are pending.');
      }
      console.log('No database changes were made.');
      return;
    }

    for (const column of missingGraphics) {
      await connection.query(`ALTER TABLE unit_graphics_adapters ADD COLUMN ${column} ${GRAPHICS_ADDITIVE_COLUMNS[column]}`);
    }
    for (const column of missingSpecs) {
      await connection.query(`ALTER TABLE unit_specifications ADD COLUMN ${column} ${SPEC_ADDITIVE_COLUMNS[column]}`);
    }
    if (gpuTypeNeedsNullable) {
      const columnType = String(gpuType.column_type || gpuType.COLUMN_TYPE || '').trim();
      if (!columnType) throw new Error('Could not determine gpu_type_config_value_id column type safely.');
      await connection.query(`ALTER TABLE unit_graphics_adapters MODIFY COLUMN gpu_type_config_value_id ${columnType} NULL`);
    }

    ({ graphics, specs } = await assertSchema(connection));
    const missingAfter = [
      ...Object.keys(GRAPHICS_ADDITIVE_COLUMNS).filter((column) => !graphics.has(column)),
      ...Object.keys(SPEC_ADDITIVE_COLUMNS).filter((column) => !specs.has(column))
    ];
    if (missingAfter.length) throw new Error(`Stage 10W79G verification failed: ${missingAfter.join(', ')}.`);
    if (String(graphics.get('gpu_type_config_value_id')?.is_nullable || '').toUpperCase() !== 'YES') {
      throw new Error('Stage 10W79G verification failed: gpu_type_config_value_id is still NOT NULL.');
    }
    console.log('\nStage 10W79G Graphics & Display schema applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message || error);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
