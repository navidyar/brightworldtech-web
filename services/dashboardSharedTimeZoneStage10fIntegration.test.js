'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatDateKey, getDayRangeUtc, formatUtcSqlDateTime } = require('../utils/timeZone');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function rangeSql(dateKey, timeZone) {
  const range = getDayRangeUtc(dateKey, timeZone);
  return {
    start: formatUtcSqlDateTime(range.startAt),
    end: formatUtcSqlDateTime(range.endAt)
  };
}

test('dashboard reporting windows reuse the shared timezone foundation', () => {
  const model = read('models/dashboardModel.js');

  assert.match(model, /normalizeTimeZone, formatDateKey, getDayRangeUtc, formatUtcSqlDateTime/);
  assert.match(model, /formatDateKey\(new Date\(\), safeTimeZone\)/);
  assert.match(model, /getDayRangeUtc\(safeStartDate, timeZone\)/);
  assert.match(model, /getDayRangeUtc\(safeEndDate, timeZone\)/);
  assert.match(model, /formatUtcSqlDateTime\(startRange\.startAt\)/);
  assert.match(model, /formatUtcSqlDateTime\(endRange\.endAt\)/);

  assert.doesNotMatch(model, /function getReportingDateKey\(/);
  assert.doesNotMatch(model, /function getTimeZoneOffsetMs\(/);
  assert.doesNotMatch(model, /function zonedDateTimeToUtc\(/);
  assert.doesNotMatch(model, /function formatSqlDateTime\(/);
});

test('shared dashboard boundaries preserve ordinary, DST, non-DST, and rollover behavior', () => {
  assert.deepEqual(rangeSql('2026-03-08', 'America/Chicago'), {
    start: '2026-03-08 06:00:00',
    end: '2026-03-09 05:00:00'
  });

  assert.deepEqual(rangeSql('2026-11-01', 'America/Chicago'), {
    start: '2026-11-01 05:00:00',
    end: '2026-11-02 06:00:00'
  });

  assert.deepEqual(rangeSql('2026-03-29', 'Europe/London'), {
    start: '2026-03-29 00:00:00',
    end: '2026-03-29 23:00:00'
  });

  assert.deepEqual(rangeSql('2026-03-08', 'Asia/Kolkata'), {
    start: '2026-03-07 18:30:00',
    end: '2026-03-08 18:30:00'
  });

  assert.equal(formatDateKey(new Date('2026-01-02T03:30:00.000Z'), 'Pacific/Auckland'), '2026-01-02');
  assert.equal(formatDateKey(new Date('2026-01-02T03:30:00.000Z'), 'America/Los_Angeles'), '2026-01-01');
});
