'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const dbModulePath = require.resolve('./db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: {} }
};

const {
  resolveEffectiveWeightForSyncRow,
  buildCompletionWeightSyncPlan
} = require('./productionWeightSyncModel');

const PRODUCTION_WEIGHT_OPTIONS = [
  {
    code: 'production_weight_laptop',
    label: 'Laptop',
    weightValue: 1.25,
    formattedWeightValue: '1.25'
  },
  {
    code: 'production_weight_desktop',
    label: 'Desktop',
    weightValue: 1.5,
    formattedWeightValue: '1.50'
  }
];

test('an individual Unit override has priority and has no artificial maximum of 10', () => {
  const details = resolveEffectiveWeightForSyncRow({
    production_weight_override: 125.75,
    resolved_default_production_weight: 2.5,
    unit_category_code: 'laptop'
  }, PRODUCTION_WEIGHT_OPTIONS);

  assert.equal(details.effectiveWeight, 125.75);
  assert.equal(details.sourceCode, 'unit_override');
  assert.equal(details.hasOverride, true);
});

test('a Unit without an individual override inherits its current Lot weight', () => {
  const details = resolveEffectiveWeightForSyncRow({
    production_weight_override: null,
    resolved_default_production_weight: 7.25,
    default_production_weight_label: 'Current Lot',
    unit_category_code: 'desktop'
  }, PRODUCTION_WEIGHT_OPTIONS);

  assert.equal(details.effectiveWeight, 7.25);
  assert.equal(details.sourceCode, 'lot_default');
});

test('the current Unit row determines the inherited weight after a Lot move', () => {
  const beforeMove = resolveEffectiveWeightForSyncRow({
    production_weight_override: null,
    resolved_default_production_weight: 2,
    unit_category_code: 'laptop'
  }, PRODUCTION_WEIGHT_OPTIONS);
  const afterMove = resolveEffectiveWeightForSyncRow({
    production_weight_override: null,
    resolved_default_production_weight: 18.5,
    unit_category_code: 'laptop'
  }, PRODUCTION_WEIGHT_OPTIONS);

  assert.equal(beforeMove.effectiveWeight, 2);
  assert.equal(afterMove.effectiveWeight, 18.5);
});

test('category weight remains the fallback when neither Unit nor Lot provides a weight', () => {
  const details = resolveEffectiveWeightForSyncRow({
    production_weight_override: null,
    resolved_default_production_weight: null,
    unit_category_code: 'laptop'
  }, PRODUCTION_WEIGHT_OPTIONS);

  assert.equal(details.effectiveWeight, 1.25);
  assert.equal(details.sourceCode, 'category_default');
});

test('sync plan updates stale completed rows and leaves matching rows unchanged', () => {
  const plan = buildCompletionWeightSyncPlan({
    unitRows: [
      {
        unit_id: 10,
        lot_id: 20,
        production_weight_override: null,
        resolved_default_production_weight: 14,
        unit_category_code: 'desktop'
      },
      {
        unit_id: 11,
        lot_id: 20,
        production_weight_override: 25,
        resolved_default_production_weight: 14,
        unit_category_code: 'desktop'
      }
    ],
    completionRows: [
      { unit_work_completion_id: 101, unit_id: 10, production_weight_value: 2 },
      { unit_work_completion_id: 102, unit_id: 10, production_weight_value: 14 },
      { unit_work_completion_id: 103, unit_id: 11, production_weight_value: 14 }
    ],
    productionWeightOptions: PRODUCTION_WEIGHT_OPTIONS
  });

  assert.deepEqual(plan.updates.map((entry) => ({
    completionId: entry.completionId,
    effectiveWeight: entry.effectiveWeight,
    sourceCode: entry.sourceCode
  })), [
    { completionId: 101, effectiveWeight: 14, sourceCode: 'lot_default' },
    { completionId: 103, effectiveWeight: 25, sourceCode: 'unit_override' }
  ]);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.unchanged[0].completionId, 102);
});

test('sync plan reports Units whose effective weight is not configured', () => {
  const plan = buildCompletionWeightSyncPlan({
    unitRows: [
      {
        unit_id: 99,
        lot_id: 8,
        production_weight_override: null,
        resolved_default_production_weight: null,
        unit_category_code: 'unknown'
      }
    ],
    completionRows: [
      { unit_work_completion_id: 201, unit_id: 99, production_weight_value: 1 }
    ],
    productionWeightOptions: PRODUCTION_WEIGHT_OPTIONS
  });

  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unresolvedUnits.length, 1);
  assert.equal(plan.unresolvedUnits[0].unitId, 99);
});
