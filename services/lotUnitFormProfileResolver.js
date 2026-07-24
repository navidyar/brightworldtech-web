'use strict';

const {
  FIELD_DEPENDENCY_RULES,
  REQUIREMENT,
  UNIT_FORM_FIELD_REGISTRY,
  VISIBILITY,
  getUnitFormFieldDefinition
} = require('../config/unitFormFieldRegistry');

const VALID_VISIBILITY_MODES = new Set(Object.values(VISIBILITY));
const VALID_REQUIREMENT_MODES = new Set(Object.values(REQUIREMENT));

class LotUnitFormProfileError extends Error {
  constructor(message, code = 'LOT_UNIT_FORM_PROFILE_INVALID') {
    super(message);
    this.name = 'LotUnitFormProfileError';
    this.code = code;
  }
}

function normalizePositiveInteger(value, label) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new LotUnitFormProfileError(`${label} must be a positive integer.`);
  }

  return normalized;
}

function normalizeLineage(lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) {
    throw new LotUnitFormProfileError('A non-empty root-to-selected lot lineage is required.');
  }

  const normalized = lineage.map((lot, index) => {
    if (!lot || typeof lot !== 'object') {
      throw new LotUnitFormProfileError(`Lot lineage entry ${index} must be an object.`);
    }

    const lotId = normalizePositiveInteger(lot.lotId ?? lot.lot_id, `Lot lineage entry ${index} lotId`);
    const rawParentLotId = lot.parentLotId ?? lot.parent_lot_id ?? null;
    const parentLotId = rawParentLotId === null
      ? null
      : normalizePositiveInteger(rawParentLotId, `Lot lineage entry ${index} parentLotId`);

    return Object.freeze({
      lotId,
      parentLotId,
      name: String(lot.name ?? lot.lotName ?? lot.lot_name ?? `Lot ${lotId}`)
    });
  });

  const seenLotIds = new Set();

  for (const [index, lot] of normalized.entries()) {
    if (seenLotIds.has(lot.lotId)) {
      throw new LotUnitFormProfileError(`Lot lineage contains duplicate or cyclic lot ID ${lot.lotId}.`);
    }

    seenLotIds.add(lot.lotId);

    if (index === 0 && lot.parentLotId !== null) {
      throw new LotUnitFormProfileError('The first lot lineage entry must be the root and have no parent.');
    }

    if (index > 0 && lot.parentLotId !== normalized[index - 1].lotId) {
      throw new LotUnitFormProfileError(
        `Lot lineage entry ${lot.lotId} must name ${normalized[index - 1].lotId} as its parent.`
      );
    }
  }

  return Object.freeze(normalized);
}

function normalizeRule(rule, lineageLotIds, seenRuleKeys, index) {
  if (!rule || typeof rule !== 'object') {
    throw new LotUnitFormProfileError(`Lot form rule ${index} must be an object.`);
  }

  const lotId = normalizePositiveInteger(rule.lotId ?? rule.lot_id, `Lot form rule ${index} lotId`);
  const fieldKey = String(rule.fieldKey ?? rule.field_key ?? '').trim();
  const visibilityMode = String(
    rule.visibilityMode ?? rule.visibility_mode ?? VISIBILITY.INHERIT
  ).trim();
  const requirementMode = String(
    rule.requirementMode ?? rule.requirement_mode ?? REQUIREMENT.INHERIT
  ).trim();

  if (!lineageLotIds.has(lotId)) {
    throw new LotUnitFormProfileError(`Lot form rule ${index} references lot ${lotId} outside the selected lineage.`);
  }

  const field = getUnitFormFieldDefinition(fieldKey);

  if (!field) {
    throw new LotUnitFormProfileError(`Lot form rule ${index} references unknown field key: ${fieldKey}`);
  }

  if (!field.enabledForLotRules) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} is protected and cannot be controlled by Lot rules.`);
  }

  if (!VALID_VISIBILITY_MODES.has(visibilityMode)) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} has invalid visibility mode: ${visibilityMode}`);
  }

  if (!VALID_REQUIREMENT_MODES.has(requirementMode)) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} has invalid requirement mode: ${requirementMode}`);
  }

  if (visibilityMode !== VISIBILITY.INHERIT && !field.visibilityConfigurable) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} does not allow visibility rules.`);
  }

  if (requirementMode !== REQUIREMENT.INHERIT && !field.requirementConfigurable) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} does not allow requirement rules.`);
  }

  if (visibilityMode === VISIBILITY.INHERIT && requirementMode === REQUIREMENT.INHERIT) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} rule stores no override; remove the row instead.`);
  }

  if (visibilityMode === VISIBILITY.HIDDEN && requirementMode === REQUIREMENT.REQUIRED) {
    throw new LotUnitFormProfileError(`Field ${fieldKey} cannot be directly configured as Hidden and Required.`);
  }

  const uniqueKey = `${lotId}:${fieldKey}`;

  if (seenRuleKeys.has(uniqueKey)) {
    throw new LotUnitFormProfileError(`Duplicate Lot form rule for lot ${lotId} and field ${fieldKey}.`);
  }

  seenRuleKeys.add(uniqueKey);

  return Object.freeze({
    lotId,
    fieldKey,
    visibilityMode,
    requirementMode
  });
}

