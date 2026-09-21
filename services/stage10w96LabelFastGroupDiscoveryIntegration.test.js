'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('group routing uses a short responsive pass and only falls back to the tolerant timeout when nobody responds', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /PRINTER_PROBE_FAST_ROUTE_TIMEOUT_MS = 500/);
  assert.match(runtime, /fastReachability = await Promise\.all/);
  assert.match(runtime, /useRetryPass = !fastReachability\.some\(Boolean\)/);
  assert.match(runtime, /PRINTER_PROBE_RETRY_TIMEOUT_MS = 3500/);
  assert.match(runtime, /if \(!useRetryPass && !finalReachability\[index\]\) return Promise\.resolve\(\)/);
});

test('group ranking takes one shared CUPS snapshot instead of querying every queue independently', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /async function getPrinterQueueLoads\(printers = \[\]\)/);
  assert.match(runtime, /runCupsCommand\('\/usr\/bin\/lpstat', \['-p'\]/);
  assert.match(runtime, /runCupsCommand\('\/usr\/bin\/lpstat', \['-o'\]/);
  assert.match(runtime, /const queueLoads = await getPrinterQueueLoads\(online\)/);
  assert.doesNotMatch(runtime.slice(runtime.indexOf('async function rankAvailablePrinters'), runtime.indexOf('async function preparePrinterForSubmission')), /await getPrinterQueueLoad\(printer\)/);
});

test('selected group printer can reuse the fresh CUPS queue-existence result during queue preparation', () => {
  const runtime = read('services/labelPrinterRuntimeService.js');
  assert.match(runtime, /cupsQueueExistsKnown === true/);
  assert.match(runtime, /queueExistsHintUsable \? printer\.cupsQueueExists : await cupsQueueExists\(queue\)/);
});
