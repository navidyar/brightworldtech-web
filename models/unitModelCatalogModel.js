const { pool } = require('./db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const processorCatalogModel = require('./processorCatalogModel');
const { normalizeModelText } = require('../utils/catalogText');

const MAX_MODEL_NAME_LENGTH = 150;

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeModelName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeSearch(value) {
  return String(value || '').trim().slice(0, 120);
}

async function getColumnSet(tableName) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name || row.COLUMN_NAME).filter(Boolean));
}

function pickColumn(columns, candidates) {
  return candidates.find((candidate) => columns.has(candidate)) || null;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function listManufacturers() {
  const columns = await getColumnSet('manufacturers');
  const labelColumn = pickColumn(columns, ['name', 'manufacturer_name', 'label']);
  const activeColumn = pickColumn(columns, ['is_active']);

  if (!columns.has('manufacturer_id') || !labelColumn) {
    return [];
  }

  const activeFilter = activeColumn ? `WHERE ${quoteIdentifier(activeColumn)} = 1` : '';
  const [rows] = await pool.query(`
    SELECT manufacturer_id, ${quoteIdentifier(labelColumn)} AS name, ${activeColumn ? quoteIdentifier(activeColumn) : '1'} AS is_active
    FROM manufacturers
    ${activeFilter}
    ORDER BY name
  `);

  return rows.map((row) => ({
    id: Number(row.manufacturer_id),
    label: row.name,
    isActive: Number(row.is_active) === 1
  }));
}

async function listUnitCategories() {
  const valueColumns = await getColumnSet('config_values');
  const labelColumn = pickColumn(valueColumns, ['label', 'name']);
  const activeColumn = pickColumn(valueColumns, ['is_active']);
  const sortColumn = pickColumn(valueColumns, ['sort_order']);

  if (!valueColumns.has('config_value_id')) return [];

  const labelExpression = labelColumn
    ? `COALESCE(cv.${quoteIdentifier(labelColumn)}, cv.value, CONCAT('Value #', cv.config_value_id))`
    : `COALESCE(cv.value, CONCAT('Value #', cv.config_value_id))`;
  const [rows] = await pool.query(`
    SELECT cv.config_value_id, ${labelExpression} AS label
    FROM system_config_categories scc
    INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
    WHERE scc.system_config_category_id = ?
      ${activeColumn ? `AND COALESCE(cv.${quoteIdentifier(activeColumn)}, 1) = 1` : ''}
    ORDER BY ${sortColumn ? `COALESCE(cv.${quoteIdentifier(sortColumn)}, 0),` : ''} label, cv.config_value_id
  `, [SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES]);

  return rows.map((row) => ({ id: Number(row.config_value_id), label: row.label }));
}

function getCatalogFilters(filters = {}) {
  return {
    manufacturerId: normalizePositiveInteger(filters.manufacturerId),
    unitCategoryConfigValueId: normalizePositiveInteger(filters.unitCategoryConfigValueId),
    includeInactive: filters.includeInactive === true || String(filters.includeInactive || '') === '1',
    search: normalizeSearch(filters.search)
  };
}

async function listUnitModels(filters = {}) {
  const normalized = getCatalogFilters(filters);
  const where = [];
  const params = [];

  if (normalized.manufacturerId) {
    where.push('um.manufacturer_id = ?');
    params.push(normalized.manufacturerId);
  }

  if (normalized.unitCategoryConfigValueId) {
    where.push('um.unit_category_config_value_id = ?');
    params.push(normalized.unitCategoryConfigValueId);
  }

  if (!normalized.includeInactive) {
    where.push('um.is_active = 1');
  }

  if (normalized.search) {
    where.push('um.model_name LIKE ?');
    params.push(`%${normalized.search}%`);
  }

  const [rows] = await pool.query(`
    SELECT
      um.unit_model_id,
      um.manufacturer_id,
      m.name AS manufacturer_name,
      um.unit_category_config_value_id,
      COALESCE(cv.label, cv.value, CONCAT('Value #', cv.config_value_id)) AS unit_category_label,
      um.model_name,
      um.sort_order,
      um.is_active
    FROM unit_models um
    INNER JOIN manufacturers m
      ON m.manufacturer_id = um.manufacturer_id
    LEFT JOIN config_values cv
      ON cv.config_value_id = um.unit_category_config_value_id
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY m.name, unit_category_label, um.sort_order, um.model_name
  `, params);

  return rows.map((row) => ({
    id: Number(row.unit_model_id),
    manufacturerId: Number(row.manufacturer_id),
    manufacturerName: row.manufacturer_name,
    unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    unitCategoryLabel: row.unit_category_label || 'Uncategorized',
    modelName: row.model_name,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  }));
}

async function getUnitModelById(unitModelId, connection = pool) {
  const safeId = normalizePositiveInteger(unitModelId);

  if (!safeId) {
    return null;
  }

  const [rows] = await connection.query(`
    SELECT
      um.unit_model_id,
      um.manufacturer_id,
      m.name AS manufacturer_name,
      um.unit_category_config_value_id,
      COALESCE(cv.label, cv.value, CONCAT('Value #', cv.config_value_id)) AS unit_category_label,
      um.model_name,
      um.sort_order,
      um.is_active
    FROM unit_models um
    INNER JOIN manufacturers m
      ON m.manufacturer_id = um.manufacturer_id
    LEFT JOIN config_values cv
      ON cv.config_value_id = um.unit_category_config_value_id
    WHERE um.unit_model_id = ?
    LIMIT 1
  `, [safeId]);

  const row = rows[0];
  if (!row) return null;

  return {
    id: Number(row.unit_model_id),
    manufacturerId: Number(row.manufacturer_id),
    manufacturerName: row.manufacturer_name,
    unitCategoryConfigValueId: row.unit_category_config_value_id ? Number(row.unit_category_config_value_id) : null,
    unitCategoryLabel: row.unit_category_label || 'Uncategorized',
    modelName: row.model_name,
    sortOrder: Number(row.sort_order || 0),
    isActive: Number(row.is_active) === 1
  };
}

async function modelExists({ manufacturerId, unitCategoryConfigValueId, modelName, excludeUnitModelId = null }) {
  const safeManufacturerId = normalizePositiveInteger(manufacturerId);
  const safeCategoryId = normalizePositiveInteger(unitCategoryConfigValueId);
  const normalizedName = normalizeModelName(modelName);
  const safeExcludeId = normalizePositiveInteger(excludeUnitModelId);

  if (!safeManufacturerId || !safeCategoryId || !normalizedName) {
    return false;
  }

  const params = [safeManufacturerId, safeCategoryId, normalizedName];
  let sql = `
    SELECT 1
    FROM unit_models
    WHERE manufacturer_id = ?
      AND unit_category_config_value_id = ?
      AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
  `;

  if (safeExcludeId) {
    sql += ' AND unit_model_id <> ?';
    params.push(safeExcludeId);
  }

  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows.length > 0;
}

async function createUnitModel({ manufacturerId, unitCategoryConfigValueId, modelName, sortOrder = 0, isActive = true }) {
  const [result] = await pool.execute(`
    INSERT INTO unit_models (
      manufacturer_id,
      unit_category_config_value_id,
      model_name,
      sort_order,
      is_active
    ) VALUES (?, ?, ?, ?, ?)
  `, [
    normalizePositiveInteger(manufacturerId),
    normalizePositiveInteger(unitCategoryConfigValueId),
    normalizeModelName(modelName),
    Number.parseInt(String(sortOrder || 0), 10) || 0,
    isActive ? 1 : 0
  ]);

  return Number(result.insertId);
}

async function updateUnitModel(unitModelId, { manufacturerId, unitCategoryConfigValueId, modelName, sortOrder = 0, isActive = true }) {
  const safeId = normalizePositiveInteger(unitModelId);
  await pool.execute(`
    UPDATE unit_models
    SET
      manufacturer_id = ?,
      unit_category_config_value_id = ?,
      model_name = ?,
      sort_order = ?,
      is_active = ?
    WHERE unit_model_id = ?
  `, [
    normalizePositiveInteger(manufacturerId),
    normalizePositiveInteger(unitCategoryConfigValueId),
    normalizeModelName(modelName),
    Number.parseInt(String(sortOrder || 0), 10) || 0,
    isActive ? 1 : 0,
    safeId
  ]);
}

async function setUnitModelActive(unitModelId, isActive) {
  const safeId = normalizePositiveInteger(unitModelId);
  await pool.execute('UPDATE unit_models SET is_active = ? WHERE unit_model_id = ?', [isActive ? 1 : 0, safeId]);
}

async function tableHasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count_value
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count_value || 0) > 0;
}

