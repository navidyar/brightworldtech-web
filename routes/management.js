const express = require('express');
const managementController = require('../controllers/managementController');
const permissionManagementController = require('../controllers/permissionManagementController');
const overrideController = require('../controllers/overrideController');
const techController = require('../controllers/techController');
const unitRequestController = require('../controllers/unitRequestController');
const catalogRequestController = require('../controllers/catalogRequestController');
const qcReportingController = require('../controllers/qcReportingController');
const labelLibraryController = require('../controllers/labelLibraryController');
const labelPrintQueueController = require('../controllers/labelPrintQueueController');
const labelPrinterController = require('../controllers/labelPrinterController');
const { requireAuth, requirePermission, requireAnyPermission, requireRole } = require('../middleware/authMiddleware');
const { requireProtectedAdminAccess } = require('../middleware/protectedAdminMiddleware');

const router = express.Router();

// Duplicate assumption is intentionally limited to the existing Tech intake workflow.
// The model also checks the actor's role and current assignment before moving a Unit.
const techRoles = ['admin', 'management', 'tech_lead', 'tech'];

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
  requireAnyPermission(['printers.solo.manage', 'printers.managed.view']),
  labelPrinterController.streamPrinterRegistryEvents
);

/*
  Management routes
*/

router.get(
  '/management/qc-reporting',
  requireAuth,
  requirePermission('qc.reporting.view'),
  qcReportingController.renderManagementQcReportingPage
);

router.get(
  '/management/qc-reporting/reviews/:qcCheckId/audit/modal',
  requireAuth,
  requirePermission('qc.reporting.view'),
  requirePermission('qc.reviewer_audit.perform'),
  qcReportingController.renderReviewerAuditModal
);

router.post(
  '/management/qc-reporting/reviews/:qcCheckId/audit',
  requireAuth,
  requirePermission('qc.reporting.view'),
  requirePermission('qc.reviewer_audit.perform'),
  qcReportingController.submitReviewerAudit
);

router.get(
  '/management/users',
  requireAuth,
  requirePermission('users.view'),
  managementController.renderUsersPage
);

router.get(
  '/management/roles-permissions',
  requireAuth,
  requirePermission('roles.view'),
  permissionManagementController.renderRolesPermissionsPage
);

router.get(
  '/management/roles-permissions/:roleId/manage/modal',
  requireAuth,
  requirePermission('roles.view'),
  permissionManagementController.renderRoleManageModal
);

router.get(
  '/management/roles-permissions/new/modal',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.create'),
  permissionManagementController.renderCreateRoleModal
);

router.post(
  '/management/roles-permissions/new/modal',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.create'),
  permissionManagementController.createRole
);

router.post(
  '/management/roles-permissions/:roleId/details',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.edit'),
  permissionManagementController.updateRoleDetails
);

router.post(
  '/management/roles-permissions/:roleId/permissions',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('role_permissions.manage'),
  permissionManagementController.updateRolePermissions
);

router.get(
  '/management/roles-permissions/:roleId/duplicate/modal',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.create'),
  requirePermission('role_permissions.manage'),
  permissionManagementController.renderDuplicateRoleModal
);

router.post(
  '/management/roles-permissions/:roleId/duplicate/modal',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.create'),
  requirePermission('role_permissions.manage'),
  permissionManagementController.duplicateRole
);

router.get(
  '/management/roles-permissions/:roleId/delete/modal',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.delete'),
  permissionManagementController.renderDeleteRoleModal
);

router.post(
  '/management/roles-permissions/:roleId/delete',
  requireAuth,
  requirePermission('roles.view'),
  requirePermission('roles.delete'),
  permissionManagementController.deleteRole
);

router.get(
  '/management/permission-audit',
  requireAuth,
  permissionManagementController.renderPermissionAuditPage
);

router.get(
  '/management/permission-audit/:eventId/modal',
  requireAuth,
  permissionManagementController.renderPermissionAuditEventModal
);

router.get(
  '/management/users/inactive',
  requireAuth,
  requirePermission('users.view'),
  managementController.renderInactiveUsersPage
);

router.get(
  '/management/users/history',
  requireAuth,
  requirePermission('audit.user_management.view'),
  managementController.renderUserHistoryPage
);

router.get(
  '/management/login-activity',
  requireAuth,
  requirePermission('audit.login.view'),
  managementController.renderLoginActivityPage
);


