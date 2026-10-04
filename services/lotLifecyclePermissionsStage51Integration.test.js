'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
function routeBlock(source, method, route) {
  const i=source.indexOf(`'${route}'`); const start=source.lastIndexOf(`router.${method}(`,i); const end=source.indexOf(');',i)+2; return source.slice(start,end);
}
test('Lot visibility, close/reopen, and delete routes use their granular permissions', () => {
  const routes=read('routes/lots.js');
  const checks=[
    ['get','/management/lots/:lotId/hide/modal','lots.visibility.manage'],['post','/management/lots/:lotId/hide','lots.visibility.manage'],
    ['get','/management/lots/:lotId/unhide/modal','lots.visibility.manage'],['post','/management/lots/:lotId/unhide','lots.visibility.manage'],
    ['get','/management/lots/:lotId/close/modal','lots.close'],['post','/management/lots/:lotId/close','lots.close'],
    ['get','/management/lots/:lotId/reopen/modal','lots.reopen'],['post','/management/lots/:lotId/reopen','lots.reopen'],
    ['get','/management/lots/:lotId/delete/modal','lots.delete'],['post','/management/lots/:lotId/delete','lots.delete']
  ];
  for(const [method,route,key] of checks){const b=routeBlock(routes,method,route);assert.ok(b.includes("requirePermission('lots.view')"),route);assert.ok(b.includes(`requirePermission('${key}')`),route);}
  for(const file of ['views/pages/management-lots.ejs','views/pages/management-lot-detail.ejs']){
    const view=read(file);for(const key of ['lots.visibility.manage','lots.close','lots.reopen','lots.delete']) assert.ok(view.includes(`hasPermission('${key}')`),`${file}: ${key}`);
  }
});
