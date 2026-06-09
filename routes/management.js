const express = require('express');
const managementController = require('../controllers/managementController');
const overrideController = require('../controllers/overrideController');
const techController = require('../controllers/techController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const managementRoles = ['admin', 'management'];
const techRoles = ['admin', 'management', 'tech_lead', 'tech'];

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

router.post(
  '/management/users/:userId/setup-link',
  requireAuth,
  requireRole(managementRoles),
  managementController.createSetupLinkForExistingUser
);

/*
  Management override routes

  Route order note:
  Keep /management/overrides/table before parameterized routes.
*/

router.get(
  '/management/overrides',
  requireAuth,
  requireRole(managementRoles),
  overrideController.renderOverrideRequestsPage
);

router.get(
  '/management/overrides/table',
  requireAuth,
  requireRole(managementRoles),
  overrideController.renderOverrideRequestsTable
);

router.post(
  '/management/overrides/:overrideRequestId/approve',
  requireAuth,
  requireRole(managementRoles),
  overrideController.approveOverrideRequest
);

router.post(
  '/management/overrides/:overrideRequestId/deny',
  requireAuth,
  requireRole(managementRoles),
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