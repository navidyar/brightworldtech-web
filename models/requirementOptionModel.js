const { pool } = require('./db');

const REQUIREMENT_OPTION_CATEGORY_MAP = {
  unit_type: ['unit_types', 'unit_type', 'unit_categories', 'unit_category'],
  manufacturer: ['manufacturers', 'manufacturer', 'makes', 'make', 'brands', 'brand'],
  model: ['unit_models', 'unit_model', 'models', 'model'],
  ram_size: ['ram_sizes', 'ram_size', 'memory_sizes', 'memory_size'],
  ram_type: ['ram_types', 'ram_type', 'memory_types', 'memory_type'],
  storage_size: ['storage_sizes', 'storage_size', 'ssd_sizes', 'ssd_size', 'drive_sizes', 'drive_size'],
  storage_type: ['storage_types', 'storage_type', 'ssd_types', 'ssd_type', 'drive_types', 'drive_type'],
  processor_brand: ['processor_brands', 'processor_brand', 'cpu_brands', 'cpu_brand'],
  processor_model: ['processor_models', 'processor_model', 'cpu_models', 'cpu_model', 'processors', 'processor'],
  touchscreen: ['touchscreen_options', 'touchscreen', 'yes_no_options', 'yes_no', 'boolean_options']
};

const FALLBACK_OPTIONS = {
  touchscreen: [
    {
      value: 'yes',
      label: 'Yes',
      code: 'yes',
      source: 'fallback'
    },
    {
      value: 'no',
      label: 'No',
      code: 'no',
      source: 'fallback'
    },
    {
      value: 'any',
      label: 'Any / Either',
      code: 'any',
      source: 'fallback'
    }
  ]
};

async function getColumnSet(tableName) {
  const allowedTables = ['config_categories', 'config_values'];

  if (!allowedTables.includes(tableName)) {
    throw new Error(`Unsupported table for requirement option inspection: ${tableName}`);
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

async function listValuesForCategoryCodes(categoryCodes) {
  const categoryColumns = await getColumnSet('config_categories');
  const valueColumns = await getColumnSet('config_values');

  if (!hasColumn(categoryColumns, 'config_category_id') || !hasColumn(categoryColumns, 'code')) {
    return {
      categoryCode: null,
      options: []
    };
  }

  if (!hasColumn(valueColumns, 'config_value_id') || !hasColumn(valueColumns, 'config_category_id') || !hasColumn(valueColumns, 'code')) {
    return {
      categoryCode: null,
      options: []
    };
  }

  const valueLabelColumn = pickColumn(valueColumns, ['label', 'name']);
  const valueDescriptionColumn = pickColumn(valueColumns, ['description']);
  const valueSortColumn = pickColumn(valueColumns, ['sort_order']);
  const valueActiveColumn = pickColumn(valueColumns, ['is_active']);

  const categoryPlaceholders = categoryCodes.map(() => '?').join(', ');
  const categoryOrderPlaceholders = categoryCodes.map(() => '?').join(', ');

  const [categoryRows] = await pool.query(
    `
      SELECT
        config_category_id,
        code
      FROM config_categories
      WHERE code IN (${categoryPlaceholders})
      ORDER BY FIELD(code, ${categoryOrderPlaceholders})
    `,
    [...categoryCodes, ...categoryCodes]
  );

  for (const category of categoryRows) {
    const activeFilter = valueActiveColumn ? 'AND is_active = 1' : '';
    const labelExpression = valueLabelColumn ? `\`${valueLabelColumn}\`` : '`code`';
    const descriptionExpression = valueDescriptionColumn ? `\`${valueDescriptionColumn}\`` : 'NULL';
    const sortExpression = valueSortColumn ? `\`${valueSortColumn}\`` : '0';

    const [valueRows] = await pool.query(
      `
        SELECT
          config_value_id,
          code,
          ${labelExpression} AS label,
          ${descriptionExpression} AS description,
          ${sortExpression} AS sort_order
        FROM config_values
        WHERE config_category_id = ?
          ${activeFilter}
        ORDER BY sort_order, label, code
      `,
      [category.config_category_id]
    );

    if (valueRows.length > 0) {
      return {
        categoryCode: category.code,
        options: valueRows.map((row) => ({
          value: row.label || row.code,
          label: row.label || row.code,
          code: row.code,
          description: row.description || '',
          configValueId: row.config_value_id,
          source: category.code
        }))
      };
    }
  }

  return {
    categoryCode: null,
    options: []
  };
}

async function getRequirementValueOptionsByKey(requirementKeys) {
  const optionMap = {};

  for (const requirementKey of requirementKeys) {
    const categoryCodes = REQUIREMENT_OPTION_CATEGORY_MAP[requirementKey] || [];
    const result = await listValuesForCategoryCodes(categoryCodes);

    if (result.options.length > 0) {
      optionMap[requirementKey] = {
        type: 'select',
        source: result.categoryCode,
        options: result.options
      };

      continue;
    }

    if (FALLBACK_OPTIONS[requirementKey]) {
      optionMap[requirementKey] = {
        type: 'select',
        source: 'fallback',
        options: FALLBACK_OPTIONS[requirementKey]
      };

      continue;
    }

    optionMap[requirementKey] = {
      type: 'text',
      source: null,
      options: []
    };
  }

  return optionMap;
}

module.exports = {
  getRequirementValueOptionsByKey
};