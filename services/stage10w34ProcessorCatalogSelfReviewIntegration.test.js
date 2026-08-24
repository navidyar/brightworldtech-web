'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Management and Admin can review their own Processor Catalog request without opening self-review for other request types', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(controller, /const isOwnRequest = Number\(request\.requestedByUserId\) === Number\(req\.currentUser\.user_id\)/);
  assert.match(controller, /const canSelfReviewProcessorRequest = catalogManager[\s\S]*?request\.requestType === unitRequestModel\.PROCESSOR_CATALOG_REQUEST_TYPE/);
  assert.match(controller, /\(!isOwnRequest \|\| canSelfReviewProcessorRequest\)/);
  assert.match(controller, /allowSelfReview: canManageCatalogRequests\(req\)/);

  assert.match(model, /async function approveProcessorCatalogRequest\([\s\S]*?allowSelfReview = false/);
  assert.match(model, /const isSelfReview = Number\(request\.requested_by_user_id\) === safeReviewerUserId;[\s\S]*?if \(isSelfReview && !allowSelfReview\)/);
  assert.match(model, /selfReviewedByCatalogManager: isSelfReview && Boolean\(allowSelfReview\)/);

  const duplicateApproval = model.slice(
    model.indexOf('async function approveIntentionalDuplicateRequest'),
    model.indexOf('async function approveModelCatalogRequest')
  );
  const modelApproval = model.slice(
    model.indexOf('async function approveModelCatalogRequest'),
    model.indexOf('async function approveProcessorCatalogRequest')
  );
  assert.match(duplicateApproval, /BWT_UNIT_REQUEST_SELF_REVIEW/);
  assert.match(modelApproval, /BWT_UNIT_REQUEST_SELF_REVIEW/);
});

test('Processor approval runtime allows an explicitly authorized self-review and records it in request history', async () => {
  const modulePaths = [
    '../models/db',
    '../models/lotModel',
    '../models/techUnitModel',
    '../models/unitIssueEntryModel',
    '../models/unitExpandedFormModel',
    '../models/unitLotDestinationValidationModel',
    '../models/processorFamilyModel',
    '../models/processorCatalogModel',
    '../models/unitRequestModel'
  ].map((relativePath) => require.resolve(relativePath));
  const priorCache = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const [dbPath, lotPath, techPath, issuePath, expandedPath, validationPath, familyPath, catalogPath, requestPath] = modulePaths;
  const eventPayloads = [];

  const connection = {
    async query(sql, params = []) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();
      if (compact.includes('FROM information_schema.TABLES')) {
        return [[
          { TABLE_NAME: 'unit_requests' },
          { TABLE_NAME: 'unit_duplicate_requests' },
          { TABLE_NAME: 'unit_request_events' },
          { TABLE_NAME: 'unit_model_catalog_requests' },
          { TABLE_NAME: 'unit_processor_catalog_requests' }
        ]];
      }
      if (compact.includes('FROM unit_requests ur') && compact.includes('INNER JOIN unit_processor_catalog_requests upcr')) {
        return [[{
          unit_request_id: 901,
          request_type: 'processor_catalog_addition',
          status: 'pending',
          requested_by_user_id: 7,
          unit_model_id: 55,
          requested_processor_speed_ghz: 2.2
        }]];
      }
      if (compact.includes('FROM unit_models um') && compact.includes('INNER JOIN manufacturers m')) {
        return [[{ unit_model_id: 55 }]];
      }
      if (compact.includes('FROM processor_models pm') && compact.includes('INNER JOIN processor_brands pb')) {
        return [[{
          processor_model_id: 41,
          processor_brand_id: 1,
          model_code: 'i5-9500T',
          base_speed_ghz: 2.2,
          is_active: 1,
          brand_name: 'Intel',
          brand_is_active: 1
        }]];
      }
      if (compact.startsWith('INSERT INTO unit_model_processor_options')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE unit_processor_catalog_requests')) return [{ affectedRows: 1 }];
      if (compact.startsWith('UPDATE unit_requests')) return [{ affectedRows: 1 }];
      if (compact.startsWith('INSERT INTO unit_request_events')) {
        eventPayloads.push(JSON.parse(params[4]));
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query in processor self-review test: ${compact}`);
    }
  };

  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: {} } };
    for (const modulePath of [lotPath, techPath, issuePath, expandedPath, validationPath]) {
      require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: {} };
    }
    require.cache[familyPath] = {
      id: familyPath,
      filename: familyPath,
      loaded: true,
      exports: {
        autoAssignProcessorFamilyMembershipWithConnection: async () => [{ code: 'intel-i5-9th' }]
      }
    };
    require.cache[catalogPath] = { id: catalogPath, filename: catalogPath, loaded: true, exports: {} };
    delete require.cache[requestPath];
    const unitRequestModel = require('../models/unitRequestModel');

    await assert.rejects(
      unitRequestModel.approveProcessorCatalogRequest({
        unitRequestId: 901,
        reviewedByUserId: 7,
        approvedExistingProcessorModelId: 41,
        connection
      }),
      (error) => error && error.code === 'BWT_UNIT_REQUEST_SELF_REVIEW'
    );

    const result = await unitRequestModel.approveProcessorCatalogRequest({
      unitRequestId: 901,
      reviewedByUserId: 7,
      approvedExistingProcessorModelId: 41,
      allowSelfReview: true,
      connection
    });

    assert.equal(result.approved, true);
    assert.equal(result.approvedProcessorModelId, 41);
    assert.equal(eventPayloads.length, 1);
    assert.equal(eventPayloads[0].selfReviewedByCatalogManager, true);
  } finally {
    for (const modulePath of modulePaths) {
      const prior = priorCache.get(modulePath);
      if (prior) require.cache[modulePath] = prior;
      else delete require.cache[modulePath];
    }
  }
});
