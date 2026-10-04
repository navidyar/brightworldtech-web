'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('User Account History describes the effective timezone instead of hardcoding Dallas', () => {
  const page = read('views/pages/management-user-history.ejs');
  const modal = read('views/fragments/management-user-history-modal.ejs');
  const content = read('views/fragments/management-user-history-content.ejs');

  for (const source of [page, modal]) {
    assert.doesNotMatch(source, /Dallas local time/i);
    assert.match(source, /effective application time zone/i);
  }

  assert.match(content, /formatDateTime\(event\.created_at\)/);
});
