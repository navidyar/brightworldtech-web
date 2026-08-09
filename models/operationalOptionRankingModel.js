const { pool } = require('./db');
const {
  createRankingSnapshot
} = require('../services/operationalOptionRanking');
const {
  ALLOWED_REFRESH_INTERVAL_MINUTES,
  normalizeRefreshIntervalMinutes,
  parseAllowedRefreshIntervalMinutes
} = require('../services/operationalOptionRankingAdministration');

const RANKING_TABLE = 'operational_option_usage_rankings';
const REFRESH_STATE_TABLE = 'operational_option_usage_refresh_state';
const REFRESH_LOCK_NAME = 'bwtdallas_operational_option_usage_refresh';
const DEFAULT_REFRESH_MINUTES = 120;
const MIN_REFRESH_MINUTES = 15;
const MAX_REFRESH_MINUTES = 1440;
const SCHEDULER_POLL_MINUTES = 15;
const SNAPSHOT_MEMORY_TTL_MS = 5 * 60 * 1000;

let snapshotCache = null;
let snapshotCacheExpiresAt = 0;
let snapshotPromise = null;

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeRefreshMinutes(value = process.env.CONFIG_USAGE_RANKING_REFRESH_MINUTES) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_REFRESH_MINUTES;
  }

  return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, Math.round(parsed)));
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS table_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return Number(rows[0].table_count) > 0;
}

async function getTableColumns(connection, tableName) {
  if (!await tableExists(connection, tableName)) {
    return new Set();
  }

  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name));
}

function pickColumn(columns, candidates) {
  return candidates.find((candidate) => columns.has(candidate)) || null;
}

async function getConfiguredRefreshMinutes(existingConnection = null) {
  const connection = existingConnection || await pool.getConnection();

  try {
    const columns = await getTableColumns(connection, REFRESH_STATE_TABLE);

    if (!columns.has('refresh_interval_minutes')) {
      return normalizeRefreshIntervalMinutes(process.env.CONFIG_USAGE_RANKING_REFRESH_MINUTES);
    }

    const [rows] = await connection.query(
      `
        SELECT refresh_interval_minutes
        FROM ${escapeIdentifier(REFRESH_STATE_TABLE)}
        WHERE refresh_key = 'operational_options'
        LIMIT 1
      `
    );

    return normalizeRefreshIntervalMinutes(
      rows[0]?.refresh_interval_minutes,
      process.env.CONFIG_USAGE_RANKING_REFRESH_MINUTES
    );
  } finally {
    if (!existingConnection) {
      connection.release();
    }
  }
}

