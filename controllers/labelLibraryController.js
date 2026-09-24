'use strict';

const { normalizePositiveInteger } = require('../utils/positiveInteger');
const fs = require('node:fs');
const QRCode = require('qrcode');
const labelLibraryModel = require('../models/labelLibraryModel');
const techUnitModel = require('../models/techUnitModel');
const lotModel = require('../models/lotModel');
const labelLibraryPrintingService = require('../services/labelLibraryPrintingService');
const labelPrinterRuntimeService = require('../services/labelPrinterRuntimeService');
const labelPrintingService = require('../services/labelPrintingService');
const labelPrintHistoryModel = require('../models/labelPrintHistoryModel');
const { isHtmxRequest } = require('../utils/htmxRequest');
const {
  LABEL_TEMPLATE_CATEGORIES,
  LABEL_TEMPLATE_STATUSES,
  LABEL_TEMPLATE_PRINT_SCOPES
} = require('../config/labelLibrary');
const {
  LABEL_BUILDER_MEDIA_WIDTHS,
  LABEL_BUILDER_FONT_FAMILIES,
  LABEL_BUILDER_FONT_WEIGHTS,
  LABEL_BUILDER_TEXT_ALIGNS,
  LABEL_BUILDER_TEXT_CASES,
  LABEL_BUILDER_ROTATIONS,
  DEFAULT_LABEL_BUILDER_MEDIA_CODE,
  LABEL_BUILDER_DEFAULT_LENGTH_MM,
  findLabelBuilderMediaWidth,
  inferLabelBuilderMediaWidth,
  inferLabelBuilderLengthMm,
  buildLabelBuilderGeometry
} = require('../config/labelBuilder');
const { LABEL_FIELD_GROUPS } = require('../config/labelFieldRegistry');
const {
  LabelTemplateInputError,
  normalizeTemplateInput
} = require('../services/labelTemplateInputPolicy');
const {
  deleteContentAddressedAsset,
  resolveAssetAbsolutePath,
  writeContentAddressedAsset
} = require('../services/labelAssetStorage');
const {
  LabelBuilderLayoutError,
  createBlankBuilderLayout,
  normalizeBuilderLayout,
  inspectLayoutReadiness
} = require('../services/labelBuilderLayoutPolicy');
const {
  LABEL_IMAGE_ASSET_KINDS,
  LabelAssetUploadError,
  prepareLabelAssetUpload
} = require('../services/labelAssetUploadPolicy');
const { buildComposedValuePresets } = require('../services/labelComposedValuePresets');
const { buildRepresentativeFieldValues, inspectTemplateReadiness } = require('../services/labelTemplateReadinessService');

const LABEL_LIBRARY_FILE_ASSET_KINDS = new Set(['logo', 'image', 'background']);
const LABEL_BUILDER_IMAGE_MIME_TYPES = new Set(['image/png', 'image/svg+xml']);
const MAX_LABEL_ASSET_JSON_PREVIEW_BYTES = 256 * 1024;

function isReusableBuilderImageAsset(asset) {
  return Boolean(asset)
    && String(asset.status || 'active') === 'active'
    && LABEL_LIBRARY_FILE_ASSET_KINDS.has(String(asset.asset_kind || ''))
    && LABEL_BUILDER_IMAGE_MIME_TYPES.has(String(asset.mime_type || '').toLowerCase());
}

function toBuilderImageAsset(asset) {
  return {
    assetId: Number(asset.asset_id),
    assetKey: `shared_${String(asset.sha256 || '').toLowerCase()}`,
    name: String(asset.name || asset.source_filename || `Asset ${asset.asset_id}`),
    kind: String(asset.asset_kind || 'image'),
    mimeType: String(asset.mime_type || ''),
    width: Number(asset.width_pixels) || null,
    height: Number(asset.height_pixels) || null,
    sourceFilename: String(asset.source_filename || ''),
    fileUrl: `/management/label-library/assets/${Number(asset.asset_id)}/file`
  };
}

async function loadComposedValuePresets() {
  const rows = await labelLibraryModel.listCurrentTemplateConfigAssets();
  const entries = [];
  for (const row of rows) {
    try {
      const raw = await fs.promises.readFile(resolveAssetAbsolutePath(row.storage_relative_path), 'utf8');
      entries.push({
        templateId: Number(row.label_template_id),
        templateName: String(row.template_name || ''),
        updatedAt: row.template_updated_at,
        layout: JSON.parse(raw)
      });
    } catch (error) {
      console.warn(`Label Builder composition preset scan skipped template ${row.label_template_id}:`, error.message);
    }
  }
  return buildComposedValuePresets(entries);
}

