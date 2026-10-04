'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { requireAnyPermission } = require('../middleware/authMiddleware');

function exercise(permissions, authenticated = true) {
  let passed = false;
  const response = {
    statusCode: 200,
    redirectPath: null,
    status(code) { this.statusCode = code; return this; },
    render() { return this; },
    redirect(path) { this.redirectPath = path; return this; }
  };
  requireAnyPermission(['printers.solo.manage', 'printers.managed.view'])(
    { currentUser: authenticated ? { user_id: 1 } : null, currentPermissions: new Set(permissions) },
    response,
    () => { passed = true; }
  );
  return { passed, response };
}

test('printer registry event access accepts either permission, rejects denied and unauthenticated users', () => {
  assert.equal(exercise(['printers.managed.view']).passed, true);
  assert.equal(exercise(['printers.solo.manage']).passed, true);
  assert.equal(exercise([]).response.statusCode, 403);
  assert.equal(exercise(['printers.managed.manage']).response.statusCode, 403);
  assert.equal(exercise(['printers.managed.view'], false).response.redirectPath, '/login');
});

test('managed Printer page, live fragment, and events are permission guarded', () => {
  const routes = read('routes/management.js');
  for (const route of ['/management/printers', '/management/printers/live']) {
    const block = routes.split(`  '${route}',`)[1]?.split('\n);')[0] || '';
    assert.match(block, /requirePermission\('printers\.managed\.view'\)/);
    assert.doesNotMatch(block, /requireFeature\('managedPrinters'\)/);
  }
  assert.match(routes, /'\/label-printers\/events',[\s\S]*?requireAnyPermission\(\['printers\.solo\.manage', 'printers\.managed\.view'\]\)/);
});

test('Printer Management controls and network details are individually gated', () => {
  const page = read('views/pages/management-printers.ejs');
  const live = read('views/fragments/management-printers-live.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(page, /hasPermission\('printers\.groups\.manage'\)[\s\S]*?New Group/);
  assert.match(page, /hasPermission\('printers\.managed\.manage'\)[\s\S]*?Add Printer/);
  assert.match(live, /hasPermission\('printers\.network_details\.view'\)[\s\S]*?printer\.host_address[\s\S]*?Network details hidden/);
  assert.match(live, /hasPermission\('printers\.managed\.manage'\)[\s\S]*?Convert to Managed/);
  assert.match(live, /hasPermission\('printers\.groups\.manage'\)[\s\S]*?Manage Members/);
  assert.match(sidebar, /canViewManagedPrinters[\s\S]*?showAdminSection[\s\S]*?Printer Management/);
});
