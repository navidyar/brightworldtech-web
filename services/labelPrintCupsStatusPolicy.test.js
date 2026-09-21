'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCupsRequestId,
  parseLpstatJobBlocks,
  completedBlockStatus,
  normalizeRequestOutputs,
  summarizeStates
} = require('./labelPrintCupsStatusPolicy');

test('CUPS request ids are extracted from lp submission output', () => {
  assert.equal(extractCupsRequestId('request id is BWT_LabelPrinter_2-417 (1 file(s))'), 'BWT_LabelPrinter_2-417');
  assert.equal(extractCupsRequestId('BWT_NavidPrinter-19'), 'BWT_NavidPrinter-19');
  assert.equal(extractCupsRequestId(''), null);
});

test('lpstat output is split into request-id job blocks', () => {
  const blocks = parseLpstatJobBlocks('BWT_LabelPrinter_2-417 user 123 Thu Sep 10\n\tStatus: job-completed-successfully\nBWT_LabelPrinter_2-418 user 123 Thu Sep 10\n');
  assert.equal(blocks.size, 2);
  assert.match(blocks.get('BWT_LabelPrinter_2-417'), /job-completed-successfully/);
});

test('completed CUPS blocks only become failed on explicit failure state text', () => {
  assert.equal(completedBlockStatus('Status: job-completed-successfully'), 'sent');
  assert.equal(completedBlockStatus('Status: job aborted by backend'), 'failed');
});

test('status reconciliation stays conservative for unknown or still-queued requests', () => {
  assert.deepEqual(summarizeStates([{ status: 'sent' }, { status: 'sent' }]), { status: 'sent', failureMessage: null });
  assert.equal(summarizeStates([{ status: 'sent' }, { status: 'unknown' }]), null);
  assert.equal(summarizeStates([{ status: 'queued' }]), null);
  assert.equal(normalizeRequestOutputs('["request id is P-1"]')[0], 'request id is P-1');
});
