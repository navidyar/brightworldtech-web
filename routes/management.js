const express = require('express');
const managementController = require('../controllers/managementController');
const overrideController = require('../controllers/overrideController');
const techController = require('../controllers/techController');
const unitRequestController = require('../controllers/unitRequestController');
const catalogRequestController = require('../controllers/catalogRequestController');
const qcReportingController = require('../controllers/qcReportingController');
const labelLibraryController = require('../controllers/labelLibraryController');
const labelPrintQueueController = require('../controllers/labelPrintQueueController');
const labelPrinterController = require('../controllers/labelPrinterController');
const { requireAuth, requireRole, requireFeature } = require('../middleware/authMiddleware');
const {
  QC_PORTAL_ROLE_CODES,
  QC_REVIEW_ROLE_CODES
} = require('../config/accessPolicy');

const router = express.Router();

const managementRoles = ['admin', 'management'];
const techRoles = ['admin', 'management', 'tech_lead', 'tech'];
const unitRequestRoles = ['admin', 'management', 'tech_lead', 'qc', 'tech'];
const unitBrowserRoles = ['admin', 'management', 'tech_lead', 'qc', 'tech'];
const unitHistoryRoles = ['admin', 'management', 'tech_lead', 'qc', 'tech'];
const qcCorrectionRoles = ['admin', 'management', 'tech_lead', 'tech'];
const techDeleteRoles = ['admin', 'management', 'tech_lead'];
const unitLifecycleRoles = ['admin', 'management', 'tech_lead'];
const techHistoryRoles = ['admin', 'management', 'tech_lead'];
const completionReversalRoles = ['admin', 'management', 'tech_lead'];
const overrideReviewRoles = ['admin', 'management', 'tech_lead'];

const labelAssetUploadBody = express.raw({ type: '*/*', limit: '5mb' });

function parseLabelAssetUploadBody(req, res, next) {
  return labelAssetUploadBody(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large' || Number(error.status || error.statusCode) === 413) {
      return res.status(413).json({ ok: false, errors: ['Label Assets cannot exceed 5 MB.'] });
    }
    return res.status(400).json({ ok: false, errors: ['The Label Asset upload could not be read.'] });
  });
}

/*
  Printer registry live events
*/

router.get(
  '/label-printers/events',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.streamPrinterRegistryEvents
);

/*
  Management routes
*/

router.get(
  '/management/qc-reporting',
  requireAuth,
  requireFeature('qcReporting'),
  qcReportingController.renderManagementQcReportingPage
);

router.get(
  '/management/users',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderUsersPage
);

router.get(
  '/management/users/inactive',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderInactiveUsersPage
);

router.get(
  '/management/login-activity',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderLoginActivityPage
);

router.get(
  '/management/label-library',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderLabelLibraryPage
);

router.get(
  '/management/printers',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderManagementPrintersPage
);

router.get(
  '/management/printers/live',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderManagementPrintersLive
);

router.get(
  '/management/printers/new/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderNewManagedPrinterModal
);

router.post(
  '/management/printers/probe',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.probeManagedPrinter
);

router.post(
  '/management/printers',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.createManagedPrinter
);

router.post(
  '/management/printers/:printerId/sharing',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.updateManagedPrinterSharing
);

router.get(
  '/management/printers/:printerId/scope/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderConvertPrinterScopeModal
);

router.post(
  '/management/printers/:printerId/scope',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.convertPrinterScope
);

router.get(
  '/management/printers/:printerId/edit/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderEditManagedPrinterModal
);

router.post(
  '/management/printers/:printerId/edit/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.updateManagedPrinter
);

router.get(
  '/management/printers/:printerId/delete/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderDeleteManagedPrinterModal
);

router.post(
  '/management/printers/:printerId/delete',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.deleteManagedPrinter
);

router.get(
  '/management/printer-groups/new/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderNewGroupModal
);

router.post(
  '/management/printer-groups',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.createGroup
);

router.get(
  '/management/printer-groups/:groupId/members/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderGroupMembersModal
);

router.post(
  '/management/printer-groups/:groupId/members',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.updateGroupMembers
);