router.get(
  '/management/login-activity/:userId/modal',
  requireAuth,
  requirePermission('audit.login.view'),
  managementController.renderLoginActivityUserModal
);

router.get(
  '/management/label-library',
  requireAuth,
  requirePermission('labels.library.view'),
  labelLibraryController.renderLabelLibraryPage
);

router.get(
  '/management/printers',
  requireAuth,
  requirePermission('printers.managed.view'),
  labelPrinterController.renderManagementPrintersPage
);

router.get(
  '/management/printers/live',
  requireAuth,
  requirePermission('printers.managed.view'),
  labelPrinterController.renderManagementPrintersLive
);

router.get(
  '/management/printers/new/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.managed.manage'),
  labelPrinterController.renderNewManagedPrinterModal
);

router.post(
  '/management/printers/probe',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.managed.manage'),
  labelPrinterController.probeManagedPrinter
);

router.post(
  '/management/printers',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.managed.manage'),
  labelPrinterController.createManagedPrinter
);

router.post(
  '/management/printers/:printerId/sharing',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.solo.manage_any'),
  labelPrinterController.updateManagedPrinterSharing
);

router.get(
  '/management/printers/:printerId/scope/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.managed.manage'),
  requirePermission('printers.solo.manage_any'),
  labelPrinterController.renderConvertPrinterScopeModal
);

router.post(
  '/management/printers/:printerId/scope',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.managed.manage'),
  requirePermission('printers.solo.manage_any'),
  labelPrinterController.convertPrinterScope
);

router.get(
  '/management/printers/:printerId/edit/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any']),
  requirePermission('printers.network_details.view'),
  labelPrinterController.renderEditManagedPrinterModal
);

router.post(
  '/management/printers/:printerId/edit/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any']),
  requirePermission('printers.network_details.view'),
  labelPrinterController.updateManagedPrinter
);

router.get(
  '/management/printers/:printerId/delete/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any']),
  labelPrinterController.renderDeleteManagedPrinterModal
);

router.post(
  '/management/printers/:printerId/delete',
  requireAuth,
  requirePermission('printers.managed.view'),
  requireAnyPermission(['printers.managed.manage', 'printers.solo.manage_any']),
  labelPrinterController.deleteManagedPrinter
);

router.get(
  '/management/printer-groups/new/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.renderNewGroupModal
);

router.post(
  '/management/printer-groups',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.createGroup
);

router.get(
  '/management/printer-groups/:groupId/members/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.renderGroupMembersModal
);

router.post(
  '/management/printer-groups/:groupId/members',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.updateGroupMembers
);

router.get(
  '/management/printer-groups/:groupId/delete/modal',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.renderDeleteGroupModal
);

router.post(
  '/management/printer-groups/:groupId/delete',
  requireAuth,
  requirePermission('printers.managed.view'),
  requirePermission('printers.groups.manage'),
  labelPrinterController.deleteGroup
);

router.get(
  '/management/label-library/templates/new/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.renderNewTemplateModal
);

router.post(
  '/management/label-library/templates',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.createTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/edit/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.renderEditTemplateModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/edit/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.updateTemplate
);

router.post(
  '/management/label-library/templates/:labelTemplateId/clone',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.cloneTemplate
);

router.post(
  '/management/label-library/builder/qr-preview',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  labelLibraryController.renderBuilderQrPreview
);

router.get(
  '/management/label-library/builder/units',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  labelLibraryController.searchBuilderPreviewUnits
);

router.get(
  '/management/label-library/builder/units/:unitId',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  labelLibraryController.getBuilderUnitPreview
);

router.get(
  '/management/label-library/templates/:labelTemplateId/builder/test-print/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  requirePermission('labels.print'),
  labelLibraryController.renderBuilderTestPrintModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/builder/test-print',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  requirePermission('labels.print'),
  labelLibraryController.printBuilderTestTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/builder',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  labelLibraryController.renderTemplateBuilder
);

router.post(
  '/management/label-library/templates/:labelTemplateId/builder',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.builder.manage'),
  labelLibraryController.saveTemplateBuilder
);

router.get(
  '/management/label-library/templates/:labelTemplateId/print/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.print'),
  labelLibraryController.renderStandaloneDirectPrintModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/print',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.print'),
  labelLibraryController.printStandaloneTemplate
);

