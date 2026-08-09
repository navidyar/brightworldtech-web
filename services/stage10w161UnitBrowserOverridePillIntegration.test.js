'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('the Unit Browser normalizes override pill presentation before versioning and rendering', () => {
  const controller = read('controllers/techController.js');
  const table = read('views/fragments/tech-units-table.ejs');

  assert.match(controller, /buildUnitWeightBrowserPresentation/);
  assert.match(controller, /attachUnitWeightBrowserPresentation\(correctionResult\)/);
  assert.match(controller, /attachTechUnitBrowserVersions\(weightPresentationResult\)/);
  assert.match(table, /if \(unit\.showIndividualWeightPill\)/);
  assert.match(table, /unit\.formattedIndividualWeightPill/);
  assert.doesNotMatch(table, /if \(unit\.hasUnitProductionWeightOverride\)/);
});

test('the presentation helper accepts both established and explicit override fields', () => {
  const helper = read('services/unitWeightBrowserPresentation.js');

  assert.match(helper, /unit\.productionWeightHasOverride/);
  assert.match(helper, /unit\.hasUnitProductionWeightOverride/);
  assert.match(helper, /unit\.productionWeightSourceCode/);
  assert.match(helper, /unit\.formattedUnitProductionWeightOverride/);
  assert.match(helper, /unit\.formattedProductionWeight/);
});
