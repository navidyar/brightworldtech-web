const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireDashboardAccess } = require('../middleware/accessMiddleware');

const router = express.Router();

router.get(
  '/dashboards/:dashboardKey',
  requireAuth,
  requireDashboardAccess,
  dashboardController.renderRoleDashboard
);

module.exports = router;