router.get(
  '/management/label-library/templates/:labelTemplateId/lots/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  labelLibraryController.renderTemplateLotUsageModal
);

router.get(
  '/management/label-library/templates/:labelTemplateId/:action/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.renderTemplateActionModal
);

router.post(
  '/management/label-library/templates/:labelTemplateId/:action',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.applyTemplateAction
);

router.post(
  '/management/label-library/templates/reorder',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.library.manage'),
  labelLibraryController.reorderTemplates
);

router.get(
  '/management/label-library/assets/fragment',
  requireAuth,
  requirePermission('labels.library.view'),
  labelLibraryController.renderAssetListFragment
);

router.get(
  '/management/label-library/assets/:assetId/rename/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  labelLibraryController.renderAssetRenameModal
);

router.post(
  '/management/label-library/assets/:assetId/rename',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  labelLibraryController.renameAsset
);

router.get(
  '/management/label-library/assets/:assetId/delete/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  labelLibraryController.renderAssetDeleteModal
);

router.post(
  '/management/label-library/assets/:assetId/delete',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  labelLibraryController.deleteAsset
);

router.get(
  '/management/label-library/assets/upload/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  labelLibraryController.renderAssetUploadModal
);

router.post(
  '/management/label-library/assets/upload',
  requireAuth,
  requirePermission('labels.library.view'),
  requirePermission('labels.assets.manage'),
  parseLabelAssetUploadBody,
  labelLibraryController.uploadLabelAsset
);

router.get(
  '/management/label-library/assets/:assetId/preview/modal',
  requireAuth,
  requirePermission('labels.library.view'),
  labelLibraryController.renderAssetPreviewModal
);

router.get(
  '/management/label-library/assets/:assetId/file',
  requireAuth,
  requirePermission('labels.library.view'),
  labelLibraryController.serveAssetFile
);

router.get(
  '/management/users/new',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.create'),
  managementController.renderNewUserPage
);

router.post(
  '/management/users',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.create'),
  managementController.createUser
);

router.use(
  '/management/users/:userId',
  requireAuth,
  requireProtectedAdminAccess
);


router.get(
  '/management/users/:userId/permissions/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('roles.view'),
  permissionManagementController.renderUserPermissionModal
);

router.post(
  '/management/users/:userId/permissions/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('roles.view'),
  requirePermission('user_permissions.manage'),
  permissionManagementController.updateUserPermissionOverrides
);

router.get(
  '/management/users/:userId/tool-pin/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.tool_pin.manage'),
  managementController.renderUserToolPinModal
);

router.post(
  '/management/users/:userId/tool-pin',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.tool_pin.manage'),
  managementController.updateUserToolPin
);

router.get(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.edit'),
  managementController.renderEditUserModal
);

router.post(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.edit'),
  managementController.updateUserModal
);

router.get(
  '/management/users/:userId/deactivate/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.status.manage'),
  managementController.renderDeactivateUserModal
);

router.get(
  '/management/users/:userId/reactivate/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.status.manage'),
  managementController.renderReactivateUserModal
);

router.get(
  '/management/users/:userId/delete-pending/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.delete'),
  managementController.renderDeletePendingUserModal
);

router.get(
  '/management/users/:userId/setup-link/modal',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.setup_links.manage'),
  managementController.renderSetupLinkModal
);

router.post(
  '/management/users/:userId/setup-link',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.setup_links.manage'),
  managementController.createSetupLinkForExistingUser
);

router.post(
  '/management/users/:userId/deactivate',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.status.manage'),
  managementController.deactivateUser
);

router.post(
  '/management/users/:userId/reactivate',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.status.manage'),
  managementController.reactivateUser
);

router.post(
  '/management/users/:userId/delete-pending',
  requireAuth,
  requirePermission('users.view'),
  requirePermission('users.delete'),
  managementController.deletePendingSetupUser
);

router.use('/unit-requests', requireAuth, requirePermission('requests.view'));
router.use('/tech/unit-catalog-requests', requireAuth, requirePermission('catalog_requests.submit'));
router.use('/tech/printers', requireAuth, requirePermission('printers.solo.manage'));
router.use('/tech/print-queue', requireAuth, requireAnyPermission(['labels.print', 'units.labels.print']));
router.use('/tech/units', requireAuth, requirePermission('units.view'));

