'use strict';

const STORAGE_FIELD_KEY = 'storage_devices';
const STORAGE_INSTALL_TYPES = new Set(['removable_device', 'integrated_soldered', 'unknown']);

function normalizeText(value, maxLength = 255) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normalizeNumber(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, decimals = 2 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return null;
  return Number(number.toFixed(decimals));
}

function normalizeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) return null;
  return number;
}

const COMMERCIAL_STORAGE_CAPACITIES = Object.freeze([
  [32, 32], [64, 64], [80, 80], [120, 120], [128, 128], [160, 160],
  [240, 240], [250, 250], [256, 256], [320, 320], [480, 480], [500, 500], [512, 512],
  [640, 640], [750, 750], [960, 960], [1000, 1024], [1920, 1920], [2000, 2048],
  [3840, 3840], [4000, 4096], [7680, 7680], [8000, 8192]
]);

function bytesToCommercialGb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const decimalGb = bytes / 1_000_000_000;
  let best = null;
  for (const [marketedGb, bwtGb] of COMMERCIAL_STORAGE_CAPACITIES) {
    const difference = Math.abs(decimalGb - marketedGb) / marketedGb;
    if (difference <= 0.08 && (!best || difference < best.difference)) {
      best = { difference, value: bwtGb };
    }
  }
  if (best) return best.value;
  return Number(decimalGb.toFixed(2));
}

function normalizeInstallType(device = {}) {
  const explicit = normalizeText(
    device.install_type ?? device.installType ?? device.storage_install_type ?? device.storageInstallTypeCode,
    80
  ).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = new Map([
    ['removable', 'removable_device'],
    ['removable_device', 'removable_device'],
    ['replaceable', 'removable_device'],
    ['integrated', 'integrated_soldered'],
    ['soldered', 'integrated_soldered'],
    ['integrated_soldered', 'integrated_soldered'],
    ['onboard', 'integrated_soldered'],
    ['unknown', 'unknown']
  ]);
  if (aliases.has(explicit)) return aliases.get(explicit);
  if (device.integrated === true || device.soldered === true) return 'integrated_soldered';
  if (device.integrated === false || device.soldered === false) return 'removable_device';
  return 'unknown';
}

function normalizeStorageDevice(device, index) {
  if (!device || typeof device !== 'object' || Array.isArray(device)) {
    throw new Error(`storage.devices[${index}] must be an object.`);
  }

  const rawSizeBytes = normalizeInteger(device.size_bytes ?? device.sizeBytes, {
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER
  });
  const sizeGb = normalizeNumber(
    device.size_gb ?? device.sizeGb ?? bytesToCommercialGb(rawSizeBytes),
    { minimum: 0.01, maximum: 32768, decimals: 2 }
  );
  if (sizeGb === null) throw new Error(`storage.devices[${index}] must include a valid size_gb or size_bytes.`);

  const mediaType = normalizeText(device.media_type ?? device.mediaType, 80) || null;
  const submittedType = normalizeText(
    device.storage_type ?? device.storageType ?? device.type ?? mediaType,
    100
  ) || null;

  return {
    slot_label: normalizeText(
      device.slot ?? device.slot_label ?? device.slotLabel ?? device.number ?? device.disk_index ?? device.diskIndex,
      120
    ) || `Storage ${index + 1}`,
    size_gb: sizeGb,
    raw_size_bytes: rawSizeBytes,
    storage_type_submitted: submittedType,
    storage_type_config_value_id: null,
    storage_interface: normalizeText(
      device.interface ?? device.connection ?? device.bus_type ?? device.busType,
      80
    ) || null,
    media_type: mediaType,
    model_number: normalizeText(device.model ?? device.model_number ?? device.modelNumber, 255) || null,
    serial_number: normalizeText(device.serial ?? device.serial_number ?? device.serialNumber, 255) || null,
    firmware_version: normalizeText(device.firmware ?? device.firmware_version ?? device.firmwareVersion, 120) || null,
    health_status: normalizeText(
      device.health ?? device.health_status ?? device.healthStatus ?? device.operational_status ?? device.operationalStatus,
      120
    ) || null,
    storage_install_type_code: normalizeInstallType(device)
  };
}

