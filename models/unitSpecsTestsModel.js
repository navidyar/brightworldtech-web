'use strict';

const { pool } = require('./db');
const { listConfigValuesBySystemCategoryIds } = require('./configLookupModel');
const { SYSTEM_CONFIG_CATEGORY_IDS, SYSTEM_CONFIG_VALUE_IDS } = require('../config/configIdentityRegistry');
const { isAnyUnitFormFieldManaged, isUnitFormFieldManaged } = require('../services/unitFormSubmissionPolicy');

const SIMPLE_FIELDS = Object.freeze([
  ['wifi_card_present', 'wifiCardPresentConfigValueId', 'wifi_card_present_config_value_id'],
  ['charger_included', 'chargerIncludedConfigValueId', 'charger_included_config_value_id'],
  ['display_type', 'displayTypeConfigValueId', 'display_type_config_value_id'],
  ['native_screen_resolution', 'nativeScreenResolutionConfigValueId', 'native_screen_resolution_config_value_id'],
  ['refresh_rate', 'refreshRateConfigValueId', 'refresh_rate_config_value_id'],
  ['color', 'colorConfigValueId', 'color_config_value_id'],
  ['keyboard_test', 'keyboardTestResultConfigValueId', 'keyboard_test_result_config_value_id'],
  ['microphone_check', 'microphoneCheckResultConfigValueId', 'microphone_check_result_config_value_id'],
  ['audio_output_check', 'audioOutputCheckResultConfigValueId', 'audio_output_check_result_config_value_id'],
  ['all_screws_present', 'allScrewsPresentConfigValueId', 'all_screws_present_config_value_id'],
  ['bios_lock', 'biosLockConfigValueId', 'bios_lock_config_value_id'],
  ['efi_lock', 'efiLockConfigValueId', 'efi_lock_config_value_id'],
  ['mdm_lock', 'mdmLockConfigValueId', 'mdm_lock_config_value_id'],
  ['icloud_activation_lock', 'icloudActivationLockConfigValueId', 'icloud_activation_lock_config_value_id'],
  ['ce_certification', 'ceCertificationConfigValueId', 'ce_certification_config_value_id'],
  ['open_box_status', 'openBoxStatusConfigValueId', 'open_box_status_config_value_id'],
  ['box_language', 'boxLanguageConfigValueId', 'box_language_config_value_id']
]);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePositiveInteger(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePercentage(value) {
  const normalized = normalizeText(value);
  if (!normalized || !/^\d+(?:\.\d)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function normalizeRows(rows) {
  if (Array.isArray(rows)) return rows.filter((row) => row && typeof row === 'object');
  if (rows && typeof rows === 'object') {
    return Object.keys(rows)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => rows[key])
      .filter((row) => row && typeof row === 'object');
  }
  return [];
}

async function tableExists(tableName, connection = pool) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function getColumnSet(tableName, connection = pool) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

async function listCategory(systemCategoryId) {
  return listConfigValuesBySystemCategoryIds(systemCategoryId);
}

async function getSpecsTestsOptions() {
  const [
    yesNoOptions,
    testResultOptions,
    availabilityTestResultOptions,
    lockStatusOptions,
    displayTypeOptions,
    screenResolutionOptions,
    refreshRateOptions,
    colorOptions,
    cameraTypeOptions,
    cameraLocationOptions,
    biometricHardwareOptions,
    portTypeOptions,
    boxLanguageOptions
  ] = await Promise.all([
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.YES_NO_OPTIONS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.TEST_RESULTS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.AVAILABILITY_TEST_RESULTS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.LOCK_STATUSES),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.DISPLAY_TYPES),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_RESOLUTIONS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.REFRESH_RATES),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.COLORS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_TYPES),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.CAMERA_LOCATIONS),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.BIOMETRIC_HARDWARE),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.PORT_TYPES),
    listCategory(SYSTEM_CONFIG_CATEGORY_IDS.BOX_LANGUAGES)
  ]);

  return {
    specsTestsSupported: await tableExists('unit_cameras')
      && await tableExists('unit_batteries')
      && await tableExists('unit_biometrics')
      && await tableExists('unit_ports'),
    yesNoOptions,
    testResultOptions,
    availabilityTestResultOptions,
    lockStatusOptions,
    displayTypeOptions: displayTypeOptions.map((option) => ({
      ...option,
      appleDisallowed: [SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_LCD, SYSTEM_CONFIG_VALUE_IDS.DISPLAY_TYPE_OLED]
        .includes(Number(option.systemConfigValueId))
    })),
    screenResolutionOptions,
    refreshRateOptions,
    colorOptions,
    cameraTypeOptions,
    cameraLocationOptions,
    biometricHardwareOptions,
    portTypeOptions,
    boxLanguageOptions
  };
}

