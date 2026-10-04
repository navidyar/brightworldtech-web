const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('desktop sidebar defaults to overlay auto-hide while pinning restores the embedded shell', () => {
  const css = read('public/css/app.css');

  assert.match(css, /\.app-shell\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?translateX\(calc\(-100% \+ var\(--sidebar-edge-trigger\)\)\)/);
  assert.match(css, /html:not\(\[data-sidebar-pinned="true"\]\) \.sidebar\.is-desktop-open/);
  assert.match(css, /html\[data-sidebar-pinned="true"\] \.app-shell\s*\{[\s\S]*?var\(--sidebar-width\) minmax\(0, 1fr\)/);
  assert.match(css, /html\[data-sidebar-pinned="true"\] \.sidebar\s*\{[\s\S]*?position:\s*sticky/);
});

test('sidebar pin preference uses localStorage and remains keyboard accessible', () => {
  const head = read('views/partials/head.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  const js = read('public/js/sidebar.js');

  assert.match(head, /bwtdallas-sidebar-pinned/);
  assert.doesNotMatch(sidebar, /data-sidebar-pin/);
  assert.match(sidebar, /data-sidebar-edge-handle/);
  assert.doesNotMatch(read('views/partials/topbar.ejs'), /data-sidebar-toggle/);
  assert.match(js, /setPinned\(true\)/);
  assert.match(js, /setPinned\(false\)/);
  assert.match(sidebar, /data-sidebar-edge-label/);
  assert.match(sidebar, /aria-label="Open navigation"/);
  assert.match(js, /storageKey = 'bwtdallas-sidebar-pinned'/);
  assert.match(js, /edgeHandle\.addEventListener\('mouseenter'[\s\S]*?setDesktopOpen\(true\)/);
  assert.doesNotMatch(js, /sidebar\.addEventListener\('focusin'/);
  assert.match(js, /sidebar\.inert = !sidebarVisible/);
  assert.match(js, /edgeHandle\.setAttribute\('aria-label'/);
  assert.match(js, /localStorage\.setItem\(storageKey, pinned \? 'true' : 'false'\)/);
});

test('mobile drawer behavior remains independent of desktop pinning', () => {
  const css = read('public/css/app.css');
  const js = read('public/js/sidebar.js');

  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.sidebar\.is-mobile-open\s*\{[\s\S]*?translateX\(0\)/);
  assert.match(js, /const mobileQuery = window\.matchMedia\('\(max-width: 980px\)'\)/);
  assert.match(js, /sidebar\.classList\.toggle\('is-mobile-open', shouldOpen\)/);
  assert.match(js, /if \(event\.key === 'Escape' && mobileQuery\.matches\)/);
});

test('phone viewport uses the red top hamburger instead of the draggable vertical Menu tab', () => {
  const css = read('public/css/app.css');
  const js = read('public/js/sidebar.js');
  const head = read('views/partials/head.ejs');

  assert.match(css, /\/\* Phone navigation: replace the vertical edge tab with a fixed top hamburger\. \*\/[\s\S]*?@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.sidebar-edge-handle\s*\{[\s\S]*?top:\s*12px[\s\S]*?width:\s*42px[\s\S]*?height:\s*42px[\s\S]*?background:\s*var\(--red\)/);
  assert.match(css, /\.sidebar-edge-handle-grip i\s*\{[\s\S]*?width:\s*18px[\s\S]*?height:\s*2px/);
  assert.match(css, /body\.sidebar-mobile-open \.sidebar-edge-handle-grip i:nth-child\(1\)[\s\S]*?rotate\(45deg\)/);
  assert.match(css, /\.sidebar\.is-mobile-open \+ \.sidebar-edge-handle\s*\{[\s\S]*?left:\s*calc\(min\(300px, calc\(100vw - 48px\)\) - 54px\)/);
  assert.match(css, /\.topbar\s*\{[\s\S]*?padding-left:\s*64px/);
  assert.match(js, /const phoneQuery = window\.matchMedia\('\(max-width: 720px\)'\)/);
  assert.match(js, /if \(phoneQuery\.matches\) return;[\s\S]*?draggingHandle = true/);
  assert.match(js, /edgeHandle\.setAttribute\('aria-expanded', String\(mobileOpen\)\)/);
  assert.match(head, /app\.css\?v=20261002-phone-hamburger-r6/);
  assert.match(head, /sidebar\.js\?v=20261002-phone-hamburger-r6/);
});
