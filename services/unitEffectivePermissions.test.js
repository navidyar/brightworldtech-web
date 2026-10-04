'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canReverseUnitCompletion, assertCanReverseUnitCompletion } = require('./unitCompletionReversalPolicy');
const { canChooseCompletionAttribution, resolveCompletionUserId } = require('./completionAttributionPolicy');
const { evaluateCompletionToolRequirementEnforcement } = require('./completionToolRequirementPolicy');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
const fs = require('node:fs');
const vm = require('node:vm');

test('custom grants authorize reversal and an effective Deny blocks privileged roles', () => {
  assert.equal(canReverseUnitCompletion(['custom'], new Set(['units.reverse_completion'])), true);
  assert.throws(() => assertCanReverseUnitCompletion(['admin'], new Set()), { code: 'BWT_COMPLETION_REVERSAL_FORBIDDEN' });
});

test('effective permission controls completion attribution, including tampered selections', () => {
  const input = { currentUserId: 20, assignedUserId: 10, requestedUserId: 10 };
  assert.equal(resolveCompletionUserId({ ...input, roleCodes: ['custom'], permissions: new Set(['units.completion_attribution.change']) }), 10);
  assert.equal(canChooseCompletionAttribution(['admin'], new Set()), false);
  assert.throws(() => resolveCompletionUserId({ ...input, roleCodes: ['admin'], permissions: new Set() }), /Choose either/);
});

test('missing tool overrides honor grants and Deny and still require a reason', () => {
  const input = { status: { missing: [{ tool_source: 'scantool' }] }, overrideReason: 'Reviewed manually' };
  assert.equal(evaluateCompletionToolRequirementEnforcement({ ...input, roleCodes: ['custom'], permissions: new Set(['units.tool_requirements.override']) }).allowed, true);
  assert.equal(evaluateCompletionToolRequirementEnforcement({ ...input, roleCodes: ['admin'], permissions: new Set() }).allowed, false);
  assert.equal(evaluateCompletionToolRequirementEnforcement({ ...input, overrideReason: '', permissions: new Set(['units.tool_requirements.override']) }).code, 'TOOL_COMPLETION_OVERRIDE_REASON_REQUIRED');
});

test('lifecycle model checks effective permissions before touching the database', async () => {
  const source = fs.readFileSync(require.resolve('../models/techUnitModel'), 'utf8');
  const functions = ['assertUnitLifecycleAuthority', 'parkTechUnit', 'returnTechUnitToActive'];
  const bodies = functions.map((name) => {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const end = source.indexOf('\n}\n', start) + 2;
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
  }).join('\n');
  const probe = new Error('authorized call reached schema checks');
  const ctx = { Set, getUnitTableState: async () => { throw probe; }, normalizeRequiredInteger: Number,
    createUnitLifecycleError: (code, message) => Object.assign(new Error(message), { code }) };
  vm.createContext(ctx);
  vm.runInContext(bodies, ctx);
  for (const [name, permissionKey, actorKey] of [['parkTechUnit', 'units.park', 'parkedByUserId'], ['returnTechUnitToActive', 'units.return_to_active', 'returnedByUserId']]) {
    const input = { unitId: 1, destinationLotId: 2, [actorKey]: 3 };
    await assert.rejects(ctx[name]({ ...input, actorRoleCodes: ['admin'], actorPermissions: new Set() }), { code: 'BWT_UNIT_LIFECYCLE_FORBIDDEN' });
    await assert.rejects(ctx[name]({ ...input, actorRoleCodes: ['custom'], actorPermissions: new Set([permissionKey]) }), (error) => error === probe);
  }
});

test('Tech retains its own QC correction grant and controls match action permissions', () => {
  assert.ok(LEGACY_ROLE_GRANTS.tech.includes('qc.correction.submit'));
  const table = fs.readFileSync('views/fragments/tech-units-table.ejs', 'utf8');
  assert.match(table, /canApproveUnitOutcomes = !isQcPortalMode && hasPermission\('units.outcome.approve'\)/);
  const controller = fs.readFileSync('controllers/techController.js', 'utf8');
  for (const name of ['parkTechUnit', 'returnTechUnitToActive', 'reverseUnitWorkCompletion', 'recordUnitWorkCompletion']) {
    const start = controller.indexOf(`await techUnitModel.${name}({`);
    assert.ok(start >= 0);
    assert.match(controller.slice(start, controller.indexOf('\n    });', start)), /actorPermissions: req.currentPermissions \|\| new Set\(\)/);
  }
});
