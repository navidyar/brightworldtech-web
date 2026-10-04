'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('Tool UUID duplicate request API reuses existing request permissions',()=>{
  const routes=read('routes/api.js');
  assert.match(routes,/post\('\/units\/intentional-duplicate-requests'[\s\S]*?requireApiAnyPermission\('units\.create'\)[\s\S]*?requireApiAnyPermission\('requests\.submit'\)/);
  assert.match(routes,/get\('\/units\/intentional-duplicate-requests\/:requestId'[\s\S]*?requireApiAnyPermission\('requests\.submit'\)/);
  assert.doesNotMatch(read('config/permissionCatalog.js'),/uuid.*duplicate.*permission/i);
});

test('UUID collision request is an Intentional Duplicate request reviewed in the existing Requests workflow',()=>{
  const service=read('services/apiUuidDuplicateRequest.js');
  const model=read('models/unitRequestModel.js');
  assert.match(service,/createIntentionalDuplicateRequest/);
  assert.match(service,/TOOL_UUID_DUPLICATE_AUTHORIZATION_MODE/);
  assert.match(model,/tool_uuid_duplicate_authorization_v1/);
  assert.match(model,/A requester cannot approve their own Unit Request/);
  assert.match(model,/authorizationOnly: true/);
});

test('approved Tool UUID exception authorizes one Commit and is consumed atomically',()=>{
  const intake=read('services/apiUnitIntake.js');
  const commit=read('services/apiUnitCommit.js');
  const model=read('models/unitRequestModel.js');
  assert.match(intake,/getToolUuidDuplicateAuthorization/);
  assert.match(intake,/approved_uuid_duplicate_request/);
  assert.match(commit,/consumeToolUuidDuplicateAuthorization/);
  assert.match(model,/created_unit_id IS NULL/);
  assert.match(model,/already used/);
});

test('Requests review explicitly shows the System UUID collision and Tool authorization semantics',()=>{
  const detail=read('views/pages/unit-request-detail.ejs');
  const modal=read('views/fragments/tech-unit-intentional-duplicate-request-modal.ejs');
  assert.match(detail,/System UUID Collision/);
  assert.match(detail,/Approve UUID Duplicate Authorization/);
  assert.match(detail,/exactly one Tool Commit/);
  assert.match(modal,/Exact System UUID collision/);
  assert.match(modal,/System UUID/);
});

test('approved Intentional Duplicate persistence validates System UUID as well as serial identifiers',()=>{
  const model=read('models/techUnitModel.js');
  assert.match(model,/\['unit_serial_number', 'bios_serial_number', 'system_uuid'\]/);
  assert.match(model,/including System UUID when supplied/);
});
