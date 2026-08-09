'use strict';

function normalizeLotId(value) {
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeLotName(lot) {
  return String(lot && (lot.lot_name || lot.name || lot.label) || '').trim() || `Lot ${normalizeLotId(lot && lot.lot_id) || ''}`.trim();
}

function buildLotExportScope(selectedLotId, lots = []) {
  const normalizedSelectedLotId = normalizeLotId(selectedLotId);

  if (!normalizedSelectedLotId) {
    return null;
  }

  const normalizedLots = (Array.isArray(lots) ? lots : [])
    .map((lot) => ({
      ...lot,
      lot_id: normalizeLotId(lot && lot.lot_id),
      parent_lot_id: normalizeLotId(lot && lot.parent_lot_id),
      lot_name: normalizeLotName(lot)
    }))
    .filter((lot) => lot.lot_id);
  const lotsById = new Map(normalizedLots.map((lot) => [lot.lot_id, lot]));
  const selectedLot = lotsById.get(normalizedSelectedLotId) || null;

  if (!selectedLot) {
    return null;
  }

  const childIdsByParentId = new Map();

  normalizedLots.forEach((lot) => {
    if (!lot.parent_lot_id) {
      return;
    }

    const childIds = childIdsByParentId.get(lot.parent_lot_id) || [];
    childIds.push(lot.lot_id);
    childIdsByParentId.set(lot.parent_lot_id, childIds);
  });

  const descendantLots = [];
  const visited = new Set([normalizedSelectedLotId]);
  const queue = [...(childIdsByParentId.get(normalizedSelectedLotId) || [])];

  while (queue.length > 0) {
    const lotId = queue.shift();

    if (visited.has(lotId)) {
      continue;
    }

    visited.add(lotId);
    const lot = lotsById.get(lotId);

    if (!lot) {
      continue;
    }

    descendantLots.push(lot);
    queue.push(...(childIdsByParentId.get(lotId) || []));
  }

  descendantLots.sort((left, right) => left.lot_name.localeCompare(right.lot_name, undefined, {
    numeric: true,
    sensitivity: 'base'
  }));

  const isChildLot = Boolean(selectedLot.parent_lot_id);
  const aggregateDescendants = !isChildLot && descendantLots.length > 0;
  const includedLots = aggregateDescendants ? descendantLots : [selectedLot];

  return {
    selectedLot,
    descendantLots,
    includedLots,
    includedLotIds: includedLots.map((lot) => lot.lot_id),
    mode: aggregateDescendants ? 'descendants' : 'single'
  };
}

module.exports = {
  buildLotExportScope,
  normalizeLotId
};
