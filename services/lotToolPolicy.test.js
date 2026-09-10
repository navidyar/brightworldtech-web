'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TOOL_POLICY_DEFAULTS,
  resolveLotToolPolicy,
  validateEffectivePolicy
} = require('./lotToolPolicy');

test('Lot Tool policy defaults keep all sources allowed and completion requirements off', () => {
  assert.deepEqual(TOOL_POLICY_DEFAULTS, {
    allowManualCreateUpdate: true,
    allowScanTools: true,
    allowTechTools: true,
    requireScanToolsBeforeCompletion: false,
    requireTechToolsBeforeCompletion: false
  });
});

test('child and grandchild Lots inherit Tool policy until explicitly overridden', () => {
  const rows = [
    { lot_id: 1, parent_lot_id: null, allow_scantools: 0, allow_techtools: 1, require_techtools_before_completion: 1 },
    { lot_id: 2, parent_lot_id: 1, allow_scantools: null, allow_techtools: null, require_techtools_before_completion: null },
    { lot_id: 3, parent_lot_id: 2, allow_scantools: 1, allow_techtools: null, require_techtools_before_completion: null }
  ];
  assert.deepEqual(resolveLotToolPolicy(rows, 2), {
    allowManualCreateUpdate: true,
    allowScanTools: false,
    allowTechTools: true,
    requireScanToolsBeforeCompletion: false,
    requireTechToolsBeforeCompletion: true
  });
  assert.equal(resolveLotToolPolicy(rows, 3).allowScanTools, true);
});

test('required Tool cannot be effectively disallowed', () => {
  assert.deepEqual(validateEffectivePolicy({
    allowScanTools: false,
    requireScanToolsBeforeCompletion: true,
    allowTechTools: true,
    requireTechToolsBeforeCompletion: false
  }), ['ScanTools cannot be required before completion while ScanTools is disallowed for the Lot.']);
});
