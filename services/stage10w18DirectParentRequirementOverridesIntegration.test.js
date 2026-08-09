'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('effective Requirement resolution is direct-parent only and child rules shadow the same parent field', () => {
  const lotModel = read('models/lotModel.js');
  const inheritance = read('services/lotRequirementInheritance.js');

  assert.match(lotModel, /const parentLotId = Number\(selectedLot\.parent_lot_id\)/);
  assert.doesNotMatch(lotModel, /getLotLineage\(normalizedLotId\)/);
  assert.match(inheritance, /selectedFieldKeys\.has\(fieldKey\)/);
  assert.match(inheritance, /inheritanceDepth, 1|normalizedSelectedLotId, 1/);
  assert.match(inheritance, /Grandparent requirements do[\s\S]*?not flow/);
});

test('inherited Requirement fields can be copied to the child and then edited independently', () => {
  const lotModel = read('models/lotModel.js');
  const controller = read('controllers/lotController.js');
  const routes = read('routes/lots.js');
  const modal = read('views/fragments/lot-requirements-modal.ejs');

  assert.match(lotModel, /async function customizeInheritedRequirementField\(/);
  assert.match(lotModel, /INSERT INTO lot_requirements/);
  assert.match(lotModel, /requirement_type_config_value_id = \?/);
  assert.match(controller, /async function customizeInheritedLotRequirementField\(/);
  assert.match(routes, /requirements\/:requirementId\/customize/);
  assert.match(modal, />Customize</);
  assert.match(modal, /Delete every direct rule for that field to inherit it again/);
});

test('Add/Edit Unit enforcement consumes effective inherited Requirements rather than direct-only rows', async (t) => {
  const lotModelPath = require.resolve('../models/lotModel');
  const overrideModelPath = require.resolve('../models/lotValidationOverrideModel');
  const techRequirementModelPath = require.resolve('../models/techLotRequirementModel');
  const previousLotModelCache = require.cache[lotModelPath];
  const previousOverrideModelCache = require.cache[overrideModelPath];
  const previousTechRequirementCache = require.cache[techRequirementModelPath];
  let directListCalled = false;
  let effectiveListCalled = false;
  const fakeLotModel = {
    getLotById: async () => ({
      lot_id: 20,
      lot_name: 'Child Lot',
      requirement_policy_code: 'strict',
      requirement_policy_label: 'Strict'
    }),
    listLotRequirements: async () => {
      directListCalled = true;
      return [];
    },
    listEffectiveLotRequirements: async () => {
      effectiveListCalled = true;
      return [{
        lot_requirement_id: 41,
        requirement_key: 'manufacturer',
        requirement_label: 'Manufacturer',
        operator_code: 'equals',
        operator_label: 'Must Equal',
        manufacturer_id: 99,
        required_value: 'HP',
        is_active: 1,
        is_inherited: 1,
        source_lot_id: 10,
        source_lot_name: 'Parent Lot'
      }];
    }
  };

  require.cache[lotModelPath] = {
    id: lotModelPath,
    filename: lotModelPath,
    loaded: true,
    exports: fakeLotModel
  };
  require.cache[overrideModelPath] = {
    id: overrideModelPath,
    filename: overrideModelPath,
    loaded: true,
    exports: {}
  };
  delete require.cache[techRequirementModelPath];

  t.after(() => {
    if (previousLotModelCache) require.cache[lotModelPath] = previousLotModelCache;
    else delete require.cache[lotModelPath];
    if (previousOverrideModelCache) require.cache[overrideModelPath] = previousOverrideModelCache;
    else delete require.cache[overrideModelPath];
    if (previousTechRequirementCache) require.cache[techRequirementModelPath] = previousTechRequirementCache;
    else delete require.cache[techRequirementModelPath];
  });

  const techLotRequirementModel = require('../models/techLotRequirementModel');
  const workflow = await techLotRequirementModel.buildWorkflowForForm({
    lotId: 20,
    formData: { lotId: '20', manufacturerId: '2', memoryModules: [], storageDevices: [] },
    formOptions: { manufacturers: [{ id: 2, label: 'Dell' }], processorModels: [], ramTypes: [], storageTypes: [] }
  });

  assert.equal(effectiveListCalled, true);
  assert.equal(directListCalled, false);
  assert.equal(workflow.requirementCount, 1);
  assert.equal(workflow.saveAllowed, false);
  assert.equal(workflow.status, 'rejected');
  assert.deepEqual(workflow.blockingFieldKeys, ['manufacturer']);
});
