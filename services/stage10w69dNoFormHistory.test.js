const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('shared head loads the application-wide form history policy before page controls parse', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /<script src="\/js\/form-history-policy\.js\?v=20260820-stage10w69d-no-form-history"><\/script>/);
});

test('form history policy disables autocomplete on forms and user-entry controls', () => {
  const script = read('public/js/form-history-policy.js');
  assert.match(script, /root\.querySelectorAll\('form'\)\.forEach\(disableAutocomplete\)/);
  assert.match(script, /root\.querySelectorAll\(FIELD_SELECTOR\)\.forEach\(disableAutocomplete\)/);
  assert.match(script, /element\.setAttribute\('autocomplete', 'off'\)/);
});

test('form history policy covers dynamically inserted modal and HTMX fields', () => {
  const script = read('public/js/form-history-policy.js');
  assert.match(script, /new MutationObserver/);
  assert.match(script, /subtree: true/);
  assert.match(script, /htmx:afterSwap/);
});

test('login and password setup explicitly opt out of credential autocomplete', () => {
  const login = read('views/pages/login.ejs');
  const setupPassword = read('views/pages/setup-password.ejs');

  assert.match(login, /<form class="auth-form" method="post" action="\/login" autocomplete="off">/);
  assert.doesNotMatch(login, /autocomplete="username"|autocomplete="current-password"/);
  assert.match(login, /name="identifier"[\s\S]*?autocomplete="off"/);
  assert.match(login, /name="password"[\s\S]*?autocomplete="off"/);

  assert.doesNotMatch(setupPassword, /autocomplete="new-password"/);
  assert.equal((setupPassword.match(/autocomplete="off"/g) || []).length >= 3, true);
});

test('policy does not alter hidden/token or button/file controls', () => {
  const script = read('public/js/form-history-policy.js');
  assert.match(script, /:not\(\[type="hidden"\]\)/);
  assert.match(script, /:not\(\[type="submit"\]\)/);
  assert.match(script, /:not\(\[type="file"\]\)/);
});
