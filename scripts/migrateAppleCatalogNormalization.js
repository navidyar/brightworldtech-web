'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  APPLE_MODEL_FAMILIES,
  DEFAULT_SCREEN_SIZE_LABELS,
  parseDetailedAppleModel
} = require('../services/appleCatalogNormalization');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');
const SCREEN_SIZE_SYSTEM_CATEGORY_ID = SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_SIZES;

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnSet(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

function pickColumn(columns, candidates) {
  return candidates.find((columnName) => columns.has(columnName)) || null;
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

async function findManufacturerId(connection, name) {
  const columns = await getColumnSet(connection, 'manufacturers');
  const labelColumn = pickColumn(columns, ['name', 'manufacturer_name', 'label']);
  if (!labelColumn) throw new Error('manufacturers has no usable name column.');
  const [rows] = await connection.query(
    `SELECT manufacturer_id FROM manufacturers WHERE LOWER(TRIM(${quoteIdentifier(labelColumn)})) = LOWER(TRIM(?))`,
    [name]
  );
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${name} manufacturer row; found ${rows.length}.`);
  }
  return Number(rows[0].manufacturer_id);
}

async function findConfigCategoryByLabel(connection, label) {
  const columns = await getColumnSet(connection, 'config_categories');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  if (!labelColumn) return null;
  const [rows] = await connection.query(
    `SELECT config_category_id FROM config_categories WHERE LOWER(TRIM(${quoteIdentifier(labelColumn)})) = LOWER(TRIM(?))`,
    [label]
  );
  if (rows.length > 1) throw new Error(`Multiple configuration categories are labeled ${label}.`);
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function insertConfigCategory(connection, label) {
  const columns = await getColumnSet(connection, 'config_categories');
  const fields = [];
  const values = [];
  for (const columnName of ['label', 'name']) {
    if (columns.has(columnName)) {
      fields.push(columnName);
      values.push(label);
    }
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push('Configurable physical display sizes used by Unit specifications.');
  }
  if (columns.has('sort_order')) {
    const [rows] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order FROM config_categories');
    fields.push('sort_order');
    values.push(Number(rows[0]?.next_sort_order || 10));
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  if (fields.length === 0) throw new Error('config_categories has no writable label column.');
  const [result] = await connection.query(
    `INSERT INTO config_categories (${fields.map(quoteIdentifier).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureScreenSizeCategory(connection) {
  const boundId = await getSystemCategoryConfigId(connection, SCREEN_SIZE_SYSTEM_CATEGORY_ID);
  if (boundId) return boundId;

  let configCategoryId = await findConfigCategoryByLabel(connection, 'Screen Sizes');
  if (!configCategoryId) configCategoryId = await insertConfigCategory(connection, 'Screen Sizes');

  await connection.query(
    `INSERT INTO system_config_categories (system_config_category_id, config_category_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_category_id = VALUES(config_category_id)`,
    [SCREEN_SIZE_SYSTEM_CATEGORY_ID, configCategoryId]
  );
  return configCategoryId;
}

async function findConfigValueByLabel(connection, configCategoryId, label) {
  const columns = await getColumnSet(connection, 'config_values');
  const expressions = [];
  if (columns.has('label')) expressions.push('LOWER(TRIM(label)) = LOWER(TRIM(?))');
  if (columns.has('name')) expressions.push('LOWER(TRIM(name)) = LOWER(TRIM(?))');
  if (columns.has('value')) expressions.push('LOWER(TRIM(value)) = LOWER(TRIM(?))');
  if (expressions.length === 0) return null;
  const params = [configCategoryId, ...expressions.map(() => label)];
  const [rows] = await connection.query(
    `SELECT config_value_id FROM config_values WHERE config_category_id = ? AND (${expressions.join(' OR ')}) ORDER BY config_value_id`,
    params
  );
  if (rows.length > 1) throw new Error(`Multiple configuration values in category ${configCategoryId} match ${label}.`);
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function insertConfigValue(connection, configCategoryId, label, description, sortOrder) {
  const columns = await getColumnSet(connection, 'config_values');
  const fields = ['config_category_id'];
  const values = [configCategoryId];
  for (const columnName of ['label', 'name']) {
    if (columns.has(columnName)) {
      fields.push(columnName);
      values.push(label);
    }
  }
  if (columns.has('value')) {
    fields.push('value');
    values.push(label);
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push(description || null);
  }
  if (columns.has('sort_order')) {
    fields.push('sort_order');
    values.push(sortOrder);
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
    `INSERT INTO config_values (${fields.map(quoteIdentifier).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureConfigValue(connection, configCategoryId, label, description, sortOrder) {
  let configValueId = await findConfigValueByLabel(connection, configCategoryId, label);
  if (!configValueId) {
    configValueId = await insertConfigValue(connection, configCategoryId, label, description, sortOrder);
  } else {
    const columns = await getColumnSet(connection, 'config_values');
    if (columns.has('is_active')) {
      await connection.query('UPDATE config_values SET is_active = 1 WHERE config_value_id = ?', [configValueId]);
    }
  }
  return configValueId;
}

async function ensureScreenSizeValues(connection, configCategoryId) {
  const ids = new Map();
  for (let index = 0; index < DEFAULT_SCREEN_SIZE_LABELS.length; index += 1) {
    const label = DEFAULT_SCREEN_SIZE_LABELS[index];
    const id = await ensureConfigValue(
      connection,
      configCategoryId,
      label,
      'Physical/native display diagonal size.',
      (index + 1) * 10
    );
    ids.set(label.toLowerCase(), id);
  }
  return ids;
}

async function ensureTabletCategory(connection, unitCategoriesConfigId) {
  return ensureConfigValue(
    connection,
    unitCategoriesConfigId,
    'Tablet',
    'Tablet-form-factor units, including iPad models.',
    80
  );
}

async function ensureUnitMetadataColumns(connection) {
  const columns = await getColumnSet(connection, 'units');
  if (!columns.has('screen_size_config_value_id')) {
    await connection.query('ALTER TABLE units ADD COLUMN screen_size_config_value_id INT NULL AFTER unit_model_id');
  }
  if (!columns.has('model_year')) {
    await connection.query('ALTER TABLE units ADD COLUMN model_year SMALLINT UNSIGNED NULL AFTER screen_size_config_value_id');
  }

  const [indexRows] = await connection.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units' AND INDEX_NAME = 'idx_units_screen_size' LIMIT 1`
  );
  if (indexRows.length === 0) {
    await connection.query('ALTER TABLE units ADD KEY idx_units_screen_size (screen_size_config_value_id)');
  }

  const [fkRows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
       AND COLUMN_NAME = 'screen_size_config_value_id' AND REFERENCED_TABLE_NAME = 'config_values' LIMIT 1`
  );
  if (fkRows.length === 0) {
    await connection.query(
      `ALTER TABLE units ADD CONSTRAINT fk_units_screen_size_config_value
       FOREIGN KEY (screen_size_config_value_id) REFERENCES config_values (config_value_id)`
    );
  }

  const [checkRows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'units'
       AND CONSTRAINT_NAME = 'chk_units_model_year' AND CONSTRAINT_TYPE = 'CHECK' LIMIT 1`
  );
  if (checkRows.length === 0) {
    await connection.query(
      `ALTER TABLE units ADD CONSTRAINT chk_units_model_year
       CHECK (model_year IS NULL OR model_year BETWEEN 1980 AND 2100)`
    );
  }
}

async function loadAppleModels(connection, appleManufacturerId) {
  const [rows] = await connection.query(
    `SELECT unit_model_id, unit_category_config_value_id, model_name, sort_order, is_active
     FROM unit_models WHERE manufacturer_id = ? ORDER BY unit_model_id`,
    [appleManufacturerId]
  );
  return rows.map((row) => ({
    id: Number(row.unit_model_id),
    categoryId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    modelName: String(row.model_name || '').trim(),
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  }));
}

async function findGenericModel(connection, appleManufacturerId, modelName) {
  const [rows] = await connection.query(
    `SELECT unit_model_id, unit_category_config_value_id, is_active
     FROM unit_models
     WHERE manufacturer_id = ? AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
     ORDER BY unit_model_id`,
    [appleManufacturerId, modelName]
  );
  const genericRows = rows.filter((row) => Number(row.unit_model_id) > 0);
  if (genericRows.length > 1) throw new Error(`Multiple Apple Unit Models are named ${modelName}; resolve duplicates before migration.`);
  return genericRows[0] || null;
}

async function validateTargetCatalogPreflight(connection, appleManufacturerId, screenSizeCategoryId) {
  for (const family of APPLE_MODEL_FAMILIES) {
    await findGenericModel(connection, appleManufacturerId, family.modelName);
  }

  if (screenSizeCategoryId) {
    for (const label of DEFAULT_SCREEN_SIZE_LABELS) {
      await findConfigValueByLabel(connection, screenSizeCategoryId, label);
    }
  }
}

async function remapUnitModelReferenceIfPresent(connection, tableName, columnName, sourceModelId, targetModelId) {
  if (!await tableExists(connection, tableName)) return 0;
  const columns = await getColumnSet(connection, tableName);
  if (!columns.has(columnName)) return 0;
  const [result] = await connection.query(
    `UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier(columnName)} = ? WHERE ${quoteIdentifier(columnName)} = ?`,
    [targetModelId, sourceModelId]
  );
  return Number(result.affectedRows || 0);
}

async function ensureGenericAppleModel(connection, appleManufacturerId, family, categoryIds, sortOrder) {
  const categoryId = categoryIds[family.categoryKind];
  let row = await findGenericModel(connection, appleManufacturerId, family.modelName);
  if (!row) {
    const [result] = await connection.query(
      `INSERT INTO unit_models (manufacturer_id, unit_category_config_value_id, model_name, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [appleManufacturerId, categoryId, family.modelName, sortOrder]
    );
    row = { unit_model_id: result.insertId };
  } else {
    await connection.query(
      `UPDATE unit_models SET unit_category_config_value_id = ?, is_active = 1 WHERE unit_model_id = ?`,
      [categoryId, row.unit_model_id]
    );
  }
  return Number(row.unit_model_id);
}

async function mergeProcessorCompatibility(connection, sourceModelId, targetModelId) {
  if (!await tableExists(connection, 'unit_model_processor_options')) return;
  const columns = await getColumnSet(connection, 'unit_model_processor_options');
  if (!columns.has('unit_model_id') || !columns.has('processor_model_id')) return;
  const activeExpression = columns.has('is_active') ? 'MAX(is_active)' : '1';
  const [rows] = await connection.query(
    `SELECT processor_model_id, ${activeExpression} AS is_active
     FROM unit_model_processor_options
     WHERE unit_model_id = ?
     GROUP BY processor_model_id`,
    [sourceModelId]
  );
  for (const row of rows) {
    if (columns.has('is_active')) {
      await connection.query(
        `INSERT INTO unit_model_processor_options (unit_model_id, processor_model_id, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = GREATEST(is_active, VALUES(is_active))`,
        [targetModelId, row.processor_model_id, Number(row.is_active) === 1 ? 1 : 0]
      );
    } else {
      await connection.query(
        `INSERT IGNORE INTO unit_model_processor_options (unit_model_id, processor_model_id) VALUES (?, ?)`,
        [targetModelId, row.processor_model_id]
      );
    }
  }
}

async function inspect(connection) {
  for (const tableName of ['units', 'unit_models', 'manufacturers', 'config_categories', 'config_values', 'system_config_categories', 'system_config_values']) {
    if (!await tableExists(connection, tableName)) throw new Error(`Apple catalog normalization requires ${tableName}.`);
  }

  const categoryColumns = await getColumnSet(connection, 'config_categories');
  const valueColumns = await getColumnSet(connection, 'config_values');
  if (categoryColumns.has('code') || valueColumns.has('code')) {
    throw new Error('Stage 2 requires the finalized configuration-ID foundation; legacy configuration code columns are still present.');
  }

  const appleManufacturerId = await findManufacturerId(connection, 'Apple');
  const unitCategoriesConfigId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES);
  const laptopCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_LAPTOP);
  const desktopCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_DESKTOP);
  const macbookCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_MACBOOK);
  const screenSizeCategoryId = await getSystemCategoryConfigId(connection, SCREEN_SIZE_SYSTEM_CATEGORY_ID);
  await validateTargetCatalogPreflight(connection, appleManufacturerId, screenSizeCategoryId);
  if (!unitCategoriesConfigId || !laptopCategoryId || !desktopCategoryId || !macbookCategoryId) {
    throw new Error('Required Unit Category ID bindings (Laptop/Desktop/MacBook) are missing.');
  }

  const tabletCategoryId = await findConfigValueByLabel(connection, unitCategoriesConfigId, 'Tablet');
  const appleModels = await loadAppleModels(connection, appleManufacturerId);
  const detailedModels = appleModels
    .map((model) => ({ ...model, parsed: parseDetailedAppleModel(model.modelName) }))
    .filter((model) => model.parsed);
  const unrecognizedDetailedModels = appleModels.filter((model) => /\([^)]*\)/.test(model.modelName) && !parseDetailedAppleModel(model.modelName));

  const sourceModelIds = detailedModels.map((model) => model.id);
  let unitsOnDetailedModels = 0;
  if (sourceModelIds.length > 0) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS row_count FROM units WHERE unit_model_id IN (${sourceModelIds.map(() => '?').join(', ')})`,
      sourceModelIds
    );
    unitsOnDetailedModels = Number(rows[0]?.row_count || 0);
  }
  const [macbookUnitRows] = await connection.query(
    'SELECT COUNT(*) AS row_count FROM units WHERE unit_category_config_value_id = ?',
    [macbookCategoryId]
  );
  const [macbookModelRows] = await connection.query(
    'SELECT COUNT(*) AS row_count FROM unit_models WHERE unit_category_config_value_id = ?',
    [macbookCategoryId]
  );
  const unitColumns = await getColumnSet(connection, 'units');

  return {
    appleManufacturerId,
    unitCategoriesConfigId,
    laptopCategoryId,
    desktopCategoryId,
    macbookCategoryId,
    tabletCategoryId,
    screenSizeCategoryId,
    screenSizeColumnPresent: unitColumns.has('screen_size_config_value_id'),
    modelYearColumnPresent: unitColumns.has('model_year'),
    appleModelCount: appleModels.length,
    detailedModels,
    unrecognizedDetailedModels,
    unitsOnDetailedModels,
    macbookUnitCount: Number(macbookUnitRows[0]?.row_count || 0),
    macbookModelCount: Number(macbookModelRows[0]?.row_count || 0)
  };
}

function printState(state, mode) {
  console.log(`\nApple catalog normalization (${mode})`);
  console.log(`Apple Unit Models: ${state.appleModelCount}`);
  console.log(`Detailed Apple models recognized for normalization: ${state.detailedModels.length}`);
  console.log(`Units attached to recognized detailed Apple models: ${state.unitsOnDetailedModels}`);
  console.log(`Units currently using MacBook Unit Category: ${state.macbookUnitCount}`);
  console.log(`Unit Models currently using MacBook Unit Category: ${state.macbookModelCount}`);
  console.log(`Screen Sizes category: ${state.screenSizeCategoryId ? `present (#${state.screenSizeCategoryId})` : 'missing (will create)'}`);
  console.log(`Tablet Unit Category: ${state.tabletCategoryId ? `present (#${state.tabletCategoryId})` : 'missing (will create)'}`);
  console.log(`units.screen_size_config_value_id: ${state.screenSizeColumnPresent ? 'present' : 'missing (will add)'}`);
  console.log(`units.model_year: ${state.modelYearColumnPresent ? 'present' : 'missing (will add)'}`);
  if (state.unrecognizedDetailedModels.length > 0) {
    console.log(`NOTICE - unrecognized detailed Apple models left untouched: ${state.unrecognizedDetailedModels.map((model) => model.modelName).join('; ')}`);
  }
}

async function applyNormalization(connection) {
  await ensureUnitMetadataColumns(connection);
  const screenSizeCategoryId = await ensureScreenSizeCategory(connection);
  const screenSizeIds = await ensureScreenSizeValues(connection, screenSizeCategoryId);
  const unitCategoriesConfigId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES);
  const laptopCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_LAPTOP);
  const desktopCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_DESKTOP);
  const macbookCategoryId = await getSystemValueConfigId(connection, SYSTEM_CONFIG_VALUE_IDS.UNIT_CATEGORY_MACBOOK);
  const tabletCategoryId = await ensureTabletCategory(connection, unitCategoriesConfigId);
  const appleManufacturerId = await findManufacturerId(connection, 'Apple');

  const categoryIds = {
    laptop: laptopCategoryId,
    desktop: desktopCategoryId,
    tablet: tabletCategoryId
  };

  await connection.beginTransaction();
  try {
    const genericModelIds = new Map();
    for (let index = 0; index < APPLE_MODEL_FAMILIES.length; index += 1) {
      const family = APPLE_MODEL_FAMILIES[index];
      const targetId = await ensureGenericAppleModel(connection, appleManufacturerId, family, categoryIds, (index + 1) * 10);
      genericModelIds.set(family.modelName.toLowerCase(), targetId);
    }

    const appleModels = await loadAppleModels(connection, appleManufacturerId);
    for (const source of appleModels) {
      const parsed = parseDetailedAppleModel(source.modelName);
      if (!parsed) continue;
      const targetModelId = genericModelIds.get(parsed.targetModelName.toLowerCase());
      if (!targetModelId || targetModelId === source.id) continue;
      const targetFamily = APPLE_MODEL_FAMILIES.find((entry) => entry.modelName === parsed.targetModelName);
      const targetCategoryId = categoryIds[targetFamily.categoryKind];
      const screenSizeConfigValueId = parsed.screenSizeLabel
        ? screenSizeIds.get(parsed.screenSizeLabel.toLowerCase()) || await ensureConfigValue(
          connection,
          screenSizeCategoryId,
          parsed.screenSizeLabel,
          'Physical/native display diagonal size.',
          999
        )
        : null;

      await mergeProcessorCompatibility(connection, source.id, targetModelId);
      await connection.query(
        `UPDATE units
         SET unit_model_id = ?,
             unit_category_config_value_id = ?,
             screen_size_config_value_id = COALESCE(screen_size_config_value_id, ?),
             model_year = COALESCE(model_year, ?)
         WHERE unit_model_id = ?`,
        [targetModelId, targetCategoryId, screenSizeConfigValueId, parsed.modelYear, source.id]
      );
      await remapUnitModelReferenceIfPresent(connection, 'lot_requirements', 'unit_model_id', source.id, targetModelId);
      await remapUnitModelReferenceIfPresent(connection, 'unit_model_catalog_requests', 'approved_unit_model_id', source.id, targetModelId);
      await remapUnitModelReferenceIfPresent(connection, 'unit_processor_catalog_requests', 'unit_model_id', source.id, targetModelId);
      await connection.query('UPDATE unit_models SET is_active = 0 WHERE unit_model_id = ?', [source.id]);
    }

    // Remove the test-era MacBook category from all current model/unit assignments.
    await connection.query(
      'UPDATE unit_models SET unit_category_config_value_id = ? WHERE unit_category_config_value_id = ?',
      [laptopCategoryId, macbookCategoryId]
    );
    await connection.query(
      'UPDATE units SET unit_category_config_value_id = ? WHERE unit_category_config_value_id = ?',
      [laptopCategoryId, macbookCategoryId]
    );
    if (await tableExists(connection, 'lot_requirements')) {
      const requirementColumns = await getColumnSet(connection, 'lot_requirements');
      if (requirementColumns.has('requirement_config_value_id')) {
        await connection.query(
          'UPDATE lot_requirements SET requirement_config_value_id = ? WHERE requirement_config_value_id = ?',
          [laptopCategoryId, macbookCategoryId]
        );
      }
    }
    await connection.query('UPDATE config_values SET is_active = 0 WHERE config_value_id = ?', [macbookCategoryId]);

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

    await applyNormalization(connection);
    const after = await inspect(connection);
    printState(after, 'applied');
    console.log('\nApple catalog normalization applied successfully. Detailed source models remain stored but inactive; current Units point to generic Apple models.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
