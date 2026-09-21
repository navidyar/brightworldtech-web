'use strict';

const LABEL_LIBRARY_STORAGE_RELATIVE_PATH = 'storage/label-library';
const LABEL_TEMPLATE_NEW_BADGE_DAYS = 14;
const LABEL_PRINT_SET_GROUPING_GAP_MINUTES = 3;

const LABEL_TEMPLATE_PRINT_SCOPES = Object.freeze([
  Object.freeze({ code: 'lot', label: 'Lot Selection', description: 'Available to Lot configuration and Unit/Lot print workflows.' }),
  Object.freeze({ code: 'standalone', label: 'Standalone', description: 'Printed directly from the Label Library and excluded from Lot configuration.' })
]);

const LABEL_TEMPLATE_CATEGORIES = Object.freeze([
  Object.freeze({ code: 'standard', label: 'Standard / Generic' }),
  Object.freeze({ code: 'dell', label: 'Dell' }),
  Object.freeze({ code: 'lenovo', label: 'Lenovo' }),
  Object.freeze({ code: 'hp', label: 'HP' }),
  Object.freeze({ code: 'custom', label: 'Custom' }),
  Object.freeze({ code: 'other', label: 'Other' })
]);

const INITIAL_STANDARD_LABEL_TEMPLATE = Object.freeze({
  name: 'Standard Unit Label · 62 mm',
  description: 'Current BWTDallas production Unit label registered for Label Library migration.',
  categoryCode: 'standard',
  printScope: 'lot',
  printerProfileCode: 'brother_ql810w_300dpi',
  mediaCode: '62mm_continuous',
  dpi: 300,
  canvasWidthDots: 720,
  canvasHeightDots: 360,
  printableWidthDots: 696,
  horizontalOffsetDots: 12,
  feedMarginDots: 35
});

const LABEL_TEMPLATE_STATUSES = Object.freeze(['draft', 'active', 'archived']);
const LABEL_ASSET_KINDS = Object.freeze([
  'logo',
  'image',
  'background',
  'config_json'
]);
const LABEL_ASSET_ROLES = Object.freeze([
  'logo',
  'image',
  'background',
  'config_json'
]);

module.exports = {
  LABEL_LIBRARY_STORAGE_RELATIVE_PATH,
  LABEL_TEMPLATE_NEW_BADGE_DAYS,
  LABEL_PRINT_SET_GROUPING_GAP_MINUTES,
  LABEL_TEMPLATE_CATEGORIES,
  LABEL_TEMPLATE_PRINT_SCOPES,
  INITIAL_STANDARD_LABEL_TEMPLATE,
  LABEL_TEMPLATE_STATUSES,
  LABEL_ASSET_KINDS,
  LABEL_ASSET_ROLES
};
