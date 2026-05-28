const express = require('express');
const lotController = require('../controllers/lotController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/management/lots/new',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.renderNewLotPage
);

router.post(
  '/management/lots/:lotId/requirements',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.createLotRequirement
);

router.get(
  '/management/lots/:lotId',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.renderLotDetailPage
);

router.post(
  '/management/lots',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.createLot
);

router.get(
  '/management/lots',
  requireAuth,
  requireRole(['admin', 'management']),
  lotController.renderLotsPage
);

module.exports = router;