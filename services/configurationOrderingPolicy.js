'use strict';

const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const MINIMUM_DRAG_ORDER_VALUES = 3;
const POPULARITY_SORTED_SYSTEM_CATEGORY_IDS = new Set([
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
]);

function normalizeSystemCategoryId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPopularitySortedConfigCategory(systemConfigCategoryId) {
  return POPULARITY_SORTED_SYSTEM_CATEGORY_IDS.has(normalizeSystemCategoryId(systemConfigCategoryId));
}

function getConfigCategoryOrderingPolicy(systemConfigCategoryId, valueCount = 0) {
  const normalizedValueCount = Number.isFinite(Number(valueCount))
    ? Math.max(0, Number(valueCount))
    : 0;
  const usesPopularitySorting = isPopularitySortedConfigCategory(systemConfigCategoryId);

  return {
    usesPopularitySorting,
    supportsDragOrdering: !usesPopularitySorting && normalizedValueCount >= MINIMUM_DRAG_ORDER_VALUES,
    minimumDragOrderValues: MINIMUM_DRAG_ORDER_VALUES
  };
}

module.exports = {
  MINIMUM_DRAG_ORDER_VALUES,
  POPULARITY_SORTED_SYSTEM_CATEGORY_IDS,
  getConfigCategoryOrderingPolicy,
  isPopularitySortedConfigCategory,
  normalizeSystemCategoryId
};
