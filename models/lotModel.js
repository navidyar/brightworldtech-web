const crypto = require('crypto');
const { pool } = require('./db');
const productionWeightModel = require('./productionWeightModel');
const { getConfigValueIdBySystemId, listConfigValuesBySystemCategoryIds } = require('./configLookupModel');
const {
  POLICY_KEY_BY_SYSTEM_VALUE_ID,
  OPERATOR_KEY_BY_SYSTEM_VALUE_ID,
  REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID,
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS,
  SYSTEM_VALUE_ID_BY_OPERATOR_KEY,
  SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY
} = require('../config/configIdentityRegistry');
const productionWeightSyncModel = require('./productionWeightSyncModel');
const { parseRequiredLotProductionWeight } = require('../services/lotProductionWeightPolicy');
const { getNewLotInitialActiveValue } = require('../services/lotCreationPolicy');
const {
  buildRequirementPolicyOptions
} = require('../config/lotRequirementPolicyRegistry');
const {
  normalizeOperatorCode,
  normalizeRequirementKey
} = require('../config/lotRequirementRegistry');
const {
  VALUE_COLUMN_NAMES,
  buildRequirementValuePayload,
  getRequirementValueToken
} = require('../services/lotRequirementPersistence');
const { buildEffectiveLotRequirements } = require('../services/lotRequirementInheritance');
const { normalizeCosmeticGradeOptions } = require('../services/cosmeticGradeNormalization');
const { buildLotExportScope } = require('../services/lotExportScope');
const {
  collectDescendantLotIds,
  assertValidLotParentAssignment,
  auditLotHierarchy
} = require('../services/lotHierarchyIntegrity');

const INSPECTABLE_TABLES = [
  'lots',
  'units',
  'lot_requirements',
  'config_categories',
  'config_values',
  'lot_unit_form_field_rules',
  'lot_requirement_inheritance_suppressions'
];

async function getColumnSet(tableName) {
  if (!INSPECTABLE_TABLES.includes(tableName)) {
    throw new Error(`Unsupported table for column inspection: ${tableName}`);
  }

  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME AS columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.columnName));
}

function hasColumn(columns, columnName) {
  return columns.has(columnName);
}

function pickColumn(columns, candidates) {
  return candidates.find((columnName) => columns.has(columnName)) || null;
}

function selectExpression(tableAlias, columns, candidates, outputAlias, fallbackExpression = 'NULL') {
  const columnName = pickColumn(columns, candidates);
  const expression = columnName ? `${tableAlias}.\`${columnName}\`` : fallbackExpression;

  return `${expression} AS \`${outputAlias}\``;
}

function buildProgress(unitCount, unitGoal) {
  const normalizedUnitCount = Number(unitCount || 0);
  const normalizedGoal = Number(unitGoal || 0);

  if (!normalizedGoal || normalizedGoal <= 0) {
    return {
      unitCount: normalizedUnitCount,
      unitGoal: null,
      progressPercent: null,
      isFull: false,
      isUnlimited: true
    };
  }

  const progressPercent = Math.min(100, Math.round((normalizedUnitCount / normalizedGoal) * 100));

  return {
    unitCount: normalizedUnitCount,
    unitGoal: normalizedGoal,
    progressPercent,
    isFull: normalizedUnitCount >= normalizedGoal,
    isUnlimited: false
  };
}

function generateLotCode(lotName) {
  const normalizedName = String(lotName || 'LOT')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 14) || 'LOT';

  const today = new Date();
  const datePart = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('');

  const randomPart = crypto.randomInt(1000, 9999);

  return `${normalizedName}-${datePart}-${randomPart}`;
}

async function generateNextLotNumber(queryable = pool) {
  const [rows] = await queryable.query(`
    SELECT
      COALESCE(MAX(CAST(lot_number AS UNSIGNED)), 1000) + 1 AS next_lot_number
    FROM lots
    WHERE lot_number REGEXP '^[0-9]+$'
  `);

  return String(rows[0]?.next_lot_number || 1001);
}

async function listConfigValuesForSystemCategory(systemConfigCategoryId) {
  const values = await listConfigValuesBySystemCategoryIds(systemConfigCategoryId, { includeInactive: true });
  const categoryColumns = await getColumnSet('config_categories');
  const categoryLabelSelect = selectExpression(
    'cc',
    categoryColumns,
    ['label', 'name'],
    'category_label',
    "CONCAT('Category #', cc.config_category_id)"
  );
  const [rows] = await pool.query(
    `SELECT cc.config_category_id, scc.system_config_category_id,
            ${categoryLabelSelect}
     FROM system_config_categories scc
     INNER JOIN config_categories cc ON cc.config_category_id = scc.config_category_id
     WHERE scc.system_config_category_id = ?
     LIMIT 1`,
    [systemConfigCategoryId]
  );
  const categoryRow = rows[0] || null;
  return {
    category: categoryRow ? {
      config_category_id: Number(categoryRow.config_category_id),
      system_config_category_id: Number(categoryRow.system_config_category_id),
      label: categoryRow.category_label
    } : null,
    values: values.map((value) => ({
      config_value_id: value.configValueId,
      system_config_value_id: value.systemConfigValueId,
      label: value.label,
      value: value.value,
      sort_order: value.sortOrder,
      is_active: value.isActive ? 1 : 0,
      is_protected: value.isProtected ? 1 : 0
    }))
  };
}

async function findConfigValueIdBySystemId(systemConfigValueId, connection = pool) {
  return getConfigValueIdBySystemId(systemConfigValueId, connection);
}

async function getDefaultLotStatusConfigValueId() {
  return findConfigValueIdBySystemId(SYSTEM_CONFIG_VALUE_IDS.LOT_STATUS_DEFAULT);
}

async function listLotHierarchyRows(queryable = pool, options = {}) {
  const lotColumns = await getColumnSet('lots');

  if (!hasColumn(lotColumns, 'lot_id') || !hasColumn(lotColumns, 'parent_lot_id')) {
    return [];
  }

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    'Unnamed Lot'
  );
  const isActiveSelect = selectExpression('l', lotColumns, ['is_active'], 'is_active', '1');
  const lockClause = options.forUpdate === true ? ' FOR UPDATE' : '';
  const [rows] = await queryable.query(
    `SELECT l.lot_id, l.parent_lot_id, ${lotNameSelect}, ${isActiveSelect}
     FROM lots l
     ORDER BY l.lot_id${lockClause}`
  );

  return rows;
}

async function listDescendantLotIds(lotId) {
  const hierarchyRows = await listLotHierarchyRows();
  return collectDescendantLotIds(hierarchyRows, lotId);
}

async function getLotHierarchyAudit() {
  return auditLotHierarchy(await listLotHierarchyRows());
}

async function listParentLotOptions(options = {}) {
  const lotColumns = await getColumnSet('lots');
  const includeLotIds = Array.isArray(options.includeLotIds)
    ? options.includeLotIds
        .map((lotId) => Number(lotId))
        .filter((lotId) => Number.isInteger(lotId) && lotId > 0)
    : [];
  const excludeLotIds = Array.isArray(options.excludeLotIds)
    ? Array.from(new Set(options.excludeLotIds
        .map((lotId) => Number(lotId))
        .filter((lotId) => Number.isInteger(lotId) && lotId > 0)))
    : [];

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    'Unnamed Lot'
  );

  const lotCodeSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_code', 'code', 'lot_number'],
    'lot_code',
    'NULL'
  );

  const isActiveSelect = selectExpression(
    'l',
    lotColumns,
    ['is_active'],
    'is_active',
    '1'
  );

  const isClosedSelect = selectExpression(
    'l',
    lotColumns,
    ['is_closed'],
    'is_closed',
    '0'
  );

  const hasLotIsActive = hasColumn(lotColumns, 'is_active');
  const hasLotIsClosed = hasColumn(lotColumns, 'is_closed');
  const operationalWhereParts = [];

  if (hasLotIsActive) {
    operationalWhereParts.push('l.is_active = 1');
  }

  if (hasLotIsClosed) {
    operationalWhereParts.push('COALESCE(l.is_closed, 0) = 0');
  }

  const operationalWhere = operationalWhereParts.length > 0
    ? operationalWhereParts.join(' AND ')
    : '1 = 1';
  const operationalSelection = includeLotIds.length > 0
    ? `((${operationalWhere}) OR l.lot_id IN (${includeLotIds.map(() => '?').join(', ')}))`
    : `(${operationalWhere})`;
  const exclusionWhere = excludeLotIds.length > 0
    ? ` AND l.lot_id NOT IN (${excludeLotIds.map(() => '?').join(', ')})`
    : '';
  const isActiveWhere = `WHERE ${operationalSelection}${exclusionWhere}`;
  const queryParams = [...includeLotIds, ...excludeLotIds];

  const orderExpression = pickColumn(lotColumns, ['lot_name', 'name', 'title'])
    ? 'lot_name, l.lot_id'
    : 'l.lot_id DESC';

  const [rows] = await pool.query(`
    SELECT
      l.lot_id,
      ${lotNameSelect},
      ${lotCodeSelect},
      ${isActiveSelect},
      ${isClosedSelect}
    FROM lots l
    ${isActiveWhere}
    ORDER BY ${orderExpression}
    LIMIT 250
  `, queryParams);

  return rows;
}

