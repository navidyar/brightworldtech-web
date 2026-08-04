'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditChangeText,
  buildUnitHistoryTimeline,
  groupLegacyEvents,
  normalizeAuditEvent
} = require('./unitHistoryTimeline');

test('creation audit events keep the complete initial snapshot in one timeline entry', () => {
  const timeline = buildUnitHistoryTimeline({
    auditEvents: [{
      eventId: 10,
      actorUserId: 4,
      actorName: 'Jane Tech',
      eventType: 'unit_created',
      eventSummary: 'Created unit BWT2300010',
      occurredAt: '2026-07-24T14:00:00Z',
      changes: [
        { fieldLabel: 'Manufacturer', changeType: 'created', newValueText: 'Dell' },
        { fieldLabel: 'Unit Category', changeType: 'created', newValueText: 'Laptop' }
      ]
    }]
  });

  assert.equal(timeline.totalEvents, 1);
  assert.equal(timeline.totalChanges, 2);
  assert.equal(timeline.events[0].isCreation, true);
  assert.equal(timeline.events[0].changes[0].text, 'Dell');
});

test('later audit events show only old-to-new changes', () => {
  const event = normalizeAuditEvent({
    eventId: 11,
    actorName: 'Maria Manager',
    eventType: 'unit_updated',
    eventSummary: 'Updated unit BWT2300010',
    occurredAt: '2026-07-24T15:00:00Z',
    changes: [
      { fieldLabel: 'Manufacturer', changeType: 'changed', oldValueText: 'Dell', newValueText: 'Microsoft' }
    ]
  });

  assert.equal(event.changes.length, 1);
  assert.equal(event.changes[0].text, 'Dell → Microsoft');
});

test('removed and revoked audit changes use readable timeline text', () => {
  assert.equal(auditChangeText({ changeType: 'removed', oldValueText: 'Windows 11' }), 'Windows 11 → Removed');
  assert.equal(auditChangeText({ changeType: 'revoked', oldValueText: 'Accepted', newValueText: 'Revoked' }), 'Revoked');
});

test('legacy detail rows by the same user within one minute are grouped', () => {
  const grouped = groupLegacyEvents([
    {
      id: 'legacy:memory:1', source: 'legacy', eventType: 'legacy_unit_details_changed', title: 'Updated unit details',
      actorName: 'Jane Tech', occurredAt: new Date('2026-07-24T14:00:00Z'), isLegacy: true, groupable: true,
      changes: [{ label: 'Memory Module', text: '16 GB' }], notes: []
    },
    {
      id: 'legacy:storage:1', source: 'legacy', eventType: 'legacy_unit_details_changed', title: 'Updated unit details',
      actorName: 'Jane Tech', occurredAt: new Date('2026-07-24T14:00:45Z'), isLegacy: true, groupable: true,
      changes: [{ label: 'Storage Device', text: '512 GB NVMe' }], notes: []
    }
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].changes.length, 2);
});

test('legacy normalized rows close to an authoritative audit event are suppressed', () => {
  const timeline = buildUnitHistoryTimeline({
    auditEvents: [{
      eventId: 12,
      actorName: 'Jane Tech',
      eventType: 'unit_updated',
      eventSummary: 'Updated unit BWT2300010',
      occurredAt: '2026-07-24T14:00:00Z',
      changes: [{ fieldLabel: 'Memory Modules', changeType: 'changed', oldValueText: '8 GB', newValueText: '16 GB' }]
    }],
    historyDetails: {
      memoryHistory: [{
        changedByName: 'Jane Tech',
        updatedAt: '2026-07-24T14:00:03Z',
        slotLabel: 'Slot 1',
        sizeGb: 16,
        ramTypeLabel: 'DDR4',
        isCurrent: true
      }]
    }
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].source, 'audit');
});

test('legacy Units receive an honest creation marker without inventing original values', () => {
  const timeline = buildUnitHistoryTimeline({
    creationContext: {
      unitId: 7,
      assetTag: 'BWT2300007',
      createdByName: 'Original Tech',
      createdAt: '2026-06-01T10:00:00Z'
    }
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].eventType, 'legacy_unit_created');
  assert.equal(timeline.events[0].changes.length, 0);
  assert.match(timeline.events[0].notes[0], /Original field values were not captured/);
});

