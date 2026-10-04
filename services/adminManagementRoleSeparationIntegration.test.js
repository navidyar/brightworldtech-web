'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const accessPolicy = require('../config/accessPolicy');

test('named feature access keeps Admin-only operational features out of Management', () => {
  for (const featureKey of ['operationsDashboard', 'qcReporting']) {
    assert.equal(accessPolicy.canAccessFeature(['admin'], featureKey), true, `${featureKey} should allow Admin`);
    assert.equal(accessPolicy.canAccessFeature(['management'], featureKey), false, `${featureKey} should block Management`);
  }

  assert.equal(accessPolicy.canAccessFeature(['admin'], 'userAdministration'), false);
  assert.equal(accessPolicy.canAccessFeature(['admin'], 'managedPrinters'), false);
  assert.equal(accessPolicy.canAccessMenuArea(['management'], 'management'), true);
  assert.equal(accessPolicy.canAccessMenuArea(['management'], 'admin'), false);
});

test('Admin Dashboard route and home selection use effective dashboard permissions', () => {
  const routes = read('routes/dashboard.js');
  const controller = read('controllers/dashboardController.js');

  assert.match(routes, /'\/dashboard\/summary',[\s\S]*?requirePermission\('dashboards\.admin\.view'\)/);
  assert.match(controller, /dashboard\.key === 'admin'/);
  assert.match(controller, /dashboard\.key === 'management'/);
  assert.match(controller, /dashboard\.key === 'tech'/);
  assert.doesNotMatch(controller, /getPrimaryRole|operationsDashboard/);
});

test('Users, QC Reporting, and Printer Management routes use granular guards', () => {
  const routes = read('routes/management.js');

  const userBlocks = routes.match(/router\.(?:get|post)\(\s*'\/management\/users[^']*'[\s\S]*?\n\);/g) || [];
  assert.ok(userBlocks.length >= 10, 'expected all user administration routes');
  userBlocks.forEach((block) => {
    assert.match(block, /requirePermission\(/);
    assert.doesNotMatch(block, /requireFeature\('userAdministration'\)/);
  });

  const printerBlocks = routes.match(/router\.(?:get|post)\(\s*'\/management\/(?:printers|printer-groups)[^']*'[\s\S]*?\n\);/g) || [];
  assert.ok(printerBlocks.length >= 15, 'expected all managed-printer routes');
  const readBlocks = printerBlocks.filter((block) => block.startsWith('router.get(') && /'\/management\/printers(?:\/live)?'/.test(block));
  assert.equal(readBlocks.length, 2);
  readBlocks.forEach((block) => assert.match(block, /requirePermission\('printers\.managed\.view'\)/));
  printerBlocks.filter((block) => !readBlocks.includes(block) && /'\/management\/printers/.test(block)).forEach((block) => {
    assert.match(block, /requirePermission\('printers\.managed\.view'\)/);
    assert.doesNotMatch(block, /requireFeature\('managedPrinters'\)/);
  });
  printerBlocks.filter((block) => /'\/management\/printer-groups/.test(block)).forEach((block) => {
    assert.match(block, /requirePermission\('printers\.managed\.view'\)/);
    assert.match(block, /requirePermission\('printers\.groups\.manage'\)/);
    assert.doesNotMatch(block, /requireFeature\('managedPrinters'\)/);
  });

  const qcReportingBlock = routes.match(/router\.get\(\s*'\/management\/qc-reporting'[\s\S]*?\n\);/)?.[0] || '';
  assert.match(qcReportingBlock, /requirePermission\('qc\.reporting\.view'\)/);
});

test('Admin and Management navigation keep operational areas in their current sections', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const adminStart = sidebar.indexOf('<% if (showAdminSection) { %>');
  const managementStart = sidebar.indexOf('<% if (canViewHuddleAdministration || canViewLots || canViewLabelLibrary) { %>');
  const qcStart = sidebar.indexOf('<% if (canViewQcPortal) { %>');
  assert.ok(adminStart >= 0 && managementStart > adminStart && qcStart > managementStart);

  const adminSection = sidebar.slice(adminStart, managementStart);
  const adminLabels = ['Configuration', 'Users', 'Roles &amp; Permissions', 'Account History', 'Login Activity', 'Permission Audit', 'QC Reporting', 'Printer Management'];
  let previousIndex = -1;
  for (const label of adminLabels) {
    const index = adminSection.indexOf(`>${label}</span>`);
    assert.ok(index > previousIndex, `${label} should appear in Admin order`);
    previousIndex = index;
  }
  assert.match(adminSection, /if \(canViewUsers\)[\s\S]*?>Users</);
  assert.match(adminSection, /if \(canViewQcReporting\)[\s\S]*?>QC Reporting</);
  assert.match(adminSection, /if \(canViewManagedPrinters\)[\s\S]*?>Printer Management/);

  const managementSection = sidebar.slice(managementStart, qcStart);
  previousIndex = -1;
  for (const label of ['Virtual Huddle', 'Lots', 'Label Library']) {
    const index = managementSection.indexOf(`>${label}</span>`);
    assert.ok(index > previousIndex, `${label} should appear in Management order`);
    previousIndex = index;
  }
  assert.doesNotMatch(managementSection, />Users</);
});

test('My Printers remains in the Tech navigation independently of managed Printers', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const routes = read('routes/management.js');

  assert.match(sidebar, /href="\/tech\/printers"[\s\S]*?>My Printers</);
  assert.match(routes, /router\.use\('\/tech\/printers', requireAuth, requirePermission\('printers\.solo\.manage'\)\)/);
});
