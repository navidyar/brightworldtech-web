'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Admin can self-approve Model and Processor Catalog requests without opening self-review to non-Admin roles', () => {
  const controller = read('controllers/unitRequestController.js');
  const model = read('models/unitRequestModel.js');

  assert.match(controller, /const CATALOG_MANAGER_ROLE_CODES = new Set\(\['admin'\]\)/);
  assert.match(controller, /const canSelfReviewCatalogRequest = catalogManager && isCatalogRequest\(request\)/);
  assert.match(controller, /\(!isOwnRequest \|\| canSelfReviewCatalogRequest\)/);
  assert.match(controller, /approvedModelName: req\.body\.approvedModelName,[\s\S]*?reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);
  assert.match(controller, /approvedProcessorBaseSpeedGhz: req\.body\.approvedProcessorBaseSpeedGhz,[\s\S]*?reviewerIsAdmin: isAdminCatalogReviewer\(req\)/);

  assert.match(model, /async function approveModelCatalogRequest\([\s\S]*?reviewerIsAdmin = false/);
  assert.match(model, /Only Admin can approve Model Catalog requests/);
  assert.match(model, /async function approveProcessorCatalogRequest\([\s\S]*?reviewerIsAdmin = false/);
  assert.match(model, /Only Admin can approve Processor Catalog requests/);
  assert.match(model, /selfReviewedByAdmin: isSelfReview/);
});

test('Processor approval runtime requires Admin authority, allows Admin self-review, and records it in request history', async () => {
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
      (error) => error && error.code === 'BWT_CATALOG_ADMIN_REQUIRED'
    );

    const result = await unitRequestModel.approveProcessorCatalogRequest({
      unitRequestId: 901,
      reviewedByUserId: 7,
      approvedExistingProcessorModelId: 41,
      reviewerIsAdmin: true,
      connection
    });

    assert.equal(result.approved, true);
    assert.equal(result.approvedProcessorModelId, 41);
    assert.equal(eventPayloads.length, 1);
    assert.equal(eventPayloads[0].selfReviewedByAdmin, true);
    assert.equal(eventPayloads[0].reviewAuthority, 'admin');
  } finally {
    for (const modulePath of modulePaths) {
      const prior = priorCache.get(modulePath);
      if (prior) require.cache[modulePath] = prior;
      else delete require.cache[modulePath];
    }
  }
});