router.get(
  '/management/printer-groups/:groupId/delete/modal',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.renderDeleteGroupModal
);

router.post(
  '/management/printer-groups/:groupId/delete',
  requireAuth,
  requireFeature('managedPrinters'),
  labelPrinterController.deleteGroup
);

router.get(
  '/management/label-library/templates/new/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderNewTemplateModal
);

router.post(
  '/management/label-library/templates',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.createTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/edit/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderEditTemplateModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/edit/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.updateTemplate
);

router.post(
  '/management/label-library/templates/:labelTemplateId/clone',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.cloneTemplate
);

router.post(
  '/management/label-library/builder/qr-preview',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderBuilderQrPreview
);

router.get(
  '/management/label-library/builder/units',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.searchBuilderPreviewUnits
);

router.get(
  '/management/label-library/builder/units/:unitId',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.getBuilderUnitPreview
);

router.get(
  '/management/label-library/templates/:labelTemplateId/builder/test-print/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderBuilderTestPrintModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/builder/test-print',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.printBuilderTestTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/builder',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderTemplateBuilder
);

router.post(
  '/management/label-library/templates/:labelTemplateId/builder',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.saveTemplateBuilder
);

router.get(
  '/management/label-library/templates/:labelTemplateId/print/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderStandaloneDirectPrintModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/print',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.printStandaloneTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/lots/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderTemplateLotUsageModal
);

router.get(
  '/management/label-library/templates/:labelTemplateId/:action/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderTemplateActionModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/:action',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.applyTemplateAction
);

router.post(
  '/management/label-library/templates/reorder',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.reorderTemplates
);

router.get(
  '/management/label-library/assets/fragment',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderAssetListFragment
);

router.get(
  '/management/label-library/assets/:assetId/rename/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderAssetRenameModal
);

router.post(
  '/management/label-library/assets/:assetId/rename',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renameAsset
);

router.get(
  '/management/label-library/assets/:assetId/delete/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderAssetDeleteModal
);

router.post(
  '/management/label-library/assets/:assetId/delete',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.deleteAsset
);

router.get(
  '/management/label-library/assets/upload/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderAssetUploadModal
);

router.post(
  '/management/label-library/assets/upload',
  requireAuth,
  requireRole(managementRoles),
  parseLabelAssetUploadBody,
  labelLibraryController.uploadLabelAsset
);

router.get(
  '/management/label-library/assets/:assetId/preview/modal',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.renderAssetPreviewModal
);

router.get(
  '/management/label-library/assets/:assetId/file',
  requireAuth,
  requireRole(managementRoles),
  labelLibraryController.serveAssetFile
);

router.get(
  '/management/users/new',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderNewUserPage
);

router.post(
  '/management/users',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.createUser
);


router.get(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderEditUserModal
);

router.post(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.updateUserModal
);

router.get(
  '/management/users/:userId/deactivate/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderDeactivateUserModal
);

router.get(
  '/management/users/:userId/reactivate/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderReactivateUserModal
);

router.get(
  '/management/users/:userId/delete-pending/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderDeletePendingUserModal
);

router.get(
  '/management/users/:userId/setup-link/modal',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.renderSetupLinkModal
);

router.post(
  '/management/users/:userId/setup-link',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.createSetupLinkForExistingUser
);

router.post(
  '/management/users/:userId/deactivate',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.deactivateUser
);

router.post(
  '/management/users/:userId/reactivate',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.reactivateUser
);

router.post(
  '/management/users/:userId/delete-pending',
  requireAuth,
  requireFeature('userAdministration'),
  managementController.deletePendingSetupUser
);

/*
  Requests

  One role-aware request area. Regular Tech users see only their own requests;
  Tech Leads, Management users, and Admins review the shared queue.
*/

router.get(
  '/unit-requests',
  requireAuth,
  requireRole(unitRequestRoles),
  unitRequestController.renderUnitRequestsPage
);

router.get(
  '/unit-requests/:unitRequestId',
  requireAuth,
  requireRole(unitRequestRoles),
  unitRequestController.renderUnitRequestDetail
);

