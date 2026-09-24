'use strict';

const fs = require('node:fs');
const labelLibraryModel = require('../models/labelLibraryModel');
const labelPrintingService = require('./labelPrintingService');
const labelPrinterRuntimeService = require('./labelPrinterRuntimeService');
const { resolveAssetAbsolutePath } = require('./labelAssetStorage');
const { renderLayout } = require('./labelTemplateLayoutRenderer');
const { INITIAL_STANDARD_LABEL_TEMPLATE } = require('../config/labelLibrary');
const { findLabelPrinterProfile } = require('../config/labelPrinting');
const { inspectTemplateReadiness } = require('./labelTemplateReadinessService');


function formatCapacityLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  return `${Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2))}GB`;
}

function formatProcessorLongLabel(unit = {}) {
  const brand = String(unit.processorBrandName || '').trim();
  const family = String(unit.processorFamily || '').trim();
  const model = String(unit.processorModelCode || '').trim();
  const parts = [brand];
  if (family && !model.toLowerCase().startsWith(`${family.toLowerCase()} `)) parts.push(family);
  if (model) parts.push(model);
  return parts.filter(Boolean).join(' ').trim();
}

function formatProcessorShortLabel(unit = {}) {
  const rawShortForm = String(unit.processorShortForm || '').trim();
  if (!rawShortForm) return '';

  const shortForm = rawShortForm.replace(/-S(\d+)\b/gi, ' Series $1');
  const brand = String(unit.processorBrandName || '').trim();
  const family = String(unit.processorFamily || '').trim();
  if (/^intel$/i.test(brand) && /^core$/i.test(family) && /^(?:i[3579]|m[357])-/i.test(shortForm)) {
    return `Intel Core ${shortForm}`;
  }
  if (/^intel$/i.test(brand) && /^core ultra$/i.test(family) && /^ultra\s+/i.test(shortForm)) {
    return `Intel Core ${shortForm}`;
  }
  if (brand && !shortForm.toLowerCase().startsWith(`${brand.toLowerCase()} `)) return `${brand} ${shortForm}`;
  return shortForm;
}

function formatOperatingSystemShortLabel(value) {
  return String(value || '')
    .trim()
    .replace(/^Microsoft\s+Windows\b/i, 'Windows')
    .replace(/^Windows\b/i, 'Win');
}

function buildFieldValues(unit = {}, lot = null) {
  const content = labelPrintingService.buildUnitLabelContent(unit, lot);
  const processor = formatProcessorLongLabel(unit);
  const processorShort = formatProcessorShortLabel(unit);
  const operatingSystem = String(unit.operatingSystemLabel || '').trim();
  return Object.freeze({
    'unit.unit_id': Number(unit.unitId) || '',
    'unit.asset_tag': content.assetTag,
    'unit.primary_label': content.primaryLabel,
    'unit.primary_serial': content.serial,
    'unit.unit_serial': String(unit.unitSerialNumber || '').trim(),
    'unit.bios_serial': String(unit.biosSerialNumber || '').trim(),
    'unit.system_uuid': String(unit.systemUuid || '').trim(),
    'unit.category': String(unit.categoryLabel || '').trim(),
    'unit.manufacturer': String(unit.manufacturerName || '').trim(),
    'unit.model': String(unit.modelName || '').trim(),
    'unit.model_display': content.model,
    'unit.processor': processor || String(unit.processorModelCode || '').trim(),
    'unit.processor_short': processorShort,
    'unit.ram': formatCapacityLabel(unit.ramGb),
    'unit.storage': formatCapacityLabel(unit.storageGb),
    'unit.operating_system': operatingSystem,
    'unit.operating_system_short': formatOperatingSystemShortLabel(operatingSystem),
    'unit.spec_line': content.specLine || 'Specifications recorded in BWTDallas',
    'lot.name': content.lotName
  });
}

function toDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function readAssetBuffer(asset) {
  const absolutePath = resolveAssetAbsolutePath(asset.storage_relative_path);
  return fs.promises.readFile(absolutePath);
}

