'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Admin Configuration gets a dedicated Printing page with configurable recent/grouping durations', () => {
  const routes = read('routes/config.js');
  const nav = read('views/partials/configuration-nav.ejs');
  const page = read('views/pages/management-printing-config.ejs');
  const migration = read('scripts/migrateLabelPrintRecentQueue.js');

  assert.match(routes, /\/management\/config\/printing/);
  assert.match(nav, /Printing/);
  assert.match(page, /Recent Prints display duration/);
  assert.match(page, /Print Set grouping gap/);
  assert.match(migration, /label_print_settings/);
  assert.match(migration, /DEFAULT_RECENT_PRINTS_MINUTES/);
});

test('Recent Prints is user-scoped and reads retained print history without changing CUPS', () => {
  const history = read('models/labelPrintHistoryModel.js');
  const queueController = read('controllers/labelPrintQueueController.js');
  const modal = read('views/fragments/tech-recent-prints-modal.ejs');
  const live = read('views/fragments/tech-recent-prints-live.ejs');

  assert.match(history, /WHERE s\.actor_user_id = \?/);
  assert.match(history, /listRecentPrintSets/);
  assert.match(history, /labelPrintSettingsModel\.getLabelPrintSettings/);
  assert.match(queueController, /req\.currentUser\?\.user_id/);
  assert.match(live, /Queued.*CUPS still has the job/);
  assert.match(live, /Sent to Printer/);
  assert.match(live, /printerLocation/);
  assert.match(live, /attempts\.length > 1/);
});

test('Units Browser keeps a persistent Recent Prints control that refreshes after print activity', () => {
  const page = read('views/pages/tech-units.ejs');
  const routes = read('routes/management.js');
  const singleModal = read('views/fragments/tech-unit-print-label-modal.ejs');
  const bulkModal = read('views/fragments/tech-units-bulk-print-label-modal.ejs');

  assert.match(page, /id="tech-print-queue-summary"/);
  assert.match(page, /every 30s/);
  assert.match(page, /unit-label-queued from:body/);
  assert.match(routes, /\/tech\/print-queue\/summary/);
  assert.match(routes, /\/tech\/print-queue\/modal/);
  assert.match(singleModal, /View Recent Prints/);
  assert.match(bulkModal, /View Recent Prints/);
});

test('Recent Prints modal separates automatic and explicit bulk print sets', () => {
  const modal = read('views/fragments/tech-recent-prints-modal.ejs');
  const live = read('views/fragments/tech-recent-prints-live.ejs');
  assert.match(live, /Bulk Print Set/);
  assert.match(live, /Print Set/);
  assert.match(live, /tech-recent-print-set--separated/);
  assert.match(live, /copiesQueued/);
  assert.match(live, /copiesRequested/);
});

test('Recent Prints exposes the origin of each print job without relying on set grouping', () => {
  const live = read('views/fragments/tech-recent-prints-live.ejs');
  const css = read('public/css/tech-units-clean.css');

  assert.match(live, /builder_test[\s\S]*Builder Test Print[\s\S]*Layout Builder test/);
  assert.match(live, /library_direct[\s\S]*Standalone Direct Print[\s\S]*Label Template Library/);
  assert.match(live, /bulk[\s\S]*Bulk Production[\s\S]*Units Browser bulk action/);
  assert.match(live, /single[\s\S]*Unit Production[\s\S]*Unit print action/);
  assert.match(live, /sourcePresentation\(job\.source\)/);
  assert.match(live, /tech-recent-print-job-heading/);
  assert.match(css, /\.tech-recent-print-job \+ \.tech-recent-print-job/);
});
