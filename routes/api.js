'use strict';

const express = require('express');
const apiAuthController = require('../controllers/apiAuthController');
const apiUnitController = require('../controllers/apiUnitController');
const { requireApiAuth } = require('../middleware/apiAuthMiddleware');
const { requireUnitApiAccess } = require('../middleware/apiUnitAccessMiddleware');

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

router.get('/units/creation-options', requireApiAuth, requireUnitApiAccess, apiUnitController.listCreationOptions);
router.post('/units/resolve', requireApiAuth, requireUnitApiAccess, apiUnitController.resolveUnit);
router.post('/units/commit', requireApiAuth, requireUnitApiAccess, apiUnitController.commitUnit);
router.post('/units/action', requireApiAuth, requireUnitApiAccess, apiUnitController.applyUnitAction);
router.put('/units/:unitId/wipe-certificates/:certificateId', requireApiAuth, requireUnitApiAccess, apiUnitController.recordWipeCertificate);

router.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: 'The requested API endpoint does not exist.'
    }
  });
});

module.exports = router;
