const crypto = require('crypto');
const { pool } = require('./db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const {
  getConfigCategoryOrderingPolicy,
  isPopularitySortedConfigCategory
} = require('../services/configurationOrderingPolicy');

const ALLOWED_TABLES = ['config_categories', 'config_values', 'lot_requirements', 'lots'];

async function getColumnSet(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Unsupported table for column inspection: ${tableName}`);
  }

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(
    rows
      .map((row) => row.column_name || row.COLUMN_NAME)
      .filter(Boolean)
  );
}

function pickColumnExpression(tableAlias, columns, candidates, fallbackExpression) {
  const foundColumn = candidates.find((columnName) => columns.has(columnName));

  if (foundColumn) {
    return `${tableAlias}.\`${foundColumn}\``;
  }

  return fallbackExpression;
}

function isActiveRecord(record) {
  return record.is_active === true || record.is_active === 1 || record.is_active === '1';
}

function getConfigSection(systemConfigCategoryId) {
  const systemId = Number(systemConfigCategoryId);

  if (systemId === SYSTEM_CONFIG_CATEGORY_IDS.PRODUCTION_WEIGHT_TYPES) {
    return {
      key: 'production-weights',
      label: 'Production Weight Configuration',
      description: 'Default production values used for lot defaults and future production reporting.',
      sortOrder: 10
    };
  }

  if ([
    SYSTEM_CONFIG_CATEGORY_IDS.LOT_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.LOT_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.COMPARISON_OPERATORS,
    SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES
  ].includes(systemId)) {
    return {
      key: 'lots',
      label: 'Lot Configuration',
      description: 'Selectable lot types, lot behavior, and lot-related management values.',
      sortOrder: 20
    };
  }

  if ([
    SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES,
    SYSTEM_CONFIG_CATEGORY_IDS.UNIT_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_WIPE_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.OPERATING_SYSTEMS,
    SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES,
    SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.TOUCHSCREEN_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES,
    SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.DRIVER_CHECK_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.SKINNED_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.GPU_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_ISSUE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.HARDWARE_ISSUE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_LOCATIONS,
    SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_SEVERITIES,
    SYSTEM_CONFIG_CATEGORY_IDS.COMMENT_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_SIZES
  ].includes(systemId)) {
    return {
      key: 'unit-workflow',
      label: 'Unit Workflow Configuration',
      description: 'Selectable values used while creating, editing, processing, and grading units.',
      sortOrder: 30
    };
  }

  if ([
    SYSTEM_CONFIG_CATEGORY_IDS.ACCOUNT_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.SECURITY_SETTINGS,
    SYSTEM_CONFIG_CATEGORY_IDS.PASSWORD_LINK_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.UNIT_IDENTIFIER_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES
  ].includes(systemId)) {
    return {
      key: 'system-access',
      label: 'System and Access Configuration',
      description: 'System-level values that should stay separate from productivity reporting.',
      sortOrder: 40
    };
  }

  return {
    key: 'other',
    label: 'Other Configuration',
    description: 'Additional app configuration values that do not fit the primary groups above.',
    sortOrder: 90
  };
}

