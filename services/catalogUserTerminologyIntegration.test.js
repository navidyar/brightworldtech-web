'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Model and Processor request UI uses Catalog terminology instead of canonical terminology', () => {
  const page = read('views/pages/unit-request-detail.ejs');

  for (const text of [
    'Catalog Approval Result',
    'Existing Catalog Model',
    'Create a New Catalog Model',
    'Catalog Model Name',
    'Existing Catalog Processor',
    'Create a New Catalog Processor only when none exists',
    'Processor Type Name',
    'Catalog Processor'
  ]) assert.match(page, new RegExp(text));

  assert.doesNotMatch(page, />[^<]*Canonical (?:Unit Model|Processor)/i);
  assert.doesNotMatch(page, /canonical approval details/i);
});

test('Catalog management and alias help text uses Catalog Model and Catalog Processor wording', () => {
  const files = [
    'views/pages/management-unit-models.ejs',
    'views/pages/management-processors.ejs',
    'views/fragments/processor-catalog-models-modal.ejs',
    'views/fragments/processor-catalog-merge-modal.ejs',
    'views/fragments/processor-catalog-edit-modal.ejs',
    'views/fragments/tech-unit-catalog-request-modal.ejs',
    'views/fragments/processor-catalog-delete-modal.ejs',
    'views/fragments/unit-model-mappings-modal.ejs',
    'views/fragments/unit-model-processors-modal.ejs'
  ];
  const source = files.map(read).join('\n');
  assert.match(source, /Catalog Model/);
  assert.match(source, /Catalog Processor/);
  assert.doesNotMatch(source, /\bcanonical (?:Unit Model|model|Processor|processor|record|category|target)\b/);
});
