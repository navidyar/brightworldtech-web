'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MINIMUM_DRAG_ORDER_VALUES,
  getConfigCategoryOrderingPolicy,
  isPopularitySortedConfigCategory
} = require('./configurationOrderingPolicy');

test('popularity-controlled configuration categories do not permit manual drag ordering', () => {
  for (const categoryCode of [
    'unit_categories',
    'ram_types',
    'storage_types',
    'storage_wipe_statuses',
    'operating_systems',
    'keyboard_languages',
    'gpu_types',
    'cosmetic_issue_types',
    'hardware_issue_types',
    'issue_locations'
  ]) {
    assert.equal(isPopularitySortedConfigCategory(categoryCode), true, categoryCode);
    assert.deepEqual(getConfigCategoryOrderingPolicy(categoryCode, 12), {
      usesPopularitySorting: true,
      supportsDragOrdering: false,
      minimumDragOrderValues: MINIMUM_DRAG_ORDER_VALUES
    });
  }
});

test('fixed semantic lists become drag-orderable at three active values', () => {
  for (const categoryCode of [
    'absolute_statuses',
    'unit_statuses',
    'cosmetic_grades',
    'issue_severities',
    'diagnostics_statuses',
    'pass_fail_statuses'
  ]) {
    assert.deepEqual(getConfigCategoryOrderingPolicy(categoryCode, 3), {
      usesPopularitySorting: false,
      supportsDragOrdering: true,
      minimumDragOrderValues: 3
    });
  }
});

test('manual drag ordering stays hidden for lists with fewer than three active values', () => {
  assert.equal(getConfigCategoryOrderingPolicy('absolute_statuses', 0).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy('absolute_statuses', 1).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy('absolute_statuses', 2).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy('absolute_statuses', 3).supportsDragOrdering, true);
});
