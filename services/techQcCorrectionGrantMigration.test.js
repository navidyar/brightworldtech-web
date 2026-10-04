'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../scripts/migrateTechQcCorrectionGrant');

function fixture({ applied = false, granted = false, failAudit = false } = {}) {
  const mutations = [];
  const connection = {
    beginTransaction: async () => mutations.push('begin'),
    commit: async () => mutations.push('commit'),
    rollback: async () => mutations.push('rollback'),
    query: async (sql, values) => {
      if (sql.startsWith('SELECT role_id')) return [[{ role_id: 2, name: 'Tech' }]];
      if (sql.startsWith('SELECT migration_key')) return [applied ? [{}] : []];
      if (sql.startsWith('SELECT permission_id')) return [[{ permission_id: 5 }]];
      if (sql.startsWith('SELECT 1 FROM role_permissions')) return [granted ? [{}] : []];
      if (sql.includes('INSERT INTO permission_audit_events') && failAudit) throw new Error('Audit failed');
      mutations.push({ sql, values });
      return [{ affectedRows: 1 }];
    }
  };
  return { connection, mutations };
}

test('Tech correction audit makes no writes', async () => {
  const { connection, mutations } = fixture();
  assert.equal((await migrate(connection)).changed, false);
  assert.deepEqual(mutations, ['begin', 'rollback']);
});

test('correction and audit commit together without modifying user overrides', async () => {
  const { connection, mutations } = fixture();
  assert.equal((await migrate(connection, true)).changed, true);
  const writes = mutations.filter((item) => typeof item === 'object');
  assert.equal(writes.length, 3);
  assert.ok(writes.some(({ sql }) => sql.includes('INSERT INTO permission_audit_events')));
  assert.ok(writes.every(({ sql }) => !sql.includes('user_permission_overrides')));
  assert.equal(mutations.at(-1), 'commit');
});

test('one-time migration preserves later administrator revocation', async () => {
  const { connection, mutations } = fixture({ applied: true, granted: false });
  assert.equal((await migrate(connection, true)).changed, false);
  assert.deepEqual(mutations, ['begin', 'rollback']);
});

test('audit failure rolls back the correction', async () => {
  const { connection, mutations } = fixture({ failAudit: true });
  await assert.rejects(migrate(connection, true), /Audit failed/);
  assert.equal(mutations.at(-1), 'rollback');
  assert.ok(!mutations.includes('commit'));
});
