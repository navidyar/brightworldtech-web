'use strict';

const printerSubmissionLocks = new Map();

function printerSubmissionLockKey(printer) {
  const registryPrinterId = Number(printer?.registryPrinterId || 0);
  if (Number.isSafeInteger(registryPrinterId) && registryPrinterId > 0) return `registry:${registryPrinterId}`;

  const queue = String(printer?.queue || '').trim();
  if (queue) return `queue:${queue}`;

  const endpoint = String(printer?.endpoint || '').trim();
  if (endpoint) return `endpoint:${endpoint}`;

  const host = String(printer?.host || '').trim();
  const port = Number(printer?.port || 0);
  const protocol = String(printer?.protocolCode || '').trim();
  return host && port > 0 ? `endpoint:${protocol || 'printer'}://${host}:${port}` : null;
}

async function withPrinterSubmissionLock(printer, task) {
  if (typeof task !== 'function') throw new TypeError('Printer submission task must be a function.');
  const key = printerSubmissionLockKey(printer);
  if (!key) return task();

  const previous = printerSubmissionLocks.get(key) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => { releaseCurrent = resolve; });
  const tail = previous.catch(() => {}).then(() => current);
  printerSubmissionLocks.set(key, tail);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    releaseCurrent();
    tail.finally(() => {
      if (printerSubmissionLocks.get(key) === tail) printerSubmissionLocks.delete(key);
    });
  }
}

module.exports = {
  printerSubmissionLockKey,
  withPrinterSubmissionLock
};
