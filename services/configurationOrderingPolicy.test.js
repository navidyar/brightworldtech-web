'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const {
  MINIMUM_DRAG_ORDER_VALUES,
  getConfigCategoryOrderingPolicy,
  isPopularitySortedConfigCategory
} = require('./configurationOrderingPolicy');

test('popularity-controlled configuration categories do not permit manual drag ordering', () => {
  for (const systemCategoryId of [
    SYSTEM_CONFIG_CATEGORY_IDS.UNIT_CATEGORIES,
    SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_WIPE_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.OPERATING_SYSTEMS,
    SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES,
    SYSTEM_CONFIG_CATEGORY_IDS.GPU_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_ISSUE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.HARDWARE_ISSUE_TYPES,
    SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_LOCATIONS
  ]) {
    assert.equal(isPopularitySortedConfigCategory(systemCategoryId), true, String(systemCategoryId));
    assert.deepEqual(getConfigCategoryOrderingPolicy(systemCategoryId, 12), {
      usesPopularitySorting: true,
      supportsDragOrdering: false,
      minimumDragOrderValues: MINIMUM_DRAG_ORDER_VALUES
    });
  }
});

test('fixed semantic lists become drag-orderable at three active values', () => {
  for (const systemCategoryId of [
    SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.UNIT_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.COSMETIC_GRADES,
    SYSTEM_CONFIG_CATEGORY_IDS.ISSUE_SEVERITIES,
    SYSTEM_CONFIG_CATEGORY_IDS.DIAGNOSTICS_STATUSES,
    SYSTEM_CONFIG_CATEGORY_IDS.OVERRIDE_STATUSES
  ]) {
    assert.deepEqual(getConfigCategoryOrderingPolicy(systemCategoryId, 3), {
      usesPopularitySorting: false,
      supportsDragOrdering: true,
      minimumDragOrderValues: 3
    });
  }
});

test('manual drag ordering stays hidden for lists with fewer than three active values', () => {
  const id = SYSTEM_CONFIG_CATEGORY_IDS.ABSOLUTE_STATUSES;
  assert.equal(getConfigCategoryOrderingPolicy(id, 0).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy(id, 1).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy(id, 2).supportsDragOrdering, false);
  assert.equal(getConfigCategoryOrderingPolicy(id, 3).supportsDragOrdering, true);
});
