'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const processorCatalogModelPath = require.resolve('../models/processorCatalogModel');
const operationalRankingPath = require.resolve('../models/operationalOptionRankingModel');
const controllerPath = require.resolve('../controllers/processorCatalogController');

const processor = {
  id: 101,
  processorBrandId: 1,
  modelCode: 'i5-9500T',
  legacyFamily: 'Core',
  generation: '9th Gen',
  baseSpeedGhz: 2.2,
  isActive: true
};

const fakeModel = {
  MAX_PROCESSOR_MODEL_LENGTH: 160,
  MAX_PROCESSOR_FAMILY_LENGTH: 120,
  MAX_PROCESSOR_GENERATION_LENGTH: 80,
  normalizePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  },
  getCatalogFilters(input = {}) { return input; },
  getProcessorById: async () => processor,
  listProcessorBrands: async () => [{ id: 1, name: 'Intel' }],
  listProcessorFamilyMembershipOptions: async () => ({ processor, families: [] }),
  getProcessorDeletionDetails: async () => ({ ...processor, unitCount: 0, lotRequirementCount: 0 }),
  listMergeTargets: async () => [{ id: 102, label: 'i5-9500' }]
};

require.cache[processorCatalogModelPath] = {
  id: processorCatalogModelPath,
  filename: processorCatalogModelPath,
  loaded: true,
  exports: fakeModel
};
require.cache[operationalRankingPath] = {
  id: operationalRankingPath,
  filename: operationalRankingPath,
  loaded: true,
  exports: { invalidateRankingSnapshot() {} }
};
delete require.cache[controllerPath];
const controller = require(controllerPath);

function makeReq({ processorModelId = 101, query = {} } = {}) {
  return {
    params: { processorModelId: String(processorModelId) },
    query,
    // GET modal requests do not have a parsed request body.
    body: undefined,
    get() { return ''; }
  };
}

function makeRes() {
  const calls = [];
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    render(view, data) { calls.push({ view, data }); return { view, data }; },
    redirect(url) { calls.push({ redirect: url }); return url; },
    set() { return this; },
    send() { return this; }
  };
  return { res, calls };
}

function nextThatThrows(error) {
  if (error) throw error;
}

test('processor modal GET actions tolerate an undefined req.body', async () => {
  const actions = [
    [controller.renderEditProcessorModal, 'fragments/processor-catalog-edit-modal'],
    [controller.renderProcessorFamiliesModal, 'fragments/processor-catalog-families-modal'],
    [controller.renderMergeProcessorModal, 'fragments/processor-catalog-merge-modal'],
    [controller.renderDeleteProcessorModal, 'fragments/processor-catalog-delete-modal']
  ];

  for (const [action, expectedView] of actions) {
    const req = makeReq();
    const { res, calls } = makeRes();
    await action(req, res, nextThatThrows);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].view, expectedView);
    assert.equal(calls[0].data.returnTo, 'processor-catalog');
  }
});

test('processor modal GET actions still honor returnTo from the query string without req.body', async () => {
  const req = makeReq({ query: { returnTo: 'processor-families' } });
  const { res, calls } = makeRes();
  await controller.renderEditProcessorModal(req, res, nextThatThrows);
  assert.equal(calls[0].data.returnTo, 'processor-families');
});