async function getLotSchemaCapabilities() {
  const lotColumns = await getColumnSet('lots');

  return {
    hasParentLotId: hasColumn(lotColumns, 'parent_lot_id'),
    hasLotType: hasColumn(lotColumns, 'lot_type_config_value_id'),
    hasLotStatus: hasColumn(lotColumns, 'lot_status_config_value_id'),
    hasRequirementPolicy: hasColumn(lotColumns, 'requirement_policy_config_value_id'),
    hasLotNumber: hasColumn(lotColumns, 'lot_number'),
    hasDefaultGrade: hasColumn(lotColumns, 'default_grade_config_value_id'),
    hasDefaultProductionWeightConfigValueId: hasColumn(lotColumns, 'default_production_weight_config_value_id'),
    hasDefaultProductionWeight: hasColumn(lotColumns, 'default_production_weight'),
    hasUnitAmountGoal: Boolean(pickColumn(lotColumns, ['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'])),
    hasDeadline: Boolean(pickColumn(lotColumns, ['deadline', 'deadline_date', 'due_date'])),
    hasObjectives: Boolean(pickColumn(lotColumns, ['objectives', 'objective'])),
    hasNotes: Boolean(pickColumn(lotColumns, ['notes', 'note'])),
    hasLabelFormat: hasColumn(lotColumns, 'label_format'),
    hasClosedState: hasColumn(lotColumns, 'is_closed'),
    hasAssignableState: hasColumn(lotColumns, 'is_assignable'),
    hasDuplicateUnitAssumption: hasColumn(lotColumns, 'allow_duplicate_unit_assumption'),
    hasStartNewProductionCycleOnMove: hasColumn(lotColumns, 'start_new_production_cycle_on_move')
  };
}

async function getLotFormOptions(options = {}) {
  const includeParentLotIds = Array.isArray(options.includeParentLotIds)
    ? options.includeParentLotIds
    : [];
  const currentLotId = Number(options.currentLotId);
  const excludedParentLotIds = Number.isInteger(currentLotId) && currentLotId > 0
    ? [currentLotId, ...await listDescendantLotIds(currentLotId)]
    : [];

  const [
    capabilities,
    lotTypeResult,
    requirementPolicyResult,
    gradeResult,
    productionWeightOptions,
    parentLots
  ] = await Promise.all([
    getLotSchemaCapabilities(),
    listConfigValuesForSystemCategory(SYSTEM_CONFIG_CATEGORY_IDS.LOT_TYPES),
    listConfigValuesForSystemCategory(SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES),
    listConfigValuesForSystemCategory(SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES),
    productionWeightModel.listProductionWeightOptions(),
    listParentLotOptions({ includeLotIds: includeParentLotIds, excludeLotIds: excludedParentLotIds })
  ]);

  return {
    capabilities,
    lotTypes: lotTypeResult.values,
    lotTypeCategory: lotTypeResult.category,
    requirementPolicies: buildRequirementPolicyOptions(requirementPolicyResult.values),
    requirementPolicyCategory: requirementPolicyResult.category,
    grades: normalizeCosmeticGradeOptions(
      gradeResult.values
    ),
    gradeCategory: gradeResult.category,
    productionWeightOptions,
    parentLots,
    excludedParentLotIds
  };
}

async function listLots(options = {}) {
  const includeHidden = options.includeHidden === true;
  const db = options.connection || pool;
  const lotColumns = await getColumnSet('lots');
  const unitColumns = await getColumnSet('units');
  const lotRequirementColumns = await getColumnSet('lot_requirements');

  const hasLotType = hasColumn(lotColumns, 'lot_type_config_value_id');
  const hasLotStatus = hasColumn(lotColumns, 'lot_status_config_value_id');
  const hasRequirementPolicy = hasColumn(lotColumns, 'requirement_policy_config_value_id');
  const hasDefaultGrade = hasColumn(lotColumns, 'default_grade_config_value_id');
  const hasDefaultProductionWeightConfigValueId = hasColumn(lotColumns, 'default_production_weight_config_value_id');
  const hasDefaultProductionWeight = hasColumn(lotColumns, 'default_production_weight');
  const hasUnitsLotId = hasColumn(unitColumns, 'lot_id');
  const hasRequirementsLotId = hasColumn(lotRequirementColumns, 'lot_id');
  const lotVisibilityWhere = hasColumn(lotColumns, 'is_active') && !includeHidden
    ? 'WHERE l.is_active = 1'
    : '';

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    'Unnamed Lot'
  );

  const lotNumberSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_number'],
    'lot_number',
    'NULL'
  );

  const lotCodeSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_code', 'code', 'lot_number'],
    'lot_code',
    'NULL'
  );

  const parentLotIdSelect = selectExpression(
    'l',
    lotColumns,
    ['parent_lot_id'],
    'parent_lot_id',
    'NULL'
  );

  const unitGoalSelect = selectExpression(
    'l',
    lotColumns,
    ['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'],
    'unit_amount_goal',
    'NULL'
  );

  const deadlineSelect = selectExpression(
    'l',
    lotColumns,
    ['deadline', 'deadline_date', 'due_date'],
    'deadline',
    'NULL'
  );

  const objectivesSelect = selectExpression(
    'l',
    lotColumns,
    ['objectives', 'objective'],
    'objectives',
    'NULL'
  );

  const notesSelect = selectExpression(
    'l',
    lotColumns,
    ['notes', 'note'],
    'notes',
    'NULL'
  );

  const labelFormatSelect = selectExpression(
    'l',
    lotColumns,
    ['label_format'],
    'label_format',
    'NULL'
  );

  const isActiveSelect = selectExpression(
    'l',
    lotColumns,
    ['is_active'],
    'is_active',
    '1'
  );

  const isClosedSelect = selectExpression(
    'l',
    lotColumns,
    ['is_closed'],
    'is_closed',
    '0'
  );

  const isAssignableSelect = selectExpression(
    'l',
    lotColumns,
    ['is_assignable'],
    'is_assignable',
    'NULL'
  );

  const allowDuplicateUnitAssumptionSelect = selectExpression(
    'l',
    lotColumns,
    ['allow_duplicate_unit_assumption'],
    'allow_duplicate_unit_assumption',
    '0'
  );

  const startNewProductionCycleOnMoveSelect = selectExpression(
    'l',
    lotColumns,
    ['start_new_production_cycle_on_move'],
    'start_new_production_cycle_on_move',
    '0'
  );

  const createdAtSelect = selectExpression(
    'l',
    lotColumns,
    ['created_at'],
    'created_at',
    'NULL'
  );

  const updatedAtSelect = selectExpression(
    'l',
    lotColumns,
    ['updated_at'],
    'updated_at',
    'NULL'
  );

  const lotTypeJoin = hasLotType
    ? `
      LEFT JOIN config_values lot_type
        ON lot_type.config_value_id = l.lot_type_config_value_id
    `
    : '';

  const lotStatusJoin = hasLotStatus
    ? `
      LEFT JOIN config_values lot_status
        ON lot_status.config_value_id = l.lot_status_config_value_id
      LEFT JOIN system_config_values lot_status_system
        ON lot_status_system.config_value_id = lot_status.config_value_id
    `
    : '';

  const requirementPolicyJoin = hasRequirementPolicy
    ? `
      LEFT JOIN config_values requirement_policy
        ON requirement_policy.config_value_id = l.requirement_policy_config_value_id
      LEFT JOIN system_config_values requirement_policy_system
        ON requirement_policy_system.config_value_id = requirement_policy.config_value_id
    `
    : '';

  const defaultGradeJoin = hasDefaultGrade
    ? `
      LEFT JOIN config_values default_grade
        ON default_grade.config_value_id = l.default_grade_config_value_id
    `
    : '';

  const defaultProductionWeightJoin = hasDefaultProductionWeightConfigValueId
    ? `
      LEFT JOIN config_values default_production_weight_value
        ON default_production_weight_value.config_value_id = l.default_production_weight_config_value_id
    `
    : '';

  const unitCountJoin = hasUnitsLotId
    ? `
      LEFT JOIN (
        SELECT
          lot_id,
          COUNT(*) AS unit_count
        FROM units
        GROUP BY lot_id
      ) unit_counts
        ON unit_counts.lot_id = l.lot_id
    `
    : '';

  const requirementCountJoin = hasRequirementsLotId
    ? `
      LEFT JOIN (
        SELECT
          lot_id,
          COUNT(*) AS requirement_count
        FROM lot_requirements
        GROUP BY lot_id
      ) requirement_counts
        ON requirement_counts.lot_id = l.lot_id
    `
    : '';

  const lotTypeLabelSelect = hasLotType
    ? "COALESCE(lot_type.label, lot_type.value, CONCAT('Value #', lot_type.config_value_id)) AS lot_type_label"
    : 'NULL AS lot_type_label';

  const lotStatusLabelSelect = hasLotStatus
    ? "COALESCE(lot_status.label, lot_status.value, CONCAT('Value #', lot_status.config_value_id)) AS lot_status_label"
    : 'NULL AS lot_status_label';

  const lotStatusCodeSelect = hasLotStatus
    ? 'lot_status_system.system_config_value_id AS lot_status_system_config_value_id'
    : 'NULL AS lot_status_system_config_value_id';

  const requirementPolicyLabelSelect = hasRequirementPolicy
    ? "COALESCE(requirement_policy.label, requirement_policy.value, CONCAT('Value #', requirement_policy.config_value_id)) AS requirement_policy_label"
    : 'NULL AS requirement_policy_label';

  const requirementPolicyCodeSelect = hasRequirementPolicy
    ? 'requirement_policy_system.system_config_value_id AS requirement_policy_system_config_value_id'
    : 'NULL AS requirement_policy_system_config_value_id';

  const defaultGradeLabelSelect = hasDefaultGrade
    ? "COALESCE(default_grade.label, default_grade.value, CONCAT('Value #', default_grade.config_value_id)) AS default_grade_label"
    : 'NULL AS default_grade_label';

  const defaultProductionWeightLabelSelect = hasDefaultProductionWeightConfigValueId
    ? "COALESCE(default_production_weight_value.label, default_production_weight_value.value, CONCAT('Value #', default_production_weight_value.config_value_id)) AS default_production_weight_label"
    : 'NULL AS default_production_weight_label';

  const defaultProductionWeightConfigValueIdSelect = hasDefaultProductionWeightConfigValueId
    ? 'l.default_production_weight_config_value_id AS default_production_weight_config_value_id'
    : 'NULL AS default_production_weight_config_value_id';

  const defaultProductionWeightSelect = hasDefaultProductionWeight
    ? 'l.default_production_weight AS default_production_weight'
    : 'NULL AS default_production_weight';

  const resolvedDefaultProductionWeightSelect = hasDefaultProductionWeight && hasDefaultProductionWeightConfigValueId
    ? 'COALESCE(l.default_production_weight, CAST(default_production_weight_value.value AS DECIMAL(20,2))) AS resolved_default_production_weight'
    : hasDefaultProductionWeight
      ? 'l.default_production_weight AS resolved_default_production_weight'
      : hasDefaultProductionWeightConfigValueId
        ? 'CAST(default_production_weight_value.value AS DECIMAL(20,2)) AS resolved_default_production_weight'
        : 'NULL AS resolved_default_production_weight';

  const lotTypeConfigValueIdSelect = hasLotType
    ? 'l.lot_type_config_value_id AS lot_type_config_value_id'
    : 'NULL AS lot_type_config_value_id';

  const requirementPolicyConfigValueIdSelect = hasRequirementPolicy
    ? 'l.requirement_policy_config_value_id AS requirement_policy_config_value_id'
    : 'NULL AS requirement_policy_config_value_id';

  const defaultGradeConfigValueIdSelect = hasDefaultGrade
    ? 'l.default_grade_config_value_id AS default_grade_config_value_id'
    : 'NULL AS default_grade_config_value_id';

  const unitCountSelect = hasUnitsLotId
    ? 'COALESCE(unit_counts.unit_count, 0) AS unit_count'
    : '0 AS unit_count';

  const requirementCountSelect = hasRequirementsLotId
    ? 'COALESCE(requirement_counts.requirement_count, 0) AS requirement_count'
    : '0 AS requirement_count';

  const orderExpression = hasColumn(lotColumns, 'created_at')
    ? 'l.created_at DESC, l.lot_id DESC'
    : 'l.lot_id DESC';

  const [rows] = await db.query(`
    SELECT
      l.lot_id,
      ${parentLotIdSelect},
      ${lotNameSelect},
      ${lotNumberSelect},
      ${lotCodeSelect},
      ${lotTypeLabelSelect},
      ${lotStatusLabelSelect},
      ${lotStatusCodeSelect},
      ${requirementPolicyLabelSelect},
      ${requirementPolicyCodeSelect},
      ${defaultGradeLabelSelect},
      ${defaultProductionWeightLabelSelect},
      ${defaultProductionWeightConfigValueIdSelect},
      ${defaultProductionWeightSelect},
      ${resolvedDefaultProductionWeightSelect},
      ${lotTypeConfigValueIdSelect},
      ${requirementPolicyConfigValueIdSelect},
      ${defaultGradeConfigValueIdSelect},
      ${unitGoalSelect},
      ${deadlineSelect},
      ${objectivesSelect},
      ${notesSelect},
      ${labelFormatSelect},
      ${isActiveSelect},
      ${isClosedSelect},
      ${isAssignableSelect},
      ${allowDuplicateUnitAssumptionSelect},
      ${startNewProductionCycleOnMoveSelect},
      ${createdAtSelect},
      ${updatedAtSelect},
      ${unitCountSelect},
      ${requirementCountSelect}
    FROM lots l
    ${lotTypeJoin}
    ${lotStatusJoin}
    ${requirementPolicyJoin}
    ${defaultGradeJoin}
    ${defaultProductionWeightJoin}
    ${unitCountJoin}
    ${requirementCountJoin}
    ${lotVisibilityWhere}
    ORDER BY ${orderExpression}
    LIMIT 250
  `);

  const hierarchyRows = await listLotHierarchyRows(db);
  const directUnitCounts = new Map(rows.map((row) => [Number(row.lot_id), Number(row.unit_count || 0)]));

  if (hasUnitsLotId) {
    const [allUnitCountRows] = await db.query(`
      SELECT lot_id, COUNT(*) AS unit_count
      FROM units
      WHERE lot_id IS NOT NULL
      GROUP BY lot_id
    `);
    allUnitCountRows.forEach((row) => directUnitCounts.set(Number(row.lot_id), Number(row.unit_count || 0)));
  }

  const descendantIdsByLotId = new Map(
    hierarchyRows.map((hierarchyLot) => [
      Number(hierarchyLot.lot_id),
      collectDescendantLotIds(hierarchyRows, hierarchyLot.lot_id)
    ])
  );

  return rows.map((row) => {
    const directUnitCount = Number(row.unit_count || 0);
    const descendantUnitCount = (descendantIdsByLotId.get(Number(row.lot_id)) || [])
      .reduce((sum, descendantLotId) => sum + Number(directUnitCounts.get(Number(descendantLotId)) || 0), directUnitCount);
    const progress = buildProgress(directUnitCount, row.unit_amount_goal);

    return {
      ...row,
      lot_status_code: null,
      requirement_policy_code: POLICY_KEY_BY_SYSTEM_VALUE_ID[Number(row.requirement_policy_system_config_value_id || 0)] || '',
      directUnitCount,
      descendantUnitCount,
      ...progress
    };
  });
}