function groupConfigCategories(categories) {
  const sectionsByKey = new Map();

  for (const category of categories) {
    const section = getConfigSection(category.system_config_category_id);

    if (!sectionsByKey.has(section.key)) {
      sectionsByKey.set(section.key, {
        ...section,
        categories: [],
        categoryCount: 0,
        activeValueCount: 0,
        inactiveValueCount: 0,
        totalValueCount: 0,
        visibleValueCount: 0
      });
    }

    const currentSection = sectionsByKey.get(section.key);
    currentSection.categories.push(category);
    currentSection.categoryCount += 1;
    currentSection.activeValueCount += category.activeValueCount;
    currentSection.inactiveValueCount += category.inactiveValueCount;
    currentSection.totalValueCount += category.totalValueCount;
    currentSection.visibleValueCount += category.visibleValueCount;
  }

  return Array.from(sectionsByKey.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

async function getConfigCategorySelectExpressions() {
  const categoryColumns = await getColumnSet('config_categories');

  return {
    categoryColumns,
    categoryLabelExpression: pickColumnExpression('cc', categoryColumns, ['label', 'name'], "CONCAT('Category #', cc.config_category_id)"),
    categoryDescriptionExpression: pickColumnExpression('cc', categoryColumns, ['description'], 'NULL'),
    categorySortExpression: pickColumnExpression('cc', categoryColumns, ['sort_order'], '0'),
    categoryActiveExpression: pickColumnExpression('cc', categoryColumns, ['is_active'], '1')
  };
}

async function getConfigValueSelectExpressions() {
  const valueColumns = await getColumnSet('config_values');

  return {
    valueColumns,
    valueLabelExpression: pickColumnExpression('cv', valueColumns, ['label', 'name'], "COALESCE(cv.value, CONCAT('Value #', cv.config_value_id))"),
    valueDescriptionExpression: pickColumnExpression('cv', valueColumns, ['description'], 'NULL'),
    valueValueExpression: pickColumnExpression('cv', valueColumns, ['value'], 'NULL'),
    valueSortExpression: pickColumnExpression('cv', valueColumns, ['sort_order'], '0'),
    valueActiveExpression: pickColumnExpression('cv', valueColumns, ['is_active'], '1'),
    valueProtectedExpression: pickColumnExpression('cv', valueColumns, ['is_protected'], '0')
  };
}

function normalizeConfigValueRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    isActive: isActiveRecord(row),
    isProtected: row.is_protected === true || row.is_protected === 1 || row.is_protected === '1'
  };
}

async function listConfigCategoriesWithValues(options = {}) {
  const includeInactiveValues = options.includeInactiveValues === true;
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();
  const {
    valueLabelExpression,
    valueDescriptionExpression,
    valueValueExpression,
    valueSortExpression,
    valueActiveExpression,
    valueProtectedExpression
  } = await getConfigValueSelectExpressions();

  const [categoryRows] = await pool.query(`
    SELECT
      cc.config_category_id,
      scc.system_config_category_id,
      ${categoryLabelExpression} AS label,
      ${categoryDescriptionExpression} AS description,
      ${categorySortExpression} AS sort_order,
      ${categoryActiveExpression} AS is_active
    FROM config_categories cc
    LEFT JOIN system_config_categories scc ON scc.config_category_id = cc.config_category_id
    ORDER BY sort_order, label, cc.config_category_id
  `);

  const [valueRows] = await pool.query(`
    SELECT
      cv.config_value_id,
      cv.config_category_id,
      scv.system_config_value_id,
      ${valueLabelExpression} AS label,
      ${valueDescriptionExpression} AS description,
      ${valueValueExpression} AS value,
      ${valueSortExpression} AS sort_order,
      ${valueActiveExpression} AS is_active,
      ${valueProtectedExpression} AS is_protected
    FROM config_values cv
    LEFT JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
    ORDER BY cv.config_category_id, sort_order, label, cv.config_value_id
  `);

  const valuesByCategoryId = new Map();

  for (const rawValue of valueRows) {
    const value = normalizeConfigValueRow(rawValue);

    if (!valuesByCategoryId.has(value.config_category_id)) {
      valuesByCategoryId.set(value.config_category_id, []);
    }

    valuesByCategoryId.get(value.config_category_id).push(value);
  }

  return categoryRows.map((category) => {
    const allValues = valuesByCategoryId.get(category.config_category_id) || [];
    const activeValues = allValues.filter((value) => value.isActive);
    const inactiveValues = allValues.filter((value) => !value.isActive);
    const visibleValues = includeInactiveValues ? allValues : activeValues;
    const section = getConfigSection(category.system_config_category_id);
    const orderingPolicy = getConfigCategoryOrderingPolicy(category.system_config_category_id, activeValues.length);

    return {
      ...category,
      sectionKey: section.key,
      sectionLabel: section.label,
      sectionDescription: section.description,
      isActive: isActiveRecord(category),
      values: visibleValues,
      activeValueCount: activeValues.length,
      inactiveValueCount: inactiveValues.length,
      totalValueCount: allValues.length,
      visibleValueCount: visibleValues.length,
      hiddenInactiveValueCount: includeInactiveValues ? 0 : inactiveValues.length,
      usesPopularitySorting: orderingPolicy.usesPopularitySorting,
      dragOrderingManaged: orderingPolicy.supportsDragOrdering,
      supportsDragOrdering: orderingPolicy.supportsDragOrdering && visibleValues.length >= 3
    };
  });
}