function normalizeStorageObservation(rawStorage) {
  if (rawStorage === undefined) return null;
  if (!rawStorage || typeof rawStorage !== 'object' || Array.isArray(rawStorage)) {
    throw new Error('storage must be an object.');
  }
  const state = normalizeText(rawStorage.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) {
    throw new Error('storage.state must be known or unknown.');
  }
  if (state === 'unknown') return { fieldKey: STORAGE_FIELD_KEY, state, value: null };

  const rawDevices = Array.isArray(rawStorage.devices) ? rawStorage.devices : null;
  if (!rawDevices || rawDevices.length === 0) {
    throw new Error('storage.devices must contain at least one internal drive when storage.state is known.');
  }
  if (rawDevices.length > 32) throw new Error('storage.devices cannot contain more than 32 devices.');

  const devices = rawDevices
    .filter((device) => device?.internal !== false && device?.is_internal !== false && device?.isInternal !== false)
    .map(normalizeStorageDevice);
  if (!devices.length) throw new Error('storage.devices does not contain an internal drive.');

  return {
    fieldKey: STORAGE_FIELD_KEY,
    state,
    value: {
      total_gb: Number(devices.reduce((sum, device) => sum + device.size_gb, 0).toFixed(2)),
      devices
    }
  };
}

function resolveStorageTypeCandidate(submitted, candidates) {
  if (!submitted) return { status: 'unknown', submitted: null };
  const key = normalizeKey(submitted);
  const aliases = new Map([
    ['solidstatedrive', 'ssd'], ['solidstate', 'ssd'], ['nvme', 'ssd'],
    ['harddiskdrive', 'hdd'], ['harddrive', 'hdd'], ['rotational', 'hdd']
  ]);
  const normalizedSubmitted = aliases.get(key) || key;
  const matches = candidates.filter((candidate) => {
    const values = [candidate.label, candidate.value].map((value) => {
      const candidateKey = normalizeKey(value);
      return aliases.get(candidateKey) || candidateKey;
    });
    return values.includes(normalizedSubmitted);
  });
  if (matches.length === 1) {
    return {
      status: 'resolved',
      submitted,
      resolvedId: Number(matches[0].id),
      resolvedLabel: normalizeText(matches[0].label || matches[0].value, 160)
    };
  }
  if (matches.length > 1) return { status: 'ambiguous', submitted };
  return { status: 'unmapped', submitted };
}

async function loadStorageTypeCandidates(connection) {
  const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
  const [rows] = await connection.query(
    `SELECT cv.config_value_id AS id,
            COALESCE(NULLIF(cv.label, ''), cv.value) AS label,
            cv.value
       FROM system_config_categories scc
       INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
      WHERE scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY cv.config_value_id`,
    [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES]
  );
  return rows;
}

async function resolveStorageObservation(connection, observation) {
  if (!observation || observation.state !== 'known') return observation;
  const candidates = await loadStorageTypeCandidates(connection);
  const devices = observation.value.devices.map((device) => {
    const resolution = resolveStorageTypeCandidate(device.storage_type_submitted, candidates);
    return {
      ...device,
      storage_type_resolution: resolution,
      storage_type_config_value_id: resolution.status === 'resolved' ? resolution.resolvedId : null
    };
  });
  return { ...observation, value: { ...observation.value, devices } };
}

function normalizedCurrentRows(rows = []) {
  return rows.map((row) => ({
    unit_storage_device_id: Number(row.unit_storage_device_id),
    slot_label: normalizeText(row.slot_label, 120),
    size_gb: normalizeNumber(row.size_gb, { minimum: 0, maximum: 32768, decimals: 2 }),
    storage_type_config_value_id: Number(row.storage_type_config_value_id) || null,
    wipe_status_config_value_id: Number(row.wipe_status_config_value_id) || null,
    model_number: normalizeText(row.model_number, 255) || null,
    serial_number: normalizeText(row.serial_number, 255) || null,
    firmware_version: normalizeText(row.firmware_version, 120) || null,
    raw_size_bytes: normalizeInteger(row.raw_size_bytes, { minimum: 1 }) || null,
    storage_interface: normalizeText(row.storage_interface, 80) || null,
    media_type: normalizeText(row.media_type, 80) || null,
    health_status: normalizeText(row.health_status, 120) || null,
    storage_install_type_code: STORAGE_INSTALL_TYPES.has(String(row.storage_install_type_code || ''))
      ? String(row.storage_install_type_code)
      : 'unknown'
  }));
}

