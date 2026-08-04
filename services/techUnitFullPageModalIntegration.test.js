const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.join(__dirname, '..', 'views', 'pages', 'tech-unit-form.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

test('full-page Unit form loads the shared modal assets', () => {
  assert.match(template, /['"]\/css\/modal\.css['"]/);
  assert.match(template, /<script defer src="\/js\/modal\.js\?v=20260729-stage9k-modal-accessibility"><\/script>/);
});

test('full-page Unit form provides the modal target used by override and catalog actions', () => {
  assert.match(template, /<div id="modal-root"><\/div>/);
  assert.match(template, /<script defer src="\/js\/tech-unit-form\.js[^>]*><\/script>/);
});
