'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LabelAssetUploadError,
  sanitizeSvgBuffer,
  prepareLabelAssetUpload
} = require('./labelAssetUploadPolicy');

test('SVG sanitizer removes script/event handlers and keeps normal vector content', () => {
  const source = Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" onload="alert(1)"><!--x--><script>alert(1)</script><rect width="100" height="40" fill="#000"/></svg>`);
  const sanitized = sanitizeSvgBuffer(source).toString('utf8');
  assert.doesNotMatch(sanitized, /script|onload|<!--/i);
  assert.match(sanitized, /<rect/);
  assert.match(sanitized, /<svg/);
});

test('SVG sanitizer rejects external references', () => {
  assert.throws(
    () => sanitizeSvgBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><image href="https://example.com/a.png"/></svg>')),
    LabelAssetUploadError
  );
});

test('upload policy accepts sanitized SVG metadata and preserves vector MIME type', async () => {
  const result = await prepareLabelAssetUpload(
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><path d="M0 0h120v60H0z" fill="#000"/></svg>'),
    { mimeType: 'image/svg+xml', sourceFilename: 'logo.svg', assetKind: 'logo', name: 'Test Logo' }
  );
  assert.equal(result.mimeType, 'image/svg+xml');
  assert.equal(result.assetKind, 'logo');
  assert.equal(result.widthPixels, 120);
  assert.equal(result.heightPixels, 60);
  assert.match(result.buffer.toString('utf8'), /<path/);
});

test('upload policy rejects non-PNG/SVG formats clearly', async () => {
  await assert.rejects(
    () => prepareLabelAssetUpload(Buffer.from('jpeg'), {
      mimeType: 'image/jpeg', sourceFilename: 'logo.jpg', assetKind: 'image', name: 'JPEG'
    }),
    /Only PNG and SVG Label Assets are supported/
  );
});
