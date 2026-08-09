'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildUnitWeightBrowserPresentation } = require('./unitWeightBrowserPresentation');

test('uses the established effective-weight override flag when the display-only flag is absent', () => {
  assert.deepEqual(buildUnitWeightBrowserPresentation({
    productionWeightHasOverride: true,
    formattedProductionWeight: '12.50'
  }), {
    showIndividualWeightPill: true,
    formattedIndividualWeightPill: '12.50'
  });
});

test('uses the effective source code as a second authoritative override signal', () => {
  assert.deepEqual(buildUnitWeightBrowserPresentation({
    productionWeightSourceCode: 'unit_override',
    productionWeight: 17.25
  }), {
    showIndividualWeightPill: true,
    formattedIndividualWeightPill: '17.25'
  });
});

test('prefers the explicit Unit override display value when available', () => {
  assert.deepEqual(buildUnitWeightBrowserPresentation({
    hasUnitProductionWeightOverride: true,
    formattedUnitProductionWeightOverride: '18.75',
    formattedProductionWeight: '18.75'
  }), {
    showIndividualWeightPill: true,
    formattedIndividualWeightPill: '18.75'
  });
});

test('does not show an individual pill when the effective source is the Lot', () => {
  assert.deepEqual(buildUnitWeightBrowserPresentation({
    productionWeightHasOverride: false,
    productionWeightSourceCode: 'lot_default',
    formattedProductionWeight: '4.00'
  }), {
    showIndividualWeightPill: false,
    formattedIndividualWeightPill: ''
  });
});

test('formats numeric fallback weights with two decimals, including zero', () => {
  assert.deepEqual(buildUnitWeightBrowserPresentation({
    productionWeightHasOverride: true,
    unitProductionWeightOverride: 0
  }), {
    showIndividualWeightPill: true,
    formattedIndividualWeightPill: '0.00'
  });
});
