'use strict';

function normalizeIdentifier(value) {
  return String(value || '').trim();
}

function groupIndexes(rows = []) {
  const byName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = normalizeIdentifier(row.indexName ?? row.index_name ?? row.INDEX_NAME);
    const column = normalizeIdentifier(row.columnName ?? row.column_name ?? row.COLUMN_NAME);
    if (!name || name === 'PRIMARY' || !column) continue;
    const item = byName.get(name) || { name, nonUnique: Number(row.nonUnique ?? row.non_unique ?? row.NON_UNIQUE ?? 1), columns: [] };
    item.columns.push({
      name: column,
      sequence: Number(row.sequence ?? row.seq_in_index ?? row.SEQ_IN_INDEX ?? item.columns.length + 1)
    });
    byName.set(name, item);
  }

  return Array.from(byName.values()).map((index) => ({
    name: index.name,
    nonUnique: index.nonUnique,
    columns: index.columns.sort((a, b) => a.sequence - b.sequence).map((column) => column.name)
  }));
}

function classifyIndexesUsingColumn(rows = [], columnName = 'code') {
  const target = normalizeIdentifier(columnName).toLowerCase();
  const indexes = groupIndexes(rows).filter((index) => index.columns.some((column) => column.toLowerCase() === target));
  return {
    droppableIndexes: indexes.filter((index) => index.columns.length === 1),
    compositeIndexes: indexes.filter((index) => index.columns.length > 1)
  };
}

function expressionReferencesColumn(expression, columnName = 'code') {
  const target = normalizeIdentifier(columnName);
  if (!target) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9_])(?:\\\`${target.replace(/`/g, '\\`')}\\\`|${target.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})(?:$|[^A-Za-z0-9_])`, 'i')
    .test(String(expression || ''));
}

function buildLegacyCodeRemovalDecision({
  indexRows = [],
  foreignKeys = [],
  checkConstraints = [],
  generatedColumns = [],
  columnName = 'code'
} = {}) {
  const { droppableIndexes, compositeIndexes } = classifyIndexesUsingColumn(indexRows, columnName);
  const blockingChecks = (Array.isArray(checkConstraints) ? checkConstraints : [])
    .filter((constraint) => expressionReferencesColumn(constraint.expression ?? constraint.checkClause ?? constraint.CHECK_CLAUSE, columnName));
  const blockingGeneratedColumns = (Array.isArray(generatedColumns) ? generatedColumns : [])
    .filter((column) => expressionReferencesColumn(column.expression ?? column.generationExpression ?? column.GENERATION_EXPRESSION, columnName));

  return {
    droppableIndexes,
    compositeIndexes,
    foreignKeys: Array.isArray(foreignKeys) ? foreignKeys : [],
    checkConstraints: blockingChecks,
    generatedColumns: blockingGeneratedColumns,
    safe: compositeIndexes.length === 0
      && (Array.isArray(foreignKeys) ? foreignKeys.length : 0) === 0
      && blockingChecks.length === 0
      && blockingGeneratedColumns.length === 0
  };
}

module.exports = {
  buildLegacyCodeRemovalDecision,
  classifyIndexesUsingColumn,
  expressionReferencesColumn,
  groupIndexes
};
