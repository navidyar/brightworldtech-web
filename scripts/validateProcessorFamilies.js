'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

async function main() {
  const [[schema]] = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'processor_families') AS family_table_count,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'processor_family_members') AS member_table_count,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lot_requirements' AND column_name = 'processor_family_id') AS requirement_column_count
    `
  );

  if (Number(schema.family_table_count) !== 1 || Number(schema.member_table_count) !== 1 || Number(schema.requirement_column_count) !== 1) {
    throw new Error('Processor Family schema is incomplete. Run the Stage 7E migration.');
  }

  const [[requirementType]] = await pool.query(
    `
      SELECT COUNT(*) AS type_count
      FROM system_config_values scv
      INNER JOIN config_values cv
        ON cv.config_value_id = scv.config_value_id
      WHERE scv.system_config_value_id = ${SYSTEM_CONFIG_VALUE_IDS.REQUIREMENT_PROCESSOR_FAMILY}
        AND cv.is_active = 1
    `
  );

  if (Number(requirementType.type_count) !== 1) {
    throw new Error('The active Processor Family Lot requirement type is missing.');
  }

  const [[crossBrand]] = await pool.query(
    `
      SELECT COUNT(*) AS invalid_count
      FROM processor_family_members pfm
      INNER JOIN processor_families pf
        ON pf.processor_family_id = pfm.processor_family_id
      INNER JOIN processor_models pm
        ON pm.processor_model_id = pfm.processor_model_id
      WHERE pf.processor_brand_id <> pm.processor_brand_id
    `
  );

  if (Number(crossBrand.invalid_count || 0) > 0) {
    throw new Error(`${crossBrand.invalid_count} Processor Family membership(s) cross processor brands.`);
  }

  const [[invalidRequirements]] = await pool.query(
    `
      SELECT COUNT(*) AS invalid_count
      FROM lot_requirements lr
      INNER JOIN system_config_values requirement_type_system
        ON requirement_type_system.config_value_id = lr.requirement_type_config_value_id
      LEFT JOIN processor_families pf
        ON pf.processor_family_id = lr.processor_family_id
      WHERE requirement_type_system.system_config_value_id = ${SYSTEM_CONFIG_VALUE_IDS.REQUIREMENT_PROCESSOR_FAMILY}
        AND pf.processor_family_id IS NULL
    `
  );

  if (Number(invalidRequirements.invalid_count || 0) > 0) {
    throw new Error(`${invalidRequirements.invalid_count} Processor Family Lot requirement(s) reference a missing family.`);
  }

  const [[counts]] = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM processor_families) AS family_count,
        (SELECT COUNT(*) FROM processor_families WHERE is_active = 1) AS active_family_count,
        (SELECT COUNT(*) FROM processor_family_members) AS membership_count,
        (
          SELECT COUNT(*)
          FROM processor_models pm
          LEFT JOIN processor_family_members pfm
            ON pfm.processor_model_id = pm.processor_model_id
          WHERE pm.is_active = 1
            AND pfm.processor_model_id IS NULL
        ) AS unmapped_processor_count,
        (SELECT COUNT(*) FROM lot_requirements WHERE processor_family_id IS NOT NULL) AS family_requirement_count
    `
  );

  console.log(
    `Processor Families valid: ${Number(counts.family_count || 0)} families, ${Number(counts.membership_count || 0)} memberships, ${Number(counts.family_requirement_count || 0)} Lot requirements, ${Number(counts.unmapped_processor_count || 0)} active processors need review.`
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
