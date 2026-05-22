const { pool, testConnection, getMissingEnvKeys } = require('./db');

const REQUIRED_TABLES = [
  'config_categories',
  'config_values',
  'roles',
  'users',
  'user_roles',
  'user_password_links',
  'manufacturers',
  'unit_models',
  'processor_brands',
  'processor_models',
  'lots',
  'lot_requirements',
  'units',
  'unit_identifiers',
  'unit_work_sessions',
  'unit_work_session_tasks',
  'unit_support_tasks',
  'unit_takeover_requests',
  'unit_completion_credits',
  'unit_status_history',
  'unit_qc_checks',
  'unit_lot_validation_overrides',
  'unit_lot_history',
  'unit_issue_flags',
  'scan_batches',
  'scan_batch_items',
  'productivity_events'
];

const REQUIRED_VIEWS = [
  'unit_asset_tags',
  'tech_daily_productivity'
];

const SUMMARY_TABLES = [
  'config_categories',
  'config_values',
  'roles',
  'users',
  'manufacturers',
  'unit_models',
  'processor_brands',
  'processor_models',
  'lots',
  'units',
  'productivity_events'
];

function quoteIdentifier(identifier) {
  if (!SUMMARY_TABLES.includes(identifier)) {
    throw new Error(`Unsafe table name requested: ${identifier}`);
  }

  return `\`${identifier.replace(/`/g, '``')}\``;
}

async function countRows(tableName) {
  const quotedTable = quoteIdentifier(tableName);
  const [rows] = await pool.query(`SELECT COUNT(*) AS row_count FROM ${quotedTable}`);
  return Number(rows[0].row_count || 0);
}

async function getSchemaStatus() {
  const connectionInfo = await testConnection();

  const [objectRows] = await pool.query(`
    SELECT
      table_name AS objectName,
      table_type AS objectType
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
    ORDER BY table_name
  `);

  const existingTables = objectRows
    .filter((row) => row.objectType === 'BASE TABLE')
    .map((row) => row.objectName);

  const existingViews = objectRows
    .filter((row) => row.objectType === 'VIEW')
    .map((row) => row.objectName);

  const existingTableSet = new Set(existingTables);
  const existingViewSet = new Set(existingViews);

  const requiredTables = REQUIRED_TABLES.map((tableName) => ({
    tableName,
    exists: existingTableSet.has(tableName)
  }));

  const requiredViews = REQUIRED_VIEWS.map((viewName) => ({
    viewName,
    exists: existingViewSet.has(viewName)
  }));

  const missingTables = requiredTables
    .filter((table) => !table.exists)
    .map((table) => table.tableName);

  const missingViews = requiredViews
    .filter((view) => !view.exists)
    .map((view) => view.viewName);

  const summaryCounts = [];

  for (const tableName of SUMMARY_TABLES) {
    if (existingTableSet.has(tableName)) {
      summaryCounts.push({
        tableName,
        rowCount: await countRows(tableName)
      });
    } else {
      summaryCounts.push({
        tableName,
        rowCount: null
      });
    }
  }

  return {
    ok: missingTables.length === 0 && missingViews.length === 0,
    connectionInfo,
    existingTables,
    existingViews,
    tableCount: existingTables.length,
    viewCount: existingViews.length,
    objectCount: objectRows.length,
    requiredTables,
    requiredViews,
    missingTables,
    missingViews,
    summaryCounts
  };
}

async function getFoundationStatus() {
  const missingEnvKeys = getMissingEnvKeys();

  if (missingEnvKeys.length > 0) {
    return {
      database: {
        connected: false,
        error: `Missing required database environment values: ${missingEnvKeys.join(', ')}`
      },
      schema: {
        ok: false,
        tableCount: 0,
        viewCount: 0,
        objectCount: 0,
        requiredTables: [],
        requiredViews: [],
        missingTables: [],
        missingViews: [],
        summaryCounts: []
      }
    };
  }

  try {
    const schemaStatus = await getSchemaStatus();

    return {
      database: {
        connected: true,
        connectionInfo: schemaStatus.connectionInfo
      },
      schema: schemaStatus
    };
  } catch (error) {
    return {
      database: {
        connected: false,
        error: error.message
      },
      schema: {
        ok: false,
        tableCount: 0,
        viewCount: 0,
        objectCount: 0,
        requiredTables: [],
        requiredViews: [],
        missingTables: [],
        missingViews: [],
        summaryCounts: []
      }
    };
  }
}

module.exports = {
  getFoundationStatus,
  getSchemaStatus
};