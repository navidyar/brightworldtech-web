'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LABEL_PRINTERS,
  LABEL_TEMPLATES,
  buildUnitLabelContent,
  buildUnitLabelSvg,
  buildUnitLabelPreviewDataUri,
  buildUnitLabelRaster,
  buildCode39Bars
} = require('./labelPrintingService');

const SAMPLE_UNIT = Object.freeze({
  unitId: 42,
  assetTag: 'BWT1234567',
  manufacturerName: 'Dell',
  modelName: 'Latitude 5420',
  unitSerialNumber: 'ABC123',
  biosSerialNumber: 'BIOS123',
  ramGb: 16,
  storageGb: 512,
  lotName: 'Fallback Lot'
});

const SAMPLE_LOT = Object.freeze({ lot_name: 'Production Lot' });

test('label printing exposes fixed server-side printer and template allowlists', () => {
  assert.equal(LABEL_PRINTERS.length >= 1, true);
  assert.equal(LABEL_PRINTERS[0].queue, 'BWT_NavidPrinter');
  assert.equal(LABEL_TEMPLATES[0].id, 'standard-unit-62');
  assert.equal(LABEL_TEMPLATES[0].deviceWidthDots, 720);
});

test('unit label content uses authoritative unit identity and compact specifications', () => {
  const content = buildUnitLabelContent(SAMPLE_UNIT, SAMPLE_LOT);

  assert.equal(content.primaryLabel, 'BWT1234567');
  assert.equal(content.model, 'Dell Latitude 5420');
  assert.equal(content.serial, 'ABC123');
  assert.equal(content.specLine, 'RAM 16GB  STORAGE 512GB');
  assert.equal(content.lotName, 'Production Lot');
  assert.equal(content.barcodeValue, 'BWT1234567');
});

test('shared physical-label SVG escapes Unit-controlled text', () => {
  const svg = buildUnitLabelSvg({
    primaryLabel: 'BWT1<2',
    model: 'A&B',
    serial: 'SERIAL"1',
    specLine: 'RAM 16GB',
    lotName: '<script>alert(1)</script>',
    barcodeValue: 'BWT12'
  }, LABEL_TEMPLATES[0]);

  assert.match(svg, /BWT1&lt;2/);
  assert.match(svg, /A&amp;B/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /font-family="DejaVu Sans"/);
});

test('Code 39 barcode generation supports the BWTDallas asset-tag character set', () => {
  const barcode = buildCode39Bars('BWT1234567');
  assert.ok(barcode);
  assert.equal(barcode.value, 'BWT1234567');
  assert.equal(barcode.bars.length > 20, true);
  assert.equal(barcode.width > 0, true);
});

test('preview is a higher-resolution PNG rendered from the same server-side SVG layout as the physical label', async () => {
  const previewSvg = buildUnitLabelSvg(buildUnitLabelContent(SAMPLE_UNIT, SAMPLE_LOT), LABEL_TEMPLATES[0], { outputScale: 2 });
  assert.match(previewSvg, /width=\"1440\" height=\"720\" viewBox=\"0 0 720 360\"/);

  const previewDataUri = await buildUnitLabelPreviewDataUri(SAMPLE_UNIT, SAMPLE_LOT);
  assert.match(previewDataUri, /^data:image\/png;base64,/);
  const png = Buffer.from(previewDataUri.slice('data:image/png;base64,'.length), 'base64');
  assert.equal(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), true);
});

test('QL-810W raster output is a complete 720-dot raw job with one line per label row', async () => {
  const { raster, template } = await buildUnitLabelRaster(SAMPLE_UNIT, SAMPLE_LOT);

  assert.equal(Buffer.isBuffer(raster), true);
  assert.equal(raster.subarray(0, 4).equals(Buffer.from([0x1B, 0x69, 0x61, 0x01])), true);
  assert.equal(raster.at(-1), 0x1A);
  assert.equal(raster.includes(Buffer.from([0x1B, 0x69, 0x7A])), true);
  assert.equal(raster.includes(Buffer.from([0x1B, 0x69, 0x4D, 0x40])), true);

  let rasterLineCount = 0;
  for (let offset = 0; offset <= raster.length - 3; offset += 1) {
    if (raster[offset] === 0x67 && raster[offset + 1] === 0x00 && raster[offset + 2] === 90) {
      rasterLineCount += 1;
      offset += 92;
    }
  }
  assert.equal(rasterLineCount, template.heightDots);
});
