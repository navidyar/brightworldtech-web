'use strict';

const {
  getApplicationDefaultUnitBrowserLayout,
  getUnitBrowserColumnDefinition,
  listUnitBrowserCoreColumns
} = require('../config/unitBrowserColumnRegistry');

const RENDERABLE_OPTIONAL_KEYS = new Set([
  'grade_pass_fail',
  'qc',
  'amazon_ids',
  'amazon_logistics',
  'completion',
  'system_bios',
  'display_power',
  'security_locks',
  'comments'
]);

function normalizeOptionalColumns(layout) {
  return (Array.isArray(layout?.columns) ? layout.columns : [])
    .map((column) => {
      const key = String(column?.key || '').trim();
      const definition = getUnitBrowserColumnDefinition(key);

      if (!definition || definition.kind !== 'optional' || !RENDERABLE_OPTIONAL_KEYS.has(key)) {
        return null;
      }

      return {
        ...definition,
        isVisible: Boolean(column.isVisible),
        sortOrder: Number.isFinite(Number(column.sortOrder))
          ? Number(column.sortOrder)
          : Number.MAX_SAFE_INTEGER
      };
    })
    .filter(Boolean)
    .filter((column) => column.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.defaultOrder - b.defaultOrder || a.key.localeCompare(b.key));
}

function buildUnitBrowserLayoutPresentation(layout) {
  const coreColumns = listUnitBrowserCoreColumns();
  const leadingColumns = coreColumns.filter((column) => column.structuralRegion === 'leading');
  const trailingColumns = coreColumns.filter((column) => column.structuralRegion === 'trailing');
  const optionalColumns = normalizeOptionalColumns(layout);
  const columns = [...leadingColumns, ...optionalColumns, ...trailingColumns].map((column) => Object.freeze({
    key: column.key,
    label: column.label,
    kind: column.kind,
    minimumWidthPx: column.minimumWidthPx,
    spacingProfile: column.spacingProfile,
    valueWrapMode: column.valueWrapMode,
    growthUnits: column.growthUnits
  }));
  const tableMinimumWidthPx = columns.reduce((total, column) => total + column.minimumWidthPx, 0);
  const renderedColumnCount = columns.length;
  const unitColumnMinimumWidthPx = columns.find((column) => column.key === 'unit_weight')?.minimumWidthPx || 445;
  const secondaryGrowthUnitCount = Math.max(1, columns
    .filter((column) => column.key !== 'unit_weight')
    .reduce((total, column) => total + Number(column.growthUnits || 0), 0));

  return Object.freeze({
    source: layout?.source || null,
    columns: Object.freeze(columns),
    renderedColumnCount,
    secondaryColumnCount: Math.max(1, renderedColumnCount - 1),
    secondaryGrowthUnitCount,
    tableMinimumWidthPx,
    unitColumnMinimumWidthPx,
    layoutSignature: columns.map((column) => column.key).join('|')
  });
}

function buildApplicationDefaultUnitBrowserPresentation() {
  return buildUnitBrowserLayoutPresentation(getApplicationDefaultUnitBrowserLayout());
}

module.exports = {
  RENDERABLE_OPTIONAL_KEYS,
  buildApplicationDefaultUnitBrowserPresentation,
  buildUnitBrowserLayoutPresentation
};
