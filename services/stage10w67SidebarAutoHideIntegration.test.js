const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('desktop sidebar defaults to overlay auto-hide while pinning restores the embedded shell', () => {
  const css = read('public/css/style.css');

  assert.match(css, /\.app-shell\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.sidebar\s*\{[\s\S]*?position:\s*fixed[\s\S]*?translateX\(calc\(-100% \+ var\(--sidebar-edge-trigger\)\)\)/);
  assert.match(css, /html:not\(\[data-sidebar-pinned="true"\]\) \.sidebar:is\(:hover, :focus-within, \.is-desktop-open\)/);
  assert.match(css, /html\[data-sidebar-pinned="true"\] \.app-shell\s*\{[\s\S]*?var\(--sidebar-width\) minmax\(0, 1fr\)/);
  assert.match(css, /html\[data-sidebar-pinned="true"\] \.sidebar\s*\{[\s\S]*?position:\s*sticky/);
});

test('sidebar pin preference uses localStorage and remains keyboard accessible', () => {
  const head = read('views/partials/head.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  const js = read('public/js/sidebar.js');

  assert.match(head, /bwtdallas-sidebar-pinned/);
  assert.match(sidebar, /data-sidebar-pin/);
  assert.match(sidebar, /aria-pressed="false"/);
  assert.match(js, /storageKey = 'bwtdallas-sidebar-pinned'/);
  assert.match(js, /sidebar\.addEventListener\('focusin'/);
  assert.match(js, /sidebar\.addEventListener\('focusout'/);
  assert.match(js, /pinButton\.setAttribute\('aria-pressed'/);
  assert.match(js, /localStorage\.setItem\(storageKey, pinned \? 'true' : 'false'\)/);
});

test('mobile drawer behavior remains independent of desktop pinning', () => {
  const css = read('public/css/style.css');
  const js = read('public/js/sidebar.js');

  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.sidebar\.is-mobile-open\s*\{[\s\S]*?translateX\(0\)/);
  assert.match(js, /const mobileQuery = window\.matchMedia\('\(max-width: 980px\)'\)/);
  assert.match(js, /sidebar\.classList\.toggle\('is-mobile-open', shouldOpen\)/);
  assert.match(js, /if \(event\.key === 'Escape' && mobileQuery\.matches\)/);
});
