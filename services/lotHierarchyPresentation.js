'use strict';

const LOT_PATH_SEPARATOR = ' › ';

function normalizePositiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function lotIdOf(lot) {
  return normalizePositiveId(lot && (lot.lot_id ?? lot.lotId ?? lot.value ?? lot.id));
}

function parentLotIdOf(lot) {
  return normalizePositiveId(lot && (lot.parent_lot_id ?? lot.parentLotId));
}

function lotNameOf(lot) {
  const id = lotIdOf(lot);
  return String(lot && (lot.lot_name ?? lot.lotName ?? lot.label ?? lot.name) || '').trim()
    || (id ? `Lot #${id}` : 'Lot');
}

function isVisibleLot(lot) {
  if (!lot || lot.is_active === undefined || lot.is_active === null) return true;
  return Number(lot.is_active) === 1;
}

function compareLotNames(left, right) {
  return lotNameOf(left).localeCompare(lotNameOf(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function buildLotMap(lots = []) {
  const map = new Map();
  (Array.isArray(lots) ? lots : []).forEach((lot) => {
    const id = lotIdOf(lot);
    if (id) map.set(id, lot);
  });
  return map;
}

function buildPathForLotId(lotId, lotMap, options = {}) {
  const safeId = normalizePositiveId(lotId);
  if (!safeId || !(lotMap instanceof Map)) return [];

  const includeInactiveAncestors = options.includeInactiveAncestors === true;
  const chain = [];
  const visited = new Set();
  let cursorId = safeId;

  while (cursorId && !visited.has(cursorId) && chain.length < 100) {
    visited.add(cursorId);
    const lot = lotMap.get(cursorId);
    if (!lot) break;

    const isLeaf = cursorId === safeId;
    if (!isLeaf && !includeInactiveAncestors && !isVisibleLot(lot)) break;

    chain.push(lot);
    cursorId = parentLotIdOf(lot);
  }

  return chain.reverse();
}

function makePresentation(pathLots, selectable, sourceLot = null) {
  const pathIds = pathLots.map(lotIdOf).filter(Boolean);
  const pathNames = pathLots.map(lotNameOf);
  const lot = sourceLot || pathLots[pathLots.length - 1] || null;
  const lotId = lotIdOf(lot);
  const lotName = lotNameOf(lot);
  const compactNames = pathNames.slice(-2);

  return {
    lotId,
    lotName,
    parentLotId: parentLotIdOf(lot),
    depth: Math.max(pathNames.length - 1, 0),
    selectable: Boolean(selectable),
    pathIds,
    pathNames,
    fullPath: pathNames.join(LOT_PATH_SEPARATOR),
    compactLabel: compactNames.join(LOT_PATH_SEPARATOR) || lotName,
    searchText: pathNames.join(' '),
    sourceLot: lot
  };
}

function buildLotHierarchyOptions(allLots = [], selectableLots = [], options = {}) {
  const lotMap = buildLotMap(allLots);
  const selectableMap = new Map();
  (Array.isArray(selectableLots) ? selectableLots : []).forEach((lot) => {
    const id = lotIdOf(lot);
    if (id) selectableMap.set(id, lot);
  });

  const relevantIds = new Set();
  selectableMap.forEach((_lot, id) => {
    const path = buildPathForLotId(id, lotMap, options);
    path.forEach((pathLot) => {
      const pathId = lotIdOf(pathLot);
      if (pathId) relevantIds.add(pathId);
    });
    if (!lotMap.has(id)) relevantIds.add(id);
  });

  const relevantLots = new Map();
  relevantIds.forEach((id) => {
    const lot = lotMap.get(id) || selectableMap.get(id);
    if (lot) relevantLots.set(id, lot);
  });

  const childrenByParent = new Map();
  const roots = [];
  relevantLots.forEach((lot, id) => {
    const parentId = parentLotIdOf(lot);
    if (parentId && relevantLots.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(lot);
    } else {
      roots.push(lot);
    }
  });

  roots.sort(compareLotNames);
  childrenByParent.forEach((children) => children.sort(compareLotNames));

  const entries = [];
  const visit = (lot, path = [], visited = new Set()) => {
    const id = lotIdOf(lot);
    if (!id || visited.has(id)) return;

    const nextVisited = new Set(visited);
    nextVisited.add(id);
    const nextPath = [...path, lot];
    const sourceLot = selectableMap.get(id) || lot;
    entries.push(makePresentation(nextPath, selectableMap.has(id), sourceLot));

    (childrenByParent.get(id) || []).forEach((child) => visit(child, nextPath, nextVisited));
  };

  roots.forEach((root) => visit(root));

  // Keep an orphan selectable value usable even if its hierarchy could not be resolved.
  selectableMap.forEach((lot, id) => {
    if (!entries.some((entry) => entry.lotId === id)) {
      entries.push(makePresentation([lot], true, lot));
    }
  });

  return entries;
}

function buildLotHierarchyLookup(allLots = [], options = {}) {
  const lotMap = buildLotMap(allLots);
  const lookup = new Map();

  lotMap.forEach((lot, id) => {
    const path = buildPathForLotId(id, lotMap, options);
    lookup.set(id, makePresentation(path.length ? path : [lot], true, lot));
  });

  return lookup;
}

function snapshotLotPath(allLots = [], lotId, options = {}) {
  const lookup = buildLotHierarchyLookup(allLots, { ...options, includeInactiveAncestors: true });
  const presentation = lookup.get(normalizePositiveId(lotId));
  if (!presentation) return null;

  return {
    ids: presentation.pathIds,
    labels: presentation.pathNames
  };
}

function resolveSnapshotPath(snapshot, currentNameById = new Map()) {
  if (!snapshot || !Array.isArray(snapshot.ids) || snapshot.ids.length === 0) return '';
  const labels = Array.isArray(snapshot.labels) ? snapshot.labels : [];
  return snapshot.ids.map((id, index) => {
    const safeId = normalizePositiveId(id);
    return (safeId && currentNameById instanceof Map && currentNameById.get(safeId))
      || String(labels[index] || '').trim()
      || (safeId ? `Lot #${safeId}` : 'Lot');
  }).join(LOT_PATH_SEPARATOR);
}

module.exports = {
  LOT_PATH_SEPARATOR,
  buildLotHierarchyLookup,
  buildLotHierarchyOptions,
  buildLotMap,
  buildPathForLotId,
  lotIdOf,
  lotNameOf,
  parentLotIdOf,
  resolveSnapshotPath,
  snapshotLotPath
};
