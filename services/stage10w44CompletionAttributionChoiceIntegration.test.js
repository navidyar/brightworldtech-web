'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canChooseCompletionAttribution,
  getAllowedCompletionUserIds,
  resolveCompletionUserId
} = require('./completionAttributionPolicy');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('only Tech Lead+ roles can choose between themselves and the currently assigned technician', () => {
  assert.equal(canChooseCompletionAttribution(['tech']), false);
  assert.equal(canChooseCompletionAttribution(['qc']), false);
  assert.equal(canChooseCompletionAttribution(['tech_lead']), true);
  assert.equal(canChooseCompletionAttribution(['management']), true);
  assert.equal(canChooseCompletionAttribution(['admin']), true);

  assert.deepEqual(
    getAllowedCompletionUserIds({ currentUserId: 20, assignedUserId: 10, roleCodes: ['tech_lead'] }),
    [10, 20]
  );
  assert.deepEqual(
    getAllowedCompletionUserIds({ currentUserId: 20, assignedUserId: 10, roleCodes: ['tech'] }),
    [20]
  );
});

test('Tech Lead+ defaults completion credit to the assigned technician but may explicitly choose themselves', () => {
  assert.equal(
    resolveCompletionUserId({ currentUserId: 20, assignedUserId: 10, roleCodes: ['tech_lead'] }),
    10
  );
  assert.equal(
    resolveCompletionUserId({ currentUserId: 20, assignedUserId: 10, roleCodes: ['management'], requestedUserId: 20 }),
    20
  );
  assert.equal(
    resolveCompletionUserId({ currentUserId: 20, assignedUserId: 10, roleCodes: ['admin'], requestedUserId: 10 }),
    10
  );
});

test('regular Tech users cannot submit another user as completion owner', () => {
  assert.throws(
    () => resolveCompletionUserId({ currentUserId: 20, assignedUserId: 10, roleCodes: ['tech'], requestedUserId: 10 }),
    /Choose either your user or the technician currently assigned/
  );
  assert.equal(
    resolveCompletionUserId({ currentUserId: 20, assignedUserId: 10, roleCodes: ['tech'], requestedUserId: 20 }),
    20
  );
});

test('completion preview exposes the current assigned technician and controller records chosen attribution separately from actor', () => {
  const model = read('models/techUnitModel.js');
  const controller = read('controllers/techController.js');

  assert.match(model, /async function getAssignedUserSummaryForCompletion/);
  assert.match(model, /assignedToUserId/);
  assert.match(model, /assignedToName/);
  assert.match(controller, /resolveCompletionUserId\(\{/);
  assert.match(controller, /completedByUserId: selectedCompletedByUserId/);
  assert.match(controller, /recordedByUserId: req\.currentUser\.user_id/);
});

test('completion modal offers the two attribution choices only when controller grants Tech Lead+ choice', () => {
  const modal = read('views/fragments/tech-unit-complete-work-modal.ejs');

  assert.match(modal, /if \(canChooseCompletionAttribution\)/);
  assert.match(modal, /<h3>Record Completion For<\/h3>/);
  assert.match(modal, /name="completedByUserId"/);
  assert.match(modal, /Currently assigned technician — preserve their completion and production credit/);
  assert.match(modal, /Current user — record the completion and production credit under your own account/);
  assert.match(modal, /does not change the Unit’s assignment/);
});
