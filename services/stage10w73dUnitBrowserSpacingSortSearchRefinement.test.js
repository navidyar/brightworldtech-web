'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Browser fluid growth defaults are balanced instead of concentrating wide-screen space in Created / Assignment', () => {
  const registry = require('../config/unitBrowserColumnRegistry');
  assert.equal(registry.getUnitBrowserColumnDefinition('unit_weight').minimumWidthPx, 445);
  assert.equal(registry.getUnitBrowserColumnDefinition('created_work_assignment').growthUnits, 1);
  assert.equal(registry.getUnitBrowserColumnDefinition('identifiers').growthUnits, 1);
  assert.equal(registry.getUnitBrowserColumnDefinition('amazon_ids').growthUnits, 1);
  assert.equal(registry.getUnitBrowserColumnDefinition('amazon_logistics').growthUnits, 1);
  assert.equal(registry.getUnitBrowserColumnDefinition('qc').growthUnits, 0);
  assert.equal(registry.getUnitBrowserColumnDefinition('comments').growthUnits, 0);
  assert.equal(registry.getUnitBrowserColumnDefinition('unit_actions').growthUnits, 0);
});

test('Created / Assignment summary removes redundant assignment and override labels', () => {
  const table = read('views/fragments/tech-units-table.ejs');
  const registry = read('config/unitBrowserColumnRegistry.js');

  assert.match(registry, /label: 'Created \/ Assignment'/);
  assert.match(table, />\s*Assignment\s*/);
  assert.doesNotMatch(table, />Assigned To</);
  const summaryStart = table.indexOf("column.key === 'created_work_assignment'");
  const summaryEnd = table.indexOf("column.key === 'identifiers'", summaryStart);
  const assignmentSummary = table.slice(summaryStart, summaryEnd);
  assert.doesNotMatch(assignmentSummary, /latestManualOverride|Override/);
});

test('Identifiers header exposes independent Asset and AZ sorting', () => {
  const model = read('models/techUnitModel.js');
  const table = read('views/fragments/tech-units-table.ejs');

  for (const sortKey of ['asset_asc', 'asset_desc', 'az_asc', 'az_desc']) {
    assert.match(model, new RegExp(`'${sortKey}'`));
    assert.match(table, new RegExp(`'${sortKey}'`));
  }
  assert.match(table, /tech-unit-identifiers-header/);
  assert.match(table, />\s*Asset\s*/);
  assert.match(table, />\s*AZ\s*/);
  assert.match(model, /az_sort\.amazon_asset_tag/);
});

test('Unit summary uses normalized capacity presentation and Search supports explicit Memory and Storage terms with All/Any composition unchanged', () => {
  const model = read('models/techUnitModel.js');
  const page = read('views/pages/tech-units.ejs');

  assert.match(model, /browserRamCapacity = formatBrowserCapacityGb\(row\.ram_gb\)/);
  assert.match(model, /browserStorageCapacity = formatBrowserCapacityGb\(row\.storage_gb\)/);
  assert.match(model, /parseCapacitySearchTerm\(searchTerm\)/);
  assert.match(model, /capacitySearch\.field === 'memory' \? 'u\.ram_gb' : 'u\.storage_gb'/);
  assert.match(model, /searchGroups\.join\(searchMode === 'all' \? ' AND ' : ' OR '\)/);
  assert.match(page, /memory:8/);
  assert.match(page, /storage:512/);
  assert.match(page, /GB is assumed; TB is accepted/);
});