async function validateBuilderImageReferences(layout) {
  const assetKeys = [...new Set((Array.isArray(layout?.elements) ? layout.elements : [])
    .filter((element) => element?.type === 'image')
    .map((element) => String(element.assetKey || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!assetKeys.length) return [];

  const keyPattern = /^shared_([a-f0-9]{64})$/;
  const resolvedLinks = [];
  for (const assetKey of assetKeys) {
    const match = assetKey.match(keyPattern);
    if (!match) throw new LabelBuilderLayoutError(`Image asset key ${assetKey || '(blank)'} is invalid.`);
    const asset = await labelLibraryModel.getLabelAssetBySha256(match[1]);
    if (!isReusableBuilderImageAsset(asset)) {
      throw new LabelBuilderLayoutError('One or more Image regions reference a Shared Asset that is unavailable or is not an active PNG/SVG image.');
    }
    resolvedLinks.push({ assetId: Number(asset.asset_id), assetKey });
  }

  for (const element of layout.elements) {
    if (element?.type !== 'image') continue;
    element.assetKey = String(element.assetKey || '').trim().toLowerCase();
    element.fit = 'contain';
  }
  return resolvedLinks;
}

async function preflightActiveBuilderLayout(template, layout, geometry, reusableAssetLinks) {
  const candidateReadiness = inspectLayoutReadiness(layout);
  if (!candidateReadiness.ready) {
    throw new LabelBuilderLayoutError([
      'An Active template must remain print-ready. Resolve these layout issues before saving the live label:',
      ...candidateReadiness.issues
    ]);
  }

  const assetDataUris = {};
  for (const link of reusableAssetLinks) {
    const asset = await labelLibraryModel.getLabelAssetById(link.assetId);
    if (!isReusableBuilderImageAsset(asset)) {
      throw new LabelBuilderLayoutError('One or more Image regions reference a Shared Asset that is unavailable or invalid.');
    }
    const buffer = await fs.promises.readFile(resolveAssetAbsolutePath(asset.storage_relative_path));
    assetDataUris[link.assetKey] = `data:${asset.mime_type};base64,${buffer.toString('base64')}`;
  }

  const { renderLayout } = require('../services/labelTemplateLayoutRenderer');
  const candidateTemplate = {
    ...template,
    printer_profile_code: geometry.printerProfileCode,
    media_code: geometry.mediaCode,
    dpi: geometry.dpi,
    canvas_width_dots: geometry.canvasWidthDots,
    canvas_height_dots: geometry.canvasHeightDots,
    printable_width_dots: geometry.printableWidthDots,
    horizontal_offset_dots: geometry.horizontalOffsetDots,
    feed_margin_dots: geometry.feedMarginDots
  };
  try {
    await renderLayout({
      layout,
      template: candidateTemplate,
      fieldValues: buildRepresentativeFieldValues(),
      assetDataUris
    });
  } catch (error) {
    throw new LabelBuilderLayoutError(`Live label print preflight failed: ${error.message || 'The layout could not be rendered.'}`);
  }
}

function sendRedirect(req, res, url) {
  if (isHtmxRequest(req)) {
    res.set('HX-Redirect', url);
    return res.send('');
  }
  return res.redirect(url);
}

function getNotice(query = {}) {
  if (query.created === '1') return 'Label template created as Draft.';
  if (query.updated === '1') return 'Label template updated successfully.';
  if (query.cloned === '1') return 'Label template cloned as a new Draft.';
  if (query.activated === '1') return 'Label template activated.';
  if (query.archived === '1') return 'Label template archived.';
  if (query.unarchived === '1') return 'Label template unarchived as Draft.';
  if (query.deleted === '1') return 'Label template deleted. Historical print snapshots remain intact.';
  if (query.layout_saved === '1') return 'Label layout saved as Draft.';
  if (query.asset_uploaded === '1') return 'Shared Label Asset uploaded successfully.';
  if (query.asset_reused === '1') return 'That image already exists in Shared Assets; the existing asset was reused.';
  if (query.asset_deleted === '1') return 'Shared Label Asset deleted.';
  if (query.asset_renamed === '1') return 'Shared Label Asset updated.';
  return null;
}

function applyTemplateFilters(templates, query = {}) {
  const search = String(query.search || '').trim().toLowerCase();
  const category = String(query.category || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();
  const printScope = String(query.printScope || '').trim().toLowerCase();

  return templates.filter((template) => {
    if (category && template.category_code !== category) return false;
    if (status && template.status !== status) return false;
    if (printScope && String(template.print_scope || 'lot') !== printScope) return false;
    if (search) {
      const haystack = `${template.name || ''} ${template.description || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}


async function getTemplateLayoutState(template, options = {}) {
  return inspectTemplateReadiness(template, options);
}

function normalizeStandalonePrintCopies(value) {
  const copies = Number(value ?? 1);
  return Number.isSafeInteger(copies) && copies >= 1 && copies <= labelPrintingService.MAX_LABEL_COPIES
    ? copies
    : null;
}

function selectPreferredStandalonePrintDestination(destinations, requestedDestinationId, currentUser) {
  const options = Array.isArray(destinations) ? destinations : [];
  const requestedId = String(requestedDestinationId || '').trim();
  if (requestedId && options.some((destination) => destination.id === requestedId)) return requestedId;

  const userId = Number(currentUser?.user_id);
  const ownedSolo = options.find((destination) => (
    destination.kind === 'printer'
    && destination.scopeCode === 'solo'
    && Number(destination.ownerUserId) === userId
  ));
  return ownedSolo?.id || options[0]?.id || '';
}

async function resolveStandaloneTemplateContext(labelTemplateId, requestedUnitId = '') {
  const descriptor = await labelLibraryPrintingService.getStandalonePrintDescriptor(labelTemplateId);
  if (!descriptor) return { notFound: true, errors: [] };

  const errors = [];
  let layout = null;
  let requiresUnitContext = false;
  if (!descriptor.available) {
    errors.push(descriptor.unavailableReason || 'This Standalone template is not available for direct printing.');
  } else {
    try {
      const runtime = await labelLibraryPrintingService.loadTemplateRuntime(descriptor.libraryTemplateId);
      layout = runtime.layout;
      const readiness = inspectLayoutReadiness(layout);
      if (!readiness.ready) errors.push(...readiness.issues.map((issue) => `Layout: ${issue}`));
      requiresUnitContext = labelLibraryPrintingService.layoutRequiresUnitContext(layout);
    } catch (error) {
      errors.push(error.message || 'The Standalone template layout could not be loaded.');
    }
  }

  let unit = null;
  let lot = null;
  const rawUnitId = String(requestedUnitId ?? '').trim();
  if (rawUnitId) {
    const unitId = normalizePositiveInteger(rawUnitId);
    if (!unitId) {
      errors.push('The selected Unit ID is invalid.');
    } else {
      unit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);
      if (!unit) {
        errors.push('The selected Unit could not be found.');
      } else if (unit.lotId) {
        lot = await lotModel.getLotById(unit.lotId);
      }
    }
  }

  return {
    notFound: false,
    descriptor,
    template: descriptor.template,
    layout,
    requiresUnitContext,
    unit,
    lot,
    errors
  };
}

async function buildStandaloneDirectPrintModalView({
  labelTemplateId,
  currentUser,
  requestedUnitId = '',
  search = '',
  requestedDestinationId = '',
  copies = 1,
  successMessage = '',
  errorMessages = []
} = {}) {
  const context = await resolveStandaloneTemplateContext(labelTemplateId, requestedUnitId);
  if (context.notFound) return null;

  const searchTerm = String(search || '').trim().slice(0, 120);
  const searchResults = context.requiresUnitContext && searchTerm
    ? await techUnitModel.searchUnitsByIdentity(searchTerm, 12)
    : [];

  let previewDataUri = '';
  const structuralErrors = [...context.errors];
  if (context.descriptor.available
    && structuralErrors.length === 0
    && (!context.requiresUnitContext || context.unit)) {
    try {
      previewDataUri = await labelLibraryPrintingService.buildDescriptorPreview({
        descriptor: context.descriptor,
        unit: context.unit,
        lot: context.lot
      });
    } catch (error) {
      structuralErrors.push(error.message || 'The label preview could not be rendered.');
    }
  }

  const allDestinations = await labelPrinterRuntimeService.listPrintDestinationsForUser({
    userId: currentUser?.user_id,
    roleCodes: currentUser?.roles
  });
  const printers = allDestinations.filter((destination) => (
    labelLibraryPrintingService.destinationSupportsTemplates(destination, [context.descriptor])
  ));
  const selectedPrinterId = selectPreferredStandalonePrintDestination(printers, requestedDestinationId, currentUser);
  const availabilityErrors = [
    ...(allDestinations.length === 0 ? ['No label printers or printer groups are currently available to your account.'] : []),
    ...(allDestinations.length > 0 && printers.length === 0 ? ['No available printer or printer group supports this label profile. Update the printer registry media/profile configuration first.'] : [])
  ];

  const unitFieldValues = context.unit
    ? labelLibraryPrintingService.buildFieldValues(context.unit, context.lot)
    : null;

  return {
    template: context.template,
    descriptor: context.descriptor,
    requiresUnitContext: context.requiresUnitContext,
    unit: context.unit,
    lot: context.lot,
    unitFieldValues,
    searchTerm,
    searchResults,
    previewDataUri,
    printers,
    selectedPrinterId,
    copies: normalizeStandalonePrintCopies(copies) || String(copies || 1),
    maxCopies: labelPrintingService.MAX_LABEL_COPIES,
    successMessage: String(successMessage || ''),
    errorMessages: [...structuralErrors, ...availabilityErrors, ...(Array.isArray(errorMessages) ? errorMessages.filter(Boolean) : [])],
    submitBlocked: structuralErrors.length > 0
      || availabilityErrors.length > 0
      || (context.requiresUnitContext && !context.unit)
      || !previewDataUri
  };
}

async function renderStandaloneDirectPrintModal(req, res, next) {
  try {
    const view = await buildStandaloneDirectPrintModalView({
      labelTemplateId: req.params.labelTemplateId,
      currentUser: req.currentUser,
      requestedUnitId: req.query?.unitId,
      search: req.query?.q,
      requestedDestinationId: req.query?.printerId,
      copies: req.query?.copies || 1
    });
    if (!view) return res.sendStatus(404);
    return res.render('fragments/label-library-direct-print-modal', view);
  } catch (error) {
    next(error);
  }
}

async function queueTemplatePrint({
  jobId,
  descriptor,
  unit,
  lot,
  fieldValues = null,
  destination,
  copies,
  updateTemplateUsage = true,
  titleLabelPrefix = '',
  historyUnitLabel = '',
  historyLotName = ''
}) {
  const content = labelPrintingService.buildUnitLabelContent(unit || {}, lot);
  const unitLabel = String(historyUnitLabel || '').trim() || (unit ? content.primaryLabel : 'Standalone');
  const lotName = String(historyLotName || '').trim() || (unit ? content.lotName : '');
  const itemId = await labelPrintHistoryModel.createPrintJobItem({
    jobId,
    unitId: unit?.unitId || null,
    lotId: unit?.lotId || null,
    labelTemplateId: descriptor.libraryTemplateId,
    unitLabel,
    lotName,
    templateName: descriptor.name,
    templateCategoryCode: descriptor.categoryCode,
    templateRevision: descriptor.template?.revision || 1,
    configSha256: descriptor.configSha256,
    copiesRequested: copies
  });

  let candidates = [];
  try {
    candidates = await labelLibraryPrintingService.getRankedDestinationPrinters(destination, descriptor);
  } catch (_) {
    candidates = [];
  }

  if (!candidates.length) {
    const message = `${destination?.label || 'The selected destination'} has no compatible printer online right now.`;
    await labelPrintHistoryModel.completePrintItem({
      itemId,
      labelTemplateId: descriptor.libraryTemplateId,
      updateTemplateUsage,
      copiesQueued: 0,
      status: 'failed',
      failureMessage: message
    });
    return { copiesQueued: 0, printerLabels: [], failureMessage: message };
  }

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    let candidate = candidates[candidateIndex];
    const attemptId = await labelPrintHistoryModel.beginPrintAttempt({
      itemId,
      attemptNumber: candidateIndex + 1,
      printer: candidate
    });

    try {
      if (destination?.kind === 'group') {
        candidate = await labelPrinterRuntimeService.preparePrinterForSubmission(candidate);
      }
      const result = await labelLibraryPrintingService.printDescriptor({
        descriptor,
        unit,
        lot,
        fieldValues,
        printer: candidate,
        copies,
        titleLabel: fieldValues
          ? `${String(titleLabelPrefix || '').trim()} ${unitLabel}`.trim()
          : unit ? `${String(titleLabelPrefix || '').trim()} ${content.primaryLabel}`.trim() : 'Standalone'
      });
      try {
        await labelPrinterRuntimeService.recordQueuedCopies(candidate, result.copies);
      } catch (printerUsageError) {
        console.warn('Label print printer lifetime usage could not be updated:', printerUsageError.message);
      }
      try {
        await labelPrintHistoryModel.completePrintAttempt({
          attemptId,
          status: 'queued',
          copiesSubmitted: result.copies,
          requestIds: result.requestIds
        });
        await labelPrintHistoryModel.completePrintItem({
          itemId,
          labelTemplateId: descriptor.libraryTemplateId,
          updateTemplateUsage,
          copiesQueued: result.copies,
          status: 'queued'
        });
      } catch (historyError) {
        console.warn('Label print history completion failed after CUPS accepted the job:', historyError.message);
      }
      return { copiesQueued: result.copies, printerLabels: [candidate.label], failureMessage: '' };
    } catch (error) {
      const copiesSubmitted = Math.max(0, Number(error.copiesSubmitted) || 0);
      const requestIds = Array.isArray(error.requestIds) ? error.requestIds : [];
      if (copiesSubmitted > 0) {
        try {
          await labelPrinterRuntimeService.recordQueuedCopies(candidate, copiesSubmitted);
        } catch (printerUsageError) {
          console.warn('Partial label print printer lifetime usage could not be updated:', printerUsageError.message);
        }
      }
      try {
        await labelPrintHistoryModel.completePrintAttempt({
          attemptId,
          status: copiesSubmitted > 0 ? 'partial' : 'failed',
          copiesSubmitted,
          requestIds,
          failureMessage: error.message
        });
      } catch (historyError) {
        console.warn('Label print attempt failure recording failed:', historyError.message);
      }

      const mayFailOver = destination?.kind === 'group'
        && copiesSubmitted === 0
        && candidateIndex < candidates.length - 1;
      if (mayFailOver) continue;

      const message = copiesSubmitted > 0
        ? `${copiesSubmitted} of ${copies} copies queued to ${candidate.label} before an error: ${error.message}`
        : (error.message || 'The label could not be queued.');
      try {
        await labelPrintHistoryModel.completePrintItem({
          itemId,
          labelTemplateId: descriptor.libraryTemplateId,
          updateTemplateUsage,
          copiesQueued: copiesSubmitted,
          status: copiesSubmitted > 0 ? 'partial' : 'failed',
          failureMessage: message
        });
      } catch (historyError) {
        console.warn('Label print item failure recording failed:', historyError.message);
      }
      return { copiesQueued: copiesSubmitted, printerLabels: copiesSubmitted > 0 ? [candidate.label] : [], failureMessage: message };
    }
  }

  const message = `Every available printer in ${destination.label} failed before CUPS accepted the job.`;
  try {
    await labelPrintHistoryModel.completePrintItem({
      itemId,
      labelTemplateId: descriptor.libraryTemplateId,
      updateTemplateUsage,
      copiesQueued: 0,
      status: 'failed',
      failureMessage: message
    });
  } catch (historyError) {
    console.warn('Label print item failure recording failed:', historyError.message);
  }
  return { copiesQueued: 0, printerLabels: [], failureMessage: message };
}

async function printStandaloneTemplate(req, res, next) {
  let printJob = null;
  const labelTemplateId = req.params.labelTemplateId;
  const requestedUnitId = req.body?.unitId;
  const requestedDestinationId = String(req.body?.printerId || '').trim();
  const requestedCopies = req.body?.copies;

  try {
    const context = await resolveStandaloneTemplateContext(labelTemplateId, requestedUnitId);
    if (context.notFound) return res.sendStatus(404);

    const errors = [...context.errors];
    const copies = normalizeStandalonePrintCopies(requestedCopies);
    if (!copies) errors.push(`Copies must be between 1 and ${labelPrintingService.MAX_LABEL_COPIES}.`);
    if (context.requiresUnitContext && !context.unit) {
      errors.push('Select a Unit before printing this template because its layout uses BWTDallas Unit/Lot fields.');
    }

    let destination = await labelPrinterRuntimeService.resolvePrintDestinationForUser({
      destinationId: requestedDestinationId,
      userId: req.currentUser?.user_id,
      roleCodes: req.currentUser?.roles
    });
    if (!destination) errors.push('Select an available label printer or printer group.');

    if (errors.length === 0 && destination) {
      try {
        destination = await labelLibraryPrintingService.preflightPrintDestination(destination, [context.descriptor]);
      } catch (error) {
        errors.push(error.message || 'The selected printer is offline or unavailable.');
      }
    }

    if (errors.length > 0) {
      const view = await buildStandaloneDirectPrintModalView({
        labelTemplateId,
        currentUser: req.currentUser,
        requestedUnitId,
        requestedDestinationId,
        copies: requestedCopies,
        errorMessages: errors.filter((message) => !context.errors.includes(message))
      });
      return res.render('fragments/label-library-direct-print-modal', view);
    }

    printJob = await labelPrintHistoryModel.beginPrintJob({
      actorUserId: req.currentUser.user_id,
      source: 'library_direct'
    });

    const result = await queueTemplatePrint({
      jobId: printJob.jobId,
      descriptor: context.descriptor,
      unit: context.unit,
      lot: context.lot,
      destination,
      copies
    });
    const status = result.failureMessage
      ? (result.copiesQueued > 0 ? 'partial' : 'failed')
      : 'queued';
    try {
      await labelPrintHistoryModel.completePrintJob({
        jobId: printJob.jobId,
        status,
        failureMessage: result.failureMessage || null
      });
    } catch (historyError) {
      console.warn('Standalone direct print job finalization failed:', historyError.message);
    }

    if (isHtmxRequest(req) && result.copiesQueued > 0) res.set('HX-Trigger', 'unit-label-queued');
    const routeDetail = destination.kind === 'group'
      ? (result.printerLabels.length === 1 ? ` via ${destination.label} to ${result.printerLabels[0]}` : ` via ${destination.label}`)
      : ` to ${destination.label}`;
    const successMessage = result.copiesQueued > 0
      ? `${result.copiesQueued} standalone label${result.copiesQueued === 1 ? '' : 's'} queued${routeDetail}.`
      : '';

    const view = await buildStandaloneDirectPrintModalView({
      labelTemplateId,
      currentUser: req.currentUser,
      requestedUnitId,
      requestedDestinationId,
      copies,
      successMessage,
      errorMessages: result.failureMessage ? [result.failureMessage] : []
    });
    return res.render('fragments/label-library-direct-print-modal', view);
  } catch (error) {
    if (printJob) {
      try {
        await labelPrintHistoryModel.completePrintJob({
          jobId: printJob.jobId,
          status: 'failed',
          failureMessage: error.message || 'The standalone direct print job failed.'
        });
      } catch (historyError) {
        console.warn('Standalone direct print failure finalization failed:', historyError.message);
      }
    }
    try {
      const view = await buildStandaloneDirectPrintModalView({
        labelTemplateId,
        currentUser: req.currentUser,
        requestedUnitId,
        requestedDestinationId,
        copies: requestedCopies,
        errorMessages: [error.message || 'The standalone label could not be queued.']
      });
      if (!view) return res.sendStatus(404);
      return res.render('fragments/label-library-direct-print-modal', view);
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function resolveBuilderTestPrintContext(labelTemplateId, requestedUnitId = '') {
  const descriptor = await labelLibraryPrintingService.getBuilderTestPrintDescriptor(labelTemplateId);
  if (!descriptor) return { notFound: true, errors: [] };

  const errors = [];
  let layout = null;
  if (!descriptor.available) {
    errors.push(descriptor.unavailableReason || 'This saved template is not available for Builder Test Print.');
  } else {
    try {
      const runtime = await labelLibraryPrintingService.loadTemplateRuntime(descriptor.libraryTemplateId);
      layout = runtime.layout;
      const readiness = inspectLayoutReadiness(layout);
      if (!readiness.ready) errors.push(...readiness.issues.map((issue) => `Layout: ${issue}`));
    } catch (error) {
      errors.push(error.message || 'The saved layout could not be loaded.');
    }
  }

  let unit = null;
  let lot = null;
  const rawUnitId = String(requestedUnitId ?? '').trim();
  if (rawUnitId) {
    const unitId = normalizePositiveInteger(rawUnitId);
    if (!unitId) {
      errors.push('The selected Unit ID is invalid.');
    } else {
      unit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);
      if (!unit) {
        errors.push('The selected Unit could not be found.');
      } else if (unit.lotId) {
        lot = await lotModel.getLotById(unit.lotId);
        if (!lot) errors.push('The selected Unit’s current Lot could not be found.');
      } else if (String(descriptor.template?.print_scope || 'lot') === 'lot') {
        errors.push('The selected Unit has no current Lot. Use Representative Data or choose another Unit.');
      }
    }
  }

  return {
    notFound: false,
    descriptor,
    template: descriptor.template,
    layout,
    unit,
    lot,
    useRepresentativeData: !rawUnitId,
    errors
  };
}

async function buildBuilderTestPrintModalView({
  labelTemplateId,
  currentUser,
  requestedUnitId = '',
  search = '',
  requestedDestinationId = '',
  successMessage = '',
  errorMessages = []
} = {}) {
  const context = await resolveBuilderTestPrintContext(labelTemplateId, requestedUnitId);
  if (context.notFound) return null;

  const searchTerm = String(search || '').trim().slice(0, 120);
  const searchResults = searchTerm
    ? await techUnitModel.searchUnitsByIdentity(searchTerm, 12)
    : [];

  const representativeFieldValues = buildRepresentativeFieldValues();
  const unitFieldValues = context.unit
    ? labelLibraryPrintingService.buildFieldValues(context.unit, context.lot)
    : null;
  const effectiveFieldValues = context.useRepresentativeData ? representativeFieldValues : null;

  let previewDataUri = '';
  const structuralErrors = [...context.errors];
  if (context.descriptor.available && structuralErrors.length === 0) {
    try {
      previewDataUri = await labelLibraryPrintingService.buildDescriptorPreview({
        descriptor: context.descriptor,
        unit: context.unit,
        lot: context.lot,
        fieldValues: effectiveFieldValues
      });
    } catch (error) {
      structuralErrors.push(error.message || 'The test-print preview could not be rendered.');
    }
  }

  const allDestinations = await labelPrinterRuntimeService.listPrintDestinationsForUser({
    userId: currentUser?.user_id,
    roleCodes: currentUser?.roles
  });
  const printers = allDestinations.filter((destination) => (
    labelLibraryPrintingService.destinationSupportsTemplates(destination, [context.descriptor])
  ));
  const selectedPrinterId = selectPreferredStandalonePrintDestination(printers, requestedDestinationId, currentUser);
  const availabilityErrors = [
    ...(allDestinations.length === 0 ? ['No label printers or printer groups are currently available to your account.'] : []),
    ...(allDestinations.length > 0 && printers.length === 0 ? ['No available printer or printer group supports this label profile. Update the printer registry media/profile configuration first.'] : [])
  ];

  return {
    template: context.template,
    descriptor: context.descriptor,
    unit: context.unit,
    lot: context.lot,
    useRepresentativeData: context.useRepresentativeData,
    representativeFieldValues,
    unitFieldValues,
    searchTerm,
    searchResults,
    previewDataUri,
    printers,
    selectedPrinterId,
    successMessage: String(successMessage || ''),
    errorMessages: [...structuralErrors, ...availabilityErrors, ...(Array.isArray(errorMessages) ? errorMessages.filter(Boolean) : [])],
    submitBlocked: structuralErrors.length > 0
      || availabilityErrors.length > 0
      || !previewDataUri
  };
}

async function renderBuilderTestPrintModal(req, res, next) {
  try {
    const view = await buildBuilderTestPrintModalView({
      labelTemplateId: req.params.labelTemplateId,
      currentUser: req.currentUser,
      requestedUnitId: req.query?.unitId,
      search: req.query?.q,
      requestedDestinationId: req.query?.printerId
    });
    if (!view) return res.sendStatus(404);
    return res.render('fragments/label-builder-test-print-modal', view);
  } catch (error) {
    next(error);
  }
}

async function printBuilderTestTemplate(req, res, next) {
  let printJob = null;
  const labelTemplateId = req.params.labelTemplateId;
  const requestedUnitId = req.body?.unitId;
  const requestedDestinationId = String(req.body?.printerId || '').trim();

  try {
    const context = await resolveBuilderTestPrintContext(labelTemplateId, requestedUnitId);
    if (context.notFound) return res.sendStatus(404);

    const errors = [...context.errors];
    let destination = await labelPrinterRuntimeService.resolvePrintDestinationForUser({
      destinationId: requestedDestinationId,
      userId: req.currentUser?.user_id,
      roleCodes: req.currentUser?.roles
    });
    if (!destination) errors.push('Select an available label printer or printer group.');

    if (errors.length === 0 && destination) {
      try {
        destination = await labelLibraryPrintingService.preflightPrintDestination(destination, [context.descriptor]);
      } catch (error) {
        errors.push(error.message || 'The selected printer is offline or unavailable.');
      }
    }

    if (errors.length > 0) {
      const view = await buildBuilderTestPrintModalView({
        labelTemplateId,
        currentUser: req.currentUser,
        requestedUnitId,
        requestedDestinationId,
        errorMessages: errors.filter((message) => !context.errors.includes(message))
      });
      if (!view) return res.sendStatus(404);
      return res.render('fragments/label-builder-test-print-modal', view);
    }

    printJob = await labelPrintHistoryModel.beginPrintJob({
      actorUserId: req.currentUser.user_id,
      source: 'builder_test'
    });

    const representativeFieldValues = context.useRepresentativeData ? buildRepresentativeFieldValues() : null;
    const result = await queueTemplatePrint({
      jobId: printJob.jobId,
      descriptor: context.descriptor,
      unit: context.unit,
      lot: context.lot,
      fieldValues: representativeFieldValues,
      destination,
      copies: 1,
      updateTemplateUsage: false,
      titleLabelPrefix: 'TEST',
      historyUnitLabel: context.useRepresentativeData ? 'Representative Data' : '',
      historyLotName: ''
    });
    const status = result.failureMessage
      ? (result.copiesQueued > 0 ? 'partial' : 'failed')
      : 'queued';
    try {
      await labelPrintHistoryModel.completePrintJob({
        jobId: printJob.jobId,
        status,
        failureMessage: result.failureMessage || null
      });
    } catch (historyError) {
      console.warn('Builder Test Print job finalization failed:', historyError.message);
    }

    if (isHtmxRequest(req) && result.copiesQueued > 0) res.set('HX-Trigger', 'unit-label-queued');
    const routeDetail = destination.kind === 'group'
      ? (result.printerLabels.length === 1 ? ` via ${destination.label} to ${result.printerLabels[0]}` : ` via ${destination.label}`)
      : ` to ${destination.label}`;
    const dataContext = context.useRepresentativeData ? 'Representative Data test label' : 'Test label';
    const successMessage = result.copiesQueued > 0
      ? `${dataContext} queued${routeDetail}. This did not activate, assign, or increment production template usage.`
      : '';

    const view = await buildBuilderTestPrintModalView({
      labelTemplateId,
      currentUser: req.currentUser,
      requestedUnitId,
      requestedDestinationId,
      successMessage,
      errorMessages: result.failureMessage ? [result.failureMessage] : []
    });
    return res.render('fragments/label-builder-test-print-modal', view);
  } catch (error) {
    if (printJob) {
      try {
        await labelPrintHistoryModel.completePrintJob({
          jobId: printJob.jobId,
          status: 'failed',
          failureMessage: error.message || 'The Builder Test Print job failed.'
        });
      } catch (historyError) {
        console.warn('Builder Test Print failure finalization failed:', historyError.message);
      }
    }
    try {
      const view = await buildBuilderTestPrintModalView({
        labelTemplateId,
        currentUser: req.currentUser,
        requestedUnitId,
        requestedDestinationId,
        errorMessages: [error.message || 'The test label could not be queued.']
      });
      if (!view) return res.sendStatus(404);
      return res.render('fragments/label-builder-test-print-modal', view);
    } catch (renderError) {
      return next(renderError);
    }
  }
}

async function renderLabelLibraryPage(req, res, next) {
  try {
    const [allTemplates, assets, storage] = await Promise.all([
      labelLibraryModel.listLabelTemplates({ includeArchived: true }),
      labelLibraryModel.listLabelAssets({ includeArchived: true }),
      labelLibraryModel.getRepositoryStorageSummary()
    ]);
    const templates = applyTemplateFilters(allTemplates, req.query);
    const templateStates = await Promise.all(templates.map(async (template) => ({
      id: Number(template.label_template_id),
      state: await getTemplateLayoutState(template)
    })));
    const stateByTemplateId = new Map(templateStates.map((entry) => [entry.id, entry.state]));
    for (const template of templates) {
      const state = stateByTemplateId.get(Number(template.label_template_id));
      template.layout_ready = state?.ready ? 1 : 0;
      template.layout_issue_count = state?.issues?.length || 0;
    }
    const summary = {
      total: allTemplates.length,
      active: allTemplates.filter((template) => template.status === 'active').length,
      draft: allTemplates.filter((template) => template.status === 'draft').length,
      archived: allTemplates.filter((template) => template.status === 'archived').length,
      newCount: allTemplates.filter((template) => template.new_until && new Date(template.new_until) > new Date()).length
    };

    return res.render('pages/management-label-library', {
      pageTitle: 'Label Template Library',
      currentNav: 'management-label-library',
      templates,
      assets,
      storage,
      summary,
      categories: LABEL_TEMPLATE_CATEGORIES,
      statuses: LABEL_TEMPLATE_STATUSES,
      printScopes: LABEL_TEMPLATE_PRINT_SCOPES,
      filters: {
        search: String(req.query.search || '').trim(),
        category: String(req.query.category || '').trim(),
        status: String(req.query.status || '').trim(),
        printScope: String(req.query.printScope || '').trim()
      },
      canReorderTemplates: !String(req.query.search || '').trim()
        && !String(req.query.category || '').trim()
        && !String(req.query.status || '').trim()
        && !String(req.query.printScope || '').trim(),
      successMessage: getNotice(req.query),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}


function renderTemplateForm(res, { template = null, formData = null, errorMessages = [], statusCode = 200 }) {
  return res.status(statusCode).render('fragments/label-template-form-modal', {
    template,
    categories: LABEL_TEMPLATE_CATEGORIES,
    printScopes: LABEL_TEMPLATE_PRINT_SCOPES,
    mediaWidths: LABEL_BUILDER_MEDIA_WIDTHS,
    formData: formData || {
      name: template?.name || '',
      description: template?.description || '',
      categoryCode: template?.category_code || 'standard',
      printScope: template?.print_scope || 'lot',
      mediaWidthCode: inferLabelBuilderMediaWidth(template || {})?.code || DEFAULT_LABEL_BUILDER_MEDIA_CODE
    },
    errorMessages
  });
}

async function renderNewTemplateModal(req, res, next) {
  try {
    return renderTemplateForm(res, { template: null });
  } catch (error) {
    next(error);
  }
}

async function createTemplate(req, res, next) {
  try {
    const formData = {
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      categoryCode: String(req.body.categoryCode || '').trim(),
      printScope: String(req.body.printScope || '').trim(),
      mediaWidthCode: String(req.body.mediaWidthCode || '').trim()
    };
    const normalized = normalizeTemplateInput(formData);
    await labelLibraryModel.createLabelTemplate(normalized, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?created=1');
  } catch (error) {
    if (error instanceof LabelTemplateInputError) {
      return renderTemplateForm(res, {
        template: null,
        formData: {
          name: String(req.body.name || '').trim(),
          description: String(req.body.description || '').trim(),
          categoryCode: String(req.body.categoryCode || '').trim(),
          printScope: String(req.body.printScope || '').trim(),
          mediaWidthCode: String(req.body.mediaWidthCode || '').trim()
        },
        errorMessages: error.messages,
        statusCode: 400
      });
    }
    next(error);
  }
}

async function renderEditTemplateModal(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) return renderTemplateForm(res, { template: null, errorMessages: ['The label template could not be found.'], statusCode: 404 });
    return renderTemplateForm(res, { template });
  } catch (error) {
    next(error);
  }
}

async function updateTemplate(req, res, next) {
  const templateId = Number(req.params.labelTemplateId);
  try {
    const existing = await labelLibraryModel.getLabelTemplateById(templateId);
    if (!existing) return renderTemplateForm(res, { template: null, errorMessages: ['The label template could not be found.'], statusCode: 404 });
    const formData = {
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      categoryCode: String(req.body.categoryCode || '').trim(),
      printScope: existing.status === 'draft'
        ? String(req.body.printScope || '').trim()
        : String(existing.print_scope || 'lot'),
      mediaWidthCode: inferLabelBuilderMediaWidth(existing)?.code || DEFAULT_LABEL_BUILDER_MEDIA_CODE
    };
    const normalized = normalizeTemplateInput(formData);
    if (existing.status === 'draft' && normalized.printScope === 'standalone' && String(existing.print_scope || 'lot') !== 'standalone') {
      const lotUsage = await labelLibraryModel.listEffectiveTemplateLotUsage(templateId);
      if (lotUsage.length > 0) {
        throw new LabelTemplateInputError('Remove this Draft from all Lot label configurations before changing Print Availability to Standalone.');
      }
    }
    await labelLibraryModel.updateLabelTemplate(templateId, normalized, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?updated=1');
  } catch (error) {
    if (error instanceof LabelTemplateInputError) {
      return renderTemplateForm(res, {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        formData: {
          name: String(req.body.name || '').trim(),
          description: String(req.body.description || '').trim(),
          categoryCode: String(req.body.categoryCode || '').trim(),
          printScope: String(req.body.printScope || '').trim() || String((await labelLibraryModel.getLabelTemplateById(templateId))?.print_scope || 'lot'),
          mediaWidthCode: inferLabelBuilderMediaWidth(await labelLibraryModel.getLabelTemplateById(templateId))?.code || DEFAULT_LABEL_BUILDER_MEDIA_CODE
        },
        errorMessages: error.messages,
        statusCode: 400
      });
    }
    next(error);
  }
}

async function cloneTemplate(req, res, next) {
  try {
    await labelLibraryModel.cloneLabelTemplate(req.params.labelTemplateId, req.currentUser.user_id);
    return sendRedirect(req, res, '/management/label-library?cloned=1');
  } catch (error) {
    next(error);
  }
}

async function renderTemplateLotUsageModal(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) {
      return res.status(404).render('fragments/label-template-lot-usage-modal', {
        template: null,
        activeUsage: [],
        directAttachments: [],
        errorMessages: ['The label template could not be found.']
      });
    }

    const [effectiveUsage, directAttachments] = await Promise.all([
      labelLibraryModel.listEffectiveTemplateLotUsage(template.label_template_id),
      labelLibraryModel.listTemplateLotAttachments(template.label_template_id)
    ]);
    const activeUsage = effectiveUsage.filter((row) => Number(row.is_active) === 1);

    return res.render('fragments/label-template-lot-usage-modal', {
      template,
      activeUsage,
      directAttachments,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renderTemplateActionModal(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) {
      return res.status(404).render('fragments/label-template-action-modal', {
        template: null,
        action: req.params.action,
        attachments: [],
        errorMessages: ['The label template could not be found.']
      });
    }
    const action = String(req.params.action || '').trim();
    if (!['activate', 'archive', 'unarchive', 'delete'].includes(action)) {
      return res.status(404).render('fragments/label-template-action-modal', {
        template,
        action,
        attachments: [],
        errorMessages: ['The requested label action is not available.']
      });
    }
    const attachments = action === 'delete'
      ? await labelLibraryModel.listEffectiveTemplateLotUsage(template.label_template_id)
      : [];
    const layoutState = action === 'activate' ? await getTemplateLayoutState(template, { renderPreflight: true }) : null;
    const errorMessages = action === 'activate' && !layoutState?.ready
      ? (layoutState?.issues?.length ? layoutState.issues : ['This Draft still needs a printable layout before it can be activated.'])
      : [];
    return res.render('fragments/label-template-action-modal', {
      template,
      action,
      attachments,
      errorMessages
    });
  } catch (error) {
    next(error);
  }
}

async function applyTemplateAction(req, res, next) {
  const action = String(req.params.action || '').trim();
  const templateId = Number(req.params.labelTemplateId);
  try {
    if (action === 'delete') {
      const result = await labelLibraryModel.deleteLabelTemplate(templateId, req.currentUser.user_id);
      if (!result) return sendRedirect(req, res, '/management/label-library');
      for (const asset of result.orphanedTransientAssets) {
        try {
          await deleteContentAddressedAsset(asset.relativePath);
        } catch (cleanupError) {
          console.warn('Label Library orphan asset cleanup failed:', cleanupError.message);
        }
      }
      return sendRedirect(req, res, '/management/label-library?deleted=1');
    }

    if (!['activate', 'archive', 'unarchive'].includes(action)) {
      return res.status(400).render('fragments/label-template-action-modal', {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        action,
        attachments: [],
        errorMessages: ['The requested label action is not available.']
      });
    }

    const targetStatus = action === 'activate' ? 'active' : action === 'archive' ? 'archived' : 'draft';
    if (targetStatus === 'active') {
      const template = await labelLibraryModel.getLabelTemplateById(templateId);
      const layoutState = await getTemplateLayoutState(template, { renderPreflight: true });
      if (!layoutState.ready) {
        return res.status(400).render('fragments/label-template-action-modal', {
          template, action, attachments: [], errorMessages: layoutState.issues
        });
      }
    }
    await labelLibraryModel.setLabelTemplateStatus(templateId, targetStatus, req.currentUser.user_id);
    const noticeKey = action === 'activate' ? 'activated' : action === 'archive' ? 'archived' : 'unarchived';
    return sendRedirect(req, res, `/management/label-library?${noticeKey}=1`);
  } catch (error) {
    if (error.code === 'LABEL_TEMPLATE_CONFIG_REQUIRED') {
      return res.status(400).render('fragments/label-template-action-modal', {
        template: await labelLibraryModel.getLabelTemplateById(templateId),
        action,
        attachments: [],
        errorMessages: [error.message]
      });
    }
    next(error);
  }
}


async function renderBuilderQrPreview(req, res, next) {
  try {
    const value = String(req.body?.value || '').slice(0, 500);
    const errorCorrection = String(req.body?.errorCorrection || 'M').trim().toUpperCase();
    if (!value) return res.status(400).type('text/plain').send('QR preview value is required.');
    if (!['L', 'M', 'Q', 'H'].includes(errorCorrection)) {
      return res.status(400).type('text/plain').send('QR error correction is invalid.');
    }
    const svg = await QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: errorCorrection,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('image/svg+xml');
    return res.send(svg);
  } catch (error) {
    next(error);
  }
}

async function searchBuilderPreviewUnits(req, res, next) {
  try {
    const search = String(req.query?.q || '').trim();
    if (!search) return res.json({ ok: true, units: [] });
    const units = await techUnitModel.searchUnitsByIdentity(search, 12);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, units });
  } catch (error) {
    next(error);
  }
}

async function getBuilderUnitPreview(req, res, next) {
  try {
    const unitId = Number(req.params.unitId);
    if (!Number.isSafeInteger(unitId) || unitId < 1) {
      return res.status(400).json({ ok: false, errors: ['The selected Unit ID is invalid.'] });
    }

    const unit = await techUnitModel.getTechUnitLifecycleSummaryById(unitId);
    if (!unit) return res.status(404).json({ ok: false, errors: ['The selected Unit could not be found.'] });
    const lot = unit.lotId ? await lotModel.getLotById(unit.lotId) : null;
    const fieldValues = labelLibraryPrintingService.buildFieldValues(unit, lot);

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      unit: {
        unitId: unit.unitId,
        primaryLabel: String(fieldValues['unit.primary_label'] || `Unit #${unit.unitId}`),
        assetTag: unit.assetTag || '',
        modelDisplay: String(fieldValues['unit.model_display'] || ''),
        lotName: String(fieldValues['lot.name'] || ''),
        isParked: Boolean(unit.isParked)
      },
      fieldValues
    });
  } catch (error) {
    next(error);
  }
}

async function renderTemplateBuilder(req, res, next) {
  try {
    const template = await labelLibraryModel.getLabelTemplateById(req.params.labelTemplateId);
    if (!template) return res.sendStatus(404);
    if (template.status === 'archived') {
      return res.redirect(`/management/label-library?builder_error=${encodeURIComponent('Unarchive this template to Draft before editing its layout.')}`);
    }

    const configAsset = await labelLibraryModel.getTemplateAssetByRole(template.label_template_id, 'config_json');
    let layout = null;
    if (configAsset) {
      const raw = await fs.promises.readFile(resolveAssetAbsolutePath(configAsset.storage_relative_path), 'utf8');
      layout = JSON.parse(raw);
    }
    const media = inferLabelBuilderMediaWidth(template)
      || findLabelBuilderMediaWidth(layout?.mediaWidthCode)
      || findLabelBuilderMediaWidth(DEFAULT_LABEL_BUILDER_MEDIA_CODE);
    const lengthMm = inferLabelBuilderLengthMm(template, layout) || LABEL_BUILDER_DEFAULT_LENGTH_MM;
    const geometry = buildLabelBuilderGeometry(media.code, lengthMm);
    if (!layout) {
      layout = createBlankBuilderLayout({ mediaWidthCode: media.code, lengthMm });
    } else if (!layout.mediaWidthCode || !layout.lengthMm) {
      layout = { ...layout, builderVersion: 2, mediaWidthCode: media.code, lengthMm };
    }
    const [sharedImageAssets, composedValuePresets, effectiveLotUsage] = await Promise.all([
      labelLibraryModel.listLabelAssets({ includeArchived: false })
        .then((assets) => assets.filter(isReusableBuilderImageAsset).map(toBuilderImageAsset)),
      loadComposedValuePresets(),
      labelLibraryModel.listEffectiveTemplateLotUsage(template.label_template_id)
    ]);
    const affectedActiveLotCount = effectiveLotUsage.filter((row) => Number(row.is_active) === 1).length;
    const layoutReadiness = inspectLayoutReadiness(layout);
    const storedReadiness = configAsset ? await getTemplateLayoutState(template) : { ready: false };
    const builderTestPrintReady = Boolean(configAsset)
      && storedReadiness.ready
      && ['draft', 'active'].includes(String(template.status || ''));

    return res.render('pages/management-label-builder', {
      pageTitle: `Label Builder · ${template.name}`,
      currentNav: 'management-label-library',
      template,
      layout,
      mediaWidths: LABEL_BUILDER_MEDIA_WIDTHS,
      fontFamilies: LABEL_BUILDER_FONT_FAMILIES,
      fontWeights: LABEL_BUILDER_FONT_WEIGHTS,
      textAligns: LABEL_BUILDER_TEXT_ALIGNS,
      textCases: LABEL_BUILDER_TEXT_CASES,
      rotations: LABEL_BUILDER_ROTATIONS,
      fieldGroups: LABEL_FIELD_GROUPS,
      sharedImageAssets,
      composedValuePresets,
      activeMedia: media,
      activeGeometry: geometry,
      builderTestPrintReady,
      affectedActiveLotCount
    });
  } catch (error) {
    next(error);
  }
}

async function saveTemplateBuilder(req, res, next) {
  const templateId = Number(req.params.labelTemplateId);
  let stored = null;
  try {
    const template = await labelLibraryModel.getLabelTemplateById(templateId);
    if (!template) return res.status(404).json({ ok: false, errors: ['The label template could not be found.'] });
    if (String(template.status || '') === 'archived') {
      throw new LabelBuilderLayoutError('Unarchive this template to Draft before editing its layout.');
    }
    const mediaWidthCode = String(req.body?.mediaWidthCode || req.body?.layout?.mediaWidthCode || '').trim();
    const media = findLabelBuilderMediaWidth(mediaWidthCode);
    if (!media) throw new LabelBuilderLayoutError('Choose a supported continuous roll width.');
    const lengthMm = req.body?.lengthMm ?? req.body?.layout?.lengthMm;
    const layout = normalizeBuilderLayout(req.body?.layout, { template, mediaWidthCode: media.code, lengthMm });
    const geometry = buildLabelBuilderGeometry(layout.mediaWidthCode, layout.lengthMm);
    if (!geometry) throw new LabelBuilderLayoutError('The selected continuous media geometry is invalid.');
    const reusableAssetLinks = await validateBuilderImageReferences(layout);
    if (String(template.status || '') === 'active') {
      await preflightActiveBuilderLayout(template, layout, geometry, reusableAssetLinks);
    }
    const buffer = Buffer.from(`${JSON.stringify(layout, null, 2)}\n`, 'utf8');
    stored = await writeContentAddressedAsset(buffer, { mimeType: 'application/json' });

    const result = await labelLibraryModel.replaceTemplateConfigAsset(templateId, stored, req.currentUser.user_id, geometry, reusableAssetLinks);
    if (result?.orphanedPreviousAsset) {
      try {
        await deleteContentAddressedAsset(result.orphanedPreviousAsset.relativePath);
      } catch (cleanupError) {
        console.warn('Label Builder prior config cleanup failed:', cleanupError.message);
      }
    }
    const readiness = await getTemplateLayoutState(await labelLibraryModel.getLabelTemplateById(templateId));
    return res.json({
      ok: true,
      changed: result?.changed !== false,
      revision: Number(result?.template?.revision || 0),
      ready: readiness.ready,
      issues: readiness.issues,
      configSha256: stored.sha256
    });
  } catch (error) {
    if (stored?.created) {
      try {
        const existingAsset = await labelLibraryModel.getLabelAssetBySha256(stored.sha256);
        if (!existingAsset) await deleteContentAddressedAsset(stored.relativePath);
      } catch (cleanupError) {
        console.warn('Label Builder failed-save asset cleanup failed:', cleanupError.message);
      }
    }
    if (error instanceof LabelBuilderLayoutError) {
      return res.status(400).json({ ok: false, errors: error.messages });
    }
    next(error);
  }
}

async function reorderTemplates(req, res, next) {
  try {
    const orderedTemplateIds = Array.isArray(req.body?.orderedTemplateIds) ? req.body.orderedTemplateIds : [];
    await labelLibraryModel.reorderLabelTemplates(orderedTemplateIds, req.currentUser.user_id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'The template order could not be saved.' });
  }
}

function getAssetDisplayPriority(asset) {
  const mimeType = String(asset?.mime_type || '');
  const kind = String(asset?.asset_kind || '');
  if (mimeType === 'application/json' || kind.endsWith('_json')) return 90;
  if (kind === 'logo') return 10;
  if (kind === 'image') return 20;
  if (kind === 'background') return 30;
  return 80;
}

function sortAssetRowsForDisplay(assets) {
  return [...(Array.isArray(assets) ? assets : [])].sort((left, right) => {
    const priority = getAssetDisplayPriority(left) - getAssetDisplayPriority(right);
    if (priority) return priority;
    const leftName = String(left?.name || left?.source_filename || '');
    const rightName = String(right?.name || right?.source_filename || '');
    const byName = leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    if (byName) return byName;
    return Number(right?.asset_id || 0) - Number(left?.asset_id || 0);
  });
}

function summarizeAssetRows(assets) {
  const rows = Array.isArray(assets) ? assets : [];
  return rows.reduce((summary, asset) => {
    const bytes = Number(asset?.byte_size || 0);
    summary.asset_count += 1;
    summary.total_bytes += bytes;
    if (String(asset?.mime_type || '') === 'application/json') summary.json_bytes += bytes;
    else summary.image_bytes += bytes;
    return summary;
  }, { asset_count: 0, total_bytes: 0, json_bytes: 0, image_bytes: 0 });
}

async function getAssetListViewData() {
  const assets = sortAssetRowsForDisplay(await labelLibraryModel.listLabelAssets({ includeArchived: true }));
  return { assets, storage: summarizeAssetRows(assets) };
}


async function renderAssetListFragment(req, res, next) {
  try {
    const viewData = await getAssetListViewData();
    res.set('Cache-Control', 'no-store');
    return res.render('fragments/label-library-assets-section', viewData);
  } catch (error) {
    next(error);
  }
}

async function renderAssetRenameModal(req, res, next) {
  try {
    const asset = await labelLibraryModel.getLabelAssetById(req.params.assetId);
    if (!asset) return res.sendStatus(404);
    if (!['image/png', 'image/svg+xml'].includes(String(asset.mime_type || ''))) {
      return res.status(400).render('fragments/label-library-asset-rename-modal', {
        asset,
        assetKinds: LABEL_IMAGE_ASSET_KINDS,
        errorMessages: ['Generated layout/configuration assets are managed by template history and cannot be edited manually.']
      });
    }
    return res.render('fragments/label-library-asset-rename-modal', {
      asset,
      assetKinds: LABEL_IMAGE_ASSET_KINDS,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function renameAsset(req, res, next) {
  const assetId = Number(req.params.assetId);
  const name = String(req.body?.name || '').trim();
  const assetKind = String(req.body?.assetKind || req.body?.kind || '').trim().toLowerCase();
  try {
    const asset = await labelLibraryModel.updateLabelAssetMetadata(assetId, { name, assetKind }, req.currentUser.user_id);
    if (!asset) return res.sendStatus(404);
    if (String(req.get('Accept') || '').includes('application/json')) {
      return res.json({ ok: true, assetId: Number(asset.asset_id), name: asset.name, assetKind: asset.asset_kind });
    }
    return sendRedirect(req, res, '/management/label-library?asset_renamed=1');
  } catch (error) {
    const asset = await labelLibraryModel.getLabelAssetById(assetId);
    if (!asset) return res.sendStatus(404);
    if (String(req.get('Accept') || '').includes('application/json')) {
      return res.status(400).json({ ok: false, errors: [error.message || 'The Shared Asset could not be updated.'] });
    }
    return res.status(400).render('fragments/label-library-asset-rename-modal', {
      asset: { ...asset, name, asset_kind: assetKind || asset.asset_kind },
      assetKinds: LABEL_IMAGE_ASSET_KINDS,
      errorMessages: [error.message || 'The Shared Asset could not be updated.']
    });
  }
}

async function renderAssetDeleteModal(req, res, next) {
  try {
    const asset = await labelLibraryModel.getLabelAssetById(req.params.assetId);
    if (!asset) return res.sendStatus(404);
    const mimeType = String(asset.mime_type || '');
    if (!['image/png', 'image/svg+xml'].includes(mimeType)) {
      return res.status(400).render('fragments/label-library-asset-delete-modal', {
        asset,
        usage: [],
        activeUsage: [],
        errorMessages: ['Generated layout/configuration assets are managed by template history and cannot be deleted manually.']
      });
    }
    const usage = await labelLibraryModel.listLabelAssetTemplateUsage(asset.asset_id);
    return res.render('fragments/label-library-asset-delete-modal', {
      asset,
      usage,
      activeUsage: usage.filter((row) => String(row.template_status) === 'active'),
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAsset(req, res, next) {
  const assetId = Number(req.params.assetId);
  try {
    const asset = await labelLibraryModel.getLabelAssetById(assetId);
    if (!asset) return sendRedirect(req, res, '/management/label-library');
    const usage = await labelLibraryModel.listLabelAssetTemplateUsage(assetId);
    const activeUsage = usage.filter((row) => String(row.template_status) === 'active');
    const confirmation = String(req.body?.confirmation || '').trim();
    if (activeUsage.length && confirmation !== 'DELETE') {
      return res.status(400).render('fragments/label-library-asset-delete-modal', {
        asset,
        usage,
        activeUsage,
        errorMessages: ['Type DELETE exactly to confirm deletion of an asset used by Active templates.']
      });
    }

    const result = await labelLibraryModel.deleteLabelAsset(assetId, req.currentUser.user_id, {
      confirmActiveUsage: activeUsage.length > 0 && confirmation === 'DELETE'
    });
    if (result?.asset?.storage_relative_path) {
      try {
        await deleteContentAddressedAsset(result.asset.storage_relative_path);
      } catch (cleanupError) {
        console.warn('Shared Label Asset file cleanup failed:', cleanupError.message);
      }
    }
    return sendRedirect(req, res, '/management/label-library?asset_deleted=1');
  } catch (error) {
    next(error);
  }
}

async function renderAssetUploadModal(req, res, next) {

  try {
    return res.render('fragments/label-library-asset-upload-modal', {
      assetKinds: LABEL_IMAGE_ASSET_KINDS,
      errorMessages: []
    });
  } catch (error) {
    next(error);
  }
}

async function uploadLabelAsset(req, res, next) {
  let stored = null;
  try {
    const prepared = await prepareLabelAssetUpload(req.body, {
      mimeType: req.get('Content-Type'),
      sourceFilename: req.query.filename,
      assetKind: req.query.kind,
      name: req.query.name
    });
    stored = await writeContentAddressedAsset(prepared.buffer, { mimeType: prepared.mimeType });
    const result = await labelLibraryModel.createOrReuseLabelAsset({
      storedAsset: stored,
      name: prepared.name,
      assetKind: prepared.assetKind,
      mimeType: prepared.mimeType,
      sourceFilename: prepared.sourceFilename,
      widthPixels: prepared.widthPixels,
      heightPixels: prepared.heightPixels,
      hasTransparency: prepared.hasTransparency,
      actorUserId: req.currentUser.user_id
    });

    // The asset transaction is already committed at this point. Do not perform a second
    // asset-list query or EJS fragment render before acknowledging success: if either of those
    // post-commit operations fails, the asset exists but the browser never receives a clean
    // success response. Return the authoritative committed asset itself and let the client add
    // that exact row to the live Shared Assets table.
    const asset = result.asset;
    const redirectUrl = `/management/label-library?${result.created ? 'asset_uploaded' : 'asset_reused'}=1&asset_id=${Number(asset.asset_id)}&_assets=${Date.now()}#label-library-assets-section`;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Location', redirectUrl);
    return res.status(result.created ? 201 : 200).json({
      ok: true,
      assetId: Number(asset.asset_id),
      created: result.created,
      asset: {
        assetId: Number(asset.asset_id),
        name: String(asset.name || asset.source_filename || `Asset ${asset.asset_id}`),
        assetKind: String(asset.asset_kind || 'image'),
        mimeType: String(asset.mime_type || prepared.mimeType || ''),
        byteSize: Number(asset.byte_size || stored.byteSize || 0),
        widthPixels: Number(asset.width_pixels) || null,
        heightPixels: Number(asset.height_pixels) || null,
        sha256: String(asset.sha256 || stored.sha256 || ''),
        sourceFilename: String(asset.source_filename || prepared.sourceFilename || ''),
        createdAt: asset.created_at || new Date().toISOString(),
        templateCount: Number(asset.template_count || 0),
        fileUrl: `/management/label-library/assets/${Number(asset.asset_id)}/file`
      },
      redirect: redirectUrl
    });
  } catch (error) {
    if (stored?.created) {
      try {
        const existingAsset = await labelLibraryModel.getLabelAssetBySha256(stored.sha256);
        if (!existingAsset) await deleteContentAddressedAsset(stored.relativePath);
      } catch (cleanupError) {
        console.warn('Shared Label Asset failed-upload cleanup failed:', cleanupError.message);
      }
    }
    if (error instanceof LabelAssetUploadError) {
      return res.status(error.statusCode || 400).json({ ok: false, errors: [error.message] });
    }
    next(error);
  }
}

async function renderAssetPreviewModal(req, res, next) {
  try {
    const asset = await labelLibraryModel.getLabelAssetById(req.params.assetId);
    if (!asset) return res.sendStatus(404);

    const assetKind = String(asset.asset_kind || '');
    const mimeType = String(asset.mime_type || '');
    let previewKind = 'metadata';
    let jsonPreview = '';
    let previewNote = '';

    if (LABEL_LIBRARY_FILE_ASSET_KINDS.has(assetKind) && mimeType.startsWith('image/')) {
      previewKind = 'image';
    } else if (mimeType === 'application/json' || assetKind.endsWith('_json')) {
      previewKind = 'json';
      if (Number(asset.byte_size || 0) > MAX_LABEL_ASSET_JSON_PREVIEW_BYTES) {
        previewNote = `JSON preview is limited to ${MAX_LABEL_ASSET_JSON_PREVIEW_BYTES / 1024} KB.`;
      } else {
        const absolutePath = resolveAssetAbsolutePath(asset.storage_relative_path);
        const raw = await fs.promises.readFile(absolutePath, 'utf8');
        try {
          jsonPreview = JSON.stringify(JSON.parse(raw), null, 2);
        } catch (error) {
          jsonPreview = raw;
          previewNote = 'Stored file is not valid JSON; showing the stored text instead.';
        }
      }
    }

    return res.render('fragments/label-library-asset-preview-modal', {
      asset,
      previewKind,
      jsonPreview,
      previewNote
    });
  } catch (error) {
    next(error);
  }
}

async function serveAssetFile(req, res, next) {
  try {
    const asset = await labelLibraryModel.getLabelAssetById(req.params.assetId);
    if (!asset) return res.sendStatus(404);
    if (!LABEL_LIBRARY_FILE_ASSET_KINDS.has(String(asset.asset_kind))) return res.sendStatus(404);
    const absolutePath = resolveAssetAbsolutePath(asset.storage_relative_path);
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    if (String(asset.mime_type || '') === 'image/svg+xml') {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    res.type(asset.mime_type);
    return res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  renderLabelLibraryPage,
  renderNewTemplateModal,
  createTemplate,
  renderEditTemplateModal,
  updateTemplate,
  cloneTemplate,
  renderTemplateLotUsageModal,
  renderTemplateActionModal,
  applyTemplateAction,
  renderStandaloneDirectPrintModal,
  printStandaloneTemplate,
  renderBuilderTestPrintModal,
  printBuilderTestTemplate,
  renderBuilderQrPreview,
  searchBuilderPreviewUnits,
  getBuilderUnitPreview,
  renderTemplateBuilder,
  saveTemplateBuilder,
  reorderTemplates,
  renderAssetListFragment,
  renderAssetRenameModal,
  renameAsset,
  renderAssetDeleteModal,
  deleteAsset,
  renderAssetUploadModal,
  uploadLabelAsset,
  renderAssetPreviewModal,
  serveAssetFile
};