router.get(
  '/unit-requests/override/:overrideRequestId',
  requireAuth,
  requireRole(techRoles),
  unitRequestController.renderOverrideRequestDetail
);

router.post(
  '/unit-requests/override/:overrideRequestId/withdraw',
  requireAuth,
  requireRole(techRoles),
  unitRequestController.withdrawOverrideRequest
);

router.post(
  '/unit-requests/override/:overrideRequestId/approve',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.approveOverrideRequest
);

router.post(
  '/unit-requests/override/:overrideRequestId/reject',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.denyOverrideRequest
);

router.post(
  '/unit-requests/:unitRequestId/withdraw',
  requireAuth,
  requireRole(unitRequestRoles),
  unitRequestController.withdrawUnitRequest
);

router.post(
  '/unit-requests/:unitRequestId/approve',
  requireAuth,
  requireRole(overrideReviewRoles),
  unitRequestController.approveUnitRequest
);

router.post(
  '/unit-requests/:unitRequestId/reject',
  requireAuth,
  requireRole(overrideReviewRoles),
  unitRequestController.rejectUnitRequest
);

/*
  Tech catalog exception request routes

  These routes render controlled request modals from Add/Edit Unit. They must remain
  before the /tech/units/:unitId parameterized routes below.
*/

router.get(
  '/tech/unit-catalog-requests/model/modal',
  requireAuth,
  requireRole(techRoles),
  catalogRequestController.renderModelCatalogRequestModal
);

router.post(
  '/tech/unit-catalog-requests/model',
  requireAuth,
  requireRole(techRoles),
  catalogRequestController.createModelCatalogRequest
);

router.get(
  '/tech/unit-catalog-requests/processor/modal',
  requireAuth,
  requireRole(techRoles),
  catalogRequestController.renderProcessorCatalogRequestModal
);

router.post(
  '/tech/unit-catalog-requests/processor',
  requireAuth,
  requireRole(techRoles),
  catalogRequestController.createProcessorCatalogRequest
);

/*
  Quality Control Portal
*/


router.get(
  '/qc/review',
  requireAuth,
  requireRole(QC_PORTAL_ROLE_CODES),
  techController.renderQcPortalReviewPage
);

router.get(
  '/qc/review/table',
  requireAuth,
  requireRole(QC_PORTAL_ROLE_CODES),
  techController.renderQcPortalReviewTable
);

/*
  Tech routes

  Route order note:
  Keep /tech/units/table, /tech/units/pallet-options, /tech/units/lot-form-profile, /tech/units/lot-requirement-preview,
  /tech/units/new/modal, and /tech/units/new
  before parameterized routes like /tech/units/:unitId/edit/modal.
*/

router.get(
  '/tech/printers',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.renderMyPrintersPage
);

router.get(
  '/tech/printers/live',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.renderTechPrintersLive
);

router.get(
  '/tech/printers/new/modal',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.renderNewSoloPrinterModal
);

router.post(
  '/tech/printers/probe',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.probeSoloPrinter
);

router.post(
  '/tech/printers',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.createSoloPrinter
);

router.get(
  '/tech/printers/:printerId/edit/modal',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.renderEditSoloPrinterModal
);

router.post(
  '/tech/printers/:printerId/edit/modal',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.updateSoloPrinter
);

router.get(
  '/tech/printers/:printerId/delete/modal',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.renderDeleteSoloPrinterModal
);

router.post(
  '/tech/printers/:printerId/delete',
  requireAuth,
  requireRole(techRoles),
  labelPrinterController.deleteSoloPrinter
);

router.get(
  '/tech/units',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitsPage
);

router.get(
  '/tech/units/table',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitsTable
);

router.get(
  '/tech/units/pallet-options',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitPalletFilterOptions
);

router.get(
  '/tech/units/events',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.streamTechUnitBrowserChanges
);

router.get(
  '/tech/units/export/preview',
  requireAuth,
  requireFeature('userAdministration'),
  techController.renderTechUnitsExportPreview
);

router.get(
  '/tech/units/export/csv',
  requireAuth,
  requireFeature('userAdministration'),
  techController.downloadTechUnitsCsv
);