/*
  Requests

  One role-aware request area. Regular Tech users see only their own requests;
  Tech Leads, Management users, and Admins review the shared queue.
*/

router.get(
  '/unit-requests',
  requireAuth,
  unitRequestController.renderUnitRequestsPage
);

router.get(
  '/unit-requests/:unitRequestId',
  requireAuth,
  unitRequestController.renderUnitRequestDetail
);

router.get(
  '/unit-requests/override/:overrideRequestId',
  requireAuth,
  unitRequestController.renderOverrideRequestDetail
);

router.post(
  '/unit-requests/override/:overrideRequestId/withdraw',
  requireAuth,
  unitRequestController.withdrawOverrideRequest
);

router.post(
  '/unit-requests/override/:overrideRequestId/approve',
  requireAuth,
  requireAnyPermission(['units.override.review', 'units.outcome.approve']),
  overrideController.approveOverrideRequest
);

router.post(
  '/unit-requests/override/:overrideRequestId/reject',
  requireAuth,
  requireAnyPermission(['units.override.review', 'units.outcome.approve']),
  overrideController.denyOverrideRequest
);

router.post(
  '/unit-requests/:unitRequestId/withdraw',
  requireAuth,
  unitRequestController.withdrawUnitRequest
);

router.post(
  '/unit-requests/:unitRequestId/approve',
  requireAuth,
  requireAnyPermission(['requests.review', 'qc.reversion.perform', 'catalog_requests.model.review', 'catalog_requests.processor.review']),
  unitRequestController.approveUnitRequest
);

router.post(
  '/unit-requests/:unitRequestId/reject',
  requireAuth,
  requireAnyPermission(['requests.review', 'qc.reversion.perform', 'catalog_requests.model.review', 'catalog_requests.processor.review']),
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
  catalogRequestController.renderModelCatalogRequestModal
);

router.post(
  '/tech/unit-catalog-requests/model',
  requireAuth,
  catalogRequestController.createModelCatalogRequest
);

router.get(
  '/tech/unit-catalog-requests/processor/modal',
  requireAuth,
  catalogRequestController.renderProcessorCatalogRequestModal
);

router.post(
  '/tech/unit-catalog-requests/processor',
  requireAuth,
  catalogRequestController.createProcessorCatalogRequest
);

/*
  Quality Control Portal
*/


router.get(
  '/qc/review',
  requireAuth,
  requirePermission('qc.portal.view'),
  techController.renderQcPortalReviewPage
);

router.get(
  '/qc/review/table',
  requireAuth,
  requirePermission('qc.portal.view'),
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
  labelPrinterController.renderMyPrintersPage
);

router.get(
  '/tech/printers/live',
  requireAuth,
  labelPrinterController.renderTechPrintersLive
);

router.get(
  '/tech/printers/new/modal',
  requireAuth,
  labelPrinterController.renderNewSoloPrinterModal
);

router.post(
  '/tech/printers/probe',
  requireAuth,
  labelPrinterController.probeSoloPrinter
);

router.post(
  '/tech/printers',
  requireAuth,
  labelPrinterController.createSoloPrinter
);

router.get(
  '/tech/printers/:printerId/edit/modal',
  requireAuth,
  labelPrinterController.renderEditSoloPrinterModal
);

router.post(
  '/tech/printers/:printerId/edit/modal',
  requireAuth,
  labelPrinterController.updateSoloPrinter
);

router.get(
  '/tech/printers/:printerId/delete/modal',
  requireAuth,
  labelPrinterController.renderDeleteSoloPrinterModal
);

router.post(
  '/tech/printers/:printerId/delete',
  requireAuth,
  labelPrinterController.deleteSoloPrinter
);

router.get(
  '/tech/units',
  requireAuth,
  requirePermission('units.view'),
  techController.renderTechUnitsPage
);

router.get(
  '/tech/units/table',
  requireAuth,
  requirePermission('units.view'),
  techController.renderTechUnitsTable
);

router.get(
  '/tech/units/pallet-options',
  requireAuth,
  requirePermission('units.view'),
  techController.renderTechUnitPalletFilterOptions
);

router.get(
  '/tech/units/events',
  requireAuth,
  requirePermission('units.view'),
  techController.streamTechUnitBrowserChanges
);

router.get(
  '/tech/units/export/preview',
  requireAuth,
  requirePermission('units.export'),
  techController.renderTechUnitsExportPreview
);

