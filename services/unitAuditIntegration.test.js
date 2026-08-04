'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('ordinary Unit Create and Edit write details and one audit event before the core transaction commits', () => {
  const controller = read('controllers/techController.js');
  const unitModel = read('models/techUnitModel.js');

  assert.match(controller, /saveIssueDetailsForUnitWithConnection\(connection/);
  assert.match(controller, /saveExpandedDetailsForUnitWithConnection\(connection/);
  assert.match(controller, /createUnitAuditEvent\(event, connection\)/);
  assert.match(unitModel, /if \(typeof options\.beforeCommit === 'function'\)/);
  assert.match(unitModel, /await options\.beforeCommit\([\s\S]*?await connection\.commit\(\)/);
});

test('Management acceptance and revocation write audit events in their existing transactions', () => {
  const source = read('models/lotValidationOverrideModel.js');

  assert.match(source, /eventType: 'lot_requirement_exception_accepted'/);
  assert.match(source, /eventType: 'lot_requirement_exception_revoked'/);
  assert.match(source, /createUnitAuditEvent\([\s\S]*?, connection\);[\s\S]*?await connection\.commit\(\)/);
});