async function getLotExportScope(lotId, mode = 'direct') {
  const normalizedLotId = Number(lotId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0) {
    return null;
  }

  const lotColumns = await getColumnSet('lots');

  if (!hasColumn(lotColumns, 'lot_id') || !hasColumn(lotColumns, 'parent_lot_id')) {
    return null;
  }

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    "CONCAT('Lot ', l.lot_id)"
  );
  const isActiveSelect = selectExpression('l', lotColumns, ['is_active'], 'is_active', '1');
  const [rows] = await pool.query(`
    SELECT
      l.lot_id,
      l.parent_lot_id,
      ${lotNameSelect},
      ${isActiveSelect}
    FROM lots l
    ORDER BY l.lot_id
  `);

  return buildLotExportScope(normalizedLotId, rows, mode);
}

async function getLotById(lotId, connection = null) {
  const lots = await listLots({ includeHidden: true, connection });
  return lots.find((lot) => Number(lot.lot_id) === Number(lotId)) || null;
}

async function getLotSummary() {
  const lots = await listLots({ includeHidden: true });

  const activeLots = lots.filter((lot) => Number(lot.is_active) === 1);
  const hiddenLots = lots.filter((lot) => Number(lot.is_active) !== 1);
  const closedLots = lots.filter((lot) => Number(lot.is_closed) === 1);
  const fullLots = lots.filter((lot) => lot.isFull);
  const unlimitedLots = lots.filter((lot) => lot.isUnlimited);

  const totalUnits = lots.reduce((sum, lot) => sum + Number(lot.unitCount || 0), 0);
  const totalRequirements = lots.reduce((sum, lot) => sum + Number(lot.requirement_count || 0), 0);

  return {
    lotCount: lots.length,
    activeLotCount: activeLots.length,
    hiddenLotCount: hiddenLots.length,
    closedLotCount: closedLots.length,
    fullLotCount: fullLots.length,
    unlimitedLotCount: unlimitedLots.length,
    totalUnits,
    totalRequirements
  };
}

