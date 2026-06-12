const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

/*
  Route order note:
  Keep dashboard summary routes before their page routes.
  The root dashboard route stays last because it matches '/'.
*/
router.get('/dashboard/summary', requireAuth, dashboardController.renderDashboardSummary);

router.get('/dashboards/:dashboardKey/summary', requireAuth, dashboardController.renderRoleDashboardSummary);

router.get('/dashboards/:dashboardKey', requireAuth, dashboardController.renderRoleDashboard);

router.get('/', requireAuth, dashboardController.renderDashboardHome);

module.exports = router;