function normalizeRules(rules, lineage) {
  if (!Array.isArray(rules)) {
    throw new LotUnitFormProfileError('Lot form rules must be an array.');
  }

  const lineageLotIds = new Set(lineage.map((lot) => lot.lotId));
  const seenRuleKeys = new Set();

  return Object.freeze(
    rules.map((rule, index) => normalizeRule(rule, lineageLotIds, seenRuleKeys, index))
  );
}

function makeSource(type, lot = null) {
  return Object.freeze({
    type,
    lotId: lot?.lotId ?? null,
    lotName: lot?.name ?? null
  });
}

function createInitialState(field) {
  return {
    field,
    resolvedVisibilityMode: field.defaultVisible ? VISIBILITY.VISIBLE : VISIBILITY.HIDDEN,
    resolvedRequirementMode: field.defaultRequired ? REQUIREMENT.REQUIRED : REQUIREMENT.OPTIONAL,
    visibilitySource: makeSource('application_default'),
    requirementSource: makeSource('application_default'),
    forcedVisibleBy: new Set(),
    forcedRequiredBy: new Set()
  };
}

function isVisible(state) {
  return state.resolvedVisibilityMode === VISIBILITY.VISIBLE || state.forcedVisibleBy.size > 0;
}

function isRequired(state) {
  return isVisible(state)
    && (state.resolvedRequirementMode === REQUIREMENT.REQUIRED || state.forcedRequiredBy.size > 0);
}

function applyDependencyRules(statesByKey, dependencyRules) {
  let changed = true;
  let passCount = 0;
  const maximumPasses = UNIT_FORM_FIELD_REGISTRY.length * 4;

  while (changed) {
    changed = false;
    passCount += 1;

    if (passCount > maximumPasses) {
      throw new LotUnitFormProfileError('Unit form field dependency resolution did not converge.');
    }

    for (const rule of dependencyRules) {
      if (rule.whenVisible) {
        const triggerState = statesByKey.get(rule.whenVisible);

        if (triggerState?.field.enabledForLotRules && isVisible(triggerState)) {
          for (const targetKey of rule.forceVisible || []) {
            const targetState = statesByKey.get(targetKey);
            const previousSize = targetState.forcedVisibleBy.size;
            targetState.forcedVisibleBy.add(rule.whenVisible);
            changed = changed || targetState.forcedVisibleBy.size !== previousSize;
          }
        }
      }

      if (rule.whenRequired) {
        const triggerState = statesByKey.get(rule.whenRequired);

        if (triggerState?.field.enabledForLotRules && isRequired(triggerState)) {
          for (const targetKey of rule.forceRequired || []) {
            const targetState = statesByKey.get(targetKey);
            const previousRequiredSize = targetState.forcedRequiredBy.size;
            const previousVisibleSize = targetState.forcedVisibleBy.size;

            targetState.forcedRequiredBy.add(rule.whenRequired);
            targetState.forcedVisibleBy.add(rule.whenRequired);

            changed = changed
              || targetState.forcedRequiredBy.size !== previousRequiredSize
              || targetState.forcedVisibleBy.size !== previousVisibleSize;
          }
        }
      }
    }
  }
}