function deviceConfigurationCompatible(current, incoming) {
  if (Number(current.size_gb) !== Number(incoming.size_gb)) return false;
  if (incoming.storage_type_submitted) {
    if (incoming.storage_type_resolution?.status !== 'resolved') return false;
    if (Number(current.storage_type_config_value_id || 0) !== Number(incoming.storage_type_config_value_id || 0)) return false;
  }
  return true;
}

function identityValue(value) {
  return normalizeKey(value || '');
}

function physicalIdentityChanged(current, incoming) {
  const oldSerial = identityValue(current.serial_number);
  const newSerial = identityValue(incoming.serial_number);
  if (oldSerial && newSerial && oldSerial !== newSerial) return true;
  const oldModel = identityValue(current.model_number);
  const newModel = identityValue(incoming.model_number);
  return Boolean(oldModel && newModel && oldModel !== newModel);
}

function pairCompatibleDevices(currentRows, incomingDevices) {
  if (currentRows.length !== incomingDevices.length) return null;
  const remaining = [...currentRows];
  const pairs = [];
  for (const incoming of incomingDevices) {
    let index = -1;
    if (incoming.serial_number) {
      index = remaining.findIndex((current) => (
        identityValue(current.serial_number)
        && identityValue(current.serial_number) === identityValue(incoming.serial_number)
        && deviceConfigurationCompatible(current, incoming)
      ));
    }
    if (index < 0 && incoming.slot_label) {
      index = remaining.findIndex((current) => (
        normalizeKey(current.slot_label) === normalizeKey(incoming.slot_label)
        && deviceConfigurationCompatible(current, incoming)
      ));
    }
    if (index < 0) index = remaining.findIndex((current) => deviceConfigurationCompatible(current, incoming));
    if (index < 0) return null;
    const [current] = remaining.splice(index, 1);
    pairs.push({ current, incoming });
  }
  return pairs;
}

function currentMatchesStoredObservation(currentRows, storedValue) {
  const devices = Array.isArray(storedValue?.devices) ? storedValue.devices : [];
  const normalized = devices.map((device) => ({
    ...device,
    storage_type_submitted: device.storage_type_submitted || null,
    storage_type_resolution: device.storage_type_resolution
      || (device.storage_type_config_value_id ? { status: 'resolved' } : { status: 'unknown' })
  }));
  const pairs = pairCompatibleDevices(currentRows, normalized);
  if (!pairs) return false;
  return pairs.every(({ current, incoming }) => {
    if (incoming.serial_number && identityValue(current.serial_number) !== identityValue(incoming.serial_number)) return false;
    if (incoming.model_number && identityValue(current.model_number) !== identityValue(incoming.model_number)) return false;
    return true;
  });
}

function determineStorageOwnership({ currentRows, sourceCode = '', latestAppliedValue = null }) {
  const normalizedSource = String(sourceCode || '').trim().toLowerCase();
  if (normalizedSource === 'manual_override') return 'manual';
  if (normalizedSource === 'tech_edit' || normalizedSource === 'expired_manual_override') return 'replaceable_manual';
  if (!currentRows.length) return 'blank';
  if (latestAppliedValue && currentMatchesStoredObservation(currentRows, latestAppliedValue)) return 'tool';
  return 'protected_legacy';
}

const TOOL_DETAIL_FIELDS = Object.freeze([
  'raw_size_bytes', 'storage_interface', 'media_type', 'model_number', 'serial_number',
  'firmware_version', 'health_status', 'storage_install_type_code'
]);

function toolDetailsDiffer(current, incoming) {
  return TOOL_DETAIL_FIELDS.some((field) => {
    const next = incoming[field];
    if (next === null || next === undefined || next === '' || (field === 'storage_install_type_code' && next === 'unknown')) {
      return false;
    }
    return String(current[field] ?? '') !== String(next);
  });
}