function getBlankSpecsTestsData() {
  return {
    wifiCardPresentConfigValueId: '',
    chargerIncludedConfigValueId: '',
    displayTypeConfigValueId: '',
    nativeScreenResolutionConfigValueId: '',
    refreshRateConfigValueId: '',
    colorConfigValueId: '',
    keyboardTestResultConfigValueId: '',
    microphoneCheckResultConfigValueId: '',
    audioOutputCheckResultConfigValueId: '',
    allScrewsPresentConfigValueId: '',
    biosLockConfigValueId: '',
    efiLockConfigValueId: '',
    mdmLockConfigValueId: '',
    icloudActivationLockConfigValueId: '',
    ceCertificationConfigValueId: '',
    openBoxStatusConfigValueId: '',
    boxLanguageConfigValueId: '',
    appleModelNumber: '',
    cameras: [],
    batteries: [],
    biometrics: [],
    ports: []
  };
}

async function getSimpleData(unitId) {
  const blank = getBlankSpecsTestsData();
  if (!await tableExists('unit_specifications')) return blank;
  const columns = await getColumnSet('unit_specifications');
  const selectedColumns = [
    ...SIMPLE_FIELDS.filter(([, , columnName]) => columns.has(columnName)).map(([, , columnName]) => columnName),
    ...(columns.has('apple_model_number') ? ['apple_model_number'] : [])
  ];
  if (selectedColumns.length === 0) return blank;
  const [rows] = await pool.query(
    `SELECT ${selectedColumns.map((columnName) => `\`${columnName}\``).join(', ')} FROM unit_specifications WHERE unit_id = ? LIMIT 1`,
    [unitId]
  );
  const row = rows[0] || {};
  const data = { ...blank };
  SIMPLE_FIELDS.forEach(([, propertyName, columnName]) => {
    data[propertyName] = row[columnName] ? String(row[columnName]) : '';
  });
  data.appleModelNumber = row.apple_model_number || '';
  return data;
}

async function getRepeatableRows(unitId, tableName, columns, mapper) {
  if (!await tableExists(tableName)) return [];
  const [rows] = await pool.query(
    `SELECT ${columns.join(', ')} FROM ${tableName} WHERE unit_id = ? ORDER BY sort_order, ${columns[0]}`,
    [unitId]
  );
  return rows.map(mapper);
}

async function getSpecsTestsDataByUnitId(unitId) {
  const safeUnitId = Number(unitId);
  if (!Number.isInteger(safeUnitId) || safeUnitId <= 0) return getBlankSpecsTestsData();
  const [simple, cameras, batteries, biometrics, ports] = await Promise.all([
    getSimpleData(safeUnitId),
    getRepeatableRows(safeUnitId, 'unit_cameras', ['unit_camera_id', 'camera_type_config_value_id', 'camera_location_config_value_id', 'test_result_config_value_id', 'sort_order'], (row) => ({
      rowId: String(row.unit_camera_id),
      cameraTypeConfigValueId: row.camera_type_config_value_id ? String(row.camera_type_config_value_id) : '',
      cameraLocationConfigValueId: row.camera_location_config_value_id ? String(row.camera_location_config_value_id) : '',
      testResultConfigValueId: row.test_result_config_value_id ? String(row.test_result_config_value_id) : ''
    })),
    getRepeatableRows(safeUnitId, 'unit_batteries', ['unit_battery_id', 'health_percent', 'cycle_count', 'sort_order'], (row) => ({
      rowId: String(row.unit_battery_id),
      healthPercent: row.health_percent === null || row.health_percent === undefined ? '' : String(row.health_percent),
      cycleCount: row.cycle_count === null || row.cycle_count === undefined ? '' : String(row.cycle_count)
    })),
    getRepeatableRows(safeUnitId, 'unit_biometrics', ['unit_biometric_id', 'hardware_config_value_id', 'test_result_config_value_id', 'sort_order'], (row) => ({
      rowId: String(row.unit_biometric_id),
      hardwareConfigValueId: row.hardware_config_value_id ? String(row.hardware_config_value_id) : '',
      testResultConfigValueId: row.test_result_config_value_id ? String(row.test_result_config_value_id) : ''
    })),
    getRepeatableRows(safeUnitId, 'unit_ports', ['unit_port_id', 'port_type_config_value_id', 'port_count', 'sort_order'], (row) => ({
      rowId: String(row.unit_port_id),
      portTypeConfigValueId: row.port_type_config_value_id ? String(row.port_type_config_value_id) : '',
      portCount: row.port_count === null || row.port_count === undefined ? '' : String(row.port_count)
    }))
  ]);
  return { ...simple, cameras, batteries, biometrics, ports };
}

async function upsertSource(connection, unitId, fieldKey, currentUserId) {
  if (!await tableExists('unit_field_sources', connection)) return;
  await connection.query(
    `INSERT INTO unit_field_sources (unit_id, field_key, source_code, source_note, updated_by_user_id, updated_at)
     VALUES (?, ?, 'tech_edit', 'Saved from Tech Unit form.', ?, NOW())
     ON DUPLICATE KEY UPDATE source_code = VALUES(source_code), source_note = VALUES(source_note), updated_by_user_id = VALUES(updated_by_user_id), updated_at = NOW()`,
    [unitId, fieldKey, normalizePositiveInteger(currentUserId)]
  );
}

async function saveSimpleFields(connection, unitId, formData, currentUserId) {
  if (!await tableExists('unit_specifications', connection)) return;
  const columns = await getColumnSet('unit_specifications', connection);
  const candidateFields = SIMPLE_FIELDS
    .filter(([fieldKey, , columnName]) => columns.has(columnName) && isUnitFormFieldManaged(formData, fieldKey))
    .map(([fieldKey, propertyName, columnName]) => ({
      fieldKey,
      columnName,
      value: normalizePositiveInteger(formData[propertyName])
    }));
  if (columns.has('apple_model_number') && isUnitFormFieldManaged(formData, 'apple_model_number')) {
    candidateFields.push({
      fieldKey: 'apple_model_number',
      columnName: 'apple_model_number',
      value: normalizeText(formData.appleModelNumber).slice(0, 80) || null
    });
  }
  if (candidateFields.length === 0) return;

  const [existingRows] = await connection.query(
    `SELECT ${candidateFields.map((field) => `\`${field.columnName}\``).join(', ')} FROM unit_specifications WHERE unit_id = ? LIMIT 1`,
    [unitId]
  );
  const existing = existingRows[0] || {};
  const fields = candidateFields.filter((field) => {
    const current = existing[field.columnName];
    const currentValue = current === null || current === undefined || current === '' ? null : String(current);
    const nextValue = field.value === null || field.value === undefined || field.value === '' ? null : String(field.value);
    return currentValue !== nextValue;
  });
  if (fields.length === 0) return;

  const insertColumns = ['unit_id', ...fields.map((field) => field.columnName), 'created_by_user_id', 'updated_by_user_id'];
  const values = [unitId, ...fields.map((field) => field.value), normalizePositiveInteger(currentUserId), normalizePositiveInteger(currentUserId)];
  await connection.query(
    `INSERT INTO unit_specifications (${insertColumns.map((name) => `\`${name}\``).join(', ')})
     VALUES (${insertColumns.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${[
       ...fields.map((field) => `\`${field.columnName}\` = VALUES(\`${field.columnName}\`)`),
       'updated_by_user_id = VALUES(updated_by_user_id)'
     ].join(', ')}`,
    values
  );
  for (const field of fields) await upsertSource(connection, unitId, field.fieldKey, currentUserId);
}

function normalizeCameraRows(rows) {
  return normalizeRows(rows).slice(0, 3).map((row) => ({
    rowId: normalizePositiveInteger(row.rowId),
    cameraTypeConfigValueId: normalizePositiveInteger(row.cameraTypeConfigValueId),
    cameraLocationConfigValueId: normalizePositiveInteger(row.cameraLocationConfigValueId),
    testResultConfigValueId: normalizePositiveInteger(row.testResultConfigValueId)
  })).filter((row) => row.cameraTypeConfigValueId || row.cameraLocationConfigValueId || row.testResultConfigValueId);
}

function normalizeBatteryRows(rows) {
  return normalizeRows(rows).slice(0, 2).map((row) => ({
    rowId: normalizePositiveInteger(row.rowId),
    healthPercent: normalizePercentage(row.healthPercent),
    cycleCount: normalizeNonNegativeInteger(row.cycleCount)
  })).filter((row) => row.healthPercent !== null || row.cycleCount !== null);
}

function normalizeBiometricRows(rows) {
  return normalizeRows(rows).slice(0, 6).map((row) => ({
    rowId: normalizePositiveInteger(row.rowId),
    hardwareConfigValueId: normalizePositiveInteger(row.hardwareConfigValueId),
    testResultConfigValueId: normalizePositiveInteger(row.testResultConfigValueId)
  })).filter((row) => row.hardwareConfigValueId || row.testResultConfigValueId);
}

function normalizePortRows(rows) {
  return normalizeRows(rows).slice(0, 30).map((row) => ({
    rowId: normalizePositiveInteger(row.rowId),
    portTypeConfigValueId: normalizePositiveInteger(row.portTypeConfigValueId),
    portCount: normalizeNonNegativeInteger(row.portCount)
  })).filter((row) => row.portTypeConfigValueId || row.portCount !== null);
}

function comparableValue(value) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

async function syncRows(connection, tableName, idColumn, unitId, rows, dataColumns, mapValues, currentUserId) {
  if (!await tableExists(tableName, connection)) return false;
  const [existingRows] = await connection.query(
    `SELECT \`${idColumn}\`, ${dataColumns.map((name) => `\`${name}\``).join(', ')}, sort_order FROM \`${tableName}\` WHERE unit_id = ? ORDER BY sort_order, \`${idColumn}\``,
    [unitId]
  );
  const existingById = new Map(existingRows.map((row) => [Number(row[idColumn]), row]));
  const retainedIds = new Set();
  let changed = false;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const requestedId = normalizePositiveInteger(row.rowId);
    const existing = requestedId ? existingById.get(requestedId) : null;
    const values = mapValues(row);
    const sortOrder = (index + 1) * 10;

    if (existing) {
      retainedIds.add(requestedId);
      const dataChanged = dataColumns.some((columnName, columnIndex) => (
        comparableValue(existing[columnName]) !== comparableValue(values[columnIndex])
      ));
      const orderChanged = Number(existing.sort_order || 0) !== sortOrder;

      if (dataChanged) {
        await connection.query(
          `UPDATE \`${tableName}\` SET ${dataColumns.map((columnName) => `\`${columnName}\` = ?`).join(', ')}, sort_order = ?, source_code = 'tech_edit', source_note = 'Saved from Tech Unit form.', updated_by_user_id = ? WHERE unit_id = ? AND \`${idColumn}\` = ?`,
          [...values, sortOrder, normalizePositiveInteger(currentUserId), unitId, requestedId]
        );
        changed = true;
      } else if (orderChanged) {
        // Re-numbering after a removed row is presentation metadata, not a new value source.
        await connection.query(
          `UPDATE \`${tableName}\` SET sort_order = ? WHERE unit_id = ? AND \`${idColumn}\` = ?`,
          [sortOrder, unitId, requestedId]
        );
      }
      continue;
    }

    const insertColumns = ['unit_id', ...dataColumns, 'sort_order', 'source_code', 'source_note', 'updated_by_user_id'];
    const insertValues = [unitId, ...values, sortOrder, 'tech_edit', 'Saved from Tech Unit form.', normalizePositiveInteger(currentUserId)];
    const [result] = await connection.query(
      `INSERT INTO \`${tableName}\` (${insertColumns.map((name) => `\`${name}\``).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertValues
    );
    retainedIds.add(Number(result.insertId));
    changed = true;
  }

  const removedIds = existingRows
    .map((row) => Number(row[idColumn]))
    .filter((rowId) => !retainedIds.has(rowId));
  if (removedIds.length > 0) {
    await connection.query(
      `DELETE FROM \`${tableName}\` WHERE unit_id = ? AND \`${idColumn}\` IN (${removedIds.map(() => '?').join(', ')})`,
      [unitId, ...removedIds]
    );
    changed = true;
  }

  return changed;
}

