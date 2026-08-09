'use strict';

function normalizeLotId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRequirementFieldKey(requirement) {
  return String(requirement?.requirement_key || requirement?.requirementKey || '')
    .trim()
    .toLowerCase();
}

function normalizeLineageEntry(lot, index) {
  const lotId = normalizeLotId(lot?.lotId ?? lot?.lot_id);

  if (!lotId) {
    throw new Error(`Lot requirement inheritance lineage entry ${index} has an invalid Lot ID.`);
  }

  return {
    lotId,
    name: String(lot?.name || lot?.lot_name || `Lot ${lotId}`).trim() || `Lot ${lotId}`
  };
}

function annotateRequirement(requirement, sourceLot, selectedLotId, inheritanceDepth) {
  return {
    ...requirement,
    source_lot_id: sourceLot.lotId,
    source_lot_name: sourceLot.name,
    is_inherited: sourceLot.lotId === selectedLotId ? 0 : 1,
    inheritance_depth: inheritanceDepth
  };
}

function buildEffectiveLotRequirements({
  lineage = [],
  requirementGroups = [],
  selectedLotId = null
} = {}) {
  if (!Array.isArray(lineage) || !Array.isArray(requirementGroups)) {
    throw new Error('Lot requirement inheritance needs lineage and requirement groups.');
  }

  if (lineage.length !== requirementGroups.length) {
    throw new Error('Lot requirement inheritance groups must match the Lot lineage.');
  }

  if (lineage.length === 0) {
    return [];
  }

  const normalizedLineage = lineage.map(normalizeLineageEntry);
  const normalizedSelectedLotId = normalizeLotId(selectedLotId) || normalizedLineage.at(-1).lotId;
  const selectedIndex = normalizedLineage.findIndex((lot) => lot.lotId === normalizedSelectedLotId);

  if (selectedIndex !== normalizedLineage.length - 1) {
    throw new Error('The selected Lot must be the final entry in the inheritance lineage.');
  }

  const selectedRequirements = Array.isArray(requirementGroups[selectedIndex])
    ? requirementGroups[selectedIndex]
    : [];
  const selectedFieldKeys = new Set(
    selectedRequirements
      .map(normalizeRequirementFieldKey)
      .filter(Boolean)
  );
  const effectiveRequirements = [];

  // Requirement inheritance is intentionally one generation deep. A child sees
  // only its direct parent's direct requirements. Grandparent requirements do
  // not flow through the parent into the grandchild.
  if (selectedIndex > 0) {
    const parentIndex = selectedIndex - 1;
    const parentLot = normalizedLineage[parentIndex];
    const parentRequirements = Array.isArray(requirementGroups[parentIndex])
      ? requirementGroups[parentIndex]
      : [];

    parentRequirements.forEach((requirement) => {
      const fieldKey = normalizeRequirementFieldKey(requirement);

      // Any direct rule for the same field converts that field to a child-specific
      // configuration. Parent rules for that field stop applying until all child
      // rules for the field are removed.
      if (fieldKey && selectedFieldKeys.has(fieldKey)) {
        return;
      }

      effectiveRequirements.push(
        annotateRequirement(requirement, parentLot, normalizedSelectedLotId, 1)
      );
    });
  }

  const selectedLot = normalizedLineage[selectedIndex];
  selectedRequirements.forEach((requirement) => {
    effectiveRequirements.push(
      annotateRequirement(requirement, selectedLot, normalizedSelectedLotId, 0)
    );
  });

  return effectiveRequirements;
}

module.exports = {
  buildEffectiveLotRequirements
};
