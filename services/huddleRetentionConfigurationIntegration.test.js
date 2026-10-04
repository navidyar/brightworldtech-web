'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('Huddle retention is an application setting edited through Manage Configuration Values',()=>{
 const model=read('models/applicationSettingsModel.js'); const routes=read('routes/config.js'); const page=read('views/pages/management-config.ejs'); const fragment=read('views/fragments/huddle-retention-config.ejs');
 assert.match(model,/DEFAULT_HUDDLE_ARCHIVE_DAYS = 30/);
 assert.match(model,/MIN_HUDDLE_ARCHIVE_DAYS = 1/);
 assert.match(model,/MAX_HUDDLE_ARCHIVE_DAYS = 3650/);
 assert.match(routes,/management\/config\/huddle-retention'[\s\S]*configuration\.values\.manage[\s\S]*updateHuddleRetention/);
 assert.match(page,/huddle-retention-config/);
 assert.match(fragment,/name="huddleArchiveDays"[\s\S]*min="1" max="3650"/);
});
test('Huddle archive query uses configured days and still requires zero awaiting confirmations',()=>{
 const huddle=read('models/virtualHuddleModel.js');
 assert.match(huddle,/getApplicationSettings\(\)/);
 assert.match(huddle,/archiveAfterDays/);
 assert.match(huddle,/COALESCE\(rec\.awaiting_count, 0\) = 0/);
 assert.match(huddle,/INTERVAL \$\{archiveAfterDays\} DAY/);
});
