'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveEffectivePermissions } = require('./permissionResolver');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('top bar uses current role display names instead of generated internal role codes', () => {
  const template = read('views/partials/topbar.ejs');
  assert.match(template, /currentPermissionContext\?\.roles/);
  assert.match(template, /role && role\.name/);
  assert.match(template, /topbarRoleNames\.join/);
  assert.doesNotMatch(template, /<p><%= currentRoles\.map\(formatRoleLabel\)\.join\(', '\) \|\| 'User' %><\/p>/);
});

test('effective permissions are the role grants unless explicit user overrides change them', () => {
  const grants = ['dashboards.management.view', 'lots.view', 'units.view'];
  const effective = resolveEffectivePermissions({ rolePermissionKeys: grants, userOverrides: [] });
  assert.deepEqual([...effective].sort(), [...grants].sort());

  const withOverride = resolveEffectivePermissions({
    rolePermissionKeys: grants,
    userOverrides: [
      { permissionKey: 'lots.view', effect: 'deny' },
      { permissionKey: 'units.edit', effect: 'allow' }
    ]
  });

  assert.equal(withOverride.has('lots.view'), false);
  assert.equal(withOverride.has('units.view'), true);
  assert.equal(withOverride.has('units.edit'), true);
});

test('cross-technician QC scope is permission-based for custom roles', () => {
  const controller = read('controllers/techController.js');
  const block = controller.slice(
    controller.indexOf('function canViewCrossTechnicianQcSummary'),
    controller.indexOf('function resolveQcSummaryTechnicianUserId')
  );
  assert.match(block, /currentPermissions instanceof Set/);
  assert.match(block, /qc\.summary\.cross_technician/);
  assert.doesNotMatch(block, /getCurrentRoleCodes|roleCode|tech_lead|\['admin'/);
});


test('sidebar navigation groups are permission-driven for custom roles', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.doesNotMatch(sidebar, /canAccessMenuArea\(/);
  assert.doesNotMatch(sidebar, /isQcOnlyNavigationUser/);
  assert.match(sidebar, /showRequestsInQcSection = canViewQcPortal && canViewRequests && !canViewUnits && !canManageOwnPrinters/);
  assert.match(sidebar, /showTechSection = canViewUnits \|\| canManageOwnPrinters \|\| \(canViewRequests && !showRequestsInQcSection\)/);
});
