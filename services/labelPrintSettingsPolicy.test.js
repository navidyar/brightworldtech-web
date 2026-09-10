'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RECENT_PRINTS_MINUTES,
  DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES,
  parseRecentPrintsMinutes,
  parsePrintSetGroupingGapMinutes,
  normalizeLabelPrintSettings
} = require('./labelPrintSettingsPolicy');

test('Recent Prints and Print Set grouping keep the agreed defaults and bounds', () => {
  assert.equal(DEFAULT_RECENT_PRINTS_MINUTES, 15);
  assert.equal(DEFAULT_PRINT_SET_GROUPING_GAP_MINUTES, 3);
  assert.equal(parseRecentPrintsMinutes('15'), 15);
  assert.equal(parseRecentPrintsMinutes('0'), null);
  assert.equal(parsePrintSetGroupingGapMinutes('3'), 3);
  assert.equal(parsePrintSetGroupingGapMinutes('61'), null);
  assert.deepEqual(normalizeLabelPrintSettings({}), {
    recentPrintsMinutes: 15,
    printSetGroupingGapMinutes: 3
  });
});
