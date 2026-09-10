'use strict';

const labelPrinterModel = require('../models/labelPrinterModel');
const managementModel = require('../models/managementModel');
const {
  streamPrinterRegistryEvents,
  broadcastPrinterRegistryChange
} = require('../services/labelPrinterRegistryEvents');
const {
  LABEL_PRINTER_PROTOCOLS,
  LabelPrinterInputError,
  normalizePrinterInput,
  canEditSoloPrinter,
  isTechLeadPlus,
  probePrinterHost
} = require('../services/labelPrinterPolicy');

function isHtmxRequest(req) {
  return String(req.get('HX-Request') || '').toLowerCase() === 'true';
}

function notice(query = {}) {
  if (query.created === '1') return 'Printer added.';
  if (query.updated === '1') return 'Printer updated.';
  if (query.deleted === '1') return 'Printer removed. Historical print snapshots remain intact.';
  if (query.sharingUpdated === '1') return 'Solo printer sharing updated.';
  if (query.groupCreated === '1') return 'Printer group created.';
  if (query.groupUpdated === '1') return 'Printer group membership updated.';
  if (query.groupDeleted === '1') return 'Printer group deleted.';
  return null;
}

function ownerLabel(printer) {
  const full = `${printer.owner_first_name || ''} ${printer.owner_last_name || ''}`.trim();
  return full || printer.owner_username || (printer.owner_user_id ? `User ${printer.owner_user_id}` : '—');
}

async function getManagementPageData() {
  const [printers, groups] = await Promise.all([
    labelPrinterModel.listPrinters({ includeDisabled: true }),
    labelPrinterModel.listGroups()
  ]);
  return {
    printers: printers.map((printer) => ({ ...printer, ownerLabel: ownerLabel(printer) })),
    groups
  };
}

async function getTechPageData(req) {
  const [ownedPrinters, availablePrinters] = await Promise.all([
    labelPrinterModel.listOwnedSoloPrinters(req.currentUser.user_id),
    labelPrinterModel.listAvailablePrintersForUser({
      userId: req.currentUser.user_id,
      roleCodes: req.currentUser.roles
    })
  ]);
  return {
    ownedPrinters,
    availablePrinters,
    showNetworkDetails: isTechLeadPlus(req.currentUser.roles)
  };
}

async function renderManagementLive(res, { successMessage = null, errorMessages = [], oob = true } = {}) {
  const data = await getManagementPageData();
  return res.render('fragments/management-printers-live', {
    ...data,
    successMessage,
    errorMessages,
    oob
  });
}

async function renderTechLive(req, res, { successMessage = null, errorMessages = [], oob = true } = {}) {
  const data = await getTechPageData(req);
  return res.render('fragments/tech-printers-live', {
    ...data,
    successMessage,
    errorMessages,
    oob
  });
}

async function respondAfterMutation(req, res, { management, successMessage, redirectUrl }) {
  broadcastPrinterRegistryChange();
  if (isHtmxRequest(req)) {
    res.set('HX-Trigger-After-Swap', JSON.stringify({
      'label-printer-registry-changed': { message: successMessage }
    }));
    return res.status(200).send('');
  }
  return res.redirect(redirectUrl);
}

function requestedLiveMessage(req) {
  return String(req.query.message || '').trim().slice(0, 240) || null;
}

async function renderManagementPrintersLive(req, res, next) {
  try {
    return renderManagementLive(res, { successMessage: requestedLiveMessage(req), oob: false });
  } catch (error) { next(error); }
}

async function renderTechPrintersLive(req, res, next) {
  try {
    return renderTechLive(req, res, { successMessage: requestedLiveMessage(req), oob: false });
  } catch (error) { next(error); }
}

