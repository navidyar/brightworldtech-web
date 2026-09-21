'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LabelBuilderLayoutError,
  createBlankBuilderLayout,
  normalizeBuilderLayout,
  inspectLayoutReadiness
} = require('./labelBuilderLayoutPolicy');


test('blank builder layout starts with default roll width and variable length', () => {
  const layout = createBlankBuilderLayout();
  assert.equal(layout.schemaVersion, 1);
  assert.equal(layout.builderVersion, 2);
  assert.equal(layout.mediaWidthCode, '62mm_continuous');
  assert.equal(layout.lengthMm, 30);
  assert.deepEqual(layout.elements, []);
});

test('draft unconfigured regions are allowed inside variable continuous geometry', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    builderVersion: 2,
    mediaWidthCode: '38mm_continuous',
    lengthMm: 50,
    elements: [{ id: 'region-1', type: 'unconfigured', x: 20, y: 30, width: 120, height: 60 }]
  }, { mediaWidthCode: '38mm_continuous', lengthMm: 50, template: { status: 'draft' } });
  assert.equal(layout.elements[0].x, 20);
  assert.equal(layout.elements[0].width, 120);
  assert.equal(layout.mediaWidthCode, '38mm_continuous');
  assert.equal(layout.lengthMm, 50);
});

test('builder rejects regions that extend outside the selected roll width', () => {
  assert.throws(() => normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '29mm_continuous',
    lengthMm: 30,
    elements: [{ id: 'region-1', type: 'unconfigured', x: 300, y: 0, width: 40, height: 40 }]
  }, { mediaWidthCode: '29mm_continuous', lengthMm: 30, template: { status: 'draft' } }), LabelBuilderLayoutError);
});

test('builder enforces Brother continuous length limits', () => {
  assert.throws(() => normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 12,
    elements: []
  }, { template: { status: 'draft' } }), /12\.7 mm and 1000 mm/);
  assert.throws(() => normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 1000.1,
    elements: []
  }, { template: { status: 'draft' } }), /12\.7 mm and 1000 mm/);
});

test('builder upgrades the old fixed-length 62 mm preset when saving', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    builderVersion: 1,
    mediaPresetCode: '62mm_continuous_50mm',
    elements: []
  }, { template: { status: 'draft' } });
  assert.equal(layout.builderVersion, 2);
  assert.equal(layout.mediaWidthCode, '62mm_continuous');
  assert.equal(layout.lengthMm, 50);
  assert.equal(Object.hasOwn(layout, 'mediaPresetCode'), false);
});

test('builder rejects duplicate region IDs', () => {
  assert.throws(() => normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 30,
    elements: [
      { id: 'same', type: 'unconfigured', x: 0, y: 0, width: 40, height: 40 },
      { id: 'same', type: 'unconfigured', x: 50, y: 0, width: 40, height: 40 }
    ]
  }, { template: { status: 'draft' } }), /Duplicate region ID/);
});

test('active template layouts use the same normalized structured layout contract', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 30,
    elements: [{ id: 'text-1', type: 'static_text', x: 0, y: 0, width: 100, height: 30, text: 'LIVE' }]
  }, { template: { status: 'active' } });
  assert.equal(layout.elements[0].text, 'LIVE');
});

test('blank and unconfigured builder layouts cannot activate', () => {
  assert.equal(inspectLayoutReadiness(createBlankBuilderLayout()).ready, false);
  const withRegion = createBlankBuilderLayout();
  withRegion.elements.push({ id: 'region-1', type: 'unconfigured', x: 0, y: 0, width: 50, height: 20 });
  const readiness = inspectLayoutReadiness(withRegion);
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join(' '), /needs a content type/);
});

test('existing supported renderer elements can satisfy activation readiness', () => {
  const readiness = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'text-1', type: 'static_text', x: 0, y: 0, width: 100, height: 30, text: 'TEST' }]
  });
  assert.equal(readiness.ready, true);
});


