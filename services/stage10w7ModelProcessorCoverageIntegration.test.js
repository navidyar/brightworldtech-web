'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getCuratedProcessorCodes } = require('./modelProcessorCoverage');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseSeedModels() {
  const files = [
    'sql/2026-06-step-7e1a-unit-model-catalog.sql',
    'sql/2026-06-step-7e1c-processor-compatibility-catalog.sql'
  ];
  const models = [];
  const categories = new Set(['laptop', 'desktop', 'chrome', 'tablet', 'all_in_one', 'server', 'mobile', 'other']);
  const tuple = /\('([^']*)',\s*'([^']*)',\s*'((?:''|[^'])*)',\s*(\d+)\)/g;

  for (const relativePath of files) {
    const source = read(relativePath);
    let match;
    while ((match = tuple.exec(source))) {
      if (!categories.has(match[2])) continue;
      models.push({
        manufacturerName: match[1],
        categoryCode: match[2],
        modelName: match[3].replace(/''/g, "'")
      });
    }
  }

  return [...new Map(models.map((model) => [
    `${model.manufacturerName}|${model.categoryCode}|${model.modelName}`,
    model
  ])).values()];
}

function parseExistingCompatibilityRules() {
  const source = read('sql/2026-06-step-7e1c-processor-compatibility-catalog.sql');
  const start = source.indexOf('INSERT INTO tmp_processor_compatibility_seed');
  assert.notEqual(start, -1);
  const rules = [];
  const tuple = /\('([^']*)',\s*'((?:''|[^'])*)',\s*'((?:''|[^'])*)'\)/g;
  let match;
  while ((match = tuple.exec(source.slice(start)))) {
    rules.push({
      manufacturerName: match[1],
      modelPattern: match[2].replace(/''/g, "'"),
      processorCode: match[3].replace(/''/g, "'")
    });
  }
  return rules;
}

function sqlLike(value, pattern) {
  const regex = `^${[...pattern].map((character) => {
    if (character === '%') return '.*';
    if (character === '_') return '.';
    return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('')}$`;
  return new RegExp(regex, 'i').test(value);
}

test('every seeded Unit Model has existing or Stage 10W.7 processor coverage', () => {
  const models = parseSeedModels();
  const existingRules = parseExistingCompatibilityRules();
  const uncovered = [];

  for (const model of models) {
    const hasExistingCoverage = existingRules.some((rule) => (
      rule.manufacturerName.toLowerCase() === model.manufacturerName.toLowerCase()
      && sqlLike(model.modelName, rule.modelPattern)
    ));
    const curated = getCuratedProcessorCodes(model);
    if (!hasExistingCoverage && curated.length === 0) uncovered.push(model);
  }

  assert.equal(models.length, 741);
  assert.deepEqual(uncovered, []);
});

test('backfill script is dry-run by default and preserves inactive catalog decisions', () => {
  const script = read('scripts/backfillModelProcessorCoverage.js');
  const planner = read('services/modelProcessorCoveragePlanner.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
  assert.match(script, /refusing to reactivate it automatically/);
  assert.match(planner, /source: 'historical'/);
  assert.match(planner, /source: 'curated'/);
  assert.match(script, /await connection\.beginTransaction\(\)/);
  assert.match(script, /await connection\.rollback\(\)/);
  assert.match(script, /\['units', 'unit_id'\]/);
  assert.match(script, /pb\.is_active AS brand_is_active/);
  assert.match(script, /autoAssignProcessorFamilyMembershipWithConnection/);
});

test('package exposes separate audit, apply, and validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['audit:model-processor-coverage'], 'node scripts/backfillModelProcessorCoverage.js');
  assert.equal(packageJson.scripts['backfill:model-processor-coverage'], 'node scripts/backfillModelProcessorCoverage.js --apply');
  assert.match(packageJson.scripts['validate:model-processor-coverage'], /modelProcessorCoverage\.test\.js/);
  assert.match(packageJson.scripts['validate:model-processor-coverage'], /stage10w7ModelProcessorCoverageIntegration\.test\.js/);
});
