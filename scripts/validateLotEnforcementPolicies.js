'use strict';

const { pool } = require('../models/db');
const {
  buildRequirementPolicyOptions,
  validateRequirementPolicyRegistry
} = require('../config/lotRequirementPolicyRegistry');
const { POLICY_KEY_BY_SYSTEM_VALUE_ID, SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

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
      scv.system_config_value_id,
      cv.label,
      cv.sort_order,
      cv.is_active
    FROM system_config_categories scc
    INNER JOIN config_values cv
      ON cv.config_category_id = scc.config_category_id
    LEFT JOIN system_config_values scv
      ON scv.config_value_id = cv.config_value_id
    WHERE scc.system_config_category_id = ${SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES}
    ORDER BY cv.sort_order, cv.config_value_id
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
      policy_system.system_config_value_id AS requirement_policy_system_config_value_id
    FROM lots l
    LEFT JOIN system_config_values policy_system
      ON policy_system.config_value_id = l.requirement_policy_config_value_id
    ORDER BY l.lot_id
  `);
  const normalizedLots = lotRows.map((lot) => ({
    ...lot,
    requirementPolicyCode: POLICY_KEY_BY_SYSTEM_VALUE_ID[Number(lot.requirement_policy_system_config_value_id)] || ''
  }));
  const invalidLots = normalizedLots.filter((lot) => !lot.requirementPolicyCode);

  if (invalidLots.length > 0) {
    throw new Error(
      `Lots with missing or unsupported requirement policies: ${invalidLots.map((lot) => `${lot.lot_name} (#${lot.lot_id})`).join(', ')}`
    );
  }

  const counts = { strict: 0, warn_only: 0, open_mixed: 0 };
  normalizedLots.forEach((lot) => {
    counts[lot.requirementPolicyCode] += 1;
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
