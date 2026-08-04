'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUnitAuditSnapshot,
  buildUnitFormAuditEvent,
  diffUnitAuditSnapshots
} = require('./unitAuditSnapshot');

const formOptions = {
  lots: [{ lot_id: 8, name: 'Ready Stock' }],
  manufacturers: [{ id: 2, label: 'Dell' }, { id: 3, label: 'Microsoft' }],
  unitModels: [{ id: 4, label: 'Latitude 5400' }],
  processorModels: [{ id: 5, label: 'Intel Core i5-8365U' }],
  ramTypes: [{ id: 6, label: 'DDR4' }],
  storageTypes: [{ id: 7, label: 'NVMe' }]
};

test('creation snapshot records readable catalog and repeatable values', () => {
  const event = buildUnitFormAuditEvent({
    mode: 'create',
    unitId: 22,
    actorUserId: 9,
    formOptions,
    afterFormData: {
      assetTag: 'BWT2300022',
      lotId: '8',
      manufacturerId: '2',
      unitModelId: '4',
      processorModelId: '5',
      memoryModules: [{ slotLabel: 'A', sizeGb: '16', ramTypeConfigValueId: '6' }],
      storageDevices: [{ slotLabel: 'M.2', sizeGb: '512', storageTypeConfigValueId: '7' }]
    }
  });

  assert.equal(event.eventType, 'unit_created');
  assert.equal(event.eventSummary, 'Created unit BWT2300022');
  assert.ok(event.changes.some((change) => change.fieldKey === 'manufacturer' && change.newValueText === 'Dell'));
  assert.ok(event.changes.some((change) => change.fieldKey === 'memory_modules' && change.newValueText.includes('16GB DDR4')));
});

test('edit snapshots record only changed values', () => {
  const before = buildUnitAuditSnapshot({ assetTag: 'BWT1', manufacturerId: '2', processorSpeedGhz: '1.8' }, formOptions);
  const after = buildUnitAuditSnapshot({ assetTag: 'BWT1', manufacturerId: '3', processorSpeedGhz: '1.8' }, formOptions);
  const changes = diffUnitAuditSnapshots(before, after, { mode: 'edit' });

  assert.deepEqual(changes.map((change) => change.fieldKey), ['manufacturer']);
  assert.equal(changes[0].oldValueText, 'Dell');
  assert.equal(changes[0].newValueText, 'Microsoft');
});

test('general comments are recorded as append-only changes', () => {
  const event = buildUnitFormAuditEvent({
    mode: 'edit',
    unitId: 22,
    actorUserId: 9,
    formOptions,
    beforeFormData: { assetTag: 'BWT2300022', manufacturerId: '2' },
    afterFormData: { assetTag: 'BWT2300022', manufacturerId: '2', generalCommentText: 'Ready for shipping.' }
  });

  assert.equal(event.changes.length, 1);
  assert.equal(event.changes[0].fieldKey, 'general_comment');
  assert.equal(event.changes[0].changeType, 'added');
});
