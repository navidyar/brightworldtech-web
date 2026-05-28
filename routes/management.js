const express = require('express');
const managementController = require('../controllers/managementController');
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
  Tech routes

  Route order note:
  Keep /tech/units/new before /tech/units/:unitId/edit.
  Keep specific routes before parameterized routes.
*/

router.get(
  '/tech/units',
  requireAuth,
  requireRole(techRoles),
  techController.renderTechUnitsPage
);

router.get(
  '/tech/units/new',
  requireAuth,
  requireRole(techRoles),
  techController.renderNewTechUnitPage
);

router.post(
  '/tech/units',
  requireAuth,
  requireRole(techRoles),
  techController.createTechUnit
);

router.get(
  '/tech/units/:unitId/edit',
  requireAuth,
  requireRole(techRoles),
  techController.renderEditTechUnitPage
);

router.post(
  '/tech/units/:unitId',
  requireAuth,
  requireRole(techRoles),
  techController.updateTechUnit
);

module.exports = router;