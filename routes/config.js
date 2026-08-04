const express = require('express');
const configController = require('../controllers/configController');
const unitModelCatalogController = require('../controllers/unitModelCatalogController');
const processorFamilyController = require('../controllers/processorFamilyController');
const systemController = require('../controllers/systemController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const configRoles = ['admin'];

router.get(
  '/management/config',
  requireAuth,
  requireRole(configRoles),
  configController.renderConfigPage
);


router.get(
  '/management/config/processor-families',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.renderProcessorFamiliesPage
);

router.get(
  '/management/config/processor-families/new/modal',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.renderNewProcessorFamilyModal
);

router.get(
  '/management/config/processor-families/members',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.renderProcessorFamilyMembersFragment
);

router.post(
  '/management/config/processor-families',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.createProcessorFamily
);

router.get(
  '/management/config/processor-families/:processorFamilyId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.renderEditProcessorFamilyModal
);

router.post(
  '/management/config/processor-families/:processorFamilyId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  processorFamilyController.updateProcessorFamily
);

router.get(
  '/management/config/database',
  requireAuth,
  requireRole(configRoles),
  systemController.renderDatabasePage
);

router.get(
  '/management/config/models',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.renderUnitModelCatalogPage
);

router.get(
  '/management/config/models/new/modal',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.renderNewUnitModelModal
);

router.post(
  '/management/config/models',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.createUnitModel
);

router.get(
  '/management/config/models/:unitModelId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.renderEditUnitModelModal
);

router.post(
  '/management/config/models/:unitModelId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.updateUnitModel
);

router.get(
  '/management/config/models/:unitModelId/:actionType/modal',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.renderUnitModelStatusModal
);

router.post(
  '/management/config/models/:unitModelId/:actionType',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.updateUnitModelStatus
);

router.get(
  '/management/config/values/new/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderNewConfigValueModal
);

router.post(
  '/management/config/values',
  requireAuth,
  requireRole(configRoles),
  configController.createConfigValue
);

router.post(
  '/management/config/categories/:configCategoryId/order',
  requireAuth,
  requireRole(configRoles),
  configController.reorderConfigValues
);

router.get(
  '/management/config/values/:configValueId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderEditConfigValueModal
);

router.post(
  '/management/config/values/:configValueId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  configController.updateConfigValue
);

router.get(
  '/management/config/values/:configValueId/activate/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderConfigValueStatusModal
);

router.post(
  '/management/config/values/:configValueId/activate',
  requireAuth,
  requireRole(configRoles),
  configController.updateConfigValueStatus
);

router.get(
  '/management/config/values/:configValueId/deactivate/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderConfigValueStatusModal
);

router.post(
  '/management/config/values/:configValueId/deactivate',
  requireAuth,
  requireRole(configRoles),
  configController.updateConfigValueStatus
);

module.exports = router;
