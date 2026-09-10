'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQrDataUris, buildLayoutSvg, renderLayout } = require('./labelTemplateLayoutRenderer');

const template = {
  printer_profile_code: 'brother_ql810w_300dpi',
  canvas_width_dots: 720,
  canvas_height_dots: 360,
  feed_margin_dots: 35
};

const layout = {
  schemaVersion: 1,
  backgroundAssetKey: null,
  elements: [
    { id: 'brand', type: 'static_text', x: 20, y: 10, width: 680, height: 28, text: 'BWT DALLAS', style: { fontSize: 22, fontWeight: 700, align: 'center' } },
    { id: 'asset', type: 'dynamic_text', x: 20, y: 50, width: 680, height: 42, source: { field: 'unit.asset_tag', format: 'upper' }, style: { fontSize: 36, fontWeight: 700, align: 'center', overflow: 'shrink' } },
    { id: 'serial', type: 'composed_text', x: 20, y: 100, width: 680, height: 30, parts: [{ type: 'static', value: 'SN: ' }, { type: 'field', field: 'unit.primary_serial', fallback: '-' }], style: { fontSize: 22, align: 'left' } },
    { id: 'barcode', type: 'barcode', symbology: 'code39', x: 40, y: 180, width: 500, height: 100, payload: { type: 'field', field: 'unit.asset_tag' }, showText: true },
    { id: 'qr', type: 'qr', x: 560, y: 170, width: 120, height: 120, payload: { type: 'composed', parts: [{ type: 'field', field: 'unit.asset_tag' }, { type: 'static', value: '|' }, { type: 'field', field: 'unit.primary_serial' }] }, errorCorrection: 'M' }
  ]
};

const fieldValues = {
  'unit.asset_tag': 'bwt-12345',
  'unit.primary_serial': 'SN-ABC-123'
};

test('generic Label Library SVG resolves allowlisted field values, QR payloads and text', async () => {
  const qrDataUris = await buildQrDataUris(layout, fieldValues);
  const svg = buildLayoutSvg({ layout, template, fieldValues, qrDataUris });
  assert.match(svg, /BWT DALLAS/);
  assert.match(svg, /BWT-12345/);
  assert.match(svg, /SN: SN-ABC-123/);
  assert.match(svg, /<rect/);
  assert.match(svg, /data:image\/svg\+xml;base64/);
});

test('generic QL-810W Label Library renderer produces preview and raster output', async () => {
  const rendered = await renderLayout({ layout, template, fieldValues });
  assert.match(rendered.previewDataUri, /^data:image\/png;base64,/);
  assert.ok(Buffer.isBuffer(rendered.raster));
  assert.ok(rendered.raster.length > 1000);
  assert.equal(rendered.raster[rendered.raster.length - 1], 0x1A);
});
