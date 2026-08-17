'use strict';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeType(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeColumnList(values) {
  return (Array.isArray(values) ? values : []).map(normalizeName).filter(Boolean);
}

function evaluateBindingTableSchema(metadata = {}, spec = {}) {
  const issues = [];
  const systemColumn = normalizeName(spec.systemColumn);
  const configColumn = normalizeName(spec.configColumn);
  const referencedTable = normalizeName(spec.referencedTable);
  const referencedColumn = normalizeName(spec.referencedColumn);
  const expectedConfigColumnType = normalizeType(spec.configColumnType);
  const columns = new Map((Array.isArray(metadata.columns) ? metadata.columns : []).map((column) => [
    normalizeName(column.name ?? column.columnName ?? column.COLUMN_NAME),
    {
      type: normalizeType(column.type ?? column.columnType ?? column.COLUMN_TYPE),
      nullable: String((column.nullable ?? column.isNullable ?? column.IS_NULLABLE) || '').trim().toUpperCase() === 'YES'
    }
  ]));

  const systemDefinition = columns.get(systemColumn);
  const configDefinition = columns.get(configColumn);
  if (!systemDefinition) {
    issues.push(`missing ${systemColumn} column`);
  } else {
    if (systemDefinition.type !== 'smallint unsigned') issues.push(`${systemColumn} must be SMALLINT UNSIGNED`);
    if (systemDefinition.nullable) issues.push(`${systemColumn} must be NOT NULL`);
  }
  if (!configDefinition) {
    issues.push(`missing ${configColumn} column`);
  } else {
    if (expectedConfigColumnType && configDefinition.type !== expectedConfigColumnType) {
      issues.push(`${configColumn} type ${configDefinition.type || '(unknown)'} does not match ${expectedConfigColumnType}`);
    }
    if (configDefinition.nullable) issues.push(`${configColumn} must be NOT NULL`);
  }

  const primaryKeyColumns = normalizeColumnList(metadata.primaryKeyColumns);
  if (primaryKeyColumns.length !== 1 || primaryKeyColumns[0] !== systemColumn) {
    issues.push(`primary key must be ${systemColumn}`);
  }

  const uniqueIndexes = Array.isArray(metadata.uniqueIndexes) ? metadata.uniqueIndexes : [];
  const hasConfigUnique = uniqueIndexes.some((index) => {
    const indexColumns = normalizeColumnList(index.columns ?? index);
    return indexColumns.length === 1 && indexColumns[0] === configColumn;
  });
  if (!hasConfigUnique) issues.push(`${configColumn} must have a single-column unique index`);

  const foreignKeys = Array.isArray(metadata.foreignKeys) ? metadata.foreignKeys : [];
  const hasExpectedForeignKey = foreignKeys.some((foreignKey) => {
    const deleteRule = normalizeName(foreignKey.deleteRule ?? foreignKey.DELETE_RULE);
    const updateRule = normalizeName(foreignKey.updateRule ?? foreignKey.UPDATE_RULE);
    return normalizeName(foreignKey.columnName ?? foreignKey.COLUMN_NAME) === configColumn
      && normalizeName(foreignKey.referencedTableName ?? foreignKey.REFERENCED_TABLE_NAME) === referencedTable
      && normalizeName(foreignKey.referencedColumnName ?? foreignKey.REFERENCED_COLUMN_NAME) === referencedColumn
      && ['restrict', 'no action'].includes(deleteRule)
      && ['restrict', 'no action'].includes(updateRule);
  });
  if (!hasExpectedForeignKey) {
    issues.push(`${configColumn} must reference ${referencedTable}.${referencedColumn} with RESTRICT rules`);
  }

  return issues;
}

function evaluateProtectedColumnDefinition(definition = null) {
  if (!definition) return ['missing is_protected column'];
  const columnType = normalizeType(definition.type ?? definition.columnType ?? definition.COLUMN_TYPE);
  const isNullable = String((definition.nullable ?? definition.isNullable ?? definition.IS_NULLABLE) || '').trim().toUpperCase() === 'YES';
  const rawDefault = definition.defaultValue ?? definition.columnDefault ?? definition.COLUMN_DEFAULT;
  const defaultValue = rawDefault == null ? null : String(rawDefault).trim();
  const issues = [];
  if (!/^tinyint(?:\(1\))?$/.test(columnType)) issues.push('is_protected must be TINYINT(1)');
  if (isNullable) issues.push('is_protected must be NOT NULL');
  if (defaultValue !== '0') issues.push('is_protected must default to 0');
  return issues;
}

module.exports = {
  evaluateBindingTableSchema,
  evaluateProtectedColumnDefinition,
  normalizeType
};
