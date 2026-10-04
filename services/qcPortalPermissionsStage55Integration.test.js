'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

function routeBlock(source, method, route, handler) {
  return source.match(new RegExp(`router\\.${method}\\(\\s*'${route}'[\\s\\S]*?${handler}[\\s\\S]*?\\);`))?.[0] || '';
}

test('QC portal viewing and formal review use separate effective permissions', () => {
  const routes = read('routes/management.js');
  for (const [method, route, handler, permission] of [
    ['get', '/qc/review', 'renderQcPortalReviewPage', 'qc.portal.view'],
    ['get', '/qc/review/table', 'renderQcPortalReviewTable', 'qc.portal.view'],
    ['get', '/tech/units/:unitId/qc-review/:decisionCode/modal', 'renderQcReviewModal', 'qc.review.perform'],
    ['post', '/tech/units/:unitId/qc-review', 'recordQcReview', 'qc.review.perform']
  ]) {
    const block = routeBlock(routes, method, route, handler);
    assert.ok(block.includes(`requirePermission('${permission}')`), `${method.toUpperCase()} ${route}`);
    assert.doesNotMatch(block, /requireRole\(/, route);
  }

  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /canViewQcPortal =[^\n]*hasPermission\('qc\.portal\.view'\)/);
  assert.match(sidebar, /if \(canViewQcPortal\)[\s\S]*?href="\/qc\/review"/);

  const table = read('views/fragments/tech-units-table.ejs');
  assert.match(table, /const canRecordQcReview = hasPermission\('qc\.review\.perform'\)/);
  assert.match(table, /canShowQcReviewActions = Boolean\(\s*isQcPortalMode\s*&& canRecordQcReview/);

  const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');
  for (const role of ['admin', 'management', 'tech_lead', 'qc']) {
    assert.ok(LEGACY_ROLE_GRANTS[role].includes('qc.portal.view'), role);
    assert.ok(LEGACY_ROLE_GRANTS[role].includes('qc.review.perform'), role);
  }
  assert.equal(LEGACY_ROLE_GRANTS.tech.includes('qc.portal.view'), false);
  assert.equal(LEGACY_ROLE_GRANTS.tech.includes('qc.review.perform'), false);
});
