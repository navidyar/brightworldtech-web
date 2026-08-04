'use strict';

const zlib = require('node:zlib');
const { UNIT_EXPORT_COLUMNS } = require('../config/unitExportContract');
const { APP_DISPLAY_TIME_ZONE, formatDateKey } = require('../utils/timeZone');
const { formatHardwareCapacityGb } = require('./hardwareCapacity');

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_FILE_PREFIX = 'bwtdallas-units';
const BATTERY_HEALTH_COLUMN_KEY = 'batteryHealth';
const WRAPPED_COLUMN_KEYS = new Set([
  'hardwareRemarks',
  'cosmeticRemarks',
  'previousMemoryModules',
  'currentMemoryModules',
  'memoryModuleChanges',
  'previousStorageDevices',
  'currentStorageDevices',
  'storageDeviceChanges'
]);
const FORMULA_PREFIX_PATTERN = /^[\s\u0000-\u001f]*[=+\-@]/;
const XML_INVALID_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

const XLSX_COLUMN_WIDTHS = Object.freeze({
  assetTag: 14,
  unitSerialNumber: 20,
  biosSerialNumber: 20,
  unitType: 16,
  manufacturer: 18,
  model: 24,
  cpu: 30,
  shortForm: 13,
  previousMemorySize: 16,
  currentMemorySize: 16,
  previousStorageSize: 16,
  currentStorageSize: 16,
  previousMemoryModules: 36,
  currentMemoryModules: 36,
  memoryModuleChanges: 42,
  previousStorageDevices: 36,
  currentStorageDevices: 36,
  storageDeviceChanges: 42,
  techName: 22,
  batteryHealth: 15,
  cosmeticGrade: 16,
  passFail: 12,
  hardwareRemarks: 42,
  cosmeticRemarks: 42
});

let crc32Table = null;

function normalizeDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    const error = new Error('The filtered Unit export dataset is invalid.');
    error.code = 'BWT_UNIT_EXPORT_DATASET_INVALID';
    throw error;
  }

  const columns = dataset.columns.length > 0 ? dataset.columns : UNIT_EXPORT_COLUMNS;

  return {
    ...dataset,
    columns,
    rows: dataset.rows,
    totalRows: Number.isFinite(Number(dataset.totalRows)) ? Number(dataset.totalRows) : dataset.rows.length,
    filters: dataset.filters || {},
    scope: Array.isArray(dataset.scope) ? dataset.scope : []
  };
}

function normalizeCellText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

function protectSpreadsheetFormulaText(value) {
  const normalized = normalizeCellText(value);
  return normalized && FORMULA_PREFIX_PATTERN.test(normalized) ? `'${normalized}` : normalized;
}

