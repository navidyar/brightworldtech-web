const express = require('express');
const lotController = require('../controllers/lotController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/management/lots',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.renderLotsPage
);

module.exports = router;