test('acceptance history is not duplicated when the shared audit event exists', () => {
  const timeline = buildUnitHistoryTimeline({
    auditEvents: [{
      eventId: 13,
      actorName: 'Manager User',
      eventType: 'lot_requirement_exception_accepted',
      eventSummary: 'Accepted Lot requirement exception for Lot A',
      metadata: { overrideId: 44 },
      occurredAt: '2026-07-24T16:00:00Z',
      changes: [{ fieldLabel: 'Lot Requirement Acceptance', changeType: 'accepted', newValueText: 'Lot A: Approved exception' }]
    }],
    acceptanceHistory: [{
      overrideId: 44,
      lotName: 'Lot A',
      reason: 'Approved exception',
      approvedByName: 'Manager User',
      approvedAt: '2026-07-24T16:00:00Z'
    }]
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].source, 'audit');
});

test('system-generated expiration is shown as its own System event', () => {
  const timeline = buildUnitHistoryTimeline({
    acceptanceHistory: [{
      overrideId: 45,
      lotName: 'Lot B',
      reason: 'Temporary approval',
      expiredAt: '2026-07-24T17:00:00Z'
    }]
  });

  const expiration = timeline.events.find((event) => event.eventType === 'lot_requirement_exception_expired');
  assert.ok(expiration);
  assert.equal(expiration.actorName, 'System');
});

test('authoritative workflow audit events suppress matching legacy assignment and lifecycle rows', () => {
  const timeline = buildUnitHistoryTimeline({
    auditEvents: [{
      eventId: 99,
      actorName: 'Lead User',
      eventType: 'unit_parked',
      eventSummary: 'Parked Unit',
      occurredAt: '2026-07-24T18:00:00Z',
      changes: [{ fieldLabel: 'Unit Status', changeType: 'changed', oldValueText: 'Active', newValueText: 'Parked' }]
    }],
    operationalHistory: {
      assignmentChanges: [{ changedByName: 'Lead User', changedAt: '2026-07-24T18:00:02Z', fromUserName: 'Tech A', toUserName: '', notes: '' }],
      lifecycleEvents: [{ changedByName: 'Lead User', changedAt: '2026-07-24T18:00:02Z', eventType: 'parked', eventLabel: 'Parked Unit' }]
    }
  });
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].eventType, 'unit_parked');
});

test('audited exception expiration suppresses the legacy expiration copy', () => {
  const timeline = buildUnitHistoryTimeline({
    auditEvents: [{
      eventId: 100,
      actorName: 'System',
      eventType: 'lot_requirement_exception_expired',
      eventSummary: 'Lot requirement exception expired for Lot A',
      metadata: { overrideId: 50 },
      occurredAt: '2026-07-24T19:00:00Z',
      changes: [{ fieldLabel: 'Lot Requirement Acceptance', changeType: 'changed', oldValueText: 'Lot A', newValueText: 'Expired' }]
    }],
    acceptanceHistory: [{ overrideId: 50, lotName: 'Lot A', expiredAt: '2026-07-24T19:00:00Z' }]
  });
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].source, 'audit');
});

test('structured Memory and Storage audit changes expand into readable per-slot history entries', () => {
  const event = normalizeAuditEvent({
    eventId: 201,
    actorName: 'Jane Tech',
    eventType: 'unit_updated',
    eventSummary: 'Updated hardware components',
    occurredAt: '2026-08-03T22:00:00Z',
    changes: [
      {
        fieldKey: 'memory_modules',
        fieldLabel: 'Current Memory Modules',
        changeType: 'changed',
        oldValue: [
          { slotLabel: 'Slot 1', sizeGb: 8, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
          { slotLabel: 'Slot 2', sizeGb: 8, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' }
        ],
        newValue: [
          { slotLabel: 'Slot 1', sizeGb: 16, ramTypeLabel: 'DDR4', memoryInstallTypeLabel: 'Removable Module' },
          { slotLabel: 'Slot 2', sizeGb: 0 }
        ]
      },
      {
        fieldKey: 'storage_devices',
        fieldLabel: 'Current Storage Devices',
        changeType: 'added',
        oldValue: [],
        newValue: [
          { slotLabel: 'Bay 1', sizeGb: 512, storageTypeLabel: 'NVMe SSD', wipeStatusLabel: 'Passed' }
        ]
      }
    ]
  });

  assert.deepEqual(event.changes.map((change) => change.label), [
    'Current Memory · Slot 1',
    'Current Memory · Slot 2',
    'Current Storage · Bay 1'
  ]);
  assert.equal(event.changes[0].text, '8GB · DDR4 · Removable Module → 16GB · DDR4 · Removable Module');
  assert.equal(event.changes[1].text, '8GB · DDR4 · Removable Module → 0GB · Empty slot');
  assert.equal(event.changes[2].text, 'Added 512GB · NVMe SSD · Wipe: Passed');
});
