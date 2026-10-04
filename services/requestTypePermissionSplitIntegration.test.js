'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const scope=require('./requestPermissionScope');
const actor=(...keys)=>({currentUser:{user_id:99},currentPermissions:new Set(keys)});
const req=(type,extra={})=>({requestedByUserId:7,requestType:type,isCatalogRequest:type.includes('catalog'),...extra});
test('the six unified request types have independent review authorities',()=>{
 assert.equal(scope.canApproveUnitRequest(actor('requests.review'),req('intentional_duplicate')),true);
 assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.model.review'),req('model_catalog_addition')),true);
 assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.model.review'),req('processor_catalog_addition')),false);
 assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.processor.review'),req('processor_catalog_addition')),true);
 assert.equal(scope.canApproveUnitRequest(actor('catalog_requests.processor.review'),req('model_catalog_addition')),false);
 assert.equal(scope.canApproveUnitRequest(actor('qc.reversion.perform'),req('qc_reversion',{isCatalogRequest:false})),true);
 assert.equal(scope.canApproveOverrideRequest(actor('units.override.review'),req('existing_unit_override',{isCatalogRequest:false})),true);
 assert.equal(scope.canApproveOverrideRequest(actor('units.outcome.approve'),req('outcome_confirmation',{isCatalogRequest:false})),true);
});
test('view-only Catalog permission does not approve either Catalog request type',()=>{
 const viewer=actor('catalog_requests.review');
 assert.equal(scope.canViewUnitRequest(viewer,req('model_catalog_addition')),true);
 assert.equal(scope.canViewUnitRequest(viewer,req('processor_catalog_addition')),true);
 assert.equal(scope.canApproveUnitRequest(viewer,req('model_catalog_addition')),false);
 assert.equal(scope.canApproveUnitRequest(viewer,req('processor_catalog_addition')),false);
});
test('legacy broad Catalog approval key is retired from runtime catalog and routes',()=>{
 const catalog=read('config/permissionCatalog.js'); const routes=read('routes/management.js');
 assert.doesNotMatch(catalog,/permission\('catalog_requests\.admin_review'/);
 assert.doesNotMatch(routes,/catalog_requests\.admin_review/);
 assert.match(catalog,/catalog_requests\.model\.review/);
 assert.match(catalog,/catalog_requests\.processor\.review/);
});
