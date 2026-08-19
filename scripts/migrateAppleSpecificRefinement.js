'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS, SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

const SCREEN_SIZES = Object.freeze(['13.6-inch', '15.4-inch', '17-inch']);
const MAC_COLORS = Object.freeze([
  'Space Gray', 'Space Black', 'Midnight', 'Starlight', 'Sky Blue',
  'Green', 'Pink', 'Yellow', 'Orange', 'Purple'
]);

const PROCESSORS = Object.freeze([
  Object.freeze({
    brand: 'Apple', modelCode: 'Apple M2 Max', processorFamily: 'Apple Silicon', generation: 'M-Series', baseSpeedGhz: null,
    familyCode: 'apple-m2-family', familyName: 'Apple M2 Family', familyExportShortForm: 'M2', familyDescription: 'Apple M2, M2 Pro, M2 Max, and M2 Ultra processors.', familySortOrder: 302,
    models: Object.freeze(['MacBook Pro', 'Mac Studio'])
  }),
  Object.freeze({
    brand: 'Apple', modelCode: 'Apple M3 Max', processorFamily: 'Apple Silicon', generation: 'M-Series', baseSpeedGhz: null,
    familyCode: 'apple-m3-family', familyName: 'Apple M3 Family', familyExportShortForm: 'M3', familyDescription: 'Apple M3, M3 Pro, M3 Max, and M3 Ultra processors.', familySortOrder: 303,
    models: Object.freeze(['MacBook Pro'])
  }),
  Object.freeze({
    brand: 'Apple', modelCode: 'Apple M4 Max', processorFamily: 'Apple Silicon', generation: 'M-Series', baseSpeedGhz: null,
    familyCode: 'apple-m4-family', familyName: 'Apple M4 Family', familyExportShortForm: 'M4', familyDescription: 'Apple M4, M4 Pro, M4 Max, and M4 Ultra processors.', familySortOrder: 304,
    models: Object.freeze(['MacBook Pro', 'Mac Studio'])
  }),
  Object.freeze({
    brand: 'Intel', modelCode: 'i9-8950HK', processorFamily: 'Core', generation: '8th Gen', baseSpeedGhz: 2.90,
    familyCode: 'intel-i9-8th-gen', familyName: 'Intel i9-8th Gen', familyExportShortForm: 'i9-8th', familyDescription: 'Intel Core i9 8th generation processors.', familySortOrder: 39,
    models: Object.freeze(['MacBook Pro'])
  }),
  Object.freeze({
    brand: 'Intel', modelCode: 'i9-9880H', processorFamily: 'Core', generation: '9th Gen', baseSpeedGhz: 2.30,
    familyCode: 'intel-i9-9th-gen', familyName: 'Intel i9-9th Gen', familyExportShortForm: 'i9-9th', familyDescription: 'Intel Core i9 9th generation processors.', familySortOrder: 40,
    models: Object.freeze(['MacBook Pro'])
  }),
  Object.freeze({
    brand: 'Intel', modelCode: 'i9-9980HK', processorFamily: 'Core', generation: '9th Gen', baseSpeedGhz: 2.40,
    familyCode: 'intel-i9-9th-gen', familyName: 'Intel i9-9th Gen', familyExportShortForm: 'i9-9th', familyDescription: 'Intel Core i9 9th generation processors.', familySortOrder: 40,
    models: Object.freeze(['MacBook Pro'])
  }),
  Object.freeze({
    brand: 'Intel', modelCode: 'i9-9900K', processorFamily: 'Core', generation: '9th Gen', baseSpeedGhz: 3.60,
    familyCode: 'intel-i9-9th-gen', familyName: 'Intel i9-9th Gen', familyExportShortForm: 'i9-9th', familyDescription: 'Intel Core i9 9th generation processors.', familySortOrder: 40,
    models: Object.freeze(['iMac'])
  }),
  Object.freeze({
    brand: 'Intel', modelCode: 'i9-10910', processorFamily: 'Core', generation: '10th Gen', baseSpeedGhz: 3.60,
    familyCode: 'intel-i9-10th-gen', familyName: 'Intel i9-10th Gen', familyExportShortForm: 'i9-10th', familyDescription: 'Intel Core i9 10th generation processors.', familySortOrder: 41,
    models: Object.freeze(['iMac'])
  })
]);

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

