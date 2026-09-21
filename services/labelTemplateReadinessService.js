'use strict';

const fs = require('node:fs');
const { LABEL_FIELDS } = require('../config/labelFieldRegistry');
const { buildLabelBuilderGeometry } = require('../config/labelBuilder');
const { resolveAssetAbsolutePath } = require('./labelAssetStorage');
const {
  LabelBuilderLayoutError,
  normalizeBuilderLayout,
  inspectLayoutReadiness
} = require('./labelBuilderLayoutPolicy');

const ACTIVE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/svg+xml']);

function uniqueIssues(issues = []) {
  return [...new Set((Array.isArray(issues) ? issues : []).map((issue) => String(issue || '').trim()).filter(Boolean))];
}

function buildRepresentativeFieldValues() {
  return Object.freeze(Object.fromEntries(LABEL_FIELDS.map((field) => [field.key, field.sampleValue ?? ''])));
}

function collectReferencedAssetKeys(layout = {}) {
  const keys = [];
  if (layout.backgroundAssetKey) keys.push(String(layout.backgroundAssetKey).trim().toLowerCase());
  for (const element of Array.isArray(layout.elements) ? layout.elements : []) {
    if (element?.type === 'image' && element.assetKey) keys.push(String(element.assetKey).trim().toLowerCase());
  }
  return [...new Set(keys.filter(Boolean))];
}

function geometryMatchesTemplate(template = {}, geometry = {}) {
  return String(template.printer_profile_code || '') === String(geometry.printerProfileCode || '')
    && String(template.media_code || '') === String(geometry.mediaCode || '')
    && Number(template.dpi) === Number(geometry.dpi)
    && Number(template.canvas_width_dots) === Number(geometry.canvasWidthDots)
    && Number(template.canvas_height_dots) === Number(geometry.canvasHeightDots)
    && Number(template.printable_width_dots) === Number(geometry.printableWidthDots)
    && Number(template.horizontal_offset_dots) === Number(geometry.horizontalOffsetDots)
    && Number(template.feed_margin_dots) === Number(geometry.feedMarginDots);
}

async function readAssetBuffer(asset) {
  return fs.promises.readFile(resolveAssetAbsolutePath(asset.storage_relative_path));
}

async function inspectTemplateReadiness(templateOrId, { renderPreflight = false, assets: providedAssets = null } = {}) {
  const labelLibraryModel = require('../models/labelLibraryModel');
  const template = templateOrId && typeof templateOrId === 'object'
    ? templateOrId
    : await labelLibraryModel.getLabelTemplateById(templateOrId);
  if (!template) {
    return Object.freeze({ ready: false, hasLayout: false, issues: ['The label template could not be found.'], layout: null });
  }

  const assets = Array.isArray(providedAssets) ? providedAssets : await labelLibraryModel.listTemplateAssets(template.label_template_id);
  const configAsset = assets.find((asset) => String(asset.role || '') === 'config_json');
  if (!configAsset) {
    return Object.freeze({ ready: false, hasLayout: false, issues: ['Layout not configured.'], layout: null });
  }

  const issues = [];
  if (String(configAsset.status || '') !== 'active' || String(configAsset.mime_type || '').toLowerCase() !== 'application/json') {
    issues.push('The saved layout configuration asset is unavailable or invalid.');
  }

  let layout = null;
  let normalizedLayout = null;
  try {
    const raw = await readAssetBuffer(configAsset);
    layout = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    issues.push(`Layout could not be read: ${error.message}`);
  }

  if (layout) {
    issues.push(...inspectLayoutReadiness(layout).issues);
    try {
      normalizedLayout = normalizeBuilderLayout(layout, { template: { ...template, status: 'draft' } });
      const geometry = buildLabelBuilderGeometry(normalizedLayout.mediaWidthCode, normalizedLayout.lengthMm);
      if (!geometry) {
        issues.push('The saved label media geometry is invalid.');
      } else if (!geometryMatchesTemplate(template, geometry)) {
        issues.push('The saved template media geometry does not match its layout. Open the Layout Builder and save the Draft again.');
      }
    } catch (error) {
      if (error instanceof LabelBuilderLayoutError) issues.push(...error.messages);
      else issues.push(error.message || 'The saved label layout is invalid.');
    }
  }

  const assetDataUris = {};
  const referencedAssetKeys = collectReferencedAssetKeys(normalizedLayout || layout || {});
  for (const assetKey of referencedAssetKeys) {
    const asset = assets.find((candidate) => String(candidate.asset_key || '').trim().toLowerCase() === assetKey);
    if (!asset) {
      issues.push(`Reusable Shared Asset ${assetKey} is missing from this template.`);
      continue;
    }
    const expectedKey = `shared_${String(asset.sha256 || '').trim().toLowerCase()}`;
    if (expectedKey !== assetKey
      || String(asset.status || '') !== 'active'
      || !ACTIVE_IMAGE_MIME_TYPES.has(String(asset.mime_type || '').toLowerCase())) {
      issues.push(`Reusable Shared Asset ${assetKey} is unavailable or invalid.`);
      continue;
    }
    try {
      const buffer = await readAssetBuffer(asset);
      assetDataUris[assetKey] = `data:${asset.mime_type};base64,${buffer.toString('base64')}`;
    } catch (error) {
      issues.push(`Reusable Shared Asset ${assetKey} could not be read: ${error.message}`);
    }
  }

  let finalIssues = uniqueIssues(issues);
  if (renderPreflight && finalIssues.length === 0 && normalizedLayout) {
    try {
      const { renderLayout } = require('./labelTemplateLayoutRenderer');
      await renderLayout({
        layout: normalizedLayout,
        template,
        fieldValues: buildRepresentativeFieldValues(),
        assetDataUris
      });
    } catch (error) {
      finalIssues = uniqueIssues([...finalIssues, `Representative print preflight failed: ${error.message || 'The layout could not be rendered.'}`]);
    }
  }

  return Object.freeze({
    ready: finalIssues.length === 0,
    hasLayout: true,
    issues: Object.freeze(finalIssues),
    layout: normalizedLayout || layout,
    assetDataUris: Object.freeze({ ...assetDataUris })
  });
}

module.exports = {
  buildRepresentativeFieldValues,
  collectReferencedAssetKeys,
  geometryMatchesTemplate,
  inspectTemplateReadiness
};
