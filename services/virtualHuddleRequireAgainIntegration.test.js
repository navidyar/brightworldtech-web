'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('Require Again has dedicated permission and only restores revoked required recipients',()=>{
 const catalog=read('config/permissionCatalog.js'); const routes=read('routes/virtualHuddle.js'); const model=read('models/virtualHuddleModel.js'); const status=read('views/fragments/virtual-huddle-recipient-status.ejs');
 assert.match(catalog,/huddle\.recipients\.require[\s\S]*Require Huddle Acknowledgment Again/);
 assert.match(routes,/require-again'[\s\S]*requirePermission\('huddle\.recipients\.require'\)/);
 assert.match(model,/recipient\.acknowledgment_mode_code !== 'required_ack' \|\| recipient\.recipient_state_code !== 'revoked'/);
 assert.match(model,/SET recipient_state_code = 'awaiting_confirmation'/);
 assert.match(model,/revoked_by_user_id = NULL[\s\S]*revoked_at = NULL[\s\S]*revocation_reason = NULL/);
 assert.match(model,/module\.exports = \{[\s\S]*requireRecipientAgain/);
 assert.match(status,/>Require Again<\/button>/);
});
test('management Huddle queue has exactly Pending, Acknowledged, Archived states and archives from resolution time',()=>{
 const model=read('models/virtualHuddleModel.js'); const page=read('views/pages/management-virtual-huddle.ejs');
 assert.match(model,/new Set\(\['pending', 'acknowledged', 'archived'\]\)/);
 assert.doesNotMatch(page,/\['revoked', 'Revoked'\]|\['active', 'All Active'\]/);
 assert.match(model,/COALESCE\(rec\.awaiting_count, 0\) = 0 AND COALESCE\(rec\.required_resolved_at, m\.sent_at\)/);
 assert.match(model,/MAX\(CASE[\s\S]*recipient_state_code = 'acknowledged'[\s\S]*acknowledged_at[\s\S]*recipient_state_code = 'revoked'[\s\S]*revoked_at/);
 assert.doesNotMatch(model,/filters\.push\('COALESCE\(rec\.acknowledged_count, 0\) > 0'\)/);
});
