'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
test('Application Time Zone and Huddle Retention live inside the Configuration Browser Application Settings group',()=>{
 const page=read('views/pages/management-config.ejs');
 const timezoneInclude=page.indexOf("include('../fragments/application-time-zone-config'");
 const huddleInclude=page.indexOf("include('../fragments/huddle-retention-config'");
 const browser=page.indexOf('data-configuration-browser');
 const groups=page.indexOf('data-configuration-groups');
 assert.ok(browser>0 && groups>browser && timezoneInclude>groups && huddleInclude>groups);
 assert.match(page,/Application Settings/);
 assert.doesNotMatch(page.slice(0,browser),/application-time-zone-config|huddle-retention-config/);
});
test('both application settings use the standard searchable collapsible category pattern',()=>{
 const timezone=read('views/fragments/application-time-zone-config.ejs');
 const huddle=read('views/fragments/huddle-retention-config.ejs');
 for(const source of [timezone,huddle]){
   assert.match(source,/class="configuration-category"/);
   assert.match(source,/data-configuration-category/);
   assert.match(source,/data-search-text=/);
   assert.match(source,/configuration-category-summary/);
   assert.match(source,/configuration-category-body/);
   assert.match(source,/data-configuration-value-row/);
 }
 assert.match(huddle,/virtual huddle retention archive/);
 assert.match(timezone,/application time zone timezone/);
});
test('Configuration Browser search copy covers settings as well as category-backed values',()=>{
 const page=read('views/pages/management-config.ejs');
 assert.match(page,/Search all configuration settings, categories, labels, stored values, or descriptions/);
 assert.match(page,/placeholder="Setting, category, label, value, or description"/);
 assert.match(page,/No configuration settings or values match that search/);
 assert.match(page,/config-values\.js\?v=20261002-application-settings-search/);
});
