'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read=(file)=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
function block(source,method,route){const i=source.indexOf(`'${route}'`);const s=source.lastIndexOf(`router.${method}(`,i);const e=source.indexOf(');',i)+2;return source.slice(s,e);}
test('Lot configuration, requirement, validation, and AZ-tag routes use dedicated permissions',()=>{
 const routes=read('routes/lots.js');const groups={
  'lots.requirements.manage':[['get','/management/lots/:lotId/requirements/modal'],['post','/management/lots/:lotId/requirements/:requirementId/customize'],['post','/management/lots/:lotId/requirements/:requirementId/stop-inheriting'],['post','/management/lots/:lotId/requirements/inheritance/:requirementTypeConfigValueId/restore'],['get','/management/lots/:lotId/requirements/new/modal'],['post','/management/lots/:lotId/requirements'],['get','/management/lots/:lotId/requirements/:requirementId/edit/modal'],['post','/management/lots/:lotId/requirements/:requirementId/edit/modal'],['get','/management/lots/:lotId/requirements/:requirementId/delete/modal'],['post','/management/lots/:lotId/requirements/:requirementId/delete']],
  'lots.amazon_tags.generate':[['get','/management/lots/:lotId/amazon-asset-tags/modal'],['post','/management/lots/:lotId/amazon-asset-tags/generate']],
  'lots.unit_form.configure':[['get','/management/lots/:lotId/unit-form/modal'],['post','/management/lots/:lotId/unit-form/modal']],
  'lots.unit_browser.configure':[['get','/management/lots/:lotId/unit-browser/modal'],['post','/management/lots/:lotId/unit-browser/modal']],
  'lots.labels.configure':[['get','/management/lots/:lotId/labels/modal'],['post','/management/lots/:lotId/labels/modal']],
  'lots.validation.override':[['get','/management/lots/:lotId/units/:unitId/validation/modal'],['post','/management/lots/:lotId/units/:unitId/validation/accept'],['post','/management/lots/:lotId/units/:unitId/validation/overrides/:overrideId/revoke']]
 };
 for(const [permission,routesToCheck] of Object.entries(groups)) for(const [method,route] of routesToCheck){const b=block(routes,method,route);assert.ok(b.includes("requirePermission('lots.view')"),route);assert.ok(b.includes(`requirePermission('${permission}')`),`${route}: ${permission}`);}
 const detail=read('views/pages/management-lot-detail.ejs');for(const permission of Object.keys(groups))assert.ok(detail.includes(`hasPermission('${permission}')`),permission);
 const requirements=read('views/fragments/lot-requirements-modal.ejs');assert.ok(requirements.includes("hasPermission('lots.requirements.manage')"));
});
