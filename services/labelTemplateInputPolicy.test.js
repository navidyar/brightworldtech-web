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
    requiredTemplateId: ['10'],
    activeTemplateId: ['10', '20'],
    quantity: { 10: '2', 20: '99' },
    sortOrder: { 10: '40', 20: '10' }
  }, [10, 20]);

  assert.deepEqual(assignments, [
    { labelTemplateId: 20, isRequired: false, defaultQuantity: 1, sortOrder: 10, isActive: true },
    { labelTemplateId: 10, isRequired: true, defaultQuantity: 2, sortOrder: 20, isActive: true }
  ]);
});
