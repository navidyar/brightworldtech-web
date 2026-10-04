'use strict';

const express = require('express');
const apiAuthController = require('../controllers/apiAuthController');
const apiUnitController = require('../controllers/apiUnitController');
const apiCatalogRequestController = require('../controllers/apiCatalogRequestController');
const apiToolConfigurationController = require('../controllers/apiToolConfigurationController');
const { requireApiAuth } = require('../middleware/apiAuthMiddleware');
const { requireUnitApiAccess, requireApiAnyPermission } = require('../middleware/apiUnitAccessMiddleware');
const { requireApiCatalogSubmit } = require('../middleware/apiCatalogRequestPermissionMiddleware');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    api_version: 'v1'
  });
});

router.post('/auth/login', apiAuthController.login);
router.get('/auth/me', requireApiAuth, apiAuthController.me);
router.post('/auth/logout', requireApiAuth, apiAuthController.logout);

router.get('/tool-configuration', requireApiAuth, requireUnitApiAccess, apiToolConfigurationController.getToolConfiguration);

router.get('/units/creation-options', requireApiAuth, requireUnitApiAccess, apiUnitController.listCreationOptions);
router.post('/units/catalog-requests/model', requireApiAuth, requireUnitApiAccess, requireApiCatalogSubmit, apiCatalogRequestController.createModel);
router.post('/units/catalog-requests/processor', requireApiAuth, requireUnitApiAccess, requireApiCatalogSubmit, apiCatalogRequestController.createProcessor);
router.get('/units/catalog-requests/:requestId', requireApiAuth, requireUnitApiAccess, apiCatalogRequestController.getStatus);
router.post('/units/resolve', requireApiAuth, requireUnitApiAccess, apiUnitController.resolveUnit);
router.post('/units/intentional-duplicate-requests', requireApiAuth, requireUnitApiAccess, requireApiAnyPermission('units.create'), requireApiAnyPermission('requests.submit'), apiUnitController.createUuidDuplicateRequest);
router.get('/units/intentional-duplicate-requests/:requestId', requireApiAuth, requireUnitApiAccess, requireApiAnyPermission('requests.submit'), apiUnitController.getUuidDuplicateRequestStatus);
router.post('/units/commit', requireApiAuth, requireUnitApiAccess, requireApiAnyPermission(['units.create', 'units.edit']), apiUnitController.commitUnit);
router.post('/units/action', requireApiAuth, requireUnitApiAccess, requireApiAnyPermission('units.edit'), apiUnitController.applyUnitAction);
router.put('/units/:unitId/wipe-certificates/:certificateId', requireApiAuth, requireUnitApiAccess, requireApiAnyPermission('units.edit'), apiUnitController.recordWipeCertificate);

router.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: 'The requested API endpoint does not exist.'
    }
  });
});

module.exports = router;
