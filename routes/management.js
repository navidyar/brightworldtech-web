const express = require('express');
const managementController = require('../controllers/managementController');
const overrideController = require('../controllers/overrideController');
const techController = require('../controllers/techController');
const unitRequestController = require('../controllers/unitRequestController');
const catalogRequestController = require('../controllers/catalogRequestController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const managementRoles = ['admin', 'management'];
const techRoles = ['admin', 'management', 'tech_lead', 'tech'];
const techDeleteRoles = ['admin', 'management', 'tech_lead'];
const unitLifecycleRoles = ['admin', 'management', 'tech_lead'];
const outcomeApprovalRoles = ['admin', 'management', 'tech_lead'];
const techHistoryRoles = ['admin', 'management', 'tech_lead'];
const overrideReviewRoles = ['admin', 'management', 'tech_lead'];

/*
  Management routes
*/

router.get(
  '/management/users',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderUsersPage
);

router.get(
  '/management/users/inactive',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderInactiveUsersPage
);

router.get(
  '/management/login-activity',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderLoginActivityPage
);

router.get(
  '/management/users/new',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderNewUserPage
);

router.post(
  '/management/users',
  requireAuth,
  requireRole(managementRoles),
  managementController.createUser
);


router.get(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderEditUserModal
);

router.post(
  '/management/users/:userId/edit/modal',
  requireAuth,
  requireRole(managementRoles),
  managementController.updateUserModal
);

router.get(
  '/management/users/:userId/deactivate/modal',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderDeactivateUserModal
);

router.get(
  '/management/users/:userId/reactivate/modal',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderReactivateUserModal
);

router.get(
  '/management/users/:userId/delete-pending/modal',
  requireAuth,
  requireRole(managementRoles),
  managementController.renderDeletePendingUserModal
);

router.post(
  '/management/users/:userId/setup-link',
  requireAuth,
  requireRole(managementRoles),
  managementController.createSetupLinkForExistingUser
);

router.post(
  '/management/users/:userId/deactivate',
  requireAuth,
  requireRole(managementRoles),
  managementController.deactivateUser
);

router.post(
  '/management/users/:userId/reactivate',
  requireAuth,
  requireRole(managementRoles),
  managementController.reactivateUser
);

router.post(
  '/management/users/:userId/delete-pending',
  requireAuth,
  requireRole(managementRoles),
  managementController.deletePendingSetupUser
);

/*
  Management override routes

  Route order note:
  Keep /management/overrides/table before parameterized routes.
*/

router.get(
  '/management/overrides',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.renderOverrideRequestsPage
);

router.get(
  '/management/overrides/table',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.renderOverrideRequestsTable
);

router.post(
  '/management/overrides/:overrideRequestId/approve',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.approveOverrideRequest
);

router.post(
  '/management/overrides/:overrideRequestId/deny',
  requireAuth,
  requireRole(overrideReviewRoles),
  overrideController.denyOverrideRequest
);

/*
  Unit Requests

  One role-aware request area. Regular Tech users see only their own requests;
  Tech Leads, Management users, and Admins review the shared queue.
*/

router.get(
  '/unit-requests',
  requireAuth,
  requireRole(techRoles),
  unitRequestController.renderUnitRequestsPage
);

router.get(
  '/unit-requests/:unitRequestId',
  requireAuth,
  requireRole(techRoles),
  unitRequestController.renderUnitRequestDetail
);

router.post(
  '/unit-requests/:unitRequestId/withdraw',
  requireAuth,
  requireRole(techRoles),
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

  These routes render controlled request modals from Create Unit. They must remain
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
  Tech routes

  Route order note:
  Keep /tech/units/table, /tech/units/lot-form-profile, /tech/units/new/modal, and /tech/units/new
  before parameterized routes like /tech/units/:unitId/edit/modal.
*/

router.get(
  '/tech/units',
  requireAuth,
  requireRole(techRoles),
  techController.renderTechUnitsPage
);

router.get(
  '/tech/units/table',
  requireAuth,
  requireRole(techRoles),
  techController.renderTechUnitsTable
);

router.get(
  '/tech/units/lot-form-profile',
  requireAuth,
  requireRole(techRoles),
  techController.renderLotUnitFormProfile
);

router.get(
  '/tech/units/duplicate-check',
  requireAuth,
  requireRole(techRoles),
  techController.renderEarlySerialDuplicateCheck
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
  '/tech/units/:unitId/history',
  requireAuth,
  requireRole(techHistoryRoles),
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
  '/tech/units/:unitId/outcome-approval/modal',
  requireAuth,
  requireRole(outcomeApprovalRoles),
  techController.renderOutcomeApprovalModal
);

router.post(
  '/tech/units/:unitId/outcome-approval',
  requireAuth,
  requireRole(outcomeApprovalRoles),
  techController.approveOutcomeRequest
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
  requireRole(techRoles),
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