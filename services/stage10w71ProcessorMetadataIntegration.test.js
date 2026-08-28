'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getCuratedProcessorCodes, inferProcessorDefinition } = require('./modelProcessorCoverage');
const { listProcessorMetadata } = require('./processorMetadataCatalog');
const { classifyProcessorFamilyCodes } = require('./processorFamilyClassifier');
const { listProcessorCoverageFamilyDefinitions } = require('./processorCoverageFamilyCatalog');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseExistingFamilyCodes() {
  const source = read('sql/2026-07-stage-7e-processor-family-requirements.sql');
  return new Set([...source.matchAll(/\('(?:intel|amd|apple|qualcomm|mediatek|rockchip)',\s*'([^']+)'/g)]
    .map((match) => match[1]));
}

function parseSeedModels() {
  const files = [
    'sql/2026-06-step-7e1a-unit-model-catalog.sql',
    'sql/2026-06-step-7e1c-processor-compatibility-catalog.sql'
  ];
  const categories = new Set(['laptop', 'desktop', 'chrome', 'tablet', 'all_in_one', 'server', 'mobile', 'other']);
  const tuple = /\('([^']*)',\s*'([^']*)',\s*'((?:''|[^'])*)',\s*(\d+)\)/g;
  const models = [];

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

test('every processor used by all 741 Stage 10W.7 model rules has supporting metadata', () => {
  const models = parseSeedModels();
  const processorCodes = [...new Set(models.flatMap((model) => getCuratedProcessorCodes(model)))];
  const metadataByCode = new Map(listProcessorMetadata().map((entry) => [entry.modelCode, entry]));
  const missing = processorCodes.filter((modelCode) => !metadataByCode.has(modelCode));

  assert.equal(models.length, 741);
  assert.equal(processorCodes.length, 160);
  assert.deepEqual(missing, []);

  for (const modelCode of processorCodes) {
    const definition = inferProcessorDefinition(modelCode);
    assert.ok(definition.processorFamily, `${modelCode} is missing processor family metadata`);
    assert.ok(definition.generation, `${modelCode} is missing generation metadata`);
  }
});

test('all classified catalog processors resolve to an existing or repair-created Processor Family definition', () => {
  const availableCodes = parseExistingFamilyCodes();
  listProcessorCoverageFamilyDefinitions().forEach((definition) => availableCodes.add(definition.code));
  const unresolved = [];

  for (const entry of listProcessorMetadata()) {
    const familyCodes = classifyProcessorFamilyCodes(entry);
    for (const familyCode of familyCodes) {
      if (!availableCodes.has(familyCode)) unresolved.push(`${entry.modelCode}:${familyCode}`);
    }
  }

  assert.deepEqual(unresolved, []);
});

test('every repair-created Processor Family has a valid export short form', () => {
  for (const definition of listProcessorCoverageFamilyDefinitions()) {
    assert.ok(definition.exportShortForm, `${definition.code} is missing an export short form`);
    assert.ok(definition.exportShortForm.length <= 40, `${definition.code} export short form exceeds 40 characters`);
  }
});

test('metadata repair covers representative Intel, AMD, Xeon, Pentium, and Microsoft SQ processors', () => {
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i3-4130' }), ['intel-i3-4th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i7-14700T' }), ['intel-i7-14th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'i9-12900H' }), ['intel-i9-12th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Core m3-8100Y' }), ['intel-core-m3-8th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Xeon E-2276M' }), ['intel-xeon-mobile-9th-gen']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Pentium Gold 6500Y' }), ['intel-pentium-gold']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'AMD', modelCode: 'Ryzen 9 8945HS' }), ['amd-ryzen-9-8000-series']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'AMD', modelCode: 'Ryzen 5 PRO 5650GE' }), ['amd-ryzen-5-5000-series']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Qualcomm', modelCode: 'Microsoft SQ3' }), ['qualcomm-microsoft-sq']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'Intel', modelCode: 'Intel Processor N200' }), ['intel-processor-n-series']);
  assert.deepEqual(classifyProcessorFamilyCodes({ brandName: 'AMD', modelCode: 'AMD PRO A10-8700B' }), ['amd-pro-a10-6th-gen']);
  const metadataByCode = new Map(listProcessorMetadata().map((entry) => [entry.modelCode, entry]));
  assert.equal(metadataByCode.get('Ryzen 5 PRO 5650U').baseSpeedGhz, 2.3);
  assert.equal(metadataByCode.get('i9-9900').baseSpeedGhz, 3.1);
});

test('backfill is dry-run by default, transactional, and blank-only', () => {
  const script = read('scripts/backfillProcessorCatalogMetadata.js');

  assert.match(script, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(script, /No database changes were made\. Re-run with --apply/);
  assert.match(script, /await connection\.beginTransaction\(\)/);
  assert.match(script, /await connection\.rollback\(\)/);
  assert.match(script, /processor_family IS NULL OR TRIM\(processor_family\) = ''/);
  assert.match(script, /generation IS NULL OR TRIM\(generation\) = ''/);
  assert.match(script, /base_speed_ghz = COALESCE\(base_speed_ghz, \?\)/);
  assert.match(script, /INSERT IGNORE INTO processor_family_members/);
  assert.match(script, /\['processor_families', 'export_short_form'\]/);
  assert.match(script, /definition\.exportShortForm/);
});

test('package exposes separate metadata audit, apply, and validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:processor-metadata'], 'node scripts/backfillProcessorCatalogMetadata.js');
  assert.equal(packageJson.scripts['backfill:processor-metadata'], 'node scripts/backfillProcessorCatalogMetadata.js --apply');
  assert.match(packageJson.scripts['validate:processor-metadata'], /processorMetadataBackfillPlanner\.test\.js/);
  assert.match(packageJson.scripts['validate:processor-metadata'], /stage10w71ProcessorMetadataIntegration\.test\.js/);
});
