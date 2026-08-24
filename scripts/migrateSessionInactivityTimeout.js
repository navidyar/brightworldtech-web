'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const {
  SYSTEM_CONFIG_CATEGORY_IDS,
  SYSTEM_CONFIG_VALUE_IDS
} = require('../config/configIdentityRegistry');
const {
  DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES,
  parseSessionInactivityTimeoutMinutes
} = require('../services/sessionInactivityTimeoutPolicy');

const APPLY = process.argv.includes('--apply');
const LABEL = 'Session inactivity timeout (minutes)';
const LEGACY_CODES = ['session_inactivity_timeout_minutes', 'session_timeout_minutes'];
const DESCRIPTION = 'Automatically signs users out after this many minutes without application activity.';

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
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
  return new Set(rows.map((row) => row.column_name));
}

async function getSecurityCategoryId(connection) {
  const [rows] = await connection.query(
    `SELECT config_category_id
     FROM system_config_categories
     WHERE system_config_category_id = ?
     LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.SECURITY_SETTINGS]
  );
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function getBoundSetting(connection, valueColumns) {
  const labelExpression = valueColumns.has('label')
    ? 'cv.label'
    : valueColumns.has('name') ? 'cv.name' : 'NULL';
  const activeExpression = valueColumns.has('is_active') ? 'cv.is_active' : '1';
  const protectedExpression = valueColumns.has('is_protected') ? 'cv.is_protected' : '0';

  const [rows] = await connection.query(
    `SELECT
       cv.config_value_id,
       cv.config_category_id,
       ${labelExpression} AS label,
       cv.value,
       ${activeExpression} AS is_active,
       ${protectedExpression} AS is_protected
     FROM system_config_values scv
     INNER JOIN config_values cv ON cv.config_value_id = scv.config_value_id
     WHERE scv.system_config_value_id = ?
     LIMIT 1`,
    [SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES]
  );

  return rows[0] || null;
}

async function findCandidateSettings(connection, securityCategoryId, valueColumns) {
  const clauses = [];
  const params = [securityCategoryId];

  if (valueColumns.has('code')) {
    clauses.push(`LOWER(TRIM(cv.\`code\`)) IN (${LEGACY_CODES.map(() => '?').join(', ')})`);
    params.push(...LEGACY_CODES);
  }

  const labelColumns = ['label', 'name'].filter((column) => valueColumns.has(column));
  for (const column of labelColumns) {
    clauses.push(`LOWER(TRIM(cv.\`${column}\`)) IN (?, ?)`);
    params.push(LABEL.toLowerCase(), 'session inactivity timeout minutes');
  }

  if (clauses.length === 0) return [];

  const labelExpression = valueColumns.has('label')
    ? 'cv.label'
    : valueColumns.has('name') ? 'cv.name' : 'NULL';
  const activeExpression = valueColumns.has('is_active') ? 'cv.is_active' : '1';
  const protectedExpression = valueColumns.has('is_protected') ? 'cv.is_protected' : '0';

  const [rows] = await connection.query(
    `SELECT cv.config_value_id, cv.config_category_id, ${labelExpression} AS label, cv.value,
            ${activeExpression} AS is_active,
            ${protectedExpression} AS is_protected,
            scv.system_config_value_id AS bound_system_config_value_id
     FROM config_values cv
     LEFT JOIN system_config_values scv ON scv.config_value_id = cv.config_value_id
     WHERE cv.config_category_id = ?
       AND (${clauses.join(' OR ')})
     ORDER BY cv.config_value_id`,
    params
  );

  return rows;
}

async function inspect(connection) {
  const requiredTables = ['config_values', 'system_config_categories', 'system_config_values'];
  const missingTables = [];
  for (const tableName of requiredTables) {
    if (!await tableExists(connection, tableName)) missingTables.push(tableName);
  }

  const blockingIssues = [];
  const plannedChanges = [];
  if (missingTables.length > 0) {
    blockingIssues.push(`Missing required table(s): ${missingTables.join(', ')}`);
    return { blockingIssues, plannedChanges, missingTables };
  }

  const valueColumns = await getColumnSet(connection, 'config_values');
  const requiredColumns = ['config_value_id', 'config_category_id', 'value', 'is_protected'];
  const missingColumns = requiredColumns.filter((column) => !valueColumns.has(column));
  if (missingColumns.length > 0) {
    blockingIssues.push(`config_values is missing required column(s): ${missingColumns.join(', ')}`);
  }
  if (!valueColumns.has('label') && !valueColumns.has('name')) {
    blockingIssues.push('config_values needs a label or name column.');
  }

  const securityCategoryId = blockingIssues.length === 0
    ? await getSecurityCategoryId(connection)
    : null;
  if (!securityCategoryId) {
    blockingIssues.push('Security Settings is not bound in system_config_categories. Run the configuration identity migration first.');
  }

  let setting = null;
  let candidates = [];
  if (blockingIssues.length === 0) {
    setting = await getBoundSetting(connection, valueColumns);
    if (!setting) {
      candidates = await findCandidateSettings(connection, securityCategoryId, valueColumns);
      if (candidates.length > 1) {
        blockingIssues.push(`Found ${candidates.length} possible Session inactivity timeout values. Resolve the duplicates before applying.`);
      } else if (candidates.length === 1) {
        const candidateBinding = Number(candidates[0].bound_system_config_value_id || 0);
        if (candidateBinding && candidateBinding !== SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES) {
          blockingIssues.push(`The matching config value is already bound to system config value ${candidateBinding}.`);
        } else {
          setting = candidates[0];
          plannedChanges.push('bind_existing_session_inactivity_timeout');
        }
      } else {
        plannedChanges.push('create_session_inactivity_timeout_default_120');
      }
    }
  }

  if (setting) {
    if (Number(setting.config_category_id) !== Number(securityCategoryId)) {
      blockingIssues.push('The bound Session inactivity timeout value is outside the Security Settings category.');
    }
    if (parseSessionInactivityTimeoutMinutes(setting.value) === null) {
      plannedChanges.push('normalize_invalid_timeout_to_120');
    }
    if (Number(setting.is_active) !== 1 && valueColumns.has('is_active')) {
      plannedChanges.push('activate_session_inactivity_timeout');
    }
    if (Number(setting.is_protected) !== 1) {
      plannedChanges.push('protect_session_inactivity_timeout');
    }
  }

  return {
    blockingIssues,
    plannedChanges,
    securityCategoryId,
    valueColumns,
    setting,
    candidates
  };
}

function printReport(state, mode) {
  console.log(`\nSession inactivity timeout migration (${mode})`);
  console.log(`Default timeout: ${DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES} minutes (2 hours)`);

  if (state.setting) {
    console.log(`Current stored value: ${state.setting.value ?? '(blank)'} minutes`);
    console.log(`Config value ID: ${state.setting.config_value_id}`);
  } else {
    console.log('Current stored value: not yet created/bound');
  }

  if (state.blockingIssues.length > 0) {
    console.log('\nBlocking issues:');
    state.blockingIssues.forEach((issue) => console.log(`- ${issue}`));
  }

  if (state.plannedChanges.length > 0) {
    console.log('\nPlanned changes:');
    state.plannedChanges.forEach((change) => console.log(`- ${change}`));
  } else if (state.blockingIssues.length === 0) {
    console.log('\nSchema/configuration already satisfies the Session inactivity timeout policy.');
  }
}

async function createSetting(connection, securityCategoryId, valueColumns) {
  const fields = ['config_category_id', 'value', 'is_protected'];
  const values = [securityCategoryId, String(DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES), 1];

  if (valueColumns.has('code')) {
    fields.push('code');
    values.push(LEGACY_CODES[0]);
  }
  if (valueColumns.has('label')) {
    fields.push('label');
    values.push(LABEL);
  }
  if (valueColumns.has('name')) {
    fields.push('name');
    values.push(LABEL);
  }
  if (valueColumns.has('description')) {
    fields.push('description');
    values.push(DESCRIPTION);
  }
  if (valueColumns.has('sort_order')) {
    fields.push('sort_order');
    values.push(20);
  }
  if (valueColumns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }

  const [result] = await connection.query(
    `INSERT INTO config_values (${fields.map((field) => `\`${field}\``).join(', ')})
     VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function applyMigration(connection, state) {
  if (state.blockingIssues.length > 0) {
    throw new Error('Refusing to apply while blocking issues remain.');
  }

  await connection.beginTransaction();
  try {
    let configValueId = state.setting ? Number(state.setting.config_value_id) : null;

    if (!configValueId) {
      configValueId = await createSetting(connection, state.securityCategoryId, state.valueColumns);
    }

    await connection.query(
      `INSERT INTO system_config_values (system_config_value_id, config_value_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
      [SYSTEM_CONFIG_VALUE_IDS.SESSION_INACTIVITY_TIMEOUT_MINUTES, configValueId]
    );

    const assignments = ['is_protected = 1'];
    const values = [];

    const currentValue = state.setting ? state.setting.value : String(DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES);
    if (parseSessionInactivityTimeoutMinutes(currentValue) === null) {
      assignments.push('value = ?');
      values.push(String(DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES));
    }
    if (state.valueColumns.has('is_active')) {
      assignments.push('is_active = 1');
    }

    values.push(configValueId);
    await connection.query(
      `UPDATE config_values SET ${assignments.join(', ')} WHERE config_value_id = ? LIMIT 1`,
      values
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const preflight = await inspect(connection);
    printReport(preflight, APPLY ? 'preflight' : 'audit');

    if (preflight.blockingIssues.length > 0) {
      process.exitCode = 1;
      return;
    }

    if (!APPLY) return;

    await applyMigration(connection, preflight);
    const verified = await inspect(connection);
    if (verified.blockingIssues.length > 0 || verified.plannedChanges.length > 0) {
      throw new Error('Session inactivity timeout verification failed after migration.');
    }

    console.log('\nSession inactivity timeout migration completed successfully.');
    printReport(verified, 'applied');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
