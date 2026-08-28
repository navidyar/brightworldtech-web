const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Requests queue adds Request From between Request and Request Context', () => {
  const page = read('views/pages/unit-requests.ejs');

  assert.match(
    page,
    /<span>Request<\/span>\s*<span>Request From<\/span>\s*<span>Request Context<\/span>/
  );
  assert.match(
    page,
    /unit-request-row-request[\s\S]*unit-request-row-requester[\s\S]*unit-request-row-summary/
  );
  assert.match(page, /<strong><%= request\.requestedByName \|\| '—' %><\/strong>/);
});

test('requester is not redundantly repeated under Submitted while archived resolution attribution remains', () => {
  const page = read('views/pages/unit-requests.ejs');

  assert.doesNotMatch(page, /: `by \$\{request\.requestedByName\}`/);
  assert.match(page, /Resolved by \$\{request\.reviewedByName \|\| request\.requestedByName\}/);
});

test('Request From uses a dedicated responsive queue column without changing the request detail model', () => {
  const page = read('views/pages/unit-requests.ejs');
  const css = read('public/css/unit-requests.css');

  assert.match(page, /unit-requests\.css\?v=20260828-stage10w74n-request-context-labels/);
  assert.match(css, /grid-template-columns:\s*minmax\(185px, 1\.1fr\)\s+minmax\(135px, 0\.72fr\)\s+minmax\(340px, 2\.35fr\)\s+auto/);
  assert.match(css, /\.unit-request-row-main-link\s*\{[\s\S]*?grid-column:\s*1 \/ 4;[\s\S]*?minmax\(135px, 0\.72fr\)/);
  assert.match(css, /\.unit-request-row-actions\s*\{\s*grid-column:\s*4;/);
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*?\.unit-request-row-requester-label\s*\{\s*display:\s*block;/);
});
