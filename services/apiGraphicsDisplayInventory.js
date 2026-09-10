'use strict';

const GRAPHICS_FIELD_KEY = 'graphics_adapters';
const DISPLAY_FIELD_KEY = 'display_hardware';
const SCREEN_SIZE_FIELD_KEY = 'screen_size';
const NATIVE_RESOLUTION_FIELD_KEY = 'native_screen_resolution';
const TOUCH_STATES = new Set(['present', 'absent', 'possible', 'unknown']);
const GPU_ROLES = new Set(['integrated', 'dedicated', 'unknown']);

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

function normalizeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) return null;
  return number;
}

function normalizeNumber(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, decimals = 2 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return null;
  return Number(number.toFixed(decimals));
}

function bytesToMb(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return Math.round(bytes / (1024 * 1024));
}

function normalizeGpuRole(adapter = {}) {
  const raw = normalizeText(adapter.role ?? adapter.gpu_role ?? adapter.gpuRole ?? adapter.adapter_type ?? adapter.adapterType, 80)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases = new Map([
    ['integrated', 'integrated'], ['onboard', 'integrated'], ['shared', 'integrated'], ['igpu', 'integrated'],
    ['dedicated', 'dedicated'], ['discrete', 'dedicated'], ['dgpu', 'dedicated'],
    ['unknown', 'unknown'], ['primary', 'unknown'], ['secondary', 'unknown']
  ]);
  return GPU_ROLES.has(aliases.get(raw)) ? aliases.get(raw) : 'unknown';
}

function normalizeGraphicsAdapter(adapter, index) {
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new Error(`graphics.adapters[${index}] must be an object.`);
  }
  const model = normalizeText(adapter.model ?? adapter.name ?? adapter.gpu_model ?? adapter.gpuModel, 255) || null;
  const vendor = normalizeText(adapter.vendor ?? adapter.manufacturer ?? adapter.brand, 120) || null;
  if (!model && !vendor) throw new Error(`graphics.adapters[${index}] must include a model/name or vendor.`);

  const vramMb = normalizeInteger(
    adapter.vram_mb ?? adapter.vramMb
      ?? bytesToMb(adapter.memory_bytes ?? adapter.memoryBytes)
      ?? bytesToMb(adapter.dedicated_display_memory_bytes ?? adapter.dedicatedDisplayMemoryBytes),
    { minimum: 1, maximum: 262144 }
  );

  return {
    sort_order: index + 1,
    gpu_role_code: normalizeGpuRole(adapter),
    gpu_type_config_value_id: null,
    gpu_vendor: vendor,
    gpu_model: model,
    vram_mb: vramMb,
    vram_source: normalizeText(adapter.vram_source ?? adapter.vramSource ?? adapter.memory_source ?? adapter.memorySource, 120) || null
  };
}

