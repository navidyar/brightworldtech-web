'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('managed printer view has a separate catalog key and compatibility role default', () => {
  const { PERMISSION_KEYS } = require('../config/permissionCatalog');
  const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
  assert.ok(PERMISSION_KEYS.includes('printers.managed.view'));
  assert.ok(PERMISSION_KEYS.includes('printers.managed.manage'));
  assert.ok(PERMISSION_KEYS.includes('printers.groups.manage'));
  assert.ok(LEGACY_ROLE_GRANTS.admin.includes('printers.managed.view'));
  assert.ok(LEGACY_ROLE_GRANTS.super_admin.includes('printers.managed.view'));
  for (const code of ['management', 'tech_lead', 'qc', 'tech']) {
    assert.equal(LEGACY_ROLE_GRANTS[code].includes('printers.managed.view'), false);
  }
});

test('managed printer view migration seeds the catalog row and adds only existing Admin role grants', () => {
  const script = read('scripts/migrateManagedPrinterViewPermission.js');
  assert.match(script, /PERMISSION_KEY = 'printers\.managed\.view'/);
  assert.match(script, /LEGACY_ROLE_CODES = Object\.freeze\(\['admin', 'super_admin'\]\)/);
  assert.match(script, /ON DUPLICATE KEY UPDATE/);
  assert.match(script, /INSERT IGNORE INTO role_permissions/);
  assert.match(script, /if \(!APPLY\) return/);
  assert.match(script, /await connection\.rollback\(\)/);
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['audit:managed-printer-view-permission'], 'node scripts/migrateManagedPrinterViewPermission.js');
  assert.equal(packageJson.scripts['migrate:managed-printer-view-permission'], 'node scripts/migrateManagedPrinterViewPermission.js --apply');
});
