'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BulkLabelPrintSelectionError,
  canOfferBulkLabelPrint,
  normalizeSelectedUnitIds
} = require('./bulkLabelPrintSelectionPolicy');

test('bulk label printing is offered only for one exact active Lot', () => {
  assert.equal(canOfferBulkLabelPrint({ lotId: '42', lotScope: 'direct', unitState: 'active' }), true);
  assert.equal(canOfferBulkLabelPrint({ lotId: '', lotScope: 'direct', unitState: 'active' }), false);
  assert.equal(canOfferBulkLabelPrint({ lotId: '42', lotScope: 'descendants', unitState: 'active' }), false);
  assert.equal(canOfferBulkLabelPrint({ lotId: '42', lotScope: 'direct', unitState: 'parked' }), false);
});

test('bulk unit selection deduplicates and accepts only Units from the allowed current page', () => {
  assert.deepEqual(
    normalizeSelectedUnitIds({ unitId: ['10', '11', '10'] }, [10, 11, 12]),
    [10, 11]
  );
  assert.throws(
    () => normalizeSelectedUnitIds({ unitId: ['10', '99'] }, [10, 11, 12]),
    BulkLabelPrintSelectionError
  );
  assert.throws(
    () => normalizeSelectedUnitIds({}, [10, 11, 12]),
    /Select at least one completed Unit/
  );
});
