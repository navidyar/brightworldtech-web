'use strict';

const { spawn } = require('node:child_process');
const { LABEL_PRINTERS, MAX_LABEL_COPIES } = require('../config/labelPrinting');
const { findQl810wContinuousMedia } = require('../config/labelMedia');

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

function buildCode39BarsToFit(value, maxWidth) {
  const availableWidth = Math.max(1, Math.floor(Number(maxWidth) || 0));
  let best = null;

  // Code 39 allows a 2:1 through 3:1 wide:narrow ratio. Search every valid
  // whole-dot geometry instead of fixing one ratio first. This lets a wider
  // region actually produce a wider barcode while still reserving ten narrow
  // modules of quiet space on both sides.
  for (let narrow = 1; narrow <= 64; narrow += 1) {
    const gap = narrow;
    const quietZone = narrow * 10;
    for (let wide = narrow * 2; wide <= narrow * 3; wide += 1) {
      const barcode = buildCode39Bars(value, narrow, wide, gap);
      if (!barcode) return null;
      if (barcode.width + (quietZone * 2) > availableWidth) break;
      if (!best || barcode.width > best.width) {
        best = { ...barcode, narrow, wide, gap, quietZone };
      }
    }
  }

  if (best) return best;

  // Preserve the previous minimum-size behavior for very tight regions.
  const fallback = buildCode39Bars(value, 1, 3, 1);
  if (!fallback || fallback.width > availableWidth) return null;
  return { ...fallback, narrow: 1, wide: 3, gap: 1, quietZone: 0 };
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

function buildBrotherQl810wRaster(bitmap, template = {}) {
  if (bitmap.width !== 720 || bitmap.width % 8 !== 0) {
    throw new Error('QL-810W raster width must be 720 dots.');
  }

  const mediaCode = String(template.mediaCode || template.media_code || '62mm_continuous').trim();
  const media = findQl810wContinuousMedia(mediaCode);
  if (!media) throw new Error(`Unsupported QL-810W continuous media width: ${mediaCode || '(blank)'}.`);

  const chunks = [];
  chunks.push(Buffer.from([0x1B, 0x69, 0x61, 0x01]));
  chunks.push(Buffer.alloc(400, 0));
  chunks.push(Buffer.from([0x1B, 0x40]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x61, 0x01]));
  chunks.push(Buffer.from([0x1B, 0x69, 0x53]));

  const mediaFlags = 0x80 | 0x02 | 0x04 | 0x08 | 0x40;
  chunks.push(Buffer.from([0x1B, 0x69, 0x7A, mediaFlags, 0x0A, media.widthMm, 0x00]));
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

module.exports = {
  LABEL_PRINTERS,
  MAX_LABEL_COPIES,
  buildUnitLabelContent,
  buildBrotherQl810wRaster,
  buildCode39Bars,
  buildCode39BarsToFit,
  submitRasterToCups
};
