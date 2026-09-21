'use strict';

const accessPolicy = require('../config/accessPolicy');
const huddlePolicy = require('../config/virtualHuddlePolicy');
const virtualHuddleModel = require('../models/virtualHuddleModel');
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
  { code: 'notice', label: 'Notice', description: 'Informational message. No acknowledgment is required.' },
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

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
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
    const history = await virtualHuddleModel.listManagementHistory({ page: req.query.page });
    return res.render('pages/management-virtual-huddle', {
      pageTitle: 'Virtual Huddle',
      currentNav: 'management-virtual-huddle',
      ...history,
      isAdminUser: isAdmin(req),
      messageTypeLabel,
      successMessage: req.query.sent === '1'
        ? 'Virtual Huddle sent.'
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
    return redirectHtmxAware(req, res, `/management/virtual-huddle/${result.messageId}?sent=1`);
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

async function renderManagementDetail(req, res, next) {
  try {
    const detail = await virtualHuddleModel.getManagementMessageDetail(req.params.messageId);
    if (!detail) {
      return res.status(404).render('pages/not-found', {
        pageTitle: 'Virtual Huddle Not Found',
        requestedPath: req.originalUrl
      });
    }

    return res.render('pages/management-virtual-huddle-detail', {
      pageTitle: 'Virtual Huddle Detail',
      currentNav: 'management-virtual-huddle',
      ...detail,
      isAdminUser: isAdmin(req),
      confirmationPhrase: huddlePolicy.HUDDLE_CONFIRMATION_PHRASE,
      messageTypeLabel,
      successMessage: req.query.sent === '1'
        ? 'Virtual Huddle sent.'
        : req.query.revoked === '1'
          ? 'Recipient acknowledgment requirement revoked.'
          : req.query.revoked_all === '1'
            ? 'All remaining acknowledgment requirements were revoked.'
            : null
    });
  } catch (error) {
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
    return redirectHtmxAware(req, res, `/management/virtual-huddle/${req.params.messageId}?revoked=1`);
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
    return redirectHtmxAware(req, res, `/management/virtual-huddle/${req.params.messageId}?revoked_all=1`);
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
    return res.redirect(`/my-huddles/accepted/${result.recipientId}`);
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      if (wantsJson(req)) return res.status(422).json({ ok: false, error: error.message });
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
    await virtualHuddleModel.dismissRecipient({
      recipientId: req.params.recipientId,
      userId: req.currentUser.user_id
    });
    publishVirtualHuddleChange([req.currentUser.user_id], 'dismissed');
    return res.json({ ok: true });
  } catch (error) {
    if (String(error.code || '').startsWith('HUDDLE_')) {
      return res.status(422).json({ ok: false, error: error.message });
    }
    return next(error);
  }
}

async function renderMyHuddles(req, res, next) {
  try {
    const accepted = await virtualHuddleModel.listAcknowledgedHistory(req.currentUser.user_id);
    const adminInbox = isAdmin(req)
      ? await virtualHuddleModel.listAdminOptionalInbox(req.currentUser.user_id)
      : [];
    return res.render('pages/my-huddles', {
      pageTitle: 'My Huddles',
      currentNav: 'my-huddles',
      accepted,
      adminInbox,
      isAdminUser: isAdmin(req),
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
  deleteOwnOptional,
  dismiss,
  hardDeleteMessage,
  previewCompose,
  renderAcceptedDetail,
  renderAdminInboxDetail,
  renderComposeModal,
  renderCurrentPresentation,
  renderDeleteOwnOptionalModal,
  renderHardDeleteModal,
  renderManagementDetail,
  renderManagementPage,
  renderMyHuddles,
  renderRequiredPage,
  renderRevokeAllModal,
  renderRevokeModal,
  revokeAll,
  revokeRecipient,
  sendHuddle,
  streamEvents
};
