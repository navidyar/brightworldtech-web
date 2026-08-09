'use strict';

function normalizeLotId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const lotId = Number(value);
  return Number.isSafeInteger(lotId) && lotId > 0 ? lotId : null;
}

function normalizeLotRows(lots) {
  return (Array.isArray(lots) ? lots : [])
    .map((lot) => ({
      ...lot,
      lot_id: normalizeLotId(lot && (lot.lot_id ?? lot.lotId)),
      parent_lot_id: normalizeLotId(lot && (lot.parent_lot_id ?? lot.parentLotId)),
      lot_name: String(lot && (lot.lot_name ?? lot.lotName ?? lot.name) || '').trim()
    }))
    .filter((lot) => lot.lot_id !== null);
}

function buildLotMap(lots) {
  return new Map(normalizeLotRows(lots).map((lot) => [lot.lot_id, lot]));
}

function buildChildrenMap(lots) {
  const childrenByParentId = new Map();

  normalizeLotRows(lots).forEach((lot) => {
    if (lot.parent_lot_id === null) {
      return;
    }

    if (!childrenByParentId.has(lot.parent_lot_id)) {
      childrenByParentId.set(lot.parent_lot_id, []);
    }

    childrenByParentId.get(lot.parent_lot_id).push(lot.lot_id);
  });

  return childrenByParentId;
}

function collectDescendantLotIds(lots, lotId) {
  const normalizedLotId = normalizeLotId(lotId);

  if (normalizedLotId === null) {
    return [];
  }

  const childrenByParentId = buildChildrenMap(lots);
  const descendants = [];
  const visited = new Set([normalizedLotId]);
  const pending = [...(childrenByParentId.get(normalizedLotId) || [])];

  while (pending.length > 0) {
    const childLotId = pending.shift();

    if (visited.has(childLotId)) {
      continue;
    }

    visited.add(childLotId);
    descendants.push(childLotId);
    pending.push(...(childrenByParentId.get(childLotId) || []));
  }

  return descendants;
}

function createHierarchyError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  Object.assign(error, details);
  return error;
}

function validateLotParentAssignment(lots, lotId, proposedParentLotId) {
  const normalizedLots = normalizeLotRows(lots);
  const lotsById = new Map(normalizedLots.map((lot) => [lot.lot_id, lot]));
  const normalizedLotId = normalizeLotId(lotId);
  const normalizedParentLotId = normalizeLotId(proposedParentLotId);

  if (normalizedLotId === null || !lotsById.has(normalizedLotId)) {
    return {
      valid: false,
      code: 'LOT_NOT_FOUND',
      message: 'The selected Lot could not be found.'
    };
  }

  if (proposedParentLotId === null || proposedParentLotId === undefined || proposedParentLotId === '') {
    return { valid: true, code: null, message: null };
  }

  if (normalizedParentLotId === null || !lotsById.has(normalizedParentLotId)) {
    return {
      valid: false,
      code: 'LOT_PARENT_NOT_FOUND',
      message: 'The selected Parent Lot could not be found.'
    };
  }

  if (normalizedParentLotId === normalizedLotId) {
    return {
      valid: false,
      code: 'LOT_PARENT_SELF',
      message: 'A Lot cannot be its own Parent Lot.'
    };
  }

  const descendantLotIds = new Set(collectDescendantLotIds(normalizedLots, normalizedLotId));

  if (descendantLotIds.has(normalizedParentLotId)) {
    return {
      valid: false,
      code: 'LOT_PARENT_DESCENDANT',
      message: 'That Parent Lot cannot be selected because it is already a descendant of this Lot.'
    };
  }

  const visited = new Set();
  let currentLotId = normalizedParentLotId;

  while (currentLotId !== null) {
    if (visited.has(currentLotId)) {
      return {
        valid: false,
        code: 'LOT_PARENT_CHAIN_CYCLE',
        message: 'That Parent Lot cannot be selected because its existing hierarchy already contains a cycle.'
      };
    }

    visited.add(currentLotId);

    if (currentLotId === normalizedLotId) {
      return {
        valid: false,
        code: 'LOT_PARENT_DESCENDANT',
        message: 'That Parent Lot cannot be selected because it is already a descendant of this Lot.'
      };
    }

    const currentLot = lotsById.get(currentLotId);

    if (!currentLot) {
      return {
        valid: false,
        code: 'LOT_PARENT_CHAIN_MISSING',
        message: 'That Parent Lot cannot be selected because its hierarchy references a missing Lot.'
      };
    }

    currentLotId = currentLot.parent_lot_id;
  }

  return { valid: true, code: null, message: null };
}