function escapeCsvCell(value) {
  const protectedValue = protectSpreadsheetFormulaText(value);
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function buildCsvBuffer(dataset) {
  const normalizedDataset = normalizeDataset(dataset);
  const lines = [
    normalizedDataset.columns.map((column) => escapeCsvCell(column.label)).join(',')
  ];

  normalizedDataset.rows.forEach((row) => {
    lines.push(normalizedDataset.columns
      .map((column) => escapeCsvCell(row && row[column.key]))
      .join(','));
  });

  return Buffer.from(`\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
}

function buildUnitExportFilename(format, filters = {}, now = new Date()) {
  const normalizedFormat = String(format || '').trim().toLowerCase();

  if (!['csv', 'xlsx'].includes(normalizedFormat)) {
    throw new Error(`Unsupported Unit export format: ${normalizedFormat || 'unknown'}.`);
  }

  const stateSuffix = String(filters.unitState || '').trim().toLowerCase() === 'parked'
    ? '-parked'
    : '';

  return `${EXPORT_FILE_PREFIX}${stateSuffix}-${formatDateKey(now)}.${normalizedFormat}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(XML_INVALID_CHARACTERS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function inlineStringCell(reference, value, styleId = 2) {
  const safeValue = normalizeCellText(value);
  return `<c r="${reference}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(safeValue)}</t></is></c>`;
}

function numericCell(reference, value, styleId = 2) {
  return `<c r="${reference}" s="${styleId}"><v>${Number(value)}</v></c>`;
}

function parseBatteryHealthPercentage(value) {
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(normalizeCellText(value));

  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric / 100 : null;
}

function columnNameFromIndex(index) {
  let value = Number(index);
  let result = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function buildUnitsWorksheetXml(dataset) {
  const normalizedDataset = normalizeDataset(dataset);
  const lastColumn = columnNameFromIndex(normalizedDataset.columns.length);
  const lastRow = Math.max(1, normalizedDataset.rows.length + 1);
  const columnXml = normalizedDataset.columns.map((column, index) => {
    const width = XLSX_COLUMN_WIDTHS[column.key] || 18;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const headerCells = normalizedDataset.columns.map((column, index) => (
    inlineStringCell(`${columnNameFromIndex(index + 1)}1`, column.label, 1)
  )).join('');
  const rowXml = normalizedDataset.rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = normalizedDataset.columns.map((column, columnIndex) => {
      const reference = `${columnNameFromIndex(columnIndex + 1)}${excelRow}`;
      const value = row && row[column.key] !== undefined && row[column.key] !== null
        ? row[column.key]
        : '';

      if (column.key === BATTERY_HEALTH_COLUMN_KEY) {
        const percentage = parseBatteryHealthPercentage(value);
        return percentage === null
          ? inlineStringCell(reference, value, 2)
          : numericCell(reference, percentage, 4);
      }

      return inlineStringCell(reference, value, WRAPPED_COLUMN_KEYS.has(column.key) ? 3 : 2);
    }).join('');
    const wrappedLineEstimate = normalizedDataset.columns.reduce((maximum, column) => {
      if (!WRAPPED_COLUMN_KEYS.has(column.key)) return maximum;

      const value = normalizeCellText(row && row[column.key]);
      if (!value) return maximum;

      const explicitLines = value.split('\n').length;
      const width = XLSX_COLUMN_WIDTHS[column.key] || 36;
      const estimatedWrappedLines = Math.max(explicitLines, Math.ceil(value.length / Math.max(18, width * 1.35)));
      return Math.max(maximum, estimatedWrappedLines);
    }, 1);
    const rowHeight = String(Math.min(90, Math.max(20, 15 + (wrappedLineEstimate * 15))));

    return `<row r="${excelRow}" ht="${rowHeight}" customHeight="1">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${columnXml}</cols>
  <sheetData><row r="1" ht="28" customHeight="1">${headerCells}</row>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>
  <headerFooter><oddFooter>&amp;LFiltered Unit Export&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

function formatExportedAt(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

function buildScopeWorksheetXml(dataset, exportedAt = new Date()) {
  const normalizedDataset = normalizeDataset(dataset);
  const totals = normalizedDataset.capacityTotals || {};
  const scopeRows = [
    { label: 'Exported At', value: formatExportedAt(exportedAt) },
    { label: 'Matching Units', value: String(normalizedDataset.totalRows) },
    { label: 'Previous Memory Total', value: `${formatHardwareCapacityGb(totals.previousMemoryGb) || '0GB'} across ${Number(totals.previousMemoryRecordedUnits || 0)} recorded Unit(s)` },
    { label: 'Current Memory Total', value: `${formatHardwareCapacityGb(totals.currentMemoryGb) || '0GB'} across ${Number(totals.currentMemoryRecordedUnits || 0)} recorded Unit(s)` },
    { label: 'Previous Storage Total', value: `${formatHardwareCapacityGb(totals.previousStorageGb) || '0GB'} across ${Number(totals.previousStorageRecordedUnits || 0)} recorded Unit(s)` },
    { label: 'Current Storage Total', value: `${formatHardwareCapacityGb(totals.currentStorageGb) || '0GB'} across ${Number(totals.currentStorageRecordedUnits || 0)} recorded Unit(s)` },
    ...normalizedDataset.scope
      .filter((entry) => entry && normalizeCellText(entry.label))
      .map((entry) => ({ label: normalizeCellText(entry.label), value: normalizeCellText(entry.value) }))
  ];
  const rows = scopeRows.map((entry, index) => {
    const rowNumber = index + 3;
    return `<row r="${rowNumber}" ht="20" customHeight="1">${inlineStringCell(`A${rowNumber}`, entry.label, 6)}${inlineStringCell(`B${rowNumber}`, entry.value, 2)}</row>`;
  }).join('');
  const lastRow = Math.max(3, scopeRows.length + 2);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="54" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="28" customHeight="1">${inlineStringCell('A1', 'BWTDallas Filtered Unit Export', 5)}</row>
    <row r="2" ht="8" customHeight="1"/>
    ${rows}
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
  <pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><color rgb="FF234A70"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FF1F2937"/><sz val="12"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD5DEE7"/></left><right style="thin"><color rgb="FFD5DEE7"/></right><top style="thin"><color rgb="FFD5DEE7"/></top><bottom style="thin"><color rgb="FFD5DEE7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function getCrc32Table() {
  if (crc32Table) {
    return crc32Table;
  }

  crc32Table = Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }

    return value >>> 0;
  });

  return crc32Table;
}

function crc32(buffer) {
  const table = getCrc32Table();
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = Math.max(1980, safeDate.getFullYear());
  const dosTime = ((safeDate.getHours() & 0x1f) << 11)
    | ((safeDate.getMinutes() & 0x3f) << 5)
    | ((Math.floor(safeDate.getSeconds() / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9)
    | (((safeDate.getMonth() + 1) & 0x0f) << 5)
    | (safeDate.getDate() & 0x1f);

  return { dosTime, dosDate };
}

function createZipArchive(entries, archiveDate = new Date()) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const { dosTime, dosDate } = getDosDateTime(archiveDate);

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const sourceBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const compressedBuffer = zlib.deflateRawSync(sourceBuffer, { level: 6 });
    const checksum = crc32(sourceBuffer);
    const flags = 0x0800;
    const method = 8;
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedBuffer.length, 18);
    localHeader.writeUInt32LE(sourceBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressedBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedBuffer.length, 20);
    centralHeader.writeUInt32LE(sourceBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, nameBuffer);
    localOffset += localHeader.length + nameBuffer.length + compressedBuffer.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function buildXlsxWorkbookBuffer(dataset, { now = new Date() } = {}) {
  const normalizedDataset = normalizeDataset(dataset);
  const createdAt = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const createdIso = createdAt.toISOString();
  const entries = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
    },
    {
      name: 'docProps/core.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>BWTDallas Filtered Unit Export</dc:title>
  <dc:creator>BWTDallas</dc:creator>
  <cp:lastModifiedBy>BWTDallas</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:modified>
</cp:coreProperties>`
    },
    {
      name: 'docProps/app.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>BWTDallas</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Units</vt:lpstr><vt:lpstr>Export Scope</vt:lpstr></vt:vector></TitlesOfParts>
  <AppVersion>1.0</AppVersion>
</Properties>`
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="Units" sheetId="1" r:id="rId1"/><sheet name="Export Scope" sheetId="2" r:id="rId2"/></sheets>
  <calcPr calcId="191029"/>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    { name: 'xl/styles.xml', data: buildStylesXml() },
    { name: 'xl/worksheets/sheet1.xml', data: buildUnitsWorksheetXml(normalizedDataset) },
    { name: 'xl/worksheets/sheet2.xml', data: buildScopeWorksheetXml(normalizedDataset, createdAt) }
  ];

  return createZipArchive(entries, createdAt);
}

module.exports = {
  CSV_CONTENT_TYPE,
  XLSX_CONTENT_TYPE,
  buildCsvBuffer,
  buildUnitExportFilename,
  buildXlsxWorkbookBuffer,
  columnNameFromIndex,
  createZipArchive,
  escapeCsvCell,
  normalizeDataset,
  parseBatteryHealthPercentage,
  protectSpreadsheetFormulaText
};