async function setConfiguredRefreshMinutes(value) {
  const refreshMinutes = parseAllowedRefreshIntervalMinutes(value);

  if (!refreshMinutes) {
    const error = new Error(`Refresh interval must be one of: ${ALLOWED_REFRESH_INTERVAL_MINUTES.join(', ')} minutes.`);
    error.statusCode = 400;
    error.code = 'OPERATIONAL_RANKING_INTERVAL_INVALID';
    throw error;
  }

  const connection = await pool.getConnection();

  try {
    const columns = await getTableColumns(connection, REFRESH_STATE_TABLE);

    if (!columns.has('refresh_interval_minutes')) {
      const error = new Error('Stage 10W ranking administration storage is not ready.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_RANKING_ADMIN_NOT_READY';
      throw error;
    }

    await connection.query(
      `
        UPDATE ${escapeIdentifier(REFRESH_STATE_TABLE)}
        SET refresh_interval_minutes = ?,
            updated_at = NOW(6)
        WHERE refresh_key = 'operational_options'
        LIMIT 1
      `,
      [refreshMinutes]
    );

    const [stateRows] = await connection.query(
      `
        SELECT refresh_key
        FROM ${escapeIdentifier(REFRESH_STATE_TABLE)}
        WHERE refresh_key = 'operational_options'
        LIMIT 1
      `
    );

    if (stateRows.length !== 1) {
      const error = new Error('The operational ranking refresh state row could not be found.');
      error.statusCode = 409;
      error.code = 'OPERATIONAL_RANKING_STATE_MISSING';
      throw error;
    }

    return refreshMinutes;
  } finally {
    connection.release();
  }
}

async function listRankingScopeSummaries() {
  const connection = await pool.getConnection();

  try {
    if (!await tableExists(connection, RANKING_TABLE)) {
      return [];
    }

    const [rows] = await connection.query(
      `
        SELECT
          option_scope,
          context_scope,
          COUNT(*) AS ranking_row_count,
          COUNT(DISTINCT option_key) AS cached_value_count,
          COUNT(DISTINCT context_key) AS context_count
        FROM ${escapeIdentifier(RANKING_TABLE)}
        GROUP BY option_scope, context_scope
        ORDER BY option_scope, context_scope
      `
    );

    return rows;
  } finally {
    connection.release();
  }
}

function invalidateRankingSnapshot() {
  snapshotCache = null;
  snapshotCacheExpiresAt = 0;
  snapshotPromise = null;
}

async function loadRankingSnapshot() {
  const now = Date.now();

  if (snapshotCache && now < snapshotCacheExpiresAt) {
    return snapshotCache;
  }

  if (snapshotPromise) {
    return snapshotPromise;
  }

  snapshotPromise = (async () => {
    let connection = null;

    try {
      connection = await pool.getConnection();

      if (!await tableExists(connection, RANKING_TABLE)) {
        return createRankingSnapshot([]);
      }

      const [rows] = await connection.query(
        `
          SELECT
            option_scope,
            option_key,
            context_scope,
            context_key,
            lifetime_count,
            count_90d,
            count_30d,
            weighted_score,
            last_selected_at
          FROM ${escapeIdentifier(RANKING_TABLE)}
        `
      );

      return createRankingSnapshot(rows);
    } catch (error) {
      console.warn('Operational option rankings are unavailable; using canonical option order:', error.message || error);
      return createRankingSnapshot([]);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  })();

  try {
    snapshotCache = await snapshotPromise;
    snapshotCacheExpiresAt = Date.now() + SNAPSHOT_MEMORY_TTL_MS;
    return snapshotCache;
  } finally {
    snapshotPromise = null;
  }
}

function timestampExpressions(timestampExpression) {
  if (!timestampExpression) {
    return {
      count90d: '0',
      count30d: '0',
      lastSelectedAt: 'NULL'
    };
  }

  return {
    count90d: `SUM(CASE WHEN ${timestampExpression} >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END)`,
    count30d: `SUM(CASE WHEN ${timestampExpression} >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)`,
    lastSelectedAt: `MAX(${timestampExpression})`
  };
}

async function addRankingSource(connection, {
  optionScope,
  optionExpression,
  fromSql,
  whereSql,
  groupBySql,
  timestampExpression = null,
  contextScope = 'global',
  contextExpression = "'0'"
}) {
  const recent = timestampExpressions(timestampExpression);

  await connection.query(
    `
      INSERT INTO tmp_operational_option_usage_rankings (
        option_scope,
        option_key,
        context_scope,
        context_key,
        lifetime_count,
        count_90d,
        count_30d,
        weighted_score,
        last_selected_at,
        refreshed_at
      )
      SELECT
        ?,
        CAST(${optionExpression} AS CHAR),
        ?,
        CAST(${contextExpression} AS CHAR),
        COUNT(*) AS lifetime_count,
        ${recent.count90d} AS count_90d,
        ${recent.count30d} AS count_30d,
        COUNT(*) + (2 * (${recent.count90d})) + (4 * (${recent.count30d})) AS weighted_score,
        ${recent.lastSelectedAt} AS last_selected_at,
        NOW(6) AS refreshed_at
      ${fromSql}
      WHERE ${whereSql}
      GROUP BY ${groupBySql}
      ON DUPLICATE KEY UPDATE
        lifetime_count = lifetime_count + VALUES(lifetime_count),
        count_90d = count_90d + VALUES(count_90d),
        count_30d = count_30d + VALUES(count_30d),
        weighted_score = weighted_score + VALUES(weighted_score),
        last_selected_at = CASE
          WHEN last_selected_at IS NULL THEN VALUES(last_selected_at)
          WHEN VALUES(last_selected_at) IS NULL THEN last_selected_at
          ELSE GREATEST(last_selected_at, VALUES(last_selected_at))
        END,
        refreshed_at = VALUES(refreshed_at)
    `,
    [optionScope, contextScope]
  );
}

async function addUnitSources(connection) {
  const unitColumns = await getTableColumns(connection, 'units');

  if (unitColumns.size === 0) {
    return;
  }

  const timestampColumn = pickColumn(unitColumns, ['updated_at', 'created_at']);
  const timestampExpression = timestampColumn ? `u.${escapeIdentifier(timestampColumn)}` : null;
  const unitValidityConditions = [];

  if (unitColumns.has('is_deleted')) {
    unitValidityConditions.push('COALESCE(u.is_deleted, 0) = 0');
  }

  if (unitColumns.has('deleted_at')) {
    unitValidityConditions.push('u.deleted_at IS NULL');
  }

  const unitValiditySql = unitValidityConditions.length > 0
    ? ` AND ${unitValidityConditions.join(' AND ')}`
    : '';

  const simpleSources = [
    ['unit_category', 'unit_category_config_value_id'],
    ['manufacturer', 'manufacturer_id'],
    ['operating_system', 'operating_system_config_value_id']
  ];

  for (const [optionScope, columnName] of simpleSources) {
    if (!unitColumns.has(columnName)) {
      continue;
    }

    await addRankingSource(connection, {
      optionScope,
      optionExpression: `u.${escapeIdentifier(columnName)}`,
      fromSql: 'FROM units u',
      whereSql: `u.${escapeIdentifier(columnName)} IS NOT NULL${unitValiditySql}`,
      groupBySql: `u.${escapeIdentifier(columnName)}`,
      timestampExpression
    });
  }

  if (unitColumns.has('unit_model_id')) {
    const modelColumns = await getTableColumns(connection, 'unit_models');
    const hasModelManufacturer = modelColumns.has('manufacturer_id');
    const hasUnitManufacturer = unitColumns.has('manufacturer_id');
    const contextExpression = hasUnitManufacturer && hasModelManufacturer
      ? 'COALESCE(u.manufacturer_id, um.manufacturer_id)'
      : hasUnitManufacturer
        ? 'u.manufacturer_id'
        : hasModelManufacturer
          ? 'um.manufacturer_id'
          : "'0'";
    const contextGroupBySql = hasUnitManufacturer && hasModelManufacturer
      ? 'u.unit_model_id, u.manufacturer_id, um.manufacturer_id'
      : hasUnitManufacturer
        ? 'u.unit_model_id, u.manufacturer_id'
        : hasModelManufacturer
          ? 'u.unit_model_id, um.manufacturer_id'
          : 'u.unit_model_id';
    const modelJoin = hasModelManufacturer
      ? 'LEFT JOIN unit_models um ON um.unit_model_id = u.unit_model_id'
      : '';

    await addRankingSource(connection, {
      optionScope: 'unit_model',
      optionExpression: 'u.unit_model_id',
      contextScope: 'manufacturer',
      contextExpression,
      fromSql: `FROM units u ${modelJoin}`,
      whereSql: `u.unit_model_id IS NOT NULL AND ${contextExpression} IS NOT NULL${unitValiditySql}`,
      groupBySql: contextGroupBySql,
      timestampExpression
    });
  }

  if (unitColumns.has('processor_model_id')) {
    const processorColumns = await getTableColumns(connection, 'processor_models');
    const brandColumn = pickColumn(processorColumns, ['processor_brand_id', 'brand_id']);
    const modelContextExpression = unitColumns.has('unit_model_id') ? 'u.unit_model_id' : "'0'";

    await addRankingSource(connection, {
      optionScope: 'processor_model',
      optionExpression: 'u.processor_model_id',
      fromSql: 'FROM units u',
      whereSql: `u.processor_model_id IS NOT NULL${unitValiditySql}`,
      groupBySql: 'u.processor_model_id',
      timestampExpression
    });

    if (unitColumns.has('unit_model_id')) {
      await addRankingSource(connection, {
        optionScope: 'processor_model',
        optionExpression: 'u.processor_model_id',
        contextScope: 'unit_model',
        contextExpression: modelContextExpression,
        fromSql: 'FROM units u',
        whereSql: `u.processor_model_id IS NOT NULL AND u.unit_model_id IS NOT NULL${unitValiditySql}`,
        groupBySql: 'u.processor_model_id, u.unit_model_id',
        timestampExpression
      });
    }

    if (brandColumn) {
      const processorTimestampExpression = timestampColumn ? `u.${escapeIdentifier(timestampColumn)}` : null;

      await addRankingSource(connection, {
        optionScope: 'processor_brand',
        optionExpression: `pm.${escapeIdentifier(brandColumn)}`,
        fromSql: 'FROM units u INNER JOIN processor_models pm ON pm.processor_model_id = u.processor_model_id',
        whereSql: `u.processor_model_id IS NOT NULL AND pm.${escapeIdentifier(brandColumn)} IS NOT NULL${unitValiditySql}`,
        groupBySql: `pm.${escapeIdentifier(brandColumn)}`,
        timestampExpression: processorTimestampExpression
      });

      if (unitColumns.has('unit_model_id')) {
        await addRankingSource(connection, {
          optionScope: 'processor_brand',
          optionExpression: `pm.${escapeIdentifier(brandColumn)}`,
          contextScope: 'unit_model',
          contextExpression: 'u.unit_model_id',
          fromSql: 'FROM units u INNER JOIN processor_models pm ON pm.processor_model_id = u.processor_model_id',
          whereSql: `u.processor_model_id IS NOT NULL AND u.unit_model_id IS NOT NULL AND pm.${escapeIdentifier(brandColumn)} IS NOT NULL${unitValiditySql}`,
          groupBySql: `pm.${escapeIdentifier(brandColumn)}, u.unit_model_id`,
          timestampExpression: processorTimestampExpression
        });
      }
    }
  }
}

async function addComponentSources(connection) {
  const memorySources = [
    ['unit_memory_modules', true],
    ['unit_previous_memory_modules', false]
  ];

  for (const [tableName, currentOnly] of memorySources) {
    const columns = await getTableColumns(connection, tableName);

    if (columns.size === 0) {
      continue;
    }

    const alias = 'm';
    const timestampColumn = currentOnly ? pickColumn(columns, ['updated_at', 'created_at', 'installed_at']) : null;
    const timestampExpression = timestampColumn ? `${alias}.${escapeIdentifier(timestampColumn)}` : null;
    const currentFilter = currentOnly && columns.has('is_current') ? ` AND ${alias}.is_current = 1` : '';

    if (columns.has('ram_type_config_value_id')) {
      await addRankingSource(connection, {
        optionScope: 'ram_type',
        optionExpression: `${alias}.ram_type_config_value_id`,
        fromSql: `FROM ${escapeIdentifier(tableName)} ${alias}`,
        whereSql: `${alias}.ram_type_config_value_id IS NOT NULL${currentFilter}`,
        groupBySql: `${alias}.ram_type_config_value_id`,
        timestampExpression
      });
    }

    if (columns.has('memory_install_type_code')) {
      await addRankingSource(connection, {
        optionScope: 'memory_install_type',
        optionExpression: `${alias}.memory_install_type_code`,
        fromSql: `FROM ${escapeIdentifier(tableName)} ${alias}`,
        whereSql: `NULLIF(TRIM(${alias}.memory_install_type_code), '') IS NOT NULL${currentFilter}`,
        groupBySql: `${alias}.memory_install_type_code`,
        timestampExpression
      });
    }
  }

  const storageSources = [
    ['unit_storage_devices', true],
    ['unit_previous_storage_devices', false]
  ];

  for (const [tableName, currentOnly] of storageSources) {
    const columns = await getTableColumns(connection, tableName);

    if (columns.size === 0) {
      continue;
    }

    const alias = 's';
    const timestampColumn = currentOnly ? pickColumn(columns, ['updated_at', 'created_at', 'installed_at']) : null;
    const timestampExpression = timestampColumn ? `${alias}.${escapeIdentifier(timestampColumn)}` : null;
    const currentFilter = currentOnly && columns.has('is_current') ? ` AND ${alias}.is_current = 1` : '';

    if (columns.has('storage_type_config_value_id')) {
      await addRankingSource(connection, {
        optionScope: 'storage_type',
        optionExpression: `${alias}.storage_type_config_value_id`,
        fromSql: `FROM ${escapeIdentifier(tableName)} ${alias}`,
        whereSql: `${alias}.storage_type_config_value_id IS NOT NULL${currentFilter}`,
        groupBySql: `${alias}.storage_type_config_value_id`,
        timestampExpression
      });
    }

    if (currentOnly && columns.has('wipe_status_config_value_id')) {
      await addRankingSource(connection, {
        optionScope: 'storage_wipe_status',
        optionExpression: `${alias}.wipe_status_config_value_id`,
        fromSql: `FROM ${escapeIdentifier(tableName)} ${alias}`,
        whereSql: `${alias}.wipe_status_config_value_id IS NOT NULL${currentFilter}`,
        groupBySql: `${alias}.wipe_status_config_value_id`,
        timestampExpression
      });
    }
  }
}

async function addExpandedAndIssueSources(connection) {
  const specificationColumns = await getTableColumns(connection, 'unit_specifications');

  if (specificationColumns.has('keyboard_language_config_value_id')) {
    const timestampColumn = pickColumn(specificationColumns, ['updated_at', 'created_at']);

    await addRankingSource(connection, {
      optionScope: 'keyboard_language',
      optionExpression: 'us.keyboard_language_config_value_id',
      fromSql: 'FROM unit_specifications us',
      whereSql: 'us.keyboard_language_config_value_id IS NOT NULL',
      groupBySql: 'us.keyboard_language_config_value_id',
      timestampExpression: timestampColumn ? `us.${escapeIdentifier(timestampColumn)}` : null
    });
  }

  const graphicsColumns = await getTableColumns(connection, 'unit_graphics_adapters');

  if (graphicsColumns.has('gpu_type_config_value_id')) {
    const timestampColumn = pickColumn(graphicsColumns, ['updated_at', 'created_at']);
    const currentFilter = graphicsColumns.has('is_current') ? ' AND uga.is_current = 1' : '';

    await addRankingSource(connection, {
      optionScope: 'gpu_type',
      optionExpression: 'uga.gpu_type_config_value_id',
      fromSql: 'FROM unit_graphics_adapters uga',
      whereSql: `uga.gpu_type_config_value_id IS NOT NULL${currentFilter}`,
      groupBySql: 'uga.gpu_type_config_value_id',
      timestampExpression: timestampColumn ? `uga.${escapeIdentifier(timestampColumn)}` : null
    });
  }

  const issueColumns = await getTableColumns(connection, 'unit_issue_entries');

  if (issueColumns.size > 0) {
    const timestampColumn = pickColumn(issueColumns, ['updated_at', 'created_at']);
    const timestampExpression = timestampColumn ? `uie.${escapeIdentifier(timestampColumn)}` : null;
    const currentFilter = issueColumns.has('is_current') ? ' AND uie.is_current = 1' : '';

    if (issueColumns.has('issue_type_config_value_id') && issueColumns.has('issue_area')) {
      for (const [issueArea, optionScope] of [['cosmetic', 'cosmetic_issue_type'], ['hardware', 'hardware_issue_type']]) {
        await addRankingSource(connection, {
          optionScope,
          optionExpression: 'uie.issue_type_config_value_id',
          fromSql: 'FROM unit_issue_entries uie',
          whereSql: `uie.issue_type_config_value_id IS NOT NULL AND uie.issue_area = '${issueArea}'${currentFilter}`,
          groupBySql: 'uie.issue_type_config_value_id',
          timestampExpression
        });
      }
    }

    if (issueColumns.has('location_config_value_id')) {
      await addRankingSource(connection, {
        optionScope: 'issue_location',
        optionExpression: 'uie.location_config_value_id',
        fromSql: 'FROM unit_issue_entries uie',
        whereSql: `uie.location_config_value_id IS NOT NULL${currentFilter}`,
        groupBySql: 'uie.location_config_value_id',
        timestampExpression
      });
    }
  }
}

async function setRefreshState(connection, values = {}) {
  if (!await tableExists(connection, REFRESH_STATE_TABLE)) {
    return;
  }

  await connection.query(
    `
      INSERT INTO ${escapeIdentifier(REFRESH_STATE_TABLE)} (
        refresh_key,
        status,
        started_at,
        completed_at,
        duration_ms,
        ranking_row_count,
        last_error,
        updated_at
      )
      VALUES ('operational_options', ?, ?, ?, ?, ?, ?, NOW(6))
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        started_at = VALUES(started_at),
        completed_at = CASE
          WHEN VALUES(status) = 'complete' THEN VALUES(completed_at)
          ELSE completed_at
        END,
        duration_ms = CASE
          WHEN VALUES(status) = 'complete' THEN VALUES(duration_ms)
          ELSE duration_ms
        END,
        ranking_row_count = CASE
          WHEN VALUES(status) = 'complete' THEN VALUES(ranking_row_count)
          ELSE ranking_row_count
        END,
        last_error = VALUES(last_error),
        updated_at = NOW(6)
    `,
    [
      values.status || 'idle',
      values.startedAt || null,
      values.completedAt || null,
      values.durationMs ?? null,
      values.rankingRowCount ?? null,
      values.lastError || null
    ]
  );
}

async function refreshOperationalOptionUsageRankings() {
  const connection = await pool.getConnection();
  const startedAt = new Date();
  const startMs = Date.now();
  let lockAcquired = false;

  try {
    if (!await tableExists(connection, RANKING_TABLE) || !await tableExists(connection, REFRESH_STATE_TABLE)) {
      return { supported: false, refreshed: false, reason: 'Stage 10M ranking tables are not ready.' };
    }

    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [REFRESH_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;

    if (!lockAcquired) {
      return { supported: true, refreshed: false, reason: 'Another ranking refresh is already running.' };
    }

    await setRefreshState(connection, {
      status: 'running',
      startedAt,
      completedAt: null,
      durationMs: null,
      rankingRowCount: null,
      lastError: null
    });

    await connection.beginTransaction();
    await connection.query('DROP TEMPORARY TABLE IF EXISTS tmp_operational_option_usage_rankings');
    await connection.query(
      `
        CREATE TEMPORARY TABLE tmp_operational_option_usage_rankings LIKE ${escapeIdentifier(RANKING_TABLE)}
      `
    );

    await addUnitSources(connection);
    await addComponentSources(connection);
    await addExpandedAndIssueSources(connection);

    const [countRows] = await connection.query('SELECT COUNT(*) AS ranking_row_count FROM tmp_operational_option_usage_rankings');
    const rankingRowCount = Number(countRows[0]?.ranking_row_count || 0);

    await connection.query(`DELETE FROM ${escapeIdentifier(RANKING_TABLE)}`);
    await connection.query(
      `
        INSERT INTO ${escapeIdentifier(RANKING_TABLE)} (
          option_scope,
          option_key,
          context_scope,
          context_key,
          lifetime_count,
          count_90d,
          count_30d,
          weighted_score,
          last_selected_at,
          refreshed_at
        )
        SELECT
          option_scope,
          option_key,
          context_scope,
          context_key,
          lifetime_count,
          count_90d,
          count_30d,
          weighted_score,
          last_selected_at,
          refreshed_at
        FROM tmp_operational_option_usage_rankings
      `
    );

    await connection.commit();

    const completedAt = new Date();
    const durationMs = Date.now() - startMs;
    await setRefreshState(connection, {
      status: 'complete',
      startedAt,
      completedAt,
      durationMs,
      rankingRowCount,
      lastError: null
    });

    invalidateRankingSnapshot();

    return {
      supported: true,
      refreshed: true,
      rankingRowCount,
      durationMs,
      startedAt,
      completedAt
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Operational option ranking rollback failed:', rollbackError);
    }

    try {
      await setRefreshState(connection, {
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startMs,
        rankingRowCount: null,
        lastError: String(error.message || error).slice(0, 2000)
      });
    } catch (stateError) {
      console.error('Operational option ranking state update failed:', stateError);
    }

    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [REFRESH_LOCK_NAME]);
      } catch (releaseError) {
        console.error('Operational option ranking lock release failed:', releaseError);
      }
    }

    connection.release();
  }
}

