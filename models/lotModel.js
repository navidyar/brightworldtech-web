const crypto = require('crypto');
const { pool } = require('./db');
const productionWeightModel = require('./productionWeightModel');
const { getNewLotInitialActiveValue } = require('../services/lotCreationPolicy');
const {
  normalizeOperatorCode,
  normalizeRequirementKey
} = require('../config/lotRequirementRegistry');
const {
  VALUE_COLUMN_NAMES,
  buildRequirementValuePayload,
  getRequirementValueToken
} = require('../services/lotRequirementPersistence');

const INSPECTABLE_TABLES = [
  'lots',
  'units',
  'lot_requirements',
  'config_categories',
  'config_values'
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

async function generateNextLotNumber() {
  const [rows] = await pool.query(`
    SELECT
      COALESCE(MAX(CAST(lot_number AS UNSIGNED)), 1000) + 1 AS next_lot_number
    FROM lots
    WHERE lot_number REGEXP '^[0-9]+$'
  `);

  return String(rows[0]?.next_lot_number || 1001);
}

async function listConfigValuesForFirstExistingCategory(candidateCategoryCodes) {
  const categoryColumns = await getColumnSet('config_categories');
  const valueColumns = await getColumnSet('config_values');

  const categoryLabelExpression = selectExpression('cc', categoryColumns, ['label', 'name'], 'category_label', 'cc.`code`');
  const valueLabelExpression = selectExpression('cv', valueColumns, ['label', 'name'], 'label', 'cv.`code`');
  const valueDescriptionExpression = selectExpression('cv', valueColumns, ['description'], 'description', 'NULL');
  const valueSortExpression = selectExpression('cv', valueColumns, ['sort_order'], 'sort_order', '0');
  const valueActiveExpression = selectExpression('cv', valueColumns, ['is_active'], 'is_active', '1');

  const placeholders = candidateCategoryCodes.map(() => '?').join(', ');
  const fieldOrder = candidateCategoryCodes.map(() => '?').join(', ');

  const [categoryRows] = await pool.query(
    `
      SELECT
        cc.config_category_id,
        cc.code,
        ${categoryLabelExpression}
      FROM config_categories cc
      WHERE cc.code IN (${placeholders})
      ORDER BY FIELD(cc.code, ${fieldOrder})
    `,
    [...candidateCategoryCodes, ...candidateCategoryCodes]
  );

  for (const category of categoryRows) {
    const [valueRows] = await pool.query(
      `
        SELECT
          cv.config_value_id,
          cv.config_category_id,
          cv.code,
          ${valueLabelExpression},
          ${valueDescriptionExpression},
          ${valueSortExpression},
          ${valueActiveExpression}
        FROM config_values cv
        WHERE cv.config_category_id = ?
        ORDER BY sort_order, label, code
      `,
      [category.config_category_id]
    );

    if (valueRows.length > 0) {
      return {
        category,
        values: valueRows
      };
    }
  }

  return {
    category: null,
    values: []
  };
}

async function findConfigValueIdByCode(candidateCategoryCodes, valueCode) {
  const normalizedValueCode = String(valueCode || '').trim();

  if (!normalizedValueCode) {
    return null;
  }

  const placeholders = candidateCategoryCodes.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${placeholders})
        AND cv.code = ?
      ORDER BY FIELD(cc.code, ${placeholders})
      LIMIT 1
    `,
    [...candidateCategoryCodes, normalizedValueCode, ...candidateCategoryCodes]
  );

  return rows[0]?.config_value_id || null;
}

async function findPreferredConfigValueId(candidateCategoryCodes, preferredValueCodes) {
  const valueColumns = await getColumnSet('config_values');
  const categoryPlaceholders = candidateCategoryCodes.map(() => '?').join(', ');
  const categoryOrderPlaceholders = candidateCategoryCodes.map(() => '?').join(', ');
  const activeFilter = hasColumn(valueColumns, 'is_active') ? 'AND cv.is_active = 1' : '';

  const preferredCaseLines = preferredValueCodes
    .map((valueCode, index) => `WHEN cv.code = ? THEN ${index + 1}`)
    .join('\n          ');

  const [rows] = await pool.query(
    `
      SELECT
        cv.config_value_id,
        cv.code
      FROM config_values cv
      JOIN config_categories cc
        ON cc.config_category_id = cv.config_category_id
      WHERE cc.code IN (${categoryPlaceholders})
        ${activeFilter}
      ORDER BY
        FIELD(cc.code, ${categoryOrderPlaceholders}),
        CASE
          ${preferredCaseLines}
          ELSE 999
        END,
        cv.config_value_id
      LIMIT 1
    `,
    [...candidateCategoryCodes, ...candidateCategoryCodes, ...preferredValueCodes]
  );

  return rows[0]?.config_value_id || null;
}

async function getDefaultLotStatusConfigValueId() {
  return findPreferredConfigValueId(
    ['lot_statuses', 'lot_status'],
    ['active', 'open', 'created', 'new', 'pending']
  );
}

async function getDefaultRequirementPolicyConfigValueId(hasUnlimitedGoal) {
  if (hasUnlimitedGoal) {
    return findPreferredConfigValueId(
      ['requirement_policies', 'requirement_policy', 'lot_requirement_policies', 'lot_requirement_policy'],
      ['open', 'mixed', 'no_requirements', 'none', 'flexible', 'not_strict', 'strict']
    );
  }

  return findPreferredConfigValueId(
    ['requirement_policies', 'requirement_policy', 'lot_requirement_policies', 'lot_requirement_policy'],
    ['strict', 'required', 'enforced', 'validate', 'open', 'mixed']
  );
}

async function listParentLotOptions(options = {}) {
  const lotColumns = await getColumnSet('lots');
  const includeLotIds = Array.isArray(options.includeLotIds)
    ? options.includeLotIds
        .map((lotId) => Number(lotId))
        .filter((lotId) => Number.isInteger(lotId) && lotId > 0)
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
  const isActiveWhere = includeLotIds.length > 0
    ? `WHERE (${operationalWhere}) OR l.lot_id IN (${includeLotIds.map(() => '?').join(', ')})`
    : `WHERE ${operationalWhere}`;
  const queryParams = includeLotIds.length > 0 ? includeLotIds : [];

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
    hasDuplicateUnitAssumption: hasColumn(lotColumns, 'allow_duplicate_unit_assumption')
  };
}

async function getLotFormOptions(options = {}) {
  const includeParentLotIds = Array.isArray(options.includeParentLotIds)
    ? options.includeParentLotIds
    : [];

  const [
    capabilities,
    lotTypeResult,
    gradeResult,
    productionWeightOptions,
    parentLots
  ] = await Promise.all([
    getLotSchemaCapabilities(),
    listConfigValuesForFirstExistingCategory(['lot_types', 'lot_type']),
    listConfigValuesForFirstExistingCategory(['unit_grades', 'unit_grade', 'grades']),
    productionWeightModel.listProductionWeightOptions(),
    listParentLotOptions({ includeLotIds: includeParentLotIds })
  ]);

  return {
    capabilities,
    lotTypes: lotTypeResult.values,
    lotTypeCategory: lotTypeResult.category,
    grades: gradeResult.values,
    gradeCategory: gradeResult.category,
    productionWeightOptions,
    parentLots
  };
}

async function listLots(options = {}) {
  const includeHidden = options.includeHidden === true;
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

  const allowDuplicateUnitAssumptionSelect = selectExpression(
    'l',
    lotColumns,
    ['allow_duplicate_unit_assumption'],
    'allow_duplicate_unit_assumption',
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
    `
    : '';

  const requirementPolicyJoin = hasRequirementPolicy
    ? `
      LEFT JOIN config_values requirement_policy
        ON requirement_policy.config_value_id = l.requirement_policy_config_value_id
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
    ? 'COALESCE(lot_type.label, lot_type.code) AS lot_type_label'
    : 'NULL AS lot_type_label';

  const lotStatusLabelSelect = hasLotStatus
    ? 'COALESCE(lot_status.label, lot_status.code) AS lot_status_label'
    : 'NULL AS lot_status_label';

  const lotStatusCodeSelect = hasLotStatus
    ? 'lot_status.code AS lot_status_code'
    : 'NULL AS lot_status_code';

  const requirementPolicyLabelSelect = hasRequirementPolicy
    ? 'COALESCE(requirement_policy.label, requirement_policy.code) AS requirement_policy_label'
    : 'NULL AS requirement_policy_label';

  const requirementPolicyCodeSelect = hasRequirementPolicy
    ? 'requirement_policy.code AS requirement_policy_code'
    : 'NULL AS requirement_policy_code';

  const defaultGradeLabelSelect = hasDefaultGrade
    ? 'COALESCE(default_grade.label, default_grade.code) AS default_grade_label'
    : 'NULL AS default_grade_label';

  const defaultProductionWeightLabelSelect = hasDefaultProductionWeightConfigValueId
    ? 'COALESCE(default_production_weight_value.label, default_production_weight_value.code) AS default_production_weight_label'
    : 'NULL AS default_production_weight_label';

  const defaultProductionWeightConfigValueIdSelect = hasDefaultProductionWeightConfigValueId
    ? 'l.default_production_weight_config_value_id AS default_production_weight_config_value_id'
    : 'NULL AS default_production_weight_config_value_id';

  const defaultProductionWeightSelect = hasDefaultProductionWeight
    ? 'l.default_production_weight AS default_production_weight'
    : 'NULL AS default_production_weight';

  const resolvedDefaultProductionWeightSelect = hasDefaultProductionWeight && hasDefaultProductionWeightConfigValueId
    ? 'COALESCE(l.default_production_weight, CAST(default_production_weight_value.value AS DECIMAL(8,2))) AS resolved_default_production_weight'
    : hasDefaultProductionWeight
      ? 'l.default_production_weight AS resolved_default_production_weight'
      : hasDefaultProductionWeightConfigValueId
        ? 'CAST(default_production_weight_value.value AS DECIMAL(8,2)) AS resolved_default_production_weight'
        : 'NULL AS resolved_default_production_weight';

  const lotTypeConfigValueIdSelect = hasLotType
    ? 'l.lot_type_config_value_id AS lot_type_config_value_id'
    : 'NULL AS lot_type_config_value_id';

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

  const [rows] = await pool.query(`
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
      ${defaultGradeConfigValueIdSelect},
      ${unitGoalSelect},
      ${deadlineSelect},
      ${objectivesSelect},
      ${notesSelect},
      ${labelFormatSelect},
      ${isActiveSelect},
      ${isClosedSelect},
      ${allowDuplicateUnitAssumptionSelect},
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

  return rows.map((row) => {
    const progress = buildProgress(row.unit_count, row.unit_amount_goal);

    return {
      ...row,
      ...progress
    };
  });
}

