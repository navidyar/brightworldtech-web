'use strict';

const MINIMUM_DRAG_ORDER_VALUES = 3;

const POPULARITY_SORTED_CONFIG_CATEGORY_CODES = new Set([
  'unit_categories',
  'unit_category',
  'unit_types',
  'unit_type',
  'ram_types',
  'ram_type',
  'storage_types',
  'storage_type',
  'ssd_types',
  'ssd_type',
  'storage_wipe_statuses',
  'storage_wipe_status',
  'wipe_statuses',
  'wipe_status',
  'operating_systems',
  'operating_system',
  'keyboard_languages',
  'keyboard_language',
  'gpu_types',
  'gpu_type',
  'graphics_adapter_types',
  'cosmetic_issue_types',
  'cosmetic_issue_type',
  'cosmetic_issues',
  'hardware_issue_types',
  'hardware_issue_type',
  'hardware_issues',
  'issue_locations',
  'issue_location',
  'unit_issue_locations'
]);

function normalizeCategoryCode(value) {
  return String(value || '').trim().toLowerCase();
}

function isPopularitySortedConfigCategory(categoryCode) {
  return POPULARITY_SORTED_CONFIG_CATEGORY_CODES.has(normalizeCategoryCode(categoryCode));
}

function getConfigCategoryOrderingPolicy(categoryCode, valueCount = 0) {
  const normalizedValueCount = Number.isFinite(Number(valueCount))
    ? Math.max(0, Number(valueCount))
    : 0;
  const usesPopularitySorting = isPopularitySortedConfigCategory(categoryCode);

  return {
    usesPopularitySorting,
    supportsDragOrdering: !usesPopularitySorting && normalizedValueCount >= MINIMUM_DRAG_ORDER_VALUES,
    minimumDragOrderValues: MINIMUM_DRAG_ORDER_VALUES
  };
}

module.exports = {
  MINIMUM_DRAG_ORDER_VALUES,
  POPULARITY_SORTED_CONFIG_CATEGORY_CODES,
  getConfigCategoryOrderingPolicy,
  isPopularitySortedConfigCategory,
  normalizeCategoryCode
};