async function saveRepeatables(connection, unitId, formData, currentUserId) {
  if (isAnyUnitFormFieldManaged(formData, ['cameras', 'camera_type', 'camera_location', 'camera_test'])) {
    const rows = normalizeCameraRows(formData.cameras);
    const changed = await syncRows(connection, 'unit_cameras', 'unit_camera_id', unitId, rows,
      ['camera_type_config_value_id', 'camera_location_config_value_id', 'test_result_config_value_id'],
      (row) => [row.cameraTypeConfigValueId, row.cameraLocationConfigValueId, row.testResultConfigValueId], currentUserId);
    if (changed) await upsertSource(connection, unitId, 'cameras', currentUserId);
  }

  if (isAnyUnitFormFieldManaged(formData, ['batteries', 'battery_health', 'battery_cycle_count'])) {
    const rows = normalizeBatteryRows(formData.batteries);
    const changed = await syncRows(connection, 'unit_batteries', 'unit_battery_id', unitId, rows,
      ['health_percent', 'cycle_count'],
      (row) => [row.healthPercent, row.cycleCount], currentUserId);
    const recordedHealth = rows.map((row) => row.healthPercent).filter((value) => value !== null);
    const summaryHealth = recordedHealth.length ? Math.min(...recordedHealth) : null;
    const unitColumns = await getColumnSet('units', connection);
    if (unitColumns.has('battery_health_percent')) {
      await connection.query('UPDATE units SET battery_health_percent = ? WHERE unit_id = ?', [summaryHealth, unitId]);
    }
    if (changed) await upsertSource(connection, unitId, 'batteries', currentUserId);
  }

  if (isAnyUnitFormFieldManaged(formData, ['biometrics', 'biometric_hardware', 'biometrics_test'])) {
    const rows = normalizeBiometricRows(formData.biometrics);
    const changed = await syncRows(connection, 'unit_biometrics', 'unit_biometric_id', unitId, rows,
      ['hardware_config_value_id', 'test_result_config_value_id'],
      (row) => [row.hardwareConfigValueId, row.testResultConfigValueId], currentUserId);
    if (changed) await upsertSource(connection, unitId, 'biometrics', currentUserId);
  }

  if (isAnyUnitFormFieldManaged(formData, ['ports', 'port_type', 'port_count'])) {
    const rows = normalizePortRows(formData.ports);
    const changed = await syncRows(connection, 'unit_ports', 'unit_port_id', unitId, rows,
      ['port_type_config_value_id', 'port_count'],
      (row) => [row.portTypeConfigValueId, row.portCount], currentUserId);
    if (changed) await upsertSource(connection, unitId, 'ports', currentUserId);
  }
}