async function createLot(formData, currentUserId, options = {}) {
  const db = options.connection || pool;
  const lotColumns = await getColumnSet('lots');

  const columns = [];
  const placeholders = [];
  const values = [];

  function addColumn(columnName, value) {
    if (!hasColumn(lotColumns, columnName)) {
      return;
    }

    columns.push(`\`${columnName}\``);
    placeholders.push('?');
    values.push(value);
  }

  function addFirstAvailableColumn(candidateColumns, value) {
    const columnName = pickColumn(lotColumns, candidateColumns);

    if (!columnName) {
      return;
    }

    addColumn(columnName, value);
  }

  const lotName = String(formData.lotName || '').trim();
  const lotCode = generateLotCode(lotName);
  const parentLotId = formData.parentLotId ? Number(formData.parentLotId) : null;
  const lotTypeConfigValueId = formData.lotTypeConfigValueId ? Number(formData.lotTypeConfigValueId) : null;
  const requirementPolicyConfigValueId = formData.requirementPolicyConfigValueId
    ? Number(formData.requirementPolicyConfigValueId)
    : null;
  const defaultGradeConfigValueId = formData.defaultGradeConfigValueId ? Number(formData.defaultGradeConfigValueId) : null;
  const customDefaultProductionWeight = parseRequiredLotProductionWeight(formData.defaultProductionWeight);
  const defaultProductionWeightPayload = formData.defaultProductionWeightConfigValueId
    ? await productionWeightModel.getProductionWeightPayloadFromConfigValueId(formData.defaultProductionWeightConfigValueId)
    : { configValueId: null, weightValue: customDefaultProductionWeight };
  if (hasColumn(lotColumns, 'default_production_weight') && defaultProductionWeightPayload.weightValue === null) {
    throw new Error('Lot production weight is required and must be at least 0.10.');
  }
  const hasUnlimitedGoal = formData.hasUnlimitedGoal === '1';
  const unitAmountGoal = hasUnlimitedGoal ? null : Number(formData.unitAmountGoal || 0);
  const deadline = formData.deadline ? String(formData.deadline).trim() : null;
  const objectives = String(formData.objectives || '').trim() || null;
  const notes = String(formData.notes || '').trim() || null;
  const labelFormat = String(formData.labelFormat || '').trim() || null;
  const allowDuplicateUnitAssumption = formData.allowDuplicateUnitAssumption === '1' ? 1 : 0;
  const startNewProductionCycleOnMove = formData.startNewProductionCycleOnMove === '1' ? 1 : 0;
  const isAssignable = formData.isAssignable === '1' ? 1 : 0;

  if (hasColumn(lotColumns, 'lot_number')) {
    const nextLotNumber = await generateNextLotNumber(db);
    addColumn('lot_number', nextLotNumber);
  }

  addFirstAvailableColumn(['lot_name', 'name', 'title'], lotName);
  addFirstAvailableColumn(['lot_code', 'code'], lotCode);
  addColumn('parent_lot_id', parentLotId);
  addColumn('lot_type_config_value_id', lotTypeConfigValueId);

  if (hasColumn(lotColumns, 'lot_status_config_value_id')) {
    const lotStatusConfigValueId = await getDefaultLotStatusConfigValueId();

    if (!lotStatusConfigValueId) {
      throw new Error(
        'Cannot create lot because lots.lot_status_config_value_id is required, but no config value was found in lot_statuses or lot_status. Add a config value such as active, open, created, new, or pending.'
      );
    }

    addColumn('lot_status_config_value_id', lotStatusConfigValueId);
  }

  if (hasColumn(lotColumns, 'requirement_policy_config_value_id')) {
    if (!requirementPolicyConfigValueId) {
      throw new Error('Requirement enforcement policy is required when creating a Lot.');
    }

    addColumn('requirement_policy_config_value_id', requirementPolicyConfigValueId);
  }

  addFirstAvailableColumn(['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'], unitAmountGoal);
  addColumn('default_grade_config_value_id', defaultGradeConfigValueId);
  addColumn('default_production_weight_config_value_id', defaultProductionWeightPayload.configValueId);
  addColumn('default_production_weight', defaultProductionWeightPayload.weightValue);
  addFirstAvailableColumn(['deadline', 'deadline_date', 'due_date'], deadline);
  addFirstAvailableColumn(['objectives', 'objective'], objectives);
  addFirstAvailableColumn(['notes', 'note'], notes);
  addColumn('label_format', labelFormat);
  addColumn('allow_duplicate_unit_assumption', allowDuplicateUnitAssumption);
  addColumn('start_new_production_cycle_on_move', startNewProductionCycleOnMove);
  addColumn('is_assignable', isAssignable);

  if (!hasColumn(lotColumns, 'is_active')) {
    throw new Error(
      'Cannot create a Lot safely because lots.is_active is required to keep new Lots hidden until they are manually unhidden.'
    );
  }

  addColumn('is_active', getNewLotInitialActiveValue());
  addColumn('created_by_user_id', currentUserId || null);
  addColumn('updated_by_user_id', currentUserId || null);

  if (columns.length === 0) {
    throw new Error('No compatible lot columns were found for creating a lot.');
  }

  const [result] = await db.query(
    `
      INSERT INTO lots (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
    `,
    values
  );

  return {
    lotId: result.insertId,
    lotCode
  };
}