async function getLotById(lotId) {
  const lots = await listLots({ includeHidden: true });
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

async function createLot(formData, currentUserId) {
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
  const defaultGradeConfigValueId = formData.defaultGradeConfigValueId ? Number(formData.defaultGradeConfigValueId) : null;
  const customDefaultProductionWeight = productionWeightModel.normalizeWeightValue(formData.defaultProductionWeight);
  const defaultProductionWeightPayload = formData.defaultProductionWeightConfigValueId
    ? await productionWeightModel.getProductionWeightPayloadFromConfigValueId(formData.defaultProductionWeightConfigValueId)
    : { configValueId: null, weightValue: customDefaultProductionWeight };
  const hasUnlimitedGoal = formData.hasUnlimitedGoal === '1';
  const unitAmountGoal = hasUnlimitedGoal ? null : Number(formData.unitAmountGoal || 0);
  const deadline = formData.deadline ? String(formData.deadline).trim() : null;
  const objectives = String(formData.objectives || '').trim() || null;
  const notes = String(formData.notes || '').trim() || null;
  const labelFormat = String(formData.labelFormat || '').trim() || null;
  const allowDuplicateUnitAssumption = formData.allowDuplicateUnitAssumption === '1' ? 1 : 0;

  if (hasColumn(lotColumns, 'lot_number')) {
    const nextLotNumber = await generateNextLotNumber();
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
    const requirementPolicyConfigValueId = await getDefaultRequirementPolicyConfigValueId(hasUnlimitedGoal);

    if (!requirementPolicyConfigValueId) {
      throw new Error(
        'Cannot create lot because lots.requirement_policy_config_value_id is required, but no config value was found in requirement_policies, requirement_policy, lot_requirement_policies, or lot_requirement_policy. Add a config value such as strict, open, mixed, no_requirements, or none.'
      );
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

  const [result] = await pool.query(
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
  const defaultGradeConfigValueId = formData.defaultGradeConfigValueId ? Number(formData.defaultGradeConfigValueId) : null;
  const customDefaultProductionWeight = productionWeightModel.normalizeWeightValue(formData.defaultProductionWeight);
  const defaultProductionWeightPayload = formData.defaultProductionWeightConfigValueId
    ? await productionWeightModel.getProductionWeightPayloadFromConfigValueId(formData.defaultProductionWeightConfigValueId)
    : { configValueId: null, weightValue: customDefaultProductionWeight };
  const hasUnlimitedGoal = formData.hasUnlimitedGoal === '1';
  const unitAmountGoal = hasUnlimitedGoal ? null : Number(formData.unitAmountGoal || 0);
  const deadline = formData.deadline ? String(formData.deadline).trim() : null;
  const objectives = String(formData.objectives || '').trim() || null;
  const notes = String(formData.notes || '').trim() || null;
  const labelFormat = String(formData.labelFormat || '').trim() || null;
  const allowDuplicateUnitAssumption = formData.allowDuplicateUnitAssumption === '1' ? 1 : 0;

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
  addColumn('updated_by_user_id', currentUserId || null);

  if (hasColumn(lotColumns, 'requirement_policy_config_value_id')) {
    const requirementPolicyConfigValueId = await getDefaultRequirementPolicyConfigValueId(hasUnlimitedGoal);

    if (requirementPolicyConfigValueId) {
      addColumn('requirement_policy_config_value_id', requirementPolicyConfigValueId);
    }
  }

  if (assignments.length === 0) {
    throw new Error('No compatible lot columns were found for updating a lot.');
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

async function listLotRequirements(lotId) {
  const [rows] = await pool.query(
    `
      SELECT
        lr.lot_requirement_id,
        lr.lot_id,
        lr.requirement_type_config_value_id,
        requirement_type.code AS requirement_key,
        requirement_type.label AS requirement_label,
        lr.comparison_operator_config_value_id,
        COALESCE(comparison_operator.code, 'equals') AS operator_code,
        COALESCE(comparison_operator.label, 'Equals') AS operator_label,
        lr.requirement_config_value_id,
        lr.manufacturer_id,
        lr.unit_model_id,
        lr.processor_model_id,
        lr.requirement_text,
        lr.requirement_number,
        COALESCE(
          requirement_value.label,
          manufacturer.name,
          CONCAT_WS(
            ' · ',
            model_manufacturer.name,
            unit_model.model_name,
            NULLIF(unit_model.model_number, '')
          ),
          CONCAT_WS(
            ' · ',
            processor_brand.name,
            NULLIF(processor_model.processor_family, ''),
            processor_model.model_code
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
      LEFT JOIN config_values comparison_operator
        ON comparison_operator.config_value_id = lr.comparison_operator_config_value_id
      LEFT JOIN config_values requirement_value
        ON requirement_value.config_value_id = lr.requirement_config_value_id
      LEFT JOIN manufacturers manufacturer
        ON manufacturer.manufacturer_id = lr.manufacturer_id
      LEFT JOIN unit_models unit_model
        ON unit_model.unit_model_id = lr.unit_model_id
      LEFT JOIN manufacturers model_manufacturer
        ON model_manufacturer.manufacturer_id = unit_model.manufacturer_id
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
    requirement_key: normalizeRequirementKey(row.requirement_key),
    operator_code: normalizeOperatorCode(row.operator_code),
    required_value: row.requirement_number !== null && row.requirement_number !== undefined
      ? String(Number(row.requirement_number))
      : row.required_value,
    required_value_token: getRequirementValueToken(row)
  }));
}

async function createLotRequirement(lotId, formData, currentUserId) {
  const requirementColumns = await getColumnSet('lot_requirements');
  const requirementKey = normalizeRequirementKey(formData.requirementKey);
  const operatorCode = normalizeOperatorCode(formData.operatorCode);
  const requirementTypeConfigValueId = await findConfigValueIdByCode(
    ['lot_requirement_types'],
    requirementKey
  );
  const comparisonOperatorConfigValueId = await findConfigValueIdByCode(
    ['comparison_operators'],
    operatorCode
  );

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
  const requirementTypeConfigValueId = await findConfigValueIdByCode(
    ['lot_requirement_types'],
    requirementKey
  );
  const comparisonOperatorConfigValueId = await findConfigValueIdByCode(
    ['comparison_operators'],
    operatorCode
  );

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


module.exports = {
  listLots,
  getLotById,
  getLotSummary,
  getLotFormOptions,
  getLotVisibilitySummary,
  setLotVisibility,
  getLotClosureSummary,
  setLotClosed,
  getLotSchemaCapabilities,
  createLot,
  updateLot,
  getLotDeleteSummary,
  deleteLotIfEmpty,
  listLotRequirements,
  getLotRequirementById,
  createLotRequirement,
  updateLotRequirement,
  deleteLotRequirement
};