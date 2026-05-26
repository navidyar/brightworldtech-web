const express = require('express');
const managementController = require('../controllers/managementController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/management/users',
  requireAuth,
  requireRole(['admin', 'management']),
  managementController.renderUsersPage
);

router.get(
  '/management/users/new',
  requireAuth,
  requireRole(['admin', 'management']),
  managementController.renderNewUserPage
);

router.post(
  '/management/users',
  requireAuth,
  requireRole(['admin', 'management']),
  managementController.createUser
);

router.post(
  '/management/users/:userId/setup-link',
  requireAuth,
  requireRole(['admin', 'management']),
  managementController.createSetupLinkForExistingUser
);

module.exports = router;