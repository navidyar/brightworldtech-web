'use strict';

const LABEL_PRINTER_PROFILES = Object.freeze([
  Object.freeze({
    code: 'brother_ql810w_300dpi',
    label: 'Brother QL-810W · 300 dpi',
    manufacturer: 'Brother',
    model: 'QL-810W',
    mediaCode: '62mm_continuous',
    mediaLabel: '62 mm continuous',
    dpi: 300,
    deviceWidthDots: 720,
    printableWidthDots: 696,
    horizontalOffsetDots: 12,
    feedMarginDots: 35,
    modelAliases: Object.freeze(['ql-810w', 'ql810w'])
  })
]);

const LABEL_PRINTERS = Object.freeze([
  Object.freeze({
    id: 'navid-printer',
    label: 'NavidPrinter · Tech Area 1',
    name: 'NavidPrinter',
    location: 'Tech Area 1',
    host: '10.0.2.210',
    port: 9100,
    protocolCode: 'raw_9100',
    queue: 'BWT_NavidPrinter',
    manufacturer: 'Brother',
    model: 'QL-810W',
    printerProfileCode: 'brother_ql810w_300dpi',
    mediaCode: '62mm_continuous',
    dpi: 300
  })
]);

const MAX_LABEL_COPIES = 10;

function findLabelPrinterProfile(profileCode) {
  return LABEL_PRINTER_PROFILES.find((profile) => profile.code === String(profileCode || '').trim()) || null;
}

function inferLabelPrinterProfile({ manufacturer = '', model = '' } = {}) {
  const maker = String(manufacturer || '').trim().toLowerCase();
  const modelText = String(model || '').trim().toLowerCase();
  return LABEL_PRINTER_PROFILES.find((profile) => {
    const makerMatches = !maker || maker === String(profile.manufacturer || '').toLowerCase();
    return makerMatches && profile.modelAliases.some((alias) => modelText.includes(alias));
  }) || null;
}

module.exports = {
  LABEL_PRINTER_PROFILES,
  LABEL_PRINTERS,
  MAX_LABEL_COPIES,
  findLabelPrinterProfile,
  inferLabelPrinterProfile
};
