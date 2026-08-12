'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const catalogRequestAccessPolicy = require('./catalogRequestAccessPolicy');

const unitModelCatalogModel = {};
const unitRequestModel = {};
const processorCatalogModel = {
  findLikelyProcessorMatches: async () => []
};
const unitModelCatalogModelPath = require.resolve('../models/unitModelCatalogModel');
const unitRequestModelPath = require.resolve('../models/unitRequestModel');
const processorCatalogModelPath = require.resolve('../models/processorCatalogModel');
require.cache[unitModelCatalogModelPath] = {
  id: unitModelCatalogModelPath,
  filename: unitModelCatalogModelPath,
  loaded: true,
  exports: unitModelCatalogModel
};
require.cache[unitRequestModelPath] = {
  id: unitRequestModelPath,
  filename: unitRequestModelPath,
  loaded: true,
  exports: unitRequestModel
};
require.cache[processorCatalogModelPath] = {
  id: processorCatalogModelPath,
  filename: processorCatalogModelPath,
  loaded: true,
  exports: processorCatalogModel
};
const catalogRequestController = require('../controllers/catalogRequestController');

const ADD_EDIT_ROLE_CODES = ['admin', 'management', 'tech_lead', 'tech'];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function makeResponse() {
  return {
    statusCode: 200,
    renderedView: '',
    renderedData: null,
    redirectedTo: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.renderedView = view;
      this.renderedData = data;
      return this;
    },
    redirect(location) {
      this.redirectedTo = location;
      return this;
    }
  };
}

function makeRequest(roleCode, { query = {}, body = {}, htmx = true } = {}) {
  return {
    currentUser: { user_id: 91, roles: [roleCode] },
    query,
    body,
    get(name) {
      return name === 'HX-Request' && htmx ? 'true' : '';
    }
  };
}

function failNext(error) {
  throw error;
}

test('every role that can open Add/Edit Unit can submit catalog requests', () => {
  for (const roleCode of ADD_EDIT_ROLE_CODES) {
    assert.equal(catalogRequestAccessPolicy.canSubmitCatalogRequest([roleCode]), true, roleCode);
  }

  assert.equal(catalogRequestAccessPolicy.canSubmitCatalogRequest(['qc']), false);
  assert.equal(catalogRequestAccessPolicy.canSubmitCatalogRequest([]), false);
});

test('Add/Edit Unit and catalog endpoints share the same role policy', () => {
  const techController = read('controllers/techController.js');
  const catalogController = read('controllers/catalogRequestController.js');
  const routes = read('routes/management.js');

  assert.match(techController, /catalogRequestAccessPolicy\.canSubmitCatalogRequest\(getCurrentRoleCodes\(req\)\)/);
  assert.match(catalogController, /catalogRequestAccessPolicy\.canSubmitCatalogRequestFromRequest\(req\)/);
  assert.doesNotMatch(catalogController, /Only regular Tech users/);
  assert.match(routes, /const techRoles = \['admin', 'management', 'tech_lead', 'tech'\]/);
  assert.match(routes, /\/tech\/unit-catalog-requests\/model\/modal[\s\S]*?requireRole\(techRoles\)/);
  assert.match(routes, /\/tech\/unit-catalog-requests\/processor\/modal[\s\S]*?requireRole\(techRoles\)/);
});

test('model and processor request modals open for Admin, Management, Tech Lead, and Tech', async (t) => {
  const originals = {
    listManufacturers: unitModelCatalogModel.listManufacturers,
    listUnitCategories: unitModelCatalogModel.listUnitCategories,
    listUnitModels: unitModelCatalogModel.listUnitModels,
    getUnitModelById: unitModelCatalogModel.getUnitModelById
  };

  unitModelCatalogModel.listManufacturers = async () => [{ id: 11, label: 'Dell' }];
  unitModelCatalogModel.listUnitCategories = async () => [{ id: 22, label: 'Desktop' }];
  unitModelCatalogModel.listUnitModels = async () => [];
  unitModelCatalogModel.getUnitModelById = async () => ({
    id: 33,
    modelName: 'OptiPlex 7090',
    manufacturerName: 'Dell',
    unitCategoryLabel: 'Desktop',
    isActive: true
  });

  t.after(() => {
    Object.assign(unitModelCatalogModel, originals);
  });

  for (const roleCode of ADD_EDIT_ROLE_CODES) {
    const modelResponse = makeResponse();
    await catalogRequestController.renderModelCatalogRequestModal(
      makeRequest(roleCode, {
        query: {
          manufacturerId: '11',
          unitCategoryConfigValueId: '22',
          requestedModelName: 'OptiPlex New Model'
        }
      }),
      modelResponse,
      failNext
    );

    assert.equal(modelResponse.statusCode, 200, `${roleCode} model modal`);
    assert.equal(modelResponse.renderedView, 'fragments/tech-unit-catalog-request-modal');
    assert.deepEqual(modelResponse.renderedData.errorMessages, []);

    const processorResponse = makeResponse();
    await catalogRequestController.renderProcessorCatalogRequestModal(
      makeRequest(roleCode, {
        query: {
          unitModelId: '33',
          requestedProcessorType: 'Intel',
          requestedProcessorName: 'Core i5 Test',
          requestedProcessorSpeedGhz: '2.50'
        }
      }),
      processorResponse,
      failNext
    );

    assert.equal(processorResponse.statusCode, 200, `${roleCode} processor modal`);
    assert.equal(processorResponse.renderedView, 'fragments/tech-unit-catalog-request-modal');
    assert.deepEqual(processorResponse.renderedData.errorMessages, []);
  }
});

