const test = require('node:test');
const assert = require('node:assert/strict');

const {
  attachContextScores,
  createRankingSnapshot,
  serializeUsageScoresByContext,
  sortOptionsByPopularity
} = require('./operationalOptionRanking');

test('popularity sorting uses weighted score with alphabetical tie-breaking', () => {
  const snapshot = createRankingSnapshot([
    { option_scope: 'manufacturer', option_key: '2', weighted_score: 80 },
    { option_scope: 'manufacturer', option_key: '1', weighted_score: 20 },
    { option_scope: 'manufacturer', option_key: '3', weighted_score: 80 }
  ]);
  const options = [
    { id: 1, label: 'Dell' },
    { id: 2, label: 'Lenovo' },
    { id: 3, label: 'HP' },
    { id: 4, label: 'Acer' }
  ];

  assert.deepEqual(
    sortOptionsByPopularity(options, snapshot, { optionScope: 'manufacturer' }).map((option) => option.label),
    ['HP', 'Lenovo', 'Dell', 'Acer']
  );
});

test('unit model ranking is scoped to its manufacturer', () => {
  const snapshot = createRankingSnapshot([
    {
      option_scope: 'unit_model',
      option_key: '10',
      context_scope: 'manufacturer',
      context_key: '1',
      weighted_score: 100
    },
    {
      option_scope: 'unit_model',
      option_key: '11',
      context_scope: 'manufacturer',
      context_key: '1',
      weighted_score: 20
    },
    {
      option_scope: 'unit_model',
      option_key: '12',
      context_scope: 'manufacturer',
      context_key: '2',
      weighted_score: 500
    }
  ]);
  const options = [
    { id: 11, manufacturerId: 1, label: 'Model B', isActive: true },
    { id: 10, manufacturerId: 1, label: 'Model A', isActive: true },
    { id: 12, manufacturerId: 2, label: 'Model C', isActive: true }
  ];
  const sorted = sortOptionsByPopularity(options, snapshot, {
    optionScope: 'unit_model',
    getContextScope: () => 'manufacturer',
    getContextKey: (option) => option.manufacturerId,
    getGroupKey: (option) => option.manufacturerId
  });

  assert.deepEqual(sorted.map((option) => option.id), [10, 11, 12]);
});

test('inactive catalog items remain available but sort after active choices', () => {
  const snapshot = createRankingSnapshot([
    { option_scope: 'unit_model', option_key: '2', weighted_score: 1000 },
    { option_scope: 'unit_model', option_key: '1', weighted_score: 1 }
  ]);
  const options = [
    { id: 2, label: 'Old Model', isActive: false },
    { id: 1, label: 'Current Model', isActive: true }
  ];

  assert.deepEqual(
    sortOptionsByPopularity(options, snapshot, { optionScope: 'unit_model' }).map((option) => option.id),
    [1, 2]
  );
});

test('context scores are attached for client-side processor sorting', () => {
  const snapshot = createRankingSnapshot([
    {
      option_scope: 'processor_model',
      option_key: '7',
      context_scope: 'unit_model',
      context_key: '20',
      weighted_score: 77
    },
    {
      option_scope: 'processor_model',
      option_key: '7',
      context_scope: 'unit_model',
      context_key: '21',
      weighted_score: 12
    }
  ]);
  const [option] = attachContextScores([
    { id: 7, label: 'Core i5', compatibleUnitModelIds: [20, 21] }
  ], snapshot, {
    optionScope: 'processor_model',
    contextScope: 'unit_model',
    getContextKeys: (entry) => entry.compatibleUnitModelIds
  });

  assert.deepEqual(option.usageScoresByContext, { 20: 77, 21: 12 });
  assert.equal(serializeUsageScoresByContext(option.usageScoresByContext), '20:77,21:12');
});

test('missing contextual usage remains zero instead of inheriting unrelated global popularity', () => {
  const snapshot = createRankingSnapshot([
    {
      option_scope: 'processor_model',
      option_key: '7',
      context_scope: 'global',
      context_key: '0',
      weighted_score: 900
    }
  ]);
  const [option] = attachContextScores([
    { id: 7, compatibleUnitModelIds: [20] }
  ], snapshot, {
    optionScope: 'processor_model',
    contextScope: 'unit_model',
    getContextKeys: (entry) => entry.compatibleUnitModelIds
  });

  assert.deepEqual(option.usageScoresByContext, { 20: 0 });
});

test('empty ranking cache preserves canonical query order', () => {
  const options = [
    { id: 2, label: 'Second' },
    { id: 1, label: 'First' }
  ];

  assert.deepEqual(
    sortOptionsByPopularity(options, createRankingSnapshot([]), { optionScope: 'manufacturer' }),
    options
  );
});
