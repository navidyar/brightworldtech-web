const express = require('express');
const lotController = require('../controllers/lotController');
const { requireAuth, requirePermission, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const lotManagementRoles = ['admin', 'management'];


router.get(
  '/management/lots/new/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.create'),
  lotController.renderNewLotModal
);

router.get(
  '/management/lots/new',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.create'),
  lotController.renderNewLotPage
);

router.get(
  '/management/lots/:lotId/duplicate/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.duplicate'),
  lotController.renderLotDuplicateModalPage
);

router.post(
  '/management/lots/:lotId/duplicate',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.duplicate'),
  lotController.duplicateLot
);

router.get(
  '/management/lots/:lotId/edit/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.edit'),
  lotController.renderEditLotModal
);

router.post(
  '/management/lots/:lotId/edit/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.edit'),
  lotController.updateLotModal
);


router.get(
  '/management/lots/:lotId/hide/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.visibility.manage'),
  lotController.renderLotVisibilityModal
);

router.post(
  '/management/lots/:lotId/hide',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.visibility.manage'),
  lotController.updateLotVisibility
);

router.get(
  '/management/lots/:lotId/unhide/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.visibility.manage'),
  lotController.renderLotVisibilityModal
);

router.post(
  '/management/lots/:lotId/unhide',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.visibility.manage'),
  lotController.updateLotVisibility
);

router.get(
  '/management/lots/:lotId/close/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.close'),
  lotController.renderLotClosureModal
);

router.post(
  '/management/lots/:lotId/close',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.close'),
  lotController.updateLotClosure
);

router.get(
  '/management/lots/:lotId/reopen/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.reopen'),
  lotController.renderLotClosureModal
);

router.post(
  '/management/lots/:lotId/reopen',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.reopen'),
  lotController.updateLotClosure
);

router.get(
  '/management/lots/:lotId/delete/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.delete'),
  lotController.renderDeleteLotModal
);

router.post(
  '/management/lots/:lotId/delete',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.delete'),
  lotController.deleteLot
);

router.get(
  '/management/lots/:lotId/requirements/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.renderLotRequirementsModal
);

router.post(
  '/management/lots/:lotId/requirements/:requirementId/customize',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.customizeInheritedLotRequirementField
);

router.post(
  '/management/lots/:lotId/requirements/:requirementId/stop-inheriting',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.suppressInheritedLotRequirementField
);

router.post(
  '/management/lots/:lotId/requirements/inheritance/:requirementTypeConfigValueId/restore',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.restoreInheritedLotRequirementField
);

router.get(
  '/management/lots/:lotId/requirements/new/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.renderNewLotRequirementModal
);

router.post(
  '/management/lots/:lotId/requirements',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.createLotRequirement
);

router.get(
  '/management/lots/:lotId/requirements/:requirementId/edit/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.renderEditLotRequirementModal
);

router.post(
  '/management/lots/:lotId/requirements/:requirementId/edit/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.updateLotRequirementModal
);

router.get(
  '/management/lots/:lotId/requirements/:requirementId/delete/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.renderDeleteLotRequirementModal
);

router.post(
  '/management/lots/:lotId/requirements/:requirementId/delete',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.requirements.manage'),
  lotController.deleteLotRequirement
);

router.get(
  '/management/lots/:lotId/amazon-asset-tags/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.amazon_tags.generate'),
  lotController.renderAmazonAssetTagBulkModal
);

router.post(
  '/management/lots/:lotId/amazon-asset-tags/generate',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.amazon_tags.generate'),
  lotController.generateAmazonAssetTagsForDirectLot
);

router.get(
  '/management/lots/:lotId/unit-form/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.unit_form.configure'),
  lotController.renderLotUnitFormRulesModalPage
);

router.post(
  '/management/lots/:lotId/unit-form/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.unit_form.configure'),
  lotController.updateLotUnitFormRules
);

router.get(
  '/management/lots/:lotId/unit-browser/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.unit_browser.configure'),
  lotController.renderLotUnitBrowserLayoutModalPage
);

router.post(
  '/management/lots/:lotId/unit-browser/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.unit_browser.configure'),
  lotController.updateLotUnitBrowserLayout
);


router.get(
  '/management/lots/:lotId/labels/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.labels.configure'),
  lotController.renderLotLabelTemplatesModalPage
);

router.post(
  '/management/lots/:lotId/labels/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.labels.configure'),
  lotController.updateLotLabelTemplates
);

router.get(
  '/management/lots/:lotId/units/:unitId/validation/modal',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.validation.override'),
  lotController.renderLotUnitValidationModal
);

router.post(
  '/management/lots/:lotId/units/:unitId/validation/accept',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.validation.override'),
  lotController.acceptLotUnitValidationOverride
);

router.post(
  '/management/lots/:lotId/units/:unitId/validation/overrides/:overrideId/revoke',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.validation.override'),
  lotController.revokeLotUnitValidationOverride
);

router.get(
  '/management/lots/:lotId/export/preview',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.export'),
  lotController.renderLotUnitExportPreview
);

router.get(
  '/management/lots/:lotId/export/csv',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.export'),
  lotController.downloadLotUnitsCsv
);

router.get(
  '/management/lots/:lotId/export/xlsx',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.export'),
  lotController.downloadLotUnitsXlsx
);

router.get(
  '/management/lots/:lotId',
  requireAuth,
  requirePermission('lots.view'),
  lotController.renderLotDetailPage
);

router.post(
  '/management/lots',
  requireAuth,
  requirePermission('lots.view'),
  requirePermission('lots.create'),
  lotController.createLot
);

router.get(
  '/management/lots',
  requireAuth,
  requirePermission('lots.view'),
  lotController.renderLotsPage
);

module.exports = router;