async function getRefreshState() {
  const connection = await pool.getConnection();

  try {
    const columns = await getTableColumns(connection, REFRESH_STATE_TABLE);

    if (columns.size === 0) {
      return null;
    }

    const refreshIntervalExpression = columns.has('refresh_interval_minutes')
      ? 'refresh_interval_minutes'
      : `${normalizeRefreshIntervalMinutes(process.env.CONFIG_USAGE_RANKING_REFRESH_MINUTES)} AS refresh_interval_minutes`;
    const [rows] = await connection.query(
      `
        SELECT
          refresh_key,
          ${refreshIntervalExpression},
          status,
          started_at,
          completed_at,
          duration_ms,
          ranking_row_count,
          last_error,
          updated_at
        FROM ${escapeIdentifier(REFRESH_STATE_TABLE)}
        WHERE refresh_key = 'operational_options'
        LIMIT 1
      `
    );

    return rows[0] || null;
  } finally {
    connection.release();
  }
}

async function refreshOperationalOptionUsageRankingsIfStale(options = {}) {
  const requestedRefreshMinutes = options.refreshMinutes === undefined
    ? await getConfiguredRefreshMinutes()
    : normalizeRefreshIntervalMinutes(options.refreshMinutes);
  const refreshMinutes = normalizeRefreshIntervalMinutes(requestedRefreshMinutes);
  const state = await getRefreshState();
  const completedAt = state?.completed_at ? new Date(state.completed_at) : null;
  const staleBefore = Date.now() - (refreshMinutes * 60 * 1000);

  if (completedAt && completedAt.getTime() > staleBefore && state.status === 'complete') {
    return {
      supported: true,
      refreshed: false,
      reason: 'Ranking cache is still fresh.',
      refreshMinutes,
      completedAt
    };
  }

  return refreshOperationalOptionUsageRankings();
}