function buildStoragePlan({ observation, currentRows, sourceCode = '', latestAppliedValue = null }) {
  if (!observation) return null;
  if (observation.state === 'unknown') {
    return { status: 'ignored_unknown', reason: 'unknown_does_not_overwrite', mode: 'none', pairs: [], observation };
  }

  const ownership = determineStorageOwnership({ currentRows, sourceCode, latestAppliedValue });
  const pairs = pairCompatibleDevices(currentRows, observation.value.devices);

  if (ownership === 'manual' || ownership === 'protected_legacy') {
    if (!pairs) {
      return {
        status: 'blocked_manual',
        reason: ownership === 'manual' ? 'manual_storage_configuration_conflict' : 'existing_storage_not_tool_owned',
        mode: 'none', pairs: [], observation, ownership
      };
    }
    const replacementNeeded = pairs.some(({ current, incoming }) => physicalIdentityChanged(current, incoming));
    const hasDetailChange = pairs.some(({ current, incoming }) => toolDetailsDiffer(current, incoming));
    return {
      status: replacementNeeded || hasDetailChange ? 'applied' : 'unchanged',
      reason: ownership === 'manual' ? 'manual_storage_configuration_preserved' : 'existing_storage_configuration_confirmed',
      mode: replacementNeeded ? 'replace_compatible' : 'details_only',
      pairs, observation, ownership
    };
  }

  if (pairs) {
    const replacementNeeded = pairs.some(({ current, incoming }) => physicalIdentityChanged(current, incoming));
    const hasDetailChange = pairs.some(({ current, incoming }) => toolDetailsDiffer(current, incoming));
    return {
      status: replacementNeeded || hasDetailChange ? 'applied' : 'unchanged',
      reason: replacementNeeded ? 'physical_storage_identity_changed' : 'storage_configuration_unchanged',
      mode: replacementNeeded ? 'replace_compatible' : 'details_only',
      pairs, observation, ownership
    };
  }

  return {
    status: 'applied',
    reason: ownership === 'blank' ? 'storage_populated_from_tool' : 'latest_tool_storage_configuration',
    mode: 'replace', pairs: [], observation, ownership
  };
}

async function loadCurrentStorageRows(connection, unitId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT unit_storage_device_id, unit_id, slot_label, size_gb,
            storage_type_config_value_id, wipe_status_config_value_id,
            model_number, serial_number, firmware_version,
            raw_size_bytes, storage_interface, media_type, health_status,
            storage_install_type_code
       FROM unit_storage_devices
      WHERE unit_id = ? AND is_current = 1
      ORDER BY unit_storage_device_id${lock ? ' FOR UPDATE' : ''}`,
    [unitId]
  );
  return normalizedCurrentRows(rows);
}

async function loadLatestAppliedStorageValue(connection, unitId) {
  const [rows] = await connection.query(
    `SELECT observed_value_json
       FROM unit_tool_observations
      WHERE unit_id = ?
        AND field_key = ?
        AND application_status IN ('applied','unchanged')
      ORDER BY unit_tool_observation_id DESC
      LIMIT 1`,
    [unitId, STORAGE_FIELD_KEY]
  );
  if (!rows.length) return null;
  const value = rows[0].observed_value_json;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function mergedToolDetails(current, incoming) {
  const merged = { ...current };
  for (const field of TOOL_DETAIL_FIELDS) {
    const value = incoming[field];
    if (value === null || value === undefined || value === '' || (field === 'storage_install_type_code' && value === 'unknown')) continue;
    merged[field] = value;
  }
  return merged;
}

async function insertCurrentStorageDevice(connection, unitId, device, { wipeStatusConfigValueId = null } = {}) {
  await connection.query(
    `INSERT INTO unit_storage_devices (
       unit_id, slot_label, size_gb, storage_type_config_value_id,
       wipe_status_config_value_id, is_current,
       model_number, serial_number, firmware_version,
       raw_size_bytes, storage_interface, media_type, health_status,
       storage_install_type_code
     ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      unitId, device.slot_label, device.size_gb, device.storage_type_config_value_id,
      wipeStatusConfigValueId, device.model_number, device.serial_number, device.firmware_version,
      device.raw_size_bytes, device.storage_interface, device.media_type, device.health_status,
      device.storage_install_type_code || 'unknown'
    ]
  );
}

