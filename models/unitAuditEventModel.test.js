'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const modelPath = require.resolve('./unitAuditEventModel');

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      getConnection: async () => {
        throw new Error('Unexpected default pool connection.');
      }
    }
  }
};
delete require.cache[modelPath];

const { insertEventWithConnection, normalizeEvent } = require('./unitAuditEventModel');

test('normalizes one action into one event with ordered changes', () => {
  const event = normalizeEvent({
    unitId: 8,
    actorUserId: 4,
    eventType: 'unit_updated',
    eventSource: 'tech_unit_form',
    eventSummary: 'Updated unit BWT2300008',
    changes: [
      { fieldKey: 'manufacturer', fieldLabel: 'Manufacturer', changeType: 'changed', oldValueText: 'Dell', newValueText: 'Microsoft' }
    ]
  });

  assert.equal(event.unitId, 8);
  assert.equal(event.changes.length, 1);
  assert.match(event.correlationKey, /^[0-9a-f-]{36}$/);
});

test('inserts the event before its child change records', async () => {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO unit_audit_events')) return [{ insertId: 91 }];
      return [{ insertId: 101 }];
    }
  };

  const result = await insertEventWithConnection(connection, {
    unitId: 8,
    actorUserId: 4,
    eventType: 'unit_updated',
    eventSource: 'tech_unit_form',
    eventSummary: 'Updated unit BWT2300008',
    changes: [
      { fieldKey: 'manufacturer', fieldLabel: 'Manufacturer', changeType: 'changed', oldValueText: 'Dell', newValueText: 'Microsoft' }
    ]
  });

  assert.equal(result.eventId, 91);
  assert.equal(result.changeCount, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO unit_audit_events/);
  assert.match(calls[1].sql, /INSERT INTO unit_audit_event_changes/);
  assert.equal(calls[1].params[0], 91);
});

test('loads an honest legacy creation marker with creator and prefixed Asset Tag', async () => {
  const { getUnitCreationContext } = require('./unitAuditEventModel');
  const connection = {
    async query(sql, params) {
      assert.match(sql, /FROM units u/);
      assert.deepEqual(params, [8]);
      return [[{
        unit_id: 8,
        asset_number: 2300008,
        created_by_user_id: 4,
        created_by_name: 'Jane Tech',
        created_at: '2026-06-01T10:00:00Z'
      }]];
    }
  };

  const context = await getUnitCreationContext(8, { connection, assetTagPrefix: 'BWT' });
  assert.equal(context.assetTag, 'BWT2300008');
  assert.equal(context.createdByName, 'Jane Tech');
});
