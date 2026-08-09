'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Stage 7E seeds reusable families and conservatively classifies existing processors', () => {
  const migration = read('sql/2026-07-stage-7e-processor-family-requirements.sql');
  const classifier = read('services/processorFamilyClassifier.js');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS processor_families/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS processor_family_members/);
  assert.match(migration, /'intel-i5-12th-gen', 'Intel i5-12th Gen'/);
  assert.match(migration, /'amd-ryzen-5-7000-series'/);
  assert.match(migration, /active_processors_needing_review/);
  assert.match(classifier, /classifyProcessorFamilyCodes/);
  assert.match(classifier, /return \[\]/);
});

test('Processor Families are Admin-managed configuration and selectable from Lot requirements', () => {
  const configRoutes = read('routes/config.js');
  const lotRoutes = read('routes/lots.js');
  const familyPage = read('views/pages/processor-families.ejs');
  const familyModal = read('views/fragments/processor-family-form-modal.ejs');
  const lotModal = read('views/fragments/lot-requirements-modal.ejs');
  const registry = read('config/lotRequirementRegistry.js');

  assert.match(configRoutes, /\/management\/config\/processor-families/);
  assert.match(configRoutes, /const configRoles = \['admin'\]/);
  assert.doesNotMatch(lotRoutes, /processor-families/);
  assert.match(familyPage, /Family Catalog/);
  assert.match(familyPage, /Processors Needing Review/);
  assert.match(familyModal, /Included Processors/);
  assert.match(familyModal, /name="memberProcessorModelIds"|processor-family-member-options/);
  assert.doesNotMatch(lotModal, /Manage Processor Families/);
  assert.match(registry, /catalogField\('processor_family', 'Processor Family'/);
});

test('future approved Processor Catalog values receive safe automatic family membership', () => {
  const requestModel = read('models/unitRequestModel.js');
  const familyModel = read('models/processorFamilyModel.js');

  assert.match(requestModel, /autoAssignProcessorFamilyMembershipWithConnection/);
  assert.match(requestModel, /assignedProcessorFamilies/);
  assert.match(familyModel, /classifyProcessorFamilyCodes/);
  assert.match(familyModel, /INSERT IGNORE INTO processor_family_members/);
  assert.match(familyModel, /membership_version = membership_version \+ 1/);
  assert.match(familyModel, /listUnmappedProcessorModels/);
});

test('Processor and Processor Family requirements are evaluated as alternatives', () => {
  const evaluator = read('services/lotRequirementEvaluator.js');

  assert.match(evaluator, /\['processor', 'processor_family'\]\.includes/);
  assert.match(evaluator, /\? 'processor_match'/);
  assert.match(evaluator, /Processor or Processor Family/);
});


test('family membership versions change only when processor membership changes', () => {
  const familyModel = read('models/processorFamilyModel.js');
  const signature = read('services/lotValidationOverridePolicy.js');

  assert.match(familyModel, /const membershipChanged =/);
  assert.match(familyModel, /membership_version = membership_version \+ \?/);
  assert.match(familyModel, /if \(membershipChanged\) \{[\s\S]*replaceFamilyMembers/);
  assert.match(signature, /processorFamilyMembershipVersion/);
});

test('Processor Family classification seed uses an explicit compatible collation', () => {
  const migration = read('sql/2026-07-stage-7e-processor-family-requirements.sql');

  assert.match(
    migration,
    /tmp_stage7e_processor_family_classification[\s\S]*ENGINE=Memory DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/
  );
  assert.match(
    migration,
    /pf\.code COLLATE utf8mb4_unicode_ci =[\s\S]*classification\.family_code COLLATE utf8mb4_unicode_ci/
  );
});

test('Lot Details reads Processor Family labels without cross-collation name comparisons', () => {
  const lotModel = read('models/lotModel.js');

  assert.match(lotModel, /NULLIF\(processor_family\.name, ''\)/);
  assert.doesNotMatch(lotModel, /LOWER\(processor_family\.name\)[\s\S]*processor_family_brand\.name/);
});