async function listConfigCategoriesForForm() {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();
  const { valueActiveExpression } = await getConfigValueSelectExpressions();

  const [rows] = await pool.query(`
    SELECT
      cc.config_category_id,
      scc.system_config_category_id,
      ${categoryLabelExpression} AS label,
      ${categoryDescriptionExpression} AS description,
      ${categorySortExpression} AS sort_order,
      ${categoryActiveExpression} AS is_active,
      (SELECT COUNT(*)
       FROM config_values cv
       WHERE cv.config_category_id = cc.config_category_id) AS total_value_count,
      (SELECT COUNT(*)
       FROM config_values cv
       WHERE cv.config_category_id = cc.config_category_id
         AND ${valueActiveExpression} = 1) AS active_value_count
    FROM config_categories cc
    LEFT JOIN system_config_categories scc ON scc.config_category_id = cc.config_category_id
    ORDER BY sort_order, label, cc.config_category_id
  `);

  return rows.map((row) => {
    const activeValueCount = Number(row.active_value_count || 0);
    const orderingPolicy = getConfigCategoryOrderingPolicy(row.system_config_category_id, activeValueCount);

    return {
      ...row,
      isActive: isActiveRecord(row),
      totalValueCount: Number(row.total_value_count || 0),
      activeValueCount,
      usesPopularitySorting: orderingPolicy.usesPopularitySorting,
      dragOrderingManaged: orderingPolicy.supportsDragOrdering
    };
  });
}

async function getConfigCategoryById(configCategoryId) {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();

  const [rows] = await pool.query(
    `
      SELECT
        cc.config_category_id,
        scc.system_config_category_id,
        ${categoryLabelExpression} AS label,
        ${categoryDescriptionExpression} AS description,
        ${categorySortExpression} AS sort_order,
        ${categoryActiveExpression} AS is_active
      FROM config_categories cc
      LEFT JOIN system_config_categories scc ON scc.config_category_id = cc.config_category_id
      WHERE cc.config_category_id = ?
      LIMIT 1
    `,
    [configCategoryId]
  );

  return rows[0]
    ? {
        ...rows[0],
        isActive: isActiveRecord(rows[0])
      }
    : null;
}

async function getConfigValueById(configValueId) {
  const {
    categoryLabelExpression,
    categoryDescriptionExpression,
    categorySortExpression,
    categoryActiveExpression
  } = await getConfigCategorySelectExpressions();
  const {
    valueLabelExpression,
    valueDescriptionExpression,
    valueValueExpression,
    valueSortExpression,
    valueActiveExpression,
    valueProtectedExpression
  } = await getConfigValueSelectExpressions();

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cv.config_category_id,
        scv.system_config_value_id,
        ${valueLabelExpression} AS label,
        ${valueDescriptionExpression} AS description,
        ${valueValueExpression} AS value,
        ${valueSortExpression} AS sort_order,
        ${valueActiveExpression} AS is_active,
        ${valueProtectedExpression} AS is_protected,
        scc.system_config_category_id,
        ${categoryLabelExpression} AS category_label,
        ${categoryDescriptionExpression} AS category_description,
        ${categorySortExpression} AS category_sort_order,
        ${categoryActiveExpression} AS category_is_active
      FROM config_values cv
      INNER JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      LEFT JOIN system_config_categories scc
        ON scc.config_category_id = cc.config_category_id
      LEFT JOIN system_config_values scv
        ON scv.config_value_id = cv.config_value_id
      WHERE cv.config_value_id = ?
      LIMIT 1
    `,
    [configValueId]
  );

  return normalizeConfigValueRow(rows[0]);
}

async function getNextConfigValueSortOrder(configCategoryId) {
  const valueColumns = await getColumnSet('config_values');

  if (!valueColumns.has('sort_order')) {
    return 0;
  }

  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order
     FROM config_values
     WHERE config_category_id = ?`,
    [configCategoryId]
  );

  return Number(rows[0]?.next_sort_order || 10);
}