function normalizeUnitIdList(unitIds) {
  return [...new Set((Array.isArray(unitIds) ? unitIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function getSpecsTestsDetailsByUnitIds(unitIds) {
  const ids = normalizeUnitIdList(unitIds);
  const result = new Map(ids.map((id) => [id, { ...getBlankSpecsTestsData(), labels: {}, cameras: [], batteries: [], biometrics: [], ports: [] }]));
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => '?').join(', ');
  const configIds = new Set();

  if (await tableExists('unit_specifications')) {
    const columns = await getColumnSet('unit_specifications');
    const selected = SIMPLE_FIELDS.filter(([, , column]) => columns.has(column));
    const selectColumns = ['unit_id', ...selected.map(([, , column]) => column), ...(columns.has('apple_model_number') ? ['apple_model_number'] : [])];
    const [rows] = await pool.query(`SELECT ${selectColumns.map((column) => `\`${column}\``).join(', ')} FROM unit_specifications WHERE unit_id IN (${placeholders})`, ids);
    rows.forEach((row) => {
      const detail = result.get(Number(row.unit_id));
      if (!detail) return;
      selected.forEach(([, propertyName, columnName]) => {
        detail[propertyName] = row[columnName] ? String(row[columnName]) : '';
        if (row[columnName]) configIds.add(Number(row[columnName]));
      });
      detail.appleModelNumber = row.apple_model_number || '';
    });
  }

  const repeatableDefinitions = [
    ['unit_cameras', ['unit_id', 'camera_type_config_value_id', 'camera_location_config_value_id', 'test_result_config_value_id', 'sort_order'], 'cameras', (row) => ({
      cameraTypeConfigValueId: row.camera_type_config_value_id ? String(row.camera_type_config_value_id) : '',
      cameraLocationConfigValueId: row.camera_location_config_value_id ? String(row.camera_location_config_value_id) : '',
      testResultConfigValueId: row.test_result_config_value_id ? String(row.test_result_config_value_id) : ''
    }), ['camera_type_config_value_id', 'camera_location_config_value_id', 'test_result_config_value_id']],
    ['unit_batteries', ['unit_id', 'health_percent', 'cycle_count', 'sort_order'], 'batteries', (row) => ({
      healthPercent: row.health_percent === null || row.health_percent === undefined ? '' : String(row.health_percent),
      cycleCount: row.cycle_count === null || row.cycle_count === undefined ? '' : String(row.cycle_count)
    }), []],
    ['unit_biometrics', ['unit_id', 'hardware_config_value_id', 'test_result_config_value_id', 'sort_order'], 'biometrics', (row) => ({
      hardwareConfigValueId: row.hardware_config_value_id ? String(row.hardware_config_value_id) : '',
      testResultConfigValueId: row.test_result_config_value_id ? String(row.test_result_config_value_id) : ''
    }), ['hardware_config_value_id', 'test_result_config_value_id']],
    ['unit_ports', ['unit_id', 'port_type_config_value_id', 'port_count', 'sort_order'], 'ports', (row) => ({
      portTypeConfigValueId: row.port_type_config_value_id ? String(row.port_type_config_value_id) : '',
      portCount: row.port_count === null || row.port_count === undefined ? '' : String(row.port_count)
    }), ['port_type_config_value_id']]
  ];

  for (const [tableName, columns, property, mapper, configColumns] of repeatableDefinitions) {
    if (!await tableExists(tableName)) continue;
    const [rows] = await pool.query(`SELECT ${columns.join(', ')} FROM ${tableName} WHERE unit_id IN (${placeholders}) ORDER BY unit_id, sort_order`, ids);
    rows.forEach((row) => {
      const detail = result.get(Number(row.unit_id));
      if (!detail) return;
      detail[property].push(mapper(row));
      configColumns.forEach((column) => { if (row[column]) configIds.add(Number(row[column])); });
    });
  }

  const labelById = new Map();
  if (configIds.size > 0) {
    const values = [...configIds];
    const [rows] = await pool.query(
      `SELECT config_value_id, COALESCE(label, value) AS display_label FROM config_values WHERE config_value_id IN (${values.map(() => '?').join(', ')})`,
      values
    );
    rows.forEach((row) => labelById.set(Number(row.config_value_id), String(row.display_label || '')));
  }

  result.forEach((detail) => {
    SIMPLE_FIELDS.forEach(([, propertyName]) => {
      const id = Number(detail[propertyName] || 0);
      if (id) detail.labels[propertyName] = labelById.get(id) || '';
    });
    detail.cameras.forEach((row) => {
      row.cameraTypeLabel = labelById.get(Number(row.cameraTypeConfigValueId || 0)) || '';
      row.cameraLocationLabel = labelById.get(Number(row.cameraLocationConfigValueId || 0)) || '';
      row.testResultLabel = labelById.get(Number(row.testResultConfigValueId || 0)) || '';
    });
    detail.biometrics.forEach((row) => {
      row.hardwareLabel = labelById.get(Number(row.hardwareConfigValueId || 0)) || '';
      row.testResultLabel = labelById.get(Number(row.testResultConfigValueId || 0)) || '';
    });
    detail.ports.forEach((row) => {
      row.portTypeLabel = labelById.get(Number(row.portTypeConfigValueId || 0)) || '';
    });
  });
  return result;
}

async function saveSpecsTestsForUnitWithConnection(connection, { unitId, formData, currentUserId }) {
  const safeUnitId = Number(unitId);
  if (!connection || !Number.isInteger(safeUnitId) || safeUnitId <= 0) return;
  await saveSimpleFields(connection, safeUnitId, formData, currentUserId);
  await saveRepeatables(connection, safeUnitId, formData, currentUserId);
}

module.exports = {
  getBlankSpecsTestsData,
  getSpecsTestsDataByUnitId,
  getSpecsTestsDetailsByUnitIds,
  getSpecsTestsOptions,
  normalizeBatteryRows,
  normalizeBiometricRows,
  normalizeCameraRows,
  normalizePortRows,
  saveSpecsTestsForUnitWithConnection
};
