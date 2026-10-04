'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const { formatUtcSqlDateTime, getDayRangeUtc } = require('../utils/timeZone');

function rangeSql(dateKey, timeZone) {
  const range = getDayRangeUtc(dateKey, timeZone);
  return {
    start: formatUtcSqlDateTime(range.startAt),
    end: formatUtcSqlDateTime(range.endAt),
    hours: (range.endAt - range.startAt) / 3600000
  };
}

test('Tech Unit created-date filters receive the effective request timezone and use UTC boundaries', () => {
  const controller = read('controllers/techController.js');
  const model = read('models/techUnitModel.js');

  assert.match(controller, /createdWindow:[\s\S]*timeZone: req\.timeZone/);
  assert.match(model, /getDayRangeUtc\(createdStartDate, createdTimeZone\)/);
  assert.match(model, /getDayRangeUtc\(createdEndDate, createdTimeZone\)/);
  assert.match(model, /formatUtcSqlDateTime\(createdStartRange\.startAt\)/);
  assert.match(model, /formatUtcSqlDateTime\(createdEndRange\.endAt\)/);
  assert.doesNotMatch(model, /params\.push\(`\$\{createdStartDate\} 00:00:00`\)/);
  assert.doesNotMatch(model, /DATE_ADD\(\?, INTERVAL 1 DAY\)/);
});

test('ordinary Chicago local day becomes the correct UTC query range', () => {
  assert.deepEqual(rangeSql('2026-09-30', 'America/Chicago'), {
    start: '2026-09-30 05:00:00',
    end: '2026-10-01 05:00:00',
    hours: 24
  });
});

test('spring-forward and fall-back local days preserve DST-safe query boundaries', () => {
  assert.deepEqual(rangeSql('2026-03-08', 'America/Chicago'), {
    start: '2026-03-08 06:00:00',
    end: '2026-03-09 05:00:00',
    hours: 23
  });
  assert.deepEqual(rangeSql('2026-11-01', 'America/Chicago'), {
    start: '2026-11-01 05:00:00',
    end: '2026-11-02 06:00:00',
    hours: 25
  });
});

test('another DST timezone and a non-DST timezone produce correct UTC day ranges', () => {
  assert.deepEqual(rangeSql('2026-03-29', 'Europe/London'), {
    start: '2026-03-29 00:00:00',
    end: '2026-03-29 23:00:00',
    hours: 23
  });
  assert.deepEqual(rangeSql('2026-09-30', 'Asia/Kolkata'), {
    start: '2026-09-29 18:30:00',
    end: '2026-09-30 18:30:00',
    hours: 24
  });
});

test('the same selected calendar date moves across UTC days when the browser timezone changes continents', () => {
  assert.deepEqual(rangeSql('2026-09-30', 'Pacific/Auckland'), {
    start: '2026-09-29 11:00:00',
    end: '2026-09-30 11:00:00',
    hours: 24
  });
  assert.deepEqual(rangeSql('2026-09-30', 'America/Los_Angeles'), {
    start: '2026-09-30 07:00:00',
    end: '2026-10-01 07:00:00',
    hours: 24
  });
});

test('rolling 24-hour filter remains elapsed-time based and is not converted to a calendar day', () => {
  const model = read('models/techUnitModel.js');
  assert.match(model, /createdWindow === '24h'[\s\S]*DATE_SUB\(NOW\(\), INTERVAL 24 HOUR\)/);
});
