'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `${name} should exist`);
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('Requests queue uses summary loaders while detail routes retain full loaders', () => {
  const controller = read('controllers/unitRequestController.js');
  const renderQueue = functionBody(controller, 'renderUnitRequestsPage', 'renderUnitRequestDetail');
  const renderDetail = functionBody(controller, 'renderUnitRequestDetail', 'withdrawUnitRequest');

  assert.match(renderQueue, /unitRequestModel\.listUnitRequestSummaries/);
  assert.match(renderQueue, /overrideRequestModel\.listOverrideRequestSummaries/);
  assert.doesNotMatch(renderQueue, /unitRequestModel\.listUnitRequests/);
  assert.doesNotMatch(renderQueue, /overrideRequestModel\.listOverrideRequests/);
  assert.match(renderDetail, /unitRequestModel\.getUnitRequestById/);
});

test('Unit Request queue summary avoids transferring full duplicate snapshots', () => {
  const model = read('models/unitRequestModel.js');
  const summary = model.slice(
    model.indexOf('function getRequestSummarySelectSql'),
    model.indexOf('async function listUnitRequests')
  );

  assert.match(summary, /JSON_EXTRACT\(udr\.intake_snapshot_json, '\$\.display\.serialSummary'\)/);
  assert.match(summary, /JSON_EXTRACT\(udr\.matched_unit_snapshot_json, '\$\.display\.serialSummary'\)/);
  assert.doesNotMatch(summary, /^\s*udr\.intake_snapshot_json,\s*$/m);
  assert.doesNotMatch(summary, /^\s*udr\.matched_unit_snapshot_json,\s*$/m);
  assert.match(model, /async function listUnitRequestSummaries/);
});

test('Override queue summary omits detail-only completion and credit work', () => {
  const model = read('models/overrideRequestModel.js');
  const summary = functionBody(model, 'listOverrideRequestSummaries', 'listOverrideRequests');

  assert.doesNotMatch(summary, /unit_work_completions/);
  assert.doesNotMatch(summary, /prior_tech_credit_/);
  assert.doesNotMatch(summary, /EXISTS\s*\(/);
  assert.doesNotMatch(summary, /reviewed_by\s+ON/);
  assert.match(summary, /JSON_VALID\(r\.request_details\)/);
  assert.match(summary, /r\.request_status = \?/);
  assert.doesNotMatch(summary, /LOWER\(r\.request_status\)/);
});

test('schema capability checks are cached and consolidated off the queue hot path', () => {
  const unitModel = read('models/unitRequestModel.js');
  const overrideModel = read('models/overrideRequestModel.js');

  assert.match(unitModel, /REQUEST_SCHEMA_CAPABILITY_CACHE_MS = 60000/);
  assert.match(unitModel, /TABLE_NAME IN \(\$\{requiredTables\.map/);
  assert.match(unitModel, /requestSchemaCapabilityCache\.expiresAt > now/);
  assert.match(overrideModel, /OVERRIDE_SCHEMA_CAPABILITY_CACHE_MS = 60000/);
  assert.match(overrideModel, /overrideSchemaCapabilityCache\.expiresAt > now/);
});