function scheduleOperationalOptionUsageRankingRefresh() {
  const pollIntervalMs = SCHEDULER_POLL_MINUTES * 60 * 1000;

  const runRefresh = async () => {
    try {
      const result = await refreshOperationalOptionUsageRankingsIfStale();

      if (!result.supported) {
        console.warn('Operational option ranking refresh skipped because Stage 10M storage is not ready.');
        return;
      }

      if (result.refreshed) {
        console.log(`Operational option rankings refreshed ${result.rankingRowCount} row(s) in ${result.durationMs}ms.`);
      }
    } catch (error) {
      console.error('Operational option ranking refresh failed:', error);
    }
  };

  const startupTimer = setTimeout(() => {
    void runRefresh();
  }, 15 * 1000);
  startupTimer.unref();

  const intervalTimer = setInterval(() => {
    void runRefresh();
  }, pollIntervalMs);
  intervalTimer.unref();

  return {
    pollMinutes: SCHEDULER_POLL_MINUTES,
    startupTimer,
    intervalTimer
  };
}

module.exports = {
  DEFAULT_REFRESH_MINUTES,
  SCHEDULER_POLL_MINUTES,
  getConfiguredRefreshMinutes,
  getRefreshState,
  invalidateRankingSnapshot,
  listRankingScopeSummaries,
  loadRankingSnapshot,
  normalizeRefreshMinutes,
  refreshOperationalOptionUsageRankings,
  refreshOperationalOptionUsageRankingsIfStale,
  scheduleOperationalOptionUsageRankingRefresh,
  setConfiguredRefreshMinutes
};