router.get(
  '/tech/units/export/xlsx',
  requireAuth,
  requireFeature('userAdministration'),
  techController.downloadTechUnitsXlsx
);

router.get(
  '/tech/units/qc-summary',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitsQcSummary
);


router.get(
  '/tech/units/lot-form-profile',
  requireAuth,
  requireRole(techRoles),
  techController.renderLotUnitFormProfile
);

router.post(
  '/tech/units/lot-requirement-preview',
  requireAuth,
  requireRole(techRoles),
  techController.renderLotRequirementWorkflowPreview
);

router.get(
  '/tech/units/duplicate-check',
  requireAuth,
  requireRole(techRoles),
  techController.renderEarlySerialDuplicateCheck
);

router.get(
  '/tech/print-queue/summary',
  requireAuth,
  requireRole(techRoles),
  labelPrintQueueController.renderRecentPrintsSummary
);

router.get(
  '/tech/print-queue/modal',
  requireAuth,
  requireRole(techRoles),
  labelPrintQueueController.renderRecentPrintsModal
);

router.get(
  '/tech/print-queue/live',
  requireAuth,
  requireRole(techRoles),
  labelPrintQueueController.renderRecentPrintsLive
);

router.get(
  '/tech/units/print-labels/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderTechUnitsBulkPrintLabelModal
);

router.post(
  '/tech/units/print-labels',
  requireAuth,
  requireRole(techRoles),
  techController.printTechUnitsBulkLabels
);

router.get(
  '/tech/units/new/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderNewTechUnitModal
);

router.get(
  '/tech/units/new',
  requireAuth,
  requireRole(techRoles),
  techController.renderNewTechUnitPage
);

router.post(
  '/tech/units/modal',
  requireAuth,
  requireRole(techRoles),
  techController.createTechUnitModal
);

router.post(
  '/tech/units',
  requireAuth,
  requireRole(techRoles),
  techController.createTechUnit
);

router.get(
  '/tech/units/:unitId/record',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitRecord
);

/*
  Tech duplicate assumption routes

  Route order note:
  Keep these before other /tech/units/:unitId routes.
*/

router.get(
  '/tech/units/:unitId/assume-existing/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderDuplicateAssumeExistingUnitModal
);

router.post(
  '/tech/units/:unitId/assume-existing',
  requireAuth,
  requireRole(techRoles),
  techController.assumeExistingTechUnitFromDuplicateMatch
);

router.post(
  '/tech/units/:unitId/intentional-duplicate-request/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderIntentionalDuplicateRequestModal
);

router.post(
  '/tech/units/:unitId/intentional-duplicate-request',
  requireAuth,
  requireRole(techRoles),
  techController.createIntentionalDuplicateRequest
);

/*
  Tech duplicate confirmation routes

  Route order note:
  Keep this before other /tech/units/:unitId routes.
*/

router.post(
  '/tech/units/:unitId/use-existing/modal',
  requireAuth,
  requireRole(techRoles),
  techController.useExistingTechUnitModal
);

/*
  Tech override routes

  Route order note:
  Keep these before other /tech/units/:unitId routes.
*/


router.get(
  '/tech/units/:unitId/qc-correction/modal',
  requireAuth,
  requireRole(qcCorrectionRoles),
  techController.renderQcCorrectionModal
);

router.post(
  '/tech/units/:unitId/qc-correction',
  requireAuth,
  requireRole(qcCorrectionRoles),
  techController.submitQcCorrection
);

router.get(
  '/tech/units/:unitId/qc-review/details/modal',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderQcReviewDetailsModal
);


router.get(
  '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request/modal',
  requireAuth,
  requireRole(['qc']),
  techController.renderQcReviewReversionRequestModal
);

router.post(
  '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request',
  requireAuth,
  requireRole(['qc']),
  techController.requestQcReviewReversion
);

router.get(
  '/tech/units/:unitId/qc-review/:qcCheckId/revert/modal',
  requireAuth,
  requireRole(overrideReviewRoles),
  techController.renderQcReviewReversionModal
);

