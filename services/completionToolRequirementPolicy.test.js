'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOverrideReason,
  canOverrideMissingToolRequirements,
  buildCompletionToolRequirementStatus,
  evaluateCompletionToolRequirementEnforcement,
  getMissingToolRequirementMessage
} = require('./completionToolRequirementPolicy');

test('no Tool completion requirements are satisfied without a receipt', () => {
  const status = buildCompletionToolRequirementStatus({
    effectivePolicy: {},
    completedToolSources: [],
    productionCycleKey: 'production:initial:1'
  });
  assert.equal(status.required, false);
  assert.equal(status.satisfied, true);
  assert.deepEqual(status.missing, []);
});

test('required ScanTools receipt must belong to the supplied current-cycle source set', () => {
  const missing = buildCompletionToolRequirementStatus({
    effectivePolicy: { requireScanToolsBeforeCompletion: true },
    completedToolSources: [],
    productionCycleKey: 'production:initial:1'
  });
  assert.equal(missing.satisfied, false);
  assert.deepEqual(missing.missing.map((item) => item.tool_source), ['scantool']);

  const satisfied = buildCompletionToolRequirementStatus({
    effectivePolicy: { requireScanToolsBeforeCompletion: true },
    completedToolSources: ['scantool'],
    productionCycleKey: 'production:initial:1'
  });
  assert.equal(satisfied.satisfied, true);
});

test('ScanTools and TechTools can both be required independently', () => {
  const status = buildCompletionToolRequirementStatus({
    effectivePolicy: {
      requireScanToolsBeforeCompletion: true,
      requireTechToolsBeforeCompletion: true
    },
    completedToolSources: ['scantool'],
    productionCycleKey: 'production:initial:2'
  });
  assert.deepEqual(status.requirements.map((item) => item.tool_source), ['scantool', 'techtools']);
  assert.deepEqual(status.missing.map((item) => item.tool_source), ['techtools']);
});

test('regular Tech cannot override a missing Tool completion requirement', () => {
  const decision = evaluateCompletionToolRequirementEnforcement({
    status: { missing: [{ tool_source: 'techtools', label: 'TechTools' }] },
    roleCodes: ['tech'],
    overrideReason: 'Please complete anyway.'
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.can_override, false);
  assert.equal(decision.code, 'TOOL_COMPLETION_REQUIREMENT_MISSING');
});

test('Tech Lead+ override requires a nonblank reason', () => {
  for (const roleCode of ['tech_lead', 'management', 'admin']) {
    assert.equal(canOverrideMissingToolRequirements([roleCode]), true);
    const decision = evaluateCompletionToolRequirementEnforcement({
      status: { missing: [{ tool_source: 'scantool', label: 'ScanTools' }] },
      roleCodes: [roleCode],
      overrideReason: '   '
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'TOOL_COMPLETION_OVERRIDE_REASON_REQUIRED');
  }
});

test('Tech Lead+ may complete with a mandatory audited override reason', () => {
  const decision = evaluateCompletionToolRequirementEnforcement({
    status: { missing: [{ tool_source: 'scantool', label: 'ScanTools' }] },
    roleCodes: ['tech_lead'],
    overrideReason: 'ScanTools unavailable on this bench.'
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.override_used, true);
  assert.equal(decision.override_reason, 'ScanTools unavailable on this bench.');
});

test('override reason is normalized and bounded', () => {
  assert.equal(normalizeOverrideReason('  Required exception  '), 'Required exception');
  assert.equal(normalizeOverrideReason('x'.repeat(1200)).length, 1000);
});

test('missing Tool requirement message names each required Tool', () => {
  assert.equal(
    getMissingToolRequirementMessage({ missing: [{ label: 'ScanTools' }] }),
    'ScanTools must run during the current production cycle before this Unit can be completed.'
  );
  assert.match(
    getMissingToolRequirementMessage({ missing: [{ label: 'ScanTools' }, { label: 'TechTools' }] }),
    /ScanTools and TechTools/
  );
});
