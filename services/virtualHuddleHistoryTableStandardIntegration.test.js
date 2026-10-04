'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('Management Huddle history has separate status and message-type tabs while preserving the Requests-style type filter',()=>{
  const page=read('views/pages/management-virtual-huddle.ejs');
  assert.match(page,/\['pending', 'Pending'\][\s\S]*\['acknowledged', 'Acknowledged'\][\s\S]*\['archived', 'Archived'\]/);
  assert.match(page,/\['all', 'All Types'\][\s\S]*\['standard', 'Standard'\][\s\S]*\['priority', 'Priority'\][\s\S]*\['urgent', 'Urgent'\]/);
  assert.match(page,/aria-label="Virtual Huddle type filters"/);
  assert.match(page,/name="messageType"/);
});

test('Management Huddle history uses the shared semantic data-table foundation with aligned Type column',()=>{
  const page=read('views/pages/management-virtual-huddle.ejs');
  const css=read('public/css/app.css');
  assert.match(page,/class="table-card site-data-table-card virtual-huddle-table-card"/);
  assert.match(page,/<table class="site-data-table virtual-huddle-table">/);
  assert.match(page,/<th scope="col"><a[\s\S]*?>Message[\s\S]*?<\/th>[\s\S]*<th scope="col"><a[\s\S]*?>Type[\s\S]*?<\/th>[\s\S]*<th scope="col"><a[\s\S]*?>Sent By[\s\S]*?<\/th>[\s\S]*<th scope="col"><a[\s\S]*?>Sent[\s\S]*?<\/th>/);
  assert.match(css,/\.site-data-table[\s\S]*table-layout: fixed/);
  assert.match(css,/\.virtual-huddle-table th:nth-child\(1\)[\s\S]*\.virtual-huddle-table td:nth-child\(1\)/);
});


test('Huddle rows use type-specific Message and Type text colors without row gradients',()=>{
  const page=read('views/pages/management-virtual-huddle.ejs');
  const css=read('public/css/app.css');
  assert.match(page,/virtual-huddle-row--<%= message\.message_type_code %>/);
  assert.match(css,/\.virtual-huddle-table \.site-data-table-primary-link \{[\s\S]*font-weight: 590/);
  for(const type of ['standard','priority','urgent']) {
    assert.match(css,new RegExp(`virtual-huddle-row--${type}[\\s\\S]*--huddle-message-color`));
  }
  assert.match(css,/--huddle-type-color/);
  assert.doesNotMatch(css,/--huddle-row-bg|--huddle-row-hover-bg/);
});


test('Virtual Huddle headers use server-side shared sort links that preserve queue filters',()=>{
  const page=read('views/pages/management-virtual-huddle.ejs');
  const model=read('models/virtualHuddleModel.js');
  assert.match(page,/sortHref\('message_asc', 'message_desc'\)/);
  assert.match(page,/sortHref\('type_asc', 'type_desc'\)/);
  assert.match(page,/sortHref\('sender_asc', 'sender_desc'\)/);
  assert.match(page,/sortHref\('sent_asc', 'sent_desc'\)/);
  assert.match(page,/class="<%= sortClass/);
  assert.match(model,/message_asc: 'm\.subject ASC/);
  assert.match(model,/ORDER BY \$\{orderBySql\}/);
});

test('My Huddles mirrors Virtual Huddle organization while remaining personal-recipient scoped',()=>{
  const page=read('views/pages/my-huddles.ejs');
  const model=read('models/virtualHuddleModel.js');
  assert.match(page,/\['pending', 'Pending'\][\s\S]*\['acknowledged', 'Acknowledged'\][\s\S]*\['archived', 'Archived'\]/);
  assert.match(page,/aria-label="My Huddles type filters"/);
  assert.match(page,/id="my-huddles-search"/);
  assert.match(page,/class="site-data-table virtual-huddle-table my-huddles-table"/);
  assert.match(page,/sortHref\('acknowledged_asc', 'acknowledged_desc'\)/);
  const personalStart=model.indexOf('async function listPersonalHistory');
  const personalEnd=model.indexOf('async function listAcknowledgedHistory', personalStart);
  const personal=model.slice(personalStart, personalEnd);
  assert.match(personal,/r\.user_id = \?/);
  assert.match(personal,/params = \[safeUserId\]/);
  assert.match(personal,/recipient_state_code = 'acknowledged'/);
  assert.match(personal,/acknowledgment_mode_code = 'required_ack'/);
  assert.match(personal,/acknowledgment_mode_code = 'optional_ack'/);
});
