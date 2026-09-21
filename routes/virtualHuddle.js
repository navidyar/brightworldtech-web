'use strict';

const express = require('express');
const virtualHuddleController = require('../controllers/virtualHuddleController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const managementRoles = ['admin', 'management'];
const adminRoles = ['admin'];

/* Recipient delivery / acknowledgment */
router.get('/virtual-huddle/events', requireAuth, virtualHuddleController.streamEvents);
router.get('/virtual-huddle/current', requireAuth, virtualHuddleController.renderCurrentPresentation);
router.get('/virtual-huddle/required', requireAuth, virtualHuddleController.renderRequiredPage);
router.post('/virtual-huddle/recipients/:recipientId/acknowledge', requireAuth, virtualHuddleController.acknowledge);
router.post('/virtual-huddle/recipients/:recipientId/dismiss', requireAuth, virtualHuddleController.dismiss);
router.post('/virtual-huddle/recipients/:recipientId/delete-own', requireAuth, requireRole(adminRoles), virtualHuddleController.deleteOwnOptional);

/* Personal accepted history / Admin optional inbox */
router.get('/my-huddles', requireAuth, virtualHuddleController.renderMyHuddles);
router.get('/my-huddles/accepted/:recipientId', requireAuth, virtualHuddleController.renderAcceptedDetail);
router.get('/my-huddles/inbox/:recipientId/delete/modal', requireAuth, requireRole(adminRoles), virtualHuddleController.renderDeleteOwnOptionalModal);
router.get('/my-huddles/inbox/:recipientId', requireAuth, requireRole(adminRoles), virtualHuddleController.renderAdminInboxDetail);

/* Management+ Virtual Huddle administration */
router.get('/management/virtual-huddle', requireAuth, requireRole(managementRoles), virtualHuddleController.renderManagementPage);
router.get('/management/virtual-huddle/new/modal', requireAuth, requireRole(managementRoles), virtualHuddleController.renderComposeModal);
router.post('/management/virtual-huddle/preview', requireAuth, requireRole(managementRoles), virtualHuddleController.previewCompose);
router.post('/management/virtual-huddle', requireAuth, requireRole(managementRoles), virtualHuddleController.sendHuddle);
router.get('/management/virtual-huddle/:messageId/related/modal', requireAuth, requireRole(managementRoles), virtualHuddleController.renderComposeModal);
router.get('/management/virtual-huddle/:messageId/recipients/:recipientId/revoke/modal', requireAuth, requireRole(managementRoles), virtualHuddleController.renderRevokeModal);
router.post('/management/virtual-huddle/:messageId/recipients/:recipientId/revoke', requireAuth, requireRole(managementRoles), virtualHuddleController.revokeRecipient);
router.get('/management/virtual-huddle/:messageId/revoke-all/modal', requireAuth, requireRole(managementRoles), virtualHuddleController.renderRevokeAllModal);
router.post('/management/virtual-huddle/:messageId/revoke-all', requireAuth, requireRole(managementRoles), virtualHuddleController.revokeAll);
router.get('/management/virtual-huddle/:messageId/delete/modal', requireAuth, requireRole(adminRoles), virtualHuddleController.renderHardDeleteModal);
router.post('/management/virtual-huddle/:messageId/delete', requireAuth, requireRole(adminRoles), virtualHuddleController.hardDeleteMessage);
router.get('/management/virtual-huddle/:messageId', requireAuth, requireRole(managementRoles), virtualHuddleController.renderManagementDetail);

module.exports = router;
