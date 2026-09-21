'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Recent Prints reconciles queued CUPS jobs into Sent to Printer without claiming physical completion', () => {
  const controller = read('controllers/labelPrintQueueController.js');
  const live = read('views/fragments/tech-recent-prints-live.ejs');
  const runtime = read('services/labelPrinterRuntimeService.js');
  const history = read('models/labelPrintHistoryModel.js');

  assert.match(controller, /reconcileRecentPrintStatuses/);
  assert.match(runtime, /-W', 'not-completed'/);
  assert.match(runtime, /-W', 'completed'/);
  assert.match(history, /status = 'queued'/);
  assert.match(history, /'sent'/);
  assert.match(live, /Sent to Printer/);
  assert.match(live, /does not by itself confirm the label physically exited/);
});

test('Recent Prints modal refreshes only its live content while open', () => {
  const modal = read('views/fragments/tech-recent-prints-modal.ejs');
  const routes = read('routes/management.js');
  assert.match(modal, /id="tech-recent-prints-live"/);
  assert.match(modal, /hx-get="\/tech\/print-queue\/live"/);
  assert.match(modal, /hx-trigger="every 3s"/);
  assert.match(routes, /\/tech\/print-queue\/live/);
  assert.match(modal, /every 3s/);
});

test('Units Browser Recent Prints control remains useful after queued jobs transition to sent', () => {
  const summary = read('views/fragments/tech-recent-prints-summary.ejs');
  const history = read('models/labelPrintHistoryModel.js');
  const page = read('views/pages/tech-units.ejs');
  assert.match(summary, /recentItems/);
  assert.match(page, /unit-label-status-changed from:body/);
  assert.match(summary, /recent/);
  assert.match(history, /recent_items/);
});
