'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('confirmed processor cleanup is exact, guarded, dry-run by default, and uses catalog transactions', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/migrateConfirmedProcessorCatalogCleanup.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /AMD_PROCESSOR_ID = 246/);
  assert.match(source, /INTEL_DUPLICATE_ID = 241/);
  assert.match(source, /INTEL_CANONICAL_ID = 52/);
  assert.match(source, /AMD_MOBILE_DUPLICATE_ID = 242/);
  assert.match(source, /AMD_MOBILE_CANONICAL_ID = 74/);
  assert.match(source, /INTEL_I9_ID = 245/);
  assert.match(source, /allowedModelCodes: \['5650GE', 'Ryzen 5 PRO 5650GE'\]/);
  assert.match(source, /allowedModelCodes: \['Ultra 7 165U'\]/);
  assert.match(source, /allowedModelCodes: \['Core Ultra 7 165U'\]/);
  assert.match(source, /allowedModelCodes: \['5650U'\]/);
  assert.match(source, /allowedModelCodes: \['Ryzen 5 PRO 5650U'\]/);
  assert.match(source, /allowedModelCodes: \['i9-9900'\]/);
  assert.match(source, /baseSpeedGhz: 3\.1/);
  assert.match(source, /INTEL_I9_FAMILY_NAME = 'Intel i9-9th Gen'/);
  assert.match(source, /processorCatalogModel\.updateProcessorModel/);
  assert.match(source, /processorCatalogModel\.mergeProcessorModels/);
  assert.equal(
    packageJson.scripts['audit:confirmed-processor-cleanup'],
    'node scripts/migrateConfirmedProcessorCatalogCleanup.js'
  );
  assert.equal(
    packageJson.scripts['migrate:confirmed-processor-cleanup'],
    'node scripts/migrateConfirmedProcessorCatalogCleanup.js --apply'
  );
});