async function createConfigValue({ configCategoryId, label, value, description, sortOrder, isActive }) {
  const valueColumns = await getColumnSet('config_values');
  const fields = ['config_category_id'];
  const values = [configCategoryId];

  if (valueColumns.has('code')) {
    fields.push('code');
    values.push(`legacy_${crypto.randomUUID().replace(/-/g, '')}`);
  }

  if (valueColumns.has('label')) {
    fields.push('label');
    values.push(label);
  }

  if (valueColumns.has('name')) {
    fields.push('name');
    values.push(label);
  }

  if (valueColumns.has('value')) {
    fields.push('value');
    values.push(value || null);
  }

  if (valueColumns.has('description')) {
    fields.push('description');
    values.push(description || null);
  }

  if (valueColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(sortOrder);
  }

  if (valueColumns.has('is_active')) {
    fields.push('is_active');
    values.push(isActive ? 1 : 0);
  }

  const placeholders = fields.map(() => '?').join(', ');
  const quotedFields = fields.map((field) => `\`${field}\``).join(', ');

  const [result] = await pool.query(
    `
      INSERT INTO config_values (${quotedFields})
      VALUES (${placeholders})
    `,
    values
  );

  return result.insertId;
}

async function updateConfigValue({ configValueId, configCategoryId, label, value, description, sortOrder, isActive }) {
  const valueColumns = await getColumnSet('config_values');
  const assignments = ['config_category_id = ?'];
  const values = [configCategoryId];

  if (valueColumns.has('label')) {
    assignments.push('label = ?');
    values.push(label);
  }

  if (valueColumns.has('name')) {
    assignments.push('name = ?');
    values.push(label);
  }

  if (valueColumns.has('value')) {
    assignments.push('value = ?');
    values.push(value || null);
  }

  if (valueColumns.has('description')) {
    assignments.push('description = ?');
    values.push(description || null);
  }

  if (valueColumns.has('sort_order')) {
    assignments.push('sort_order = ?');
    values.push(sortOrder);
  }

  if (valueColumns.has('is_active')) {
    assignments.push('is_active = ?');
    values.push(isActive ? 1 : 0);
  }

  values.push(configValueId);

  await pool.query(
    `
      UPDATE config_values
      SET ${assignments.join(', ')}
      WHERE config_value_id = ?
      LIMIT 1
    `,
    values
  );
}

function createConfigOrderingError(message, statusCode = 400, code = 'CONFIG_ORDER_INVALID') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeOrderedConfigValueIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = values
    .map((value) => Number.parseInt(String(value || '').trim(), 10))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  return Array.from(new Set(normalized));
}

