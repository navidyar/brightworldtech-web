'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPLE_MODEL_FAMILIES,
  DEFAULT_SCREEN_SIZE_LABELS,
  getAppleModelFamily,
  isGenericAppleModel,
  parseDetailedAppleModel,
  parseModelYear,
  parseScreenSizeLabel
} = require('./appleCatalogNormalization');

test('detailed Apple laptop models normalize to generic family and retain parsable metadata', () => {
  assert.deepEqual(parseDetailedAppleModel('MacBook Pro (16-inch, 2019, Intel)'), {
    sourceModelName: 'MacBook Pro (16-inch, 2019, Intel)',
    targetModelName: 'MacBook Pro',
    categoryKind: 'laptop',
    screenSizeLabel: '16-inch',
    modelYear: 2019
  });
});

test('Apple Silicon details do not alter the generic model family', () => {
  assert.deepEqual(parseDetailedAppleModel('MacBook Air (13-inch, M4, 2025)'), {
    sourceModelName: 'MacBook Air (13-inch, M4, 2025)',
    targetModelName: 'MacBook Air',
    categoryKind: 'laptop',
    screenSizeLabel: '13-inch',
    modelYear: 2025
  });
});

test('desktop Apple models normalize without requiring a screen size', () => {
  assert.deepEqual(parseDetailedAppleModel('Mac mini (M4 Pro, 2024)'), {
    sourceModelName: 'Mac mini (M4 Pro, 2024)',
    targetModelName: 'Mac mini',
    categoryKind: 'desktop',
    screenSizeLabel: null,
    modelYear: 2024
  });
});

test('generic Apple catalog names are not treated as migration sources', () => {
  assert.equal(parseDetailedAppleModel('MacBook Pro'), null);
  assert.equal(isGenericAppleModel('MacBook Pro'), true);
  assert.equal(isGenericAppleModel('MacBook Pro (14-inch, M3, 2023)'), false);
});

test('screen-size and year parsers handle decimal sizes and Early/Mid year wording', () => {
  assert.equal(parseScreenSizeLabel('iMac (21.5-inch, 2019, Intel)'), '21.5-inch');
  assert.equal(parseModelYear('MacBook Pro (15-inch, Mid 2015, Intel)'), 2015);
  assert.equal(parseModelYear('MacBook Air (13-inch, Early 2015)'), 2015);
});

test('unknown Apple-style names are left alone rather than guessed', () => {
  assert.equal(parseDetailedAppleModel('Apple Prototype (14-inch, 2025)'), null);
  assert.equal(getAppleModelFamily('Apple Prototype'), null);
});

test('normalization catalog includes the agreed generic Apple families and screen-size seed choices', () => {
  const names = APPLE_MODEL_FAMILIES.map((entry) => entry.modelName);
  for (const expected of ['MacBook', 'MacBook Air', 'MacBook Pro', 'iMac', 'Mac mini', 'Mac Studio', 'iPad', 'iPad Air', 'iPad Pro']) {
    assert.equal(names.includes(expected), true, `${expected} should be present`);
  }
  for (const expected of ['13.3-inch', '14-inch', '15-inch', '16-inch', '21.5-inch', '24-inch', '27-inch']) {
    assert.equal(DEFAULT_SCREEN_SIZE_LABELS.includes(expected), true, `${expected} should be seeded`);
  }
});
