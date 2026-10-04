'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('Accept and Reject controls require QC Review portal mode in addition to review permission',()=>{
  const table=read('views/fragments/tech-units-table.ejs');
  assert.match(table,/const canShowQcReviewActions = Boolean\(\s*isQcPortalMode\s*&& canRecordQcReview\s*&& qcReviewActionAvailability\.visible/);
  assert.match(table,/<% if \(canShowQcReviewActions\) \{ %>[\s\S]*?qc-review\/accepted\/modal[\s\S]*?qc-review\/rejected\/modal/);
});

test('regular Unit Browser may still display QC status/details but not decision controls',()=>{
  const table=read('views/fragments/tech-units-table.ejs');
  assert.match(table,/qc-review\/details\/modal<%= isQcPortalMode \? '\?qcPortal=1' : '' %>/);
  assert.match(table,/const isQcPortalMode = typeof qcPortalMode !== 'undefined'/);
});

test('QC review server actions remain protected by existing QC review permission',()=>{
  const routes=read('routes/management.js');
  assert.match(routes,/'\/tech\/units\/:unitId\/qc-review\/:decisionCode\/modal'[\s\S]*?requirePermission\('qc\.review\.perform'\)/);
  assert.match(routes,/'\/tech\/units\/:unitId\/qc-review'[\s\S]*?requirePermission\('qc\.review\.perform'\)/);
});
