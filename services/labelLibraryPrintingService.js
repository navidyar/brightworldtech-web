'use strict';

const fs = require('node:fs');
const labelLibraryModel = require('../models/labelLibraryModel');
const labelPrintingService = require('./labelPrintingService');
const { resolveAssetAbsolutePath } = require('./labelAssetStorage');
const { renderLayout } = require('./labelTemplateLayoutRenderer');
const { INITIAL_STANDARD_LABEL_TEMPLATE } = require('../config/labelLibrary');

const LEGACY_FALLBACK_KEY = 'legacy-standard-unit-62';
const LEGACY_RENDERER_ID = 'standard-unit-62';

function buildFieldValues(unit = {}, lot = null) {
  const content = labelPrintingService.buildUnitLabelContent(unit, lot);
  return Object.freeze({
    'unit.unit_id': Number(unit.unitId) || '',
    'unit.asset_tag': content.assetTag,
    'unit.primary_label': content.primaryLabel,
    'unit.model_display': content.model,
    'unit.primary_serial': content.serial,
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

function normalizeAssignment(assignment = {}) {
  return Object.freeze({
    labelTemplateId: Number(assignment.labelTemplateId),
    isRequired: Boolean(assignment.isRequired),
    defaultQuantity: Math.max(1, Math.min(10, Number(assignment.defaultQuantity) || 1)),
    sortOrder: Number(assignment.sortOrder) || 10,
    isActive: Boolean(assignment.isActive),
    templateName: String(assignment.templateName || ''),
    templateStatus: String(assignment.templateStatus || '')
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

  if (!normalized.isActive) return null;
  if (template.status !== 'active') {
    return Object.freeze({
      key: `library-${normalized.labelTemplateId}`,
      libraryTemplateId: normalized.labelTemplateId,
      name: template.name,
      isRequired: normalized.isRequired,
      defaultQuantity: normalized.defaultQuantity,
      sortOrder: normalized.sortOrder,
      available: false,
      unavailableReason: `The assigned template is ${template.status}, not Active.`,
      mode: 'library',
      template
    });
  }

  const assets = await labelLibraryModel.listTemplateAssets(normalized.labelTemplateId);
  const configAsset = assets.find((asset) => asset.role === 'config_json');
  return Object.freeze({
    key: `library-${normalized.labelTemplateId}`,
    libraryTemplateId: normalized.labelTemplateId,
    name: template.name,
    categoryCode: template.category_code,
    isRequired: normalized.isRequired,
    defaultQuantity: normalized.defaultQuantity,
    sortOrder: normalized.sortOrder,
    available: Boolean(configAsset),
    unavailableReason: configAsset ? '' : 'The assigned label template has no saved layout configuration.',
    mode: 'library',
    template,
    configSha256: configAsset ? configAsset.sha256 : null
  });
}

async function buildFallbackDescriptor() {
  const initialTemplate = await labelLibraryModel.getInitialRegisteredLabelTemplate();
  let configSha256 = null;
  if (initialTemplate) {
    const assets = await labelLibraryModel.listTemplateAssets(initialTemplate.label_template_id);
    configSha256 = assets.find((asset) => asset.role === 'config_json')?.sha256 || null;
  }

  return Object.freeze({
    key: LEGACY_FALLBACK_KEY,
    libraryTemplateId: initialTemplate ? Number(initialTemplate.label_template_id) : null,
    name: initialTemplate?.name || INITIAL_STANDARD_LABEL_TEMPLATE.name,
    categoryCode: initialTemplate?.category_code || 'standard',
    isRequired: true,
    defaultQuantity: 1,
    sortOrder: 10,
    available: true,
    unavailableReason: '',
    mode: 'legacy_fallback',
    template: initialTemplate || null,
    configSha256
  });
}

async function getUnitPrintTemplateSet(lotId) {
  if (!lotId) {
    return Object.freeze({
      source: Object.freeze({ type: 'none', lotId: null, lotName: null }),
      isCompatibilityFallback: true,
      templates: Object.freeze([await buildFallbackDescriptor()])
    });
  }

  const effectiveSet = await labelLibraryModel.getEffectiveLotTemplateSet(lotId);
  if (effectiveSet.source.type === 'none') {
    return Object.freeze({
      source: effectiveSet.source,
      isCompatibilityFallback: true,
      templates: Object.freeze([await buildFallbackDescriptor()])
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

async function renderDescriptor({ descriptor, unit, lot }) {
  if (!descriptor || !descriptor.available) throw new Error(descriptor?.unavailableReason || 'The selected label template is unavailable.');

  if (descriptor.mode === 'legacy_fallback') {
    return labelPrintingService.buildUnitLabelRender(unit, lot, LEGACY_RENDERER_ID);
  }

  const runtime = await loadTemplateRuntime(descriptor.libraryTemplateId);
  if (runtime.layout.legacyRendererId === LEGACY_RENDERER_ID) {
    return labelPrintingService.buildUnitLabelRender(unit, lot, LEGACY_RENDERER_ID);
  }

  const rendered = await renderLayout({
    layout: runtime.layout,
    template: runtime.template,
    fieldValues: buildFieldValues(unit, lot),
    assetDataUris: runtime.assetDataUris
  });

  return Object.freeze({
    ...rendered,
    content: labelPrintingService.buildUnitLabelContent(unit, lot),
    template: runtime.template
  });
}

async function buildDescriptorPreview({ descriptor, unit, lot }) {
  const rendered = await renderDescriptor({ descriptor, unit, lot });
  return rendered.previewDataUri;
}

async function printDescriptor({ descriptor, unit, lot, printerId, copies }) {
  const printer = labelPrintingService.LABEL_PRINTERS.find((candidate) => candidate.id === String(printerId || '').trim());
  const safeCopies = Number(copies);
  if (!printer) throw new Error('The selected printer is not available.');
  if (!Number.isSafeInteger(safeCopies) || safeCopies < 1 || safeCopies > labelPrintingService.MAX_LABEL_COPIES) {
    throw new Error(`Copies must be between 1 and ${labelPrintingService.MAX_LABEL_COPIES}.`);
  }

  const rendered = await renderDescriptor({ descriptor, unit, lot });
  const requestIds = [];
  for (let copy = 1; copy <= safeCopies; copy += 1) {
    const title = `BWTDallas ${rendered.content.primaryLabel} ${descriptor.name} ${copy}/${safeCopies}`;
    try {
      requestIds.push(await labelPrintingService.submitRasterToCups(rendered.raster, { queue: printer.queue, title }));
    } catch (error) {
      error.requestIds = requestIds.slice();
      error.copiesSubmitted = requestIds.length;
      throw error;
    }
  }

  return Object.freeze({
    printer,
    descriptor,
    copies: safeCopies,
    requestIds,
    content: rendered.content
  });
}

module.exports = {
  LEGACY_FALLBACK_KEY,
  LEGACY_RENDERER_ID,
  buildFieldValues,
  loadTemplateRuntime,
  getUnitPrintTemplateSet,
  renderDescriptor,
  buildDescriptorPreview,
  printDescriptor
};
