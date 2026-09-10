'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('API v1 Unit surface exposes the finalized Resolve, Action, Commit, options, and wipe evidence endpoints', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.get\('\/units\/creation-options'/);
  assert.match(routes, /router\.post\('\/units\/resolve'/);
  assert.match(routes, /router\.post\('\/units\/action'/);
  assert.match(routes, /router\.post\('\/units\/commit'/);
  assert.match(routes, /router\.put\('\/units\/:unitId\/wipe-certificates\/:certificateId'/);
});

test('legacy direct Unit create and inventory ingestion are no longer public API routes', () => {
  const routes = read('routes/api.js');
  const controller = read('controllers/apiUnitController.js');
  assert.doesNotMatch(routes, /router\.post\('\/units',\s*requireApiAuth,\s*requireUnitApiAccess,\s*apiUnitController\.createUnit\)/);
  assert.doesNotMatch(routes, /router\.put\('\/units\/:unitId\/inventory\/:reportId'/);
  assert.doesNotMatch(controller, /async function createUnit\(/);
  assert.doesNotMatch(controller, /async function ingestScalarInventory\(/);
  assert.doesNotMatch(controller, /require\('\.\.\/services\/apiScalarInventory'\)/);
});

test('Commit still reuses the established internal creation and inventory engines', () => {
  const commit = read('services/apiUnitCommit.js');
  const intake = read('services/apiUnitIntake.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.match(commit, /apiUnitIntake\.createUnitForCommit/);
  assert.match(commit, /apiScalarInventory\.ingestScalarInventory/);
  assert.match(intake, /async function createUnitForCommit/);
  assert.match(inventory, /async function ingestScalarInventory/);
});

test('secure-wipe evidence remains intentionally separate from Commit', () => {
  const routes = read('routes/api.js');
  const commit = read('services/apiUnitCommit.js');
  assert.match(routes, /wipe-certificates/);
  assert.doesNotMatch(commit, /apiWipeCertificate|recordWipeCertificate|wipe-certificates/);
});
