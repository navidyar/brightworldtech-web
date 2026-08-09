'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { normalizeText } = require('../services/modelProcessorCoverage');
const { buildPlan } = require('../services/modelProcessorCoveragePlanner');
const processorFamilyModel = require('../models/processorFamilyModel');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function pairKey(unitModelId, processorModelId) {
  return `${Number(unitModelId)}:${Number(processorModelId)}`;
}

function processorKey(brandName, modelCode) {
  return `${normalizeKey(brandName)}:${normalizeKey(modelCode)}`;
}

async function assertSchema(connection) {
  const requiredColumns = [
    ['unit_models', 'unit_model_id'],
    ['unit_models', 'manufacturer_id'],
    ['unit_models', 'unit_category_config_value_id'],
    ['unit_models', 'model_name'],
    ['unit_models', 'is_active'],
    ['manufacturers', 'manufacturer_id'],
    ['manufacturers', 'name'],
    ['config_values', 'config_value_id'],
    ['config_values', 'code'],
    ['processor_brands', 'processor_brand_id'],
    ['processor_brands', 'code'],
    ['processor_brands', 'name'],
    ['processor_brands', 'is_active'],
    ['processor_models', 'processor_model_id'],
    ['processor_models', 'processor_brand_id'],
    ['processor_models', 'model_code'],
    ['processor_models', 'processor_family'],
    ['processor_models', 'generation'],
    ['processor_models', 'base_speed_ghz'],
    ['processor_models', 'is_active'],
    ['unit_model_processor_options', 'unit_model_id'],
    ['unit_model_processor_options', 'processor_model_id'],
    ['unit_model_processor_options', 'is_active'],
    ['units', 'unit_id'],
    ['units', 'unit_model_id'],
    ['units', 'processor_model_id']
  ];

  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (?)`,
    [[...new Set(requiredColumns.map(([tableName]) => tableName))]]
  );

  const available = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = requiredColumns
    .map(([tableName, columnName]) => `${tableName}.${columnName}`)
    .filter((column) => !available.has(column));

  if (missing.length > 0) {
    throw new Error(`Processor coverage preflight failed. Missing: ${missing.join(', ')}`);
  }
}

async function loadState(connection) {
  const [models, brands, processors, mappings, historicalPairs] = await Promise.all([
    connection.query(
      `SELECT
         um.unit_model_id,
         um.model_name,
         m.name AS manufacturer_name,
         LOWER(COALESCE(cv.code, '')) AS category_code,
         COUNT(DISTINCT u.unit_id) AS unit_count
       FROM unit_models um
       INNER JOIN manufacturers m ON m.manufacturer_id = um.manufacturer_id
       LEFT JOIN config_values cv ON cv.config_value_id = um.unit_category_config_value_id
       LEFT JOIN units u ON u.unit_model_id = um.unit_model_id
       WHERE um.is_active = 1
       GROUP BY um.unit_model_id, um.model_name, m.name, cv.code
       ORDER BY m.name, category_code, um.model_name`
    ),
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
         pm.is_active
       FROM processor_models pm
       INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id`
    ),
    connection.query(
      `SELECT unit_model_id, processor_model_id, is_active
         FROM unit_model_processor_options`
    ),
    connection.query(
      `SELECT DISTINCT u.unit_model_id, u.processor_model_id
         FROM units u
         INNER JOIN processor_models pm ON pm.processor_model_id = u.processor_model_id
         INNER JOIN processor_brands pb ON pb.processor_brand_id = pm.processor_brand_id
        WHERE u.unit_model_id IS NOT NULL
          AND u.processor_model_id IS NOT NULL
          AND pm.is_active = 1
          AND pb.is_active = 1`
    )
  ]);

  return {
    models: models[0],
    brands: brands[0],
    processors: processors[0],
    mappings: mappings[0],
    historicalPairs: historicalPairs[0]
  };
}


