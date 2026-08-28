'use strict';

const {
  getApplicationDefaultUnitBrowserLayout,
  getUnitBrowserColumnDefinition,
  listUnitBrowserOptionalColumns
} = require('../config/unitBrowserColumnRegistry');

function normalizeStoredColumns(storedColumns) {
  const optionalDefinitions = listUnitBrowserOptionalColumns();
  const storedByKey = new Map();

  for (const row of Array.isArray(storedColumns) ? storedColumns : []) {
    const key = String(row?.columnKey || row?.column_key || '').trim();
    const definition = getUnitBrowserColumnDefinition(key);

    if (!definition || definition.kind !== 'optional' || storedByKey.has(key)) {
      continue;
    }

    storedByKey.set(key, {
      key,
      label: definition.label,
      isVisible: Number(row?.isVisible ?? row?.is_visible ?? 0) === 1,
      sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? Number.MAX_SAFE_INTEGER),
      minimumWidthPx: definition.minimumWidthPx,
      description: definition.description
    });
  }

  const knownStored = [...storedByKey.values()].sort((a, b) => (
    a.sortOrder - b.sortOrder
    || a.key.localeCompare(b.key)
  ));
  const missing = optionalDefinitions
    .filter((definition) => !storedByKey.has(definition.key))
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      isVisible: false,
      sortOrder: Number.MAX_SAFE_INTEGER - 1000 + definition.defaultOrder,
      minimumWidthPx: definition.minimumWidthPx,
      description: definition.description
    }));

  return [...knownStored, ...missing].map((column, index) => Object.freeze({
    ...column,
    sortOrder: (index + 1) * 10
  }));
}

function resolveEffectiveLotUnitBrowserLayout({ lineage, layouts }) {
  const safeLineage = Array.isArray(lineage) ? lineage : [];
  const safeLayouts = Array.isArray(layouts) ? layouts : [];
  const layoutByLotId = new Map(
    safeLayouts.map((layout) => [Number(layout.lotId ?? layout.lot_id), layout])
  );
  let configuredLayout = null;
  let configuredLot = null;

  for (const lot of safeLineage) {
    const directLayout = layoutByLotId.get(Number(lot.lotId));
    if (directLayout) {
      configuredLayout = directLayout;
      configuredLot = lot;
    }
  }

  if (!configuredLayout) {
    const applicationDefault = getApplicationDefaultUnitBrowserLayout();
    return Object.freeze({
      lineage: Object.freeze(safeLineage.slice()),
      source: applicationDefault.source,
      hasDirectCustomization: false,
      columns: applicationDefault.columns
    });
  }

  const selectedLot = safeLineage[safeLineage.length - 1] || null;
  return Object.freeze({
    lineage: Object.freeze(safeLineage.slice()),
    source: Object.freeze({
      type: 'lot_override',
      lotId: Number(configuredLot.lotId),
      lotName: configuredLot.name
    }),
    hasDirectCustomization: Boolean(selectedLot && Number(selectedLot.lotId) === Number(configuredLot.lotId)),
    columns: Object.freeze(normalizeStoredColumns(configuredLayout.columns))
  });
}

function buildUnitBrowserLayoutBehaviorSignature(layout) {
  return (Array.isArray(layout?.columns) ? layout.columns : [])
    .map((column) => `${column.key}|${column.isVisible ? 'visible' : 'hidden'}`);
}

module.exports = {
  buildUnitBrowserLayoutBehaviorSignature,
  normalizeStoredColumns,
  resolveEffectiveLotUnitBrowserLayout
};
