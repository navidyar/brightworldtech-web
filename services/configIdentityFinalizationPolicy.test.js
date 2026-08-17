'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLegacyCodeRemovalDecision,
  classifyIndexesUsingColumn,
  expressionReferencesColumn,
  groupIndexes
} = require('./configIdentityFinalizationPolicy');

test('legacy code finalization groups ordered index columns before classifying them', () => {
  const rows = [
    { INDEX_NAME: 'uq_code', COLUMN_NAME: 'code', SEQ_IN_INDEX: 1, NON_UNIQUE: 0 },
    { INDEX_NAME: 'idx_code_label', COLUMN_NAME: 'label', SEQ_IN_INDEX: 2, NON_UNIQUE: 1 },
    { INDEX_NAME: 'idx_code_label', COLUMN_NAME: 'code', SEQ_IN_INDEX: 1, NON_UNIQUE: 1 }
  ];

  assert.deepEqual(groupIndexes(rows), [
    { name: 'uq_code', nonUnique: 0, columns: ['code'] },
    { name: 'idx_code_label', nonUnique: 1, columns: ['code', 'label'] }
  ]);
  const classified = classifyIndexesUsingColumn(rows, 'code');
  assert.deepEqual(classified.droppableIndexes.map((index) => index.name), ['uq_code']);
  assert.deepEqual(classified.compositeIndexes.map((index) => index.name), ['idx_code_label']);
});

test('single-column legacy code indexes are safe to drop before the column', () => {
  const decision = buildLegacyCodeRemovalDecision({
    indexRows: [{ index_name: 'uq_code', column_name: 'code', seq_in_index: 1, non_unique: 0 }]
  });

  assert.equal(decision.safe, true);
  assert.deepEqual(decision.droppableIndexes.map((index) => index.name), ['uq_code']);
});

test('composite indexes block finalization instead of silently removing unrelated indexing', () => {
  const decision = buildLegacyCodeRemovalDecision({
    indexRows: [
      { index_name: 'idx_code_label', column_name: 'code', seq_in_index: 1 },
      { index_name: 'idx_code_label', column_name: 'label', seq_in_index: 2 }
    ]
  });

  assert.equal(decision.safe, false);
  assert.deepEqual(decision.compositeIndexes[0].columns, ['code', 'label']);
});

test('incoming or outgoing foreign keys block legacy code removal', () => {
  const decision = buildLegacyCodeRemovalDecision({
    foreignKeys: [{ name: 'fk_other_code', direction: 'incoming' }]
  });

  assert.equal(decision.safe, false);
});

test('check constraints and generated columns that reference code block finalization', () => {
  assert.equal(expressionReferencesColumn("`code` <> ''", 'code'), true);
  assert.equal(expressionReferencesColumn('decode_flag = 1', 'code'), false);

  const decision = buildLegacyCodeRemovalDecision({
    checkConstraints: [{ name: 'chk_code', expression: "code <> ''" }],
    generatedColumns: [{ name: 'code_copy', expression: 'upper(`code`)' }]
  });

  assert.equal(decision.safe, false);
  assert.equal(decision.checkConstraints.length, 1);
  assert.equal(decision.generatedColumns.length, 1);
});


test('known legacy config-value category/code uniqueness index is safe to drop during finalization', () => {
  const decision = buildLegacyCodeRemovalDecision({
    indexRows: [
      { index_name: 'uq_config_values_category_code', column_name: 'config_category_id', seq_in_index: 1, non_unique: 0 },
      { index_name: 'uq_config_values_category_code', column_name: 'code', seq_in_index: 2, non_unique: 0 }
    ],
    approvedCompositeIndexes: [
      { name: 'uq_config_values_category_code', nonUnique: 0, columns: ['config_category_id', 'code'] }
    ]
  });

  assert.equal(decision.safe, true);
  assert.deepEqual(decision.droppableIndexes.map((index) => index.name), ['uq_config_values_category_code']);
  assert.deepEqual(decision.compositeIndexes, []);
});

test('similar but unexpected composite code indexes still block finalization', () => {
  const decision = buildLegacyCodeRemovalDecision({
    indexRows: [
      { index_name: 'uq_config_values_category_code', column_name: 'code', seq_in_index: 1, non_unique: 0 },
      { index_name: 'uq_config_values_category_code', column_name: 'config_category_id', seq_in_index: 2, non_unique: 0 }
    ],
    approvedCompositeIndexes: [
      { name: 'uq_config_values_category_code', nonUnique: 0, columns: ['config_category_id', 'code'] }
    ]
  });

  assert.equal(decision.safe, false);
  assert.equal(decision.compositeIndexes.length, 1);
});
