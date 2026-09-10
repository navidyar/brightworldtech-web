'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resolveEffectiveLotLabelTemplateSet,
  buildLotLabelTemplateBehaviorSignature
} = require('./lotLabelTemplateResolver');

const lineage = [
  { lotId: 1, name: 'Parent' },
  { lotId: 2, name: 'Child' },
  { lotId: 3, name: 'Grandchild' }
];

test('nearest configured Lot label set wins across the hierarchy', () => {
  const resolved = resolveEffectiveLotLabelTemplateSet({
    lineage,
    directSets: [
      { lotId: 1, assignments: [{ lot_id: 1, label_template_id: 10, is_required: 1, default_quantity: 2, sort_order: 10, is_active: 1, template_name: 'Parent Label', template_status: 'active' }] },
      { lotId: 2, assignments: [{ lot_id: 2, label_template_id: 20, is_required: 0, default_quantity: 1, sort_order: 10, is_active: 1, template_name: 'Child Label', template_status: 'active' }] }
    ]
  });

  assert.equal(resolved.source.lotId, 2);
  assert.equal(resolved.hasDirectCustomization, false);
  assert.deepEqual(buildLotLabelTemplateBehaviorSignature(resolved), ['20|0|1|1']);
});

test('an explicit empty direct set blocks inheritance', () => {
  const resolved = resolveEffectiveLotLabelTemplateSet({
    lineage,
    directSets: [
      { lotId: 1, assignments: [{ lot_id: 1, label_template_id: 10, is_required: 1, default_quantity: 1, sort_order: 10, is_active: 1 }] },
      { lotId: 3, assignments: [] }
    ]
  });

  assert.equal(resolved.source.lotId, 3);
  assert.equal(resolved.hasDirectCustomization, true);
  assert.deepEqual(resolved.assignments, []);
});

test('a hierarchy with no configured label set resolves to an empty application state', () => {
  const resolved = resolveEffectiveLotLabelTemplateSet({ lineage, directSets: [] });
  assert.equal(resolved.source.type, 'none');
  assert.equal(resolved.hasDirectCustomization, false);
  assert.deepEqual(resolved.assignments, []);
});
