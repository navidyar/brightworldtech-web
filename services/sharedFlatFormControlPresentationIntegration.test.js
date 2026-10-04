'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('bare native text/select/textarea controls use the shared flat application skin', () => {
  const css = read('public/css/app.css');

  assert.match(css, /Whole-site native form-control surface/);
  assert.match(css, /body :is\([\s\S]*?input\[type="text"\][\s\S]*?textarea,[\s\S]*?select:not\(\[multiple\]\)[\s\S]*?\) \{[\s\S]*?border: 1px solid var\(--ui-control-border\);[\s\S]*?border-radius: var\(--ui-radius-compact\);[\s\S]*?background-color: #ffffff;[\s\S]*?box-shadow: none;/);
  assert.match(css, /body select:not\(\[multiple\]\):not\(\[hidden\]\) \{[\s\S]*?appearance: none;[\s\S]*?background-image: url\(/);
});

test('Configuration Browser dynamic labels and ranking interval rely on shared native control styling', () => {
  const dynamicFields = read('views/fragments/label-dynamic-fields-config-group.ejs');
  const ranking = read('views/fragments/operational-option-ranking-administration.ejs');

  assert.match(dynamicFields, /<input class="configuration-table-text-input" type="text" name="displayLabel"/);
  assert.match(ranking, /<select id="operational-ranking-refresh-minutes"/);
});

test('shared app CSS remains cache-busted as presentation contracts evolve', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /\/css\/app\.css\?v=[^\"'&\s>]+/);
});
