'use strict';

function normalizeLotId(value) {
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeLotName(lot) {
  return String(lot && (lot.lot_name || lot.name || lot.label) || '').trim() || `Lot ${normalizeLotId(lot && lot.lot_id) || ''}`.trim();
}

function normalizeLots(lots = []) {
  return (Array.isArray(lots) ? lots : [])
    .map((lot) => ({
      ...lot,
      lot_id: normalizeLotId(lot && lot.lot_id),
      parent_lot_id: normalizeLotId(lot && lot.parent_lot_id),
      lot_name: normalizeLotName(lot)
    }))
    .filter((lot) => lot.lot_id);
}

function buildChildIdsByParentId(lots = []) {
  const childIdsByParentId = new Map();

  lots.forEach((lot) => {
    if (!lot.parent_lot_id) {
      return;
    }

    const childIds = childIdsByParentId.get(lot.parent_lot_id) || [];
    childIds.push(lot.lot_id);
    childIdsByParentId.set(lot.parent_lot_id, childIds);
  });

  return childIdsByParentId;
}

function collectBranchLotIds(rootLotId, childIdsByParentId) {
  const normalizedRootLotId = normalizeLotId(rootLotId);

  if (!normalizedRootLotId) {
    return [];
  }

  const includedIds = [];
  const visited = new Set();
  const queue = [normalizedRootLotId];

  while (queue.length > 0) {
    const lotId = queue.shift();

    if (visited.has(lotId)) {
      continue;
    }

    visited.add(lotId);
    includedIds.push(lotId);
    queue.push(...(childIdsByParentId.get(lotId) || []));
  }

  return includedIds;
}

function buildLotExportScope(selectedLotId, lots = [], mode = 'direct') {
  const normalizedSelectedLotId = normalizeLotId(selectedLotId);

  if (!normalizedSelectedLotId) {
    return null;
  }

  const normalizedLots = normalizeLots(lots);
  const lotsById = new Map(normalizedLots.map((lot) => [lot.lot_id, lot]));
  const selectedLot = lotsById.get(normalizedSelectedLotId) || null;

  if (!selectedLot) {
    return null;
  }

  const childIdsByParentId = buildChildIdsByParentId(normalizedLots);
  const descendantLots = collectBranchLotIds(normalizedSelectedLotId, childIdsByParentId)
    .slice(1)
    .map((lotId) => lotsById.get(lotId))
    .filter(Boolean);

  descendantLots.sort((left, right) => left.lot_name.localeCompare(right.lot_name, undefined, {
    numeric: true,
    sensitivity: 'base'
  }));

  const normalizedMode = String(mode || '').trim() === 'descendants' ? 'descendants' : 'direct';
  const includedLots = normalizedMode === 'descendants'
    ? [selectedLot, ...descendantLots]
    : [selectedLot];

  return {
    selectedLot,
    descendantLots,
    includedLots,
    includedLotIds: includedLots.map((lot) => lot.lot_id),
    mode: normalizedMode
  };
}

function buildSelectedLotExportScope(rootScope, selectedScopeLotIds = []) {
  const selectedLot = rootScope && rootScope.selectedLot ? rootScope.selectedLot : null;
  const selectedLotId = normalizeLotId(selectedLot && selectedLot.lot_id);

  if (!selectedLotId) {
    return null;
  }

  const hierarchyLots = normalizeLots([
    selectedLot,
    ...(Array.isArray(rootScope.descendantLots) ? rootScope.descendantLots : [])
  ]);
  const lotsById = new Map(hierarchyLots.map((lot) => [lot.lot_id, lot]));
  const childIdsByParentId = buildChildIdsByParentId(hierarchyLots);
  const directChildLots = hierarchyLots
    .filter((lot) => lot.parent_lot_id === selectedLotId)
    .sort((left, right) => left.lot_name.localeCompare(right.lot_name, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
  const allowedScopeLotIds = new Set([selectedLotId, ...directChildLots.map((lot) => lot.lot_id)]);
  const normalizedSelectedScopeLotIds = [];
  const seen = new Set();

  (Array.isArray(selectedScopeLotIds) ? selectedScopeLotIds : [selectedScopeLotIds])
    .map(normalizeLotId)
    .filter(Boolean)
    .forEach((lotId) => {
      if (seen.has(lotId)) {
        return;
      }

      seen.add(lotId);
      normalizedSelectedScopeLotIds.push(lotId);
    });

  const invalidLotIds = normalizedSelectedScopeLotIds.filter((lotId) => !allowedScopeLotIds.has(lotId));

  if (invalidLotIds.length > 0) {
    const error = new Error('Choose only this Lot or one of its direct child branches for export.');
    error.code = 'BWT_LOT_EXPORT_SELECTION_INVALID';
    throw error;
  }

  const effectiveSelectedScopeLotIds = normalizedSelectedScopeLotIds.length > 0
    ? normalizedSelectedScopeLotIds
    : [selectedLotId];
  const includedLotIdSet = new Set();

  effectiveSelectedScopeLotIds.forEach((scopeLotId) => {
    if (scopeLotId === selectedLotId) {
      includedLotIdSet.add(selectedLotId);
      return;
    }

    collectBranchLotIds(scopeLotId, childIdsByParentId).forEach((lotId) => includedLotIdSet.add(lotId));
  });

  const includedLots = hierarchyLots.filter((lot) => includedLotIdSet.has(lot.lot_id));
  const selectedScopeLots = effectiveSelectedScopeLotIds
    .map((lotId) => lotsById.get(lotId))
    .filter(Boolean);

  return {
    ...rootScope,
    selectedLot: lotsById.get(selectedLotId) || selectedLot,
    directChildLots,
    selectedScopeLots,
    selectedScopeLotIds: effectiveSelectedScopeLotIds,
    includedLots,
    includedLotIds: includedLots.map((lot) => lot.lot_id),
    mode: 'selected'
  };
}

module.exports = {
  buildLotExportScope,
  buildSelectedLotExportScope,
  normalizeLotId
};
