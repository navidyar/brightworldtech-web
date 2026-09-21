'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQrDataUris, buildLayoutSvg, padBitmapToDeviceWidth, renderLayout } = require('./labelTemplateLayoutRenderer');

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
    { id: 'barcode', type: 'barcode', symbology: 'code39', x: 40, y: 180, width: 500, height: 100, payload: { type: 'field', field: 'unit.asset_tag' }, showText: true, humanReadableFontSize: 32 },
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
  assert.match(svg, /font-size="32"/);
  assert.match(svg, /data:image\/svg\+xml;base64/);
});

test('generic QL-810W Label Library renderer produces preview and raster output', async () => {
  const rendered = await renderLayout({ layout, template, fieldValues });
  assert.match(rendered.previewDataUri, /^data:image\/png;base64,/);
  assert.ok(Buffer.isBuffer(rendered.raster));
  assert.ok(rendered.raster.length > 1000);
  assert.equal(rendered.raster[rendered.raster.length - 1], 0x1A);
});

test('narrow continuous media is padded into the documented 720-dot device raster', () => {
  const source = { width: 413, height: 1, pixels: new Uint8Array(413).fill(1) };
  const padded = padBitmapToDeviceWidth(source, { deviceWidthDots: 720, horizontalOffsetDots: 295 });
  assert.equal(padded.width, 720);
  assert.equal(padded.pixels[294], 0);
  assert.equal(padded.pixels[295], 1);
  assert.equal(padded.pixels[707], 1);
  assert.equal(padded.pixels[708], 0);
});

test('generic renderer accepts a 38 mm continuous logical canvas', async () => {
  const narrowTemplate = {
    printer_profile_code: 'brother_ql810w_300dpi',
    media_code: '38mm_continuous',
    canvas_width_dots: 413,
    canvas_height_dots: 300,
    printable_width_dots: 413,
    horizontal_offset_dots: 295,
    feed_margin_dots: 35
  };
  const narrowLayout = {
    schemaVersion: 1,
    elements: [{ id: 'text', type: 'static_text', x: 10, y: 10, width: 393, height: 40, text: 'NARROW LABEL', style: { fontSize: 24, align: 'center' } }]
  };
  const rendered = await renderLayout({ layout: narrowLayout, template: narrowTemplate, fieldValues: {} });
  assert.ok(Buffer.isBuffer(rendered.raster));
  assert.match(rendered.previewDataUri, /^data:image\/png;base64,/);
});


test('generic renderer keeps reusable SVG image assets vector-backed and applies quarter-turn rotation', () => {
  const assetKey = `shared_${'b'.repeat(64)}`;
  const imageLayout = {
    schemaVersion: 1,
    elements: [{ id: 'logo', type: 'image', assetKey, x: 20, y: 20, width: 120, height: 60, rotation: 90, fit: 'contain' }]
  };
  const vectorDataUri = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>').toString('base64')}`;
  const svg = buildLayoutSvg({ layout: imageLayout, template, assetDataUris: { [assetKey]: vectorDataUri } });
  assert.match(svg, /data:image\/svg\+xml;base64/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /rotate\(90 /);
});

test('generic renderer keeps Line and Rectangle objects vector-backed with quarter-turn rotation', () => {
  const shapeLayout = {
    schemaVersion: 1,
    elements: [
      { id: 'divider', type: 'line', x: 20, y: 20, width: 300, height: 20, thickness: 5, rotation: 90 },
      { id: 'box', type: 'rectangle', x: 340, y: 40, width: 180, height: 90, thickness: 4, fill: 'outline' },
      { id: 'block', type: 'rectangle', x: 340, y: 150, width: 100, height: 50, fill: 'filled' }
    ]
  };
  const svg = buildLayoutSvg({ layout: shapeLayout, template });
  assert.match(svg, /<line /);
  assert.match(svg, /stroke-width="5"/);
  assert.match(svg, /rotate\(90 /);
  assert.match(svg, /fill="none" stroke="#000000"/);
  assert.match(svg, /fill="#000000"/);
});


test('generic renderer preserves As Stored text and applies Camel Case only when requested', () => {
  const caseLayout = {
    schemaVersion: 1,
    elements: [
      {
        id: 'stored', type: 'dynamic_text', x: 20, y: 20, width: 300, height: 40,
        source: { field: 'unit.operating_system_short' },
        style: { fontSize: 24, textCase: 'plain' }
      },
      {
        id: 'camel', type: 'dynamic_text', x: 20, y: 70, width: 300, height: 40,
        source: { field: 'unit.operating_system_raw' },
        style: { fontSize: 24, textCase: 'camel' }
      }
    ]
  };
  const svg = buildLayoutSvg({
    layout: caseLayout,
    template,
    fieldValues: {
      'unit.operating_system_short': 'Win 11 Pro',
      'unit.operating_system_raw': 'win 11 pro'
    }
  });

  assert.match(svg, />Win 11 Pro<\/text>/);
  assert.doesNotMatch(svg, />WIN 11 Pro<\/text>/);
  assert.equal((svg.match(/>Win 11 Pro<\/text>/g) || []).length, 2);
});