async function reorderConfigValues({ configCategoryId, orderedConfigValueIds, includeInactiveValues = false }) {
  const categoryId = Number.parseInt(String(configCategoryId || '').trim(), 10);
  const submittedIds = normalizeOrderedConfigValueIds(orderedConfigValueIds);

  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    throw createConfigOrderingError('Choose a valid configuration category.');
  }

  const valueColumns = await getColumnSet('config_values');

  if (!valueColumns.has('sort_order')) {
    throw createConfigOrderingError('Configuration value ordering is not available for the current database schema.', 409, 'CONFIG_ORDER_UNAVAILABLE');
  }

  const hasActiveColumn = valueColumns.has('is_active');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [categoryRows] = await connection.query(
      `SELECT cc.config_category_id, scc.system_config_category_id
       FROM config_categories cc
       LEFT JOIN system_config_categories scc ON scc.config_category_id = cc.config_category_id
       WHERE cc.config_category_id = ?
       LIMIT 1
       FOR UPDATE`,
      [categoryId]
    );
    const category = categoryRows[0];

    if (!category) {
      throw createConfigOrderingError('The selected configuration category could not be found.', 404, 'CONFIG_CATEGORY_NOT_FOUND');
    }

    if (isPopularitySortedConfigCategory(category.system_config_category_id)) {
      throw createConfigOrderingError(
        'This list is ordered by operational popularity and cannot be manually reordered here.',
        409,
        'CONFIG_ORDER_POPULARITY_CONTROLLED'
      );
    }

    const activeSelect = hasActiveColumn ? 'is_active' : '1 AS is_active';
    const [valueRows] = await connection.query(
      `SELECT config_value_id, ${activeSelect}, sort_order
       FROM config_values
       WHERE config_category_id = ?
       ORDER BY sort_order, config_value_id
       FOR UPDATE`,
      [categoryId]
    );
    const reorderableRows = includeInactiveValues
      ? valueRows
      : valueRows.filter((row) => Number(row.is_active) === 1);

    if (reorderableRows.length < 3) {
      throw createConfigOrderingError(
        'Drag-and-drop ordering is available only for lists with at least three visible values.',
        409,
        'CONFIG_ORDER_TOO_FEW_VALUES'
      );
    }

    const expectedIds = reorderableRows.map((row) => Number(row.config_value_id));
    const expectedIdSet = new Set(expectedIds);
    const submittedIdSet = new Set(submittedIds);
    const hasExactValueSet = submittedIds.length === expectedIds.length
      && expectedIds.every((valueId) => submittedIdSet.has(valueId))
      && submittedIds.every((valueId) => expectedIdSet.has(valueId));

    if (!hasExactValueSet) {
      throw createConfigOrderingError(
        'This configuration list changed while it was being reordered. Reload the page and try again.',
        409,
        'CONFIG_ORDER_STALE'
      );
    }

    const submittedSet = new Set(submittedIds);
    const remainingRows = valueRows.filter((row) => !submittedSet.has(Number(row.config_value_id)));
    const fullOrderedIds = [...submittedIds, ...remainingRows.map((row) => Number(row.config_value_id))];

    const orderCases = fullOrderedIds.map(() => 'WHEN ? THEN ?').join(' ');
    const idPlaceholders = fullOrderedIds.map(() => '?').join(', ');
    const orderParams = fullOrderedIds.flatMap((valueId, index) => [valueId, (index + 1) * 10]);

    await connection.query(
      `UPDATE config_values
       SET sort_order = CASE config_value_id
         ${orderCases}
         ELSE sort_order
       END
       WHERE config_category_id = ?
         AND config_value_id IN (${idPlaceholders})`,
      [...orderParams, categoryId, ...fullOrderedIds]
    );

    await connection.commit();

    return {
      configCategoryId: categoryId,
      orderedConfigValueIds: submittedIds,
      updatedCount: fullOrderedIds.length
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setConfigValueActive(configValueId, isActive) {
  const valueColumns = await getColumnSet('config_values');

  if (!valueColumns.has('is_active')) {
    return;
  }

  await pool.query(
    `
      UPDATE config_values
      SET is_active = ?
      WHERE config_value_id = ?
      LIMIT 1
    `,
    [isActive ? 1 : 0, configValueId]
  );
}


async function listActiveLotRequirementsReferencingConfigValue(configValueId, limit = 8) {
  const requirementColumns = await getColumnSet('lot_requirements');
  if (!requirementColumns.has('lot_id')) return [];

  const referenceColumns = [
    'requirement_type_config_value_id',
    'comparison_operator_config_value_id',
    'requirement_config_value_id'
  ].filter((columnName) => requirementColumns.has(columnName));
  if (referenceColumns.length === 0) return [];

  const lotColumns = await getColumnSet('lots');
  const lotNameColumn = lotColumns.has('name') ? 'name' : lotColumns.has('lot_name') ? 'lot_name' : null;
  const lotNameExpression = lotNameColumn ? `l.\`${lotNameColumn}\`` : "CONCAT('Lot ', lr.lot_id)";
  const safeLimit = Number.isSafeInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), 25) : 8;
  const activeRequirementFilter = requirementColumns.has('is_active') ? 'AND lr.is_active = 1' : '';
  const referencePredicates = referenceColumns.map((columnName) => `lr.\`${columnName}\` = ?`).join(' OR ');
  const [rows] = await pool.query(
    `SELECT DISTINCT lr.lot_id, ${lotNameExpression} AS lot_name
     FROM lot_requirements lr
     LEFT JOIN lots l ON l.lot_id = lr.lot_id
     WHERE (${referencePredicates})
       ${activeRequirementFilter}
     ORDER BY lot_name, lr.lot_id
     LIMIT ${safeLimit}`,
    referenceColumns.map(() => configValueId)
  );
  return rows.map((row) => ({ lotId: Number(row.lot_id), lotName: row.lot_name || `Lot ${row.lot_id}` }));
}


