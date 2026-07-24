'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const browserSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'tech-unit-form.js'),
  'utf8'
);

test('Lot requirement preview uses the urlencoded request format parsed by Express', () => {
  assert.match(browserSource, /function buildLotRequirementPreviewRequestBody\(form\)/);
  assert.match(browserSource, /new URLSearchParams\(\)/);
  assert.match(browserSource, /application\/x-www-form-urlencoded; charset=UTF-8/);
  assert.match(browserSource, /body: requestBody\.toString\(\)/);
});

test('server-rendered requirement preview errors remain visible to the user', () => {
  assert.match(browserSource, /serverRenderedError: true/);
  assert.doesNotMatch(
    browserSource,
    /if \(!response\.ok\) \{\s*throw new Error\('The selected Lot requirements could not be checked\.'\);\s*\}/
  );
});
