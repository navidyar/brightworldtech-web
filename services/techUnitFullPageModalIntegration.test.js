const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'views', 'pages', 'tech-unit-form.ejs');
const template = fs.readFileSync(templatePath, 'utf8');
const head = fs.readFileSync(path.join(root, 'views', 'partials', 'head.ejs'), 'utf8');

test('full-page Unit form loads the shared modal assets', () => {
  assert.match(template, /include\('\.\.\/partials\/head'/);
  assert.doesNotMatch(template, /\/css\/modal\.css/);
  assert.match(head, /\/css\/theme\.css\?v=/);
  assert.match(head, /\/css\/app\.css\?v=/);
  assert.match(head, /\/css\/features\.css\?v=/);
  assert.match(template, /<script defer src="\/js\/modal\.js\?v=[^"]+"><\/script>/);
});

test('full-page Unit form provides the modal target used by override and catalog actions', () => {
  assert.match(template, /<div id="modal-root"><\/div>/);
  assert.match(template, /<script defer src="\/js\/tech-unit-form\.js[^>]*><\/script>/);
});
