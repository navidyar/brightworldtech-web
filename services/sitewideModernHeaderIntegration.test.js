'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'views/pages');

function pageFiles() {
  return fs.readdirSync(PAGES).filter((name) => name.endsWith('.ejs')).sort();
}

test('application pages no longer use the legacy dashboard hero or hero badge header system', () => {
  for (const file of pageFiles()) {
    const source = fs.readFileSync(path.join(PAGES, file), 'utf8');
    assert.doesNotMatch(source, /dashboard-hero|hero-badge/, `${file} still uses the legacy hero header`);
  }
});

test('authenticated work pages use the modern page-heading contract', () => {
  const intentionalStandalonePages = new Set([
    'error.ejs',
    'login.ejs',
    'not-found.ejs',
    'setup-password.ejs',
    'virtual-huddle-required.ejs'
  ]);

  for (const file of pageFiles()) {
    if (intentionalStandalonePages.has(file)) continue;
    const source = fs.readFileSync(path.join(PAGES, file), 'utf8');
    if (!source.includes('<main')) continue;
    assert.match(source, /class="[^"]*page-heading/, `${file} is missing the modern page heading`);
  }
});

test('Users and Login Activity use modern heading plus summary/context presentation', () => {
  const users = fs.readFileSync(path.join(PAGES, 'management-users.ejs'), 'utf8');
  const loginActivity = fs.readFileSync(path.join(PAGES, 'management-login-activity.ejs'), 'utf8');

  assert.match(users, /page-heading[\s\S]*management-users-summary-panel/);
  assert.match(users, /site-summary-panel site-summary-panel--expanded/);
  assert.match(loginActivity, /page-heading[\s\S]*management-login-summary-panel/);
  assert.match(loginActivity, /site-summary-panel site-summary-panel--expanded/);
  assert.doesNotMatch(loginActivity, /Step 7d/);
});
