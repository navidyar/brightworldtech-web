'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('regular Tech and elevated Unit Browser roles can search parked Units without receiving the parked browse toggle', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /function canSearchParkedUnits\(req\)/);
  assert.match(controller, /\['admin', 'management', 'tech_lead', 'tech'\]/);
  assert.match(controller, /canSearchParkedUnits:\s*canSearchParkedUnits\(req\)/);
  assert.match(model, /const searchIncludesParkedUnits = filters\.canSearchParkedUnits === true && searchTerms\.length > 0;/);
  assert.match(model, /if \(!searchIncludesParkedUnits\) \{\s*where\.push\(`\$\{getUnitParkedSql\(state, 'u'\)\}/);
  assert.match(model, /const rowIsParked = isUnitParked\(row\)/);
  assert.match(model, /const currentAssignmentUserId = rowIsParked\s*\? null/);
  assert.match(model, /\(rowIsParked \|\| currentAssignmentUserId !== currentUserId\)/);
  assert.match(model, /searchIncludesParkedUnits/);
});

test('a regular Tech receives a Parked Unit takeover action even when they originally created the parked record', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /\(unit\.isParked \|\| !isAssignedToCurrentUser\)/);
  assert.match(table, /unit\.isParked \? 'Request Takeover' : 'Request Override'/);
  assert.match(table, /unit\.isParked \? 'Takeover Pending' : 'Override Pending'/);
  assert.doesNotMatch(table, /canRequestUnitOverride && !unit\.isParked/);
});

test('parked Unit requests use a dedicated takeover explanation and source marker', () => {
  const controller = read('controllers/overrideController.js');
  const modal = read('views/fragments/tech-override-request-modal.ejs');

  assert.match(controller, /const isParkedTakeoverRequest = techUnitModel\.isUnitParked\(unit\)/);
  assert.match(controller, /tech_units_parked_takeover_request/);
  assert.match(controller, /source_unit_state:\s*modalContext\.isParkedTakeoverRequest \? 'parked' : 'active'/);
  assert.match(controller, /Parked Unit takeover request is pending Tech Lead\+ review/);
  assert.match(modal, /Request Parked Unit Takeover/);
  assert.match(modal, /Approval will return the existing Unit to Active in the selected destination Lot and assign it to you/);
  assert.match(modal, /Send Takeover Request/);
});

test('unified Requests identifies a parked takeover and keeps its origin visible to reviewers', () => {
  const model = read('models/overrideRequestModel.js');
  const queue = read('services/unifiedRequestQueue.js');
  const detail = read('views/pages/override-request-detail.ejs');

  assert.match(model, /isParkedTakeoverRequest/);
  assert.match(model, /Parked · No active lot/);
  assert.match(model, /requestTypeLabel:\s*isParkedTakeoverRequest \? 'Parked Unit Takeover'/);
  assert.match(queue, /request\.isParkedTakeoverRequest\s*\? 'Parked Unit Takeover'/);
  assert.match(detail, /Search Units · Parked Unit/);
  assert.match(detail, /Search Units parked result/);
});

test('approval atomically returns a parked Unit to Active, assigns the requester, and preserves historical credit', () => {
  const model = read('models/overrideRequestModel.js');
  const detail = read('views/pages/override-request-detail.ejs');

  assert.match(model, /const wasParked = Number\(request\.is_parked \|\| 0\) === 1/);
  assert.match(model, /canGrantPriorTechCredit = !isOutcomeConfirmation && isManualTechOverride && !wasParked/);
  assert.match(model, /is_parked = 0/);
  assert.match(model, /parked_at = NULL/);
  assert.match(model, /parked_by_user_id = NULL/);
  assert.match(model, /VALUES \(\?, 'returned_to_active', NULL, \?, NULL, \?, \?, \?\)/);
  assert.match(model, /Parked Unit returned to Active and assigned through an approved takeover request/);
  assert.match(detail, /Existing historical work and credit remain unchanged/);
  assert.match(model, /connection:\s*providedConnection = null/);
});

test('QC action availability is attached after live completion, review, and correction state are loaded', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /getQcReviewActionAvailability/);
  assert.match(controller, /latestDecisionCode:\s*unit\.latestQcReview \? unit\.latestQcReview\.decisionCode : ''/);
  assert.match(controller, /hasCorrection:\s*Boolean\(latestQcCorrection\)/);
  assert.match(controller, /qcReviewActionAvailability/);
});

test('Unit Browser keeps Accept and Reject visible and renders unavailable current decisions as disabled buttons', () => {
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(table, /canShowQcReviewActions/);
  assert.match(table, /qcReviewActionAvailability\.acceptEnabled/);
  assert.match(table, /qcReviewActionAvailability\.rejectEnabled/);
  assert.match(table, /tech-action-button--qc-accept decision-action-disabled/);
  assert.match(table, /tech-action-button--qc-reject decision-action-disabled/);
  assert.match(table, /disabled\s*aria-disabled="true"/);
  assert.match(table, /acceptDisabledReason/);
  assert.match(table, /rejectDisabledReason/);
});

test('disabled decisions use the shared neutral gray treatment instead of active green or red', () => {
  const css = read('public/css/app.css');

  assert.match(css, /Shared completed-decision state/);
  assert.match(css, /decision-action-disabled\[disabled\] \{[\s\S]*?border-color:\s*#cbd3dc;[\s\S]*?color:\s*#7a8694;[\s\S]*?background:\s*#eef1f4;[\s\S]*?opacity:\s*1;/);
});

test('the shared application stylesheet is cache-busted for the revised decision treatment', () => {
  const head = read('views/partials/head.ejs');

  assert.match(head, /app\.css\?v=[^"']+/);
});
