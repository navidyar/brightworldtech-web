'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('effective weight priority is Unit override, current Lot, then category with no application maximum', () => {
  const productionWeight = read('models/productionWeightModel.js');
  const techUnit = read('models/techUnitModel.js');

  assert.match(productionWeight, /Unit override > Lot default > Unit category default/);
  assert.match(productionWeight, /if \(!Number\.isFinite\(numericValue\) \|\| numericValue < 0\)/);
  assert.doesNotMatch(productionWeight, /numericValue > 10/);
  assert.doesNotMatch(techUnit, /resolvedWeight > 10\.00/);
  assert.doesNotMatch(techUnit, /productionWeight > 10\.00/);
  assert.match(techUnit, /A completion credit weight of at least 0\.10 is required\./);
  assert.match(techUnit, /This unit needs a production weight of at least 0\.10 before lot work can be completed\./);
});

test('Lot edits and every Unit move/edit path synchronize active manual completion weights transactionally', () => {
  const lotModel = read('models/lotModel.js');
  const techUnitModel = read('models/techUnitModel.js');
  const overrideRequestModel = read('models/overrideRequestModel.js');

  assert.match(lotModel, /async function updateLot[\s\S]*?beginTransaction\(\)[\s\S]*?syncEffectiveManualCompletionWeights\(\{[\s\S]*?lotId: Number\(lotId\)[\s\S]*?commit\(\)/);
  assert.match(techUnitModel, /async function assumeExistingTechUnitFromDuplicateMatch[\s\S]*?syncEffectiveManualCompletionWeights\(\{[\s\S]*?unitIds: \[safeUnitId\]/);
  assert.match(techUnitModel, /async function updateExistingTechUnit[\s\S]*?saveUnitModuleRows[\s\S]*?syncEffectiveManualCompletionWeights\(\{[\s\S]*?unitIds: \[Number\(unitId\)\]/);
  assert.match(techUnitModel, /async function returnTechUnitToActive[\s\S]*?syncEffectiveManualCompletionWeights\(\{[\s\S]*?unitIds: \[safeUnitId\]/);
  assert.match(overrideRequestModel, /if \(lotChanged \|\| wasParked\)[\s\S]*?syncEffectiveManualCompletionWeights\(\{[\s\S]*?unitIds: \[request\.unit_id\]/);
});

test('weight synchronization updates only active manual completions and preserves fixed special credits', () => {
  const syncModel = read('models/productionWeightSyncModel.js');

  assert.match(syncModel, /const SYNCABLE_CREDIT_SOURCE = 'manual_completion';/);
  assert.match(syncModel, /WHERE credit_source = \?/);
  assert.match(syncModel, /reversed_at IS NULL/);
  assert.doesNotMatch(syncModel, /override_prior_tech_credit/);
  assert.match(syncModel, /productionWeightModel\.buildProductionWeightDetails/);
});

test('Unit Browser shows adjacent blue Lot and individual override pills', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(table, /tech-unit-summary-weight-strip[\s\S]*?Current lot weight[\s\S]*?unit\.formattedCurrentLotWeight/);
  assert.match(table, /if \(unit\.showIndividualWeightPill\)[\s\S]*?tech-unit-summary-weight-value--override[\s\S]*?Individual weight[\s\S]*?unit\.formattedIndividualWeightPill/);
  assert.match(css, /Stage 10W\.16\.2[\s\S]*?\.tech-unit-summary-weight-strip \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 4px;/);
  assert.match(css, /\.tech-unit-summary-weight-value \{[\s\S]*?border: 1px solid #c6d9ee;[\s\S]*?background: #edf5ff;/);
  assert.doesNotMatch(css, /\.tech-unit-summary-weight-value--override\s*\{/);
});

test('Lot and Unit forms explain live inheritance and persistent individual overrides', () => {
  const lotForm = read('views/fragments/lot-form-modal.ejs');
  const unitForm = read('views/fragments/tech-unit-form.ejs');

  assert.match(lotForm, /immediately becomes the effective weight for every Unit currently in this Lot unless that Unit has an individual override/);
  assert.match(lotForm, /There is no application maximum/);
  assert.match(unitForm, /An individual Unit override stays with the Unit and continues to take precedence after it moves to another Lot/);
  assert.doesNotMatch(lotForm, /name="defaultProductionWeight"[^>]*max=/);
  assert.doesNotMatch(unitForm, /name="productionWeightOverride"[^>]*max=/);
});

test('migration, audit, apply, and focused validation commands are exposed', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:production-weight-capacity'], 'node scripts/migrateProductionWeightCapacity.js');
  assert.equal(packageJson.scripts['migrate:production-weight-capacity'], 'node scripts/migrateProductionWeightCapacity.js --apply');
  assert.equal(packageJson.scripts['audit:effective-unit-weights'], 'node scripts/syncEffectiveUnitWeights.js');
  assert.equal(packageJson.scripts['sync:effective-unit-weights'], 'node scripts/syncEffectiveUnitWeights.js --apply');
  assert.match(packageJson.scripts['validate:effective-unit-weights'], /productionWeightSyncModel\.test\.js/);
  assert.match(packageJson.scripts['validate:effective-unit-weights'], /stage10w16EffectiveWeightInheritanceIntegration\.test\.js/);
});

test('weight storage capacity is widened without shrinking already-larger decimal columns', () => {
  const migration = read('scripts/migrateProductionWeightCapacity.js');
  const lotModel = read('models/lotModel.js');

  assert.match(migration, /const TARGET_PRECISION = 20;/);
  assert.match(migration, /const TARGET_SCALE = 2;/);
  assert.match(migration, /tableName: 'lots', columnName: 'default_production_weight'/);
  assert.match(migration, /tableName: 'units', columnName: 'production_weight_override'/);
  assert.match(migration, /tableName: 'unit_work_completions', columnName: 'production_weight_value'/);
  assert.match(migration, /const targetScale = Math\.max\(TARGET_SCALE, scale\);/);
  assert.match(migration, /const targetPrecision = Math\.max\(TARGET_PRECISION, precision \+ Math\.max\(0, targetScale - scale\)\);/);
  assert.match(lotModel, /DECIMAL\(20,2\)/);
});

test('all Add/Edit Unit entry points use the matched-weight-pill stylesheet version', () => {
  const expected = '/css/tech-units-clean.css?v=20260806-stage10w162-matched-weight-pill-styles';

  for (const relativePath of [
    'views/pages/tech-units.ejs',
    'views/pages/tech-unit-form.ejs',
    'views/pages/tech-unit-detail.ejs'
  ]) {
    assert.match(read(relativePath), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
