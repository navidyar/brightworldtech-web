'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeParts,
  describeParts,
  extractCompositions,
  buildComposedValuePresets
} = require('./labelComposedValuePresets');

const specParts = [
  { type: 'field', field: 'unit.ram', format: 'plain' },
  { type: 'static', value: ' | ' },
  { type: 'field', field: 'unit.storage', format: 'plain' },
  { type: 'static', value: ' | ' },
  { type: 'field', field: 'unit.operating_system', format: 'upper' }
];

test('normalizes valid field/static composition parts and keeps per-field case', () => {
  const parts = normalizeParts([
    ...specParts,
    { type: 'field', field: 'unit.does_not_exist', format: 'plain' },
    { type: 'bogus', value: 'x' }
  ]);
  assert.equal(parts.length, specParts.length);
  assert.equal(parts.at(-1).format, 'upper');
  const camel = normalizeParts([{ type: 'field', field: 'unit.operating_system_short', format: 'camel' }]);
  assert.equal(camel[0].format, 'camel');
  assert.equal(describeParts(parts), 'Memory / RAM | Storage Capacity | Operating System (Long Form)');
});

test('extracts composed text and barcode/QR payloads from structured layouts', () => {
  const layout = {
    elements: [
      { type: 'composed_text', parts: specParts },
      { type: 'barcode', payload: { type: 'composed', parts: specParts } },
      { type: 'qr', payload: { type: 'field', field: 'unit.asset_tag' } }
    ]
  };
  assert.equal(extractCompositions(layout).length, 2);
});

test('learns Common presets from repeated current template configurations and Recent from unique usage', () => {
  const unique = [
    { type: 'field', field: 'unit.asset_tag', format: 'plain' },
    { type: 'static', value: ' / ' },
    { type: 'field', field: 'unit.primary_serial', format: 'upper' }
  ];
  const presets = buildComposedValuePresets([
    { updatedAt: '2026-09-10T12:00:00Z', layout: { elements: [{ type: 'composed_text', parts: specParts }] } },
    { updatedAt: '2026-09-11T12:00:00Z', layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: specParts } }] } },
    { updatedAt: '2026-09-12T12:00:00Z', layout: { elements: [{ type: 'barcode', payload: { type: 'composed', parts: unique } }] } }
  ]);

  assert.equal(presets.common.length, 1);
  assert.equal(presets.common[0].usageCount, 2);
  assert.match(presets.common[0].label, /Memory \/ RAM/);
  assert.equal(presets.recent.length, 1);
  assert.match(presets.recent[0].label, /Asset Tag/);
  assert.ok(presets.starter.length >= 2);
});


test('Common and Recent preset IDs are unique even when compositions share the same JSON prefix', () => {
  const first = [
    { type: 'field', field: 'unit.asset_tag', format: 'plain' },
    { type: 'static', value: ' | ' },
    { type: 'field', field: 'unit.primary_serial', format: 'plain' }
  ];
  const second = [
    { type: 'field', field: 'unit.asset_tag', format: 'plain' },
    { type: 'static', value: ' / ' },
    { type: 'field', field: 'unit.model', format: 'plain' }
  ];
  const third = [
    { type: 'field', field: 'unit.asset_tag', format: 'plain' },
    { type: 'static', value: ' - ' },
    { type: 'field', field: 'unit.operating_system', format: 'plain' }
  ];
  const presets = buildComposedValuePresets([
    { updatedAt: '2026-09-10T12:00:00Z', layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: first } }] } },
    { updatedAt: '2026-09-11T12:00:00Z', layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: first } }] } },
    { updatedAt: '2026-09-12T12:00:00Z', layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: second } }] } },
    { updatedAt: '2026-09-13T12:00:00Z', layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: third } }] } }
  ]);

  const learned = [...presets.common, ...presets.recent];
  assert.ok(learned.length >= 3);
  assert.equal(new Set(learned.map((preset) => preset.id)).size, learned.length);
  for (const preset of learned) assert.match(preset.id, /^(?:common|recent)-[a-f0-9]{20}$/);
});

test('does not promote simple single-field payloads as composed presets', () => {
  const presets = buildComposedValuePresets([
    {
      updatedAt: '2026-09-12T12:00:00Z',
      layout: { elements: [{ type: 'qr', payload: { type: 'composed', parts: [{ type: 'field', field: 'unit.asset_tag' }] } }] }
    }
  ]);
  assert.equal(presets.common.length, 0);
  assert.equal(presets.recent.length, 0);
});
