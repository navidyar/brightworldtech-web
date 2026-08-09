'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { buildProcessorMetadataPlan } = require('../services/processorMetadataBackfillPlanner');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');

async function assertSchema(connection) {
  const requiredColumns = [
    ['processor_brands', 'processor_brand_id'],
    ['processor_brands', 'name'],
    ['processor_brands', 'is_active'],
    ['processor_models', 'processor_model_id'],
    ['processor_models', 'processor_brand_id'],
    ['processor_models', 'model_code'],
    ['processor_models', 'processor_family'],
    ['processor_models', 'generation'],
    ['processor_models', 'base_speed_ghz'],
    ['processor_models', 'is_active'],
    ['processor_families', 'processor_family_id'],
    ['processor_families', 'processor_brand_id'],
    ['processor_families', 'code'],
    ['processor_families', 'name'],
    ['processor_families', 'description'],
    ['processor_families', 'membership_version'],
    ['processor_families', 'sort_order'],
    ['processor_families', 'is_active'],
    ['processor_family_members', 'processor_family_id'],
    ['processor_family_members', 'processor_model_id'],
    ['processor_family_members', 'assignment_source']
  ];
  const tables = [...new Set(requiredColumns.map(([tableName]) => tableName))];
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (?)`,
    [tables]
  );
  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = requiredColumns
    .map(([tableName, columnName]) => `${tableName}.${columnName}`)
    .filter((column) => !available.has(column));
  if (missing.length > 0) {
    throw new Error(`Processor metadata preflight failed. Missing: ${missing.join(', ')}`);
  }
}

async function loadState(connection) {
  const [brands, processors, families, memberships] = await Promise.all([
    connection.query(
      `SELECT processor_brand_id, name, is_active
         FROM processor_brands`
    ),
    connection.query(
      `SELECT
         pm.processor_model_id,
         pm.processor_brand_id,
         pb.name AS brand_name,
         pb.is_active AS brand_is_active,
         pm.model_code,
         pm.processor_family,
         pm.generation,
         pm.base_speed_ghz,
         pm.is_active
       FROM processor_models pm
       INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
       ORDER BY pb.name, pm.model_code`
    ),
    connection.query(
      `SELECT
         pf.processor_family_id,
         pf.processor_brand_id,
         pb.name AS brand_name,
         pf.code,
         pf.name,
         pf.is_active
       FROM processor_families pf
       INNER JOIN processor_brands pb ON pb.processor_brand_id = pf.processor_brand_id`
    ),
    connection.query(
      `SELECT processor_family_id, processor_model_id
         FROM processor_family_members`
    )
  ]);

  return {
    brands: brands[0],
    processors: processors[0],
    families: families[0],
    memberships: memberships[0]
  };
}

async function createFamilies(connection, definitions) {
  let inserted = 0;
  for (const definition of definitions) {
    const [result] = await connection.execute(
      `INSERT INTO processor_families (
         processor_brand_id,
         code,
         name,
         description,
         membership_version,
         sort_order,
         is_active
       ) VALUES (?, ?, ?, ?, 1, ?, 1)`,
      [
        definition.processorBrandId,
        definition.code,
        definition.name,
        definition.description,
        definition.sortOrder
      ]
    );
    inserted += Number(result.affectedRows || 0);
  }
  return inserted;
}

async function updateProcessorMetadata(connection, updates) {
  let updatedRows = 0;
  let familyValuesFilled = 0;
  let generationValuesFilled = 0;
  let speedValuesFilled = 0;

  for (const item of updates) {
    const assignments = [];
    const params = [];
    if (item.updates.processorFamily) {
      assignments.push(`processor_family = CASE
        WHEN processor_family IS NULL OR TRIM(processor_family) = '' THEN ?
        ELSE processor_family
      END`);
      params.push(item.updates.processorFamily);
      familyValuesFilled += 1;
    }
    if (item.updates.generation) {
      assignments.push(`generation = CASE
        WHEN generation IS NULL OR TRIM(generation) = '' THEN ?
        ELSE generation
      END`);
      params.push(item.updates.generation);
      generationValuesFilled += 1;
    }
    if (item.updates.baseSpeedGhz !== undefined) {
      assignments.push('base_speed_ghz = COALESCE(base_speed_ghz, ?)');
      params.push(item.updates.baseSpeedGhz);
      speedValuesFilled += 1;
    }
    if (assignments.length === 0) continue;

    params.push(item.processorModelId);
    const [result] = await connection.execute(
      `UPDATE processor_models
          SET ${assignments.join(', ')}
        WHERE processor_model_id = ?
          AND is_active = 1
        LIMIT 1`,
      params
    );
    updatedRows += Number(result.affectedRows || 0);
  }

  return {
    updatedRows,
    familyValuesFilled,
    generationValuesFilled,
    speedValuesFilled
  };
}

async function createMemberships(connection, assignments) {
  const familyCodes = [...new Set(assignments.map((assignment) => assignment.familyCode))];
  if (familyCodes.length === 0) return { insertedMemberships: 0, touchedFamilies: 0 };

  const placeholders = familyCodes.map(() => '?').join(', ');
  const [familyRows] = await connection.query(
    `SELECT processor_family_id, code
       FROM processor_families
      WHERE code IN (${placeholders})
        AND is_active = 1`,
    familyCodes
  );
  const familyIdByCode = new Map(familyRows.map((family) => [family.code, Number(family.processor_family_id)]));
  const touchedFamilyIds = new Set();
  let insertedMemberships = 0;

  for (const assignment of assignments) {
    const processorFamilyId = familyIdByCode.get(assignment.familyCode);
    if (!processorFamilyId) continue;
    const [result] = await connection.execute(
      `INSERT IGNORE INTO processor_family_members (
         processor_family_id,
         processor_model_id,
         assignment_source
       ) VALUES (?, ?, 'automatic')`,
      [processorFamilyId, assignment.processorModelId]
    );
    if (Number(result.affectedRows || 0) > 0) {
      insertedMemberships += 1;
      touchedFamilyIds.add(processorFamilyId);
    }
  }

  for (const processorFamilyId of touchedFamilyIds) {
    await connection.execute(
      `UPDATE processor_families
          SET membership_version = membership_version + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE processor_family_id = ?
        LIMIT 1`,
      [processorFamilyId]
    );
  }

  return {
    insertedMemberships,
    touchedFamilies: touchedFamilyIds.size
  };
}

async function applyPlan(connection, plan) {
  const insertedFamilies = await createFamilies(connection, plan.familiesToCreate);
  const metadata = await updateProcessorMetadata(connection, plan.metadataUpdates);
  const memberships = await createMemberships(connection, plan.membershipsToCreate);
  return {
    insertedFamilies,
    ...metadata,
    ...memberships
  };
}

function formatResult({ state, plan, applied }) {
  const fieldCounts = plan.metadataUpdates.reduce((counts, item) => {
    if (item.updates.processorFamily) counts.processorFamily += 1;
    if (item.updates.generation) counts.generation += 1;
    if (item.updates.baseSpeedGhz !== undefined) counts.baseSpeedGhz += 1;
    return counts;
  }, { processorFamily: 0, generation: 0, baseSpeedGhz: 0 });

  return {
    mode: APPLY ? 'apply' : 'dry-run',
    processorsScanned: state.processors.length,
    recognizedCatalogProcessors: plan.recognizedProcessors.length,
    processorRowsNeedingMetadata: plan.metadataUpdates.length,
    metadataFieldsPlanned: fieldCounts,
    processorFamiliesPlanned: plan.familiesToCreate.length,
    familyMembershipsPlanned: plan.membershipsToCreate.length,
    insertedFamilies: applied?.insertedFamilies || 0,
    updatedProcessorRows: applied?.updatedRows || 0,
    familyValuesFilled: applied?.familyValuesFilled || 0,
    generationValuesFilled: applied?.generationValuesFilled || 0,
    speedValuesFilled: applied?.speedValuesFilled || 0,
    insertedMemberships: applied?.insertedMemberships || 0,
    touchedFamilies: applied?.touchedFamilies || 0,
    unresolvedPublishedBaseSpeeds: plan.unresolvedSpeeds,
    blockedInactiveFamilies: plan.blockedInactiveFamilies,
    blockedFamilyConflicts: plan.blockedFamilyConflicts,
    unresolvedFamilyDefinitions: plan.unresolvedFamilyDefinitions,
    metadataUpdates: plan.metadataUpdates,
    familiesToCreate: plan.familiesToCreate,
    membershipsToCreate: plan.membershipsToCreate
  };
}

function printHuman(result) {
  console.log(`Processor catalog metadata ${result.mode === 'apply' ? 'apply' : 'dry run'} complete.`);
  console.log(`Processor rows scanned: ${result.processorsScanned}`);
  console.log(`Recognized Stage 10W.7 catalog processors: ${result.recognizedCatalogProcessors}`);
  console.log(`Processor rows needing metadata: ${result.processorRowsNeedingMetadata}`);
  console.log(`Legacy family values planned: ${result.metadataFieldsPlanned.processorFamily}`);
  console.log(`Generation values planned: ${result.metadataFieldsPlanned.generation}`);
  console.log(`Base GHz values planned: ${result.metadataFieldsPlanned.baseSpeedGhz}`);
  console.log(`Processor Family definitions planned: ${result.processorFamiliesPlanned}`);
  console.log(`Processor Family memberships planned: ${result.familyMembershipsPlanned}`);

  if (result.mode === 'apply') {
    console.log(`Processor Family definitions inserted: ${result.insertedFamilies}`);
    console.log(`Processor rows updated: ${result.updatedProcessorRows}`);
    console.log(`Processor Family memberships inserted: ${result.insertedMemberships}`);
  } else {
    console.log('No database changes were made. Re-run with --apply after reviewing this report.');
  }

  if (result.metadataUpdates.length > 0) {
    console.log('\nMetadata updates:');
    result.metadataUpdates.forEach((item) => {
      const values = [];
      if (item.updates.processorFamily) values.push(`family=${item.updates.processorFamily}`);
      if (item.updates.generation) values.push(`generation=${item.updates.generation}`);
      if (item.updates.baseSpeedGhz !== undefined) values.push(`base=${Number(item.updates.baseSpeedGhz).toFixed(2)}GHz`);
      console.log(`- ${item.brandName} ${item.modelCode}: ${values.join(', ')}`);
    });
  }

  if (result.familiesToCreate.length > 0) {
    console.log('\nProcessor Family definitions to create:');
    result.familiesToCreate.forEach((family) => console.log(`- ${family.name} (${family.code})`));
  }

  if (result.unresolvedPublishedBaseSpeeds.length > 0) {
    console.log('\nBase clock intentionally left blank because a verified base frequency was not published:');
    result.unresolvedPublishedBaseSpeeds.forEach((item) => console.log(`- ${item.brandName} ${item.modelCode}`));
  }

  if (result.blockedInactiveFamilies.length || result.blockedFamilyConflicts.length || result.unresolvedFamilyDefinitions.length) {
    console.log('\nProcessor Family items requiring manual review:');
    console.log(`- Inactive families preserved: ${result.blockedInactiveFamilies.length}`);
    console.log(`- Family conflicts preserved: ${result.blockedFamilyConflicts.length}`);
    console.log(`- Missing standard family definitions: ${result.unresolvedFamilyDefinitions.length}`);
  }
}

async function main() {
  const connection = await pool.getConnection();
  let applied = null;
  try {
    await assertSchema(connection);
    const state = await loadState(connection);
    const plan = buildProcessorMetadataPlan(state);

    if (APPLY) {
      await connection.beginTransaction();
      try {
        applied = await applyPlan(connection, plan);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const result = formatResult({ state, plan, applied });
    if (JSON_OUTPUT) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  applyPlan,
  formatResult,
  loadState
};
