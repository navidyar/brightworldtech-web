'use strict';

function normalizeAssignment(row = {}) {
  return Object.freeze({
    lotLabelTemplateId: row.lotLabelTemplateId ?? row.lot_label_template_id ?? null,
    lotId: Number(row.lotId ?? row.lot_id),
    labelTemplateId: Number(row.labelTemplateId ?? row.label_template_id),
    isRequired: Number(row.isRequired ?? row.is_required ?? 0) === 1,
    defaultQuantity: Math.max(1, Math.min(10, Number(row.defaultQuantity ?? row.default_quantity ?? 1) || 1)),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 10) || 10,
    isActive: Number(row.isActive ?? row.is_active ?? 0) === 1,
    templateName: String(row.templateName ?? row.template_name ?? ''),
    templateCategoryCode: String(row.templateCategoryCode ?? row.template_category_code ?? ''),
    templateStatus: String(row.templateStatus ?? row.template_status ?? '')
  });
}

function resolveEffectiveLotLabelTemplateSet({ lineage, directSets }) {
  const safeLineage = Array.isArray(lineage) ? lineage : [];
  const setByLotId = new Map((Array.isArray(directSets) ? directSets : []).map((set) => [
    Number(set.lotId ?? set.lot_id),
    set
  ]));

  let configuredSet = null;
  let configuredLot = null;

  for (const lot of safeLineage) {
    const directSet = setByLotId.get(Number(lot.lotId));
    if (directSet) {
      configuredSet = directSet;
      configuredLot = lot;
    }
  }

  const selectedLot = safeLineage[safeLineage.length - 1] || null;
  if (!configuredSet) {
    return Object.freeze({
      lineage: Object.freeze(safeLineage.slice()),
      source: Object.freeze({ type: 'none', lotId: null, lotName: null }),
      hasDirectCustomization: false,
      assignments: Object.freeze([])
    });
  }

  const assignments = (Array.isArray(configuredSet.assignments) ? configuredSet.assignments : [])
    .map(normalizeAssignment)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.labelTemplateId - b.labelTemplateId);

  return Object.freeze({
    lineage: Object.freeze(safeLineage.slice()),
    source: Object.freeze({
      type: 'lot_override',
      lotId: Number(configuredLot.lotId),
      lotName: configuredLot.name
    }),
    hasDirectCustomization: Boolean(selectedLot && Number(selectedLot.lotId) === Number(configuredLot.lotId)),
    assignments: Object.freeze(assignments)
  });
}

function buildLotLabelTemplateBehaviorSignature(set) {
  return (Array.isArray(set?.assignments) ? set.assignments : [])
    .map((assignment) => [
      Number(assignment.labelTemplateId),
      assignment.isRequired ? 1 : 0,
      Number(assignment.defaultQuantity),
      assignment.isActive ? 1 : 0
    ].join('|'));
}

module.exports = {
  normalizeAssignment,
  resolveEffectiveLotLabelTemplateSet,
  buildLotLabelTemplateBehaviorSignature
};
