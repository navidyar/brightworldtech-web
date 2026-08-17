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

function normalizeApprovedCompositeIndexes(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    name: normalizeIdentifier(item?.name).toLowerCase(),
    nonUnique: Number(item?.nonUnique ?? item?.non_unique ?? 1),
    columns: (Array.isArray(item?.columns) ? item.columns : []).map((column) => normalizeIdentifier(column).toLowerCase())
  }));
}

function isApprovedCompositeIndex(index, approved = []) {
  const expected = normalizeApprovedCompositeIndexes(approved);
  const actualName = normalizeIdentifier(index?.name).toLowerCase();
  const actualNonUnique = Number(index?.nonUnique ?? 1);
  const actualColumns = (Array.isArray(index?.columns) ? index.columns : []).map((column) => normalizeIdentifier(column).toLowerCase());

  return expected.some((item) => item.name === actualName
    && item.nonUnique === actualNonUnique
    && item.columns.length === actualColumns.length
    && item.columns.every((column, indexPosition) => column === actualColumns[indexPosition]));
}

function buildLegacyCodeRemovalDecision({
  indexRows = [],
  foreignKeys = [],
  checkConstraints = [],
  generatedColumns = [],
  approvedCompositeIndexes = [],
  columnName = 'code'
} = {}) {
  const classified = classifyIndexesUsingColumn(indexRows, columnName);
  const approvedComposite = classified.compositeIndexes
    .filter((index) => isApprovedCompositeIndex(index, approvedCompositeIndexes));
  const compositeIndexes = classified.compositeIndexes
    .filter((index) => !isApprovedCompositeIndex(index, approvedCompositeIndexes));
  const droppableIndexes = [...classified.droppableIndexes, ...approvedComposite];
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
  isApprovedCompositeIndex,
  expressionReferencesColumn,
  groupIndexes
};
