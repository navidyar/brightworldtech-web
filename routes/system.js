const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/', systemController.renderHomePage);
router.get('/database', systemController.renderDatabasePage);
router.get('/api/health', systemController.getHealth);

module.exports = router;