test('model and processor requests submit for every Add/Edit Unit role', async (t) => {
  const originals = {
    listManufacturers: unitModelCatalogModel.listManufacturers,
    listUnitCategories: unitModelCatalogModel.listUnitCategories,
    listUnitModels: unitModelCatalogModel.listUnitModels,
    getUnitModelById: unitModelCatalogModel.getUnitModelById,
    createModelCatalogRequest: unitRequestModel.createModelCatalogRequest,
    createProcessorCatalogRequest: unitRequestModel.createProcessorCatalogRequest
  };
  let nextRequestId = 500;
  const submissions = [];

  unitModelCatalogModel.listManufacturers = async () => [{ id: 11, label: 'Dell' }];
  unitModelCatalogModel.listUnitCategories = async () => [{ id: 22, label: 'Desktop' }];
  unitModelCatalogModel.listUnitModels = async () => [];
  unitModelCatalogModel.getUnitModelById = async () => ({
    id: 33,
    modelName: 'OptiPlex 7090',
    manufacturerName: 'Dell',
    unitCategoryLabel: 'Desktop',
    isActive: true
  });
  unitRequestModel.createModelCatalogRequest = async (payload) => {
    submissions.push({ kind: 'model', payload });
    return { unitRequestId: ++nextRequestId };
  };
  unitRequestModel.createProcessorCatalogRequest = async (payload) => {
    submissions.push({ kind: 'processor', payload });
    return { unitRequestId: ++nextRequestId };
  };

  t.after(() => {
    Object.assign(unitModelCatalogModel, {
      listManufacturers: originals.listManufacturers,
      listUnitCategories: originals.listUnitCategories,
      listUnitModels: originals.listUnitModels,
      getUnitModelById: originals.getUnitModelById
    });
    Object.assign(unitRequestModel, {
      createModelCatalogRequest: originals.createModelCatalogRequest,
      createProcessorCatalogRequest: originals.createProcessorCatalogRequest
    });
  });

  for (const roleCode of ADD_EDIT_ROLE_CODES) {
    const modelResponse = makeResponse();
    await catalogRequestController.createModelCatalogRequest(
      makeRequest(roleCode, {
        body: {
          manufacturerId: '11',
          unitCategoryConfigValueId: '22',
          requestedModelName: `OptiPlex ${roleCode}`,
          requesterNote: `Model request by ${roleCode}`
        }
      }),
      modelResponse,
      failNext
    );
    assert.equal(modelResponse.statusCode, 200, `${roleCode} model submit`);
    assert.ok(modelResponse.renderedData.successRequestId);

    const processorResponse = makeResponse();
    await catalogRequestController.createProcessorCatalogRequest(
      makeRequest(roleCode, {
        body: {
          unitModelId: '33',
          requestedProcessorType: 'Intel',
          requestedProcessorName: `Core i5 ${roleCode}`,
          requestedProcessorSpeedGhz: '2.50',
          requesterNote: `Processor request by ${roleCode}`
        }
      }),
      processorResponse,
      failNext
    );
    assert.equal(processorResponse.statusCode, 200, `${roleCode} processor submit`);
    assert.ok(processorResponse.renderedData.successRequestId);
  }

  assert.equal(submissions.length, ADD_EDIT_ROLE_CODES.length * 2);
  for (const roleCode of ADD_EDIT_ROLE_CODES) {
    assert.ok(submissions.some((entry) => entry.kind === 'model' && entry.payload.requesterNote === `Model request by ${roleCode}`));
    assert.ok(submissions.some((entry) => entry.kind === 'processor' && entry.payload.requesterNote === `Processor request by ${roleCode}`));
  }
});
