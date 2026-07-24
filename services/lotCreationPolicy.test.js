'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NEW_LOT_VISIBILITY,
  buildNewLotCreatedRedirect,
  getNewLotInitialActiveValue
} = require('./lotCreationPolicy');

test('new Lots start hidden and require an explicit manual Unhide action', () => {
  assert.deepEqual(NEW_LOT_VISIBILITY, {
    isActive: 0,
    isHidden: true,
    requiresManualUnhide: true
  });
  assert.equal(getNewLotInitialActiveValue(), 0);
});

test('new Lot creation redirects directly to the hidden Lot detail page', () => {
  assert.equal(
    buildNewLotCreatedRedirect(42),
    '/management/lots/42?created=1'
  );

  assert.throws(
    () => buildNewLotCreatedRedirect(''),
    /valid new Lot ID/
  );
});
