'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('Model Request exact match is preselected while the blue inactive warning is preserved',()=>{
 const controller=read('controllers/unitRequestController.js');
 const page=read('views/pages/unit-request-detail.ejs');
 assert.match(controller,/recommendedModelCatalogMatch = inactiveModelCatalogMatch[\s\S]*modelCatalogMatches\.find\(\(model\) => model\.identityMatch\)/);
 assert.match(page,/Inactive catalog record found:/);
 assert.match(page,/already selected as the recommended Catalog Model/);
 assert.match(page,/name="approvedExistingUnitModelId"[\s\S]*value="<%= recommendedModelCatalogMatch\?\.id \|\| '' %>"/);
 assert.match(page,/Recommended Catalog Model/);
});

test('Model Request shows likely matches as direct choices and replaces the full select with search fallback',()=>{
 const page=read('views/pages/unit-request-detail.ejs');
 assert.match(page,/Other likely Catalog Models|Likely Catalog Models/);
 assert.match(page,/data-use-existing-model-id/);
 assert.match(page,/>Use This Model<\/button>/);
 assert.match(page,/Search for a different Catalog Model/);
 assert.match(page,/type="search"[\s\S]*data-existing-model-search/);
 assert.match(page,/datalist id="model-catalog-options"/);
 assert.doesNotMatch(page,/<select name="approvedExistingUnitModelId">/);
});

test('Model Request client supports recommended, search override, and explicit create-new mode',()=>{
 const js=read('public/js/model-request-review.js');
 const page=read('views/pages/unit-request-detail.ejs');
 const queue=read('views/pages/unit-requests.ejs');
 assert.match(page,/data-model-request-approval-form/);
 assert.match(js,/data-model-request-approval-form/);
 assert.match(js,/data-use-existing-model-id/);
 assert.match(js,/data-create-new-model-instead/);
 assert.match(js,/existingId\.value = ''/);
 assert.match(js,/newFields\.forEach[\s\S]*field\.disabled = reusingExisting/);
 assert.match(js,/unit-request:modal-loaded/);
 assert.match(page,/model-request-review\.js\?v=20261002-category-correction/);
 assert.match(queue,/model-request-review\.js\?v=20261002-category-correction/);
});
