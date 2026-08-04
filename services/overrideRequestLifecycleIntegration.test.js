'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Tech Units attaches the latest manual override lifecycle to each Unit', () => {
  const source = read('controllers/techController.js');
  const expanded = source.indexOf('attachExpandedUnitDetails(rawResult)');
  const overrides = source.indexOf('attachLatestOverrideHistory(expandedResult)', expanded);
  const completion = source.indexOf('attachLatestWorkCompletion(overrideResult)', overrides);

  assert.ok(expanded >= 0);
  assert.ok(overrides > expanded);
  assert.ok(completion > overrides);
});

test('latest Unit override lookup is limited to manual Tech requests and includes destination data', () => {
  const source = read('models/overrideRequestModel.js');

  assert.match(source, /r\.requested_destination_lot_id/);
  assert.match(source, /AND r\.request_type = \?/);
  assert.match(source, /MANUAL_TECH_OVERRIDE_REQUEST_TYPE/);
});

test('manual override creation locks the Unit and rejects a second pending request', () => {
  const source = read('models/overrideRequestModel.js');
  const lock = source.indexOf("SELECT unit_id FROM units WHERE unit_id = ? LIMIT 1 FOR UPDATE");
  const pending = source.indexOf("AND LOWER(request_status) = 'pending'", lock);
  const duplicateError = source.indexOf("error.code = 'BWT_OVERRIDE_ALREADY_PENDING'", pending);
  const insert = source.indexOf('INSERT INTO unit_override_requests', duplicateError);

  assert.ok(lock >= 0);
  assert.ok(pending > lock);
  assert.ok(duplicateError > pending);
  assert.ok(insert > duplicateError);
});

test('override request modal captures an explicit destination Lot', () => {
  const modal = read('views/fragments/tech-override-request-modal.ejs');

  assert.match(modal, /Requested Destination Lot/);
  assert.match(modal, /name="requestedDestinationLotId"/);
  assert.match(modal, /Select the current Lot for an assignment-only takeover/);
});

test('duplicate intake forwards its selected Lot into the override request modal', () => {
  const source = read('public/js/tech-unit-form.js');

  assert.match(source, /destinationLotId = resolveAssignableLotIdForDuplicateAction\(form\)/);
  assert.match(source, /params\.set\('destinationLotId', destinationLotId\)/);
});

test('Tech Units refreshes override changes without replacing the complete table', () => {
  const page = read('views/pages/tech-units.ejs');
  const script = read('public/js/tech-units.js');

  assert.match(page, /data-tech-units-refresh-url/);
  assert.doesNotMatch(page, /override-requested from:body/);
  assert.doesNotMatch(page, /every 30s/);
  assert.match(script, /'override-requested'/);
  assert.match(script, /reconcileTechUnitRecords/);
});

test('Unit rows display pending and reviewed manual override states', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /Override <%= latestManualOverride\.statusLabel %>/);
  assert.match(table, /Override Pending/);
  assert.match(table, /hasPendingManualOverride/);
});

test('Unified request review shows and preselects the requested destination Lot', () => {
  const detail = read('views/pages/override-request-detail.ejs');
  const model = read('models/overrideRequestModel.js');

  assert.match(detail, /Requested Destination/);
  assert.match(detail, /request\.requestedDestinationLotId \|\| request\.lotId/);
  assert.match(model, /normalizeOptionalInteger\(request\.requested_destination_lot_id\)/);
  assert.match(model, /approvedDestinationLotId !== currentLotId/);
});
