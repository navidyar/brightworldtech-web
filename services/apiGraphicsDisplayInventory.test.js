'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeGraphicsObservation,
  normalizeDisplayObservation,
  normalizeGpuRole,
  normalizeTouchscreen,
  resolveScreenSizeCandidate,
  resolveNativeResolutionCandidate,
  buildGraphicsPlan,
  buildDisplayPlan,
  SCREEN_SIZE_FIELD_KEY,
  NATIVE_RESOLUTION_FIELD_KEY
} = require('./apiGraphicsDisplayInventory');

test('graphics keeps only customer-useful adapter identity, role, VRAM, and VRAM provenance', () => {
  const observation = normalizeGraphicsObservation({
    state: 'known',
    adapters: [{ role: 'discrete', vendor: 'NVIDIA', name: 'RTX A2000', memoryBytes: 4294967296, memorySource: 'dxdiag', driver: 'noise' }]
  });
  assert.equal(observation.value.adapters[0].gpu_role_code, 'dedicated');
  assert.equal(observation.value.adapters[0].gpu_vendor, 'NVIDIA');
  assert.equal(observation.value.adapters[0].gpu_model, 'RTX A2000');
  assert.equal(observation.value.adapters[0].vram_mb, 4096);
  assert.equal(observation.value.adapters[0].vram_source, 'dxdiag');
  assert.equal('driver' in observation.value.adapters[0], false);
});

test('primary/secondary graphics labels do not pretend to identify integrated versus dedicated', () => {
  assert.equal(normalizeGpuRole({ role: 'primary' }), 'unknown');
  assert.equal(normalizeGpuRole({ role: 'integrated' }), 'integrated');
});

test('display only treats an explicitly confirmed internal panel as eligible for form-backed screen values', () => {
  const confirmed = normalizeDisplayObservation({
    built_in_panel: { built_in: true, diagonal: 14, nativeResolution: '1920 x 1080' },
    touchscreen: { detected: true }
  });
  assert.equal(confirmed.value.built_in_panel.confidence, 'confirmed');
  assert.equal(confirmed.value.touchscreen_hardware_state_code, 'present');

  const unconfirmed = normalizeDisplayObservation({
    built_in_panel: { diagonal: 27, nativeResolution: '2560x1440' }
  });
  assert.equal(unconfirmed.value.built_in_panel.confidence, 'unknown');
});

test('touchscreen possible remains distinct from confirmed present and confirmed absent', () => {
  assert.equal(normalizeTouchscreen({ detected: false, possible: true }), 'possible');
  assert.equal(normalizeTouchscreen({ detected: false, possible: false }), 'absent');
  assert.equal(normalizeTouchscreen({ detected: true }), 'present');
});

test('screen size and native resolution resolve only exact-compatible configured values', () => {
  assert.equal(resolveScreenSizeCandidate(14, [{ id: 1, label: '14 inch' }]).resolvedId, 1);
  assert.equal(resolveNativeResolutionCandidate('1920 × 1080', [{ id: 2, label: '1920x1080' }]).resolvedId, 2);
  assert.equal(resolveNativeResolutionCandidate('1366x768', [{ id: 2, label: '1920x1080' }]).status, 'unmapped');
});

test('Unknown graphics never erases current graphics', () => {
  const plan = buildGraphicsPlan({ observation: { state: 'unknown', value: null }, currentRows: [{ gpu_model: 'Old' }] });
  assert.equal(plan.status, 'ignored_unknown');
});

test('manual screen size and native resolution block tool replacement while touchscreen hardware remains independent', () => {
  const observation = {
    state: 'known',
    value: {
      built_in_panel: {
        confidence: 'confirmed',
        screen_size_submitted: 14,
        screen_size_resolution: { status: 'resolved' },
        screen_size_config_value_id: 101,
        native_resolution_submitted: '1920x1080',
        native_resolution_resolution: { status: 'resolved' },
        native_resolution_config_value_id: 202
      },
      touchscreen_hardware_state_code: 'present'
    }
  };
  const plan = buildDisplayPlan({
    observation,
    currentState: {
      screen_size_config_value_id: 99,
      native_screen_resolution_config_value_id: 199,
      touchscreen_hardware_state_code: 'unknown'
    },
    manualSources: new Map([[SCREEN_SIZE_FIELD_KEY, 'manual_override'], [NATIVE_RESOLUTION_FIELD_KEY, 'manual_override']]),
    latestAppliedValue: null
  });
  assert.equal(plan.changes.screen_size.status, 'blocked_manual');
  assert.equal(plan.changes.native_resolution.status, 'blocked_manual');
  assert.equal(plan.changes.touchscreen.status, 'applied');
});

test('unconfirmed external/unknown panel data cannot populate built-in screen fields', () => {
  const plan = buildDisplayPlan({
    observation: {
      state: 'known',
      value: {
        built_in_panel: {
          confidence: 'unknown',
          screen_size_submitted: 27,
          screen_size_resolution: { status: 'resolved' },
          screen_size_config_value_id: 27,
          native_resolution_submitted: '2560x1440',
          native_resolution_resolution: { status: 'resolved' },
          native_resolution_config_value_id: 44
        },
        touchscreen_hardware_state_code: 'unknown'
      }
    },
    currentState: { screen_size_config_value_id: null, native_screen_resolution_config_value_id: null, touchscreen_hardware_state_code: 'unknown' },
    manualSources: new Map(),
    latestAppliedValue: null
  });
  assert.equal(Object.keys(plan.changes).length, 0);
});
