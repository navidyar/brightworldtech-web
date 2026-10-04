'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('own Tool PIN has its own assignable permission and still requires Tool API access',()=>{
 const catalog=read('config/permissionCatalog.js'); const routes=read('routes/auth.js'); const topbar=read('views/partials/topbar.ejs');
 assert.match(catalog,/users\.tool_pin\.self_manage[\s\S]*Manage Own Tool PIN/);
 assert.match(routes,/account\/tool-pin\/modal'[\s\S]*users\.tool_pin\.self_manage[\s\S]*tools\.unit_api\.use/);
 assert.match(routes,/account\/tool-pin'[\s\S]*users\.tool_pin\.self_manage[\s\S]*tools\.unit_api\.use/);
 assert.match(topbar,/hasPermission\('users\.tool_pin\.self_manage'\)[\s\S]*hasPermission\('tools\.unit_api\.use'\)/);
});
