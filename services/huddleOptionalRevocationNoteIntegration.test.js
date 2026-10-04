'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('Huddle revocation note is optional for one or all awaiting recipients',()=>{
 const model=read('models/virtualHuddleModel.js'); const modal=read('views/fragments/virtual-huddle-revoke-modal.ejs');
 assert.doesNotMatch(model,/A revocation reason is required/);
 assert.match(model,/safeReason \|\| null/);
 assert.match(modal,/Revocation Note <small>\(optional\)<\/small>/);
 assert.doesNotMatch(modal,/textarea[^>]*name="reason"[^>]*required/);
});
