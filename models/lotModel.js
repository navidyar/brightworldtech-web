const { pool } = require('./db');

const INSPECTABLE_TABLES = ['lots', 'units', 'lot_requirements'];

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

module.exports = {
  listLots,
  getLotSummary
};