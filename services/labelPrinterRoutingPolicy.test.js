'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rankPrinterRouteCandidates,
  parseCupsPrinterNames,
  parseCupsQueueDepths
} = require('./labelPrinterRoutingPolicy');

test('group routing prioritizes known queue load, then shorter queue, provisioned path, lifetime balance, and group order', () => {
  const ranked = rankPrinterRouteCandidates([
    { label: 'Unknown', queueStatusKnown: false, queueDepth: 0, lifetimePrintCount: 0, registryPrinterId: 1 },
    { label: 'Busy', queueStatusKnown: true, queueDepth: 2, lifetimePrintCount: 0, registryPrinterId: 2 },
    { label: 'High lifetime', queueStatusKnown: true, queueDepth: 0, lifetimePrintCount: 100, registryPrinterId: 3 },
    { label: 'Low lifetime', queueStatusKnown: true, queueDepth: 0, lifetimePrintCount: 5, registryPrinterId: 4 },
    { label: 'Needs queue', queueStatusKnown: true, queueDepth: 0, needsProvisioning: true, lifetimePrintCount: 0, registryPrinterId: 5 }
  ]);
  assert.deepEqual(ranked.map((candidate) => candidate.label), [
    'Low lifetime', 'High lifetime', 'Needs queue', 'Busy', 'Unknown'
  ]);
});


test('CUPS route snapshot parsers read printer names and queue depths from one shared lpstat result', () => {
  const names = parseCupsPrinterNames('printer BWT_LabelPrinter_4 is idle. enabled since today\nprinter Office-QL is idle. enabled since today');
  assert.deepEqual([...names], ['BWT_LabelPrinter_4', 'Office-QL']);

  const depths = parseCupsQueueDepths([
    'BWT_LabelPrinter_4-101 tech 123 today',
    'BWT_LabelPrinter_4-102 tech 123 today',
    'Office-QL-44 tech 123 today'
  ].join('\n'));
  assert.equal(depths.get('BWT_LabelPrinter_4'), 2);
  assert.equal(depths.get('Office-QL'), 1);
});
