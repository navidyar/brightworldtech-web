'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Processor Catalog is a dedicated configuration surface available to Admin and Management', () => {
  const routes = read('routes/config.js');
  const nav = read('views/partials/configuration-nav.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  const page = read('views/pages/management-processors.ejs');

  assert.match(routes, /const processorCatalogRoles = \['admin', 'management'\]/);
  assert.match(routes, /\/management\/config\/processors'[\s\S]*?requireRole\(processorCatalogRoles\)/);
  assert.match(nav, /label: 'Processor Catalog'/);
  assert.match(nav, /allowed: isAdminConfigurationUser \|\| isManagementConfigurationUser/);
  assert.match(nav, /configurationItems\.filter\(\(item\) => item\.allowed\)/);
  assert.match(sidebar, /!canAccessMenuArea\('admin'\)[\s\S]*?\/management\/config\/processors/);
  assert.match(page, /<h1>Processor Catalog<\/h1>/);
  assert.match(page, /name="processorBrandId"/);
  assert.match(page, /name="needsReview"/);
  assert.match(page, /name="includeInactive"/);
  assert.match(page, /Models<\/th>[\s\S]*Units<\/th>[\s\S]*Requests<\/th>/);
  assert.match(page, />Edit<\/a>/);
  assert.match(page, /Resolve Duplicate<\/a>/);
});

test('Processors Needing Review exposes Edit and Admin duplicate-repair actions instead of a read-only warning table', () => {
  const page = read('views/pages/processor-families.ejs');

  assert.match(page, /Processors Needing Review/);
  assert.match(page, /\/management\/config\/processors\/<%= processor\.id %>\/edit\/modal\?returnTo=processor-families/);
  assert.match(page, /\/management\/config\/processors\/<%= processor\.id %>\/merge\/modal\?returnTo=processor-families/);
  assert.match(page, /<th>Actions<\/th>/);
});

test('processor editing keeps canonical metadata separate and prevents rename-to-duplicate mistakes', () => {
  const modal = read('views/fragments/processor-catalog-edit-modal.ejs');
  const model = read('models/processorCatalogModel.js');

  assert.match(modal, /name="modelCode"/);
  assert.match(modal, /name="legacyFamily"/);
  assert.match(modal, /name="generation"/);
  assert.match(modal, /name="baseSpeedGhz"/);
  assert.match(modal, /name="isActive"/);
  assert.match(modal, /i5-9500T/);
  assert.match(model, /LOWER\(TRIM\(model_code\)\) = LOWER\(TRIM\(\?\)\)/);
  assert.match(model, /Resolve Duplicate/);
  assert.match(model, /autoAssignProcessorFamilyMembershipWithConnection/);
});

test('processor merge transfers live references, collapses duplicate relationships, and permanently deletes the source', () => {
  const model = read('models/processorCatalogModel.js');
  const modal = read('views/fragments/processor-catalog-merge-modal.ejs');

  assert.match(model, /UPDATE units SET processor_model_id = \? WHERE processor_model_id = \?/);
  assert.match(model, /INSERT INTO unit_model_processor_options[\s\S]*ON DUPLICATE KEY UPDATE is_active = GREATEST/);
  assert.match(model, /DELETE FROM unit_model_processor_options WHERE processor_model_id = \?/);
  assert.match(model, /INSERT IGNORE INTO processor_family_members/);
  assert.match(model, /DELETE FROM processor_family_members WHERE processor_model_id = \?/);
  assert.match(model, /UPDATE unit_processor_catalog_requests SET approved_processor_model_id = \?, approved_processor_brand_id = \? WHERE approved_processor_model_id = \?/);
  assert.match(model, /UPDATE lot_requirements SET processor_model_id = \? WHERE processor_model_id = \?/);
  assert.match(model, /UPDATE processor_models SET is_active = 1 WHERE processor_model_id = \?/);
  assert.match(model, /DELETE FROM processor_models WHERE processor_model_id = \? LIMIT 1/);
  assert.match(model, /Processors can only be merged within the same Processor Type/);
  assert.match(modal, /permanently deleted/i);
});

test('Processor request review can reuse an existing canonical processor and warns about likely duplicates', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');
  const page = read('views/pages/unit-request-detail.ejs');
  const script = read('public/js/processor-request-review.js');

  assert.match(controller, /processorCatalogModel\.findLikelyProcessorMatches/);
  assert.match(controller, /approvedExistingProcessorModelId: req\.body\.approvedExistingProcessorModelId/);
  assert.match(page, /Existing Canonical Processor/);
  assert.match(page, /name="approvedExistingProcessorModelId"/);
  assert.match(page, /data-processor-similarity-warning/);
  assert.match(page, /Open Processor Catalog/);
  assert.match(model, /safeExistingProcessorModelId/);
  assert.match(model, /Existing processor mapped/);
  assert.match(model, /reusedExistingProcessor: Boolean\(safeExistingProcessorModelId\)/);
  assert.match(script, /normalizeProcessorIdentity/);
  assert.match(script, /candidateIdentity === normalizedInput/);
  assert.match(script, /field\.disabled = reusingExisting/);
});
