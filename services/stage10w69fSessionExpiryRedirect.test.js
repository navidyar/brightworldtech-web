const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('authenticated navigation middleware exposes the rolling session expiry timestamp', () => {
  const source = read('middleware/navigationPolicyMiddleware.js');

  assert.match(source, /cookie\?\.originalMaxAge/);
  assert.match(source, /Date\.now\(\) \+ originalMaxAge/);
  assert.match(source, /X-BWTDallas-Session-Expires-At/);
  assert.match(source, /res\.locals\.sessionExpiresAt = sessionExpiresAt/);
});

test('authenticated pages provide the expiry timestamp to the navigation policy', () => {
  const head = read('views/partials/head.ejs');

  assert.match(head, /data-session-expires-at/);
  assert.match(head, /navigation-policy\.js\?v=/);
});

test('navigation policy actively ends an expired session and replaces the page with login', () => {
  const source = read('public/js/navigation-policy.js');

  assert.match(source, /function endExpiredSession\(\)/);
  assert.match(source, /nativeFetch\('\/logout'/);
  assert.match(source, /window\.location\.replace\(SESSION_ENDED_URL\)/);
  assert.match(source, /function scheduleSessionExpiry\(value\)/);
  assert.match(source, /window\.setTimeout\(endExpiredSession, delay\)/);
});

test('rolling fetch and HTMX activity reschedules session expiry and login redirects are promoted to the full page', () => {
  const source = read('public/js/navigation-policy.js');

  assert.match(source, /window\.fetch = async/);
  assert.match(source, /response\.headers\?\.get/);
  assert.match(source, /htmx:beforeSwap/);
  assert.match(source, /event\.detail\.shouldSwap = false/);
  assert.match(source, /htmx:afterRequest/);
  assert.match(source, /xhr\.getResponseHeader/);
  assert.match(source, /xhr\.responseURL/);
});

test('login page explains a session-expiry redirect', () => {
  const source = read('controllers/authController.js');

  assert.match(source, /req\.query\.session === 'expired'/);
  assert.match(source, /Your session has ended\. Please sign in again\./);
});