function assertValidLotParentAssignment(lots, lotId, proposedParentLotId) {
  const validation = validateLotParentAssignment(lots, lotId, proposedParentLotId);

  if (!validation.valid) {
    throw createHierarchyError(validation.code, validation.message, {
      lotId: normalizeLotId(lotId),
      proposedParentLotId: normalizeLotId(proposedParentLotId)
    });
  }

  return true;
}

function canonicalizeCycle(cycleLotIds) {
  if (!Array.isArray(cycleLotIds) || cycleLotIds.length === 0) {
    return '';
  }

  const values = cycleLotIds.map((lotId) => String(lotId));
  const rotations = values.map((_, index) => values.slice(index).concat(values.slice(0, index)).join('>'));
  rotations.sort();
  return rotations[0];
}

function auditLotHierarchy(lots) {
  const normalizedLots = normalizeLotRows(lots);
  const lotsById = new Map(normalizedLots.map((lot) => [lot.lot_id, lot]));
  const selfReferences = [];
  const missingParents = [];
  const cycles = [];
  const cycleKeys = new Set();

  normalizedLots.forEach((lot) => {
    if (lot.parent_lot_id === lot.lot_id) {
      selfReferences.push({ lotId: lot.lot_id, lotName: lot.lot_name, parentLotId: lot.parent_lot_id });
    } else if (lot.parent_lot_id !== null && !lotsById.has(lot.parent_lot_id)) {
      missingParents.push({ lotId: lot.lot_id, lotName: lot.lot_name, parentLotId: lot.parent_lot_id });
    }
  });

  normalizedLots.forEach((startingLot) => {
    const path = [];
    const pathIndexes = new Map();
    let currentLotId = startingLot.lot_id;

    while (currentLotId !== null && lotsById.has(currentLotId)) {
      if (pathIndexes.has(currentLotId)) {
        const cycleLotIds = path.slice(pathIndexes.get(currentLotId));
        const key = canonicalizeCycle(cycleLotIds);

        if (cycleLotIds.length > 1 && key && !cycleKeys.has(key)) {
          cycleKeys.add(key);
          cycles.push({
            lotIds: cycleLotIds,
            lots: cycleLotIds.map((lotId) => {
              const lot = lotsById.get(lotId);
              return { lotId, lotName: lot?.lot_name || '' };
            })
          });
        }
        break;
      }

      pathIndexes.set(currentLotId, path.length);
      path.push(currentLotId);
      currentLotId = lotsById.get(currentLotId)?.parent_lot_id ?? null;
    }
  });

  const affectedLotIds = new Set();
  selfReferences.forEach((entry) => affectedLotIds.add(entry.lotId));
  missingParents.forEach((entry) => affectedLotIds.add(entry.lotId));
  cycles.forEach((cycle) => cycle.lotIds.forEach((lotId) => affectedLotIds.add(lotId)));

  return {
    lotCount: normalizedLots.length,
    selfReferences,
    missingParents,
    cycles,
    affectedLotIds: Array.from(affectedLotIds).sort((left, right) => left - right),
    hasIssues: affectedLotIds.size > 0
  };
}

module.exports = {
  normalizeLotId,
  normalizeLotRows,
  collectDescendantLotIds,
  validateLotParentAssignment,
  assertValidLotParentAssignment,
  auditLotHierarchy
};
