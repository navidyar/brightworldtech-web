'use strict';

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

const LABEL_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'standard-unit-62',
    label: 'Standard Unit Label · 62 mm',
    mediaLabel: '62 mm continuous',
    printableWidthDots: 696,
    deviceWidthDots: 720,
    heightDots: 360,
    offsetDots: 12,
    feedMarginDots: 35
  })
]);

const MAX_LABEL_COPIES = 10;

function findLabelPrinter(printerId) {
  return LABEL_PRINTERS.find((printer) => printer.id === String(printerId || '').trim()) || null;
}

function findLabelTemplate(templateId) {
  return LABEL_TEMPLATES.find((template) => template.id === String(templateId || '').trim()) || null;
}

module.exports = {
  LABEL_PRINTERS,
  LABEL_TEMPLATES,
  MAX_LABEL_COPIES,
  findLabelPrinter,
  findLabelTemplate
};
