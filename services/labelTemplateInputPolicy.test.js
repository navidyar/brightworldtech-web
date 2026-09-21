'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LabelTemplateInputError,
  normalizeTemplateInput,
  normalizeLotAssignments
} = require('./labelTemplateInputPolicy');

test('template metadata accepts agreed categories and defaults new templates to draft', () => {
  const normalized = normalizeTemplateInput({
    name: 'Dell 62mm',
    description: 'Reusable Dell label',
    categoryCode: 'dell'
  });
  assert.equal(normalized.status, 'draft');
  assert.equal(normalized.categoryCode, 'dell');
});

test('invalid template metadata is rejected', () => {
  assert.throws(() => normalizeTemplateInput({ name: '', categoryCode: 'unknown' }), LabelTemplateInputError);
});

test('Lot assignment normalization only keeps selected allowed templates', () => {
  const assignments = normalizeLotAssignments({
    templateId: ['10', '20', '999'],
    normalPrintTemplateId: ['10'],
    quantity: { 10: '2', 20: '99' }
  }, [10, 20]);

  assert.deepEqual(assignments, [
    { labelTemplateId: 10, isRequired: true, defaultQuantity: 2, sortOrder: 10, isActive: true },
    { labelTemplateId: 20, isRequired: false, defaultQuantity: 1, sortOrder: 20, isActive: true }
  ]);
});

test('Lot assignment quantity accepts literal bracket-form request keys as a defensive fallback', () => {
  const assignments = normalizeLotAssignments({
    templateId: '10',
    normalPrintTemplateId: '10',
    'quantity[10]': '4'
  }, [10]);

  assert.deepEqual(assignments, [
    { labelTemplateId: 10, isRequired: true, defaultQuantity: 4, sortOrder: 10, isActive: true }
  ]);
});

test('Lot assignment quantity accepts stable template-specific request keys without numeric bracket compaction', () => {
  const assignments = normalizeLotAssignments({
    templateId: '10',
    normalPrintTemplateId: '10',
    quantity_10: '3'
  }, [10]);

  assert.deepEqual(assignments, [
    { labelTemplateId: 10, isRequired: true, defaultQuantity: 3, sortOrder: 10, isActive: true }
  ]);
});
