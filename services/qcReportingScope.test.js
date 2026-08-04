'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QcReportingScopeError,
  buildQcReportingScope,
  formatIsoWeekKey,
  parseIsoWeekKey,
  resolvePeriodFilters
} = require('./qcReportingScope');

const fixedNow = new Date('2026-07-29T17:22:00.000Z');
const technicianOptions = [
  { userId: 10, label: 'Alice Tech' },
  { userId: 20, label: 'Bob Tech' },
  { userId: 30, label: 'Casey Tech' },
  { userId: 40, label: 'Dana Tech' }
];

test('QC reporting defaults to all-time and all reviewed technicians', () => {
  const scope = buildQcReportingScope({}, technicianOptions, { now: fixedNow });

  assert.equal(scope.period, 'all_time');
  assert.equal(scope.startAt, null);
  assert.equal(scope.endAt, null);
  assert.deepEqual(scope.selectedTechnicianIds, []);
  assert.equal(scope.scopeLabel, 'All Time · All reviewed technicians');
});

test('QC reporting day scope uses Chicago day boundaries and completion dates', () => {
  const scope = buildQcReportingScope({ period: 'day', date: '2026-07-29' }, technicianOptions, {
    now: fixedNow
  });

  assert.equal(scope.startDate, '2026-07-29');
  assert.equal(scope.endDate, '2026-07-29');
  assert.equal(scope.startAt, '2026-07-29 05:00:00');
  assert.equal(scope.endAt, '2026-07-30 05:00:00');
  assert.equal(scope.label, 'Jul 29, 2026');
});

test('QC reporting resolves ISO week and month scopes consistently', () => {
  assert.equal(formatIsoWeekKey('2026-07-29'), '2026-W31');
  assert.deepEqual(parseIsoWeekKey('2026-W31'), {
    startDate: '2026-07-27',
    endDate: '2026-08-02'
  });

  const week = resolvePeriodFilters({ period: 'work_week', week: '2026-W31' }, { now: fixedNow });
  assert.equal(week.startDate, '2026-07-27');
  assert.equal(week.endDate, '2026-08-02');

  const month = resolvePeriodFilters({ period: 'month', month: '2026-07' }, { now: fixedNow });
  assert.equal(month.startDate, '2026-07-01');
  assert.equal(month.endDate, '2026-07-31');
  assert.equal(month.label, 'July 2026');
});

test('month-to-date ends on the current BWTDallas display date', () => {
  const scope = resolvePeriodFilters({ period: 'month_to_date' }, { now: fixedNow });

  assert.equal(scope.startDate, '2026-07-01');
  assert.equal(scope.endDate, '2026-07-29');
  assert.equal(scope.startAt, '2026-07-01 05:00:00');
  assert.equal(scope.endAt, '2026-07-30 05:00:00');
});

test('custom ranges require two valid ordered dates', () => {
  assert.throws(
    () => resolvePeriodFilters({
      period: 'custom_range',
      startDate: '2026-07-20',
      endDate: ''
    }, { now: fixedNow }),
    (error) => error instanceof QcReportingScopeError && /both a valid Start date and End date/.test(error.message)
  );

  assert.throws(
    () => resolvePeriodFilters({
      period: 'custom_range',
      startDate: '2026-07-30',
      endDate: '2026-07-20'
    }, { now: fixedNow }),
    /Start date cannot be after the End date/
  );
});

test('technician selections create an ad hoc reporting team and ignore unknown IDs', () => {
  const scope = buildQcReportingScope({
    technicianId: ['30', '10', '999', '30']
  }, technicianOptions, { now: fixedNow });

  assert.deepEqual(scope.selectedTechnicianIds, [10, 30]);
  assert.equal(scope.teamLabel, 'Alice Tech, Casey Tech');
  assert.deepEqual(scope.queryFilters.technicianUserIds, [10, 30]);
});

test('larger technician selections use a compact team label', () => {
  const scope = buildQcReportingScope({
    technicianId: ['10', '20', '30', '40']
  }, technicianOptions, { now: fixedNow });

  assert.equal(scope.teamLabel, '4 selected technicians');
});