function normalizeGraphicsObservation(rawGraphics) {
  if (rawGraphics === undefined) return null;
  if (!rawGraphics || typeof rawGraphics !== 'object' || Array.isArray(rawGraphics)) throw new Error('graphics must be an object.');
  const state = normalizeText(rawGraphics.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('graphics.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: GRAPHICS_FIELD_KEY, state, value: null };
  const rawAdapters = Array.isArray(rawGraphics.adapters) ? rawGraphics.adapters : null;
  if (!rawAdapters || rawAdapters.length === 0) throw new Error('graphics.adapters must contain at least one adapter when graphics.state is known.');
  if (rawAdapters.length > 16) throw new Error('graphics.adapters cannot contain more than 16 adapters.');
  return {
    fieldKey: GRAPHICS_FIELD_KEY,
    state,
    value: { adapters: rawAdapters.map(normalizeGraphicsAdapter) }
  };
}

function normalizeTouchscreen(rawValue) {
  if (rawValue === undefined || rawValue === null) return 'unknown';
  if (typeof rawValue === 'boolean') return rawValue ? 'present' : 'absent';
  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    if (rawValue.detected === true) return 'present';
    if (rawValue.detected === false && rawValue.possible === true) return 'possible';
    if (rawValue.detected === false && rawValue.possible === false) return 'absent';
    return normalizeTouchscreen(rawValue.state ?? rawValue.status);
  }
  const value = normalizeText(rawValue, 40).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = new Map([
    ['yes', 'present'], ['present', 'present'], ['detected', 'present'], ['confirmed', 'present'],
    ['no', 'absent'], ['absent', 'absent'], ['not_detected', 'absent'],
    ['possible', 'possible'], ['uncertain', 'possible'],
    ['unknown', 'unknown'], ['unavailable', 'unknown']
  ]);
  return TOUCH_STATES.has(aliases.get(value)) ? aliases.get(value) : 'unknown';
}

function normalizeBuiltInConfidence(display = {}) {
  if (display.built_in === true || display.builtIn === true || display.internal === true || display.is_internal === true) return 'confirmed';
  const confidence = normalizeText(display.confidence ?? display.panel_confidence ?? display.panelConfidence, 40).toLowerCase();
  return ['confirmed', 'built_in', 'internal'].includes(confidence) ? 'confirmed' : 'unknown';
}

function normalizeDisplayObservation(rawDisplay) {
  if (rawDisplay === undefined) return null;
  if (!rawDisplay || typeof rawDisplay !== 'object' || Array.isArray(rawDisplay)) throw new Error('display must be an object.');
  const state = normalizeText(rawDisplay.state || 'known', 40).toLowerCase();
  if (!['known', 'unknown'].includes(state)) throw new Error('display.state must be known or unknown.');
  if (state === 'unknown') return { fieldKey: DISPLAY_FIELD_KEY, state, value: null };

  const rawBuiltIn = rawDisplay.built_in_panel ?? rawDisplay.builtInPanel ?? rawDisplay.built_in ?? rawDisplay.builtIn ?? rawDisplay.panel ?? null;
  const builtIn = rawBuiltIn && typeof rawBuiltIn === 'object' && !Array.isArray(rawBuiltIn)
    ? {
        confidence: normalizeBuiltInConfidence(rawBuiltIn),
        screen_size_submitted: normalizeNumber(
          rawBuiltIn.screen_size_in ?? rawBuiltIn.screenSizeIn ?? rawBuiltIn.diagonal ?? rawBuiltIn.diagonal_inches ?? rawBuiltIn.diagonalInches,
          { minimum: 5, maximum: 100, decimals: 2 }
        ),
        screen_size_config_value_id: null,
        native_resolution_submitted: normalizeText(rawBuiltIn.native_resolution ?? rawBuiltIn.nativeResolution, 80) || null,
        native_resolution_config_value_id: null
      }
    : null;

  return {
    fieldKey: DISPLAY_FIELD_KEY,
    state,
    value: {
      built_in_panel: builtIn,
      touchscreen_hardware_state_code: normalizeTouchscreen(rawDisplay.touchscreen ?? rawDisplay.touch)
    }
  };
}

function normalizeResolution(value) {
  const text = normalizeText(value, 80).toLowerCase().replace(/×/g, 'x');
  const match = text.match(/(\d{3,5})\s*x\s*(\d{3,5})/);
  return match ? `${Number(match[1])}x${Number(match[2])}` : normalizeKey(text);
}

function extractScreenSize(value) {
  const match = normalizeText(value, 80).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

async function loadConfigCandidates(connection, systemCategoryId) {
  const [rows] = await connection.query(
    `SELECT cv.config_value_id AS id,
            COALESCE(NULLIF(cv.label, ''), cv.value) AS label,
            cv.value
       FROM system_config_categories scc
       INNER JOIN config_values cv ON cv.config_category_id = scc.config_category_id
      WHERE scc.system_config_category_id = ?
        AND COALESCE(cv.is_active, 1) = 1
      ORDER BY cv.config_value_id`,
    [systemCategoryId]
  );
  return rows;
}

function resolveGpuTypeCandidate(role, candidates) {
  if (!role || role === 'unknown') return { status: 'unknown', submitted: role || 'unknown' };
  const aliases = role === 'integrated' ? ['integrated', 'onboard', 'shared'] : ['dedicated', 'discrete'];
  const matches = candidates.filter((candidate) => aliases.includes(normalizeKey(candidate.label || candidate.value)));
  if (matches.length === 1) return { status: 'resolved', resolvedId: Number(matches[0].id), resolvedLabel: matches[0].label, submitted: role };
  if (matches.length > 1) return { status: 'ambiguous', submitted: role };
  return { status: 'unmapped', submitted: role };
}

async function resolveGraphicsObservation(connection, observation) {
  if (!observation || observation.state !== 'known') return observation;
  const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
  const candidates = await loadConfigCandidates(connection, SYSTEM_CONFIG_CATEGORY_IDS.GPU_TYPES);
  return {
    ...observation,
    value: {
      adapters: observation.value.adapters.map((adapter) => {
        const resolution = resolveGpuTypeCandidate(adapter.gpu_role_code, candidates);
        return {
          ...adapter,
          gpu_type_resolution: resolution,
          gpu_type_config_value_id: resolution.status === 'resolved' ? resolution.resolvedId : null
        };
      })
    }
  };
}

function resolveScreenSizeCandidate(size, candidates) {
  if (size === null || size === undefined) return { status: 'unknown', submitted: null };
  const matches = candidates.filter((candidate) => {
    const candidateSize = extractScreenSize(candidate.label ?? candidate.value);
    return candidateSize !== null && Math.abs(candidateSize - Number(size)) <= 0.11;
  });
  if (matches.length === 1) return { status: 'resolved', submitted: size, resolvedId: Number(matches[0].id), resolvedLabel: matches[0].label };
  if (matches.length > 1) return { status: 'ambiguous', submitted: size };
  return { status: 'unmapped', submitted: size };
}

function resolveNativeResolutionCandidate(submitted, candidates) {
  if (!submitted) return { status: 'unknown', submitted: null };
  const key = normalizeResolution(submitted);
  const matches = candidates.filter((candidate) => [candidate.label, candidate.value].some((value) => normalizeResolution(value) === key));
  if (matches.length === 1) return { status: 'resolved', submitted, resolvedId: Number(matches[0].id), resolvedLabel: matches[0].label };
  if (matches.length > 1) return { status: 'ambiguous', submitted };
  return { status: 'unmapped', submitted };
}

async function resolveDisplayObservation(connection, observation) {
  if (!observation || observation.state !== 'known' || !observation.value.built_in_panel) return observation;
  const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
  const [screenCandidates, resolutionCandidates] = await Promise.all([
    loadConfigCandidates(connection, SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_SIZES),
    loadConfigCandidates(connection, SYSTEM_CONFIG_CATEGORY_IDS.SCREEN_RESOLUTIONS)
  ]);
  const panel = observation.value.built_in_panel;
  const screenResolution = resolveScreenSizeCandidate(panel.screen_size_submitted, screenCandidates);
  const nativeResolution = resolveNativeResolutionCandidate(panel.native_resolution_submitted, resolutionCandidates);
  return {
    ...observation,
    value: {
      ...observation.value,
      built_in_panel: {
        ...panel,
        screen_size_resolution: screenResolution,
        screen_size_config_value_id: screenResolution.status === 'resolved' ? screenResolution.resolvedId : null,
        native_resolution_resolution: nativeResolution,
        native_resolution_config_value_id: nativeResolution.status === 'resolved' ? nativeResolution.resolvedId : null
      }
    }
  };
}

async function loadCurrentGraphicsRows(connection, unitId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT unit_graphics_adapter_id, unit_id, gpu_type_config_value_id,
            gpu_model, vram_mb, gpu_vendor, gpu_role_code, vram_source, sort_order
       FROM unit_graphics_adapters
      WHERE unit_id = ?
      ORDER BY sort_order, unit_graphics_adapter_id${lock ? ' FOR UPDATE' : ''}`,
    [unitId]
  );
  return rows.map((row) => ({
    unit_graphics_adapter_id: Number(row.unit_graphics_adapter_id),
    gpu_type_config_value_id: Number(row.gpu_type_config_value_id) || null,
    gpu_model: normalizeText(row.gpu_model, 255) || null,
    vram_mb: normalizeInteger(row.vram_mb, { minimum: 1, maximum: 262144 }),
    gpu_vendor: normalizeText(row.gpu_vendor, 120) || null,
    gpu_role_code: GPU_ROLES.has(String(row.gpu_role_code || '')) ? String(row.gpu_role_code) : 'unknown',
    vram_source: normalizeText(row.vram_source, 120) || null,
    sort_order: Number(row.sort_order) || 1
  }));
}

async function loadCurrentDisplayState(connection, unitId, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT u.screen_size_config_value_id,
            COALESCE(NULLIF(screen_size_cv.label, ''), screen_size_cv.value) AS screen_size_label,
            us.native_screen_resolution_config_value_id,
            COALESCE(NULLIF(resolution_cv.label, ''), resolution_cv.value) AS native_resolution_label,
            us.touchscreen_hardware_state_code
       FROM units u
       LEFT JOIN unit_specifications us ON us.unit_id = u.unit_id
       LEFT JOIN config_values screen_size_cv ON screen_size_cv.config_value_id = u.screen_size_config_value_id
       LEFT JOIN config_values resolution_cv ON resolution_cv.config_value_id = us.native_screen_resolution_config_value_id
      WHERE u.unit_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [unitId]
  );
  const row = rows[0] || {};
  return {
    screen_size_config_value_id: Number(row.screen_size_config_value_id) || null,
    screen_size_label: normalizeText(row.screen_size_label, 120) || null,
    native_screen_resolution_config_value_id: Number(row.native_screen_resolution_config_value_id) || null,
    native_resolution_label: normalizeText(row.native_resolution_label, 120) || null,
    touchscreen_hardware_state_code: TOUCH_STATES.has(String(row.touchscreen_hardware_state_code || ''))
      ? String(row.touchscreen_hardware_state_code)
      : 'unknown'
  };
}

async function loadLatestAppliedCompositeValue(connection, unitId, fieldKey) {
  const [rows] = await connection.query(
    `SELECT observed_value_json
       FROM unit_tool_observations
      WHERE unit_id = ? AND field_key = ?
        AND application_status IN ('applied', 'unchanged')
      ORDER BY unit_tool_observation_id DESC
      LIMIT 1`,
    [unitId, fieldKey]
  );
  if (!rows[0]) return null;
  const value = rows[0].observed_value_json;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function graphicsSummary(rows = []) {
  if (!rows.length) return 'Unknown';
  return rows.map((row) => {
    const role = row.gpu_role_code && row.gpu_role_code !== 'unknown' ? row.gpu_role_code : 'GPU';
    const vendor = normalizeText(row.gpu_vendor, 120);
    const model = normalizeText(row.gpu_model, 255);
    const name = vendor && model && normalizeKey(model).startsWith(normalizeKey(vendor))
      ? model
      : [vendor, model].filter(Boolean).join(' ') || 'Unknown GPU';
    const vram = row.vram_mb ? ` (${row.vram_mb} MB VRAM${row.vram_source ? `, ${row.vram_source}` : ''})` : '';
    return `${role}: ${name}${vram}`;
  }).join('; ');
}

function displaySummary(state = {}) {
  const parts = [];
  if (state.screen_size_config_value_id) parts.push(`Screen Size ${state.screen_size_label || state.screen_size_config_value_id}`);
  if (state.native_screen_resolution_config_value_id) parts.push(`Native Resolution ${state.native_resolution_label || state.native_screen_resolution_config_value_id}`);
  parts.push(`Touchscreen ${state.touchscreen_hardware_state_code || 'unknown'}`);
  return parts.join('; ') || 'Unknown';
}

function buildGraphicsPlan({ observation, currentRows }) {
  if (!observation) return null;
  if (observation.state === 'unknown') return { status: 'ignored_unknown', reason: 'unknown_does_not_overwrite', mode: 'none', observation };
  const desired = observation.value.adapters;
  const currentJson = currentRows.map(({ unit_graphics_adapter_id, ...row }) => row);
  const same = JSON.stringify(currentJson) === JSON.stringify(desired.map(({ gpu_type_resolution, ...row }) => row));
  return { status: same ? 'unchanged' : 'applied', reason: same ? 'graphics_unchanged' : 'latest_tool_graphics_snapshot', mode: same ? 'none' : 'replace', observation };
}

function priorDisplayOwns(currentValue, latestValue, key) {
  if (!currentValue) return true;
  const priorPanel = latestValue?.built_in_panel || null;
  if (key === SCREEN_SIZE_FIELD_KEY) return Number(priorPanel?.screen_size_config_value_id || 0) === Number(currentValue || 0);
  if (key === NATIVE_RESOLUTION_FIELD_KEY) return Number(priorPanel?.native_resolution_config_value_id || 0) === Number(currentValue || 0);
  return false;
}

function buildDisplayPlan({ observation, currentState, manualSources, latestAppliedValue }) {
  if (!observation) return null;
  if (observation.state === 'unknown') return { status: 'ignored_unknown', reason: 'unknown_does_not_overwrite', observation, changes: {} };

  const changes = {};
  const panel = observation.value.built_in_panel;
  if (panel && panel.confidence === 'confirmed') {
    if (panel.screen_size_submitted !== null) {
      if (panel.screen_size_resolution?.status !== 'resolved') {
        changes.screen_size = { status: 'ignored_unknown', reason: 'screen_size_unmapped' };
      } else if (String(manualSources.get(SCREEN_SIZE_FIELD_KEY) || '').toLowerCase() === 'manual_override') {
        changes.screen_size = { status: 'blocked_manual', reason: 'manual_screen_size_override' };
      } else if (currentState.screen_size_config_value_id
        && !['tech_edit', 'expired_manual_override'].includes(String(manualSources.get(SCREEN_SIZE_FIELD_KEY) || '').toLowerCase())
        && !priorDisplayOwns(currentState.screen_size_config_value_id, latestAppliedValue, SCREEN_SIZE_FIELD_KEY)) {
        changes.screen_size = { status: 'blocked_manual', reason: 'existing_screen_size_not_tool_owned' };
      } else {
        const desired = panel.screen_size_config_value_id;
        changes.screen_size = {
          status: Number(desired) === Number(currentState.screen_size_config_value_id) ? 'unchanged' : 'applied',
          reason: 'confirmed_builtin_panel', desiredValue: desired
        };
      }
    }

    if (panel.native_resolution_submitted) {
      if (panel.native_resolution_resolution?.status !== 'resolved') {
        changes.native_resolution = { status: 'ignored_unknown', reason: 'native_resolution_unmapped' };
      } else if (String(manualSources.get(NATIVE_RESOLUTION_FIELD_KEY) || '').toLowerCase() === 'manual_override') {
        changes.native_resolution = { status: 'blocked_manual', reason: 'manual_native_resolution_override' };
      } else if (currentState.native_screen_resolution_config_value_id
        && !['tech_edit', 'expired_manual_override'].includes(String(manualSources.get(NATIVE_RESOLUTION_FIELD_KEY) || '').toLowerCase())
        && !priorDisplayOwns(currentState.native_screen_resolution_config_value_id, latestAppliedValue, NATIVE_RESOLUTION_FIELD_KEY)) {
        changes.native_resolution = { status: 'blocked_manual', reason: 'existing_native_resolution_not_tool_owned' };
      } else {
        const desired = panel.native_resolution_config_value_id;
        changes.native_resolution = {
          status: Number(desired) === Number(currentState.native_screen_resolution_config_value_id) ? 'unchanged' : 'applied',
          reason: 'confirmed_builtin_panel', desiredValue: desired
        };
      }
    }
  }

  const touch = observation.value.touchscreen_hardware_state_code;
  if (touch && touch !== 'unknown') {
    changes.touchscreen = {
      status: touch === currentState.touchscreen_hardware_state_code ? 'unchanged' : 'applied',
      reason: touch === 'possible' ? 'possible_hardware_evidence' : 'confirmed_hardware_state',
      desiredValue: touch
    };
  }

  const statuses = Object.values(changes).map((change) => change.status);
  return {
    status: statuses.includes('applied') ? 'applied' : statuses.includes('blocked_manual') ? 'blocked_manual' : 'unchanged',
    reason: statuses.length ? 'display_fields_evaluated' : 'no_confirmed_builtin_panel_data',
    observation,
    changes
  };
}

async function applyGraphicsPlan(connection, unitId, plan) {
  if (!plan || plan.mode !== 'replace') return false;
  await connection.query('DELETE FROM unit_graphics_adapters WHERE unit_id = ?', [unitId]);
  for (const adapter of plan.observation.value.adapters) {
    await connection.query(
      `INSERT INTO unit_graphics_adapters (
         unit_id, gpu_type_config_value_id, gpu_model, vram_mb,
         gpu_vendor, gpu_role_code, vram_source, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unitId, adapter.gpu_type_config_value_id, adapter.gpu_model, adapter.vram_mb,
        adapter.gpu_vendor, adapter.gpu_role_code, adapter.vram_source, adapter.sort_order
      ]
    );
  }
  return true;
}

