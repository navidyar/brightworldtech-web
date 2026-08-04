'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('history controller combines audit and legacy sources into one timeline', () => {
  const controller = read('controllers/techController.js');

  assert.match(controller, /unitAuditEventModel\.listUnitAuditEvents\(unitId/);
  assert.match(controller, /unitAuditEventModel\.getUnitCreationContext\(unitId/);
  assert.match(controller, /buildUnitHistoryTimeline\(\{/);
});

test('history fragment uses one compact timeline instead of category sections', () => {
  const template = read('views/fragments/tech-unit-history-panel.ejs');

  assert.match(template, /class="tech-audit-timeline"/);
  assert.match(template, /event\.actorName/);
  assert.doesNotMatch(template, /Memory Configuration History/);
  assert.doesNotMatch(template, /Lot Requirement Acceptance History/);
  assert.doesNotMatch(template, /Override Request History/);
});