async function ensureBrand(connection, brandName) {
  const [rows] = await connection.query(
    `SELECT processor_brand_id, is_active
       FROM processor_brands
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      LIMIT 1`,
    [brandName]
  );
  if (rows[0]) {
    if (Number(rows[0].is_active) !== 1) {
      throw new Error(`Processor brand ${brandName} is inactive; refusing to reactivate it automatically.`);
    }
    return Number(rows[0].processor_brand_id);
  }

  const code = normalizeKey(brandName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [result] = await connection.execute(
    `INSERT INTO processor_brands (code, name, is_active)
     VALUES (?, ?, 1)`,
    [code, brandName]
  );
  return Number(result.insertId);
}

async function ensureProcessor(connection, definition, brandCache, processorCache) {
  const key = processorKey(definition.brandName, definition.modelCode);
  if (processorCache.has(key)) return processorCache.get(key);

  let brandId = brandCache.get(normalizeKey(definition.brandName));
  if (!brandId) {
    brandId = await ensureBrand(connection, definition.brandName);
    brandCache.set(normalizeKey(definition.brandName), brandId);
  }

  const [rows] = await connection.query(
    `SELECT processor_model_id, is_active
       FROM processor_models
      WHERE processor_brand_id = ?
        AND LOWER(TRIM(model_code)) = LOWER(TRIM(?))
      LIMIT 1`,
    [brandId, definition.modelCode]
  );
  if (rows[0]) {
    if (Number(rows[0].is_active) !== 1) {
      throw new Error(`Processor ${definition.brandName} ${definition.modelCode} is inactive; refusing to reactivate it automatically.`);
    }
    const id = Number(rows[0].processor_model_id);
    processorCache.set(key, id);
    return id;
  }

  const [result] = await connection.execute(
    `INSERT INTO processor_models (
       processor_brand_id,
       model_code,
       processor_family,
       generation,
       base_speed_ghz,
       is_active
     ) VALUES (?, ?, ?, ?, ?, 1)`,
    [
      brandId,
      definition.modelCode,
      definition.processorFamily,
      definition.generation,
      definition.baseSpeedGhz
    ]
  );
  const id = Number(result.insertId);
  processorCache.set(key, id);
  return id;
}

async function applyPlan(connection, state, plan) {
  const brandCache = new Map(
    state.brands
      .filter((brand) => Number(brand.is_active) === 1)
      .map((brand) => [normalizeKey(brand.name), Number(brand.processor_brand_id)])
  );
  const processorCache = new Map(
    state.processors
      .filter((processor) => Number(processor.is_active) === 1 && Number(processor.brand_is_active) === 1)
      .map((processor) => [processorKey(processor.brand_name, processor.model_code), Number(processor.processor_model_id)])
  );

  let insertedProcessors = 0;
  let assignedProcessorFamilies = 0;
  for (const definition of plan.processorsToCreate) {
    const key = processorKey(definition.brandName, definition.modelCode);
    const existedBefore = processorCache.has(key);
    const processorModelId = await ensureProcessor(connection, definition, brandCache, processorCache);
    if (!existedBefore) insertedProcessors += 1;

    const assignedFamilies = await processorFamilyModel.autoAssignProcessorFamilyMembershipWithConnection(connection, {
      processorModelId,
      processorBrandName: definition.brandName,
      modelCode: definition.modelCode
    });
    assignedProcessorFamilies += assignedFamilies.length;
  }

  let insertedMappings = 0;
  for (const mapping of plan.mappingsToCreate) {
    const processorModelId = mapping.processorModelId || processorCache.get(processorKey(mapping.brandName, mapping.modelCode));
    if (!processorModelId) {
      throw new Error(`Could not resolve processor ${mapping.brandName} ${mapping.modelCode}.`);
    }

    const [existingRows] = await connection.query(
      `SELECT is_active
         FROM unit_model_processor_options
        WHERE unit_model_id = ?
          AND processor_model_id = ?
        LIMIT 1`,
      [mapping.unitModelId, processorModelId]
    );
    if (existingRows[0]) continue;

    const [result] = await connection.execute(
      `INSERT INTO unit_model_processor_options (
         unit_model_id,
         processor_model_id,
         is_active
       ) VALUES (?, ?, 1)`,
      [mapping.unitModelId, processorModelId]
    );
    insertedMappings += Number(result.affectedRows || 0);
  }

  return {
    insertedProcessors,
    insertedMappings,
    assignedProcessorFamilies
  };
}

async function loadRemaining(connection) {
  const [rows] = await connection.query(
    `SELECT
       um.unit_model_id,
       m.name AS manufacturer_name,
       COALESCE(cv.code, '') AS category_code,
       um.model_name,
       COUNT(DISTINCT u.unit_id) AS unit_count
     FROM unit_models um
     INNER JOIN manufacturers m ON m.manufacturer_id = um.manufacturer_id
     LEFT JOIN config_values cv ON cv.config_value_id = um.unit_category_config_value_id
     LEFT JOIN units u ON u.unit_model_id = um.unit_model_id
     LEFT JOIN unit_model_processor_options umpo
       ON umpo.unit_model_id = um.unit_model_id
      AND umpo.is_active = 1
     LEFT JOIN processor_models pm
       ON pm.processor_model_id = umpo.processor_model_id
      AND pm.is_active = 1
     LEFT JOIN processor_brands pb
       ON pb.processor_brand_id = pm.processor_brand_id
      AND pb.is_active = 1
     WHERE um.is_active = 1
     GROUP BY um.unit_model_id, m.name, cv.code, um.model_name
     HAVING COUNT(DISTINCT CASE WHEN pb.processor_brand_id IS NOT NULL THEN pm.processor_model_id END) = 0
     ORDER BY unit_count DESC, m.name, um.model_name`
  );
  return rows.map((row) => ({
    unitModelId: Number(row.unit_model_id),
    manufacturerName: row.manufacturer_name,
    categoryCode: row.category_code,
    modelName: row.model_name,
    unitCount: Number(row.unit_count || 0)
  }));
}

function formatResult({ state, plan, applied, remaining }) {
  const usedRemaining = remaining.filter((model) => model.unitCount > 0);
  const modelsWithNoOptionsBefore = plan.modelOutcomes.filter((model) => model.activeOptionsBefore === 0).length;
  const historicalMappings = plan.mappingsToCreate.filter((mapping) => mapping.source === 'historical').length;
  const curatedMappings = plan.mappingsToCreate.filter((mapping) => mapping.source === 'curated').length;
  const plannedModels = plan.modelOutcomes
    .filter((model) => model.historicalPlanned > 0 || model.curatedPlanned > 0)
    .map((model) => ({
      unitModelId: model.unitModelId,
      manufacturerName: model.manufacturerName,
      categoryCode: model.categoryCode,
      modelName: model.modelName,
      unitCount: model.unitCount,
      historicalMappings: model.historicalPlanned,
      curatedMappings: model.curatedPlanned,
      curatedProcessors: model.curatedCodes
    }));

  return {
    mode: APPLY ? 'apply' : 'dry-run',
    modelsScanned: state.models.length,
    modelsWithNoOptionsBefore,
    historicalMappingsPlanned: historicalMappings,
    curatedMappingsPlanned: curatedMappings,
    processorModelsPlanned: plan.processorsToCreate.length,
    insertedProcessors: applied?.insertedProcessors || 0,
    insertedMappings: applied?.insertedMappings || 0,
    assignedProcessorFamilies: applied?.assignedProcessorFamilies || 0,
    blockedInactiveProcessors: plan.blockedInactiveProcessors.length,
    blockedInactiveMappings: plan.blockedInactiveMappings.length,
    remainingModelsWithoutOptions: remaining.length,
    remainingUsedModelsWithoutOptions: usedRemaining.length,
    plannedModels,
    remaining,
    blockedDetails: {
      processors: plan.blockedInactiveProcessors,
      mappings: plan.blockedInactiveMappings
    }
  };
}

function printHuman(result) {
  console.log(`Model/processor coverage ${result.mode === 'apply' ? 'apply' : 'dry run'} complete.`);
  console.log(`Active models scanned: ${result.modelsScanned}`);
  console.log(`Models with no active processor options before planning: ${result.modelsWithNoOptionsBefore}`);
  console.log(`Historical mappings planned: ${result.historicalMappingsPlanned}`);
  console.log(`Curated mappings planned: ${result.curatedMappingsPlanned}`);
  console.log(`New processor models planned: ${result.processorModelsPlanned}`);
  if (result.mode === 'apply') {
    console.log(`Processor models inserted: ${result.insertedProcessors}`);
    console.log(`Compatibility mappings inserted: ${result.insertedMappings}`);
    console.log(`Recognized Processor Family memberships assigned: ${result.assignedProcessorFamilies}`);
  } else {
    console.log('No database changes were made. Re-run with --apply after reviewing this report.');
  }
  console.log(`Remaining active models without options: ${result.remainingModelsWithoutOptions}`);
  console.log(`Remaining used models without options: ${result.remainingUsedModelsWithoutOptions}`);

  if (result.plannedModels.length > 0) {
    console.log('\nPlanned model coverage:');
    result.plannedModels.slice(0, 100).forEach((model) => {
      const sources = [];
      if (model.historicalMappings > 0) sources.push(`${model.historicalMappings} observed from existing Units`);
      if (model.curatedMappings > 0) sources.push(`${model.curatedMappings} curated common options`);
      const curated = model.curatedProcessors.length > 0
        ? `: ${model.curatedProcessors.join(', ')}`
        : '';
      console.log(`- ${model.manufacturerName} ${model.modelName} [${model.categoryCode || 'uncategorized'}] (${sources.join('; ')})${curated}`);
    });
    if (result.plannedModels.length > 100) {
      console.log(`- ... ${result.plannedModels.length - 100} additional model(s); use --json for the complete report`);
    }
  }

  if (result.remaining.length > 0) {
    console.log('\nRemaining models:');
    result.remaining.slice(0, 100).forEach((model) => {
      console.log(`- ${model.manufacturerName} ${model.modelName} [${model.categoryCode || 'uncategorized'}] (${model.unitCount} unit(s))`);
    });
    if (result.remaining.length > 100) {
      console.log(`- ... ${result.remaining.length - 100} additional model(s)`);
    }
  }

  if (result.blockedInactiveProcessors || result.blockedInactiveMappings) {
    console.log('\nInactive catalog choices were preserved and not reactivated automatically.');
    console.log(`Blocked inactive processors/brands: ${result.blockedInactiveProcessors}`);
    console.log(`Blocked inactive compatibility mappings: ${result.blockedInactiveMappings}`);
  }
}

async function main() {
  const connection = await pool.getConnection();
  let applied = null;
  try {
    await assertSchema(connection);
    const state = await loadState(connection);
    const plan = buildPlan(state);

    if (APPLY) {
      await connection.beginTransaction();
      try {
        applied = await applyPlan(connection, state, plan);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const remaining = APPLY
      ? await loadRemaining(connection)
      : plan.modelOutcomes
        .filter((model) => model.projectedOptionCount === 0)
        .map((model) => ({
          unitModelId: model.unitModelId,
          manufacturerName: model.manufacturerName,
          categoryCode: model.categoryCode,
          modelName: model.modelName,
          unitCount: model.unitCount
        }));
    const result = formatResult({ state, plan, applied, remaining });
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

module.exports = { formatResult };
