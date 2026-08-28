'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHardwareComponentComparisons,
  componentText,
  formatHardwareComparisonList,
  formatHardwareComponentList
} = require('./hardwareComponentComparison');

test('Memory comparisons identify changed, removed, and unchanged slots', () => {
  const comparisons = buildHardwareComponentComparisons([
    { slotLabel: 'Slot 1', sizeGb: 8, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
    { slotLabel: 'Slot 2', sizeGb: 8, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
    { slotLabel: 'Slot 3', sizeGb: 0 }
  ], [
    { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
    { slotLabel: 'Slot 2', sizeGb: 0 },
    { slotLabel: 'Slot 3', sizeGb: 0 }
  ], { kind: 'memory' });

  assert.deepEqual(comparisons.map((comparison) => comparison.statusCode), [
    'changed',
    'removed',
    'empty'
  ]);
  assert.equal(comparisons[1].previousText, '8GB · DDR4 · Removable Module');
  assert.equal(comparisons[1].currentText, '0GB · Empty slot');
  assert.equal(comparisons[2].statusLabel, 'Empty');
});

test('Storage comparisons preserve type and wipe status while showing additions', () => {
  const comparisons = buildHardwareComponentComparisons([
    { slotLabel: 'Bay 1', sizeGb: 256, storageTypeLabel: 'SATA SSD' }
  ], [
    { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD', serialNumber: 'SSD-ABC-123', wipeStatusLabel: 'Passed' },
    { slotLabel: 'Bay 2', sizeGb: 1000, storageTypeLabel: 'HDD', serialNumber: 'HDD-XYZ-789', wipeStatusLabel: 'Pending' }
  ], { kind: 'storage' });

  assert.deepEqual(comparisons.map((comparison) => comparison.statusCode), ['changed', 'added']);
  assert.equal(comparisons[0].currentText, '512GB · NVMe SSD · Serial: SSD-ABC-123 · Wipe: Passed');
  assert.equal(comparisons[1].currentText, '1TB · HDD · Serial: HDD-XYZ-789 · Wipe: Pending');
});

test('Storage serial numbers are visible and participate in change detection', () => {
  const comparisons = buildHardwareComponentComparisons([
    { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD', serialNumber: 'OLD-SERIAL' }
  ], [
    { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD', serialNumber: 'NEW-SERIAL' }
  ], { kind: 'storage' });

  assert.equal(comparisons[0].statusCode, 'changed');
  assert.equal(comparisons[0].previousText, '512GB · NVMe SSD · Serial: OLD-SERIAL');
  assert.equal(comparisons[0].currentText, '512GB · NVMe SSD · Serial: NEW-SERIAL');
  assert.equal(
    formatHardwareComponentList([{ slotLabel: 'Bay 1', sizeGb: 512, serialNumber: 'NEW-SERIAL' }], { kind: 'storage' }),
    'Bay 1: 512GB · Serial: NEW-SERIAL'
  );
});

test('zero-capacity component rows are explicit empty slots rather than missing values', () => {
  const memoryText = componentText({
    kind: 'memory',
    sizeGb: 0,
    sizeLabel: '0GB',
    isEmpty: true,
    typeLabel: '',
    installTypeLabel: ''
  });
  const storageList = formatHardwareComponentList([
    { slotLabel: 'Bay 1', sizeGb: 0 }
  ], { kind: 'storage' });

  assert.equal(memoryText, '0GB · Empty slot');
  assert.equal(storageList, 'Bay 1: 0GB · Empty slot');
  assert.equal(formatHardwareComponentList([{ slotLabel: 'Slot 2', sizeGb: '' }]), 'Slot 2: Not recorded');
  assert.equal(formatHardwareComponentList([{ slotLabel: 'Bay 2', sizeGb: null }], { kind: 'storage' }), 'Bay 2: Not recorded');
});

test('component export text uses fixed multiline rows and only reports real changes', () => {
  const comparisons = buildHardwareComponentComparisons([
    { slotLabel: 'Slot 1', sizeGb: 8, ramTypeLabel: 'DDR4' },
    { slotLabel: 'Slot 2', sizeGb: 0 }
  ], [
    { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR4' },
    { slotLabel: 'Slot 2', sizeGb: 0 }
  ], { kind: 'memory' });

  assert.equal(
    formatHardwareComparisonList(comparisons),
    'Slot 1 — Changed: 8GB · DDR4 → 16GB · DDR4'
  );
  assert.equal(
    formatHardwareComponentList([
      { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR4' },
      { slotLabel: 'Slot 2', sizeGb: 0 }
    ]),
    'Slot 1: 16GB · DDR4\nSlot 2: 0GB · Empty slot'
  );
});

test('missing one side is labeled honestly instead of being treated as a confirmed change', () => {
  const currentOnly = buildHardwareComponentComparisons([], [
    { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR5' }
  ], { kind: 'memory' });
  const previousOnly = buildHardwareComponentComparisons([
    { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD' }
  ], [], { kind: 'storage' });

  assert.equal(currentOnly[0].statusCode, 'current_only');
  assert.equal(previousOnly[0].statusCode, 'previous_only');
  assert.equal(formatHardwareComparisonList(currentOnly), 'A complete Previous/Current component comparison is not available.');
  assert.equal(formatHardwareComparisonList(previousOnly), 'A complete Previous/Current component comparison is not available.');
});

test('duplicate slot labels pair by occurrence without dropping rows', () => {
  const comparisons = buildHardwareComponentComparisons([
    { slotLabel: 'Memory', sizeGb: 8 },
    { slotLabel: 'Memory', sizeGb: 8 }
  ], [
    { slotLabel: 'Memory', sizeGb: 8 },
    { slotLabel: 'Memory', sizeGb: 16 }
  ], { kind: 'memory' });

  assert.equal(comparisons.length, 2);
  assert.deepEqual(comparisons.map((comparison) => comparison.statusCode), ['unchanged', 'changed']);
  assert.notEqual(comparisons[0].key, comparisons[1].key);
});
