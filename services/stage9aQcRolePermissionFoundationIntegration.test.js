'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const accessPolicy = require('../config/accessPolicy');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('QC is an assignable primary role without inherited Tech or Tech Lead authority', () => {
  assert.ok(accessPolicy.ACCOUNT_ROLE_CODES.includes('qc'));
  assert.equal(accessPolicy.getPrimaryRole(['qc']), 'qc');
  assert.deepEqual(accessPolicy.getEffectiveRoles(['qc']), ['qc']);
  assert.equal(accessPolicy.canAccessDashboard(['qc'], 'tech'), true);
  assert.equal(accessPolicy.canAccessDashboard(['qc'], 'management'), false);
  assert.equal(accessPolicy.canAccessMenuArea(['qc'], 'tech'), true);
  assert.equal(accessPolicy.canAccessUnitRequests(['qc']), true);
  assert.equal(accessPolicy.canCreateOrEditTechUnits(['qc']), false);
});

test('QC receives browser, history, and request permissions without production authority', () => {
  const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
  for (const permissionKey of ['units.view', 'units.history.view', 'requests.view']) {
    assert.ok(LEGACY_ROLE_GRANTS.qc.includes(permissionKey));
  }
  for (const permissionKey of ['units.create', 'units.edit', 'units.complete', 'units.production_weight.view']) {
    assert.ok(!LEGACY_ROLE_GRANTS.qc.includes(permissionKey));
  }
  const routes = read('routes/management.js');
  assert.match(routes, /router\.use\('\/tech\/units', requireAuth, requirePermission\('units\.view'\)\)/);
  assert.match(routes, /requirePermission\('units\.history\.view'\)/);
});

test('QC Unit Browser is cross-technician and hides production, request, and weight controls', () => {
  const controller = read('controllers/techController.js');
  const page = read('views/pages/tech-units.ejs');
  const table = read('views/fragments/tech-units-table.ejs');
  const sidebar = read('views/partials/sidebar.ejs');

  assert.match(controller, /restrictToCurrentAssignment: isRegularTechUnitBrowserUser\(req\)/);
  assert.match(controller, /return roleCodes\.includes\('tech'\)[\s\S]*!roleCodes\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead', 'qc'\]\.includes\(roleCode\)\)/);
  assert.match(page, /isQcUnitBrowserUser/);
  assert.match(page, /<% if \(canCreateTechUnits\) \{ %>[\s\S]*Create Unit/);
  assert.match(table, /const canEditTechUnits = !isQcPortalMode && hasPermission\('units\.edit'\)/);
  assert.match(table, /const canViewUnitHistory = hasPermission\('units\.history\.view'\)/);
  assert.match(table, /<% if \(canEditTechUnits && !unit\.isParked && !isReadOnlySearchResult\) \{ %>/);
  assert.match(table, /<% if \(canViewCurrentLotWeight\) \{ %>/);
  assert.doesNotMatch(table, /canCompleteTechUnits[^\n]*'qc'/);
  assert.match(sidebar, /hasPermission\('requests\.view'\)/);
});

test('Stage 9A migration creates one active idempotent QC role and management can assign it', () => {
  const migration = read('sql/2026-07-stage-9a-qc-role-permission-foundation.sql');
  const managementModel = read('models/managementModel.js');
  const newUser = read('views/pages/management-user-new.ejs');
  const editUser = read('views/fragments/management-user-edit-modal.ejs');
  const userList = read('views/pages/management-users.ejs');

  assert.match(migration, /INSERT INTO roles/);
  assert.match(migration, /'qc',[\s\S]*?'Quality Control'/);
  assert.match(migration, /ON DUPLICATE KEY UPDATE/);
  assert.match(managementModel, /WHEN 'qc' THEN 35/);
  assert.match(managementModel, /qc: 'Quality Control'/);
  assert.match(newUser, /role/);
  assert.match(editUser, /role/);
  assert.match(userList, /Approved default permissions from every assigned role combine/);
});
