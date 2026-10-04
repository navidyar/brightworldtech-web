'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Model and Processor catalog rejection notes are optional in the review UI', () => {
  const page = read('views/pages/unit-request-detail.ejs');
  assert.match(page, /Optional reason this model should not be added or reactivated/);
  assert.match(page, /Optional reason this processor should not be added or mapped/);
  assert.doesNotMatch(page, /minlength="3" maxlength="1000" required placeholder="Explain why this model/);
  assert.doesNotMatch(page, /minlength="3" maxlength="1000" required placeholder="Explain why this processor/);
});

test('catalog rejections bypass the general rejection-note requirement while other request types keep it', () => {
  const model = read('models/unitRequestModel.js');
  const start = model.indexOf('async function rejectUnitRequest');
  const end = model.indexOf('\nmodule.exports', start);
  const source = model.slice(start, end);
  assert.match(source, /!CATALOG_REQUEST_TYPES\.has\(request\.request_type\) && safeReviewerNote\.length < 3/);
  assert.match(source, /BWT_UNIT_REQUEST_REJECTION_NOTE_REQUIRED/);
  assert.match(source, /safeReviewerNote \|\| null/);
});
