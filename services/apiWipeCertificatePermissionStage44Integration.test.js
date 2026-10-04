'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('Unit Tool mutations have endpoint permission guards and Commit selects create versus edit authority', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.post\('\/units\/commit',[^;]*requireApiAnyPermission\(\['units\.create', 'units\.edit'\]\)/);
  assert.match(routes, /router\.post\('\/units\/action',[^;]*requireApiAnyPermission\('units\.edit'\)/);
  assert.match(routes, /router\.put\('\/units\/:unitId\/wipe-certificates\/:certificateId',[^;]*requireApiAnyPermission\('units\.edit'\)/);
  const commit = read('services/apiUnitCommit.js');
  assert.match(commit, /intentionalDuplicate \|\| resolution\.status === 'NOT_FOUND' \? 'units\.create' : 'units\.edit'/);
  assert.match(commit, /assertCommitPermission\(permissions, commitPermission\)/);
  assert.match(read('services/apiUnitAction.js'), /permissions\.has\('units\.edit'\)/);
});
