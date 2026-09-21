'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  printerSubmissionLockKey,
  withPrinterSubmissionLock
} = require('./labelPrinterSubmissionLock');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('printer submission lock uses stable physical-printer identity', () => {
  assert.equal(printerSubmissionLockKey({ registryPrinterId: 7, queue: 'Queue_A' }), 'registry:7');
  assert.equal(printerSubmissionLockKey({ queue: 'Queue_A' }), 'queue:Queue_A');
  assert.equal(printerSubmissionLockKey({ endpoint: 'raw_9100://10.0.0.9:9100' }), 'endpoint:raw_9100://10.0.0.9:9100');
});

test('same-printer submission batches run contiguously instead of interleaving', async () => {
  const printer = { registryPrinterId: 7, queue: 'Queue_A' };
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const events = [];

  const first = withPrinterSubmissionLock(printer, async () => {
    events.push('first:start');
    firstStarted.resolve();
    await releaseFirst.promise;
    events.push('first:end');
  });

  await firstStarted.promise;
  const second = withPrinterSubmissionLock(printer, async () => {
    events.push('second:start');
    events.push('second:end');
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first:start']);

  releaseFirst.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('different printers do not block each other', async () => {
  const hold = deferred();
  const firstStarted = deferred();
  let secondRan = false;

  const first = withPrinterSubmissionLock({ registryPrinterId: 11 }, async () => {
    firstStarted.resolve();
    await hold.promise;
  });
  await firstStarted.promise;

  await withPrinterSubmissionLock({ registryPrinterId: 12 }, async () => {
    secondRan = true;
  });
  assert.equal(secondRan, true);

  hold.resolve();
  await first;
});
