'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDayRangeUtc, formatUtcSqlDateTime } = require('../utils/timeZone');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function rangeSql(dateKey, timeZone) {
  const range = getDayRangeUtc(dateKey, timeZone);
  return {
    start: formatUtcSqlDateTime(range.startAt),
    end: formatUtcSqlDateTime(range.endAt)
  };
}

test('dashboard generic Unit filters use request timezone and shared UTC day boundaries', () => {
  const controller = read('controllers/dashboardController.js');
  const model = read('models/dashboardModel.js');

  assert.match(controller, /timeZone: req\.timeZone/);
  assert.match(model, /function buildUnitFilterWhere\(filters = \{\}, alias = 'u', timeZone = 'UTC'\)/);
  assert.match(model, /getDayRangeUtc\(safeFilters\.startDate, safeTimeZone\)/);
  assert.match(model, /getDayRangeUtc\(safeFilters\.endDate, safeTimeZone\)/);
  assert.match(model, /formatUtcSqlDateTime\(startRange\.startAt\)/);
  assert.match(model, /formatUtcSqlDateTime\(endRange\.endAt\)/);
  assert.doesNotMatch(model, /params\.push\(`\$\{safeFilters\.startDate\} 00:00:00`\)/);
  assert.doesNotMatch(model, /created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.match(model, /getUnitStats\(safeFilters, safeTimeZone\)/);
  assert.match(model, /getTechActivitySummary\(safeFilters, safeTimeZone\)/);
});

test('shared boundaries cover ordinary, DST, non-DST, and cross-continent dates', () => {
  assert.deepEqual(rangeSql('2026-02-10', 'America/Chicago'), {
    start: '2026-02-10 06:00:00',
    end: '2026-02-11 06:00:00'
  });

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

  assert.deepEqual(rangeSql('2026-01-02', 'Pacific/Auckland'), {
    start: '2026-01-01 11:00:00',
    end: '2026-01-02 11:00:00'
  });

  assert.deepEqual(rangeSql('2026-01-01', 'America/Los_Angeles'), {
    start: '2026-01-01 08:00:00',
    end: '2026-01-02 08:00:00'
  });
});
