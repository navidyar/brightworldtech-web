'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LabelPrintSelectionError,
  buildDefaultSelections,
  normalizeUnitLabelPrintSelection
} = require('./labelPrintSelectionPolicy');

const options = [
  { key: 'library-1', name: 'Required Label', available: true, isRequired: true, defaultQuantity: 2, mode: 'library' },
  { key: 'library-2', name: 'Optional Label', available: true, isRequired: false, defaultQuantity: 1, mode: 'library' },
  { key: 'library-3', name: 'Unavailable Label', available: false, isRequired: true, defaultQuantity: 1, unavailableReason: 'Unavailable', mode: 'library' }
];

test('default print selections preselect required available labels but not optional/unavailable labels', () => {
  assert.deepEqual(buildDefaultSelections(options), [
    { key: 'library-1', selected: true, quantity: 2 },
    { key: 'library-2', selected: false, quantity: 1 },
    { key: 'library-3', selected: false, quantity: 1 }
  ]);
});

test('submitted selection keeps only allowed available templates and per-template quantities', () => {
  const selection = normalizeUnitLabelPrintSelection({
    templateKey: ['library-1', 'library-2'],
    quantity: { 'library-1': '3', 'library-2': '1' }
  }, options, 10);

  assert.equal(selection.length, 2);
  assert.equal(selection[0].option.key, 'library-1');
  assert.equal(selection[0].quantity, 3);
  assert.equal(selection[1].option.key, 'library-2');
  assert.equal(selection[1].quantity, 1);
});

test('printing rejects empty, unavailable, and invalid quantity selections', () => {
  assert.throws(
    () => normalizeUnitLabelPrintSelection({}, options, 10),
    (error) => error instanceof LabelPrintSelectionError && error.messages.includes('Select at least one label to print.')
  );
  assert.throws(
    () => normalizeUnitLabelPrintSelection({ templateKey: 'library-3', quantity: { 'library-3': '1' } }, options, 10),
    (error) => error instanceof LabelPrintSelectionError && error.messages.includes('Unavailable')
  );
  assert.throws(
    () => normalizeUnitLabelPrintSelection({ templateKey: 'library-1', quantity: { 'library-1': '11' } }, options, 10),
    (error) => error instanceof LabelPrintSelectionError && error.messages.some((message) => message.includes('between 1 and 10'))
  );
});
