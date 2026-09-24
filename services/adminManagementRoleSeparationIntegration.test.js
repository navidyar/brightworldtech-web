'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const accessPolicy = require('../config/accessPolicy');

test('named feature access keeps Admin-only operational features out of Management', () => {
  for (const featureKey of ['operationsDashboard', 'userAdministration', 'managedPrinters', 'qcReporting']) {
    assert.equal(accessPolicy.canAccessFeature(['admin'], featureKey), true, `${featureKey} should allow Admin`);
    assert.equal(accessPolicy.canAccessFeature(['management'], featureKey), false, `${featureKey} should block Management`);
  }

  assert.equal(accessPolicy.canAccessMenuArea(['management'], 'management'), true);
  assert.equal(accessPolicy.canAccessMenuArea(['management'], 'admin'), false);
});

test('Operations Dashboard is Admin-only while Management root navigation prefers Management Dashboard', () => {
  const routes = read('routes/dashboard.js');
  const controller = read('controllers/dashboardController.js');

  assert.match(routes, /'\/dashboard\/summary',[\s\S]*?requireFeature\('operationsDashboard'\)/);
  assert.match(controller, /!canAccessFeature\('operationsDashboard'\)/);
  assert.match(controller, /primaryRole === 'management' \? 'management' : 'tech'/);
  assert.match(controller, /res\.redirect\(`\/dashboards\/\$\{encodeURIComponent\(preferredDashboard\.key\)\}`\)/);
});

test('Users, managed Printers, and QC Reporting use named Admin-only route guards', () => {
  const routes = read('routes/management.js');

  const userBlocks = routes.match(/router\.(?:get|post)\(\s*'\/management\/users[^']*'[\s\S]*?\n\);/g) || [];
  assert.ok(userBlocks.length >= 10, 'expected all user administration routes');
  userBlocks.forEach((block) => assert.match(block, /requireFeature\('userAdministration'\)/));

  const printerBlocks = routes.match(/router\.(?:get|post)\(\s*'\/management\/(?:printers|printer-groups)[^']*'[\s\S]*?\n\);/g) || [];
  assert.ok(printerBlocks.length >= 15, 'expected all managed-printer routes');
  printerBlocks.forEach((block) => assert.match(block, /requireFeature\('managedPrinters'\)/));

  const qcReportingBlock = routes.match(/router\.get\(\s*'\/management\/qc-reporting'[\s\S]*?\n\);/)?.[0] || '';
  assert.match(qcReportingBlock, /requireFeature\('qcReporting'\)/);
});

test('Admin and Management navigation keep operational areas in their correct sections', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const managementSection = sidebar.match(/if \(canAccessMenuArea\('management'\)\)[\s\S]*?if \(canAccessMenuArea\('qc'\)\)/)?.[0] || '';

  const managementLabels = ['Virtual Huddle', 'Lots', 'Login Activity', 'Label Library'];
  let previousIndex = -1;
  for (const label of managementLabels) {
    const index = managementSection.indexOf(`>${label}</span>`);
    assert.ok(index > previousIndex, `${label} should appear in requested Management order`);
    previousIndex = index;
  }

  assert.doesNotMatch(managementSection, />Users</);
  assert.doesNotMatch(managementSection, />Printer Management</);
  assert.doesNotMatch(managementSection, />QC Reporting</);

  const adminSection = sidebar.match(/if \(canAccessMenuArea\('admin'\)\)[\s\S]*?if \(canAccessMenuArea\('management'\)\)/)?.[0] || '';
  const adminLabels = ['Configuration', 'Users', 'QC Reporting', 'Printer Management'];
  previousIndex = -1;
  for (const label of adminLabels) {
    const index = adminSection.indexOf(`>${label}</span>`);
    assert.ok(index > previousIndex, `${label} should appear in requested Admin order`);
    previousIndex = index;
  }

  assert.match(adminSection, /canAccessFeature\('userAdministration'\)[\s\S]*?>Users</);
  assert.match(adminSection, /canAccessFeature\('qcReporting'\)[\s\S]*?>QC Reporting</);
  assert.match(adminSection, /canAccessFeature\('managedPrinters'\)[\s\S]*?>Printer Management</);
});

test('My Printers remains in the Tech navigation independently of managed Printers', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const routes = read('routes/management.js');

  assert.match(sidebar, /href="\/tech\/printers"[\s\S]*?>My Printers</);
  assert.match(routes, /'\/tech\/printers',[\s\S]*?requireRole\(techRoles\)/);
});
