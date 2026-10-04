'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('both Huddle queues make the full record keyboard-clickable while preserving interactive controls',()=>{
  const management=read('views/pages/management-virtual-huddle.ejs');
  const personal=read('views/pages/my-huddles.ejs');
  const js=read('public/js/virtual-huddle-management.js');
  for(const view of [management,personal]){
    assert.match(view,/data-huddle-row-open/);
    assert.match(view,/tabindex="0" role="link"/);
    assert.match(view,/data-huddle-row-primary/);
  }
  assert.match(js,/function activateHuddleRow/);
  assert.match(js,/isInteractiveRowTarget/);
  assert.match(js,/\['Enter', ' '\]\.includes\(event\.key\)/);
});

test('My Huddles uses its signed-in-recipient modal route instead of navigating records to detail pages',()=>{
  const routes=read('routes/virtualHuddle.js');
  const controller=read('controllers/virtualHuddleController.js');
  const model=read('models/virtualHuddleModel.js');
  const page=read('views/pages/my-huddles.ejs');
  const modal=read('views/fragments/virtual-huddle-personal-detail-modal.ejs');
  assert.match(routes,/router\.get\('\/my-huddles\/:recipientId\/modal'[\s\S]*renderPersonalDetailModal/);
  assert.match(page,/href="\/my-huddles\?openHuddle=/);
  assert.match(page,/hx-get="\/my-huddles\/<%= item\.virtual_huddle_recipient_id %>\/modal"/);
  assert.match(page,/id="modal-root"[\s\S]*hx-get="\/my-huddles\/<%= openHuddleRecipientId %>\/modal"/);
  const start=model.indexOf('async function getPersonalRecipientDetail');
  const end=model.indexOf('async function getAcknowledgedRecipientDetail',start);
  assert.match(model.slice(start,end),/r\.virtual_huddle_recipient_id = \?[\s\S]*r\.user_id = \?/);
  assert.match(controller,/openHuddleRecipientId: normalizeId\(req\.query\.openHuddle\)/);
  assert.match(modal,/data-huddle-personal-detail-modal/);
});

test('personal Huddle modal supports pending acknowledgment and keeps HTMX success/error inside the modal flow',()=>{
  const controller=read('controllers/virtualHuddleController.js');
  const modal=read('views/fragments/virtual-huddle-personal-detail-modal.ejs');
  assert.match(modal,/hx-post="\/virtual-huddle\/recipients\/<%= recipient\.virtual_huddle_recipient_id %>\/acknowledge"/);
  assert.match(modal,/recipient\.recipient_state_code === 'acknowledged'/);
  assert.match(modal,/recipient\.recipient_state_code === 'awaiting_confirmation'/);
  assert.match(controller,/HX-Trigger'[\s\S]*huddlePersonalAcknowledged/);
  assert.match(controller,/isHtmxRequest\(req\) && hasPermission\(req, 'huddle\.personal\.view'\)[\s\S]*virtual-huddle-personal-detail-modal/);
});


test('My Huddles relies on whole-row opening and has no redundant action column or Open Record button',()=>{
  const page=read('views/pages/my-huddles.ejs');
  const css=read('public/css/app.css');
  assert.doesNotMatch(page,/Open Record/);
  assert.doesNotMatch(page,/>Open<\/a>/);
  assert.doesNotMatch(page,/visually-hidden">Action/);
  assert.match(page,/colspan="5" class="site-data-table-empty"/);
  assert.doesNotMatch(css,/my-huddles-table th:nth-child\(6\)/);
  assert.match(page,/data-huddle-row-open/);
  assert.match(page,/data-huddle-row-primary/);
});