test('builder normalizes Static and Dynamic Text typography plus quarter-turn rotation', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [
      {
        id: 'static-1', type: 'static_text', x: 10, y: 10, width: 180, height: 50, rotation: 90,
        text: 'HELLO', style: { fontFamily: 'Liberation Sans', fontSize: 32, fontWeight: 700, align: 'center', textCase: 'upper' }
      },
      {
        id: 'dynamic-1', type: 'dynamic_text', x: 20, y: 100, width: 200, height: 45, rotation: 270,
        source: { field: 'unit.asset_tag', format: 'upper' },
        style: { fontFamily: 'Noto Sans', fontSize: 28, fontWeight: 400, align: 'right', textCase: 'lower' }
      }
    ]
  }, { template: { status: 'draft' } });
  assert.equal(layout.elements[0].rotation, 90);

  assert.equal(layout.elements[0].style.fontFamily, 'Liberation Sans');
  assert.equal(layout.elements[0].style.textCase, 'upper');
  assert.equal(layout.elements[1].rotation, 270);
  assert.equal(layout.elements[1].source.field, 'unit.asset_tag');
  assert.equal(layout.elements[1].source.format, 'plain');
  assert.equal(layout.elements[1].style.fontFamily, 'Noto Sans');
});

test('text readiness requires static content and a registered dynamic field', () => {
  const emptyStatic = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 's', type: 'static_text', text: '', x: 0, y: 0, width: 100, height: 30 }]
  });
  assert.equal(emptyStatic.ready, false);
  assert.match(emptyStatic.issues.join(' '), /needs text/);

  const invalidDynamic = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'd', type: 'dynamic_text', source: { field: 'unit.not_real' }, x: 0, y: 0, width: 100, height: 30 }]
  });
  assert.equal(invalidDynamic.ready, false);
  assert.match(invalidDynamic.issues.join(' '), /valid BWTDallas field/);
});

test('builder normalizes reusable image references and aspect-ratio settings', () => {
  const assetKey = `shared_${'a'.repeat(64)}`;
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [{
      id: 'logo', type: 'image', x: 10, y: 10, width: 120, height: 60, rotation: 90,
      assetKey, fit: 'cover', lockAspectRatio: false
    }]
  }, { template: { status: 'draft' } });
  assert.equal(layout.elements[0].assetKey, assetKey);
  assert.equal(layout.elements[0].fit, 'contain');
  assert.equal(layout.elements[0].lockAspectRatio, false);
  assert.equal(layout.elements[0].rotation, 90);
  assert.equal(inspectLayoutReadiness(layout).ready, true);
});

test('image readiness requires a reusable content-addressed Shared Asset key', () => {
  const readiness = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'logo', type: 'image', x: 0, y: 0, width: 100, height: 50, assetKey: '' }]
  });
  assert.equal(readiness.ready, false);
  assert.match(readiness.issues.join(' '), /reusable Shared Asset/);
});

test('builder normalizes Barcode and QR payload configuration', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [
      {
        id: 'barcode-1', type: 'barcode', x: 10, y: 10, width: 300, height: 80, rotation: 90,
        symbology: 'anything', showText: true, humanReadableFontSize: 32,
        payload: { type: 'field', field: 'unit.primary_serial', format: 'upper' }
      },
      {
        id: 'qr-1', type: 'qr', x: 20, y: 120, width: 120, height: 120, rotation: 270,
        errorCorrection: 'h',
        payload: {
          type: 'composed',
          parts: [
            { type: 'static', value: 'UNIT=' },
            { type: 'field', field: 'unit.asset_tag', format: 'plain' }
          ]
        }
      }
    ]
  }, { template: { status: 'draft' } });

  assert.equal(layout.elements[0].symbology, 'code39');
  assert.equal(layout.elements[0].showText, true);
  assert.equal(layout.elements[0].humanReadableFontSize, 32);
  assert.equal(layout.elements[0].payload.field, 'unit.primary_serial');
  assert.equal(layout.elements[0].payload.format, 'upper');
  assert.equal(layout.elements[0].rotation, 90);

  const legacyBarcode = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [{ id: 'legacy-barcode', type: 'barcode', x: 10, y: 10, width: 300, height: 80, showText: true, payload: { type: 'static', value: 'ABC123' } }]
  }, { template: { status: 'draft' } });
  assert.equal(legacyBarcode.elements[0].humanReadableFontSize, 20);

  assert.equal(layout.elements[1].errorCorrection, 'H');
  assert.equal(layout.elements[1].payload.type, 'composed');
  assert.equal(layout.elements[1].payload.parts[1].field, 'unit.asset_tag');
  assert.equal(layout.elements[1].rotation, 270);
  assert.equal(inspectLayoutReadiness(layout).ready, true);
});