async function countReference(connection, tableName, columnName, unitModelId) {
  if (!await tableHasColumn(connection, tableName, columnName)) return 0;
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count_value FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(columnName)} = ?`,
    [unitModelId]
  );
  return Number(rows[0]?.count_value || 0);
}

async function getUnitModelDeletionDetails(unitModelId, connection = pool) {
  const unitModel = await getUnitModelById(unitModelId, connection);
  if (!unitModel) return null;

  const [unitCount, lotRequirementCount, modelRequestCount, processorRequestCount, processorMappingCount, intakeMappingCount] = await Promise.all([
    countReference(connection, 'units', 'unit_model_id', unitModel.id),
    countReference(connection, 'lot_requirements', 'unit_model_id', unitModel.id),
    countReference(connection, 'unit_model_catalog_requests', 'approved_unit_model_id', unitModel.id),
    countReference(connection, 'unit_processor_catalog_requests', 'unit_model_id', unitModel.id),
    countReference(connection, 'unit_model_processor_options', 'unit_model_id', unitModel.id),
    countReference(connection, 'unit_model_intake_mappings', 'target_unit_model_id', unitModel.id)
  ]);

  return {
    ...unitModel,
    unitCount,
    lotRequirementCount,
    modelRequestCount,
    processorRequestCount,
    processorMappingCount,
    intakeMappingCount
  };
}

async function deleteUnitModel({ unitModelId }) {
  const safeId = normalizePositiveInteger(unitModelId);
  if (!safeId) {
    const error = new Error('The selected Unit Model could not be found.');
    error.code = 'BWT_UNIT_MODEL_DELETE_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT unit_model_id, model_name, is_active
         FROM unit_models
        WHERE unit_model_id = ?
        LIMIT 1
        FOR UPDATE`,
      [safeId]
    );
    const unitModel = rows[0];
    if (!unitModel) {
      const error = new Error('The selected Unit Model could not be found.');
      error.code = 'BWT_UNIT_MODEL_DELETE_NOT_FOUND';
      throw error;
    }

    const [unitCount, lotRequirementCount, modelRequestCount, processorRequestCount, intakeMappingCount] = await Promise.all([
      countReference(connection, 'units', 'unit_model_id', safeId),
      countReference(connection, 'lot_requirements', 'unit_model_id', safeId),
      countReference(connection, 'unit_model_catalog_requests', 'approved_unit_model_id', safeId),
      countReference(connection, 'unit_processor_catalog_requests', 'unit_model_id', safeId),
      countReference(connection, 'unit_model_intake_mappings', 'target_unit_model_id', safeId)
    ]);

    if (unitCount > 0 || lotRequirementCount > 0 || modelRequestCount > 0 || processorRequestCount > 0 || intakeMappingCount > 0) {
      await connection.query('UPDATE unit_models SET is_active = 0 WHERE unit_model_id = ? LIMIT 1', [safeId]);
      await connection.commit();
      return {
        deleted: false,
        retired: true,
        unitModelId: safeId,
        modelName: unitModel.model_name,
        retainedUnitCount: unitCount,
        retainedLotRequirementCount: lotRequirementCount,
        retainedModelRequestCount: modelRequestCount,
        retainedProcessorRequestCount: processorRequestCount,
        retainedIntakeMappingCount: intakeMappingCount
      };
    }

    let removedProcessorMappings = 0;
    if (await tableHasColumn(connection, 'unit_model_processor_options', 'unit_model_id')) {
      const [result] = await connection.query('DELETE FROM unit_model_processor_options WHERE unit_model_id = ?', [safeId]);
      removedProcessorMappings = Number(result.affectedRows || 0);
    }

    await connection.query('DELETE FROM unit_models WHERE unit_model_id = ? LIMIT 1', [safeId]);
    await connection.commit();
    return {
      deleted: true,
      retired: false,
      unitModelId: safeId,
      modelName: unitModel.model_name,
      removedProcessorMappings
    };
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED')) {
      try {
        await connection.beginTransaction();
        const [result] = await connection.query('UPDATE unit_models SET is_active = 0 WHERE unit_model_id = ? LIMIT 1', [safeId]);
        await connection.commit();
        if (Number(result.affectedRows || 0) > 0) {
          return {
            deleted: false,
            retired: true,
            unitModelId: safeId,
            modelName: '',
            retainedByForeignKey: true
          };
        }
      } catch (retireError) {
        await connection.rollback();
        retireError.cause = error;
        throw retireError;
      }
      const blocked = new Error('The Unit Model still has a database reference, so it was not permanently deleted.');
      blocked.code = 'BWT_UNIT_MODEL_DELETE_IN_USE';
      blocked.cause = error;
      throw blocked;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listUnitModelProcessorAssociations(unitModelId) {
  const unitModel = await getUnitModelById(unitModelId);
  if (!unitModel) return null;

  const [processors, mappingRows] = await Promise.all([
    processorCatalogModel.listProcessorCatalogOptions({ includeInactive: false }),
    pool.query(
      `
        SELECT processor_model_id, is_active
        FROM unit_model_processor_options
        WHERE unit_model_id = ?
      `,
      [unitModel.id]
    ).then(([rows]) => rows)
  ]);
  const mappedIds = new Set(mappingRows.filter((row) => Number(row.is_active) === 1).map((row) => Number(row.processor_model_id)));

  return {
    unitModel,
    processors: processors.map((processor) => ({ ...processor, isMapped: mappedIds.has(processor.id) })),
    processorBrands: [...new Map(processors.map((processor) => [processor.processorBrandId, { id: processor.processorBrandId, label: processor.brandName }])).values()]
  };
}

