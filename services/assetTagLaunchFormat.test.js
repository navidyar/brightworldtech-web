'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AMAZON_ASSET_TAG_DIGITS,
  ASSET_NUMBER_START,
  ASSET_TAG_DIGITS,
  formatAmazonAssetTag,
  formatAssetTagNumber,
  normalizeAmazonAssetTag
} = require('../utils/assetTag');

test('primary BWT Asset Tags use ten digits and launch at numeric value 1111', () => {
  assert.equal(ASSET_TAG_DIGITS, 10);
  assert.equal(ASSET_NUMBER_START, 1111);
  assert.equal(formatAssetTagNumber(1111), 'BWT0000001111');
  assert.equal(formatAssetTagNumber(2300008), 'BWT0002300008');
});

test('AZ tags use nine digits and support launch value 1111', () => {
  assert.equal(AMAZON_ASSET_TAG_DIGITS, 9);
  assert.equal(formatAmazonAssetTag(1111), 'AZ000001111');
  assert.equal(normalizeAmazonAssetTag('AZ000001111'), 'AZ000001111');
  assert.equal(normalizeAmazonAssetTag('AZ00001111'), '');
});
