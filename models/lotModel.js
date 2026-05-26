const crypto = require('crypto');
const { pool } = require('./db');

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

async function listParentLotOptions() {
  const lotColumns = await getColumnSet('lots');

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    "CONCAT('Lot #', l.lot_id)"
  );

  const lotCodeSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_code', 'code'],
    'lot_code',
    'NULL'
  );

  const isActiveWhere = hasColumn(lotColumns, 'is_active')
    ? 'WHERE l.is_active = 1'
    : '';

  const orderExpression = pickColumn(lotColumns, ['lot_name', 'name', 'title'])
    ? 'lot_name, l.lot_id'
    : 'l.lot_id DESC';

  const [rows] = await pool.query(`
    SELECT
      l.lot_id,
      ${lotNameSelect},
      ${lotCodeSelect}
    FROM lots l
    ${isActiveWhere}
    ORDER BY ${orderExpression}
    LIMIT 250
  `);

  return rows;
}

async function getLotSchemaCapabilities() {
  const lotColumns = await getColumnSet('lots');

  return {
    hasParentLotId: hasColumn(lotColumns, 'parent_lot_id'),
    hasLotType: hasColumn(lotColumns, 'lot_type_config_value_id'),
    hasDefaultGrade: hasColumn(lotColumns, 'default_grade_config_value_id'),
    hasUnitAmountGoal: Boolean(pickColumn(lotColumns, ['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'])),
    hasDeadline: Boolean(pickColumn(lotColumns, ['deadline', 'deadline_date', 'due_date'])),
    hasObjectives: Boolean(pickColumn(lotColumns, ['objectives', 'objective'])),
    hasNotes: Boolean(pickColumn(lotColumns, ['notes', 'note'])),
    hasLabelFormat: hasColumn(lotColumns, 'label_format')
  };
}

async function getLotFormOptions() {
  const [
    capabilities,
    lotTypeResult,
    gradeResult,
    parentLots
  ] = await Promise.all([
    getLotSchemaCapabilities(),
    listConfigValuesForFirstExistingCategory(['lot_types', 'lot_type']),
    listConfigValuesForFirstExistingCategory(['unit_grades', 'unit_grade', 'grades']),
    listParentLotOptions()
  ]);

  return {
    capabilities,
    lotTypes: lotTypeResult.values,
    lotTypeCategory: lotTypeResult.category,
    grades: gradeResult.values,
    gradeCategory: gradeResult.category,
    parentLots
  };
}

async function listLots() {
  const lotColumns = await getColumnSet('lots');
  const unitColumns = await getColumnSet('units');
  const lotRequirementColumns = await getColumnSet('lot_requirements');

  const hasLotType = hasColumn(lotColumns, 'lot_type_config_value_id');
  const hasDefaultGrade = hasColumn(lotColumns, 'default_grade_config_value_id');
  const hasUnitsLotId = hasColumn(unitColumns, 'lot_id');
  const hasRequirementsLotId = hasColumn(lotRequirementColumns, 'lot_id');

  const lotNameSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_name', 'name', 'title'],
    'lot_name',
    "CONCAT('Lot #', l.lot_id)"
  );

  const lotCodeSelect = selectExpression(
    'l',
    lotColumns,
    ['lot_code', 'code'],
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

  const defaultGradeJoin = hasDefaultGrade
    ? `
      LEFT JOIN config_values default_grade
        ON default_grade.config_value_id = l.default_grade_config_value_id
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

  const defaultGradeLabelSelect = hasDefaultGrade
    ? 'COALESCE(default_grade.label, default_grade.code) AS default_grade_label'
    : 'NULL AS default_grade_label';

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
      ${lotCodeSelect},
      ${lotTypeLabelSelect},
      ${defaultGradeLabelSelect},
      ${unitGoalSelect},
      ${deadlineSelect},
      ${objectivesSelect},
      ${notesSelect},
      ${labelFormatSelect},
      ${isActiveSelect},
      ${createdAtSelect},
      ${updatedAtSelect},
      ${unitCountSelect},
      ${requirementCountSelect}
    FROM lots l
    ${lotTypeJoin}
    ${defaultGradeJoin}
    ${unitCountJoin}
    ${requirementCountJoin}
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

async function getLotSummary() {
  const lots = await listLots();

  const activeLots = lots.filter((lot) => Number(lot.is_active) === 1);
  const fullLots = lots.filter((lot) => lot.isFull);
  const unlimitedLots = lots.filter((lot) => lot.isUnlimited);

  const totalUnits = lots.reduce((sum, lot) => sum + Number(lot.unitCount || 0), 0);
  const totalRequirements = lots.reduce((sum, lot) => sum + Number(lot.requirement_count || 0), 0);

  return {
    lotCount: lots.length,
    activeLotCount: activeLots.length,
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
  const hasUnlimitedGoal = formData.hasUnlimitedGoal === '1';
  const unitAmountGoal = hasUnlimitedGoal ? null : Number(formData.unitAmountGoal || 0);
  const deadline = formData.deadline ? String(formData.deadline).trim() : null;
  const objectives = String(formData.objectives || '').trim() || null;
  const notes = String(formData.notes || '').trim() || null;
  const labelFormat = String(formData.labelFormat || '').trim() || null;

  addFirstAvailableColumn(['lot_name', 'name', 'title'], lotName);
  addFirstAvailableColumn(['lot_code', 'code'], lotCode);
  addColumn('parent_lot_id', parentLotId);
  addColumn('lot_type_config_value_id', lotTypeConfigValueId);
  addFirstAvailableColumn(['unit_amount_goal', 'unit_goal', 'quantity_goal', 'target_unit_count'], unitAmountGoal);
  addColumn('default_grade_config_value_id', defaultGradeConfigValueId);
  addFirstAvailableColumn(['deadline', 'deadline_date', 'due_date'], deadline);
  addFirstAvailableColumn(['objectives', 'objective'], objectives);
  addFirstAvailableColumn(['notes', 'note'], notes);
  addColumn('label_format', labelFormat);
  addColumn('is_active', 1);
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

module.exports = {
  listLots,
  getLotSummary,
  getLotFormOptions,
  getLotSchemaCapabilities,
  createLot
};