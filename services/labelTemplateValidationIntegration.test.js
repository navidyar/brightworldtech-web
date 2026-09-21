'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Label Library centralizes saved-layout readiness and repeats full preflight on activation', () => {
  const controller = read('controllers/labelLibraryController.js');
  assert.match(controller, /inspectTemplateReadiness/);
  assert.match(controller, /getTemplateLayoutState\(template, \{ renderPreflight: true \}\)/);
  assert.match(controller, /const readiness = await getTemplateLayoutState\(await labelLibraryModel\.getLabelTemplateById\(templateId\)\)/);
});

test('activation modal blocks on any final validation error rather than config presence alone', () => {
  const modal = read('views/fragments/label-template-action-modal.ejs');
  assert.match(modal, /activationBlocked = action === 'activate' && safeErrors\.length > 0/);
  assert.match(modal, /media geometry, Shared Assets, dynamic fields, barcode\/QR configuration, and a representative render/);
});

test('all direct, test, and Lot production descriptors require central print-readiness', () => {
  const service = read('services/labelLibraryPrintingService.js');
  assert.match(service, /inspectTemplateReadiness/);
  assert.match(service, /getStandalonePrintDescriptor[\s\S]*?readiness\?\.ready/);
  assert.match(service, /getBuilderTestPrintDescriptor[\s\S]*?readiness\?\.ready/);
  assert.match(service, /buildLibraryDescriptor[\s\S]*?available: Boolean\(configAsset\) && Boolean\(readiness\?\.ready\)/);
});

test('layout readiness explicitly validates barcode symbology and QR error correction', () => {
  const policy = read('services/labelBuilderLayoutPolicy.js');
  assert.match(policy, /Barcode region \$\{id\} must use Code 39/);
  assert.match(policy, /QR region \$\{id\} has an invalid error-correction level/);
  assert.match(policy, /unsupported composed-value part/);
});


test('central readiness validates structured layouts without a legacy renderer branch', () => {
  const service = read('services/labelTemplateReadinessService.js');
  assert.doesNotMatch(service, /LEGACY_RENDERER_ID|legacyGeometryMatchesTemplate|buildLegacyRepresentativeContext/);
  assert.match(service, /normalizeBuilderLayout/);
  assert.match(service, /renderLayout/);
});
