'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateBindingTableSchema, evaluateProtectedColumnDefinition, normalizeType } = require('./configIdentityBindingSchemaPolicy');

const spec = {
  systemColumn: 'system_config_value_id',
  configColumn: 'config_value_id',
  configColumnType: 'BIGINT UNSIGNED',
  referencedTable: 'config_values',
  referencedColumn: 'config_value_id'
};

function validMetadata() {
  return {
    columns: [
      { name: 'system_config_value_id', type: 'smallint unsigned', nullable: 'NO' },
      { name: 'config_value_id', type: 'bigint unsigned', nullable: 'NO' }
    ],
    primaryKeyColumns: ['system_config_value_id'],
    uniqueIndexes: [{ name: 'uq_value', columns: ['config_value_id'] }],
    foreignKeys: [{
      columnName: 'config_value_id',
      referencedTableName: 'config_values',
      referencedColumnName: 'config_value_id',
      deleteRule: 'RESTRICT',
      updateRule: 'RESTRICT'
    }]
  };
}

test('binding table schema accepts the required numeric-ID contract', () => {
  assert.deepEqual(evaluateBindingTableSchema(validMetadata(), spec), []);
});

test('binding table schema rejects incompatible ID types and nullable columns', () => {
  const metadata = validMetadata();
  metadata.columns[0].type = 'int';
  metadata.columns[1].nullable = 'YES';
  const issues = evaluateBindingTableSchema(metadata, spec);
  assert.match(issues.join(' '), /SMALLINT UNSIGNED/);
  assert.match(issues.join(' '), /config_value_id must be NOT NULL/);
});

test('binding table schema requires the system ID primary key and unique live config ID', () => {
  const metadata = validMetadata();
  metadata.primaryKeyColumns = ['config_value_id'];
  metadata.uniqueIndexes = [];
  const issues = evaluateBindingTableSchema(metadata, spec);
  assert.match(issues.join(' '), /primary key/);
  assert.match(issues.join(' '), /unique index/);
});

test('binding table schema requires the expected restrictive foreign key', () => {
  const metadata = validMetadata();
  metadata.foreignKeys[0].deleteRule = 'CASCADE';
  const issues = evaluateBindingTableSchema(metadata, spec);
  assert.match(issues.join(' '), /RESTRICT rules/);
});

test('column type normalization is case and whitespace insensitive', () => {
  assert.equal(normalizeType(' BIGINT   UNSIGNED '), 'bigint unsigned');
});


test('protected configuration marker must be non-null TINYINT with a zero default', () => {
  assert.deepEqual(evaluateProtectedColumnDefinition({ COLUMN_TYPE: 'tinyint(1)', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '0' }), []);
  const issues = evaluateProtectedColumnDefinition({ COLUMN_TYPE: 'int', IS_NULLABLE: 'YES', COLUMN_DEFAULT: '1' });
  assert.equal(issues.length, 3);
});
