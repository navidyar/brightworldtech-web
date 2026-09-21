'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('Composed preset application rebuilds QR/Barcode from canonical composed state', () => {
  const builder = read('public/js/label-builder.js');
  const view = read('views/pages/management-label-builder.ejs');
  assert.match(builder, /function applyComposedPreset\(presetId\)/);
  assert.match(builder, /const parts = normalizeComposedParts\(preset\.parts \|\| \[\]\)/);
  assert.match(builder, /region\.payload = \{ type: 'composed', parts \}/);
  assert.match(builder, /codePayloadTypeSelect\.value = 'composed'/);
  assert.match(builder, /renderRegions\(\)/);
  assert.match(builder, /markDirty\(\)/);
  assert.match(view, /label-builder\.js\?v=20260918-composed-preset-canonical-render/);
});
