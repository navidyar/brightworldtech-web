'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('return-to-active assignment includes active Admin, Management, Tech Lead, and Tech users', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /const RETURN_TO_ACTIVE_ASSIGNEE_ROLE_CODES = Object\.freeze\(\[\s*'admin',\s*'management',\s*'tech_lead',\s*'tech'\s*\]\);/);
  assert.match(model, /async function listActiveReturnToActiveAssignees\(\)/);
  assert.match(model, /const rolePlaceholders = RETURN_TO_ACTIVE_ASSIGNEE_ROLE_CODES\.map\(\(\) => '\?'\)\.join\(', '\);/);
  assert.match(model, /WHERE r\.code IN \(\$\{rolePlaceholders\}\)/);
  assert.match(model, /RETURN_TO_ACTIVE_ASSIGNEE_ROLE_CODES\s*\);/);
  assert.match(model, /COALESCE\(u\.is_active, 1\) = 1/);
});

test('the displayed options and submitted assignee validation share the same eligible-user source', () => {
  const model = read('models/techUnitModel.js');

  assert.match(model, /const \[\{ assignableLots \}, assignees\] = await Promise\.all\(\[\s*getLotMap\(\),\s*listActiveReturnToActiveAssignees\(\)\s*\]\);/);
  assert.match(model, /return \{\s*lots: assignableLots,\s*assignees\s*\};/);
  assert.match(model, /const assignees = await listActiveReturnToActiveAssignees\(\);/);
  assert.match(model, /const isEligible = assignees\.some\(\(assignee\) => assignee\.id === normalizedAssignedToUserId\);/);
  assert.match(model, /Choose an active Admin, Management, Tech Lead, or Tech user, or leave the assignment unassigned\./);
  assert.doesNotMatch(model, /listActiveAssignableTechnicians/);
});

test('the Return Unit to Active modal presents the broader assignment list as users', () => {
  const modal = read('views/fragments/tech-unit-park-modal.ejs');
  const controller = read('controllers/techController.js');

  assert.match(modal, /const assignees = Array\.isArray\(safeOptions\.assignees\) \? safeOptions\.assignees : \[\];/);
  assert.match(modal, /<span>Assign to User <small>\(optional\)<\/small><\/span>/);
  assert.match(modal, /assignees\.forEach\(\(assignee\) =>/);
  assert.match(modal, /value="<%= assignee\.id %>"/);
  assert.match(controller, /let formOptions = \{ lots: \[\], assignees: \[\] \};/);
  assert.match(
    controller,
    /formOptions: \{\s*lots: Array\.isArray\(formOptions\.lots\) \? formOptions\.lots : \[\],\s*assignees: Array\.isArray\(formOptions\.assignees\) \? formOptions\.assignees : \[\]\s*\}/
  );
  assert.doesNotMatch(controller, /technicians: Array\.isArray\(formOptions\.technicians\)/);
  assert.doesNotMatch(modal, /Assign to Tech <small>/);
});

test('the focused and live validation commands cover return-to-active assignee roles', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['validate:return-active-assignee-roles'],
    'node --test services/stage10w14ReturnActiveAssigneeRolesIntegration.test.js services/stage10w4ParkedSearchTakeoverQcIntegration.test.js && node --check models/techUnitModel.js && node --check controllers/techController.js && node --check scripts/validateStage10w14ReturnActiveAssigneeRolesLivePath.js'
  );
  assert.equal(
    packageJson.scripts['validate:return-active-assignee-roles-live-path'],
    'npm run validate:return-active-assignee-roles && node scripts/validateStage10w14ReturnActiveAssigneeRolesLivePath.js'
  );
});
