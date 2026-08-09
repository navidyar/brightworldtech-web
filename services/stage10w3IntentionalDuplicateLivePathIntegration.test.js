'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function countMatches(value, pattern) {
  return Array.from(value.matchAll(pattern)).length;
}

test('Intentional Duplicate readiness feedback declares and renders its error collection exactly once', () => {
  const feedback = read('views/fragments/tech-unit-intentional-duplicate-request-feedback.ejs');

  assert.equal(countMatches(feedback, /const\s+safeErrors\s*=/g), 1);
  assert.equal(countMatches(feedback, /data-intentional-duplicate-request-feedback/g), 1);
  assert.equal(countMatches(feedback, /safeErrors\.forEach/g), 1);
});

test('readiness errors render through the dedicated feedback fragment before request submission', () => {
  const controller = read('controllers/techController.js');

  assert.match(
    controller,
    /renderIntentionalDuplicateRequestModal[\s\S]*?res\.status\(422\)\.render\('fragments\/tech-unit-intentional-duplicate-request-feedback',[\s\S]*?errorMessages/
  );
});

test('successful Intentional Duplicate submission persists through the request model and returns a request id', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(
    controller,
    /createIntentionalDuplicateRequest[\s\S]*?unitRequestModel\.createIntentionalDuplicateRequest\([\s\S]*?requesterNote[\s\S]*?result\.unitRequestId/
  );
  assert.match(model, /INSERT INTO unit_requests[\s\S]*?VALUES \(\?, 'pending', \?, \?\)/);
  assert.match(model, /INSERT INTO unit_duplicate_requests[\s\S]*?unit_request_id[\s\S]*?matched_unit_id/);
  assert.match(model, /eventType:\s*'submitted'/);
});

test('requester and reviewer queue retrieval both use the same persisted Unit Request source', () => {
  const controller = read('controllers/unitRequestController.js');
  const queue = read('services/unifiedRequestQueue.js');

  assert.match(controller, /const requesterUserId = reviewer \? null : req\.currentUser\.user_id/);
  assert.match(controller, /unitRequestModel\.listUnitRequests\([\s\S]*?requestedByUserId:\s*requesterUserId/);
  assert.match(queue, /requestSource:\s*'unit_request'/);
  assert.match(queue, /requestKey:\s*`unit-\$\{request\.unitRequestId\}`/);
  assert.match(queue, /detailUrl:\s*`\/unit-requests\/\$\{request\.unitRequestId\}`/);
});
