const express = require('express');
const systemController = require('../controllers/systemController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/api/health', systemController.getHealth);

router.get('/', requireAuth, systemController.renderHomePage);

router.get(
  '/database',
  requireAuth,
  requireRole(['admin', 'management']),
  systemController.renderDatabasePage
);

module.exports = router;