async function renderManagementPrintersPage(req, res, next) {
  try {
    const data = await getManagementPageData();
    return res.render('pages/management-printers', {
      pageTitle: 'Label Printers',
      currentNav: 'management-printers',
      ...data,
      successMessage: notice(req.query),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderMyPrintersPage(req, res, next) {
  try {
    const data = await getTechPageData(req);
    return res.render('pages/tech-printers', {
      pageTitle: 'My Label Printers',
      currentNav: 'tech-printers',
      ...data,
      successMessage: notice(req.query),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

function defaultFormData(printer = null, scope = 'solo') {
  return {
    displayName: printer?.display_name || '',
    locationLabel: printer?.location_label || '',
    hostAddress: printer?.host_address || '',
    protocolCode: printer?.protocol_code || 'raw_9100',
    port: printer?.port || 9100,
    cupsQueueName: printer?.cups_queue_name || '',
    manufacturer: printer?.manufacturer || '',
    model: printer?.model || '',
    detectedDescription: printer?.detected_description || '',
    printerProfileCode: printer?.printer_profile_code || '',
    mediaCode: printer?.media_code || '',
    dpi: printer?.dpi || '',
    isShared: scope === 'managed' ? true : Number(printer?.is_shared || 0) === 1,
    isEnabled: printer ? Number(printer.is_enabled) === 1 : true
  };
}

function renderPrinterForm(res, {
  printer = null,
  scope = 'solo',
  management = false,
  requireOnlineForCreate = false,
  formData = null,
  probeResult = null,
  duplicatePrinter = null,
  errorMessages = [],
  statusCode = 200
}) {
  return res.status(statusCode).render('fragments/label-printer-form-modal', {
    printer,
    scope,
    management,
    requireOnlineForCreate,
    formData: formData || defaultFormData(printer, scope),
    probeResult,
    duplicatePrinter,
    protocols: LABEL_PRINTER_PROTOCOLS,
    errorMessages
  });
}

async function renderNewManagedPrinterModal(req, res, next) {
  try { return renderPrinterForm(res, { scope: 'managed', management: true }); } catch (error) { next(error); }
}

async function renderNewSoloPrinterModal(req, res, next) {
  try {
    return renderPrinterForm(res, {
      scope: 'solo',
      management: false,
      requireOnlineForCreate: !isTechLeadPlus(req.currentUser.roles)
    });
  } catch (error) { next(error); }
}

function requestFormData(req) {
  return {
    displayName: String(req.body.displayName || '').trim(),
    locationLabel: String(req.body.locationLabel || '').trim(),
    hostAddress: String(req.body.hostAddress || '').trim(),
    protocolCode: String(req.body.protocolCode || 'raw_9100').trim(),
    port: String(req.body.port || '').trim(),
    cupsQueueName: String(req.body.cupsQueueName || '').trim(),
    manufacturer: String(req.body.manufacturer || '').trim(),
    model: String(req.body.model || '').trim(),
    detectedDescription: String(req.body.detectedDescription || '').trim(),
    printerProfileCode: String(req.body.printerProfileCode || '').trim(),
    mediaCode: String(req.body.mediaCode || '').trim(),
    dpi: String(req.body.dpi || '').trim(),
    isShared: req.body.isShared === '1' || req.body.isShared === 'on',
    isEnabled: req.body.isEnabled === undefined ? false : (req.body.isEnabled === '1' || req.body.isEnabled === 'on')
  };
}

async function probeAndRender(req, res, next, scope, management) {
  const formData = requestFormData(req);
  try {
    const probeResult = await probePrinterHost(formData.hostAddress);
    const duplicatePrinter = await labelPrinterModel.findPrinterRegistrationConflict({
      hostAddress: probeResult.hostAddress,
      cupsQueueName: formData.cupsQueueName
    });
    if (probeResult.reachable && (!formData.protocolCode || formData.protocolCode === 'raw_9100')) {
      formData.protocolCode = probeResult.suggestedProtocolCode;
      formData.port = String(probeResult.suggestedPort);
    }
    if (!formData.displayName && probeResult.reverseName) formData.displayName = probeResult.reverseName.split('.')[0];
    return renderPrinterForm(res, {
      scope,
      management,
      formData,
      probeResult,
      duplicatePrinter,
      requireOnlineForCreate: scope === 'solo' && !management && !isTechLeadPlus(req.currentUser.roles)
    });
  } catch (error) {
    if (error instanceof LabelPrinterInputError) {
      return renderPrinterForm(res, {
        scope,
        management,
        formData,
        errorMessages: [error.message],
        statusCode: 400,
        requireOnlineForCreate: scope === 'solo' && !management && !isTechLeadPlus(req.currentUser.roles)
      });
    }
    next(error);
  }
}

async function probeManagedPrinter(req, res, next) { return probeAndRender(req, res, next, 'managed', true); }
async function probeSoloPrinter(req, res, next) { return probeAndRender(req, res, next, 'solo', false); }

async function createPrinter(req, res, next, scope, management) {
  const formData = requestFormData(req);
  try {
    const normalized = normalizePrinterInput(formData, { scope });
    const duplicatePrinter = await labelPrinterModel.findPrinterRegistrationConflict({
      hostAddress: normalized.hostAddress,
      cupsQueueName: normalized.cupsQueueName
    });
    if (duplicatePrinter) {
      return renderPrinterForm(res, {
        scope,
        management,
        formData,
        duplicatePrinter,
        statusCode: 200
      });
    }
    const probeResult = await probePrinterHost(normalized.hostAddress);
    const requireOnlineForCreate = scope === 'solo' && !management && !isTechLeadPlus(req.currentUser.roles);
    if (requireOnlineForCreate && !probeResult.reachable) {
      return renderPrinterForm(res, {
        scope,
        management,
        formData,
        probeResult,
        errorMessages: ['This solo printer is offline or unreachable. Tech Users can only add a solo printer while it is online.'],
        statusCode: 400,
        requireOnlineForCreate: true
      });
    }
    const data = {
      ...normalized,
      probeStatus: probeResult.reachable ? 'reachable' : 'offline',
      probeDetails: probeResult
    };
    await labelPrinterModel.createPrinter(data, {
      actorUserId: req.currentUser.user_id,
      ownerUserId: scope === 'solo' ? req.currentUser.user_id : null
    });
    return respondAfterMutation(req, res, {
      management,
      successMessage: 'Printer added.',
      redirectUrl: management ? '/management/printers?created=1' : '/tech/printers?created=1'
    });
  } catch (error) {
    if (error instanceof LabelPrinterInputError || error.code === 'ER_DUP_ENTRY') {
      const message = error.code === 'ER_DUP_ENTRY' ? 'This printer has already been added to BWTDallas.' : error.message;
      return renderPrinterForm(res, { scope, management, formData, errorMessages: [message], statusCode: error.code === 'ER_DUP_ENTRY' ? 200 : 400 });
    }
    next(error);
  }
}

async function createManagedPrinter(req, res, next) { return createPrinter(req, res, next, 'managed', true); }
async function createSoloPrinter(req, res, next) { return createPrinter(req, res, next, 'solo', false); }

async function loadEditablePrinter(req, { management = false } = {}) {
  const printer = await labelPrinterModel.getPrinterById(req.params.printerId);
  if (!printer) return { printer: null, allowed: false };
  if (management) return { printer, allowed: true };
  return {
    printer,
    allowed: canEditSoloPrinter(printer, req.currentUser.user_id, req.currentUser.roles)
      && Number(printer.owner_user_id) === Number(req.currentUser.user_id)
  };
}

async function renderEditPrinterModal(req, res, next, management) {
  try {
    const { printer, allowed } = await loadEditablePrinter(req, { management });
    if (!printer) return res.sendStatus(404);
    if (!allowed) return res.sendStatus(403);
    return renderPrinterForm(res, { printer, scope: printer.scope_code, management });
  } catch (error) { next(error); }
}

async function updatePrinter(req, res, next, management) {
  const formData = requestFormData(req);
  try {
    const { printer, allowed } = await loadEditablePrinter(req, { management });
    if (!printer) return res.sendStatus(404);
    if (!allowed) return res.sendStatus(403);
    const normalized = normalizePrinterInput(formData, { scope: printer.scope_code });
    const duplicatePrinter = await labelPrinterModel.findPrinterRegistrationConflict({
      hostAddress: normalized.hostAddress,
      cupsQueueName: normalized.cupsQueueName,
      excludePrinterId: printer.label_printer_id
    });
    if (duplicatePrinter) {
      return renderPrinterForm(res, {
        printer,
        scope: printer.scope_code,
        management,
        formData,
        duplicatePrinter,
        statusCode: 200
      });
    }
    const probeResult = await probePrinterHost(normalized.hostAddress);
    await labelPrinterModel.updatePrinter(printer.label_printer_id, {
      ...normalized,
      probeStatus: probeResult.reachable ? 'reachable' : 'offline',
      probeDetails: probeResult
    }, { actorUserId: req.currentUser.user_id });
    return respondAfterMutation(req, res, {
      management,
      successMessage: 'Printer updated.',
      redirectUrl: management ? '/management/printers?updated=1' : '/tech/printers?updated=1'
    });
  } catch (error) {
    if (error instanceof LabelPrinterInputError || error.code === 'ER_DUP_ENTRY') {
      const message = error.code === 'ER_DUP_ENTRY' ? 'This printer has already been added to BWTDallas.' : error.message;
      const existing = await labelPrinterModel.getPrinterById(req.params.printerId).catch(() => null);
      return renderPrinterForm(res, {
        printer: existing,
        scope: existing?.scope_code || (management ? 'managed' : 'solo'),
        management,
        formData,
        errorMessages: [message],
        statusCode: error.code === 'ER_DUP_ENTRY' ? 200 : 400
      });
    }
    next(error);
  }
}

async function renderEditManagedPrinterModal(req, res, next) { return renderEditPrinterModal(req, res, next, true); }
async function updateManagedPrinter(req, res, next) { return updatePrinter(req, res, next, true); }
async function renderEditSoloPrinterModal(req, res, next) { return renderEditPrinterModal(req, res, next, false); }
async function updateSoloPrinter(req, res, next) { return updatePrinter(req, res, next, false); }

async function updateManagedPrinterSharing(req, res, next) {
  try {
    const printer = await labelPrinterModel.getPrinterById(req.params.printerId);
    if (!printer) return res.sendStatus(404);
    if (String(printer.scope_code) !== 'solo') return res.status(400).send('Only solo printers can change sharing.');
    const isShared = req.body.isShared === '1' || req.body.isShared === 'on';
    await labelPrinterModel.setSoloPrinterSharing(printer.label_printer_id, isShared, {
      actorUserId: req.currentUser.user_id
    });
    return respondAfterMutation(req, res, {
      management: true,
      successMessage: isShared ? 'Solo printer shared.' : 'Solo printer made private.',
      redirectUrl: '/management/printers?sharingUpdated=1'
    });
  } catch (error) { next(error); }
}

async function listSoloPrinterOwnerOptions() {
  const users = await managementModel.listUsers({ activeOnly: true });
  const eligibleRoles = new Set(['admin', 'management', 'tech_lead', 'tech']);
  return users
    .filter((user) => String(user.role_codes || '').split(',').some((role) => eligibleRoles.has(role)))
    .map((user) => ({
      userId: Number(user.user_id),
      label: `${`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username} (${user.username})`
    }));
}

async function renderConvertPrinterScopeModal(req, res, next) {
  try {
    const printer = await labelPrinterModel.getPrinterById(req.params.printerId);
    if (!printer) return res.sendStatus(404);
    const targetScope = String(printer.scope_code) === 'solo' ? 'managed' : 'solo';
    const owners = targetScope === 'solo' ? await listSoloPrinterOwnerOptions() : [];
    return res.render('fragments/label-printer-scope-modal', {
      printer,
      targetScope,
      owners,
      selectedOwnerUserId: printer.owner_user_id ? Number(printer.owner_user_id) : null,
      errorMessages: []
    });
  } catch (error) { next(error); }
}

async function convertPrinterScope(req, res, next) {
  try {
    const printer = await labelPrinterModel.getPrinterById(req.params.printerId);
    if (!printer) return res.sendStatus(404);
    const targetScope = String(printer.scope_code) === 'solo' ? 'managed' : 'solo';
    const ownerUserId = targetScope === 'solo' ? Number(req.body.ownerUserId || printer.owner_user_id || 0) : null;
    const isShared = targetScope === 'managed' || req.body.isShared === '1' || req.body.isShared === 'on';
    if (targetScope === 'solo' && (!Number.isInteger(ownerUserId) || ownerUserId <= 0)) {
      const owners = await listSoloPrinterOwnerOptions();
      return res.status(400).render('fragments/label-printer-scope-modal', {
        printer, targetScope, owners, selectedOwnerUserId: null,
        errorMessages: ['Select an owner for the solo printer.']
      });
    }
    await labelPrinterModel.convertPrinterScope(printer.label_printer_id, {
      targetScope, ownerUserId, isShared
    }, { actorUserId: req.currentUser.user_id });
    return respondAfterMutation(req, res, {
      management: true,
      successMessage: targetScope === 'managed' ? 'Solo printer converted to managed.' : 'Managed printer converted to solo.',
      redirectUrl: '/management/printers?updated=1'
    });
  } catch (error) { next(error); }
}

async function renderDeletePrinterModal(req, res, next, management) {
  try {
    const { printer, allowed } = await loadEditablePrinter(req, { management });
    if (!printer) return res.sendStatus(404);
    if (!allowed) return res.sendStatus(403);
    return res.render('fragments/label-printer-delete-modal', { printer, management, errorMessages: [] });
  } catch (error) { next(error); }
}

async function deletePrinter(req, res, next, management) {
  try {
    const { printer, allowed } = await loadEditablePrinter(req, { management });
    if (!printer) return res.sendStatus(404);
    if (!allowed) return res.sendStatus(403);
    await labelPrinterModel.deletePrinter(printer.label_printer_id, { actorUserId: req.currentUser.user_id });
    return respondAfterMutation(req, res, {
      management,
      successMessage: 'Printer removed. Historical print snapshots remain intact.',
      redirectUrl: management ? '/management/printers?deleted=1' : '/tech/printers?deleted=1'
    });
  } catch (error) { next(error); }
}

async function renderDeleteManagedPrinterModal(req, res, next) { return renderDeletePrinterModal(req, res, next, true); }
async function deleteManagedPrinter(req, res, next) { return deletePrinter(req, res, next, true); }
async function renderDeleteSoloPrinterModal(req, res, next) { return renderDeletePrinterModal(req, res, next, false); }
async function deleteSoloPrinter(req, res, next) { return deletePrinter(req, res, next, false); }

async function renderNewGroupModal(req, res, next) {
  try { return res.render('fragments/label-printer-group-form-modal', { errorMessages: [], formData: { name: '', description: '' } }); } catch (error) { next(error); }
}

async function createGroup(req, res, next) {
  const formData = { name: String(req.body.name || '').trim(), description: String(req.body.description || '').trim() };
  try {
    await labelPrinterModel.createGroup(formData, req.currentUser.user_id);
    return respondAfterMutation(req, res, {
      management: true,
      successMessage: 'Printer group created.',
      redirectUrl: '/management/printers?groupCreated=1'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || /required/.test(String(error.message))) {
      return res.status(400).render('fragments/label-printer-group-form-modal', {
        errorMessages: [error.code === 'ER_DUP_ENTRY' ? 'A printer group with that name already exists.' : error.message],
        formData
      });
    }
    next(error);
  }
}

async function renderGroupMembersModal(req, res, next) {
  try {
    const [group, members, printers] = await Promise.all([
      labelPrinterModel.getGroupById(req.params.groupId),
      labelPrinterModel.listGroupMembers(req.params.groupId),
      labelPrinterModel.listPrinters({ includeDisabled: false })
    ]);
    if (!group) return res.sendStatus(404);
    const selectedIds = new Set(members.map((member) => Number(member.printer_id)));
    const eligiblePrinters = printers.filter((printer) => String(printer.scope_code) === 'managed' || Number(printer.is_shared) === 1);
    return res.render('fragments/label-printer-group-members-modal', { group, printers: eligiblePrinters, selectedIds, errorMessages: [] });
  } catch (error) { next(error); }
}

async function updateGroupMembers(req, res, next) {
  try {
    const printerIds = req.body.printerId || [];
    await labelPrinterModel.replaceGroupMembers(req.params.groupId, printerIds, req.currentUser.user_id);
    return respondAfterMutation(req, res, {
      management: true,
      successMessage: 'Printer group membership updated.',
      redirectUrl: '/management/printers?groupUpdated=1'
    });
  } catch (error) {
    next(error);
  }
}

async function renderDeleteGroupModal(req, res, next) {
  try {
    const group = await labelPrinterModel.getGroupById(req.params.groupId);
    if (!group) return res.sendStatus(404);
    return res.render('fragments/label-printer-group-delete-modal', { group });
  } catch (error) { next(error); }
}

async function deleteGroup(req, res, next) {
  try {
    const deleted = await labelPrinterModel.deleteGroup(req.params.groupId, req.currentUser.user_id);
    if (!deleted) return res.sendStatus(404);
    return respondAfterMutation(req, res, {
      management: true,
      successMessage: 'Printer group deleted.',
      redirectUrl: '/management/printers?groupDeleted=1'
    });
  } catch (error) { next(error); }
}

module.exports = {
  streamPrinterRegistryEvents,
  renderManagementPrintersPage,
  renderManagementPrintersLive,
  renderMyPrintersPage,
  renderTechPrintersLive,
  renderNewManagedPrinterModal,
  renderNewSoloPrinterModal,
  probeManagedPrinter,
  probeSoloPrinter,
  createManagedPrinter,
  createSoloPrinter,
  renderEditManagedPrinterModal,
  updateManagedPrinter,
  renderEditSoloPrinterModal,
  updateSoloPrinter,
  updateManagedPrinterSharing,
  renderConvertPrinterScopeModal,
  convertPrinterScope,
  renderDeleteManagedPrinterModal,
  deleteManagedPrinter,
  renderDeleteSoloPrinterModal,
  deleteSoloPrinter,
  renderNewGroupModal,
  createGroup,
  renderGroupMembersModal,
  updateGroupMembers,
  renderDeleteGroupModal,
  deleteGroup
};
