'use strict';

const { pool } = require('../models/db');
const {
  buildRequirementPolicyOptions,
  normalizePolicyCode,
  validateRequirementPolicyRegistry
} = require('../config/lotRequirementPolicyRegistry');

async function main() {
  const registryErrors = validateRequirementPolicyRegistry();

  if (registryErrors.length > 0) {
    throw new Error(`Lot requirement policy registry invalid:\n- ${registryErrors.join('\n- ')}`);
  }

  const [columnRows] = await pool.query(`
    SELECT COLUMN_NAME AS column_name
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'lots'
      AND COLUMN_NAME = 'requirement_policy_config_value_id'
  `);

  if (columnRows.length !== 1) {
    throw new Error('lots.requirement_policy_config_value_id is required for explicit enforcement policy selection.');
  }

  const [policyRows] = await pool.query(`
    SELECT
      cv.config_value_id,
      cv.code,
      cv.label,
      cv.sort_order,
      cv.is_active
    FROM config_values cv
    JOIN config_categories cc
      ON cc.config_category_id = cv.config_category_id
    WHERE cc.code IN (
      'requirement_policies',
      'requirement_policy',
      'lot_requirement_policies',
      'lot_requirement_policy'
    )
    ORDER BY FIELD(
      cc.code,
      'requirement_policies',
      'requirement_policy',
      'lot_requirement_policies',
      'lot_requirement_policy'
    ), cv.sort_order, cv.config_value_id
  `);
  const options = buildRequirementPolicyOptions(policyRows);

  if (options.length !== 3) {
    throw new Error(
      `Requirement policy configuration is incomplete. Expected active Strict, Warn Only, and Open / Mixed values; found ${options.length}.`
    );
  }

  const [lotRows] = await pool.query(`
    SELECT
      l.lot_id,
      COALESCE(l.name, CONCAT('Lot ', l.lot_id)) AS lot_name,
      policy.code AS requirement_policy_code
    FROM lots l
    LEFT JOIN config_values policy
      ON policy.config_value_id = l.requirement_policy_config_value_id
    ORDER BY l.lot_id
  `);
  const invalidLots = lotRows.filter((lot) => !normalizePolicyCode(lot.requirement_policy_code));

  if (invalidLots.length > 0) {
    throw new Error(
      `Lots with missing or unsupported requirement policies: ${invalidLots.map((lot) => `${lot.lot_name} (#${lot.lot_id})`).join(', ')}`
    );
  }

  const counts = { strict: 0, warn_only: 0, open_mixed: 0 };
  lotRows.forEach((lot) => {
    counts[normalizePolicyCode(lot.requirement_policy_code)] += 1;
  });

  console.log(
    `Lot enforcement policies valid: 3 choices; ${counts.strict} Strict, ${counts.warn_only} Warn Only, ${counts.open_mixed} Open / Mixed lots.`
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
