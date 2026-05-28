const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

/*
  Route order note:
  Keep the specific role-dashboard route before the root dashboard route.
  This avoids future conflicts if we add more dashboard-specific routes later.
*/
router.get('/dashboards/:dashboardKey', requireAuth, dashboardController.renderRoleDashboard);

router.get('/', requireAuth, dashboardController.renderDashboardHome);

module.exports = router;