test('Barcode and QR readiness requires valid payload configuration', () => {
  const missingBarcode = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'b', type: 'barcode', payload: { type: 'field', field: '' }, x: 0, y: 0, width: 100, height: 40 }]
  });
  assert.equal(missingBarcode.ready, false);
  assert.match(missingBarcode.issues.join(' '), /valid BWTDallas field/);

  const invalidCode39 = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'b', type: 'barcode', payload: { type: 'static', value: 'ABC_123' }, x: 0, y: 0, width: 100, height: 40 }]
  });
  assert.equal(invalidCode39.ready, false);
  assert.match(invalidCode39.issues.join(' '), /Code 39 cannot encode/);

  const invalidTextSize = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'b', type: 'barcode', payload: { type: 'static', value: 'ABC123' }, showText: true, humanReadableFontSize: 99, x: 0, y: 0, width: 100, height: 40 }]
  });
  assert.equal(invalidTextSize.ready, false);
  assert.match(invalidTextSize.issues.join(' '), /payload text size must be 8–48 dots/);

  const invalidQr = inspectLayoutReadiness({
    schemaVersion: 1,
    elements: [{ id: 'q', type: 'qr', payload: { type: 'composed', parts: [] }, x: 0, y: 0, width: 80, height: 80 }]
  });
  assert.equal(invalidQr.ready, false);
  assert.match(invalidQr.issues.join(' '), /composed value/);
});

test('builder normalizes Line and Rectangle vector properties', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [
      { id: 'line-1', type: 'line', x: 10, y: 10, width: 300, height: 20, thickness: 6, rotation: 90 },
      { id: 'rect-1', type: 'rectangle', x: 20, y: 80, width: 220, height: 100, thickness: 4, fill: 'filled', rotation: 270 }
    ]
  }, { template: { status: 'draft' } });

  assert.equal(layout.elements[0].type, 'line');
  assert.equal(layout.elements[0].thickness, 6);
  assert.equal(layout.elements[0].rotation, 90);
  assert.equal(layout.elements[1].type, 'rectangle');
  assert.equal(layout.elements[1].fill, 'filled');
  assert.equal(layout.elements[1].thickness, 4);
  assert.equal(layout.elements[1].rotation, 270);
  assert.equal(inspectLayoutReadiness(layout).ready, true);
});


test('Label Builder preserves Camel Case for text styles and payload field parts', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    builderVersion: 2,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 30,
    elements: [
      {
        id: 'camel_text', type: 'dynamic_text', x: 10, y: 10, width: 200, height: 40,
        source: { field: 'unit.operating_system_short' },
        style: { textCase: 'camel' }
      },
      {
        id: 'camel_qr', type: 'qr', x: 220, y: 10, width: 100, height: 100,
        payload: {
          type: 'composed',
          parts: [{ type: 'field', field: 'unit.operating_system_short', format: 'camel' }]
        }
      }
    ]
  });

  assert.equal(layout.elements[0].style.textCase, 'camel');
  assert.equal(layout.elements[1].payload.parts[0].format, 'camel');
});

test('text font size is capped by the drawable region height including quarter-turn layouts', () => {
  const layout = normalizeBuilderLayout({
    schemaVersion: 1,
    mediaWidthCode: '62mm_continuous',
    lengthMm: 50,
    elements: [
      {
        id: 'plain-text', type: 'static_text', x: 10, y: 10, width: 180, height: 30,
        text: 'TOO LARGE', style: { fontFamily: 'DejaVu Sans', fontSize: 90 }
      },
      {
        id: 'rotated-text', type: 'static_text', x: 10, y: 60, width: 24, height: 160, rotation: 90,
        text: 'ROTATED', style: { fontFamily: 'DejaVu Sans', fontSize: 90 }
      }
    ]
  }, { template: { status: 'draft' } });

  assert.equal(layout.elements[0].style.fontSize, 30);
  assert.equal(layout.elements[1].style.fontSize, 24);
});
