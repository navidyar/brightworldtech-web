'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUnitLabelContent,
  buildBrotherQl810wRaster,
  buildCode39Bars,
  buildCode39BarsToFit
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

test('unit label content uses authoritative unit identity and compact specifications', () => {
  const content = buildUnitLabelContent(SAMPLE_UNIT, SAMPLE_LOT);
  assert.equal(content.primaryLabel, 'BWT1234567');
  assert.equal(content.model, 'Dell Latitude 5420');
  assert.equal(content.serial, 'ABC123');
  assert.equal(content.specLine, 'RAM 16GB  STORAGE 512GB');
  assert.equal(content.lotName, 'Production Lot');
  assert.equal(content.barcodeValue, 'BWT1234567');
});

test('Code 39 barcode generation supports the BWTDallas asset-tag character set', () => {
  const barcode = buildCode39Bars('BWT1234567');
  assert.ok(barcode);
  assert.equal(barcode.value, 'BWT1234567');
  assert.equal(barcode.bars.length > 20, true);
  assert.equal(barcode.width > 0, true);
});

test('Code 39 width fitting expands within the allowed whole-dot geometry', () => {
  const narrow = buildCode39BarsToFit('BWT1234567', 300);
  const wide = buildCode39BarsToFit('BWT1234567', 700);
  assert.ok(narrow);
  assert.ok(wide);
  assert.equal(wide.width > narrow.width, true);
});

test('QL-810W raster output is a complete raw job with one line per label row', () => {
  const bitmap = { width: 720, height: 2, pixels: new Uint8Array(720 * 2) };
  const raster = buildBrotherQl810wRaster(bitmap, { feedMarginDots: 35, mediaCode: '62mm_continuous' });
  assert.equal(Buffer.isBuffer(raster), true);
  assert.equal(raster.subarray(0, 4).equals(Buffer.from([0x1B, 0x69, 0x61, 0x01])), true);
  assert.equal(raster.at(-1), 0x1A);

  let rasterLineCount = 0;
  for (let offset = 0; offset <= raster.length - 3; offset += 1) {
    if (raster[offset] === 0x67 && raster[offset + 1] === 0x00 && raster[offset + 2] === 90) {
      rasterLineCount += 1;
      offset += 92;
    }
  }
  assert.equal(rasterLineCount, 2);
});

test('QL-810W raster print-information command uses the selected continuous media width', () => {
  const bitmap = { width: 720, height: 2, pixels: new Uint8Array(720 * 2) };
  const raster = buildBrotherQl810wRaster(bitmap, { feedMarginDots: 35, mediaCode: '38mm_continuous' });
  const flags = 0x80 | 0x02 | 0x04 | 0x08 | 0x40;
  assert.equal(raster.includes(Buffer.from([0x1B, 0x69, 0x7A, flags, 0x0A, 38, 0x00])), true);
});
