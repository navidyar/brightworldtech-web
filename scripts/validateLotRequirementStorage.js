'use strict';

const { pool } = require('../models/db');
const lotModel = require('../models/lotModel');
const { validateLotRequirementRegistry } = require('../config/lotRequirementRegistry');

const REQUIRED_COLUMNS = [
  'lot_requirement_id',
  'lot_id',
  'requirement_type_config_value_id',
  'requirement_config_value_id',
  'manufacturer_id',
  'unit_model_id',
  'processor_model_id',
  'comparison_operator_config_value_id',
  'requirement_text',
  'requirement_number',
  'is_required',
  'notes'
];

async function main() {
  const registryErrors = validateLotRequirementRegistry();

  if (registryErrors.length > 0) {
    throw new Error(`Lot requirement registry invalid:\n- ${registryErrors.join('\n- ')}`);
  }

  const [columnRows] = await pool.query(`
    SELECT COLUMN_NAME AS column_name
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lot_requirements'
  `);
  const columnSet = new Set(columnRows.map((row) => row.column_name));
  const missingColumns = REQUIRED_COLUMNS.filter((columnName) => !columnSet.has(columnName));

  if (missingColumns.length > 0) {
    throw new Error(`lot_requirements is missing required columns: ${missingColumns.join(', ')}`);
  }

  const lots = await lotModel.listLots({ includeHidden: true });
  let requirementCount = 0;
  let incompleteCount = 0;

  for (const lot of lots) {
    const requirements = await lotModel.listLotRequirements(lot.lot_id);
    requirementCount += requirements.length;
    incompleteCount += requirements.filter((requirement) => (
      !requirement.requirement_key ||
      !requirement.operator_code ||
      !requirement.required_value_token
    )).length;
  }

  console.log(
    `Lot requirement storage valid: ${lots.length} lots, ${requirementCount} stored requirements, ${incompleteCount} incomplete legacy requirements.`
  );

  if (incompleteCount > 0) {
    console.log('Incomplete legacy requirements remain editable and should be corrected through the Requirements modal.');
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
