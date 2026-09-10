'use strict';

const { spawn } = require('node:child_process');
const sharp = require('sharp');
const {
  LABEL_PRINTERS,
  LABEL_TEMPLATES,
  MAX_LABEL_COPIES,
  findLabelPrinter,
  findLabelTemplate
} = require('../config/labelPrinting');

const CODE39_PATTERNS = Object.freeze({
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
  'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
  'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
  'Z':'nwwwwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
  '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
});

function normalizeText(value, maxLength = 120) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeRasterText(value, maxLength = 120) {
  return normalizeText(value, maxLength).toUpperCase();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatCapacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  return `${Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2))}GB`;
}

function buildUnitLabelContent(unit = {}, lot = null) {
  const assetTag = normalizeText(unit.assetTag, 60);
  const model = normalizeText([unit.manufacturerName, unit.modelName].filter(Boolean).join(' '), 90)
    || normalizeText(unit.categoryLabel, 90)
    || 'Unit';
  const serial = normalizeText(unit.unitSerialNumber || unit.biosSerialNumber, 80);
  const ram = formatCapacity(unit.ramGb);
  const storage = formatCapacity(unit.storageGb);
  const specLine = [ram ? `RAM ${ram}` : '', storage ? `STORAGE ${storage}` : ''].filter(Boolean).join('  ');
  const lotName = normalizeText((lot && (lot.lot_name || lot.name)) || unit.lotName, 90);
  const primaryLabel = assetTag || `UNIT #${Number(unit.unitId) || ''}`.trim();

  return {
    assetTag,
    primaryLabel,
    model,
    serial,
    specLine,
    lotName,
    barcodeValue: normalizeRasterText(assetTag, 48).replace(/[^0-9A-Z.\- $/+%]/g, '')
  };
}

function buildCode39Bars(value, narrow = 2, wide = 5, gap = 2) {
  const safeValue = normalizeRasterText(value, 48).replace(/[^0-9A-Z.\- $/+%]/g, '');
  if (!safeValue) return null;
  const encoded = `*${safeValue}*`;
  const bars = [];
  let x = 0;

  for (const character of encoded) {
    const pattern = CODE39_PATTERNS[character];
    if (!pattern) continue;
    let isBar = true;
    for (const element of pattern) {
      const width = element === 'w' ? wide : narrow;
      if (isBar) bars.push({ x, width });
      x += width;
      isBar = !isBar;
    }
    x += gap;
  }

  return { bars, width: x, value: safeValue };
}

function fitSvgText(value, maxWidth, fontSize) {
  const safeText = normalizeText(value, 120);
  if (!safeText) return '';
  const approximateCharacterWidth = Math.max(1, fontSize * 0.59);
  const maxChars = Math.max(1, Math.floor(maxWidth / approximateCharacterWidth));
  if (safeText.length <= maxChars) return safeText;
  if (maxChars <= 3) return safeText.slice(0, maxChars);
  return `${safeText.slice(0, maxChars - 3)}...`;
}

function svgText(text, x, y, size, weight = 500, anchor = 'start', maxWidth = null) {
  const renderedText = maxWidth ? fitSvgText(text, maxWidth, size) : normalizeText(text, 120);
  return `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="#000000">${escapeXml(renderedText)}</text>`;
}

function buildBarcodeSvg(value, left, top, maxWidth, height) {
  if (!value) return '';
  let barcode = buildCode39Bars(value, 3, 7, 3);
  if (!barcode || barcode.width > maxWidth) barcode = buildCode39Bars(value, 2, 5, 2);
  if (!barcode || barcode.width > maxWidth) barcode = buildCode39Bars(value, 1, 3, 1);
  if (!barcode || barcode.width > maxWidth) return '';

  const startX = Math.floor(left + ((maxWidth - barcode.width) / 2));
  return barcode.bars
    .map((bar) => `<rect x="${startX + bar.x}" y="${top}" width="${bar.width}" height="${height}" fill="#000000"/>`)
    .join('');
}

