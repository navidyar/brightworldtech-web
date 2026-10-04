const express = require('express');
const authController = require('../controllers/authController');
const { requireGuest, requireAuth, requirePermission } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/login', requireGuest, authController.renderLogin);
router.post('/login', requireGuest, authController.login);

router.post('/logout', authController.logout);

router.get('/account/tool-pin/modal', requireAuth, requirePermission('users.tool_pin.self_manage'), requirePermission('tools.unit_api.use'), authController.renderOwnToolPinModal);
router.post('/account/tool-pin', requireAuth, requirePermission('users.tool_pin.self_manage'), requirePermission('tools.unit_api.use'), authController.updateOwnToolPin);

router.get('/setup-password', requireGuest, authController.renderSetupPassword);
router.post('/setup-password', requireGuest, authController.setupPassword);

module.exports = router;