async function listProcessorTypes({ includeInactive = false } = {}) {
  const [rows] = await pool.query(
    `
      SELECT
        pb.processor_brand_id,
        pb.code,
        pb.name,
        pb.is_active,
        (SELECT COUNT(*) FROM processor_models pm WHERE pm.processor_brand_id = pb.processor_brand_id) AS processor_count,
        (SELECT COUNT(*) FROM processor_families pf WHERE pf.processor_brand_id = pb.processor_brand_id) AS family_count,
        (
          SELECT COUNT(*)
          FROM unit_processor_catalog_requests upcr
          WHERE upcr.approved_processor_brand_id = pb.processor_brand_id
        ) AS approved_request_count
      FROM processor_brands pb
      WHERE (? = 1 OR pb.is_active = 1)
      ORDER BY pb.is_active DESC, pb.name, pb.code, pb.processor_brand_id
    `,
    [includeInactive ? 1 : 0]
  );

  return rows.map((row) => ({
    id: Number(row.processor_brand_id),
    code: row.code,
    name: row.name,
    isActive: Number(row.is_active) === 1,
    processorCount: Number(row.processor_count || 0),
    familyCount: Number(row.family_count || 0),
    approvedRequestCount: Number(row.approved_request_count || 0)
  }));
}

async function getProcessorTypeById(processorBrandId) {
  const [rows] = await pool.query(
    `
      SELECT
        pb.processor_brand_id,
        pb.code,
        pb.name,
        pb.is_active,
        (SELECT COUNT(*) FROM processor_models pm WHERE pm.processor_brand_id = pb.processor_brand_id) AS processor_count,
        (SELECT COUNT(*) FROM processor_families pf WHERE pf.processor_brand_id = pb.processor_brand_id) AS family_count,
        (
          SELECT COUNT(*)
          FROM unit_processor_catalog_requests upcr
          WHERE upcr.approved_processor_brand_id = pb.processor_brand_id
        ) AS approved_request_count
      FROM processor_brands pb
      WHERE pb.processor_brand_id = ?
      LIMIT 1
    `,
    [processorBrandId]
  );

  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: Number(row.processor_brand_id),
    code: row.code,
    name: row.name,
    isActive: Number(row.is_active) === 1,
    processorCount: Number(row.processor_count || 0),
    familyCount: Number(row.family_count || 0),
    approvedRequestCount: Number(row.approved_request_count || 0)
  };
}

async function processorTypeIdentityExists({ code, name, exceptProcessorBrandId = null }) {
  const params = [String(code || '').trim(), String(name || '').trim()];
  let exceptClause = '';
  if (exceptProcessorBrandId) {
    exceptClause = 'AND processor_brand_id <> ?';
    params.push(exceptProcessorBrandId);
  }

  const [rows] = await pool.query(
    `
      SELECT processor_brand_id, code, name
      FROM processor_brands
      WHERE (LOWER(TRIM(code)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?)))
        ${exceptClause}
      LIMIT 1
    `,
    params
  );
  return rows[0] || null;
}

