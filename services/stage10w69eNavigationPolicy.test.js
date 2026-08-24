const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('authenticated navigation policy sends strict no-store headers', () => {
  const source = read('middleware/navigationPolicyMiddleware.js');
  assert.match(source, /if \(!req\.currentUser\)/);
  assert.match(source, /private, no-store, no-cache, must-revalidate, max-age=0/);
  assert.match(source, /Pragma: 'no-cache'/);
  assert.match(source, /'Surrogate-Control': 'no-store'/);

  const server = read('server.js');
  assert.match(server, /app\.use\(loadCurrentUser\);\s*app\.use\(applyAuthenticatedNavigationPolicy\);/);
});

test('navigation policy script loads only for authenticated pages', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /isAuthenticated[^\n]+isAuthenticated/);
  assert.match(head, /navigation-policy\.js\?v=[^"]+/);
});

test('same-origin normal links and GET forms use replace navigation without hijacking HTMX or downloads', () => {
  const source = read('public/js/navigation-policy.js');
  assert.match(source, /window\.location\.replace\(url\.href\)/);
  assert.match(source, /window\.location\.replace\(action\.href\)/);
  assert.match(source, /anchor\.hasAttribute\('download'\)/);
  assert.match(source, /hasHtmxNavigation\(anchor\)/);
  assert.match(source, /method !== 'get'/);
  assert.match(source, /hasHtmxNavigation\(form\)/);
});

test('ordinary back-forward attempts are guarded and bfcache restores reload', () => {
  const source = read('public/js/navigation-policy.js');
  assert.match(source, /history\.replaceState/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /addEventListener\('popstate', restoreHistoryGuard\)/);
  assert.match(source, /event\.persisted/);
  assert.match(source, /window\.location\.reload\(\)/);
});
