'use strict';

const { TOOL_SOURCES } = require('./apiToolCredential');

const MEMORY_FIELD_KEY = 'memory_modules';
const MEMORY_INSTALL_TYPES = new Set(['removable_module', 'integrated_soldered', 'unknown']);

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

function bytesToGb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return Number((bytes / (1024 ** 3)).toFixed(2));
}

function normalizeInstallType(module = {}) {
  const explicit = normalizeText(
    module.install_type ?? module.installType ?? module.memory_install_type ?? module.memoryInstallTypeCode,
    80
  ).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = new Map([
    ['removable', 'removable_module'],
    ['removable_module', 'removable_module'],
    ['module', 'removable_module'],
    ['integrated', 'integrated_soldered'],
    ['soldered', 'integrated_soldered'],
    ['integrated_soldered', 'integrated_soldered'],
    ['onboard', 'integrated_soldered'],
    ['unknown', 'unknown']
  ]);
  if (aliases.has(explicit)) return aliases.get(explicit);
  if (module.integrated === true || module.soldered === true) return 'integrated_soldered';
  if (module.integrated === false || module.soldered === false) return 'removable_module';
  return 'unknown';
}

function normalizeMemoryModule(module, index) {
  if (!module || typeof module !== 'object' || Array.isArray(module)) {
    throw new Error(`memory.modules[${index}] must be an object.`);
  }
  const sizeGb = normalizeNumber(
    module.size_gb ?? module.sizeGb ?? bytesToGb(module.size_bytes ?? module.sizeBytes),
    { minimum: 0.01, maximum: 4096, decimals: 2 }
  );
  if (sizeGb === null) throw new Error(`memory.modules[${index}].size_gb must be a positive memory size.`);

  const speedMhz = normalizeNumber(
    module.speed_mhz ?? module.speedMHz
      ?? module.configured_speed_mhz ?? module.configuredSpeedMHz
      ?? module.rated_speed_mhz ?? module.ratedSpeedMHz,
    { minimum: 1, maximum: 20000, decimals: 0 }
  );
  const ramType = normalizeText(module.ram_type ?? module.ramType ?? module.type, 100) || null;
  const slotLabel = normalizeText(
    module.slot ?? module.slot_label ?? module.slotLabel ?? module.device_locator ?? module.deviceLocator,
    120
  ) || `Memory ${index + 1}`;

  return {
    slot_label: slotLabel,
    size_gb: sizeGb,
    ram_type_submitted: ramType,
    ram_type_config_value_id: null,
    memory_install_type_code: normalizeInstallType(module),
    speed_mhz: speedMhz
  };
}

function normalizeMemoryObservation(rawMemory) {
  if (rawMemory === undefined) return null;
  if (!rawMemory || typeof rawMemory !== 'object' || Array.isArray(rawMemory)) {
    throw new Error('memory must be an object.');
  }
  const state = normalizeText(rawMemory.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) {
    throw new Error('memory.state must be known or unknown.');
  }
  if (state === 'unknown') {
    return { fieldKey: MEMORY_FIELD_KEY, state, value: null };
  }

  const rawModules = Array.isArray(rawMemory.modules) ? rawMemory.modules : null;
  if (!rawModules || rawModules.length === 0) {
    throw new Error('memory.modules must contain at least one installed memory module when memory.state is known.');
  }
  if (rawModules.length > 32) throw new Error('memory.modules cannot contain more than 32 modules.');

  const modules = rawModules.map(normalizeMemoryModule);
  const totalGb = Number(modules.reduce((sum, module) => sum + module.size_gb, 0).toFixed(2));
  const reportedTotalGb = normalizeNumber(
    rawMemory.total_gb ?? rawMemory.totalGb ?? bytesToGb(rawMemory.total_bytes ?? rawMemory.totalBytes),
    { minimum: 0.01, maximum: 65536, decimals: 2 }
  );
  const slotCount = normalizeNumber(rawMemory.slot_count ?? rawMemory.slotCount, { minimum: 0, maximum: 256, decimals: 0 });

  return {
    fieldKey: MEMORY_FIELD_KEY,
    state,
    value: {
      total_gb: totalGb,
      reported_total_gb: reportedTotalGb,
      slot_count: slotCount,
      modules
    }
  };
}