async function applyStoragePlan(connection, unitId, plan) {
  if (!plan || plan.status !== 'applied') return false;

  if (plan.mode === 'details_only') {
    let changed = false;
    for (const { current, incoming } of plan.pairs) {
      const merged = mergedToolDetails(current, incoming);
      if (!TOOL_DETAIL_FIELDS.some((field) => String(current[field] ?? '') !== String(merged[field] ?? ''))) continue;
      await connection.query(
        `UPDATE unit_storage_devices
            SET raw_size_bytes = ?, storage_interface = ?, media_type = ?, model_number = ?,
                serial_number = ?, firmware_version = ?, health_status = ?, storage_install_type_code = ?
          WHERE unit_storage_device_id = ? AND unit_id = ? AND is_current = 1`,
        [
          merged.raw_size_bytes, merged.storage_interface, merged.media_type, merged.model_number,
          merged.serial_number, merged.firmware_version, merged.health_status,
          merged.storage_install_type_code || 'unknown', current.unit_storage_device_id, unitId
        ]
      );
      changed = true;
    }
    return changed;
  }

  if (plan.mode === 'replace_compatible') {
    for (const { current, incoming } of plan.pairs) {
      if (!physicalIdentityChanged(current, incoming)) {
        const merged = mergedToolDetails(current, incoming);
        if (TOOL_DETAIL_FIELDS.some((field) => String(current[field] ?? '') !== String(merged[field] ?? ''))) {
          await connection.query(
            `UPDATE unit_storage_devices
                SET raw_size_bytes = ?, storage_interface = ?, media_type = ?, model_number = ?,
                    serial_number = ?, firmware_version = ?, health_status = ?, storage_install_type_code = ?
              WHERE unit_storage_device_id = ? AND unit_id = ? AND is_current = 1`,
            [
              merged.raw_size_bytes, merged.storage_interface, merged.media_type, merged.model_number,
              merged.serial_number, merged.firmware_version, merged.health_status,
              merged.storage_install_type_code || 'unknown', current.unit_storage_device_id, unitId
            ]
          );
        }
        continue;
      }
      await connection.query(
        'UPDATE unit_storage_devices SET is_current = 0 WHERE unit_storage_device_id = ? AND unit_id = ? AND is_current = 1',
        [current.unit_storage_device_id, unitId]
      );
      await insertCurrentStorageDevice(connection, unitId, {
        ...incoming,
        size_gb: current.size_gb,
        storage_type_config_value_id: current.storage_type_config_value_id
      }, { wipeStatusConfigValueId: null });
    }
    return true;
  }

  if (plan.mode === 'replace') {
    await connection.query('UPDATE unit_storage_devices SET is_current = 0 WHERE unit_id = ? AND is_current = 1', [unitId]);
    for (const device of plan.observation.value.devices) {
      await insertCurrentStorageDevice(connection, unitId, device, { wipeStatusConfigValueId: null });
    }
    return true;
  }
  return false;
}

function toFormStorageDevices(rows = []) {
  return rows.map((row) => ({
    componentRowId: row.unit_storage_device_id ? String(row.unit_storage_device_id) : '',
    slotLabel: row.slot_label || '',
    sizeGb: row.size_gb === null || row.size_gb === undefined ? '' : String(row.size_gb),
    storageTypeConfigValueId: row.storage_type_config_value_id ? String(row.storage_type_config_value_id) : '',
    wipeStatusConfigValueId: row.wipe_status_config_value_id ? String(row.wipe_status_config_value_id) : ''
  }));
}

function storageDetailSummary(rows = []) {
  if (!rows.length) return 'Unknown';
  return rows.map((row, index) => {
    const parts = [normalizeText(row.slot_label, 120) || `Storage ${index + 1}`];
    if (row.model_number) parts.push(row.model_number);
    if (row.serial_number) parts.push(`Serial ${row.serial_number}`);
    if (row.storage_interface) parts.push(row.storage_interface);
    if (row.health_status) parts.push(row.health_status);
    if (row.storage_install_type_code && row.storage_install_type_code !== 'unknown') {
      parts.push(row.storage_install_type_code === 'integrated_soldered' ? 'Integrated / Soldered' : 'Removable');
    }
    return parts.join(' — ');
  }).join('; ');
}

module.exports = {
  STORAGE_FIELD_KEY,
  STORAGE_INSTALL_TYPES,
  normalizeStorageObservation,
  normalizeInstallType,
  bytesToCommercialGb,
  resolveStorageTypeCandidate,
  resolveStorageObservation,
  normalizedCurrentRows,
  deviceConfigurationCompatible,
  physicalIdentityChanged,
  pairCompatibleDevices,
  currentMatchesStoredObservation,
  determineStorageOwnership,
  buildStoragePlan,
  loadCurrentStorageRows,
  loadLatestAppliedStorageValue,
  applyStoragePlan,
  toFormStorageDevices,
  storageDetailSummary
};
