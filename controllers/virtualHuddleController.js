'use strict';

const accessPolicy = require('../config/accessPolicy');
const huddlePolicy = require('../config/virtualHuddlePolicy');
const virtualHuddleModel = require('../models/virtualHuddleModel');
const { isHtmxRequest } = require('../utils/htmxRequest');
const {
  addVirtualHuddleClient,
  publishVirtualHuddleChange,
  writeEvent
} = require('../services/virtualHuddleEvents');

const ROLE_OPTIONS = [
  { code: 'admin', label: 'All Admins' },
  { code: 'management', label: 'All Managers' },
  { code: 'tech_lead', label: 'All Tech Leads' },
  { code: 'qc', label: 'All QC' },
  { code: 'tech', label: 'All Techs' }
];

const MESSAGE_TYPE_OPTIONS = [
  { code: 'notice', label: 'Notice', description: 'Delivery-only message. No acknowledgment or permanent Huddle record is created.' },
  { code: 'standard', label: 'Standard', description: 'Normal operational message requiring acknowledgment.' },
  { code: 'priority', label: 'Priority', description: 'Important message with a burnt-orange severity header.' },
  { code: 'urgent', label: 'Urgent', description: 'Immediate message with a dark-red severity header.' }
];

function asArray(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

function normalizeId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function wantsJson(req) {
  return String(req.get('Accept') || '').includes('application/json');
}

function currentPrimaryRole(req) {
  return accessPolicy.getPrimaryRole(req.currentUser?.roles || []);
}

function isAdmin(req) {
  return currentPrimaryRole(req) === 'admin';
}

function hasPermission(req, permissionKey) {
  return req.currentPermissions instanceof Set && req.currentPermissions.has(permissionKey);
}

function messageTypeLabel(code) {
  return MESSAGE_TYPE_OPTIONS.find((option) => option.code === code)?.label || code || 'Message';
}

function getComposeFormData(source = {}) {
  return {
    messageTypeCode: String(source.messageTypeCode || 'standard').trim().toLowerCase(),
    subject: String(source.subject || '').trim(),
    messageBody: String(source.messageBody || '').trim(),
    targetRoleCodes: asArray(source.targetRoleCodes).map(String),
    targetUserIds: asArray(source.targetUserIds).map((value) => String(value)),
    parentMessageId: normalizeId(source.parentMessageId)
  };
}

function validateCompose(formData) {
  const errors = [];
  if (!huddlePolicy.HUDDLE_MESSAGE_TYPE_CODES.includes(formData.messageTypeCode)) {
    errors.push('Choose a valid message type.');
  }
  if (!formData.subject) errors.push('Subject is required.');
  if (formData.subject.length > 255) errors.push('Subject cannot exceed 255 characters.');
  if (!formData.messageBody) errors.push('Message is required.');
  if (formData.messageBody.length > 12000) errors.push('Message cannot exceed 12,000 characters.');
  if (formData.targetRoleCodes.length === 0 && formData.targetUserIds.length === 0) {
    errors.push('Select at least one role or individual recipient.');
  }
  return errors;
}

async function getComposeCandidates(req) {
  const users = await virtualHuddleModel.listActiveUsers();
  return users.filter((user) => Number(user.user_id) !== Number(req.currentUser.user_id));
}

async function getParentContext(parentMessageId) {
  if (!parentMessageId) return null;
  const detail = await virtualHuddleModel.getManagementMessageDetail(parentMessageId);
  return detail?.message || null;
}

function redirectHtmxAware(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.status(204).send('');
  }
  return res.redirect(url);
}

