const express = require('express');
const configController = require('../controllers/configController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/management/config',
  requireAuth,
  requireRole(['admin']),
  configController.renderConfigPage
);

module.exports = router;