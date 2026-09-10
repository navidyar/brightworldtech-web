'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeManufacturerText,
  resolveManufacturerCandidate,
  resolveModelCandidate,
  resolveProcessorCandidate,
  resolveOperatingSystemCandidate
} = require('./apiCatalogInventory');

test('manufacturer normalization accepts common OEM corporate names without fuzzy guessing', () => {
  assert.equal(normalizeManufacturerText('Dell Inc.'), 'dell');
  assert.equal(normalizeManufacturerText('HP Inc.'), 'hp');
  assert.equal(normalizeManufacturerText('Hewlett-Packard'), 'hp');
  assert.equal(normalizeManufacturerText('Lenovo Group Limited'), 'lenovo');
  assert.deepEqual(resolveManufacturerCandidate('Dell Inc.', [
    { id: 1, label: 'Dell' },
    { id: 2, label: 'HP' }
  ]), {
    status: 'resolved', submitted: 'Dell Inc.', resolvedId: 1, resolvedLabel: 'Dell'
  });
});

test('model matching accepts an OEM prefix but stays exact after normalization', () => {
  const candidates = [
    { id: 10, label: 'OptiPlex 7090', manufacturerLabel: 'Dell' },
    { id: 11, label: 'OptiPlex 7090 Micro Plus', manufacturerLabel: 'Dell' }
  ];
  assert.equal(resolveModelCandidate('Dell OptiPlex 7090', candidates, 'Dell').resolvedId, 10);
  assert.equal(resolveModelCandidate('OptiPlex 7090 unknown suffix', candidates, 'Dell').status, 'unmapped');
});

test('processor matching normalizes vendor, trademark, CPU, and reported clock text', () => {
  const candidates = [
    { id: 20, modelCode: 'i7-8665U', label: 'Intel i7-8665U', brandName: 'Intel' },
    { id: 21, modelCode: 'i7-8650U', label: 'Intel i7-8650U', brandName: 'Intel' }
  ];
  const result = resolveProcessorCandidate('Intel(R) Core(TM) i7-8665U CPU @ 1.90GHz', candidates);
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolvedId, 20);
});

test('operating system matching accepts Microsoft prefix and Professional synonym', () => {
  const candidates = [
    { id: 30, label: 'Windows 11 Pro', value: 'windows_11_pro' },
    { id: 31, label: 'Windows 11 Home', value: 'windows_11_home' }
  ];
  const result = resolveOperatingSystemCandidate('Microsoft Windows 11 Professional', candidates);
  assert.equal(result.status, 'resolved');
  assert.equal(result.resolvedId, 30);
});

test('ambiguous normalized catalog matches are never guessed', () => {
  const result = resolveManufacturerCandidate('Dell', [
    { id: 1, label: 'Dell' },
    { id: 2, label: 'Dell Inc.' }
  ]);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});