function buildUnitLabelSvg(content, template, { outputScale = 1 } = {}) {
  const width = template.deviceWidthDots;
  const height = template.heightDots;
  const safeOutputScale = Number.isFinite(Number(outputScale)) && Number(outputScale) > 0
    ? Number(outputScale)
    : 1;
  const outputWidth = Math.round(width * safeOutputScale);
  const outputHeight = Math.round(height * safeOutputScale);
  const left = template.offsetDots + 22;
  const right = width - template.offsetDots - 22;
  const usableWidth = right - left;
  const center = Math.round(left + (usableWidth / 2));
  const barcodeSvg = content.barcodeValue
    ? buildBarcodeSvg(content.barcodeValue, left, 232, usableWidth, 72)
    : '';

  return [
    `<svg width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>',
    '<g text-rendering="geometricPrecision">',
    svgText('BWT DALLAS', center, 31, 24, 700, 'middle'),
    svgText(content.primaryLabel, center, 82, 48, 700, 'middle', usableWidth),
    svgText(content.model, left, 126, 28, 700, 'start', usableWidth),
    svgText(content.serial ? `SN: ${content.serial}` : 'SN: -', left, 160, 24, 500, 'start', usableWidth),
    svgText(content.specLine || 'Specifications recorded in BWTDallas', left, 190, 21, 500, 'start', usableWidth),
    svgText(content.lotName ? `Lot: ${content.lotName}` : 'Lot: -', left, 217, 21, 500, 'start', usableWidth),
    '</g>',
    `<g shape-rendering="crispEdges">${barcodeSvg}</g>`,
    content.barcodeValue
      ? svgText(content.barcodeValue, center, 338, 20, 700, 'middle', usableWidth)
      : svgText('No Asset Tag', center, 280, 28, 700, 'middle'),
    '</svg>'
  ].join('');
}

function createBitmap(width, height, monochromeBytes) {
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = monochromeBytes[index] < 128 ? 1 : 0;
  }
  return { width, height, pixels };
}

async function renderUnitLabelBitmap(content, template) {
  const svg = buildUnitLabelSvg(content, template);
  const rendered = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(176)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (rendered.info.width !== template.deviceWidthDots || rendered.info.height !== template.heightDots) {
    throw new Error('The rendered label dimensions do not match the selected printer template.');
  }

  const bitmap = createBitmap(rendered.info.width, rendered.info.height, rendered.data);
  return { bitmap, monochromeBytes: rendered.data, svg };
}

async function buildPreviewPngDataUri(content, template) {
  const previewSvg = buildUnitLabelSvg(content, template, { outputScale: 2 });
  const png = await sharp(Buffer.from(previewSvg))
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return `data:image/png;base64,${png.toString('base64')}`;
}

function uint16le(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function packRasterRow(bitmap, y) {
  const row = Buffer.alloc(bitmap.width / 8, 0);
  for (let outputX = 0; outputX < bitmap.width; outputX += 1) {
    const sourceX = bitmap.width - 1 - outputX;
    if (!bitmap.pixels[(y * bitmap.width) + sourceX]) continue;
    row[Math.floor(outputX / 8)] |= (0x80 >> (outputX % 8));
  }
  return row;
}

function buildBrotherQl810wRaster(bitmap, template) {
  if (bitmap.width !== 720 || bitmap.width % 8 !== 0) {
    throw new Error('QL-810W raster width must be 720 dots.');
  }

  const chunks = [];
  chunks.push(Buffer.from([0x1B, 0x69, 0x61, 0x01]));
  chunks.push(Buffer.alloc(400, 0));
  chunks.push(Buffer.from([0x1B, 0x40]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x61, 0x01]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x53]));

  const mediaFlags = 0x80 | 0x02 | 0x04 | 0x08 | 0x40;
  chunks.push(Buffer.from([0x1B, 0x69, 0x7A, mediaFlags, 0x0A, 0x3E, 0x00]));
  chunks.push(uint32le(bitmap.height));
  chunks.push(Buffer.from([0x00, 0x00]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x4D, 0x40]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x41, 0x01]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x4B, 0x08]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x64]));
  chunks.push(uint16le(template.feedMarginDots));

  for (let y = 0; y < bitmap.height; y += 1) {
    const row = packRasterRow(bitmap, y);
    chunks.push(Buffer.from([0x67, 0x00, row.length]));
    chunks.push(row);
  }

  chunks.push(Buffer.from([0x1A]));
  return Buffer.concat(chunks);
}

async function buildUnitLabelRender(unit, lot, templateId = LABEL_TEMPLATES[0].id) {
  const template = findLabelTemplate(templateId);
  if (!template) throw new Error('The selected label template is not available.');
  const content = buildUnitLabelContent(unit, lot);
  const rendered = await renderUnitLabelBitmap(content, template);
  return {
    content,
    template,
    raster: buildBrotherQl810wRaster(rendered.bitmap, template),
    previewDataUri: await buildPreviewPngDataUri(content, template),
    svg: rendered.svg
  };
}

async function buildUnitLabelRaster(unit, lot, templateId = LABEL_TEMPLATES[0].id) {
  return buildUnitLabelRender(unit, lot, templateId);
}

async function buildUnitLabelPreviewDataUri(unit, lot, templateId = LABEL_TEMPLATES[0].id) {
  const rendered = await buildUnitLabelRender(unit, lot, templateId);
  return rendered.previewDataUri;
}

function submitRasterToCups(raster, { queue, title }) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/lp', ['-d', queue, '-o', 'raw', '-t', title], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('The print request timed out while being submitted to CUPS.'));
    }, 8000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`The CUPS print client could not be started: ${error.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(normalizeText(stderr, 500) || `CUPS rejected the print request with exit code ${code}.`));
        return;
      }
      resolve(normalizeText(stdout, 500));
    });

    child.stdin.on('error', () => {});
    child.stdin.end(raster);
  });
}

async function printUnitLabels({ unit, lot = null, printerId, templateId, copies = 1 }) {
  const printer = findLabelPrinter(printerId);
  const template = findLabelTemplate(templateId);
  const safeCopies = Number(copies);

  if (!printer) throw new Error('The selected printer is not available.');
  if (!template) throw new Error('The selected label template is not available.');
  if (!Number.isSafeInteger(safeCopies) || safeCopies < 1 || safeCopies > MAX_LABEL_COPIES) {
    throw new Error(`Copies must be between 1 and ${MAX_LABEL_COPIES}.`);
  }

  const { raster, content } = await buildUnitLabelRender(unit, lot, template.id);
  const requestIds = [];

  for (let copy = 1; copy <= safeCopies; copy += 1) {
    const title = `BWTDallas ${content.primaryLabel} ${copy}/${safeCopies}`;
    requestIds.push(await submitRasterToCups(raster, { queue: printer.queue, title }));
  }

  return {
    printer,
    template,
    copies: safeCopies,
    requestIds,
    content
  };
}

module.exports = {
  LABEL_PRINTERS,
  LABEL_TEMPLATES,
  MAX_LABEL_COPIES,
  buildUnitLabelContent,
  buildUnitLabelSvg,
  buildUnitLabelPreviewDataUri,
  buildUnitLabelRaster,
  buildUnitLabelRender,
  buildBrotherQl810wRaster,
  buildCode39Bars,
  renderUnitLabelBitmap,
  printUnitLabels,
  submitRasterToCups
};
