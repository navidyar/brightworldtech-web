'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shared period picker owns date, week, and month inputs instead of relying on browser-native controls', () => {
  const js = read('public/js/date-picker-only.js');

  assert.match(js, /input\[type="date"\][\s\S]*input\[type="week"\][\s\S]*input\[type="month"\]/);
  assert.match(js, /getAttribute\?\.\('type'\)/);
  assert.match(js, /siteDatePickerMode/);
  assert.match(js, /site-date-picker-native/);
  assert.match(js, /site-date-picker-trigger/);
  assert.doesNotMatch(js, /showPicker\s*\(/);
});

test('week picker uses ISO Monday-through-Sunday values and a custom rounded week list', () => {
  const js = read('public/js/date-picker-only.js');
  const css = read('public/css/work-area.css');

  assert.match(js, /function isoWeekStart/);
  assert.match(js, /function getIsoWeekInfo/);
  assert.match(js, /function parseWeek/);
  assert.match(js, /site-date-picker-week-list/);
  assert.match(js, /site-date-picker-week-option/);
  assert.match(js, /Reports Monday through Sunday|formatWeekRange/);
  assert.match(css, /\.site-date-picker-calendar--week[\s\S]*?width:\s*min\(390px/);
  assert.match(css, /\.site-date-picker-week-list\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(css, /\.site-date-picker-period-option\s*\{[\s\S]*?border-radius:\s*9px/);
});

test('month picker provides a custom year-scoped month grid', () => {
  const js = read('public/js/date-picker-only.js');
  const css = read('public/css/work-area.css');

  assert.match(js, /site-date-picker-month-grid/);
  assert.match(js, /site-date-picker-month-option/);
  assert.match(js, /data-site-date-picker-year/);
  assert.match(css, /\.site-date-picker-month-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3/);
});

test('the entire visible period field is the shared clickable trigger', () => {
  const css = read('public/css/work-area.css');

  assert.match(css, /\.site-date-picker-trigger\s*\{[\s\S]*?width:\s*100%[\s\S]*?cursor:\s*pointer/);
  assert.match(css, /\.site-date-picker-native\s*\{[\s\S]*?pointer-events:\s*none !important/);
});

test('reporting week/month inputs on management dashboards are covered by the shared picker', () => {
  const management = read('views/fragments/management-dashboard-completion-foundation.ejs');
  const tech = read('views/fragments/tech-dashboard-productivity.ejs');
  const qc = read('views/pages/management-qc-reporting.ejs');
  const head = read('views/partials/head.ejs');

  [management, tech, qc].forEach((view) => {
    assert.match(view, /type="week"[^>]*data-date-picker-only/);
    assert.match(view, /type="month"[^>]*data-date-picker-only/);
  });
  assert.match(head, /date-picker-only\.js\?v=20260812-stage10w48-cross-browser-period-picker/);
});

test('shared period picker JavaScript has valid syntax', () => {
  execFileSync(process.execPath, ['--check', path.join(root, 'public/js/date-picker-only.js')]);
});
