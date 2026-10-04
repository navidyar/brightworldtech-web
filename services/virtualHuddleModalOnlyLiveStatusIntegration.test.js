'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('management Huddle detail remains modal-only after direct links and recipient actions',()=>{
 const controller=read('controllers/virtualHuddleController.js'); const page=read('views/pages/management-virtual-huddle.ejs'); const modal=read('views/fragments/virtual-huddle-detail-modal.ejs');
 assert.match(controller,/renderManagementDetail[\s\S]*openHuddle=/);
 assert.match(page,/openHuddleMessageId[\s\S]*hx-trigger="load"/);
 assert.match(page,/href="\/management\/virtual-huddle\?openHuddle=/);
 assert.match(controller,/addRecipients[\s\S]*isHtmxRequest\(req\)[\s\S]*renderManagementDetailModalContent/);
 assert.match(controller,/revokeRecipient[\s\S]*isHtmxRequest\(req\)[\s\S]*renderManagementDetailModalContent/);
 assert.match(modal,/data-huddle-management-detail-modal/);
});
test('open Huddle detail modal refreshes acknowledgment status inline without replacing the modal',()=>{
 const routes=read('routes/virtualHuddle.js'); const status=read('views/fragments/virtual-huddle-recipient-status.ejs'); const modal=read('views/fragments/virtual-huddle-detail-modal.ejs');
 assert.match(routes,/\/:messageId\/status/);
 assert.match(status,/hx-trigger="every 2s"/);
 assert.match(status,/hx-target="this"/);
 assert.match(status,/hx-swap="outerHTML"/);
 assert.match(modal,/include\('virtual-huddle-recipient-status'/);
});
