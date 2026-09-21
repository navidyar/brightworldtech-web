'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes Barcode and QR content types with payload controls', () => {
  const view = source('views/pages/management-label-builder.ejs');
  assert.match(view, /<option value="barcode">Barcode<\/option>/);
  assert.match(view, /<option value="qr">QR Code<\/option>/);
  assert.match(view, /Payload Source/);
  assert.match(view, /BWTDallas Field/);
  assert.match(view, /Static Value/);
  assert.match(view, /Composed Value/);
  assert.match(view, /Code 39/);
  assert.match(view, /Print payload text below bars/);
  assert.match(view, /Payload Text Size \(dots\)/);
  assert.match(view, /data-builder-barcode-text-size/);
  assert.match(view, /QR Error Correction/);
});

test('Builder renders Barcode and QR previews without flattening the label canvas', () => {
  const js = source('public/js/label-builder.js');
  const css = `${source('public/css/app.css')}\n${source('public/css/features.css')}`;
  assert.match(js, /buildCode39Bars/);
  assert.match(js, /renderBarcodePreview/);
  assert.match(js, /humanReadableFontSize/);
  assert.match(js, /getQrPreviewUrl/);
  assert.match(js, /builder\/qr-preview/);
  assert.match(css, /label-builder-region-barcode/);
  assert.match(css, /label-builder-region-qr/);
  assert.doesNotMatch(js, /canvas\.toDataURL|canvas\.toBlob/);
});

test('QR preview endpoint reuses the installed server QR renderer and remains Management-only', () => {
  const controller = source('controllers/labelLibraryController.js');
  const routes = source('routes/management.js');
  assert.match(controller, /QRCode\.toString/);
  assert.match(controller, /renderBuilderQrPreview/);
  assert.match(routes, /\/management\/label-library\/builder\/qr-preview/);
  assert.match(routes, /requireRole\(managementRoles\)/);
});

test('Barcode and QR instructions remain structured config_json and use existing production renderer types', () => {
  const policy = source('services/labelBuilderLayoutPolicy.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(policy, /type === 'barcode'/);
  assert.match(policy, /type === 'qr'/);
  assert.match(policy, /normalizePayload/);
  assert.match(renderer, /case 'barcode'/);
  assert.match(renderer, /humanReadableFontSize/);
  assert.match(renderer, /fontFamily: 'Liberation Sans'/);
  assert.match(renderer, /fontSize: Math\.min\(humanReadableFontSize/);
  assert.match(renderer, /case 'qr'/);
  assert.match(renderer, /buildQrDataUris/);
});