async function createProcessorType({ code, name, isActive = true }) {
  const [result] = await pool.query(
    'INSERT INTO processor_brands (code, name, is_active) VALUES (?, ?, ?)',
    [code, name, isActive ? 1 : 0]
  );
  return Number(result.insertId);
}

async function updateProcessorType({ processorBrandId, code, name, isActive = true }) {
  await pool.query(
    `
      UPDATE processor_brands
      SET code = ?, name = ?, is_active = ?
      WHERE processor_brand_id = ?
      LIMIT 1
    `,
    [code, name, isActive ? 1 : 0, processorBrandId]
  );
}

async function setProcessorTypeActive(processorBrandId, isActive) {
  await pool.query(
    'UPDATE processor_brands SET is_active = ? WHERE processor_brand_id = ? LIMIT 1',
    [isActive ? 1 : 0, processorBrandId]
  );
}

async function deleteProcessorTypeIfUnused(processorBrandId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [brandRows] = await connection.query(
      'SELECT processor_brand_id, code, name, is_active FROM processor_brands WHERE processor_brand_id = ? LIMIT 1 FOR UPDATE',
      [processorBrandId]
    );
    if (!brandRows[0]) {
      await connection.rollback();
      return { deleted: false, notFound: true };
    }

    const [[processorUsage], [familyUsage], [requestUsage]] = await Promise.all([
      connection.query('SELECT COUNT(*) AS count FROM processor_models WHERE processor_brand_id = ?', [processorBrandId]),
      connection.query('SELECT COUNT(*) AS count FROM processor_families WHERE processor_brand_id = ?', [processorBrandId]),
      connection.query('SELECT COUNT(*) AS count FROM unit_processor_catalog_requests WHERE approved_processor_brand_id = ?', [processorBrandId])
    ]);
    const usage = {
      processorCount: Number(processorUsage[0]?.count || 0),
      familyCount: Number(familyUsage[0]?.count || 0),
      approvedRequestCount: Number(requestUsage[0]?.count || 0)
    };

    if (usage.processorCount || usage.familyCount) {
      await connection.rollback();
      return { deleted: false, inUse: true, usage };
    }

    if (usage.approvedRequestCount) {
      await connection.query(
        'UPDATE unit_processor_catalog_requests SET approved_processor_brand_id = NULL WHERE approved_processor_brand_id = ?',
        [processorBrandId]
      );
    }

    await connection.query('DELETE FROM processor_brands WHERE processor_brand_id = ? LIMIT 1', [processorBrandId]);
    await connection.commit();
    return { deleted: true, usage };
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function getConfigSummary() {
  const valueColumns = await getColumnSet('config_values');
  const valueActiveExpression = pickColumnExpression('cv', valueColumns, ['is_active'], '1');

  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM config_categories) AS category_count,
      COUNT(*) AS value_count,
      SUM(CASE WHEN ${valueActiveExpression} = 1 THEN 1 ELSE 0 END) AS active_value_count,
      SUM(CASE WHEN ${valueActiveExpression} = 1 THEN 0 ELSE 1 END) AS inactive_value_count
    FROM config_values cv
  `);

  return {
    categoryCount: Number(rows[0].category_count || 0),
    valueCount: Number(rows[0].value_count || 0),
    activeValueCount: Number(rows[0].active_value_count || 0),
    inactiveValueCount: Number(rows[0].inactive_value_count || 0)
  };
}

module.exports = {
  listConfigCategoriesWithValues,
  listConfigCategoriesForForm,
  getConfigCategoryById,
  getConfigValueById,
  getNextConfigValueSortOrder,
  createConfigValue,
  updateConfigValue,
  reorderConfigValues,
  setConfigValueActive,
  listActiveLotRequirementsReferencingConfigValue,
  listProcessorTypes,
  getProcessorTypeById,
  processorTypeIdentityExists,
  createProcessorType,
  updateProcessorType,
  setProcessorTypeActive,
  deleteProcessorTypeIfUnused,
  getConfigSummary,
  groupConfigCategories
};
