'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS, SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

const CATEGORY_DEFINITIONS = Object.freeze([
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.YES_NO_OPTIONS, label: 'Yes / No Options', description: 'Shared affirmative/negative Unit specification and check values.', values: [
    ['Yes', true], ['No', true]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS, label: 'Test Results', description: 'Shared Unit test result values.', values: [
    ['Pass', true], ['Fail', true]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.AVAILABILITY_TEST_RESULTS, label: 'Availability Test Results', description: 'Test results that can also indicate hardware is unavailable.', values: [
    ['Pass', true], ['Fail', true], ['Not Available', true]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES, label: 'Lock Statuses', description: 'Locked/unlocked device security state values.', values: [
    ['Locked', true], ['Unlocked', true]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.DISPLAY_TYPES, label: 'Display Types', description: 'Configurable Unit display panel/marketing types.', values: [
    ['LCD', false, SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_LCD], ['OLED', false, SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_OLED], ['Retina', false], ['Retina 2K', false], ['Retina 4K', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_RESOLUTIONS, label: 'Screen Resolutions', description: 'Configurable native display resolutions.', values: [
    ['1920 x 1080', false], ['3072 x 1920', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.REFRESH_RATES, label: 'Refresh Rates', description: 'Configurable native display refresh rates.', values: [
    ['60 Hz', false], ['90 Hz', false], ['120 Hz', false], ['144 Hz', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.COLORS, label: 'Colors', description: 'Configurable Unit exterior colors.', values: [
    ['Black', false], ['Silver', false], ['Gray', false], ['White', false], ['Blue', false], ['Red', false], ['Gold', false], ['Rose Gold', false],
    ['Space Gray', false], ['Space Black', false], ['Midnight', false], ['Starlight', false], ['Sky Blue', false],
    ['Green', false], ['Pink', false], ['Yellow', false], ['Orange', false], ['Purple', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_TYPES, label: 'Camera Types', description: 'Configurable physical camera hardware types.', values: [
    ['Standard', false], ['IR', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_LOCATIONS, label: 'Camera Locations', description: 'Configurable physical camera locations.', values: [
    ['Front', false], ['Rear', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.BIOMETRIC_HARDWARE, label: 'Biometric Hardware', description: 'Configurable biometric hardware types.', values: [
    ['Fingerprint Reader', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.PORT_TYPES, label: 'Ports / Expansion Types', description: 'Configurable physical port and expansion types.', values: [
    ['HDMI', false], ['DisplayPort', false], ['VGA', false], ['USB', false], ['USB-C', false], ['Thunderbolt', false], ['LAN / Ethernet', false], ['SD Card', false], ['microSD', false], ['3.5mm Audio', false], ['Unused Expansion Port', false]
  ] },
  { systemId: SYSTEM_CONFIG_CATEGORY_IDS.BOX_LANGUAGES, label: 'Box Languages', description: 'Configurable packaging language values.', values: [
    ['English', false], ['Spanish', false]
  ] }
]);

const SPECIFICATION_COLUMNS = Object.freeze([
  ['wifi_card_present_config_value_id', 'INT NULL'],
  ['charger_included_config_value_id', 'INT NULL'],
  ['display_type_config_value_id', 'INT NULL'],
  ['native_screen_resolution_config_value_id', 'INT NULL'],
  ['refresh_rate_config_value_id', 'INT NULL'],
  ['color_config_value_id', 'INT NULL'],
  ['keyboard_test_result_config_value_id', 'INT NULL'],
  ['microphone_check_result_config_value_id', 'INT NULL'],
  ['audio_output_check_result_config_value_id', 'INT NULL'],
  ['all_screws_present_config_value_id', 'INT NULL'],
  ['bios_lock_config_value_id', 'INT NULL'],
  ['efi_lock_config_value_id', 'INT NULL'],
  ['mdm_lock_config_value_id', 'INT NULL'],
  ['icloud_activation_lock_config_value_id', 'INT NULL'],
  ['ce_certification_config_value_id', 'INT NULL'],
  ['open_box_status_config_value_id', 'INT NULL'],
  ['box_language_config_value_id', 'INT NULL'],
  ['apple_model_number', 'VARCHAR(80) NULL']
]);

const REPEATABLE_TABLES = Object.freeze([
  {
    table: 'unit_cameras',
    idColumn: 'unit_camera_id',
    columns: [
      ['camera_type_config_value_id', 'CONFIG_ID', true],
      ['camera_location_config_value_id', 'CONFIG_ID', true],
      ['test_result_config_value_id', 'CONFIG_ID', true],
      ['sort_order', 'SMALLINT UNSIGNED NOT NULL DEFAULT 10', false]
    ]
  },
  {
    table: 'unit_batteries',
    idColumn: 'unit_battery_id',
    columns: [
      ['health_percent', 'DECIMAL(5,1) UNSIGNED NULL', false],
      ['cycle_count', 'INT UNSIGNED NULL', false],
      ['sort_order', 'SMALLINT UNSIGNED NOT NULL DEFAULT 10', false]
    ]
  },
  {
    table: 'unit_biometrics',
    idColumn: 'unit_biometric_id',
    columns: [
      ['hardware_config_value_id', 'CONFIG_ID', true],
      ['test_result_config_value_id', 'CONFIG_ID', true],
      ['sort_order', 'SMALLINT UNSIGNED NOT NULL DEFAULT 10', false]
    ]
  },
  {
    table: 'unit_ports',
    idColumn: 'unit_port_id',
    columns: [
      ['port_type_config_value_id', 'CONFIG_ID', true],
      ['port_count', 'SMALLINT UNSIGNED NULL', false],
      ['sort_order', 'SMALLINT UNSIGNED NOT NULL DEFAULT 10', false]
    ]
  }
]);

function q(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnRows(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type, IS_NULLABLE AS is_nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows;
}

async function getColumnSet(connection, tableName) {
  return new Set((await getColumnRows(connection, tableName)).map((row) => row.column_name));
}

async function getColumnType(connection, tableName, columnName) {
  const row = (await getColumnRows(connection, tableName)).find((candidate) => candidate.column_name === columnName);
  if (!row) throw new Error(`${tableName}.${columnName} is required.`);
  return String(row.column_type || '').toUpperCase();
}

function pickColumn(columns, candidates) {
  return candidates.find((columnName) => columns.has(columnName)) || null;
}

async function getRowCount(connection, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${q(tableName)}`);
  return Number(rows[0]?.row_count || 0);
}

async function getSystemCategoryConfigId(connection, systemId) {
  const [rows] = await connection.query(
    'SELECT config_category_id FROM system_config_categories WHERE system_config_category_id = ? LIMIT 1',
    [systemId]
  );
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function findCategoryByLabel(connection, label) {
  const columns = await getColumnSet(connection, 'config_categories');
  const labelColumn = pickColumn(columns, ['label', 'name']);
  if (!labelColumn) throw new Error('config_categories needs a label/name column.');
  const [rows] = await connection.query(
    `SELECT config_category_id FROM config_categories WHERE LOWER(TRIM(${q(labelColumn)})) = LOWER(TRIM(?)) ORDER BY config_category_id`,
    [label]
  );
  if (rows.length > 1) throw new Error(`Multiple configuration categories are labeled ${label}.`);
  return rows[0] ? Number(rows[0].config_category_id) : null;
}

async function insertCategory(connection, definition) {
  const columns = await getColumnSet(connection, 'config_categories');
  const fields = [];
  const values = [];
  for (const columnName of ['label', 'name']) {
    if (columns.has(columnName)) {
      fields.push(columnName);
      values.push(definition.label);
    }
  }
  if (columns.has('description')) {
    fields.push('description');
    values.push(definition.description || null);
  }
  if (columns.has('sort_order')) {
    const [rows] = await connection.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort_order FROM config_categories');
    fields.push('sort_order');
    values.push(Number(rows[0]?.next_sort_order || 10));
  }
  if (columns.has('is_active')) {
    fields.push('is_active');
    values.push(1);
  }
  const [result] = await connection.query(
    `INSERT INTO config_categories (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    values
  );
  return Number(result.insertId);
}

async function ensureCategory(connection, definition) {
  let configCategoryId = await getSystemCategoryConfigId(connection, definition.systemId);
  if (!configCategoryId) {
    configCategoryId = await findCategoryByLabel(connection, definition.label);
    if (!configCategoryId) configCategoryId = await insertCategory(connection, definition);
    await connection.query(
      `INSERT INTO system_config_categories (system_config_category_id, config_category_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_category_id = VALUES(config_category_id)`,
      [definition.systemId, configCategoryId]
    );
  }
  return configCategoryId;
}

async function findValueByLabel(connection, categoryId, label) {
  const columns = await getColumnSet(connection, 'config_values');
  const clauses = [];
  if (columns.has('label')) clauses.push('LOWER(TRIM(label)) = LOWER(TRIM(?))');
  if (columns.has('name')) clauses.push('LOWER(TRIM(name)) = LOWER(TRIM(?))');
  if (columns.has('value')) clauses.push('LOWER(TRIM(value)) = LOWER(TRIM(?))');
  if (clauses.length === 0) throw new Error('config_values needs a label/name/value column.');
  const [rows] = await connection.query(
    `SELECT config_value_id FROM config_values WHERE config_category_id = ? AND (${clauses.join(' OR ')}) ORDER BY config_value_id`,
    [categoryId, ...clauses.map(() => label)]
  );
  if (rows.length > 1) throw new Error(`Multiple values match ${label} in configuration category ${categoryId}.`);
  return rows[0] ? Number(rows[0].config_value_id) : null;
}

async function ensureValue(connection, categoryId, label, isProtected, sortOrder) {
  let configValueId = await findValueByLabel(connection, categoryId, label);
  const columns = await getColumnSet(connection, 'config_values');
  if (!configValueId) {
    const fields = ['config_category_id'];
    const values = [categoryId];
    for (const columnName of ['label', 'name']) {
      if (columns.has(columnName)) {
        fields.push(columnName);
        values.push(label);
      }
    }
    if (columns.has('value')) {
      fields.push('value');
      values.push(label);
    }
    if (columns.has('sort_order')) {
      fields.push('sort_order');
      values.push(sortOrder);
    }
    if (columns.has('is_active')) {
      fields.push('is_active');
      values.push(1);
    }
    if (columns.has('is_protected')) {
      fields.push('is_protected');
      values.push(isProtected ? 1 : 0);
    }
    const [result] = await connection.query(
      `INSERT INTO config_values (${fields.map(q).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      values
    );
    configValueId = Number(result.insertId);
  } else if (isProtected && columns.has('is_protected')) {
    // Preserve the Admin-managed active/inactive state on reruns. Protected means
    // the stable ID cannot be deleted; it does not mean the option must stay active.
    await connection.query('UPDATE config_values SET is_protected = 1 WHERE config_value_id = ?', [configValueId]);
  }
  return configValueId;
}

async function ensureCategoriesAndValues(connection) {
  for (const definition of CATEGORY_DEFINITIONS) {
    const categoryId = await ensureCategory(connection, definition);
    for (let index = 0; index < definition.values.length; index += 1) {
      const [label, isProtected, systemValueId] = definition.values[index];
      const configValueId = await ensureValue(connection, categoryId, label, isProtected, (index + 1) * 10);
      if (systemValueId) {
        await connection.query(
          `INSERT INTO system_config_values (system_config_value_id, config_value_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE config_value_id = VALUES(config_value_id)`,
          [systemValueId, configValueId]
        );
      }
    }
  }

  const threatCategoryId = await getSystemCategoryConfigId(connection, SYSTEM_CONFIG_CATEGORY_IDS.VIRUS_CHECK_STATUSES);
  if (threatCategoryId) {
    const categoryColumns = await getColumnSet(connection, 'config_categories');
    const labelColumn = pickColumn(categoryColumns, ['label', 'name']);
    if (labelColumn) {
      await connection.query(
        `UPDATE config_categories SET ${q(labelColumn)} = ? WHERE config_category_id = ?`,
        ['Threat Protection Scan Results', threatCategoryId]
      );
    }
    await ensureValue(connection, threatCategoryId, 'Pass', true, 10);
    await ensureValue(connection, threatCategoryId, 'Fail', true, 20);
  }
}

async function ensureSpecificationColumns(connection) {
  if (!await tableExists(connection, 'unit_specifications')) {
    throw new Error('unit_specifications is required before the Specs/Tests overhaul can be applied.');
  }
  let columns = await getColumnSet(connection, 'unit_specifications');
  const configIdType = await getColumnType(connection, 'config_values', 'config_value_id');
  for (const [columnName, definition] of SPECIFICATION_COLUMNS) {
    if (columns.has(columnName)) continue;
    const sqlType = definition.startsWith('INT ') ? `${configIdType} NULL` : definition;
    await connection.query(`ALTER TABLE unit_specifications ADD COLUMN ${q(columnName)} ${sqlType}`);
    columns.add(columnName);
  }

  const configColumns = SPECIFICATION_COLUMNS
    .map(([columnName]) => columnName)
    .filter((columnName) => columnName.endsWith('_config_value_id'));
  for (const columnName of configColumns) {
    const indexName = `idx_unit_specs_${columnName.replace(/_config_value_id$/, '').slice(0, 35)}`;
    const [indexRows] = await connection.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications' AND COLUMN_NAME = ? LIMIT 1`,
      [columnName]
    );
    if (indexRows.length === 0) {
      await connection.query(`ALTER TABLE unit_specifications ADD KEY ${q(indexName)} (${q(columnName)})`);
    }
    const [fkRows] = await connection.query(
      `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unit_specifications'
         AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = 'config_values' LIMIT 1`,
      [columnName]
    );
    if (fkRows.length === 0) {
      const fkName = `fk_unit_specs_${columnName.replace(/_config_value_id$/, '').slice(0, 35)}`;
      await connection.query(
        `ALTER TABLE unit_specifications ADD CONSTRAINT ${q(fkName)} FOREIGN KEY (${q(columnName)}) REFERENCES config_values (config_value_id)`
      );
    }
  }
}

async function createRepeatableTable(connection, definition) {
  const unitIdType = await getColumnType(connection, 'units', 'unit_id');
  const configIdType = await getColumnType(connection, 'config_values', 'config_value_id');
  const userIdType = await getColumnType(connection, 'users', 'user_id');
  const columnSql = definition.columns.map(([name, type]) => {
    const resolvedType = type === 'CONFIG_ID' ? `${configIdType} NULL` : type;
    return `${q(name)} ${resolvedType}`;
  });
  await connection.query(
    `CREATE TABLE ${q(definition.table)} (
      ${q(definition.idColumn)} BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id ${unitIdType} NOT NULL,
      ${columnSql.join(',\n      ')},
      source_code VARCHAR(40) NOT NULL DEFAULT 'tech_edit',
      source_note VARCHAR(500) NULL,
      updated_by_user_id ${userIdType} NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (${q(definition.idColumn)}),
      KEY ${q(`idx_${definition.table}_unit`)} (unit_id),
      CONSTRAINT ${q(`fk_${definition.table}_unit`)} FOREIGN KEY (unit_id) REFERENCES units (unit_id) ON DELETE CASCADE
    ) ENGINE=InnoDB`
  );
  for (const [name, , isConfigValue] of definition.columns) {
    if (!isConfigValue) continue;
    await connection.query(`ALTER TABLE ${q(definition.table)} ADD KEY ${q(`idx_${definition.table}_${name.slice(0, 30)}`)} (${q(name)})`);
    await connection.query(
      `ALTER TABLE ${q(definition.table)} ADD CONSTRAINT ${q(`fk_${definition.table}_${name.slice(0, 30)}`)}
       FOREIGN KEY (${q(name)}) REFERENCES config_values (config_value_id)`
    );
  }
  await connection.query(`ALTER TABLE ${q(definition.table)} ADD CONSTRAINT ${q(`fk_${definition.table}_updated_by`)} FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL`);
  if (definition.table === 'unit_batteries') {
    await connection.query(
      `ALTER TABLE unit_batteries ADD CONSTRAINT chk_unit_batteries_health CHECK (health_percent IS NULL OR health_percent BETWEEN 0 AND 100)`
    );
  }
}

async function ensureRepeatableTables(connection) {
  for (const definition of REPEATABLE_TABLES) {
    if (!await tableExists(connection, definition.table)) {
      await createRepeatableTable(connection, definition);
      continue;
    }
    const columns = await getColumnSet(connection, definition.table);
    const required = new Set([definition.idColumn, 'unit_id', 'source_code', 'source_note', 'updated_by_user_id', 'created_at', 'updated_at', ...definition.columns.map(([name]) => name)]);
    const missing = [...required].filter((name) => !columns.has(name));
    if (missing.length === 0) continue;
    const rowCount = await getRowCount(connection, definition.table);
    if (rowCount > 0) {
      throw new Error(`${definition.table} is an incompatible populated placeholder; missing columns: ${missing.join(', ')}.`);
    }
    await connection.query(`DROP TABLE ${q(definition.table)}`);
    await createRepeatableTable(connection, definition);
  }
}

async function removeLegacyPhysicalCameraRules(connection) {
  let removed = 0;
  if (await tableExists(connection, 'lot_unit_form_field_rules')) {
    const [result] = await connection.query(
      "DELETE FROM lot_unit_form_field_rules WHERE field_key = 'physical_camera_status'"
    );
    removed += Number(result.affectedRows || 0);
  }

  const [[binding]] = await connection.query(
    'SELECT config_value_id FROM system_config_values WHERE system_config_value_id = ? LIMIT 1',
    [SYSTEM_CONFIG_VALUE_IDS.REQUIREMENT_PHYSICAL_CAMERA_STATUS]
  );
  const requirementTypeId = Number(binding?.config_value_id || 0);
  if (!requirementTypeId) return removed;

  if (await tableExists(connection, 'lot_requirement_inheritance_suppressions')) {
    const columns = await getColumnSet(connection, 'lot_requirement_inheritance_suppressions');
    if (columns.has('requirement_type_config_value_id')) {
      const [result] = await connection.query(
        'DELETE FROM lot_requirement_inheritance_suppressions WHERE requirement_type_config_value_id = ?',
        [requirementTypeId]
      );
      removed += Number(result.affectedRows || 0);
    }
  }

  if (await tableExists(connection, 'lot_requirements')) {
    const columns = await getColumnSet(connection, 'lot_requirements');
    if (columns.has('requirement_type_config_value_id')) {
      const [result] = await connection.query(
        'DELETE FROM lot_requirements WHERE requirement_type_config_value_id = ?',
        [requirementTypeId]
      );
      removed += Number(result.affectedRows || 0);
    }
  }
  return removed;
}

async function migrateLegacyBatteryHealth(connection) {
  const unitColumns = await getColumnSet(connection, 'units');
  if (!unitColumns.has('battery_health_percent') || !await tableExists(connection, 'unit_batteries')) return 0;
  const [result] = await connection.query(
    `INSERT INTO unit_batteries (unit_id, health_percent, sort_order, source_code, source_note)
     SELECT u.unit_id, u.battery_health_percent, 10, 'legacy_migration', 'Migrated from units.battery_health_percent.'
     FROM units u
     WHERE u.battery_health_percent IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM unit_batteries b WHERE b.unit_id = u.unit_id)`
  );
  return Number(result.affectedRows || 0);
}

async function collectAudit(connection) {
  const categoryRows = [];
  for (const definition of CATEGORY_DEFINITIONS) {
    const boundId = await getSystemCategoryConfigId(connection, definition.systemId);
    categoryRows.push({ label: definition.label, present: Boolean(boundId) });
  }
  const specColumns = await getColumnSet(connection, 'unit_specifications');
  const repeatable = {};
  for (const definition of REPEATABLE_TABLES) {
    repeatable[definition.table] = await tableExists(connection, definition.table);
  }
  const [batteryRows] = await connection.query(
    `SELECT COUNT(*) AS count FROM units WHERE battery_health_percent IS NOT NULL`
  );
  return {
    categoriesPresent: categoryRows.filter((row) => row.present).length,
    categoriesTotal: categoryRows.length,
    specificationColumnsPresent: SPECIFICATION_COLUMNS.filter(([columnName]) => specColumns.has(columnName)).length,
    specificationColumnsTotal: SPECIFICATION_COLUMNS.length,
    repeatableTablesPresent: Object.values(repeatable).filter(Boolean).length,
    repeatableTablesTotal: REPEATABLE_TABLES.length,
    legacyBatteryRows: Number(batteryRows[0]?.count || 0)
  };
}

function printAudit(label, audit) {
  console.log(`\nSpecs / Tests overhaul (${label})`);
  console.log(`Configuration categories: ${audit.categoriesPresent}/${audit.categoriesTotal} present`);
  console.log(`unit_specifications columns: ${audit.specificationColumnsPresent}/${audit.specificationColumnsTotal} present`);
  console.log(`Repeatable hardware tables: ${audit.repeatableTablesPresent}/${audit.repeatableTablesTotal} present`);
  console.log(`Legacy Units with battery health available for migration: ${audit.legacyBatteryRows}`);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const before = await collectAudit(connection);
    printAudit(APPLY ? 'preflight' : 'dry-run', before);
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      await ensureCategoriesAndValues(connection);
      await ensureSpecificationColumns(connection);
      await ensureRepeatableTables(connection);
      const migratedBatteryRows = await migrateLegacyBatteryHealth(connection);
      const removedLegacyCameraRules = await removeLegacyPhysicalCameraRules(connection);
      await connection.commit();
      console.log(`Migrated legacy battery rows: ${migratedBatteryRows}`);
      console.log(`Removed legacy Physical Camera form/requirement rules: ${removedLegacyCameraRules}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const after = await collectAudit(connection);
    printAudit('applied', after);
    console.log('\nSpecs / Tests overhaul applied successfully.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
