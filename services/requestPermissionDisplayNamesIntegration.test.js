'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('request decision permissions use Approve terminology while view-only Catalog access stays View',()=>{
 const catalog=read('config/permissionCatalog.js');
 for(const name of [
  'Approve Intentional Duplicate Requests',
  'Approve Model Catalog Requests',
  'Approve Processor Catalog Requests',
  'Approve QC Reversion Requests',
  'Approve Unit Override Requests',
  'Approve Outcome Confirmation Requests'
 ]) assert.match(catalog,new RegExp(name));
 assert.match(catalog,/View Catalog Requests/);
 assert.doesNotMatch(catalog,/Review Intentional Duplicate Requests|Review Model Catalog Requests|Review Processor Catalog Requests|Review Unit Overrides|Perform QC Reversion|View Catalog Requests for Review/);
});
