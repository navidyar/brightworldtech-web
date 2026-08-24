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

test('QC receives Unit Browser, Unit History, and own Request-history routes without production authority', () => {
  const routes = read('routes/management.js');

  assert.match(routes, /const techRoles = \['admin', 'management', 'tech_lead', 'tech'\]/);
  assert.match(routes, /const unitBrowserRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /const unitHistoryRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /'\/tech\/units',[\s\S]*?requireRole\(unitBrowserRoles\)[\s\S]*?renderTechUnitsPage/);
  assert.match(routes, /'\/tech\/units\/table',[\s\S]*?requireRole\(unitBrowserRoles\)[\s\S]*?renderTechUnitsTable/);
  assert.match(routes, /'\/tech\/units\/:unitId\/history',[\s\S]*?requireRole\(unitHistoryRoles\)/);
  assert.match(routes, /'\/tech\/units\/:unitId',[\s\S]*?requireRole\(unitBrowserRoles\)[\s\S]*?renderTechUnitDetailPage/);
  assert.match(routes, /'\/tech\/units\/new',[\s\S]*?requireRole\(techRoles\)/);
  assert.match(routes, /'\/tech\/units\/:unitId\/edit',[\s\S]*?requireRole\(techRoles\)/);
  assert.match(routes, /const unitRequestRoles = \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(routes, /'\/unit-requests',[\s\S]*?requireRole\(unitRequestRoles\)/);
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
  assert.match(table, /const canEditTechUnits = !isQcPortalMode && currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead', 'tech'\]/);
  assert.match(table, /const canViewUnitHistory = currentUserRoles\.some\(\(roleCode\) => \['admin', 'management', 'tech_lead', 'qc', 'tech'\]/);
  assert.match(table, /<% if \(canEditTechUnits && !unit\.isParked && !isReadOnlySearchResult\) \{ %>/);
  assert.match(table, /<% if \(canViewCurrentLotWeight\) \{ %>/);
  assert.doesNotMatch(table, /canCompleteTechUnits[^\n]*'qc'/);
  assert.match(sidebar, /canAccessUnitRequests\(\)/);
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
  assert.match(newUser, /QC grants read-only cross-technician Unit access/);
  assert.match(editUser, /QC grants read-only cross-technician Unit access/);
  assert.match(userList, /Management users can assign Management, Tech Lead, QC, or Tech/);
});