function resolveLotUnitFormProfile({
  lineage,
  rules = [],
  registry = UNIT_FORM_FIELD_REGISTRY,
  dependencyRules = FIELD_DEPENDENCY_RULES
}) {
  if (registry !== UNIT_FORM_FIELD_REGISTRY) {
    throw new LotUnitFormProfileError('Stage 2 only resolves profiles against the authoritative Unit form registry.');
  }

  const normalizedLineage = normalizeLineage(lineage);
  const normalizedRules = normalizeRules(rules, normalizedLineage);
  const lotsById = new Map(normalizedLineage.map((lot) => [lot.lotId, lot]));
  const rulesByLotId = new Map();

  for (const rule of normalizedRules) {
    if (!rulesByLotId.has(rule.lotId)) {
      rulesByLotId.set(rule.lotId, []);
    }

    rulesByLotId.get(rule.lotId).push(rule);
  }

  const statesByKey = new Map(
    registry.map((field) => [field.key, createInitialState(field)])
  );

  for (const lot of normalizedLineage) {
    for (const rule of rulesByLotId.get(lot.lotId) || []) {
      const state = statesByKey.get(rule.fieldKey);

      if (rule.visibilityMode !== VISIBILITY.INHERIT) {
        state.resolvedVisibilityMode = rule.visibilityMode;
        state.visibilitySource = makeSource('lot_override', lotsById.get(rule.lotId));
      }

      if (rule.requirementMode !== REQUIREMENT.INHERIT) {
        state.resolvedRequirementMode = rule.requirementMode;
        state.requirementSource = makeSource('lot_override', lotsById.get(rule.lotId));
      }
    }
  }

  applyDependencyRules(statesByKey, dependencyRules);

  const fields = registry.map((field) => {
    const state = statesByKey.get(field.key);
    const visible = isVisible(state);
    const required = isRequired(state);
    const forcedVisibleBy = Object.freeze([...state.forcedVisibleBy].sort());
    const forcedRequiredBy = Object.freeze([...state.forcedRequiredBy].sort());

    return Object.freeze({
      ...field,
      resolvedVisibilityMode: state.resolvedVisibilityMode,
      resolvedRequirementMode: state.resolvedRequirementMode,
      visible,
      required,
      requiredSuppressedByHidden: !visible && state.resolvedRequirementMode === REQUIREMENT.REQUIRED,
      visibilitySource: state.visibilitySource,
      requirementSource: state.requirementSource,
      forcedVisibleBy,
      forcedRequiredBy
    });
  });

  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const selectedLot = normalizedLineage[normalizedLineage.length - 1];

  return Object.freeze({
    selectedLot,
    lineage: normalizedLineage,
    storedRuleCount: normalizedRules.length,
    fields: Object.freeze(fields),
    fieldsByKey,
    summary: Object.freeze({
      totalFields: fields.length,
      visibleFields: fields.filter((field) => field.visible).length,
      requiredFields: fields.filter((field) => field.required).length,
      hiddenFields: fields.filter((field) => !field.visible).length,
      suppressedRequiredFields: fields.filter((field) => field.requiredSuppressedByHidden).length,
      dependencyForcedFields: fields.filter(
        (field) => field.forcedVisibleBy.length > 0 || field.forcedRequiredBy.length > 0
      ).length
    })
  });
}

function getResolvedUnitFormField(profile, fieldKey) {
  if (!profile || !(profile.fieldsByKey instanceof Map)) {
    return null;
  }

  return profile.fieldsByKey.get(String(fieldKey || '').trim()) || null;
}

module.exports = {
  LotUnitFormProfileError,
  getResolvedUnitFormField,
  normalizeLineage,
  resolveLotUnitFormProfile
};
