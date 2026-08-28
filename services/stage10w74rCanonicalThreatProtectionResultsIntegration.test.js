'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Threat Protection Scan keeps the existing field identity and system category', () => {
  const registry = read('config/unitFormFieldRegistry.js');
  const expandedModel = read('models/unitExpandedFormModel.js');

  assert.match(registry, /configurableField\('virus_check', 'Threat Protection Scan'/);
  assert.match(expandedModel, /SYSTEM_CONFIG_CATEGORY_IDS\.VIRUS_CHECK_STATUSES/);
  assert.match(expandedModel, /virusCheckStatusOptions/);
});

test('canonical Threat Protection migration merges Passed into Pass and Failed into Fail only', () => {
  const script = read('scripts/migrateCanonicalThreatProtectionResults.js');

  assert.match(script, /Canonical Threat Protection Scan policy: Pass, Fail; preserve all other distinct results\./);
  assert.match(script, /aliases: Object\.freeze\(\['pass', 'passed'\]\)/);
  assert.match(script, /aliases: Object\.freeze\(\['fail', 'failed'\]\)/);
  assert.match(script, /Other distinct results preserved/);
  assert.doesNotMatch(script, /not run.*deactiv/i);
  assert.doesNotMatch(script, /unknown.*deactiv/i);
});

test('canonical Threat Protection migration is audit-first and remaps live Unit and Lot Requirement references', () => {
  const script = read('scripts/migrateCanonicalThreatProtectionResults.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /SYSTEM_CONFIG_CATEGORY_IDS\.VIRUS_CHECK_STATUSES/);
  assert.match(script, /'unit_specifications',[\s\S]*?'virus_check_status_config_value_id'/);
  assert.match(script, /'lot_requirements',[\s\S]*?'requirement_config_value_id'/);
  assert.match(script, /deactivateRows/);
  assert.match(script, /DELETE FROM operational_option_usage_rankings WHERE option_scope = 'virus_check_status'/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
});

test('migration refuses to silently merge a duplicate alias with an unexpected numeric system binding', () => {
  const script = read('scripts/migrateCanonicalThreatProtectionResults.js');
  assert.match(script, /Duplicate Threat Protection results are system-bound/);
  assert.match(script, /Refusing automatic merge/);
});

test('package exposes audit, migration, and validation commands for Threat Protection result cleanup', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['audit:threat-protection-results'],
    'node scripts/migrateCanonicalThreatProtectionResults.js'
  );
  assert.equal(
    packageJson.scripts['migrate:threat-protection-results'],
    'node scripts/migrateCanonicalThreatProtectionResults.js --apply'
  );
  assert.match(
    packageJson.scripts['validate:threat-protection-results'],
    /stage10w74rCanonicalThreatProtectionResultsIntegration\.test\.js/
  );
  assert.match(packageJson.scripts['validate:threat-protection-results'], /stage10w66SpecsTestsOverhaulIntegration\.test\.js/);
  assert.match(packageJson.scripts['validate:threat-protection-results'], /lotRequirementEvaluator\.test\.js/);
});
