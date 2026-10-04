'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('team-metrics viewers do not default to the first Tech or current user', () => {
  const model = read('models/dashboardModel.js');
  assert.match(model, /const requestedTechId = safeFilters\.techDashboardUserId \|\| null/);
  assert.match(model, /const selectedTechId = canViewAllTechs[\s\S]*\? \(requestedTech \? requestedTech\.userId : null\)[\s\S]*: \(currentUserEligible \? currentUserId : null\)/);
  assert.doesNotMatch(model, /safeFilters\.techDashboardUserId \|\| techUsers\[0\]\?\.userId/);
  assert.match(model, /Promise\.resolve\(\[\{ completed: 0, weighted: 0 \}, \[\], \[\]\]\)/);
});

test('Tech selector starts blank for team-metrics viewers and individual charts wait for selection', () => {
  const view = read('views/fragments/tech-dashboard-productivity.ejs');
  assert.match(view, /select name="techDashboardUserId" required/);
  assert.match(view, /<option value=""[\s\S]*?Select a Tech<\/option>/);
  assert.match(view, /<% if \(selectedTech\) \{ %>[\s\S]*dashboard-selected-period-note[\s\S]*dashboard-pie-grid/);
  assert.match(view, /Select a Tech User to view individual productivity metrics\./);
});

test('users without team-metrics permission use their own id only when eligible for productivity metrics', () => {
  const model = read('models/dashboardModel.js');
  assert.match(model, /const selectedTechId = canViewAllTechs[\s\S]*: \(currentUserEligible \? currentUserId : null\)/);
  assert.match(model, /const currentUserTechOption = currentUserEligible \? buildCurrentUserTechOption\(context\) : null/);
  assert.match(model, /const selectedTech = canViewAllTechs[\s\S]*currentUserTechOption/);
});
