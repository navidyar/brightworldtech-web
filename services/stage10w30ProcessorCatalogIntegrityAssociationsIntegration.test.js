'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('canonical processor identity normalizes verbose duplicate names without collapsing distinct processor suffixes', () => {
  const dbPath = require.resolve('../models/db');
  const familyPath = require.resolve('../models/processorFamilyModel');
  const modelPath = require.resolve('../models/processorCatalogModel');
  const priorDb = require.cache[dbPath];
  const priorFamily = require.cache[familyPath];
  const priorModel = require.cache[modelPath];

  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: {} } };
    require.cache[familyPath] = { id: familyPath, filename: familyPath, loaded: true, exports: {} };
    delete require.cache[modelPath];
    const model = require('../models/processorCatalogModel');

    assert.equal(
      model.normalizeProcessorIdentity('Intel Core i5-9500T @ 2.20 GHz', 'Intel'),
      model.normalizeProcessorIdentity('i5-9500T', 'Intel')
    );
    assert.notEqual(
      model.normalizeProcessorIdentity('i5-9500', 'Intel'),
      model.normalizeProcessorIdentity('i5-9500T', 'Intel')
    );
    assert.notEqual(
      model.normalizeProcessorIdentity('i5-9500T', 'Intel'),
      model.normalizeProcessorIdentity('i5-9500TE', 'Intel')
    );
    assert.equal(model.getCanonicalProcessorNameErrors({ brandName: 'Intel', modelCode: 'i5-9500T' }).length, 0);
    assert.ok(model.getCanonicalProcessorNameErrors({ brandName: 'Intel', modelCode: 'Intel Core i5-9500T @ 2.20 GHz' }).length >= 2);
  } finally {
    if (priorDb) require.cache[dbPath] = priorDb; else delete require.cache[dbPath];
    if (priorFamily) require.cache[familyPath] = priorFamily; else delete require.cache[familyPath];
    if (priorModel) require.cache[modelPath] = priorModel; else delete require.cache[modelPath];
  }
});