router.post(
  '/tech/units/:unitId/qc-review/:qcCheckId/revert',
  requireAuth,
  requireRole(overrideReviewRoles),
  techController.revertQcReviewDirectly
);

router.get(
  '/tech/units/:unitId/qc-review/:decisionCode/modal',
  requireAuth,
  requireRole(QC_REVIEW_ROLE_CODES),
  techController.renderQcReviewModal
);

router.post(
  '/tech/units/:unitId/qc-review',
  requireAuth,
  requireRole(QC_REVIEW_ROLE_CODES),
  techController.recordQcReview
);

router.get(
  '/tech/units/:unitId/tool-details',
  requireAuth,
  requireRole(['admin', 'management', 'tech_lead', 'qc', 'tech']),
  require('../controllers/unitToolDetailsController').renderToolDetails
);

router.get(
  '/tech/units/:unitId/history',
  requireAuth,
  requireRole(unitHistoryRoles),
  techController.renderTechUnitHistoryPanel
);

router.get(
  '/tech/units/:unitId/my-weight-earned',
  requireAuth,
  requireRole(techHistoryRoles),
  techController.renderMyUnitWeightPanel
);

router.get(
  '/tech/units/:unitId/override/modal',
  requireAuth,
  requireRole(techRoles),
  overrideController.renderTechOverrideRequestModal
);

router.post(
  '/tech/units/:unitId/override',
  requireAuth,
  requireRole(techRoles),
  overrideController.createTechOverrideRequest
);



router.get(
  '/tech/units/:unitId/print-label/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderTechUnitPrintLabelModal
);

router.post(
  '/tech/units/:unitId/print-label',
  requireAuth,
  requireRole(techRoles),
  techController.printTechUnitLabel
);


router.get(
  '/tech/units/:unitId/complete-work/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderCompleteTechUnitWorkModal
);

router.post(
  '/tech/units/:unitId/complete-work',
  requireAuth,
  requireRole(techRoles),
  techController.completeTechUnitWork
);


router.get(
  '/tech/units/:unitId/completions/:completionId/reverse/modal',
  requireAuth,
  requireRole(completionReversalRoles),
  techController.renderReverseTechUnitCompletionModal
);

router.post(
  '/tech/units/:unitId/completions/:completionId/reverse',
  requireAuth,
  requireRole(completionReversalRoles),
  techController.reverseTechUnitCompletion
);

router.get(
  '/tech/units/:unitId/permanent-delete/modal',
  requireAuth,
  requireRole(techDeleteRoles),
  techController.renderPermanentDeleteTechUnitModal
);

router.post(
  '/tech/units/:unitId/permanent-delete',
  requireAuth,
  requireRole(techDeleteRoles),
  techController.permanentlyDeleteTechUnit
);

router.get(
  '/tech/units/:unitId/park/modal',
  requireAuth,
  requireRole(unitLifecycleRoles),
  techController.renderParkTechUnitModal
);

router.post(
  '/tech/units/:unitId/park',
  requireAuth,
  requireRole(unitLifecycleRoles),
  techController.parkTechUnit
);

router.get(
  '/tech/units/:unitId/return-to-active/modal',
  requireAuth,
  requireRole(unitLifecycleRoles),
  techController.renderReturnTechUnitToActiveModal
);

router.post(
  '/tech/units/:unitId/return-to-active',
  requireAuth,
  requireRole(unitLifecycleRoles),
  techController.returnTechUnitToActive
);

router.get(
  '/tech/units/:unitId/edit/modal',
  requireAuth,
  requireRole(techRoles),
  techController.renderEditTechUnitModal
);

router.get(
  '/tech/units/:unitId/edit',
  requireAuth,
  requireRole(techRoles),
  techController.renderEditTechUnitPage
);

router.get(
  '/tech/units/:unitId',
  requireAuth,
  requireRole(unitBrowserRoles),
  techController.renderTechUnitDetailPage
);

router.post(
  '/tech/units/:unitId/modal',
  requireAuth,
  requireRole(techRoles),
  techController.updateTechUnitModal
);

router.post(
  '/tech/units/:unitId',
  requireAuth,
  requireRole(techRoles),
  techController.updateTechUnit
);

module.exports = router;
