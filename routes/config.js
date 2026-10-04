const express = require('express');
const configController = require('../controllers/configController');
const unitModelCatalogController = require('../controllers/unitModelCatalogController');
const processorFamilyController = require('../controllers/processorFamilyController');
const processorCatalogController = require('../controllers/processorCatalogController');
const systemController = require('../controllers/systemController');
const labelPrintConfigController = require('../controllers/labelPrintConfigController');
const toolConfigAliasController = require('../controllers/toolConfigAliasController');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');

const router = express.Router();

router.use('/management/config', requireAuth, requirePermission('configuration.view'));

router.get(
  '/management/config',
  requireAuth,
  requirePermission('configuration.view'),
  configController.renderConfigPage
);

router.post(
  '/management/config/application-time-zone',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.updateApplicationTimeZone
);

router.post(
  '/management/config/huddle-retention',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.updateHuddleRetention
);

router.get(
  '/management/config/printing',
  requireAuth,
  requirePermission('configuration.printing.manage'),
  labelPrintConfigController.renderPrintingConfigPage
);

router.post(
  '/management/config/printing',
  requireAuth,
  requirePermission('configuration.printing.manage'),
  labelPrintConfigController.updatePrintingConfig
);

router.post(
  '/management/config/label-dynamic-fields',
  requireAuth,
  requirePermission('configuration.label_fields.manage'),
  configController.updateLabelDynamicFields
);

router.post(
  '/management/config/label-dynamic-fields/order',
  requireAuth,
  requirePermission('configuration.label_fields.manage'),
  configController.reorderLabelDynamicFields
);

router.post(
  '/management/config/operational-rankings/refresh',
  requireAuth,
  requirePermission('configuration.operational_rankings.manage'),
  configController.refreshOperationalOptionRankings
);

router.post(
  '/management/config/operational-rankings/interval',
  requireAuth,
  requirePermission('configuration.operational_rankings.manage'),
  configController.updateOperationalOptionRankingInterval
);



router.get(
  '/management/config/processors',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderProcessorCatalogPage
);

router.get(
  '/management/config/processors/new/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderNewProcessorModal
);

router.post(
  '/management/config/processors/new/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.createProcessor
);

router.get(
  '/management/config/processors/:processorModelId/edit/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderEditProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/edit/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.updateProcessor
);

router.get(
  '/management/config/processors/:processorModelId/families/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderProcessorFamiliesModal
);

router.post(
  '/management/config/processors/:processorModelId/families',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.updateProcessorFamilies
);

router.get(
  '/management/config/processors/:processorModelId/models/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderProcessorModelsModal
);

router.post(
  '/management/config/processors/:processorModelId/models',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.updateProcessorModels
);

router.get(
  '/management/config/processors/:processorModelId/merge/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderMergeProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/merge',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.mergeProcessor
);

router.get(
  '/management/config/processors/:processorModelId/delete/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.renderDeleteProcessorModal
);

router.post(
  '/management/config/processors/:processorModelId/delete',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  processorCatalogController.deleteProcessor
);

router.get(
  '/management/config/processor-families',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.renderProcessorFamiliesPage
);

router.get(
  '/management/config/processor-families/new/modal',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.renderNewProcessorFamilyModal
);

router.get(
  '/management/config/processor-families/members',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.renderProcessorFamilyMembersFragment
);

router.post(
  '/management/config/processor-families',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.createProcessorFamily
);

router.get(
  '/management/config/processor-families/:processorFamilyId/edit/modal',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.renderEditProcessorFamilyModal
);

router.post(
  '/management/config/processor-families/:processorFamilyId/edit/modal',
  requireAuth,
  requirePermission('configuration.processor_families.manage'),
  processorFamilyController.updateProcessorFamily
);

router.get(
  '/management/config/database',
  requireAuth,
  requirePermission('configuration.database.view'),
  systemController.renderDatabasePage
);

router.get(
  '/management/config/models',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderUnitModelCatalogPage
);

router.get(
  '/management/config/models/new/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderNewUnitModelModal
);

router.post(
  '/management/config/models',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.createUnitModel
);

router.get(
  '/management/config/models/:unitModelId/edit/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderEditUnitModelModal
);

router.post(
  '/management/config/models/:unitModelId/edit/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.updateUnitModel
);

router.get(
  '/management/config/models/:unitModelId/processors/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderUnitModelProcessorsModal
);

router.post(
  '/management/config/models/:unitModelId/processors',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.updateUnitModelProcessors
);

router.get(
  '/management/config/models/:unitModelId/mappings/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderUnitModelMappingsModal
);

router.post(
  '/management/config/models/:unitModelId/mappings',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.createUnitModelMapping
);

router.post(
  '/management/config/models/:unitModelId/mappings/:mappingId/deactivate',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.deactivateUnitModelMapping
);

router.get(
  '/management/config/models/:unitModelId/delete/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderDeleteUnitModelModal
);

router.post(
  '/management/config/models/:unitModelId/delete',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.deleteUnitModel
);

router.get(
  '/management/config/models/:unitModelId/:actionType/modal',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.renderUnitModelStatusModal
);

router.post(
  '/management/config/models/:unitModelId/:actionType',
  requireAuth,
  requirePermission('configuration.models.manage'),
  unitModelCatalogController.updateUnitModelStatus
);

router.get(
  '/management/config/processor-types/new/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.renderNewProcessorTypeModal
);

router.post(
  '/management/config/processor-types',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.createProcessorType
);

router.get(
  '/management/config/processor-types/:processorBrandId/edit/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.renderEditProcessorTypeModal
);

router.post(
  '/management/config/processor-types/:processorBrandId/edit/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.updateProcessorType
);

router.get(
  '/management/config/processor-types/:processorBrandId/:actionType/modal',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.renderProcessorTypeStatusModal
);

router.post(
  '/management/config/processor-types/:processorBrandId/:actionType',
  requireAuth,
  requirePermission('configuration.processors.manage'),
  configController.updateProcessorTypeStatus
);

router.get(
  '/management/config/categories/:configCategoryId/tool-aliases/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  toolConfigAliasController.renderToolAliasesModal
);

router.post(
  '/management/config/categories/:configCategoryId/tool-aliases',
  requireAuth,
  requirePermission('configuration.values.manage'),
  toolConfigAliasController.createToolAlias
);

router.post(
  '/management/config/categories/:configCategoryId/tool-aliases/:aliasId/delete',
  requireAuth,
  requirePermission('configuration.values.manage'),
  toolConfigAliasController.deleteToolAlias
);

router.get(
  '/management/config/values/new/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.renderNewConfigValueModal
);

router.post(
  '/management/config/values',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.createConfigValue
);

router.post(
  '/management/config/categories/:configCategoryId/order',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.reorderConfigValues
);

router.get(
  '/management/config/values/:configValueId/edit/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.renderEditConfigValueModal
);

router.post(
  '/management/config/values/:configValueId/edit/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.updateConfigValue
);

router.get(
  '/management/config/values/:configValueId/activate/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.renderConfigValueStatusModal
);

router.post(
  '/management/config/values/:configValueId/activate',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.updateConfigValueStatus
);

router.get(
  '/management/config/values/:configValueId/deactivate/modal',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.renderConfigValueStatusModal
);

router.post(
  '/management/config/values/:configValueId/deactivate',
  requireAuth,
  requirePermission('configuration.values.manage'),
  configController.updateConfigValueStatus
);

module.exports = router;
