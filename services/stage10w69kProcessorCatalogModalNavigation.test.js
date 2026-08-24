'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('navigation history policy leaves Processor Catalog modal links to the catalog modal handler', () => {
  const navigationPolicy = read('public/js/navigation-policy.js');
  const catalogPage = read('views/pages/management-processors.ejs');
  const familyPage = read('views/pages/processor-families.ejs');
  const catalogActions = read('public/js/processor-catalog-actions.js');

  assert.match(navigationPolicy, /data-processor-catalog-modal-url/);
  assert.match(navigationPolicy, /hasHtmxNavigation\(anchor\) \|\| isApplicationHandledAnchor\(anchor\)/);
  assert.match(catalogPage, /data-processor-catalog-modal-url=/);
  assert.match(familyPage, /data-processor-catalog-modal-url=/);
  assert.match(catalogActions, /closest\('\[data-processor-catalog-modal-url\]'\)/);
  assert.match(catalogActions, /event\.preventDefault\(\);\s*openProcessorModal\(trigger\);/);
});

test('all Processor Catalog CRUD modal links use the exempt modal trigger contract', () => {
  const catalogPage = read('views/pages/management-processors.ejs');

  assert.match(catalogPage, /\/management\/config\/processors\/new\/modal/);

  for (const action of ['edit/modal', 'families/modal', 'models/modal', 'merge/modal', 'delete/modal']) {
    assert.ok(catalogPage.includes(`/management/config/processors/<%= processor.id %>/${action}`), `${action} link should exist`);
  }

  const triggerCount = (catalogPage.match(/data-processor-catalog-modal-url=/g) || []).length;
  assert.equal(triggerCount, 6, 'each Processor Catalog CRUD modal action should use the catalog modal trigger');
});

test('navigation policy asset version is bumped after Processor Catalog modal fix', () => {
  const head = read('views/partials/head.ejs');
  assert.match(head, /navigation-policy\.js\?v=20260820-stage10w69l-request-modal-exemption/);
});
