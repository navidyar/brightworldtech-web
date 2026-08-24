'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Unit lifecycle and duplicate assumption transactions write grouped workflow audits', () => {
  const source = read('models/techUnitModel.js');
  assert.match(source, /unitWorkflowAudit\.recordParked\(connection/);
  assert.match(source, /unitWorkflowAudit\.recordReturnedToActive\(connection/);
  assert.match(source, /unitWorkflowAudit\.recordExistingUnitAssumed\(connection/);
  assert.match(source, /unitWorkflowAudit\.recordAssignmentChanged\(connection/);
});

test('unified request review writes authoritative outcome and override approval audits', () => {
  const outcomeSource = read('models/unitOutcomeModel.js');
  const overrideSource = read('models/overrideRequestModel.js');
  assert.doesNotMatch(outcomeSource, /approveCurrentOutcome|unitWorkflowAudit\.recordOutcomeApproved\(connection/);
  assert.match(overrideSource, /unitWorkflowAudit\.recordOutcomeApproved\(connection/);
  assert.match(overrideSource, /unitWorkflowAudit\.recordOverrideApproved\(connection/);
});

test('automatic Management acceptance expiration writes a System audit event', () => {
  const source = read('models/lotValidationOverrideModel.js');
  assert.match(source, /unitWorkflowAudit\.recordExpiredExceptions\(connection/);
  assert.match(source, /Lot requirements changed/);
  assert.match(source, /The Unit left the accepted Lot/);
});
