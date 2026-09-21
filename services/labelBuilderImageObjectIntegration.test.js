'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('Builder exposes reusable Image objects and Shared Asset selection', () => {
  const view = source('views/pages/management-label-builder.ejs');
  const controller = source('controllers/labelLibraryController.js');
  assert.match(view, /<option value="image">Image<\/option>/);
  assert.match(view, /Shared Asset/);
  assert.match(view, /data-builder-image-asset/);
  assert.match(view, /Lock aspect ratio while resizing/);
  assert.match(view, /label-builder-assets-json/);
  assert.match(controller, /sharedImageAssets/);
  assert.match(controller, /image\/png/);
  assert.match(controller, /image\/svg\+xml/);
});

test('Builder displays PNG or SVG assets live without flattening them into the config', () => {
  const js = source('public/js/label-builder.js');
  const css = `${source('public/css/app.css')}\n${source('public/css/features.css')}`;
  assert.match(js, /label-builder-assets-json/);
  assert.match(js, /image\.src = asset\.fileUrl/);
  assert.match(js, /fitRegionToImageAspect/);
  assert.match(js, /constrainImageResize/);
  assert.match(css, /label-builder-region-image/);
  assert.match(js, /dataset\.builderHasAsset/);
  assert.match(css, /not\(\[data-builder-type=\"unconfigured\"\]\)/);
  assert.match(css, /\.label-builder-region\s*\{[\s\S]*?border: 0;/);
  assert.doesNotMatch(js, /canvas\.toDataURL|toBlob\(/);
});

test('saved image instructions use stable content-addressed asset keys and template links', () => {
  const policy = source('services/labelBuilderLayoutPolicy.js');
  const controller = source('controllers/labelLibraryController.js');
  const model = source('models/labelLibraryModel.js');
  assert.match(policy, /shared_\(\[a-f0-9\]\{64\}\)/);
  assert.match(controller, /getLabelAssetBySha256/);
  assert.match(controller, /validateBuilderImageReferences/);
  assert.match(model, /role = 'layout_asset'/);
  assert.match(model, /'layout_asset'/);
});

test('image elements share quarter-turn rotation and renderer image support', () => {
  const js = source('public/js/label-builder.js');
  const renderer = source('services/labelTemplateLayoutRenderer.js');
  assert.match(js, /region\.type === 'image'/);
  assert.match(js, /rotateRegionTo/);
  assert.match(renderer, /case 'image'/);
  assert.match(renderer, /renderImageSvg/);
  assert.match(renderer, /wrapElementRotation/);
});