async function loadTemplateRuntime(labelTemplateId) {
  const template = await labelLibraryModel.getLabelTemplateById(labelTemplateId);
  if (!template) throw new Error('The selected Label Library template could not be found.');

  const assets = await labelLibraryModel.listTemplateAssets(labelTemplateId);
  const configAsset = assets.find((asset) => asset.role === 'config_json');
  if (!configAsset) throw new Error(`Label template “${template.name}” does not have a saved layout configuration.`);

  const configBuffer = await readAssetBuffer(configAsset);
  let layout;
  try {
    layout = JSON.parse(configBuffer.toString('utf8'));
  } catch (error) {
    throw new Error(`Label template “${template.name}” has an invalid JSON layout.`);
  }

  const referencedAssetKeys = new Set();
  if (layout.backgroundAssetKey) referencedAssetKeys.add(String(layout.backgroundAssetKey));
  for (const element of Array.isArray(layout.elements) ? layout.elements : []) {
    if (element && element.type === 'image' && element.assetKey) referencedAssetKeys.add(String(element.assetKey));
  }

  const assetDataUris = {};
  for (const assetKey of referencedAssetKeys) {
    const asset = assets.find((candidate) => String(candidate.asset_key) === assetKey);
    if (!asset) throw new Error(`Label template “${template.name}” is missing reusable asset “${assetKey}”.`);
    assetDataUris[assetKey] = toDataUri(await readAssetBuffer(asset), asset.mime_type);
  }

  return Object.freeze({
    template,
    layout,
    assets,
    assetDataUris,
    configAsset
  });
}

function payloadUsesFieldValue(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type === 'field') return true;
  if (payload.type !== 'composed') return false;
  return (Array.isArray(payload.parts) ? payload.parts : []).some((part) => part?.type === 'field');
}

function layoutRequiresUnitContext(layout = {}) {
  return (Array.isArray(layout?.elements) ? layout.elements : []).some((element) => {
    if (!element || typeof element !== 'object') return false;
    if (element.type === 'dynamic_text') return true;
    if (element.type === 'composed_text') {
      return (Array.isArray(element.parts) ? element.parts : []).some((part) => part?.type === 'field');
    }
    if (element.type === 'barcode' || element.type === 'qr') return payloadUsesFieldValue(element.payload);
    return false;
  });
}

async function getStandalonePrintDescriptor(labelTemplateId) {
  const template = await labelLibraryModel.getLabelTemplateById(labelTemplateId);
  if (!template) return null;

  const assets = await labelLibraryModel.listTemplateAssets(labelTemplateId);
  const configAsset = assets.find((asset) => asset.role === 'config_json');
  const readiness = configAsset ? await inspectTemplateReadiness(template, { assets }) : null;
  let unavailableReason = '';
  if (String(template.print_scope || 'lot') !== 'standalone') {
    unavailableReason = 'Only Standalone label templates can print directly from the Label Library.';
  } else if (String(template.status || '') !== 'active') {
    unavailableReason = 'Only Active Standalone label templates can print directly from the Label Library.';
  } else if (!configAsset) {
    unavailableReason = 'This Standalone template does not have a saved layout configuration.';
  } else if (!readiness?.ready) {
    unavailableReason = readiness?.issues?.[0] || 'This Standalone template is not print-ready.';
  }

  return Object.freeze({
    key: `standalone-${Number(template.label_template_id)}`,
    libraryTemplateId: Number(template.label_template_id),
    name: String(template.name || 'Label Template'),
    categoryCode: String(template.category_code || ''),
    available: !unavailableReason,
    unavailableReason,
    mode: 'standalone',
    template,
    configSha256: configAsset ? configAsset.sha256 : null
  });
}

async function getBuilderTestPrintDescriptor(labelTemplateId) {
  const template = await labelLibraryModel.getLabelTemplateById(labelTemplateId);
  if (!template) return null;

  const assets = await labelLibraryModel.listTemplateAssets(labelTemplateId);
  const configAsset = assets.find((asset) => asset.role === 'config_json');
  const readiness = configAsset ? await inspectTemplateReadiness(template, { assets }) : null;
  let unavailableReason = '';
  const status = String(template.status || '');
  if (!['draft', 'active'].includes(status)) {
    unavailableReason = 'Builder Test Print is only available for Draft or Active templates.';
  } else if (!configAsset) {
    unavailableReason = 'Save the layout before using Builder Test Print.';
  } else if (!readiness?.ready) {
    unavailableReason = readiness?.issues?.[0] || 'The saved layout is not print-ready.';
  }

  return Object.freeze({
    key: `builder-test-${Number(template.label_template_id)}`,
    libraryTemplateId: Number(template.label_template_id),
    name: String(template.name || 'Label Template'),
    categoryCode: String(template.category_code || ''),
    available: !unavailableReason,
    unavailableReason,
    mode: 'builder_test',
    template,
    configSha256: configAsset ? configAsset.sha256 : null
  });
}