async function renderManagementPage(req, res, next) {
  try {
    const history = await virtualHuddleModel.listManagementHistory({
      page: req.query.page,
      status: req.query.status,
      messageType: req.query.messageType,
      search: req.query.search,
      sort: req.query.sort
    });
    return res.render('pages/management-virtual-huddle', {
      pageTitle: 'Virtual Huddle',
      currentNav: 'management-virtual-huddle',
      ...history,
      canSendHuddles: hasPermission(req, 'huddle.send'),
      openHuddleMessageId: normalizeId(req.query.openHuddle),
      messageTypeLabel,
      successMessage: req.query.sent === '1'
        ? 'Virtual Huddle sent.'
        : req.query.notice_sent === '1'
          ? 'Notice sent. Notices are delivery-only and are not kept in Huddle history.'
          : req.query.revoked === '1'
          ? 'Awaiting acknowledgment revoked.'
          : req.query.deleted === '1'
            ? 'Virtual Huddle permanently deleted.'
            : null,
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function renderComposeModal(req, res, next) {
  try {
    const formData = getComposeFormData({ parentMessageId: req.params.messageId || req.query.parentMessageId });
    let parentMessage = null;
    if (formData.parentMessageId) {
      parentMessage = await getParentContext(formData.parentMessageId);
      if (!parentMessage) return res.status(404).send('Related Virtual Huddle not found.');
      const selection = await virtualHuddleModel.getTargetSelection(formData.parentMessageId);
      formData.targetRoleCodes = selection.roleCodes;
      formData.targetUserIds = selection.userIds.map(String);
      formData.subject = `Follow-up: ${parentMessage.subject}`.slice(0, 255);
    }

    return res.render('fragments/virtual-huddle-compose-modal', {
      roleOptions: ROLE_OPTIONS,
      messageTypeOptions: MESSAGE_TYPE_OPTIONS,
      users: await getComposeCandidates(req),
      formData,
      parentMessage,
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function previewCompose(req, res, next) {
  const formData = getComposeFormData(req.body);
  const errors = validateCompose(formData);
  try {
    const users = await getComposeCandidates(req);
    const parentMessage = await getParentContext(formData.parentMessageId);
    if (formData.parentMessageId && !parentMessage) errors.push('The related Virtual Huddle no longer exists.');

    let audience = null;
    if (errors.length === 0) {
      try {
        audience = await virtualHuddleModel.previewAudience({
          senderUserId: req.currentUser.user_id,
          senderRoleCodes: req.currentUser.roles,
          targetRoleCodes: formData.targetRoleCodes,
          targetUserIds: formData.targetUserIds,
          messageTypeCode: formData.messageTypeCode
        });
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      return res.status(422).render('fragments/virtual-huddle-compose-modal', {
        roleOptions: ROLE_OPTIONS,
        messageTypeOptions: MESSAGE_TYPE_OPTIONS,
        users,
        formData,
        parentMessage,
        errorMessages: errors
      });
    }

    return res.render('fragments/virtual-huddle-preview-modal', {
      formData,
      audience,
      parentMessage,
      confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
      messageTypeLabel
    });
  } catch (error) {
    return next(error);
  }
}

async function sendHuddle(req, res, next) {
  const formData = getComposeFormData(req.body);
  const errors = validateCompose(formData);
  if (errors.length > 0) {
    return res.status(422).send(errors.join(' '));
  }

  try {
    const result = await virtualHuddleModel.createVirtualHuddle({
      senderUser: req.currentUser,
      messageTypeCode: formData.messageTypeCode,
      subject: formData.subject,
      messageBody: formData.messageBody,
      targetRoleCodes: formData.targetRoleCodes,
      targetUserIds: formData.targetUserIds,
      parentMessageId: formData.parentMessageId
    });

    publishVirtualHuddleChange(result.recipientUserIds, 'sent');
    const destination = formData.messageTypeCode === 'notice'
      ? '/management/virtual-huddle?notice_sent=1'
      : `/management/virtual-huddle/${result.messageId}?sent=1`;
    return redirectHtmxAware(req, res, destination);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      try {
        return res.status(422).render('fragments/virtual-huddle-compose-modal', {
          roleOptions: ROLE_OPTIONS,
          messageTypeOptions: MESSAGE_TYPE_OPTIONS,
          users: await getComposeCandidates(req),
          formData,
          parentMessage: await getParentContext(formData.parentMessageId),
          errorMessages: [error.message]
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
}

async function renderManagementDetail(req, res) {
  const messageId = normalizeId(req.params.messageId);
  return res.redirect(messageId
    ? `/management/virtual-huddle?openHuddle=${encodeURIComponent(messageId)}`
    : '/management/virtual-huddle');
}

async function renderManagementDetailModalContent(req, res, messageId, { successMessage = null, statusCode = 200 } = {}) {
  const detail = await virtualHuddleModel.getManagementMessageDetail(messageId);
  if (!detail) return res.status(404).send('Virtual Huddle not found.');

  return res.status(statusCode).render('fragments/virtual-huddle-detail-modal', {
    ...detail,
    canSendHuddles: hasPermission(req, 'huddle.send'),
    canAddRecipients: hasPermission(req, 'huddle.recipients.add'),
    canRevokeRecipients: hasPermission(req, 'huddle.recipients.revoke'),
    canRequireRecipients: hasPermission(req, 'huddle.recipients.require'),
    canDeleteMessages: isAdmin(req) && hasPermission(req, 'huddle.messages.delete'),
    confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
    messageTypeLabel,
    successMessage
  });
}

async function renderManagementDetailModal(req, res, next) {
  try {
    return await renderManagementDetailModalContent(req, res, req.params.messageId);
  } catch (error) {
    return next(error);
  }
}

async function renderManagementRecipientStatus(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) return res.status(404).send('Virtual Huddle not found.');
    return res.render('fragments/virtual-huddle-recipient-status', {
      message: detail.message,
      recipients: detail.recipients,
      canRevokeRecipients: hasPermission(req, 'huddle.recipients.revoke'),
      canRequireRecipients: hasPermission(req, 'huddle.recipients.require')
    });
  } catch (error) {
    return next(error);
  }
}

async function getAddRecipientCandidates(detail) {
  const users = await virtualHuddleModel.listActiveUsers();
  const existingUserIds = new Set((detail?.recipients || []).map((recipient) => normalizeId(recipient.user_id)).filter(Boolean));
  const senderUserId = normalizeId(detail?.message?.sent_by_user_id);
  return users.filter((user) => Number(user.user_id) !== senderUserId && !existingUserIds.has(Number(user.user_id)));
}

async function renderAddRecipientsModal(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) return res.status(404).send('Virtual Huddle not found.');
    const users = await getAddRecipientCandidates(detail);
    return res.render('fragments/virtual-huddle-add-recipients-modal', {
      message: detail.message,
      users,
      selectedUserIds: [],
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function addRecipients(req, res, next) {
  const selectedUserIds = asArray(req.body.targetUserIds).map((value) => String(value));
  try {
    const result = await virtualHuddleModel.addRecipients({
      messageId: req.params.messageId,
      userIds: selectedUserIds
    });
    publishVirtualHuddleChange(result.userIds, 'recipient-added');
    if (isHtmxRequest(req)) {
      return await renderManagementDetailModalContent(req, res, req.params.messageId, {
        successMessage: `${result.count} recipient${result.count === 1 ? '' : 's'} added to this Huddle.`
      });
    }
    return res.redirect(`/management/virtual-huddle?openHuddle=${encodeURIComponent(req.params.messageId)}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      try {
        const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
        if (!detail) return res.status(404).send('Virtual Huddle not found.');
        const users = await getAddRecipientCandidates(detail);
        return res.status(422).render('fragments/virtual-huddle-add-recipients-modal', {
          message: detail.message,
          users,
          selectedUserIds,
          errorMessages: [error.message]
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    return next(error);
  }
}

async function renderRevokeModal(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) return res.status(404).send('Virtual Huddle not found.');
    const recipient = detail.recipients.find(
      (item) => Number(item.virtual_huddle_recipient_id) === Number(req.params.recipientId)
    );
    if (!recipient) return res.status(404).send('Recipient not found.');
    if (!huddlePolicy.canRevokeRecipient({
      acknowledgmentMode: recipient.acknowledgment_mode_code,
      recipientStateCode: recipient.recipient_state_code
    })) {
      return res.status(409).send('This recipient is no longer awaiting confirmation.');
    }

    return res.render('fragments/virtual-huddle-revoke-modal', {
      message: detail.message,
      recipient,
      revokeAll: false,
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function revokeRecipient(req, res, next) {
  try {
    const result = await virtualHuddleModel.revokeRecipient({
      messageId: req.params.messageId,
      recipientId: req.params.recipientId,
      actorUserId: req.currentUser.user_id,
      reason: req.body.reason
    });
    if (result.userId) publishVirtualHuddleChange([result.userId], 'revoked');
    if (isHtmxRequest(req)) {
      return await renderManagementDetailModalContent(req, res, req.params.messageId, {
        successMessage: 'Recipient acknowledgment requirement revoked.'
      });
    }
    return res.redirect(`/management/virtual-huddle?openHuddle=${encodeURIComponent(req.params.messageId)}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      return res.status(422).send(error.message);
    }
    return next(error);
  }
}

async function requireRecipientAgain(req, res, next) {
  try {
    const result = await virtualHuddleModel.requireRecipientAgain({
      messageId: req.params.messageId,
      recipientId: req.params.recipientId
    });
    if (result.userId) publishVirtualHuddleChange([result.userId], 'required-again');
    if (isHtmxRequest(req)) {
      return await renderManagementDetailModalContent(req, res, req.params.messageId, {
        successMessage: 'Recipient acknowledgment is required again.'
      });
    }
    return res.redirect(`/management/virtual-huddle?openHuddle=${encodeURIComponent(req.params.messageId)}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      return res.status(422).send(error.message);
    }
    return next(error);
  }
}

async function renderRevokeAllModal(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) return res.status(404).send('Virtual Huddle not found.');
    const awaitingCount = detail.recipients.filter(
      (recipient) => recipient.acknowledgment_mode_code === 'required_ack'
        && recipient.recipient_state_code === 'awaiting_confirmation'
    ).length;
    if (awaitingCount === 0) return res.status(409).send('No recipients are awaiting confirmation.');

    return res.render('fragments/virtual-huddle-revoke-modal', {
      message: detail.message,
      recipient: null,
      revokeAll: true,
      awaitingCount,
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function revokeAll(req, res, next) {
  try {
    const result = await virtualHuddleModel.revokeAllAwaiting({
      messageId: req.params.messageId,
      actorUserId: req.currentUser.user_id,
      reason: req.body.reason
    });
    publishVirtualHuddleChange(result.userIds, 'revoked');
    if (isHtmxRequest(req)) {
      return await renderManagementDetailModalContent(req, res, req.params.messageId, {
        successMessage: 'All remaining acknowledgment requirements were revoked.'
      });
    }
    return res.redirect(`/management/virtual-huddle?openHuddle=${encodeURIComponent(req.params.messageId)}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      return res.status(422).send(error.message);
    }
    return next(error);
  }
}

async function renderHardDeleteModal(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) return res.status(404).send('Virtual Huddle not found.');
    return res.render('fragments/virtual-huddle-delete-modal', { message: detail.message });
  } catch (error) {
    return next(error);
  }
}

async function hardDeleteMessage(req, res, next) {
  try {
    const result = await virtualHuddleModel.hardDeleteMessage(req.params.messageId);
    if (!result) return res.status(404).send('Virtual Huddle not found.');
    publishVirtualHuddleChange(result.userIds, 'deleted');
    return redirectHtmxAware(req, res, '/management/virtual-huddle?deleted=1');
  } catch (error) {
    return next(error);
  }
}

async function streamEvents(req, res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  writeEvent(res, 'virtual-huddle-ready', {});
  const cleanup = addVirtualHuddleClient(req.currentUser.user_id, res);
  req.on('close', cleanup);
}

async function renderCurrentPresentation(req, res, next) {
  try {
    const presentation = await virtualHuddleModel.getNextPresentation(req.currentUser.user_id);
    if (!presentation) return res.status(204).send('');
    return res.render('fragments/virtual-huddle-recipient-dialog', {
      presentation,
      confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
      messageTypeLabel
    });
  } catch (error) {
    return next(error);
  }
}

async function renderRequiredPage(req, res, next) {
  try {
    const hasPending = await virtualHuddleModel.hasPendingRequiredAcknowledgment(req.currentUser.user_id);
    if (!hasPending) return res.redirect('/');
    const presentation = await virtualHuddleModel.getNextPresentation(req.currentUser.user_id);
    return res.render('pages/virtual-huddle-required', {
      pageTitle: 'Virtual Huddle',
      presentation,
      confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
      messageTypeLabel
    });
  } catch (error) {
    return next(error);
  }
}

async function acknowledge(req, res, next) {
  try {
    const result = await virtualHuddleModel.acknowledgeRecipient({
      recipientId: req.params.recipientId,
      userId: req.currentUser.user_id,
      confirmationPhrase: req.body.confirmationPhrase,
      note: req.body.note
    });
    publishVirtualHuddleChange([req.currentUser.user_id], 'acknowledged');
    if (wantsJson(req)) return res.json({ ok: true, recipientId: result.recipientId });
    if (isHtmxRequest(req) && hasPermission(req, 'huddle.personal.view')) {
      res.set('HX-Trigger', JSON.stringify({ huddlePersonalAcknowledged: { recipientId: result.recipientId } }));
      return await renderPersonalDetailModalContent(req, res, result.recipientId, {
        successMessage: 'Virtual Huddle acknowledged and saved to your history.'
      });
    }
    return res.redirect(`/my-huddles/accepted/${result.recipientId}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      if (wantsJson(req)) return res.status(422).json({ ok: false, error: error.message });
      if (isHtmxRequest(req) && hasPermission(req, 'huddle.personal.view')) {
        const recipient = await virtualHuddleModel.getPersonalRecipientDetail(
          req.params.recipientId,
          req.currentUser.user_id
        );
        if (recipient) {
          return res.status(422).render('fragments/virtual-huddle-personal-detail-modal', {
            recipient,
            isAdminUser: isAdmin(req),
            confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
            messageTypeLabel,
            successMessage: null,
            errorMessages: [error.message]
          });
        }
      }
      if (isAdmin(req)) {
        const recipient = await virtualHuddleModel.getAdminOptionalInboxDetail(
          req.params.recipientId,
          req.currentUser.user_id
        );
        if (recipient) {
          return res.status(422).render('pages/my-huddle-admin-inbox-detail', {
            pageTitle: 'Admin Huddle Inbox',
            currentNav: 'my-huddles',
            recipient,
            confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
            messageTypeLabel,
            errorMessages: [error.message]
          });
        }
      }
      return res.status(422).send(error.message);
    }
    return next(error);
  }
}

async function dismiss(req, res, next) {
  try {
    const result = await virtualHuddleModel.dismissRecipient({
      recipientId: req.params.recipientId,
      userId: req.currentUser.user_id
    });
    publishVirtualHuddleChange([req.currentUser.user_id], 'dismissed');
    return res.json({ ok: true, ephemeralNotice: Boolean(result.ephemeralNotice) });
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      return res.status(422).json({ ok: false, error: error.message });
    }
    return next(error);
  }
}

async function renderMyHuddles(req, res, next) {
  try {
    const history = await virtualHuddleModel.listPersonalHistory(req.currentUser.user_id, {
      page: req.query.page,
      status: req.query.status,
      messageType: req.query.messageType,
      search: req.query.search,
      sort: req.query.sort
    });
    return res.render('pages/my-huddles', {
      pageTitle: 'My Huddles',
      currentNav: 'my-huddles',
      ...history,
      isAdminUser: isAdmin(req),
      openHuddleRecipientId: normalizeId(req.query.openHuddle),
      messageTypeLabel,
      successMessage: req.query.deleted === '1'
        ? 'Admin inbox copy deleted.'
        : req.query.acknowledged === '1'
          ? 'Virtual Huddle acknowledged and saved to your history.'
          : null
    });
  } catch (error) {
    return next(error);
  }
}

async function renderPersonalDetailModalContent(req, res, recipientId, {
  successMessage = null,
  errorMessages = [],
  statusCode = 200
} = {}) {
  const recipient = await virtualHuddleModel.getPersonalRecipientDetail(
    recipientId,
    req.currentUser.user_id
  );
  if (!recipient) return res.status(404).send('Huddle record not found.');
  if (recipient.acknowledgment_mode_code === 'optional_ack' && !isAdmin(req)) {
    return res.status(403).send('Admin access is required for this optional Huddle record.');
  }
  return res.status(statusCode).render('fragments/virtual-huddle-personal-detail-modal', {
    recipient,
    isAdminUser: isAdmin(req),
    confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
    messageTypeLabel,
    successMessage,
    errorMessages
  });
}

async function renderPersonalDetailModal(req, res, next) {
  try {
    return await renderPersonalDetailModalContent(req, res, req.params.recipientId);
  } catch (error) {
    return next(error);
  }
}

async function renderAcceptedDetail(req, res, next) {
  try {
    const recipient = await virtualHuddleModel.getAcknowledgedRecipientDetail(
      req.params.recipientId,
      req.currentUser.user_id
    );
    if (!recipient) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Huddle Record Not Found',
        requestedPath: req.originalUrl
      });
    }
    return res.render('pages/my-huddle-detail', {
      pageTitle: 'My Huddle Record',
      currentNav: 'my-huddles',
      recipient,
      messageTypeLabel
    });
  } catch (error) {
    return next(error);
  }
}

async function renderAdminInboxDetail(req, res, next) {
  try {
    if (!isAdmin(req)) {
      return res.status(403).render('pages/error', {
        pageTitle: 'Access Denied',
        message: 'Admin access is required for this inbox item.',
        error: null
      });
    }
    const recipient = await virtualHuddleModel.getAdminOptionalInboxDetail(
      req.params.recipientId,
      req.currentUser.user_id
    );
    if (!recipient) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Huddle Inbox Item Not Found',
        requestedPath: req.originalUrl
      });
    }
    return res.render('pages/my-huddle-admin-inbox-detail', {
      pageTitle: 'Admin Huddle Inbox',
      currentNav: 'my-huddles',
      recipient,
      confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
      messageTypeLabel,
      errorMessages: []
    });
  } catch (error) {
    return next(error);
  }
}

async function renderDeleteOwnOptionalModal(req, res, next) {
  try {
    if (!isAdmin(req)) return res.status(403).send('Admin access is required.');
    const recipient = await virtualHuddleModel.getAdminOptionalInboxDetail(
      req.params.recipientId,
      req.currentUser.user_id
    );
    if (!recipient) return res.status(404).send('Admin inbox item not found.');
    return res.render('fragments/virtual-huddle-delete-own-modal', { recipient });
  } catch (error) {
    return next(error);
  }
}

async function deleteOwnOptional(req, res, next) {
  try {
    if (!isAdmin(req)) {
      return res.status(403).send('Admin access is required.');
    }
    await virtualHuddleModel.deleteOwnOptionalRecipient({
      recipientId: req.params.recipientId,
      userId: req.currentUser.user_id,
      actorRoleCodes: req.currentUser.roles
    });
    publishVirtualHuddleChange([req.currentUser.user_id], 'recipient-deleted');
    return res.redirect('/my-huddles?deleted=1');
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) return res.status(422).send(error.message);
    return next(error);
  }
}

module.exports = {
  acknowledge,
  addRecipients,
  deleteOwnOptional,
  dismiss,
  hardDeleteMessage,
  previewCompose,
  renderAcceptedDetail,
  renderAddRecipientsModal,
  renderAdminInboxDetail,
  renderComposeModal,
  renderCurrentPresentation,
  renderDeleteOwnOptionalModal,
  renderHardDeleteModal,
  renderManagementDetail,
  renderManagementDetailModal,
  renderPersonalDetailModal,
  renderManagementRecipientStatus,
  renderManagementPage,
  renderMyHuddles,
  renderRequiredPage,
  renderRevokeAllModal,
  renderRevokeModal,
  requireRecipientAgain,
  revokeAll,
  revokeRecipient,
  sendHuddle,
  streamEvents
};