async function applyDisplayPlan(connection, unitId, plan) {
  if (!plan) return false;
  let changed = false;
  if (plan.changes.screen_size?.status === 'applied') {
    await connection.query('UPDATE units SET screen_size_config_value_id = ? WHERE unit_id = ?', [plan.changes.screen_size.desiredValue, unitId]);
    changed = true;
  }
  if (plan.changes.native_resolution?.status === 'applied') {
    await connection.query(
      'UPDATE unit_specifications SET native_screen_resolution_config_value_id = ? WHERE unit_id = ?',
      [plan.changes.native_resolution.desiredValue, unitId]
    );
    changed = true;
  }
  if (plan.changes.touchscreen?.status === 'applied') {
    await connection.query(
      'UPDATE unit_specifications SET touchscreen_hardware_state_code = ? WHERE unit_id = ?',
      [plan.changes.touchscreen.desiredValue, unitId]
    );
    changed = true;
  }
  return changed;
}

module.exports = {
  GRAPHICS_FIELD_KEY,
  DISPLAY_FIELD_KEY,
  SCREEN_SIZE_FIELD_KEY,
  NATIVE_RESOLUTION_FIELD_KEY,
  normalizeGraphicsObservation,
  normalizeDisplayObservation,
  resolveGraphicsObservation,
  resolveDisplayObservation,
  loadCurrentGraphicsRows,
  loadCurrentDisplayState,
  loadLatestAppliedCompositeValue,
  buildGraphicsPlan,
  buildDisplayPlan,
  applyGraphicsPlan,
  applyDisplayPlan,
  graphicsSummary,
  displaySummary,
  normalizeGpuRole,
  normalizeTouchscreen,
  resolveScreenSizeCandidate,
  resolveNativeResolutionCandidate
};
