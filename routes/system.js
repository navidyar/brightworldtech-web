const express = require('express');
const systemController = require('../controllers/systemController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/api/health', systemController.getHealth);

router.get('/', requireAuth, systemController.renderHomePage);

module.exports = router;