function resolveRamTypeCandidate(submitted, candidates) {
  if (!submitted) return { status: 'unknown', submitted: null };
  const key = normalizeKey(submitted);
  const matches = candidates.filter((candidate) => {
    return [candidate.label, candidate.value].some((value) => normalizeKey(value) === key);
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

async function loadRamTypeCandidates(connection) {
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
    [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES]
  );
  return rows;
}

async function resolveMemoryObservation(connection, observation) {
  if (!observation || observation.state !== 'known') return observation;
  const candidates = await loadRamTypeCandidates(connection);
  const modules = observation.value.modules.map((module) => {
    const resolution = resolveRamTypeCandidate(module.ram_type_submitted, candidates);
    return {
      ...module,
      ram_type_resolution: resolution,
      ram_type_config_value_id: resolution.status === 'resolved' ? resolution.resolvedId : null
    };
  });
  return { ...observation, value: { ...observation.value, modules } };
}

function normalizedCurrentRows(rows = []) {
  return rows.map((row) => ({
    unit_memory_module_id: Number(row.unit_memory_module_id),
    slot_label: normalizeText(row.slot_label, 120),
    size_gb: normalizeNumber(row.size_gb, { minimum: 0, maximum: 4096, decimals: 2 }),
    ram_type_config_value_id: Number(row.ram_type_config_value_id) || null,
    memory_install_type_code: MEMORY_INSTALL_TYPES.has(String(row.memory_install_type_code || ''))
      ? String(row.memory_install_type_code)
      : 'unknown',
    speed_mhz: normalizeNumber(row.speed_mhz, { minimum: 1, maximum: 20000, decimals: 0 })
  }));
}

function moduleSortKey(module) {
  return [
    Number(module.size_gb || 0).toFixed(2),
    Number(module.ram_type_config_value_id || 0),
    String(module.memory_install_type_code || 'unknown'),
    normalizeKey(module.slot_label)
  ].join('|');
}

function sortModules(modules) {
  return [...modules].sort((left, right) => moduleSortKey(left).localeCompare(moduleSortKey(right)));
}

function moduleConfigurationCompatible(current, incoming) {
  if (Number(current.size_gb) !== Number(incoming.size_gb)) return false;
  if (incoming.ram_type_submitted) {
    if (incoming.ram_type_resolution?.status !== 'resolved') return false;
    if (Number(current.ram_type_config_value_id || 0) !== Number(incoming.ram_type_config_value_id || 0)) return false;
  }
  if (incoming.memory_install_type_code && incoming.memory_install_type_code !== 'unknown') {
    if (String(current.memory_install_type_code || 'unknown') !== incoming.memory_install_type_code) return false;
  }
  return true;
}

function pairCompatibleModules(currentRows, incomingModules) {
  if (currentRows.length !== incomingModules.length) return null;
  const remaining = sortModules(currentRows);
  const incoming = sortModules(incomingModules);
  const pairs = [];
  for (const next of incoming) {
    const index = remaining.findIndex((current) => moduleConfigurationCompatible(current, next));
    if (index < 0) return null;
    const [current] = remaining.splice(index, 1);
    pairs.push({ current, incoming: next });
  }
  return pairs;
}

function currentMatchesStoredObservation(currentRows, storedValue) {
  const modules = Array.isArray(storedValue?.modules) ? storedValue.modules : [];
  const normalized = modules.map((module) => ({
    ...module,
    ram_type_submitted: module.ram_type_submitted || null,
    ram_type_resolution: module.ram_type_resolution || (module.ram_type_config_value_id ? { status: 'resolved' } : { status: 'unknown' })
  }));
  return Boolean(pairCompatibleModules(currentRows, normalized));
}

function determineMemoryOwnership({ currentRows, sourceCode = '', latestAppliedValue = null }) {
  const normalizedSource = String(sourceCode || '').trim().toLowerCase();
  if (normalizedSource === 'manual_override') return 'manual';
  if (normalizedSource === 'tech_edit' || normalizedSource === 'expired_manual_override') return 'replaceable_manual';
  if (!currentRows.length) return 'blank';
  if (latestAppliedValue && currentMatchesStoredObservation(currentRows, latestAppliedValue)) return 'tool';
  return 'protected_legacy';
}

function buildMemoryPlan({ observation, currentRows, sourceCode = '', latestAppliedValue = null, latestAppliedToolSource = '', incomingToolSource = '' }) {
  if (!observation) return null;
  if (observation.state === 'unknown') {
    return { status: 'ignored_unknown', reason: 'unknown_does_not_overwrite', mode: 'none', pairs: [], observation };
  }

  const ownership = determineMemoryOwnership({ currentRows, sourceCode, latestAppliedValue });
  const existingToolSource = String(latestAppliedToolSource || '').trim().toLowerCase();
  const incomingSource = String(incomingToolSource || '').trim().toLowerCase();
  if (ownership === 'tool' && existingToolSource === TOOL_SOURCES.TECHTOOLS && incomingSource === TOOL_SOURCES.SCANTOOL) {
    return {
      status: 'unchanged',
      reason: 'techtools_current_memory_is_final',
      mode: 'none',
      pairs: [],
      observation,
      ownership
    };
  }
  const pairs = pairCompatibleModules(currentRows, observation.value.modules);

  if (pairs) {
    const hasDetailChange = pairs.some(({ current, incoming }) => (
      incoming.speed_mhz !== null && Number(current.speed_mhz || 0) !== Number(incoming.speed_mhz || 0)
    ));
    return {
      status: hasDetailChange ? 'applied' : 'unchanged',
      reason: 'memory_configuration_unchanged',
      mode: 'details_only',
      pairs,
      observation,
      ownership
    };
  }

  return {
    status: 'applied',
    reason: ownership === 'blank' ? 'memory_populated_from_tool' : 'tool_authoritative_memory_configuration',
    mode: 'replace',
    pairs: [],
    observation,
    ownership
  };
}


function memorySpeedSummary(rows = []) {
  const values = rows
    .filter((row) => row.speed_mhz !== null && row.speed_mhz !== undefined && row.speed_mhz !== '')
    .map((row, index) => `${normalizeText(row.slot_label, 120) || `Memory ${index + 1}`}: ${Number(row.speed_mhz)} MHz`);
  return values.length ? values.join('; ') : 'Unknown';
}

async function loadCurrentMemoryRows(connection, unitId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT unit_memory_module_id, unit_id, slot_label, size_gb,
            ram_type_config_value_id, memory_install_type_code, speed_mhz
       FROM unit_memory_modules
      WHERE unit_id = ? AND is_current = 1
      ORDER BY unit_memory_module_id${lock ? ' FOR UPDATE' : ''}`,
    [unitId]
  );
  return normalizedCurrentRows(rows);
}

function summarizeCurrentMemoryRows(rows = []) {
  const currentRows = normalizedCurrentRows(rows);
  if (currentRows.length === 0) {
    return { totalGb: null, ramTypeConfigValueId: null };
  }

  const totalGb = Number(currentRows.reduce((sum, row) => sum + Number(row.size_gb || 0), 0).toFixed(2));
  const installedRows = currentRows.filter((row) => Number(row.size_gb || 0) > 0);
  const installedTypeIds = installedRows.map((row) => Number(row.ram_type_config_value_id) || null);
  const distinctTypeIds = new Set(installedTypeIds.filter(Boolean));
  const ramTypeConfigValueId = installedRows.length > 0
    && installedTypeIds.every(Boolean)
    && distinctTypeIds.size === 1
      ? [...distinctTypeIds][0]
      : null;

  return { totalGb, ramTypeConfigValueId };
}

async function syncMemorySummary(connection, unitId, rows = null) {
  const summary = summarizeCurrentMemoryRows(rows || await loadCurrentMemoryRows(connection, unitId));
  const [result] = await connection.query(
    `UPDATE units
        SET ram_gb = ?, ram_type_config_value_id = ?
      WHERE unit_id = ?
        AND (NOT (ram_gb <=> ?) OR NOT (ram_type_config_value_id <=> ?))`,
    [summary.totalGb, summary.ramTypeConfigValueId, unitId, summary.totalGb, summary.ramTypeConfigValueId]
  );
  return { ...summary, changed: Number(result?.affectedRows || 0) > 0 };
}

async function loadLatestAppliedMemoryValue(connection, unitId) {
  const [rows] = await connection.query(
    `SELECT observed_value_json
       FROM unit_tool_observations
      WHERE unit_id = ?
        AND field_key = ?
        AND application_status IN ('applied','unchanged')
      ORDER BY unit_tool_observation_id DESC
      LIMIT 1`,
    [unitId, MEMORY_FIELD_KEY]
  );
  if (!rows.length) return null;
  const value = rows[0].observed_value_json;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

async function applyMemoryPlan(connection, unitId, plan) {
  if (!plan || plan.status !== 'applied') return false;

  if (plan.mode === 'details_only') {
    let changed = false;
    for (const { current, incoming } of plan.pairs) {
      if (incoming.speed_mhz === null || Number(current.speed_mhz || 0) === Number(incoming.speed_mhz || 0)) continue;
      await connection.query(
        'UPDATE unit_memory_modules SET speed_mhz = ? WHERE unit_memory_module_id = ? AND unit_id = ?',
        [incoming.speed_mhz, current.unit_memory_module_id, unitId]
      );
      changed = true;
    }
    return changed;
  }

  if (plan.mode === 'replace') {
    await connection.query('DELETE FROM unit_memory_modules WHERE unit_id = ?', [unitId]);
    for (const module of plan.observation.value.modules) {
      await connection.query(
        `INSERT INTO unit_memory_modules
           (unit_id, slot_label, size_gb, ram_type_config_value_id, memory_install_type_code, speed_mhz)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          unitId,
          module.slot_label,
          module.size_gb,
          module.ram_type_config_value_id,
          module.memory_install_type_code || 'unknown',
          module.speed_mhz
        ]
      );
    }
    return true;
  }
  return false;
}

function toFormMemoryModules(rows = []) {
  return rows.map((row) => ({
    componentRowId: row.unit_memory_module_id ? String(row.unit_memory_module_id) : '',
    slotLabel: row.slot_label || '',
    sizeGb: row.size_gb === null || row.size_gb === undefined ? '' : String(row.size_gb),
    ramTypeConfigValueId: row.ram_type_config_value_id ? String(row.ram_type_config_value_id) : '',
    memoryInstallTypeCode: row.memory_install_type_code || 'unknown'
  }));
}

module.exports = {
  MEMORY_FIELD_KEY,
  normalizeMemoryObservation,
  normalizeInstallType,
  resolveRamTypeCandidate,
  resolveMemoryObservation,
  normalizedCurrentRows,
  pairCompatibleModules,
  currentMatchesStoredObservation,
  determineMemoryOwnership,
  buildMemoryPlan,
  loadCurrentMemoryRows,
  loadLatestAppliedMemoryValue,
  summarizeCurrentMemoryRows,
  syncMemorySummary,
  applyMemoryPlan,
  toFormMemoryModules,
  memorySpeedSummary
};
