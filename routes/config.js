const express = require('express');
const configController = require('../controllers/configController');
const unitModelCatalogController = require('../controllers/unitModelCatalogController');
const processorFamilyController = require('../controllers/processorFamilyController');
const processorCatalogController = require('../controllers/processorCatalogController');
const systemController = require('../controllers/systemController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const configRoles = ['admin'];
const processorCatalogRoles = ['admin', 'management'];

router.get(
  '/management/config',
  requireAuth,
  requireRole(configRoles),
  configController.renderConfigPage
);

router.post(
  '/management/config/operational-rankings/refresh',
  requireAuth,
  requireRole(configRoles),
  configController.refreshOperationalOptionRankings
);

router.post(
  '/management/config/operational-rankings/interval',
  requireAuth,
  requireRole(configRoles),
  configController.updateOperationalOptionRankingInterval
);



router.get(
  '/management/config/processors',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.renderProcessorCatalogPage
);

router.get(
  '/management/config/processors/:processorModelId/edit/modal',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.renderEditProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/edit/modal',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.updateProcessor
);

router.get(
  '/management/config/processors/:processorModelId/families/modal',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.renderProcessorFamiliesModal
);

router.post(
  '/management/config/processors/:processorModelId/families',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.updateProcessorFamilies
);

router.get(
  '/management/config/processors/:processorModelId/models/modal',
  requireAuth,
  requireRole(configRoles),
  processorCatalogController.renderProcessorModelsModal
);

router.post(
  '/management/config/processors/:processorModelId/models',
  requireAuth,
  requireRole(configRoles),
  processorCatalogController.updateProcessorModels
);

router.get(
  '/management/config/processors/:processorModelId/merge/modal',
  requireAuth,
  requireRole(configRoles),
  processorCatalogController.renderMergeProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/merge',
  requireAuth,
  requireRole(configRoles),
  processorCatalogController.mergeProcessor
);

router.get(
  '/management/config/processors/:processorModelId/delete/modal',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.renderDeleteProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/delete',
  requireAuth,
  requireRole(processorCatalogRoles),
  processorCatalogController.deleteProcessor
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
  '/management/config/models/:unitModelId/processors/modal',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.renderUnitModelProcessorsModal
);

router.post(
  '/management/config/models/:unitModelId/processors',
  requireAuth,
  requireRole(configRoles),
  unitModelCatalogController.updateUnitModelProcessors
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
  '/management/config/processor-types/new/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderNewProcessorTypeModal
);

router.post(
  '/management/config/processor-types',
  requireAuth,
  requireRole(configRoles),
  configController.createProcessorType
);

router.get(
  '/management/config/processor-types/:processorBrandId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderEditProcessorTypeModal
);

router.post(
  '/management/config/processor-types/:processorBrandId/edit/modal',
  requireAuth,
  requireRole(configRoles),
  configController.updateProcessorType
);

router.get(
  '/management/config/processor-types/:processorBrandId/:actionType/modal',
  requireAuth,
  requireRole(configRoles),
  configController.renderProcessorTypeStatusModal
);

router.post(
  '/management/config/processor-types/:processorBrandId/:actionType',
  requireAuth,
  requireRole(configRoles),
  configController.updateProcessorTypeStatus
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
