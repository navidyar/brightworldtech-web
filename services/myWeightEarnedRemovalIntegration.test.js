'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('My Weight Earned feature is removed from Unit Browser and server endpoints',()=>{
  const table=read('views/fragments/tech-units-table.ejs');
  const routes=read('routes/management.js');
  const controller=read('controllers/techController.js');
  const model=read('models/techUnitModel.js');
  const js=read('public/js/tech-units.js');
  for(const source of [table,routes,controller,model,js]) assert.doesNotMatch(source,/My Weight Earned|my-weight-earned|renderMyUnitWeightPanel|getUnitWorkCompletionsForUser|my-weight/);
  assert.equal(fs.existsSync(path.join(ROOT,'views/fragments/tech-unit-my-weight-panel.ejs')),false);
});

test('Unit History still carries per-user Production Credit and permission-based weight redaction',()=>{
  const history=read('services/unitHistoryTimeline.js');
  const controller=read('controllers/techController.js');
  const model=read('models/techUnitModel.js');
  assert.match(history,/actor: row\.completedByName[\s\S]*legacyChange\('Production Credit', row\.formattedProductionWeight/);
  assert.match(controller,/function userCanViewProductionWeight[\s\S]*units\.production_weight\.view/);
  assert.match(controller,/redactProductionWeightFromTimeline/);
  assert.match(model,/getUnitOperationalHistory[\s\S]*production_weight_value/);
});
