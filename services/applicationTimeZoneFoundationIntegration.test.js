'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const { isValidTimeZone, normalizeTimeZone, listSupportedTimeZones, getDayRangeUtc } = require('../utils/timeZone');
const { formatDateTime } = require('../views/partials/helpers');

test('timezone utility accepts IANA regions, rejects invalid values, and supports non-DST regions', () => {
  assert.equal(isValidTimeZone('America/Chicago'), true);
  assert.equal(isValidTimeZone('Europe/London'), true);
  assert.equal(isValidTimeZone('Asia/Kolkata'), true);
  assert.equal(isValidTimeZone('Definitely/Not_A_Zone'), false);
  assert.equal(normalizeTimeZone('Definitely/Not_A_Zone', 'UTC'), 'UTC');

  const india = getDayRangeUtc('2026-11-01', 'Asia/Kolkata');
  assert.equal((india.endAt - india.startAt) / 3600000, 24);
  assert.match(formatDateTime('2026-09-30T15:30:47.000Z', 'Asia/Kolkata'), /Sep 30, 2026/);
});

test('application timezone configuration offers the full runtime-supported IANA list instead of free text', () => {
  const zones = listSupportedTimeZones();
  const controller = read('controllers/configController.js');
  const fragment = read('views/fragments/application-time-zone-config.ejs');

  assert.ok(zones.length > 300);
  assert.equal(zones[0], 'UTC');
  assert.ok(zones.includes('America/Chicago'));
  assert.ok(zones.includes('Europe/London'));
  assert.ok(zones.includes('Asia/Calcutta') || zones.includes('Asia/Kolkata'));
  assert.match(controller, /supportedTimeZones: listSupportedTimeZones\(\)/);
  assert.match(fragment, /<select name="defaultTimeZone" required>/);
  assert.match(fragment, /<optgroup label=/);
  assert.doesNotMatch(fragment, /type="text"[\s\S]*name="defaultTimeZone"/);
});

test('browser timezone detection is automatic and feeds a centralized request timezone context', () => {
  const head = read('views/partials/head.ejs');
  const browser = read('public/js/time-zone-context.js');
  const middleware = read('middleware/timeZoneContextMiddleware.js');
  const server = read('server.js');

  assert.match(head, /time-zone-context\.js/);
  assert.match(browser, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(browser, /bwtdallas\.timezone/);
  assert.match(middleware, /req\.timeZone = effectiveTimeZone/);
  assert.match(middleware, /createDateTimeHelpers\(effectiveTimeZone\)/);
  assert.match(server, /app\.use\(loadTimeZoneContext\)/);
});

test('application default timezone is centrally stored and configurable without per-user setup', () => {
  const migration = read('scripts/migrateApplicationTimeZone.js');
  const model = read('models/applicationSettingsModel.js');
  const controller = read('controllers/configController.js');
  const routes = read('routes/config.js');
  const fragment = read('views/fragments/application-time-zone-config.ejs');

  assert.match(migration, /CREATE TABLE application_settings/);
  assert.match(migration, /default_time_zone/);
  assert.match(model, /getApplicationSettings/);
  assert.match(model, /updateDefaultTimeZone/);
  assert.match(routes, /\/management\/config\/application-time-zone/);
  assert.match(controller, /updateApplicationTimeZone/);
  assert.match(fragment, /Application Time Zone/);
  assert.match(fragment, /Browser time zones are detected automatically/);
});

test('shared date helpers are request-bound and major date/report surfaces no longer hardcode Dallas', () => {
  const helpers = read('views/partials/helpers.js');
  const loginController = read('controllers/managementController.js');
  const dashboard = read('models/dashboardModel.js');
  const qcScope = read('services/qcReportingScope.js');
  const datePicker = read('public/js/date-picker-only.js');
  const techTable = read('views/fragments/tech-units-table.ejs');
  const exportService = read('services/unitExportService.js');

  assert.match(helpers, /createDateTimeHelpers/);
  assert.doesNotMatch(loginController, /America\/Chicago/);
  assert.doesNotMatch(dashboard, /America\/Chicago/);
  assert.doesNotMatch(qcScope, /APP_DISPLAY_TIME_ZONE|America\/Chicago/);
  assert.doesNotMatch(datePicker, /America\/Chicago|getChicagoDateOnly/);
  assert.doesNotMatch(techTable, /America\/Chicago/);
  assert.doesNotMatch(exportService, /APP_DISPLAY_TIME_ZONE|America\/Chicago/);
});

test('reporting and exports receive the request timezone instead of relying on a global fixed offset', () => {
  const dashboardController = read('controllers/dashboardController.js');
  const qcController = read('controllers/qcReportingController.js');
  const lotController = read('controllers/lotController.js');
  const techController = read('controllers/techController.js');

  assert.match(dashboardController, /timeZone: req\.timeZone/);
  assert.match(qcController, /timeZone: req\.timeZone/);
  assert.match(lotController, /timeZone: req\.timeZone/);
  assert.match(techController, /timeZone: req\.timeZone/);
});