test('merge runtime reassigns Units to the canonical ID before deleting the duplicate record', async () => {
  const dbPath = require.resolve('../models/db');
  const familyPath = require.resolve('../models/processorFamilyModel');
  const modelPath = require.resolve('../models/processorCatalogModel');
  const priorDb = require.cache[dbPath];
  const priorFamily = require.cache[familyPath];
  const priorModel = require.cache[modelPath];
  const calls = [];

  const connection = {
    async beginTransaction() { calls.push(['BEGIN']); },
    async commit() { calls.push(['COMMIT']); },
    async rollback() { calls.push(['ROLLBACK']); },
    release() { calls.push(['RELEASE']); },
    async query(sql, params = []) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();
      calls.push([compact, [...params]]);
      if (compact.includes('FROM processor_models pm') && compact.includes('WHERE pm.processor_model_id IN')) {
        return [[
          { processor_model_id: 87, processor_brand_id: 1, model_code: 'Intel Core i5-9500T @ 2.20 GHz', is_active: 1, brand_name: 'Intel' },
          { processor_model_id: 41, processor_brand_id: 1, model_code: 'i5-9500T', is_active: 1, brand_name: 'Intel' }
        ]];
      }
      if (compact.includes('FROM information_schema.COLUMNS')) return [[{ column_name: 'processor_model_id' }]];
      if (compact.startsWith('UPDATE units SET processor_model_id')) return [{ affectedRows: 2 }];
      if (compact.startsWith('SELECT unit_model_id, MAX(is_active)')) return [[{ unit_model_id: 501, is_active: 1 }]];
      if (compact.startsWith('INSERT INTO unit_model_processor_options')) return [{ affectedRows: 1 }];
      if (compact.startsWith('DELETE FROM unit_model_processor_options')) return [{ affectedRows: 1 }];
      if (compact.startsWith('SELECT processor_family_id, assignment_source')) return [[{ processor_family_id: 9, assignment_source: 'manual', created_by_user_id: 3 }]];
      if (compact.startsWith('INSERT IGNORE INTO processor_family_members')) return [{ affectedRows: 1 }];
      if (compact.startsWith('DELETE FROM processor_family_members')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE processor_families')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE unit_processor_catalog_requests')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE lot_requirements')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE processor_models SET is_active = 1')) return [{ affectedRows: 1 }];
      if (compact.startsWith('DELETE FROM processor_models')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query in merge runtime test: ${compact}`);
    }
  };

  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { getConnection: async () => connection } } };
    require.cache[familyPath] = { id: familyPath, filename: familyPath, loaded: true, exports: {} };
    delete require.cache[modelPath];
    const model = require('../models/processorCatalogModel');
    const result = await model.mergeProcessorModels({ sourceProcessorModelId: 87, targetProcessorModelId: 41, currentUserId: 7 });

    assert.equal(result.merged, true);
    assert.equal(result.affected.units, 2);
    const unitUpdate = calls.find(([sql]) => String(sql).startsWith('UPDATE units SET processor_model_id'));
    assert.deepEqual(unitUpdate?.[1], [41, 87]);
    const sourceDelete = calls.find(([sql]) => String(sql).startsWith('DELETE FROM processor_models'));
    assert.deepEqual(sourceDelete?.[1], [87]);
    assert.ok(calls.find(([sql]) => sql === 'COMMIT'));
    assert.equal(calls.some(([sql]) => sql === 'ROLLBACK'), false);
  } finally {
    if (priorDb) require.cache[dbPath] = priorDb; else delete require.cache[dbPath];
    if (priorFamily) require.cache[familyPath] = priorFamily; else delete require.cache[familyPath];
    if (priorModel) require.cache[modelPath] = priorModel; else delete require.cache[modelPath];
  }
});

test('Admin-only duplicate resolution is directional, transfers all live references, and permanently removes the duplicate', () => {
  const routes = read('routes/config.js');
  const model = read('models/processorCatalogModel.js');
  const page = read('views/pages/management-processors.ejs');
  const modal = read('views/fragments/processor-catalog-merge-modal.ejs');

  assert.match(routes, /processors\/:processorModelId\/merge\/modal'[\s\S]*?requireRole\(configRoles\)/);
  assert.match(routes, /processors\/:processorModelId\/merge'[\s\S]*?requireRole\(configRoles\)/);
  assert.match(page, /<% if \(isAdmin\) \{ %>[\s\S]*?Resolve Duplicate/);
  assert.match(model, /UPDATE units SET processor_model_id = \? WHERE processor_model_id = \?/);
  assert.match(model, /UPDATE unit_processor_catalog_requests SET approved_processor_model_id = \?, approved_processor_brand_id = \? WHERE approved_processor_model_id = \?/);
  assert.match(model, /UPDATE lot_requirements SET processor_model_id = \? WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM unit_model_processor_options WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_family_members WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_models WHERE processor_model_id = \? LIMIT 1/);
  assert.match(modal, /Duplicate being removed/);
  assert.match(modal, /Canonical Processor that remains/);
  assert.match(modal, /Merge #<%= processor\.id %> INTO Canonical Processor/);
  assert.match(modal, /permanently deleted/i);
});

test('Admin can maintain exact Processor-to-Model and Model-to-Processor associations from either catalog', () => {
  const routes = read('routes/config.js');
  const processorModel = read('models/processorCatalogModel.js');
  const unitModel = read('models/unitModelCatalogModel.js');
  const processorPage = read('views/pages/management-processors.ejs');
  const modelPage = read('views/pages/management-unit-models.ejs');
  const processorModelsModal = read('views/fragments/processor-catalog-models-modal.ejs');
  const modelProcessorsModal = read('views/fragments/unit-model-processors-modal.ejs');

  assert.match(routes, /processors\/:processorModelId\/models\/modal'[\s\S]*?requireRole\(configRoles\)/);
  assert.match(routes, /models\/:unitModelId\/processors\/modal'[\s\S]*?requireRole\(configRoles\)/);
  assert.match(processorModel, /async function replaceProcessorUnitModelAssociations/);
  assert.match(processorModel, /INSERT INTO unit_model_processor_options \(unit_model_id, processor_model_id, is_active\)[\s\S]*?ON DUPLICATE KEY UPDATE is_active = 1/);
  assert.match(unitModel, /async function replaceUnitModelProcessorAssociations/);
  assert.match(unitModel, /INSERT INTO unit_model_processor_options \(unit_model_id, processor_model_id, is_active\)[\s\S]*?ON DUPLICATE KEY UPDATE is_active = 1/);
  assert.match(processorPage, />Models<\/a>/);
  assert.match(modelPage, />Processors<\/a>/);
  assert.match(processorModelsModal, /Unit Models for Processor/);
  assert.match(processorModelsModal, /data-association-filter="manufacturer"/);
  assert.match(processorModelsModal, /data-association-filter="category"/);
  assert.match(modelProcessorsModal, /Processors for Unit Model/);
  assert.match(modelProcessorsModal, /data-association-filter="brand"/);
});

test('processor request approval reuses global processors, blocks strong duplicates, and requires Admin naming confirmation for Management-created processors', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const page = read('views/pages/unit-request-detail.ejs');
  const script = read('public/js/processor-request-review.js');

  assert.match(controller, /processorCatalogModel\.findLikelyProcessorMatches/);
  assert.match(controller, /confirmedProcessorNamingWithAdmin: req\.body\.confirmedProcessorNamingWithAdmin/);
  assert.match(controller, /reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);
  assert.match(model, /safeExistingProcessorModelId/);
  assert.match(model, /BWT_CATALOG_PROCESSOR_DUPLICATE/);
  assert.match(model, /BWT_CATALOG_PROCESSOR_ADMIN_CONFIRMATION_REQUIRED/);
  assert.match(model, /BWT_CATALOG_PROCESSOR_CANONICAL_FORMAT/);
  assert.match(model, /INSERT INTO unit_model_processor_options[\s\S]*?ON DUPLICATE KEY UPDATE is_active = 1/);
  assert.match(page, /Reuse an Existing Processor whenever possible/);
  assert.match(page, /Searches the entire Processor Catalog, not only processors already associated with this Unit Model/);
  assert.match(page, /Before creating a new Processor Catalog entry, confirm the proposed Processor name and metadata with an Admin/);
  assert.match(page, /name="confirmedProcessorNamingWithAdmin"/);
  assert.match(script, /Associate Existing Processor/);
  assert.match(script, /Create and Associate Processor/);
  assert.match(script, /strongDuplicate/);
  assert.match(script, /formatInvalid/);
});

test('technician missing-processor request identifies a global processor as an association request instead of encouraging a duplicate', () => {
  const controller = read('controllers/catalogRequestController.js');
  const modal = read('views/fragments/tech-unit-catalog-request-modal.ejs');

  assert.match(controller, /processorCatalogModel\.findLikelyProcessorMatches/);
  assert.match(controller, /already associated with this Unit Model/);
  assert.match(controller, /existingGlobalMatch/);
  assert.match(modal, /Request Processor Association/);
  assert.match(modal, /already exists in the global Processor Catalog/i);
  assert.match(modal, /Send Association Request/);
  assert.match(modal, /reuse the existing Processor record/i);
});

test('Management processor approval fields use an aligned two-column grid with paired label and control rows', () => {
  const page = read('views/pages/unit-request-detail.ejs');
  const css = read('public/css/unit-requests.css');

  assert.match(page, /class="processor-request-approval-grid"/);
  for (const label of ['Processor Type', 'Canonical Processor Type Name', 'Canonical Processor', 'Processor Family', 'Generation', 'Base Speed GHz']) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /\.processor-request-approval-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.processor-request-approval-grid \.form-field\s*\{[\s\S]*?grid-template-rows:\s*minmax\(28px, auto\) 39px/);
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*?\.processor-request-approval-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test('Stage 10W30 browser scripts have valid JavaScript syntax', () => {
  for (const file of [
    'public/js/processor-request-review.js',
    'public/js/processor-catalog-actions.js',
    'public/js/catalog-association-filter.js'
  ]) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
  }
});

test('modified EJS templates keep balanced EJS delimiters', () => {
  for (const file of [
    'views/pages/management-processors.ejs',
    'views/pages/processor-families.ejs',
    'views/pages/management-unit-models.ejs',
    'views/pages/unit-request-detail.ejs',
    'views/fragments/processor-catalog-models-modal.ejs',
    'views/fragments/unit-model-processors-modal.ejs',
    'views/fragments/processor-catalog-merge-modal.ejs',
    'views/fragments/tech-unit-catalog-request-modal.ejs'
  ]) {
    const source = read(file);
    assert.equal((source.match(/<%/g) || []).length, (source.match(/%>/g) || []).length, `${file} has unbalanced EJS delimiters`);
  }
});
