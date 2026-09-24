const express = require('express');
const systemController = require('../controllers/systemController');
const { requireAuth } = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/application/events', requireAuth, systemController.streamApplicationEvents);
router.get('/api/health', systemController.getHealth);

module.exports = router;
