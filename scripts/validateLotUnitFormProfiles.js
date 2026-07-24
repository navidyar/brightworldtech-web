'use strict';

const { pool } = require('../models/db');
const {
  getEffectiveUnitFormProfileForLot,
  listAllLotIds
} = require('../models/lotUnitFormProfileModel');

const EXPECTED_COLUMNS = new Set([
  'lot_unit_form_field_rule_id',
  'lot_id',
  'field_key',
  'visibility_mode',
  'requirement_mode',
  'created_by_user_id',
  'updated_by_user_id',
  'created_at',
  'updated_at'
]);

async function assertSchema() {
  const [tableRows] = await pool.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lot_unit_form_field_rules'
    `
  );

  if (Number(tableRows[0]?.table_count || 0) !== 1) {
    throw new Error('lot_unit_form_field_rules is missing. Apply the Stage 2 SQL migration first.');
  }

  const [columnRows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lot_unit_form_field_rules'
    `
  );
  const presentColumns = new Set(columnRows.map((row) => row.column_name));
  const missingColumns = [...EXPECTED_COLUMNS].filter((columnName) => !presentColumns.has(columnName));

  if (missingColumns.length > 0) {
    throw new Error(`lot_unit_form_field_rules is missing columns: ${missingColumns.join(', ')}`);
  }
}

async function run() {
  await assertSchema();

  const [ruleCountRows] = await pool.query(
    'SELECT COUNT(*) AS rule_count FROM lot_unit_form_field_rules'
  );
  const ruleCount = Number(ruleCountRows[0]?.rule_count || 0);
  const lotIds = await listAllLotIds();
  let fieldCount = 0;

  for (const lotId of lotIds) {
    const profile = await getEffectiveUnitFormProfileForLot(lotId);

    if (fieldCount === 0) {
      fieldCount = profile.fields.length;
    } else if (profile.fields.length !== fieldCount) {
      throw new Error(`Lot ${lotId} resolved a different field count.`);
    }
  }

  console.log(
    `Lot unit form profiles valid: ${lotIds.length} lots, ${ruleCount} stored rules, ${fieldCount} fields per profile.`
  );
}

run()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
