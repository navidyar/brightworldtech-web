const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const { getDayRangeUtc, formatUtcSqlDateTime } = require('../utils/timeZone');
const { formatTimeWithZone } = require('../views/partials/helpers');

test('Login Activity records audit timestamps explicitly in UTC', () => {
  const authModel = read('models/authModel.js');
  assert.match(authModel, /INSERT INTO user_login_activity[\s\S]*?UTC_TIMESTAMP\(\)/);
});

test('Login Activity reads timezone-less DATETIME values as explicit UTC strings', () => {
  const model = read('models/managementModel.js');
  assert.match(model, /DATE_FORMAT\(MIN\(ula\.logged_in_at\), '%Y-%m-%dT%H:%i:%s\.000Z'\)/);
  assert.match(model, /DATE_FORMAT\(MAX\(ula\.logged_in_at\), '%Y-%m-%dT%H:%i:%s\.000Z'\)/);
  assert.match(model, /DATE_FORMAT\(ula\.logged_in_at, '%Y-%m-%dT%H:%i:%s\.000Z'\) AS logged_in_at/);
  assert.match(model, /formatUtcSqlDateTime\(startAt\)/);
  assert.match(model, /formatUtcSqlDateTime\(endAt\)/);
});

test('IANA display formatting applies the requested region and daylight-saving rules', () => {
  assert.match(formatTimeWithZone('2026-01-15T15:00:00.000Z', 'America/Chicago'), /09:00 AM CST/);
  assert.match(formatTimeWithZone('2026-07-15T14:00:00.000Z', 'America/Chicago'), /09:00 AM CDT/);
  assert.match(formatTimeWithZone('2026-07-15T14:00:00.000Z', 'Europe/London'), /03:00 PM GMT\+1|03:00 PM BST/);
});

test('local-day UTC boundaries account for DST in the supplied IANA timezone', () => {
  const spring = getDayRangeUtc('2026-03-08', 'America/Chicago');
  const fall = getDayRangeUtc('2026-11-01', 'America/Chicago');
  const india = getDayRangeUtc('2026-03-08', 'Asia/Kolkata');

  assert.equal((spring.endAt - spring.startAt) / 3600000, 23);
  assert.equal((fall.endAt - fall.startAt) / 3600000, 25);
  assert.equal((india.endAt - india.startAt) / 3600000, 24);
  assert.equal(formatUtcSqlDateTime(spring.startAt), '2026-03-08 06:00:00');
  assert.equal(formatUtcSqlDateTime(spring.endAt), '2026-03-09 05:00:00');
});

test('Login Activity uses the request timezone instead of a fixed region', () => {
  const controller = read('controllers/managementController.js');
  const page = read('views/pages/management-login-activity.ejs');
  assert.match(controller, /formatDateKey\(new Date\(\), req\.timeZone\)/);
  assert.match(controller, /getDayRangeUtc\(selectedDate, req\.timeZone\)/);
  assert.match(page, /browser time zone: <%= timeZone %>/);
  assert.doesNotMatch(page, /Dallas\/Central|CST\/CDT/);
});
