const express = require('express');
const managementController = require('../controllers/managementController');
const overrideController = require('../controllers/overrideController');
const techController = require('../controllers/techController');
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
  Tech routes

  Route order note:
  Keep /tech/units/table, /tech/units/new/modal, and /tech/units/new
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
  requireRole(techRoles),
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