async function replaceUnitModelProcessorAssociations({ unitModelId, processorModelIds = [] }) {
  const safeUnitModelId = normalizePositiveInteger(unitModelId);
  const selectedProcessorIds = [...new Set((Array.isArray(processorModelIds) ? processorModelIds : [processorModelIds])
    .map(normalizePositiveInteger)
    .filter(Boolean))];
  if (!safeUnitModelId) {
    const error = new Error('The selected Unit Model could not be found.');
    error.code = 'BWT_UNIT_MODEL_PROCESSOR_ASSOCIATION_INPUT_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [modelRows] = await connection.query(
      'SELECT unit_model_id FROM unit_models WHERE unit_model_id = ? LIMIT 1 FOR UPDATE',
      [safeUnitModelId]
    );
    if (!modelRows[0]) {
      const error = new Error('The selected Unit Model could not be found.');
      error.code = 'BWT_UNIT_MODEL_PROCESSOR_ASSOCIATION_NOT_FOUND';
      throw error;
    }

    if (selectedProcessorIds.length > 0) {
      const placeholders = selectedProcessorIds.map(() => '?').join(', ');
      const [processorRows] = await connection.query(
        `SELECT processor_model_id FROM processor_models WHERE processor_model_id IN (${placeholders})`,
        selectedProcessorIds
      );
      if (processorRows.length !== selectedProcessorIds.length) {
        const error = new Error('One or more selected Processors no longer exist. Refresh the page and try again.');
        error.code = 'BWT_UNIT_MODEL_PROCESSOR_ASSOCIATION_INVALID_PROCESSOR';
        throw error;
      }
    }

    await connection.query(
      'UPDATE unit_model_processor_options SET is_active = 0 WHERE unit_model_id = ?',
      [safeUnitModelId]
    );
    for (const processorModelId of selectedProcessorIds) {
      await connection.query(
        `
          INSERT INTO unit_model_processor_options (unit_model_id, processor_model_id, is_active)
          VALUES (?, ?, 1)
          ON DUPLICATE KEY UPDATE is_active = 1
        `,
        [safeUnitModelId, processorModelId]
      );
    }

    await connection.commit();
    return { unitModelId: safeUnitModelId, processorCount: selectedProcessorIds.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listUnitModelIntakeMappings(unitModelId, connection = pool) {
  const safeId = normalizePositiveInteger(unitModelId);
  if (!safeId) return [];
  const [rows] = await connection.query(
    `SELECT
       mapping.unit_model_intake_mapping_id,
       mapping.observed_manufacturer_id,
       manufacturer.name AS observed_manufacturer_name,
       mapping.observed_unit_category_config_value_id,
       COALESCE(observed_category.label, observed_category.value, CONCAT('Value #', observed_category.config_value_id)) AS observed_category_label,
       mapping.observed_model_name,
       mapping.target_unit_model_id,
       mapping.is_active,
       mapping.created_at,
       mapping.updated_at
     FROM unit_model_intake_mappings mapping
     INNER JOIN manufacturers manufacturer
       ON manufacturer.manufacturer_id = mapping.observed_manufacturer_id
     INNER JOIN config_values observed_category
       ON observed_category.config_value_id = mapping.observed_unit_category_config_value_id
     WHERE mapping.target_unit_model_id = ?
     ORDER BY mapping.is_active DESC, observed_category_label, mapping.observed_model_name`,
    [safeId]
  );
  return rows.map((row) => ({
    id: Number(row.unit_model_intake_mapping_id),
    observedManufacturerId: Number(row.observed_manufacturer_id),
    observedManufacturerName: row.observed_manufacturer_name,
    observedUnitCategoryConfigValueId: Number(row.observed_unit_category_config_value_id),
    observedCategoryLabel: row.observed_category_label,
    observedModelName: row.observed_model_name,
    targetUnitModelId: Number(row.target_unit_model_id),
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function findUnitModelIntakeMapping({ manufacturerId, unitCategoryConfigValueId, observedModelName }, connection = pool) {
  const safeManufacturerId = normalizePositiveInteger(manufacturerId);
  const safeCategoryId = normalizePositiveInteger(unitCategoryConfigValueId);
  const observedModelKey = normalizeModelText(observedModelName);
  if (!safeManufacturerId || !safeCategoryId || !observedModelKey) return null;

  const [rows] = await connection.query(
    `SELECT
       mapping.unit_model_intake_mapping_id,
       mapping.observed_model_name,
       mapping.target_unit_model_id,
       target.model_name AS target_model_name,
       target.manufacturer_id AS target_manufacturer_id,
       target.unit_category_config_value_id AS target_unit_category_config_value_id,
       COALESCE(target_category.label, target_category.value, CONCAT('Value #', target_category.config_value_id)) AS target_category_label
     FROM unit_model_intake_mappings mapping
     INNER JOIN unit_models target
       ON target.unit_model_id = mapping.target_unit_model_id
      AND target.is_active = 1
     LEFT JOIN config_values target_category
       ON target_category.config_value_id = target.unit_category_config_value_id
     WHERE mapping.observed_manufacturer_id = ?
       AND mapping.observed_unit_category_config_value_id = ?
       AND mapping.observed_model_key = ?
       AND mapping.is_active = 1
     LIMIT 1`,
    [safeManufacturerId, safeCategoryId, observedModelKey]
  );
  const row = rows[0];
  return row ? {
    id: Number(row.unit_model_intake_mapping_id),
    observedModelName: row.observed_model_name,
    targetUnitModelId: Number(row.target_unit_model_id),
    targetModelName: row.target_model_name,
    targetManufacturerId: Number(row.target_manufacturer_id),
    targetUnitCategoryConfigValueId: Number(row.target_unit_category_config_value_id),
    targetCategoryLabel: row.target_category_label || ''
  } : null;
}

async function saveUnitModelIntakeMapping({
  observedManufacturerId,
  observedUnitCategoryConfigValueId,
  observedModelName,
  targetUnitModelId,
  currentUserId = null
}, connection = pool) {
  const manufacturerId = normalizePositiveInteger(observedManufacturerId);
  const categoryId = normalizePositiveInteger(observedUnitCategoryConfigValueId);
  const modelName = normalizeModelName(observedModelName);
  const modelKey = normalizeModelText(modelName);
  const targetId = normalizePositiveInteger(targetUnitModelId);
  const userId = normalizePositiveInteger(currentUserId);
  if (!manufacturerId || !categoryId || !modelName || !modelKey || !targetId) {
    const error = new Error('Choose an incoming category, enter an incoming model, and select a Catalog Model.');
    error.code = 'BWT_UNIT_MODEL_MAPPING_INPUT_INVALID';
    throw error;
  }
  const target = await getUnitModelById(targetId, connection);
  if (!target || !target.isActive) {
    const error = new Error('The Catalog Model must be active.');
    error.code = 'BWT_UNIT_MODEL_MAPPING_TARGET_INVALID';
    throw error;
  }
  if (target.manufacturerId !== manufacturerId) {
    const error = new Error('The incoming model and Catalog Model must use the same manufacturer.');
    error.code = 'BWT_UNIT_MODEL_MAPPING_MANUFACTURER_MISMATCH';
    throw error;
  }

  const [result] = await connection.query(
    `INSERT INTO unit_model_intake_mappings (
       observed_manufacturer_id,
       observed_unit_category_config_value_id,
       observed_model_name,
       observed_model_key,
       target_unit_model_id,
       is_active,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       observed_model_name = VALUES(observed_model_name),
       target_unit_model_id = VALUES(target_unit_model_id),
       is_active = 1,
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [manufacturerId, categoryId, modelName, modelKey, targetId, userId, userId]
  );
  return Number(result.insertId || 0);
}

async function deactivateUnitModelIntakeMapping({ unitModelId, mappingId }, connection = pool) {
  const safeUnitModelId = normalizePositiveInteger(unitModelId);
  const safeMappingId = normalizePositiveInteger(mappingId);
  if (!safeUnitModelId || !safeMappingId) return false;
  const [result] = await connection.query(
    `UPDATE unit_model_intake_mappings
        SET is_active = 0
      WHERE unit_model_intake_mapping_id = ?
        AND target_unit_model_id = ?`,
    [safeMappingId, safeUnitModelId]
  );
  return Number(result.affectedRows || 0) > 0;
}

async function findLikelyUnitModelMatches({ manufacturerId, unitCategoryConfigValueId, modelName, limit = 6, includeInactive = false }) {
  const requestedKey = normalizeModelText(modelName);
  if (!requestedKey) return [];
  const candidates = await listUnitModels({ manufacturerId, includeInactive });
  return candidates.map((candidate) => {
    const candidateKey = normalizeModelText(candidate.modelName);
    const identityMatch = candidateKey === requestedKey;
    const related = requestedKey.length >= 3 && (candidateKey.includes(requestedKey) || requestedKey.includes(candidateKey));
    const categoryMatch = Number(candidate.unitCategoryConfigValueId) === Number(unitCategoryConfigValueId);
    return { ...candidate, identityMatch, related, categoryMatch, score: identityMatch ? 100 : (related ? 70 : 0) + (categoryMatch ? 5 : 0) };
  }).filter((candidate) => candidate.identityMatch || candidate.related)
    .sort((left, right) => right.score - left.score || left.modelName.localeCompare(right.modelName))
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 25)));
}

module.exports = {
  MAX_MODEL_NAME_LENGTH,
  normalizePositiveInteger,
  normalizeModelName,
  getCatalogFilters,
  listManufacturers,
  listUnitCategories,
  listUnitModels,
  getUnitModelById,
  getUnitModelDeletionDetails,
  deleteUnitModel,
  listUnitModelProcessorAssociations,
  modelExists,
  createUnitModel,
  updateUnitModel,
  replaceUnitModelProcessorAssociations,
  setUnitModelActive,
  listUnitModelIntakeMappings,
  findUnitModelIntakeMapping,
  saveUnitModelIntakeMapping,
  deactivateUnitModelIntakeMapping,
  findLikelyUnitModelMatches
};