async function updateLot(lotId, formData, currentUserId) {
  const lotColumns = await getColumnSet('lots');
  const assignments = [];
  const values = [];

  function addColumn(columnName, value) {
    if (!hasColumn(lotColumns, columnName)) {
      return;
    }

    assignments.push(`\`${columnName}\` = ?`);
    values.push(value);
  }

  function addFirstAvailableColumn(candidateColumns, value) {
    const columnName = pickColumn(lotColumns, candidateColumns);

    if (!columnName) {
      return;
    }

    addColumn(columnName, value);
  }

  const lotName = String(formData.lotName || '').trim();
  const parentLotId = formData.parentLotId ? Number(formData.parentLotId) : null;
  const lotTypeConfigValueId = formData.lotTypeConfigValueId ? Number(formData.lotTypeConfigValueId) : null;
  const requirementPolicyConfigValueId = formData.requirementPolicyConfigValueId
    ? Number(formData.requirementPolicyConfigValueId)
    : null;
  const defaultGradeConfigValueId = formData.defaultGradeConfigValueId ? Number(formData.defaultGradeConfigValueId) : null;
  const customDefaultProductionWeight = parseRequiredLotProductionWeight(formData.defaultProductionWeight);
  const defaultProductionWeightPayload = formData.defaultProductionWeightConfigValueId
    ? await productionWeightModel.getProductionWeightPayloadFromConfigValueId(formData.defaultProductionWeightConfigValueId)
    : { configValueId: null, weightValue: customDefaultProductionWeight };
  if (hasColumn(lotColumns, 'default_production_weight') && defaultProductionWeightPayload.weightValue === null) {
    throw new Error('Lot production weight is required and must be at least 0.10.');
  }
  const hasUnlimitedGoal = formData.hasUnlimitedGoal === '1';
  const unitAmountGoal = hasUnlimitedGoal ? null : Number(formData.unitAmountGoal || 0);
  const deadline = formData.deadline ? String(formData.deadline).trim() : null;
  const objectives = String(formData.objectives || '').trim() || null;
  const notes = String(formData.notes || '').trim() || null;
  const labelFormat = String(formData.labelFormat || '').trim() || null;
  const allowDuplicateUnitAssumption = formData.allowDuplicateUnitAssumption === '1' ? 1 : 0;
  const startNewProductionCycleOnMove = formData.startNewProductionCycleOnMove === '1' ? 1 : 0;
  const isAssignable = formData.isAssignable === '1' ? 1 : 0;

  addFirstAvailableColumn(['lot_name', 'name', 'title'], lotName);
  addColumn('parent_lot_id', parentLotId);
  addColumn('lot_type_config_value_id', lotTypeConfigValueId);
  addFirstAvailableColumn(['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'], unitAmountGoal);
  addColumn('default_grade_config_value_id', defaultGradeConfigValueId);
  addColumn('default_production_weight_config_value_id', defaultProductionWeightPayload.configValueId);
  addColumn('default_production_weight', defaultProductionWeightPayload.weightValue);
  addFirstAvailableColumn(['deadline', 'deadline_date', 'due_date'], deadline);
  addFirstAvailableColumn(['objectives', 'objective'], objectives);
  addFirstAvailableColumn(['notes', 'note'], notes);
  addColumn('label_format', labelFormat);
  addColumn('allow_duplicate_unit_assumption', allowDuplicateUnitAssumption);
  addColumn('start_new_production_cycle_on_move', startNewProductionCycleOnMove);
  addColumn('is_assignable', isAssignable);
  addColumn('updated_by_user_id', currentUserId || null);

  if (hasColumn(lotColumns, 'requirement_policy_config_value_id')) {
    if (!requirementPolicyConfigValueId) {
      throw new Error('Requirement enforcement policy is required when updating a Lot.');
    }

    addColumn('requirement_policy_config_value_id', requirementPolicyConfigValueId);
  }

  if (assignments.length === 0) {
    throw new Error('No compatible lot columns were found for updating a lot.');
  }

  values.push(Number(lotId));

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (hasColumn(lotColumns, 'parent_lot_id') && parentLotId) {
      const hierarchyRows = await listLotHierarchyRows(connection, { forUpdate: true });
      assertValidLotParentAssignment(hierarchyRows, Number(lotId), parentLotId);
    }

    const [result] = await connection.query(
      `
        UPDATE lots
        SET ${assignments.join(', ')}
        WHERE lot_id = ?
        LIMIT 1
      `,
      values
    );

    if (Number(result.affectedRows || 0) > 0) {
      await productionWeightSyncModel.syncEffectiveManualCompletionWeights({
        connection,
        lotId: Number(lotId),
        apply: true
      });
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function getLotVisibilitySummary(lotId) {
  const lot = await getLotById(lotId);

  if (!lot) {
    return null;
  }

  const lotColumns = await getColumnSet('lots');
  const unitColumns = await getColumnSet('units');

  let unitCount = Number(lot.unitCount || lot.unit_count || 0);
  let childLotCount = 0;
  let activeChildLotCount = 0;
  let hiddenChildLotCount = 0;

  if (hasColumn(unitColumns, 'lot_id')) {
    const [unitRows] = await pool.query(
      'SELECT COUNT(*) AS unit_count FROM units WHERE lot_id = ?',
      [Number(lotId)]
    );

    unitCount = Number(unitRows[0]?.unit_count || 0);
  }

  if (hasColumn(lotColumns, 'parent_lot_id')) {
    const activeChildExpression = hasColumn(lotColumns, 'is_active')
      ? 'SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_child_lot_count, SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS hidden_child_lot_count'
      : 'COUNT(*) AS active_child_lot_count, 0 AS hidden_child_lot_count';

    const [childRows] = await pool.query(
      `
        SELECT
          COUNT(*) AS child_lot_count,
          ${activeChildExpression}
        FROM lots
        WHERE parent_lot_id = ?
      `,
      [Number(lotId)]
    );

    childLotCount = Number(childRows[0]?.child_lot_count || 0);
    activeChildLotCount = Number(childRows[0]?.active_child_lot_count || 0);
    hiddenChildLotCount = Number(childRows[0]?.hidden_child_lot_count || 0);
  }

  return {
    lot,
    unitCount,
    childLotCount,
    activeChildLotCount,
    hiddenChildLotCount,
    canChangeVisibility: hasColumn(lotColumns, 'is_active')
  };
}

async function setLotVisibility(lotId, isActive, currentUserId) {
  const lotColumns = await getColumnSet('lots');

  if (!hasColumn(lotColumns, 'is_active')) {
    throw new Error('Lot visibility cannot be changed because the lots table does not have an is_active column.');
  }

  const assignments = ['is_active = ?'];
  const values = [isActive ? 1 : 0];

  if (hasColumn(lotColumns, 'updated_by_user_id')) {
    assignments.push('updated_by_user_id = ?');
    values.push(currentUserId || null);
  }

  values.push(Number(lotId));

  const [result] = await pool.query(
    `
      UPDATE lots
      SET ${assignments.join(', ')}
      WHERE lot_id = ?
      LIMIT 1
    `,
    values
  );

  return result.affectedRows > 0;
}

async function getLotClosureSummary(lotId) {
  const lot = await getLotById(lotId);

  if (!lot) {
    return null;
  }

  const lotColumns = await getColumnSet('lots');
  const unitColumns = await getColumnSet('units');
  let unitCount = Number(lot.unitCount || lot.unit_count || 0);
  let childLotCount = 0;

  if (hasColumn(unitColumns, 'lot_id')) {
    const [unitRows] = await pool.query(
      'SELECT COUNT(*) AS unit_count FROM units WHERE lot_id = ?',
      [Number(lotId)]
    );

    unitCount = Number(unitRows[0]?.unit_count || 0);
  }

  if (hasColumn(lotColumns, 'parent_lot_id')) {
    const [childRows] = await pool.query(
      'SELECT COUNT(*) AS child_lot_count FROM lots WHERE parent_lot_id = ?',
      [Number(lotId)]
    );

    childLotCount = Number(childRows[0]?.child_lot_count || 0);
  }

  return {
    lot,
    unitCount,
    childLotCount,
    canChangeClosure: hasColumn(lotColumns, 'is_closed')
  };
}

async function setLotClosed(lotId, isClosed, currentUserId) {
  const lotColumns = await getColumnSet('lots');

  if (!hasColumn(lotColumns, 'is_closed')) {
    throw new Error('Lot closure is not ready yet. Run the Step 6f.1 closed-lot migration first.');
  }

  const assignments = ['is_closed = ?'];
  const values = [isClosed ? 1 : 0];

  if (hasColumn(lotColumns, 'updated_by_user_id')) {
    assignments.push('updated_by_user_id = ?');
    values.push(currentUserId || null);
  }

  values.push(Number(lotId));

  const [result] = await pool.query(
    `
      UPDATE lots
      SET ${assignments.join(', ')}
      WHERE lot_id = ?
      LIMIT 1
    `,
    values
  );

  return result.affectedRows > 0;
}

async function getLotDeleteSummary(lotId) {
  const lot = await getLotById(lotId);

  if (!lot) {
    return null;
  }

  const lotColumns = await getColumnSet('lots');
  const unitColumns = await getColumnSet('units');
  const requirementColumns = await getColumnSet('lot_requirements');

  let unitCount = Number(lot.unitCount || lot.unit_count || 0);
  let childLotCount = 0;
  let requirementCount = Number(lot.requirement_count || 0);

  if (hasColumn(unitColumns, 'lot_id')) {
    const [unitRows] = await pool.query(
      'SELECT COUNT(*) AS unit_count FROM units WHERE lot_id = ?',
      [Number(lotId)]
    );

    unitCount = Number(unitRows[0]?.unit_count || 0);
  }

  if (hasColumn(lotColumns, 'parent_lot_id')) {
    const [childRows] = await pool.query(
      'SELECT COUNT(*) AS child_lot_count FROM lots WHERE parent_lot_id = ?',
      [Number(lotId)]
    );

    childLotCount = Number(childRows[0]?.child_lot_count || 0);
  }

  if (hasColumn(requirementColumns, 'lot_id')) {
    const [requirementRows] = await pool.query(
      'SELECT COUNT(*) AS requirement_count FROM lot_requirements WHERE lot_id = ?',
      [Number(lotId)]
    );

    requirementCount = Number(requirementRows[0]?.requirement_count || 0);
  }

  return {
    lot,
    unitCount,
    childLotCount,
    requirementCount,
    canDelete: unitCount === 0 && childLotCount === 0
  };
}

async function deleteLotIfEmpty(lotId) {
  const summary = await getLotDeleteSummary(lotId);

  if (!summary || !summary.canDelete) {
    return false;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const requirementColumns = await getColumnSet('lot_requirements');

    if (hasColumn(requirementColumns, 'lot_id')) {
      await connection.query(
        'DELETE FROM lot_requirements WHERE lot_id = ?',
        [Number(lotId)]
      );
    }

    const [result] = await connection.query(
      'DELETE FROM lots WHERE lot_id = ? LIMIT 1',
      [Number(lotId)]
    );

    await connection.commit();

    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listLotRequirements(lotId, connection = null) {
  const db = connection || pool;
  const [rows] = await db.query(
    `
      SELECT
        lr.lot_requirement_id,
        lr.lot_id,
        lr.requirement_type_config_value_id,
        requirement_type_system.system_config_value_id AS requirement_type_system_config_value_id,
        requirement_type.label AS requirement_label,
        lr.comparison_operator_config_value_id,
        comparison_operator_system.system_config_value_id AS comparison_operator_system_config_value_id,
        COALESCE(comparison_operator.label, 'Equals') AS operator_label,
        lr.requirement_config_value_id,
        lr.manufacturer_id,
        lr.unit_model_id,
        lr.processor_model_id,
        lr.processor_family_id,
        processor_family.membership_version AS processor_family_membership_version,
        lr.requirement_text,
        lr.requirement_number,
        COALESCE(
          requirement_value.label,
          manufacturer.name,
          NULLIF(
            CONCAT_WS(
              ' · ',
              model_manufacturer.name,
              unit_model.model_name,
              NULLIF(unit_model.model_number, '')
            ),
            ''
          ),
          NULLIF(processor_family.name, ''),
          NULLIF(
            CONCAT_WS(
              ' · ',
              processor_brand.name,
              NULLIF(processor_model.processor_family, ''),
              processor_model.model_code
            ),
            ''
          ),
          lr.requirement_text,
          CAST(lr.requirement_number AS CHAR)
        ) AS required_value,
        lr.is_required,
        1 AS is_active,
        lr.notes,
        lr.created_at
      FROM lot_requirements lr
      JOIN config_values requirement_type
        ON requirement_type.config_value_id = lr.requirement_type_config_value_id
      LEFT JOIN system_config_values requirement_type_system
        ON requirement_type_system.config_value_id = requirement_type.config_value_id
      LEFT JOIN config_values comparison_operator
        ON comparison_operator.config_value_id = lr.comparison_operator_config_value_id
      LEFT JOIN system_config_values comparison_operator_system
        ON comparison_operator_system.config_value_id = comparison_operator.config_value_id
      LEFT JOIN config_values requirement_value
        ON requirement_value.config_value_id = lr.requirement_config_value_id
      LEFT JOIN manufacturers manufacturer
        ON manufacturer.manufacturer_id = lr.manufacturer_id
      LEFT JOIN unit_models unit_model
        ON unit_model.unit_model_id = lr.unit_model_id
      LEFT JOIN manufacturers model_manufacturer
        ON model_manufacturer.manufacturer_id = unit_model.manufacturer_id
      LEFT JOIN processor_families processor_family
        ON processor_family.processor_family_id = lr.processor_family_id
      LEFT JOIN processor_brands processor_family_brand
        ON processor_family_brand.processor_brand_id = processor_family.processor_brand_id
      LEFT JOIN processor_models processor_model
        ON processor_model.processor_model_id = lr.processor_model_id
      LEFT JOIN processor_brands processor_brand
        ON processor_brand.processor_brand_id = processor_model.processor_brand_id
      WHERE lr.lot_id = ?
      ORDER BY lr.created_at, lr.lot_requirement_id
    `,
    [Number(lotId)]
  );

  return rows.map((row) => ({
    ...row,
    requirement_key: normalizeRequirementKey(REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID[Number(row.requirement_type_system_config_value_id || 0)] || ''),
    operator_code: normalizeOperatorCode(OPERATOR_KEY_BY_SYSTEM_VALUE_ID[Number(row.comparison_operator_system_config_value_id || 0)] || 'equals'),
    required_value: row.requirement_number !== null && row.requirement_number !== undefined
      ? String(Number(row.requirement_number))
      : row.required_value,
    required_value_token: getRequirementValueToken(row)
  }));
}

async function listLotRequirementInheritanceSuppressions(lotId, connection = null) {
  const normalizedLotId = Number(lotId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0) {
    return [];
  }

  const db = connection || pool;
  const [rows] = await db.query(
    `
      SELECT
        suppression.lot_requirement_inheritance_suppression_id,
        suppression.lot_id,
        suppression.requirement_type_config_value_id,
        requirement_type_system.system_config_value_id AS requirement_type_system_config_value_id,
        requirement_type.label AS requirement_label,
        child.parent_lot_id AS source_lot_id,
        parent.name AS source_lot_name,
        suppression.created_by_user_id,
        suppression.updated_by_user_id,
        suppression.created_at,
        suppression.updated_at
      FROM lot_requirement_inheritance_suppressions suppression
      JOIN config_values requirement_type
        ON requirement_type.config_value_id = suppression.requirement_type_config_value_id
      LEFT JOIN system_config_values requirement_type_system
        ON requirement_type_system.config_value_id = requirement_type.config_value_id
      JOIN lots child
        ON child.lot_id = suppression.lot_id
      LEFT JOIN lots parent
        ON parent.lot_id = child.parent_lot_id
      WHERE suppression.lot_id = ?
      ORDER BY requirement_type.label, requirement_type.config_value_id
    `,
    [normalizedLotId]
  );

  return rows.map((row) => ({
    ...row,
    requirement_key: normalizeRequirementKey(REQUIREMENT_KEY_BY_SYSTEM_VALUE_ID[Number(row.requirement_type_system_config_value_id || 0)] || '')
  }));
}

async function clearLotRequirementInheritanceSuppression(lotId, requirementTypeConfigValueId, connection = null) {
  const normalizedLotId = Number(lotId);
  const normalizedRequirementTypeConfigValueId = Number(requirementTypeConfigValueId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0
    || !Number.isSafeInteger(normalizedRequirementTypeConfigValueId) || normalizedRequirementTypeConfigValueId <= 0) {
    return false;
  }

  const db = connection || pool;
  const [result] = await db.query(
    `
      DELETE FROM lot_requirement_inheritance_suppressions
      WHERE lot_id = ?
        AND requirement_type_config_value_id = ?
    `,
    [normalizedLotId, normalizedRequirementTypeConfigValueId]
  );

  return result.affectedRows > 0;
}

async function suppressInheritedRequirementField(lotId, sourceRequirementId, currentUserId) {
  const normalizedLotId = Number(lotId);
  const normalizedSourceRequirementId = Number(sourceRequirementId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0
    || !Number.isSafeInteger(normalizedSourceRequirementId) || normalizedSourceRequirementId <= 0) {
    throw new Error('A valid child Lot and inherited requirement are required.');
  }

  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementIdColumn = getRequirementIdColumn(requirementColumns);

  if (!requirementIdColumn) {
    throw new Error('The lot_requirements table does not have a compatible requirement ID column.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [lotRows] = await connection.query(
      'SELECT lot_id, parent_lot_id FROM lots WHERE lot_id = ? LIMIT 1 FOR UPDATE',
      [normalizedLotId]
    );
    const selectedLot = lotRows[0];
    const parentLotId = Number(selectedLot?.parent_lot_id);

    if (!selectedLot || !Number.isSafeInteger(parentLotId) || parentLotId <= 0) {
      throw new Error('This Lot does not have a direct parent requirement to stop inheriting.');
    }

    const [sourceRows] = await connection.query(
      `
        SELECT requirement_type_config_value_id
        FROM lot_requirements
        WHERE lot_id = ?
          AND \`${requirementIdColumn}\` = ?
        LIMIT 1
        FOR UPDATE
      `,
      [parentLotId, normalizedSourceRequirementId]
    );
    const requirementTypeConfigValueId = Number(sourceRows[0]?.requirement_type_config_value_id);

    if (!Number.isSafeInteger(requirementTypeConfigValueId) || requirementTypeConfigValueId <= 0) {
      throw new Error("The inherited requirement no longer belongs to this Lot's direct parent.");
    }

    const [directRows] = await connection.query(
      `
        SELECT COUNT(*) AS direct_count
        FROM lot_requirements
        WHERE lot_id = ?
          AND requirement_type_config_value_id = ?
      `,
      [normalizedLotId, requirementTypeConfigValueId]
    );

    if (Number(directRows[0]?.direct_count || 0) > 0) {
      throw new Error('This field already has child-specific requirements. Delete those direct rules before stopping inheritance.');
    }

    await connection.query(
      `
        INSERT INTO lot_requirement_inheritance_suppressions (
          lot_id,
          requirement_type_config_value_id,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = CURRENT_TIMESTAMP
      `,
      [normalizedLotId, requirementTypeConfigValueId, currentUserId || null, currentUserId || null]
    );

    await connection.commit();
    return { requirementTypeConfigValueId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function restoreInheritedRequirementField(lotId, requirementTypeConfigValueId) {
  return clearLotRequirementInheritanceSuppression(lotId, requirementTypeConfigValueId);
}

async function listEffectiveLotRequirements(lotId, connection = null) {
  const normalizedLotId = Number(lotId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0) {
    return [];
  }

  const selectedLot = await getLotById(normalizedLotId, connection);

  if (!selectedLot) {
    return [];
  }

  const lineage = [];
  const requirementGroups = [];
  const parentLotId = Number(selectedLot.parent_lot_id);

  // Requirement inheritance is deliberately direct-parent only. Unit Form
  // configuration keeps its existing full-lineage behavior, but Requirements
  // do not cascade from a grandparent through a parent.
  if (Number.isSafeInteger(parentLotId) && parentLotId > 0) {
    const parentLot = await getLotById(parentLotId, connection);

    if (parentLot) {
      lineage.push({ lotId: Number(parentLot.lot_id), name: parentLot.lot_name });
      requirementGroups.push(await listLotRequirements(parentLotId, connection));
    }
  }

  lineage.push({ lotId: normalizedLotId, name: selectedLot.lot_name });
  requirementGroups.push(await listLotRequirements(normalizedLotId, connection));

  const suppressions = await listLotRequirementInheritanceSuppressions(normalizedLotId, connection);

  return buildEffectiveLotRequirements({
    lineage,
    requirementGroups,
    selectedLotId: normalizedLotId,
    suppressedFieldKeys: suppressions.map((suppression) => suppression.requirement_key)
  });
}


async function customizeInheritedRequirementField(lotId, sourceRequirementId, currentUserId) {
  const normalizedLotId = Number(lotId);
  const normalizedSourceRequirementId = Number(sourceRequirementId);

  if (!Number.isSafeInteger(normalizedLotId) || normalizedLotId <= 0
    || !Number.isSafeInteger(normalizedSourceRequirementId) || normalizedSourceRequirementId <= 0) {
    throw new Error('A valid child Lot and inherited requirement are required.');
  }

  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementIdColumn = getRequirementIdColumn(requirementColumns);

  if (!requirementIdColumn || !hasColumn(requirementColumns, 'lot_id')
    || !hasColumn(requirementColumns, 'requirement_type_config_value_id')) {
    throw new Error('The lot_requirements table is missing the columns required for inheritance customization.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [lotRows] = await connection.query(
      'SELECT lot_id, parent_lot_id FROM lots WHERE lot_id = ? LIMIT 1 FOR UPDATE',
      [normalizedLotId]
    );
    const selectedLot = lotRows[0];
    const parentLotId = Number(selectedLot?.parent_lot_id);

    if (!selectedLot || !Number.isSafeInteger(parentLotId) || parentLotId <= 0) {
      throw new Error('This Lot does not have a direct parent requirement to customize.');
    }

    const [sourceRows] = await connection.query(
      `
        SELECT requirement_type_config_value_id
        FROM lot_requirements
        WHERE lot_id = ?
          AND \`${requirementIdColumn}\` = ?
        LIMIT 1
        FOR UPDATE
      `,
      [parentLotId, normalizedSourceRequirementId]
    );
    const requirementTypeConfigValueId = Number(sourceRows[0]?.requirement_type_config_value_id);

    if (!Number.isSafeInteger(requirementTypeConfigValueId) || requirementTypeConfigValueId <= 0) {
      throw new Error("The inherited requirement no longer belongs to this Lot's direct parent.");
    }

    const [existingRows] = await connection.query(
      `
        SELECT COUNT(*) AS direct_count
        FROM lot_requirements
        WHERE lot_id = ?
          AND requirement_type_config_value_id = ?
      `,
      [normalizedLotId, requirementTypeConfigValueId]
    );
    const existingDirectCount = Number(existingRows[0]?.direct_count || 0);

    if (existingDirectCount > 0) {
      await connection.commit();
      return { copiedCount: 0, alreadyCustomized: true };
    }

    const cloneableColumns = [
      'lot_id',
      'requirement_type_config_value_id',
      'comparison_operator_config_value_id',
      ...VALUE_COLUMN_NAMES,
      'is_required',
      'notes',
      'created_by_user_id',
      'updated_by_user_id'
    ].filter((columnName) => hasColumn(requirementColumns, columnName));
    const selectExpressions = [];
    const values = [];

    cloneableColumns.forEach((columnName) => {
      if (columnName === 'lot_id') {
        selectExpressions.push('?');
        values.push(normalizedLotId);
        return;
      }

      if (columnName === 'created_by_user_id' || columnName === 'updated_by_user_id') {
        selectExpressions.push('?');
        values.push(currentUserId || null);
        return;
      }

      selectExpressions.push(`source.\`${columnName}\``);
    });

    values.push(parentLotId, requirementTypeConfigValueId);

    const [result] = await connection.query(
      `
        INSERT INTO lot_requirements (${cloneableColumns.map((columnName) => `\`${columnName}\``).join(', ')})
        SELECT ${selectExpressions.join(', ')}
        FROM lot_requirements source
        WHERE source.lot_id = ?
          AND source.requirement_type_config_value_id = ?
        ORDER BY source.\`${requirementIdColumn}\`
      `,
      values
    );

    await connection.commit();

    return {
      copiedCount: Number(result.affectedRows || 0),
      alreadyCustomized: false
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createLotRequirement(lotId, formData, currentUserId) {
  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementKey = normalizeRequirementKey(formData.requirementKey);
  const operatorCode = normalizeOperatorCode(formData.operatorCode);
  const requirementTypeConfigValueId = await findConfigValueIdBySystemId(SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY[requirementKey]);
  const comparisonOperatorConfigValueId = await findConfigValueIdBySystemId(SYSTEM_VALUE_ID_BY_OPERATOR_KEY[operatorCode]);

  if (!requirementTypeConfigValueId) {
    throw new Error(`No lot requirement type is configured for ${requirementKey}.`);
  }

  if (!comparisonOperatorConfigValueId) {
    throw new Error(`No comparison operator is configured for ${operatorCode}.`);
  }

  const valuePayload = buildRequirementValuePayload(requirementKey, formData.requiredValue);
  const columns = [];
  const placeholders = [];
  const values = [];

  function addColumn(columnName, value, { includeNull = false } = {}) {
    if (!hasColumn(requirementColumns, columnName) || (value === null && !includeNull)) {
      return;
    }

    columns.push(`\`${columnName}\``);
    placeholders.push('?');
    values.push(value);
  }

  addColumn('lot_id', Number(lotId));
  addColumn('requirement_type_config_value_id', requirementTypeConfigValueId);
  addColumn('comparison_operator_config_value_id', comparisonOperatorConfigValueId);

  VALUE_COLUMN_NAMES.forEach((columnName) => {
    addColumn(columnName, valuePayload[columnName]);
  });

  addColumn('is_required', 1);
  addColumn('notes', String(formData.notes || '').trim() || null);
  addColumn('created_by_user_id', currentUserId || null);
  addColumn('updated_by_user_id', currentUserId || null);

  const [result] = await pool.query(
    `
      INSERT INTO lot_requirements (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
    `,
    values
  );

  return {
    lotRequirementId: result.insertId
  };
}


function getRequirementIdColumn(requirementColumns) {
  return pickColumn(requirementColumns, ['lot_requirement_id', 'requirement_id', 'id']);
}

async function getLotRequirementById(lotId, requirementId) {
  const requirements = await listLotRequirements(lotId);

  return requirements.find((requirement) => Number(requirement.lot_requirement_id) === Number(requirementId)) || null;
}

async function updateLotRequirement(lotId, requirementId, formData, currentUserId) {
  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementIdColumn = getRequirementIdColumn(requirementColumns);

  if (!requirementIdColumn) {
    throw new Error('The lot_requirements table does not have a compatible requirement ID column.');
  }

  const requirementKey = normalizeRequirementKey(formData.requirementKey);
  const operatorCode = normalizeOperatorCode(formData.operatorCode);
  const requirementTypeConfigValueId = await findConfigValueIdBySystemId(SYSTEM_VALUE_ID_BY_REQUIREMENT_KEY[requirementKey]);
  const comparisonOperatorConfigValueId = await findConfigValueIdBySystemId(SYSTEM_VALUE_ID_BY_OPERATOR_KEY[operatorCode]);

  if (!requirementTypeConfigValueId) {
    throw new Error(`No lot requirement type is configured for ${requirementKey}.`);
  }

  if (!comparisonOperatorConfigValueId) {
    throw new Error(`No comparison operator is configured for ${operatorCode}.`);
  }

  const valuePayload = buildRequirementValuePayload(requirementKey, formData.requiredValue);
  const assignments = [];
  const values = [];

  function addColumn(columnName, value) {
    if (!hasColumn(requirementColumns, columnName)) {
      return;
    }

    assignments.push(`\`${columnName}\` = ?`);
    values.push(value);
  }

  addColumn('requirement_type_config_value_id', requirementTypeConfigValueId);
  addColumn('comparison_operator_config_value_id', comparisonOperatorConfigValueId);

  VALUE_COLUMN_NAMES.forEach((columnName) => {
    addColumn(columnName, valuePayload[columnName]);
  });

  addColumn('is_required', 1);
  addColumn('notes', String(formData.notes || '').trim() || null);
  addColumn('updated_by_user_id', currentUserId || null);

  values.push(Number(lotId), Number(requirementId));

  const [result] = await pool.query(
    `
      UPDATE lot_requirements
      SET ${assignments.join(', ')}
      WHERE lot_id = ?
        AND \`${requirementIdColumn}\` = ?
      LIMIT 1
    `,
    values
  );

  return result.affectedRows > 0;
}

async function deleteLotRequirement(lotId, requirementId) {
  const normalizedLotId = Number(lotId);
  const normalizedRequirementId = Number(requirementId);

  if (!Number.isInteger(normalizedLotId) || normalizedLotId <= 0
    || !Number.isInteger(normalizedRequirementId) || normalizedRequirementId <= 0) {
    return false;
  }

  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementIdColumn = getRequirementIdColumn(requirementColumns);

  if (!requirementIdColumn) {
    throw new Error('The lot_requirements table does not have a compatible requirement ID column.');
  }

  const [result] = await pool.query(
    `
      DELETE FROM lot_requirements
      WHERE lot_id = ?
        AND \`${requirementIdColumn}\` = ?
      LIMIT 1
    `,
    [normalizedLotId, normalizedRequirementId]
  );

  return result.affectedRows > 0;
}


function normalizeLotDuplicationInheritanceMode(value) {
  return String(value || '').trim() === 'new_parent'
    ? 'new_parent'
    : 'preserve_source';
}

function buildDuplicatedLotFormData(sourceLot, { newLotName, parentLotId }) {
  return {
    lotName: String(newLotName || '').trim(),
    parentLotId: parentLotId ? String(parentLotId) : '',
    lotTypeConfigValueId: sourceLot.lot_type_config_value_id ? String(sourceLot.lot_type_config_value_id) : '',
    requirementPolicyConfigValueId: sourceLot.requirement_policy_config_value_id ? String(sourceLot.requirement_policy_config_value_id) : '',
    defaultGradeConfigValueId: sourceLot.default_grade_config_value_id ? String(sourceLot.default_grade_config_value_id) : '',
    defaultProductionWeightConfigValueId: sourceLot.default_production_weight_config_value_id
      ? String(sourceLot.default_production_weight_config_value_id)
      : '',
    defaultProductionWeight: sourceLot.default_production_weight !== null && sourceLot.default_production_weight !== undefined
      ? String(sourceLot.default_production_weight)
      : '',
    hasUnlimitedGoal: sourceLot.isUnlimited ? '1' : '0',
    unitAmountGoal: sourceLot.isUnlimited ? '' : String(sourceLot.unitGoal || sourceLot.unit_amount_goal || ''),
    deadline: sourceLot.deadline instanceof Date && !Number.isNaN(sourceLot.deadline.getTime())
      ? sourceLot.deadline.toISOString().slice(0, 10)
      : (sourceLot.deadline ? String(sourceLot.deadline).slice(0, 10) : ''),
    labelFormat: sourceLot.label_format || '',
    objectives: sourceLot.objectives || '',
    notes: sourceLot.notes || '',
    allowDuplicateUnitAssumption: Number(sourceLot.allow_duplicate_unit_assumption || 0) === 1 ? '1' : '0',
    startNewProductionCycleOnMove: Number(sourceLot.start_new_production_cycle_on_move || 0) === 1 ? '1' : '0',
    isAssignable: Number(sourceLot.is_assignable || 0) === 1 ? '1' : '0'
  };
}

async function insertClonedRequirementRows(connection, targetLotId, requirements, currentUserId) {
  const rows = Array.isArray(requirements) ? requirements : [];

  if (rows.length === 0) {
    return 0;
  }

  const requirementColumns = await getColumnSet('lot_requirements');
  const cloneableColumns = [
    'lot_id',
    'requirement_type_config_value_id',
    'comparison_operator_config_value_id',
    ...VALUE_COLUMN_NAMES,
    'is_required',
    'notes',
    'created_by_user_id',
    'updated_by_user_id'
  ].filter((columnName) => hasColumn(requirementColumns, columnName));
  const placeholders = rows.map(() => `(${cloneableColumns.map(() => '?').join(', ')})`).join(', ');
  const values = rows.flatMap((requirement) => cloneableColumns.map((columnName) => {
    if (columnName === 'lot_id') return Number(targetLotId);
    if (columnName === 'created_by_user_id' || columnName === 'updated_by_user_id') return currentUserId || null;
    if (columnName === 'is_required') return Number(requirement.is_required ?? 1) === 1 ? 1 : 0;
    return requirement[columnName] ?? null;
  }));

  const [result] = await connection.query(
    `INSERT INTO lot_requirements (${cloneableColumns.map((columnName) => `\`${columnName}\``).join(', ')})
     VALUES ${placeholders}`,
    values
  );

  return Number(result.affectedRows || 0);
}

function buildMaterializedUnitFormRules(profile) {
  if (!profile || !Array.isArray(profile.fields)) {
    return [];
  }

  return profile.fields
    .filter((field) => field.enabledForLotRules)
    .map((field) => {
      const visibilityMode = field.visibilityConfigurable
        ? String(field.resolvedVisibilityMode || 'inherit')
        : 'inherit';
      let requirementMode = field.requirementConfigurable
        ? String(field.resolvedRequirementMode || 'inherit')
        : 'inherit';

      // A resolved profile can legally be hidden while a required mode is latent
      // through inheritance. Storage intentionally forbids a direct Hidden + Required
      // row, so materialize the currently effective hidden behavior as optional.
      if (visibilityMode === 'hidden' && requirementMode === 'required') {
        requirementMode = 'optional';
      }

      return {
        fieldKey: field.key,
        visibilityMode,
        requirementMode
      };
    })
    .filter((rule) => rule.visibilityMode !== 'inherit' || rule.requirementMode !== 'inherit');
}

function buildRequirementBehaviorSignature(requirements) {
  return (Array.isArray(requirements) ? requirements : [])
    .map((requirement) => [
      normalizeRequirementKey(requirement.requirement_key),
      normalizeOperatorCode(requirement.operator_code),
      String(getRequirementValueToken(requirement) || requirement.required_value_token || requirement.required_value || ''),
      Number(requirement.is_required ?? 1) === 1 ? '1' : '0'
    ].join('|'))
    .sort();
}

function buildUnitFormBehaviorSignature(profile) {
  return (profile && Array.isArray(profile.fields) ? profile.fields : [])
    .filter((field) => field.enabledForLotRules)
    .map((field) => `${field.key}|${field.visible ? 'visible' : 'hidden'}|${field.required ? 'required' : 'optional'}`)
    .sort();
}

async function copyRequirementInheritanceSuppressionsForPreservedBehavior({
  connection,
  targetLotId,
  targetParentLotId,
  sourceEffectiveRequirements,
  currentUserId
}) {
  if (!targetParentLotId) {
    return 0;
  }

  const suppressionColumns = await getColumnSet('lot_requirement_inheritance_suppressions');

  if (!hasColumn(suppressionColumns, 'lot_id') || !hasColumn(suppressionColumns, 'requirement_type_config_value_id')) {
    const parentRequirements = await listLotRequirements(targetParentLotId, connection);
    const effectiveTypeIds = new Set(
      (Array.isArray(sourceEffectiveRequirements) ? sourceEffectiveRequirements : [])
        .map((requirement) => Number(requirement.requirement_type_config_value_id))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    );
    const wouldRequireSuppression = parentRequirements.some(
      (requirement) => !effectiveTypeIds.has(Number(requirement.requirement_type_config_value_id))
    );

    if (wouldRequireSuppression) {
      throw new Error('Preserving source requirement behavior under this Parent Lot requires the requirement inheritance suppression schema.');
    }

    return 0;
  }

  const effectiveTypeIds = new Set(
    (Array.isArray(sourceEffectiveRequirements) ? sourceEffectiveRequirements : [])
      .map((requirement) => Number(requirement.requirement_type_config_value_id))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  );
  const [parentRows] = await connection.query(
    `SELECT DISTINCT requirement_type_config_value_id
     FROM lot_requirements
     WHERE lot_id = ?`,
    [Number(targetParentLotId)]
  );
  const suppressedTypeIds = parentRows
    .map((row) => Number(row.requirement_type_config_value_id))
    .filter((value) => Number.isSafeInteger(value) && value > 0 && !effectiveTypeIds.has(value));

  if (suppressedTypeIds.length === 0) {
    return 0;
  }

  const values = suppressedTypeIds.flatMap((requirementTypeConfigValueId) => [
    Number(targetLotId),
    requirementTypeConfigValueId,
    currentUserId || null,
    currentUserId || null
  ]);
  const placeholders = suppressedTypeIds.map(() => '(?, ?, ?, ?)').join(', ');
  const [result] = await connection.query(
    `INSERT INTO lot_requirement_inheritance_suppressions (
       lot_id,
       requirement_type_config_value_id,
       created_by_user_id,
       updated_by_user_id
     ) VALUES ${placeholders}`,
    values
  );

  return Number(result.affectedRows || 0);
}

async function getLotDuplicationPreview(sourceLotId) {
  const normalizedSourceLotId = Number(sourceLotId);

  if (!Number.isSafeInteger(normalizedSourceLotId) || normalizedSourceLotId <= 0) {
    return null;
  }

  const sourceLot = await getLotById(normalizedSourceLotId);

  return sourceLot ? { sourceLot } : null;
}

async function duplicateLot(sourceLotId, duplicationData, currentUserId) {
  const normalizedSourceLotId = Number(sourceLotId);
  const newLotName = String(duplicationData?.newLotName || '').trim();
  const targetParentLotId = duplicationData?.parentLotId ? Number(duplicationData.parentLotId) : null;
  const inheritanceMode = normalizeLotDuplicationInheritanceMode(duplicationData?.inheritanceMode);

  if (!Number.isSafeInteger(normalizedSourceLotId) || normalizedSourceLotId <= 0 || newLotName.length < 2) {
    throw new Error('A valid source Lot and new Lot name are required.');
  }

  const capabilities = await getLotSchemaCapabilities();

  if (!capabilities.hasAssignableState) {
    const error = new Error('Lot duplication requires the explicit Lot assignability migration first.');
    error.code = 'BWT_LOT_ASSIGNABILITY_SCHEMA_REQUIRED';
    throw error;
  }

  const lotUnitFormProfileModel = require('./lotUnitFormProfileModel');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const hierarchyRows = await listLotHierarchyRows(connection, { forUpdate: true });
    const sourceHierarchyRow = hierarchyRows.find((row) => Number(row.lot_id) === normalizedSourceLotId);

    if (!sourceHierarchyRow) {
      throw new Error('The source Lot could not be found.');
    }

    if (targetParentLotId) {
      const targetParent = await getLotById(targetParentLotId, connection);

      if (!targetParent || Number(targetParent.is_active) !== 1 || Number(targetParent.is_closed || 0) === 1) {
        throw new Error('The selected Parent Lot must be open and visible.');
      }
    }

    const sourceLot = await getLotById(normalizedSourceLotId, connection);

    if (!sourceLot) {
      throw new Error('The source Lot could not be loaded for duplication.');
    }

    const [sourceDirectRequirements, sourceEffectiveRequirements, sourceDirectUnitFormRules, sourceEffectiveUnitFormProfile] = await Promise.all([
      listLotRequirements(normalizedSourceLotId, connection),
      listEffectiveLotRequirements(normalizedSourceLotId, connection),
      lotUnitFormProfileModel.listRulesForLot(normalizedSourceLotId, connection),
      lotUnitFormProfileModel.getEffectiveUnitFormProfileForLot(normalizedSourceLotId, connection)
    ]);
    const duplicateFormData = buildDuplicatedLotFormData(sourceLot, {
      newLotName,
      parentLotId: targetParentLotId
    });
    const createdLot = await createLot(duplicateFormData, currentUserId, { connection });
    const targetLotId = Number(createdLot.lotId);

    const requirementsToCopy = inheritanceMode === 'preserve_source'
      ? sourceEffectiveRequirements
      : sourceDirectRequirements;
    const requirementCount = await insertClonedRequirementRows(
      connection,
      targetLotId,
      requirementsToCopy,
      currentUserId
    );

    if (inheritanceMode === 'preserve_source') {
      await copyRequirementInheritanceSuppressionsForPreservedBehavior({
        connection,
        targetLotId,
        targetParentLotId,
        sourceEffectiveRequirements,
        currentUserId
      });
    }

    const unitFormRulesToCopy = inheritanceMode === 'preserve_source'
      ? buildMaterializedUnitFormRules(sourceEffectiveUnitFormProfile)
      : sourceDirectUnitFormRules.map((rule) => ({
          fieldKey: rule.fieldKey,
          visibilityMode: rule.visibilityMode,
          requirementMode: rule.requirementMode
        }));

    await lotUnitFormProfileModel.replaceRulesForLot(
      targetLotId,
      unitFormRulesToCopy,
      currentUserId,
      connection
    );

    if (inheritanceMode === 'preserve_source') {
      const [targetEffectiveRequirements, targetEffectiveUnitFormProfile] = await Promise.all([
        listEffectiveLotRequirements(targetLotId, connection),
        lotUnitFormProfileModel.getEffectiveUnitFormProfileForLot(targetLotId, connection)
      ]);

      if (JSON.stringify(buildRequirementBehaviorSignature(targetEffectiveRequirements))
        !== JSON.stringify(buildRequirementBehaviorSignature(sourceEffectiveRequirements))) {
        throw new Error('The duplicate could not preserve the source Lot requirement behavior. No Lot was created.');
      }

      if (JSON.stringify(buildUnitFormBehaviorSignature(targetEffectiveUnitFormProfile))
        !== JSON.stringify(buildUnitFormBehaviorSignature(sourceEffectiveUnitFormProfile))) {
        throw new Error('The duplicate could not preserve the source Lot Unit Form behavior. No Lot was created.');
      }
    }

    await connection.commit();

    return {
      lotId: targetLotId,
      lotCode: createdLot.lotCode,
      inheritanceMode,
      copiedRequirementCount: requirementCount,
      copiedUnitFormRuleCount: unitFormRulesToCopy.length
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


module.exports = {
  listLots,
  listLotHierarchyRows,
  getLotById,
  listDescendantLotIds,
  getLotHierarchyAudit,
  getLotExportScope,
  getLotSummary,
  getLotFormOptions,
  getLotDuplicationPreview,
  getLotVisibilitySummary,
  setLotVisibility,
  getLotClosureSummary,
  setLotClosed,
  getLotSchemaCapabilities,
  createLot,
  duplicateLot,
  updateLot,
  getLotDeleteSummary,
  deleteLotIfEmpty,
  listLotRequirements,
  listEffectiveLotRequirements,
  listLotRequirementInheritanceSuppressions,
  suppressInheritedRequirementField,
  restoreInheritedRequirementField,
  customizeInheritedRequirementField,
  getLotRequirementById,
  createLotRequirement,
  updateLotRequirement,
  deleteLotRequirement
};