function normalizeAssignment(assignment = {}) {
  return Object.freeze({
    labelTemplateId: Number(assignment.labelTemplateId ?? assignment.label_template_id),
    isRequired: Number(assignment.isRequired ?? assignment.is_required ?? 0) === 1 || assignment.isRequired === true,
    defaultQuantity: Math.max(1, Math.min(10, Number(assignment.defaultQuantity ?? assignment.default_quantity ?? 1) || 1)),
    sortOrder: Number(assignment.sortOrder ?? assignment.sort_order ?? 10) || 10,
    isActive: assignment.isActive === undefined && assignment.is_active === undefined
      ? true
      : (Number(assignment.isActive ?? assignment.is_active) === 1 || assignment.isActive === true),
    templateName: String(assignment.templateName ?? assignment.template_name ?? ''),
    templateStatus: String(assignment.templateStatus ?? assignment.template_status ?? '')
  });
}

async function buildLibraryDescriptor(assignment) {
  const normalized = normalizeAssignment(assignment);
  const template = await labelLibraryModel.getLabelTemplateById(normalized.labelTemplateId);
  if (!template) {
    return Object.freeze({
      key: `library-${normalized.labelTemplateId}`,
      libraryTemplateId: normalized.labelTemplateId,
      name: normalized.templateName || `Template ${normalized.labelTemplateId}`,
      isRequired: normalized.isRequired,
      defaultQuantity: normalized.defaultQuantity,
      sortOrder: normalized.sortOrder,
      available: false,
      unavailableReason: 'The assigned label template no longer exists.',
      mode: 'library'
    });
  }

  if (template.status !== 'active') {
    return Object.freeze({
      key: `library-${normalized.labelTemplateId}`,
      libraryTemplateId: normalized.labelTemplateId,
      name: template.name,
      isRequired: normalized.isRequired,
      defaultQuantity: normalized.defaultQuantity,
      sortOrder: Number(template.library_sort_order) || normalized.sortOrder,
      available: false,
      unavailableReason: `The assigned template is ${template.status}, not Active.`,
      mode: 'library',
      template
    });
  }

  const assets = await labelLibraryModel.listTemplateAssets(normalized.labelTemplateId);
  const configAsset = assets.find((asset) => asset.role === 'config_json');
  const readiness = configAsset ? await inspectTemplateReadiness(template, { assets }) : null;
  return Object.freeze({
    key: `library-${normalized.labelTemplateId}`,
    libraryTemplateId: normalized.labelTemplateId,
    name: template.name,
    categoryCode: template.category_code,
    isRequired: normalized.isRequired,
    defaultQuantity: normalized.defaultQuantity,
    sortOrder: Number(template.library_sort_order) || normalized.sortOrder,
    available: Boolean(configAsset) && Boolean(readiness?.ready),
    unavailableReason: !configAsset
      ? 'The assigned label template has no saved layout configuration.'
      : readiness?.ready ? '' : (readiness?.issues?.[0] || 'The assigned label template is not print-ready.'),
    mode: 'library',
    template,
    configSha256: configAsset ? configAsset.sha256 : null
  });
}

