'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  SYSTEM_CONFIG_CATEGORY_IDS
} = require('../config/configIdentityRegistry');
const { planConfigIdentityBindings } = require('./configIdentityMigrationPlanner');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Lot modal config lookup tolerates config_categories schemas without a name column', () => {
  const source = read('models/lotModel.js');
  const functionSource = source.match(/async function listConfigValuesForSystemCategory[\s\S]*?\n}\n/)?.[0] || '';

  assert.match(functionSource, /getColumnSet\('config_categories'\)/);
  assert.match(functionSource, /selectExpression\([\s\S]*?\['label', 'name'\][\s\S]*?'category_label'/);
  assert.match(functionSource, /\$\{categoryLabelSelect\}/);
  assert.doesNotMatch(functionSource, /COALESCE\(cc\.label, cc\.name/);
});

test('Per-user modal lookup does not GROUP BY a removed can_delete_pending_setup SQL alias', () => {
  const source = read('models/managementModel.js');
  const functionSource = source.match(/async function getUserById[\s\S]*?\n}\n/)?.[0] || '';
  const groupBySource = functionSource.match(/GROUP BY[\s\S]*?LIMIT 1/)?.[0] || '';

  assert.ok(groupBySource, 'Expected getUserById GROUP BY query to be present.');
  assert.doesNotMatch(groupBySource, /can_delete_pending_setup/);
  assert.match(functionSource, /return rows\[0\] \? mapUserRow\(rows\[0\]\) : null/);
});

test('Lot Requirement Policies resolves the legacy requirement_policies category during compatibility migration', () => {
  const plan = planConfigIdentityBindings({
    categories: [{ id: 77, code: 'requirement_policies' }],
    values: [],
    persistedCategoryBindings: new Map(),
    persistedValueBindings: new Map()
  });

  assert.equal(plan.resolvedCategories.get(SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES), 77);
  assert.equal(
    plan.missingCategories.some((entry) => entry.systemId === SYSTEM_CONFIG_CATEGORY_IDS.LOT_REQUIREMENT_POLICIES),
    false
  );
});
