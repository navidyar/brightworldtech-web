const express = require('express');
const authController = require('../controllers/authController');
const { requireGuest } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/login', requireGuest, authController.renderLogin);
router.post('/login', requireGuest, authController.login);

router.post('/logout', authController.logout);

router.get('/setup-password', requireGuest, authController.renderSetupPassword);
router.post('/setup-password', requireGuest, authController.setupPassword);

module.exports = router;