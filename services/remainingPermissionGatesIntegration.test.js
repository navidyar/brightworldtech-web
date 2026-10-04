'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PERMISSION_KEYS } = require('../config/permissionCatalog');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
const { canSubmitQcCorrectionForCurrentAssignment } = require('./qcCompletionCyclePolicy');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlocks(source) {
  return [...source.matchAll(/router\.(get|post)\(\s*'([^']+)'([\s\S]*?)\n\);/g)]
    .map((match) => ({ method: match[1], route: match[2], block: match[0] }));
}

test('all Configuration routes require view plus the matching action permission', () => {
  const routes = read('routes/config.js');
  assert.match(routes, /router\.use\('\/management\/config', requireAuth, requirePermission\('configuration\.view'\)\)/);
  const blocks = routeBlocks(routes);
  assert.equal(blocks.length, 57);
  for (const { route, block } of blocks) {
    const expected = route === '/management/config' ? 'configuration.view'
      : route === '/management/config/database' ? 'configuration.database.view'
        : route.startsWith('/management/config/printing') ? 'configuration.printing.manage'
          : route.startsWith('/management/config/label-dynamic-fields') ? 'configuration.label_fields.manage'
            : route.startsWith('/management/config/operational-rankings') ? 'configuration.operational_rankings.manage'
              : route.startsWith('/management/config/processor-families') ? 'configuration.processor_families.manage'
                : route.startsWith('/management/config/processors') || route.startsWith('/management/config/processor-types') ? 'configuration.processors.manage'
                  : route.startsWith('/management/config/models') ? 'configuration.models.manage'
                    : 'configuration.values.manage';
    assert.ok(PERMISSION_KEYS.includes(expected));
    assert.ok(block.includes(`requirePermission('${expected}')`), route);
    assert.doesNotMatch(block, /requireRole\(/, route);
  }
  const nav = read('views/partials/configuration-nav.ejs');
  assert.match(nav, /hasPermission\('configuration\.view'\)/);
  assert.match(nav, /hasPermission\('configuration\.database\.view'\)/);
  const valuesPage = read('views/pages/management-config.ejs');
  assert.match(valuesPage, /canManageConfigurationValues = hasPermission\('configuration\.values\.manage'\)/);
  assert.match(valuesPage, /canManageConfigurationValues && category\.supportsDragOrdering/);
  assert.match(read('views/pages/processor-families.ejs'), /if \(hasPermission\('configuration\.processors\.manage'\)\)/);
});

test('Virtual Huddle administration separates history, send, revoke, and delete', () => {
  const routes = read('routes/virtualHuddle.js');
  assert.match(routes, /router\.use\('\/management\/virtual-huddle', requireAuth, requirePermission\('huddle\.administration\.view'\)\)/);
  for (const [route, permission] of [
    ['/management/virtual-huddle/new/modal', 'huddle.send'],
    ['/management/virtual-huddle/preview', 'huddle.send'],
    ['/management/virtual-huddle/:messageId/related/modal', 'huddle.send'],
    ['/management/virtual-huddle/:messageId/recipients/:recipientId/revoke', 'huddle.recipients.revoke'],
    ['/management/virtual-huddle/:messageId/revoke-all', 'huddle.recipients.revoke'],
    ['/management/virtual-huddle/:messageId/delete', 'huddle.messages.delete']
  ]) {
    const block = routes.split(`'${route}'`)[1]?.split('\n')[0] || '';
    assert.ok(block.includes(`requirePermission('${permission}')`), route);
  }
  assert.match(read('views/fragments/virtual-huddle-detail-modal.ejs'), /if \(canRevokeRecipients/);
  assert.match(read('views/fragments/virtual-huddle-detail-modal.ejs'), /if \(canDeleteMessages\)/);
  assert.equal(LEGACY_ROLE_GRANTS.management.includes('huddle.messages.delete'), true);
  assert.match(routes, /'\/management\/virtual-huddle\/:messageId\/delete', requirePermission\('huddle\.messages\.delete'\), requireRole\(adminRoles\)/);
  assert.match(read('controllers/virtualHuddleController.js'), /canDeleteMessages: isAdmin\(req\) && hasPermission\(req, 'huddle\.messages\.delete'\)/);
});

test('QC correction uses effective permissions and still checks current assignment', () => {
  const assigned = { submitterUserId: 1, assignedToUserId: 1 };
  const unassigned = { submitterUserId: 1, assignedToUserId: 2 };
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({ ...assigned, roleCodes: ['admin'], permissions: new Set() }), false);
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({ ...assigned, permissions: new Set(['qc.correction.submit']) }), true);
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({ ...unassigned, permissions: new Set(['qc.correction.submit']) }), false);
  assert.equal(canSubmitQcCorrectionForCurrentAssignment({ ...unassigned, permissions: new Set(['qc.correction.submit_any']) }), true);
  const routes = read('routes/management.js');
  for (const route of ['/tech/units/:unitId/qc-correction/modal', '/tech/units/:unitId/qc-correction']) {
    const block = routes.split(`'${route}'`)[1]?.split('\n);')[0] || '';
    assert.match(block, /requireAnyPermission\(\['qc\.correction\.submit', 'qc\.correction\.submit_any'\]\)/);
  }
  assert.match(read('models/unitQcCorrectionModel.js'), /permissions: submittedByPermissions/);
});
