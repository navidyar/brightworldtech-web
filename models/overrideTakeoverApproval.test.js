'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const auditPath = require.resolve('../services/unitWorkflowAudit');
const destinationValidatorPath = require.resolve('./unitLotDestinationValidationModel');
const modelPath = require.resolve('./overrideRequestModel');

function loadModel({ assignedToUserId = 4, requestedByUserId = 9, destinationValidationResult = null } = {}) {
  const poolCalls = [];
  const connectionCalls = [];
  const destinationCalls = [];

  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      poolCalls.push({ sql: normalized, params });

      if (/FROM information_schema\.TABLES/.test(normalized)) {
        return [[{ table_count: 0 }]];
      }

      if (/FROM information_schema\.COLUMNS/.test(normalized)) {
        return [[{ column_count: 0 }]];
      }

      if (/FROM lots/.test(normalized)) {
        return [[{
          lot_id: 12,
          lot_name: 'ELS2',
          parent_lot_id: null,
          is_active: 1,
          is_closed: 0,
          is_assignable: 1
        }]];
      }

      throw new Error(`Unexpected pool query: ${normalized}`);
    }
  };

  const requestRow = {
    unit_override_request_id: 55,
    unit_id: 4126,
    unit_outcome_id: null,
    request_type: 'manual_tech_override_request',
    requested_by_user_id: requestedByUserId,
    requested_destination_lot_id: 12,
    request_status: 'pending',
    assigned_to_user_id: assignedToUserId,
    created_by_user_id: assignedToUserId,
    current_lot_id: 12,
    is_parked: 0
  };

  const connection = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      connectionCalls.push({ sql: normalized, params });

      if (/SELECT unit_id, unit_outcome_id, request_type, request_status, requested_by_user_id FROM unit_override_requests/.test(normalized)) {
        return [[requestRow]];
      }

      if (/FROM unit_override_requests r/.test(normalized) && /FOR UPDATE/.test(normalized)) {
        return [[requestRow]];
      }

      if (/UPDATE unit_override_requests/.test(normalized)) {
        return [{ affectedRows: 1 }];
      }

      if (/UPDATE units SET/.test(normalized)) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected connection query: ${normalized}`);
    }
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool }
  };
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {
      async recordOverrideApproved() {}
    }
  };
  require.cache[destinationValidatorPath] = {
    id: destinationValidatorPath,
    filename: destinationValidatorPath,
    loaded: true,
    exports: {
      async assertExistingUnitDestination(input) {
        destinationCalls.push(input);
        if (destinationValidationResult instanceof Error) throw destinationValidationResult;
        return destinationValidationResult || { warningMessages: [] };
      }
    }
  };
  delete require.cache[modelPath];

  return {
    model: require('./overrideRequestModel'),
    connection,
    connectionCalls,
    poolCalls,
    destinationCalls
  };
}

test('takeover approval ignores incomplete Unit destination validation and transfers assignment', async () => {
  const blocked = Object.assign(new Error('Missing Unit fields'), { code: 'BWT_LOT_DESTINATION_VALIDATION_BLOCKED' });
  const { model, connection, connectionCalls, destinationCalls } = loadModel({
    assignedToUserId: 4,
    requestedByUserId: 9,
    destinationValidationResult: blocked
  });

  const approved = await model.approveOverrideRequest({
    overrideRequestId: 55,
    reviewedByUserId: 3,
    destinationLotId: 12,
    connection
  });

  assert.equal(approved, true);
  assert.equal(destinationCalls.length, 0);
  const unitUpdate = connectionCalls.find((call) => /UPDATE units SET/.test(call.sql));
  assert.ok(unitUpdate);
  assert.deepEqual(unitUpdate.params, [9, 3, 4126]);
});

test('same-technician override keeps destination completion validation', async () => {
  const { model, connection, destinationCalls } = loadModel({
    assignedToUserId: 9,
    requestedByUserId: 9
  });

  const approved = await model.approveOverrideRequest({
    overrideRequestId: 55,
    reviewedByUserId: 3,
    destinationLotId: 12,
    connection
  });

  assert.equal(approved, true);
  assert.deepEqual(destinationCalls, [{ unitId: 4126, destinationLotId: 12 }]);
});
