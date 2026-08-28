'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('storage serial is present only as hidden Add/Edit row state', () => {
  const markup = read('views/fragments/tech-unit-form.ejs');

  assert.match(markup, /type="hidden" name="previousStorageDevices\[<%= index %>\]\[serialNumber\]" value="<%= deviceRow\.serialNumber \|\| '' %>" data-storage-serial-number/);
  assert.match(markup, /type="hidden" name="storageDevices\[<%= index %>\]\[serialNumber\]" value="<%= deviceRow\.serialNumber \|\| '' %>" data-storage-serial-number/);
  assert.match(markup, /name="previousStorageDevices\[__INDEX__\]\[serialNumber\]" data-storage-serial-number/);
  assert.match(markup, /name="storageDevices\[__INDEX__\]\[serialNumber\]" data-storage-serial-number/);
  assert.doesNotMatch(markup, /<span>Storage Serial Number<\/span>/);
});

test('normal Add/Edit submissions cannot author storage serials', () => {
  const controller = read('controllers/techController.js');
  const parser = controller.match(/function getStorageDevicesFromRequest[\s\S]*?\n}\n\nfunction getIssueRowsFromBody/)?.[0] || '';
  const preservation = read('services/componentDetailPreservation.js');

  assert.doesNotMatch(parser, /serialNumber/);
  assert.match(preservation, /serialNumber: stored\.serial_number/);
  assert.match(preservation, /deviceRow\.componentRowId/);
});

test('storage serial is exposed through Unit Details, history, exports, and Unit search', () => {
  const detailModel = read('models/unitExpandedDetailModel.js');
  const comparison = read('services/hardwareComponentComparison.js');
  const detailsView = read('views/fragments/tech-units-table.ejs');
  const history = read('services/unitHistoryTimeline.js');
  const exportService = read('services/unitExportService.js');
  const unitModel = read('models/techUnitModel.js');

  assert.match(detailModel, /usd\.serial_number/);
  assert.match(detailModel, /serialNumber: row\.serial_number \|\| ''/);
  assert.match(comparison, /component\.serialNumber \? `Serial: \$\{component\.serialNumber\}`/);
  assert.match(detailsView, /comparison\.currentText/);
  assert.match(history, /buildHardwareComponentComparisons/);
  assert.match(exportService, /currentStorageDevices: formatHardwareComponentList/);
  assert.match(unitModel, /FROM unit_storage_devices usd_search/);
  assert.match(unitModel, /usd_search\.is_current = 1/);
  assert.match(unitModel, /usd_search\.serial_number LIKE \?/);
});