router.get(
  '/tech/units/export/csv',
  requireAuth,
  requirePermission('units.export'),
  techController.downloadTechUnitsCsv
);

router.get(
  '/tech/units/export/xlsx',
  requireAuth,
  requirePermission('units.export'),
  techController.downloadTechUnitsXlsx
);

router.get(
  '/tech/units/qc-summary',
  requireAuth,
  requirePermission('units.view'),
  techController.renderTechUnitsQcSummary
);


router.get(
  '/tech/units/lot-form-profile',
  requireAuth,
  requireAnyPermission(['units.create', 'units.edit']),
  techController.renderLotUnitFormProfile
);

router.post(
  '/tech/units/lot-requirement-preview',
  requireAuth,
  requireAnyPermission(['units.create', 'units.edit']),
  techController.renderLotRequirementWorkflowPreview
);

router.get(
  '/tech/units/duplicate-check',
  requireAuth,
  requireAnyPermission(['units.create', 'units.edit']),
  techController.renderEarlySerialDuplicateCheck
);

router.get(
  '/tech/print-queue/summary',
  requireAuth,
  requireAnyPermission(['labels.print', 'units.labels.print']),
  labelPrintQueueController.renderRecentPrintsSummary
);

router.get(
  '/tech/print-queue/modal',
  requireAuth,
  requireAnyPermission(['labels.print', 'units.labels.print']),
  labelPrintQueueController.renderRecentPrintsModal
);

router.get(
  '/tech/print-queue/live',
  requireAuth,
  requireAnyPermission(['labels.print', 'units.labels.print']),
  labelPrintQueueController.renderRecentPrintsLive
);

router.get(
  '/tech/units/print-labels/modal',
  requireAuth,
  requirePermission('units.labels.print'),
  techController.renderTechUnitsBulkPrintLabelModal
);

router.post(
  '/tech/units/print-labels',
  requireAuth,
  requirePermission('units.labels.print'),
  techController.printTechUnitsBulkLabels
);

router.get(
  '/tech/units/new/modal',
  requireAuth,
  requirePermission('units.create'),
  techController.renderNewTechUnitModal
);

router.get(
  '/tech/units/new',
  requireAuth,
  requirePermission('units.create'),
  techController.renderNewTechUnitPage
);

router.post(
  '/tech/units/modal',
  requireAuth,
  requirePermission('units.create'),
  techController.createTechUnitModal
);

router.post(
  '/tech/units',
  requireAuth,
  requirePermission('units.create'),
  techController.createTechUnit
);

router.get(
  '/tech/units/:unitId/record',
  requireAuth,
  requirePermission('units.view'),
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
  requirePermission('units.create'),
  requireRole(techRoles),
  techController.renderDuplicateAssumeExistingUnitModal
);

router.post(
  '/tech/units/:unitId/assume-existing',
  requireAuth,
  requirePermission('units.create'),
  requireRole(techRoles),
  techController.assumeExistingTechUnitFromDuplicateMatch
);

router.post(
  '/tech/units/:unitId/intentional-duplicate-request/modal',
  requireAuth,
  requirePermission('units.create'),
  requirePermission('requests.submit'),
  techController.renderIntentionalDuplicateRequestModal
);

router.post(
  '/tech/units/:unitId/intentional-duplicate-request',
  requireAuth,
  requirePermission('units.create'),
  requirePermission('requests.submit'),
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
  requirePermission('units.create'),
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
  requireAnyPermission(['qc.correction.submit', 'qc.correction.submit_any']),
  techController.renderQcCorrectionModal
);

router.post(
  '/tech/units/:unitId/qc-correction',
  requireAuth,
  requireAnyPermission(['qc.correction.submit', 'qc.correction.submit_any']),
  techController.submitQcCorrection
);

router.get(
  '/tech/units/:unitId/qc-review/details/modal',
  requireAuth,
  requirePermission('units.view'),
  techController.renderQcReviewDetailsModal
);


router.get(
  '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request/modal',
  requireAuth,
  requirePermission('qc.reversion.request'),
  techController.renderQcReviewReversionRequestModal
);

router.post(
  '/tech/units/:unitId/qc-review/:qcCheckId/reversion-request',
  requireAuth,
  requirePermission('qc.reversion.request'),
  techController.requestQcReviewReversion
);

