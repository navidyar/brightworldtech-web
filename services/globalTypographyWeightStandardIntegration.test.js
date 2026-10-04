'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('normal application emphasis uses the shared 650 strong-weight token',()=>{
  const theme=read('public/css/theme.css');
  const css=read('public/css/app.css');
  assert.match(theme,/--ui-font-weight-strong:\s*650;/);
  assert.match(css,/body :is\(\.content-shell, \.modal-panel\) :is\(strong, b\),[\s\S]*?font-weight:\s*var\(--ui-font-weight-strong\)/);
  assert.match(css,/\.content-shell \.page-heading h1[\s\S]*?font-weight:\s*var\(--ui-font-weight-strong\)/);
});

test('printer record names use the lighter global emphasis standard rather than 750 bold',()=>{
  const css=read('public/css/app.css');
  const match=css.match(/\.label-printer-registry-name\s*\{([\s\S]*?)\}/);
  assert.ok(match);
  assert.match(match[1],/font-weight:\s*var\(--ui-font-weight-strong\)/);
  assert.doesNotMatch(match[1],/font-weight:\s*(?:7\d\d|8\d\d|9\d\d)/);
});

test('shared CSS validator protects the global emphasis contract',()=>{
  const validator=read('services/sharedCssFoundationValidator.js');
  assert.match(validator,/function validateTypographyWeightContract/);
  assert.match(validator,/shared strong\/emphasis font weight must remain 650/);
  assert.match(validator,/Printer record names must not use the retired heavy bold weight/);
});
