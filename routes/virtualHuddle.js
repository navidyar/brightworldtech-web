'use strict';

const express = require('express');
const virtualHuddleController = require('../controllers/virtualHuddleController');
const { requireAuth, requirePermission, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
// Optional Admin inbox records and permanent deletion retain their Admin boundary.
const adminRoles = ['admin'];

/* Recipient delivery / acknowledgment */
router.get('/virtual-huddle/events', requireAuth, virtualHuddleController.streamEvents);
router.get('/virtual-huddle/current', requireAuth, virtualHuddleController.renderCurrentPresentation);
router.get('/virtual-huddle/required', requireAuth, virtualHuddleController.renderRequiredPage);
router.post('/virtual-huddle/recipients/:recipientId/acknowledge', requireAuth, virtualHuddleController.acknowledge);
router.post('/virtual-huddle/recipients/:recipientId/dismiss', requireAuth, virtualHuddleController.dismiss);
router.post('/virtual-huddle/recipients/:recipientId/delete-own', requireAuth, requirePermission('huddle.personal.view'), requireRole(adminRoles), virtualHuddleController.deleteOwnOptional);

/* Personal accepted history / Admin optional inbox */
router.get('/my-huddles', requireAuth, requirePermission('huddle.personal.view'), virtualHuddleController.renderMyHuddles);
router.get('/my-huddles/:recipientId/modal', requireAuth, requirePermission('huddle.personal.view'), virtualHuddleController.renderPersonalDetailModal);
router.get('/my-huddles/accepted/:recipientId', requireAuth, requirePermission('huddle.personal.view'), virtualHuddleController.renderAcceptedDetail);
router.get('/my-huddles/inbox/:recipientId/delete/modal', requireAuth, requirePermission('huddle.personal.view'), requireRole(adminRoles), virtualHuddleController.renderDeleteOwnOptionalModal);
router.get('/my-huddles/inbox/:recipientId', requireAuth, requirePermission('huddle.personal.view'), requireRole(adminRoles), virtualHuddleController.renderAdminInboxDetail);

/* Management+ Virtual Huddle administration */
router.use('/management/virtual-huddle', requireAuth, requirePermission('huddle.administration.view'));
router.get('/management/virtual-huddle', virtualHuddleController.renderManagementPage);
router.get('/management/virtual-huddle/new/modal', requirePermission('huddle.send'), virtualHuddleController.renderComposeModal);
router.post('/management/virtual-huddle/preview', requirePermission('huddle.send'), virtualHuddleController.previewCompose);
router.post('/management/virtual-huddle', requirePermission('huddle.send'), virtualHuddleController.sendHuddle);
router.get('/management/virtual-huddle/:messageId/related/modal', requirePermission('huddle.send'), virtualHuddleController.renderComposeModal);
router.get('/management/virtual-huddle/:messageId/recipients/add/modal', requirePermission('huddle.recipients.add'), virtualHuddleController.renderAddRecipientsModal);
router.post('/management/virtual-huddle/:messageId/recipients/add', requirePermission('huddle.recipients.add'), virtualHuddleController.addRecipients);
router.get('/management/virtual-huddle/:messageId/recipients/:recipientId/revoke/modal', requirePermission('huddle.recipients.revoke'), virtualHuddleController.renderRevokeModal);
router.post('/management/virtual-huddle/:messageId/recipients/:recipientId/revoke', requirePermission('huddle.recipients.revoke'), virtualHuddleController.revokeRecipient);
router.post('/management/virtual-huddle/:messageId/recipients/:recipientId/require-again', requirePermission('huddle.recipients.require'), virtualHuddleController.requireRecipientAgain);
router.get('/management/virtual-huddle/:messageId/revoke-all/modal', requirePermission('huddle.recipients.revoke'), virtualHuddleController.renderRevokeAllModal);
router.post('/management/virtual-huddle/:messageId/revoke-all', requirePermission('huddle.recipients.revoke'), virtualHuddleController.revokeAll);
router.get('/management/virtual-huddle/:messageId/delete/modal', requirePermission('huddle.messages.delete'), requireRole(adminRoles), virtualHuddleController.renderHardDeleteModal);
router.post('/management/virtual-huddle/:messageId/delete', requirePermission('huddle.messages.delete'), requireRole(adminRoles), virtualHuddleController.hardDeleteMessage);
router.get('/management/virtual-huddle/:messageId/status', virtualHuddleController.renderManagementRecipientStatus);
router.get('/management/virtual-huddle/:messageId/modal', virtualHuddleController.renderManagementDetailModal);
router.get('/management/virtual-huddle/:messageId', virtualHuddleController.renderManagementDetail);

module.exports = router;