router.get(
  '/tech/units/:unitId/qc-review/:qcCheckId/revert/modal',
  requireAuth,
  requirePermission('qc.reversion.perform'),
  techController.renderQcReviewReversionModal
);

router.post(
  '/tech/units/:unitId/qc-review/:qcCheckId/revert',
  requireAuth,
  requirePermission('qc.reversion.perform'),
  techController.revertQcReviewDirectly
);

router.get(
  '/tech/units/:unitId/qc-review/:decisionCode/modal',
  requireAuth,
  requirePermission('qc.review.perform'),
  techController.renderQcReviewModal
);

router.post(
  '/tech/units/:unitId/qc-review',
  requireAuth,
  requirePermission('qc.review.perform'),
  techController.recordQcReview
);

router.get(
  '/tech/units/:unitId/tool-details',
  requireAuth,
  requirePermission('units.tool_details.view'),
  require('../controllers/unitToolDetailsController').renderToolDetails
);

router.get(
  '/tech/units/:unitId/history',
  requireAuth,
  requirePermission('units.history.view'),
  techController.renderTechUnitHistoryPanel
);

router.get(
  '/tech/units/:unitId/override/modal',
  requireAuth,
  requirePermission('units.override.request'),
  overrideController.renderTechOverrideRequestModal
);

router.post(
  '/tech/units/:unitId/override',
  requireAuth,
  requirePermission('units.override.request'),
  overrideController.createTechOverrideRequest
);



router.get(
  '/tech/units/:unitId/print-label/modal',
  requireAuth,
  requirePermission('units.labels.print'),
  techController.renderTechUnitPrintLabelModal
);

router.post(
  '/tech/units/:unitId/print-label',
  requireAuth,
  requirePermission('units.labels.print'),
  techController.printTechUnitLabel
);


router.get(
  '/tech/units/:unitId/complete-work/modal',
  requireAuth,
  requirePermission('units.complete'),
  techController.renderCompleteTechUnitWorkModal
);

router.post(
  '/tech/units/:unitId/complete-work',
  requireAuth,
  requirePermission('units.complete'),
  techController.completeTechUnitWork
);


router.get(
  '/tech/units/:unitId/completions/:completionId/reverse/modal',
  requireAuth,
  requirePermission('units.reverse_completion'),
  techController.renderReverseTechUnitCompletionModal
);

router.post(
  '/tech/units/:unitId/completions/:completionId/reverse',
  requireAuth,
  requirePermission('units.reverse_completion'),
  techController.reverseTechUnitCompletion
);

router.get(
  '/tech/units/:unitId/permanent-delete/modal',
  requireAuth,
  requirePermission('units.delete'),
  techController.renderPermanentDeleteTechUnitModal
);

router.post(
  '/tech/units/:unitId/permanent-delete',
  requireAuth,
  requirePermission('units.delete'),
  techController.permanentlyDeleteTechUnit
);

router.get(
  '/tech/units/:unitId/park/modal',
  requireAuth,
  requirePermission('units.park'),
  techController.renderParkTechUnitModal
);

router.post(
  '/tech/units/:unitId/park',
  requireAuth,
  requirePermission('units.park'),
  techController.parkTechUnit
);

router.get(
  '/tech/units/:unitId/return-to-active/modal',
  requireAuth,
  requirePermission('units.return_to_active'),
  techController.renderReturnTechUnitToActiveModal
);

router.post(
  '/tech/units/:unitId/return-to-active',
  requireAuth,
  requirePermission('units.return_to_active'),
  techController.returnTechUnitToActive
);

router.get(
  '/tech/units/:unitId/edit/modal',
  requireAuth,
  requirePermission('units.edit'),
  techController.renderEditTechUnitModal
);

router.get(
  '/tech/units/:unitId/edit',
  requireAuth,
  requirePermission('units.edit'),
  techController.renderEditTechUnitPage
);

router.get(
  '/tech/units/:unitId',
  requireAuth,
  requirePermission('units.view'),
  techController.renderTechUnitDetailPage
);

router.post(
  '/tech/units/:unitId/modal',
  requireAuth,
  requirePermission('units.edit'),
  techController.updateTechUnitModal
);

router.post(
  '/tech/units/:unitId',
  requireAuth,
  requirePermission('units.edit'),
  techController.updateTechUnit
);

module.exports = router;