async function getUnitPrintTemplateSet(lotId) {
  if (!lotId) {
    return Object.freeze({
      source: Object.freeze({ type: 'none', lotId: null, lotName: null }),
      isCompatibilityFallback: false,
      templates: Object.freeze([])
    });
  }

  const effectiveSet = await labelLibraryModel.getEffectiveLotTemplateSet(lotId);
  if (effectiveSet.source.type === 'none') {
    return Object.freeze({
      source: effectiveSet.source,
      isCompatibilityFallback: false,
      templates: Object.freeze([])
    });
  }

  const descriptors = [];
  for (const assignment of effectiveSet.assignments || []) {
    const descriptor = await buildLibraryDescriptor(assignment);
    if (descriptor) descriptors.push(descriptor);
  }

  return Object.freeze({
    source: effectiveSet.source,
    isCompatibilityFallback: false,
    templates: Object.freeze(descriptors.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
  });
}

async function renderDescriptor({ descriptor, unit = null, lot = null, fieldValues = null }) {
  if (!descriptor || !descriptor.available) throw new Error(descriptor?.unavailableReason || 'The selected label template is unavailable.');

  const safeUnit = unit && typeof unit === 'object' ? unit : {};
  const runtime = await loadTemplateRuntime(descriptor.libraryTemplateId);
  const overrideFieldValues = fieldValues && typeof fieldValues === 'object' ? fieldValues : null;
  const effectiveFieldValues = overrideFieldValues || buildFieldValues(safeUnit, lot);
  const rendered = await renderLayout({
    layout: runtime.layout,
    template: runtime.template,
    fieldValues: effectiveFieldValues,
    assetDataUris: runtime.assetDataUris
  });

  const content = overrideFieldValues
    ? Object.freeze({
      primaryLabel: String(effectiveFieldValues['unit.primary_label'] || effectiveFieldValues['unit.asset_tag'] || 'Representative Data').trim() || 'Representative Data',
      lotName: String(effectiveFieldValues['lot.name'] || '').trim()
    })
    : labelPrintingService.buildUnitLabelContent(safeUnit, lot);

  return Object.freeze({
    ...rendered,
    content,
    template: runtime.template
  });
}

async function buildDescriptorPreview({ descriptor, unit, lot, fieldValues = null }) {
  const rendered = await renderDescriptor({ descriptor, unit, lot, fieldValues });
  return rendered.previewDataUri;
}

function assertPrinterTemplateCompatibility(descriptor, printer) {
  const template = descriptor?.template || null;
  const requiredProfile = String(template?.printer_profile_code || INITIAL_STANDARD_LABEL_TEMPLATE.printerProfileCode || '').trim();
  const requiredMedia = String(template?.media_code || INITIAL_STANDARD_LABEL_TEMPLATE.mediaCode || '').trim();
  const printerProfile = String(printer?.printerProfileCode || '').trim();
  const printerMedia = String(printer?.mediaCode || '').trim();

  if (requiredProfile && printerProfile !== requiredProfile) {
    const requiredProfileLabel = findLabelPrinterProfile(requiredProfile)?.label || requiredProfile;
    throw new Error(`${printer?.label || 'The selected printer'} is not configured for ${requiredProfileLabel}. Edit the printer registry entry and select the matching Printer Profile.`);
  }
  if (requiredMedia && printerMedia && printerMedia !== requiredMedia) {
    throw new Error(`${printer?.label || 'The selected printer'} is configured for ${printerMedia}, but this label requires ${requiredMedia}.`);
  }
}

function isPrinterTemplateCompatible(descriptor, printer) {
  try {
    assertPrinterTemplateCompatibility(descriptor, printer);
    return true;
  } catch (_) {
    return false;
  }
}


function destinationSupportsTemplates(destination, descriptors = []) {
  const templates = Array.isArray(descriptors) ? descriptors : [];
  if (!destination) return false;
  if (destination.kind !== 'group') {
    return templates.every((descriptor) => isPrinterTemplateCompatible(descriptor, destination));
  }
  return templates.every((descriptor) => (destination.members || []).some((printer) => isPrinterTemplateCompatible(descriptor, printer)));
}

function bulkCompatiblePrinters(destination, descriptors = []) {
  const templates = Array.isArray(descriptors) ? descriptors : [];
  if (!destination) return [];
  if (destination.kind !== 'group') {
    return templates.every((descriptor) => isPrinterTemplateCompatible(descriptor, destination)) ? [destination] : [];
  }
  return (destination.members || []).filter((printer) => (
    templates.every((descriptor) => isPrinterTemplateCompatible(descriptor, printer))
  ));
}

function bulkDestinationSupportsTemplates(destination, descriptors = []) {
  return bulkCompatiblePrinters(destination, descriptors).length > 0;
}

async function preflightPrintDestination(destination, descriptors = []) {
  if (!destination) throw new Error('Select an available label printer or printer group.');
  if (!destinationSupportsTemplates(destination, descriptors)) {
    throw new Error(`${destination.label || 'The selected destination'} has no compatible printer for the selected label profile.`);
  }
  if (destination.kind !== 'group') return labelPrinterRuntimeService.preparePrinterForSubmission(destination);

  for (const descriptor of descriptors) {
    const compatible = (destination.members || []).filter((printer) => isPrinterTemplateCompatible(descriptor, printer));
    const ranked = await labelPrinterRuntimeService.rankAvailablePrinters(compatible);
    if (!ranked.length) {
      throw new Error(`${destination.label} has no compatible printers online right now. No print job was sent to CUPS.`);
    }
  }
  return destination;
}

async function getRankedDestinationPrinters(destination, descriptor) {
  if (!destination) return Object.freeze([]);
  if (destination.kind !== 'group') return Object.freeze([destination]);
  const compatible = (destination.members || []).filter((printer) => isPrinterTemplateCompatible(descriptor, printer));
  return labelPrinterRuntimeService.rankAvailablePrinters(compatible);
}

async function prepareBulkPrintDestination(destination, descriptors = []) {
  if (!destination) throw new Error('Select an available label printer or printer group.');
  const templates = Array.isArray(descriptors) ? descriptors : [];

  if (destination.kind !== 'group') {
    if (!templates.every((descriptor) => isPrinterTemplateCompatible(descriptor, destination))) {
      throw new Error(`${destination.label || 'The selected printer'} does not support every selected label profile.`);
    }
    return labelPrinterRuntimeService.preparePrinterForSubmission(destination);
  }

  const compatible = bulkCompatiblePrinters(destination, templates);
  if (!compatible.length) {
    throw new Error(`${destination.label} has no single printer compatible with every selected label profile. Bulk group printing keeps one submission together on one physical printer.`);
  }

  const ranked = await labelPrinterRuntimeService.rankAvailablePrinters(compatible);
  if (!ranked.length) {
    throw new Error(`${destination.label} has no single compatible printer online right now. No print job was sent to CUPS.`);
  }
  // rankAvailablePrinters already performed the network reachability probe for the chosen member.
  // Provision/verify its CUPS queue without immediately probing the same endpoint a second time.
  return labelPrinterRuntimeService.ensureCupsQueue(ranked[0]);
}

async function printDescriptor({ descriptor, unit = null, lot = null, fieldValues = null, printer = null, copies, submissionLockHeld = false, skipOnlineProbe = false, titleLabel = '' }) {
  const resolvedPrinter = printer;
  const safeCopies = Number(copies);
  if (!resolvedPrinter || !resolvedPrinter.queue) throw new Error('The selected printer is not available.');
  assertPrinterTemplateCompatibility(descriptor, resolvedPrinter);
  if (!Number.isSafeInteger(safeCopies) || safeCopies < 1 || safeCopies > labelPrintingService.MAX_LABEL_COPIES) {
    throw new Error(`Copies must be between 1 and ${labelPrintingService.MAX_LABEL_COPIES}.`);
  }

  const rendered = await renderDescriptor({ descriptor, unit, lot, fieldValues });
  const submitCopies = async () => {
    const requestIds = [];
    for (let copy = 1; copy <= safeCopies; copy += 1) {
      const contextLabel = String(titleLabel || rendered.content.primaryLabel || 'Standalone').trim().slice(0, 80) || 'Standalone';
      const title = `BWTDallas ${contextLabel} ${descriptor.name} ${copy}/${safeCopies}`;
      try {
        if (!skipOnlineProbe) await labelPrinterRuntimeService.assertPrinterOnline(resolvedPrinter);
        requestIds.push(await labelPrintingService.submitRasterToCups(rendered.raster, { queue: resolvedPrinter.queue, title }));
      } catch (error) {
        error.requestIds = requestIds.slice();
        error.copiesSubmitted = requestIds.length;
        throw error;
      }
    }

    return Object.freeze({
      printer: resolvedPrinter,
      descriptor,
      copies: safeCopies,
      requestIds,
      content: rendered.content
    });
  };

  return submissionLockHeld
    ? submitCopies()
    : labelPrinterRuntimeService.withPrinterSubmissionLock(resolvedPrinter, submitCopies);
}

module.exports = {
  buildFieldValues,
  loadTemplateRuntime,
  layoutRequiresUnitContext,
  getStandalonePrintDescriptor,
  getBuilderTestPrintDescriptor,
  getUnitPrintTemplateSet,
  renderDescriptor,
  buildDescriptorPreview,
  assertPrinterTemplateCompatibility,
  isPrinterTemplateCompatible,
  destinationSupportsTemplates,
  bulkDestinationSupportsTemplates,
  preflightPrintDestination,
  getRankedDestinationPrinters,
  prepareBulkPrintDestination,
  printDescriptor
};