function pickColumn(columns, candidates) {
  return candidates.find((candidate) => columns.has(candidate)) || null;
}

async function getSystemCategoryConfigId(connection, systemCategoryId) {
  const [rows] = await connection.query(
    'SELECT config_category_id FROM system_config_categories WHERE system_config_category_id = ? LIMIT 1',
    [systemCategoryId]
  );
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function getSystemValueConfigId(connection, systemValueId) {
  const [rows] = await connection.query(
    'SELECT config_value_id FROM system_config_values WHERE system_config_value_id = ? LIMIT 1',
    [systemValueId]
  );
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function findConfigValueByLabel(connection, configCategoryId, label) {
  const columns = await getColumnSet(connection, 'config_values');
  const labelColumn = pickColumn(columns, ['label', 'name', 'value']);
  if (!labelColumn) throw new Error('config_values has no usable display-value column.');
  const [rows] = await connection.query(
    `SELECT config_value_id FROM config_values
     WHERE config_category_id = ? AND LOWER(TRIM(${q(labelColumn)})) = LOWER(TRIM(?))
     ORDER BY config_value_id`,
    [configCategoryId, label]
  );
  if (rows.length > 1) throw new Error(`Multiple configuration values match ${label}.`);
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function ensureConfigValue(connection, configCategoryId, label) {
  const existingId = await findConfigValueByLabel(connection, configCategoryId, label);
  if (existingId) {
    const columns = await getColumnSet(connection, 'config_values');
    if (columns.has('is_active')) await connection.query('UPDATE config_values SET is_active = 1 WHERE config_value_id = ?', [existingId]);
    return existingId;
  }

  const columns = await getColumnSet(connection, 'config_values');
  const fields = ['config_category_id'];
  const values = [configCategoryId];
  for (const column of ['label', 'name']) {
    if (columns.has(column)) {
      fields.push(column);
      values.push(label);
    }
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push(label);
  }
  if (columns.has('sort_order')) {
    const [rows] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order FROM config_values WHERE config_category_id = ?', [configCategoryId]);
    fields.push('sort_order');
    values.push(Number(rows[0]?.next_sort_order || 10));
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (columns.has('is_protected')) {
    fields.push('is_protected');
    values.push(0);
  }
  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function findBrandId(connection, name) {
  const [rows] = await connection.query(
    'SELECT processor_brand_id FROM processor_brands WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY processor_brand_id',
    [name]
  );
  if (rows.length !== 1) throw new Error(`Expected exactly one ${name} processor brand; found ${rows.length}.`);
  return Number(rows[0].processor_brand_id);
}

async function findAppleModelId(connection, appleManufacturerId, modelName) {
  const [rows] = await connection.query(
    `SELECT unit_model_id FROM unit_models
     WHERE manufacturer_id = ? AND LOWER(TRIM(model_name)) = LOWER(TRIM(?)) AND is_active = 1
     ORDER BY unit_model_id`,
    [appleManufacturerId, modelName]
  );
  if (rows.length !== 1) throw new Error(`Expected one active Apple Unit Model named ${modelName}; found ${rows.length}.`);
  return Number(rows[0].unit_model_id);
}

async function findAppleManufacturerId(connection) {
  const [rows] = await connection.query(
    `SELECT manufacturer_id FROM manufacturers WHERE LOWER(TRIM(name)) = 'apple' ORDER BY manufacturer_id`
  );
  if (rows.length !== 1) throw new Error(`Expected exactly one Apple manufacturer; found ${rows.length}.`);
  return Number(rows[0].manufacturer_id);
}

async function findProcessorId(connection, processorBrandId, modelCode) {
  const [rows] = await connection.query(
    `SELECT processor_model_id FROM processor_models
     WHERE processor_brand_id = ? AND LOWER(TRIM(model_code)) = LOWER(TRIM(?))
     ORDER BY processor_model_id`,
    [processorBrandId, modelCode]
  );
  if (rows.length > 1) throw new Error(`Multiple processor rows match ${modelCode}.`);
  return rows[0] ? Number(rows[0].processor_model_id) : null;
}

async function ensureProcessor(connection, definition, processorBrandId) {
  let processorModelId = await findProcessorId(connection, processorBrandId, definition.modelCode);
  if (!processorModelId) {
    const [result] = await connection.query(
      `INSERT INTO processor_models (
         processor_brand_id, model_code, processor_family, generation, base_speed_ghz, is_active
       ) VALUES (?, ?, ?, ?, ?, 1)`,
      [processorBrandId, definition.modelCode, definition.processorFamily, definition.generation, definition.baseSpeedGhz]
    );
    processorModelId = Number(result.insertId);
  } else {
    await connection.query(
      `UPDATE processor_models
       SET processor_family = ?, generation = ?, base_speed_ghz = ?, is_active = 1
       WHERE processor_model_id = ?`,
      [definition.processorFamily, definition.generation, definition.baseSpeedGhz, processorModelId]
    );
  }
  return processorModelId;
}

async function ensureProcessorFamily(connection, definition, processorBrandId) {
  if (!await tableExists(connection, 'processor_families')) return null;
  const columns = await getColumnSet(connection, 'processor_families');
  const shortFormSupported = columns.has('export_short_form');
  const [rows] = await connection.query(
    'SELECT processor_family_id FROM processor_families WHERE code = ? ORDER BY processor_family_id',
    [definition.familyCode]
  );
  if (rows.length > 1) throw new Error(`Multiple Processor Families use code ${definition.familyCode}.`);
  if (rows[0]) {
    const updateFields = ['processor_brand_id = ?', 'name = ?', 'description = ?', 'sort_order = ?', 'is_active = 1'];
    const updateValues = [processorBrandId, definition.familyName, definition.familyDescription, definition.familySortOrder];
    if (shortFormSupported) {
      updateFields.splice(2, 0, 'export_short_form = ?');
      updateValues.splice(2, 0, definition.familyExportShortForm);
    }
    await connection.query(
      `UPDATE processor_families SET ${updateFields.join(', ')} WHERE processor_family_id = ?`,
      [...updateValues, Number(rows[0].processor_family_id)]
    );
    return Number(rows[0].processor_family_id);
  }

  const fields = ['processor_brand_id', 'code', 'name'];
  const values = [processorBrandId, definition.familyCode, definition.familyName];
  if (shortFormSupported) {
    fields.push('export_short_form');
    values.push(definition.familyExportShortForm);
  }
  fields.push('description', 'membership_version', 'sort_order', 'is_active');
  values.push(definition.familyDescription, 1, definition.familySortOrder, 1);

  const [result] = await connection.query(
    `INSERT INTO processor_families (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureFamilyMember(connection, processorFamilyId, processorModelId) {
  if (!processorFamilyId || !await tableExists(connection, 'processor_family_members')) return;
  await connection.query(
    `INSERT INTO processor_family_members (
       processor_family_id, processor_model_id, assignment_source, created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, 'seed', NULL, NULL)
     ON DUPLICATE KEY UPDATE assignment_source = assignment_source`,
    [processorFamilyId, processorModelId]
  );
}

async function ensureModelProcessorAssociation(connection, unitModelId, processorModelId) {
  await connection.query(
    `INSERT INTO unit_model_processor_options (unit_model_id, processor_model_id, is_active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [unitModelId, processorModelId]
  );
}

async function inspect(connection) {
  const requiredTables = [
    'config_values', 'system_config_categories', 'system_config_values', 'processor_brands', 'processor_models',
    'manufacturers', 'unit_models', 'unit_model_processor_options'
  ];
  for (const tableName of requiredTables) {
    if (!await tableExists(connection, tableName)) throw new Error(`Apple-specific refinement requires ${tableName}.`);
  }

  const screenSizeCategoryId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_SIZES);
  const colorCategoryId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.COLORS);
  const displayTypeCategoryId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.DISPLAY_TYPES);
  if (!screenSizeCategoryId || !colorCategoryId || !displayTypeCategoryId) {
    throw new Error('Screen Sizes, Colors, and Display Types configuration bindings must exist before this refinement.');
  }

  const appleManufacturerId = await findAppleManufacturerId(connection);
  const modelIds = new Map();
  for (const modelName of ['MacBook Pro', 'Mac Studio', 'iMac']) {
    modelIds.set(modelName, await findAppleModelId(connection, appleManufacturerId, modelName));
  }

  let screenSizePresent = 0;
  for (const label of SCREEN_SIZES) if (await findConfigValueByLabel(connection, screenSizeCategoryId, label)) screenSizePresent += 1;
  let colorPresent = 0;
  for (const label of MAC_COLORS) if (await findConfigValueByLabel(connection, colorCategoryId, label)) colorPresent += 1;

  const displayTypeBindings = {
    lcd: await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_LCD),
    oled: await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_OLED)
  };

  const brandIds = new Map();
  brandIds.set('Apple', await findBrandId(connection, 'Apple'));
  brandIds.set('Intel', await findBrandId(connection, 'Intel'));

  let processorPresent = 0;
  let associationPresent = 0;
  let expectedAssociations = 0;
  for (const definition of PROCESSORS) {
    const brandId = brandIds.get(definition.brand);
    const processorId = await findProcessorId(connection, brandId, definition.modelCode);
    if (processorId) processorPresent += 1;
    for (const modelName of definition.models) {
      expectedAssociations += 1;
      if (!processorId) continue;
      const [rows] = await connection.query(
        `SELECT 1 FROM unit_model_processor_options
         WHERE unit_model_id = ? AND processor_model_id = ? AND is_active = 1 LIMIT 1`,
        [modelIds.get(modelName), processorId]
      );
      if (rows.length > 0) associationPresent += 1;
    }
  }

  return {
    screenSizeCategoryId,
    colorCategoryId,
    displayTypeCategoryId,
    screenSizePresent,
    colorPresent,
    displayTypeBindings,
    processorPresent,
    associationPresent,
    expectedAssociations,
    appleManufacturerId,
    modelIds,
    brandIds
  };
}

function printState(state, mode) {
  console.log(`\nApple-specific refinement (${mode})`);
  console.log(`Requested Screen Sizes present: ${state.screenSizePresent}/${SCREEN_SIZES.length}`);
  console.log(`Common Mac colors present: ${state.colorPresent}/${MAC_COLORS.length}`);
  console.log(`LCD/OLED stable display bindings: ${state.displayTypeBindings.lcd && state.displayTypeBindings.oled ? 'present' : 'missing (will bind)'}`);
  console.log(`Requested Apple Max / Intel i9 processors present: ${state.processorPresent}/${PROCESSORS.length}`);
  console.log(`Requested Apple model/processor associations present: ${state.associationPresent}/${state.expectedAssociations}`);
}

async function applyRefinement(connection, state) {
  await connection.beginTransaction();
  try {
    for (const label of SCREEN_SIZES) await ensureConfigValue(connection, state.screenSizeCategoryId, label);
    for (const label of MAC_COLORS) await ensureConfigValue(connection, state.colorCategoryId, label);

    for (const [label, systemValueId] of [
      ['LCD', SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_LCD],
      ['OLED', SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_OLED]
    ]) {
      const configValueId = await ensureConfigValue(connection, state.displayTypeCategoryId, label);
      await connection.query(
        `INSERT INTO system_config_values (system_config_value_id, config_value_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
        [systemValueId, configValueId]
      );
    }

    for (const definition of PROCESSORS) {
      const processorBrandId = state.brandIds.get(definition.brand);
      const processorModelId = await ensureProcessor(connection, definition, processorBrandId);
      const processorFamilyId = await ensureProcessorFamily(connection, definition, processorBrandId);
      await ensureFamilyMember(connection, processorFamilyId, processorModelId);
      for (const modelName of definition.models) {
        await ensureModelProcessorAssociation(connection, state.modelIds.get(modelName), processorModelId);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await inspect(connection);
    printState(before, APPLY ? 'preflight' : 'dry-run');
    if (!APPLY) return;
    await applyRefinement(connection, before);
    const after = await inspect(connection);
    printState(after, 'applied');
    console.log('\nApple-specific refinement applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
