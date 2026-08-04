'use strict';

const { formatHardwareCapacityGb } = require('./hardwareCapacity');

const {
  getLotRequirementField,
  getLotRequirementOperator,
  normalizeOperatorCode,
  normalizeRequirementKey
} = require('../config/lotRequirementRegistry');

const {
  buildLotAssignmentSignature
} = require('./lotValidationOverridePolicy');

const IDENTIFIER_CODE_ALIASES = Object.freeze({
  unit_serial: 'unit_serial_number',
  bios_serial: 'bios_serial_number'
});

function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIdentifierCode(value) {
  const code = String(value || '').trim();
  return IDENTIFIER_CODE_ALIASES[code] || code;
}

function ensureAssetTagPrefix(value, prefix = 'BWT') {
  const normalizedValue = String(value || '').trim();
  const normalizedPrefix = String(prefix || 'BWT').trim() || 'BWT';

  if (!normalizedValue) {
    return '';
  }

  const withoutExistingPrefix = normalizedValue.replace(/^bwt[\s_-]*/i, '');

  return `${normalizedPrefix}${withoutExistingPrefix}`;
}

function formatAssetTag(assetNumber, prefix = 'BWT') {
  const normalizedAssetNumber = asPositiveInteger(assetNumber);

  return normalizedAssetNumber ? ensureAssetTagPrefix(normalizedAssetNumber, prefix) : '';
}

function joinUniqueLabels(values) {
  const seen = new Set();
  const labels = [];

  values.forEach((value) => {
    const label = String(value || '').trim();
    const key = label.toLowerCase();

    if (label && !seen.has(key)) {
      seen.add(key);
      labels.push(label);
    }
  });

  return labels;
}

function parseIntegerList(value) {
  return String(value || '')
    .split(',')
    .map((item) => asPositiveInteger(item))
    .filter(Boolean);
}

function parseLabelList(value) {
  return String(value || '')
    .split('||')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function createCatalogActual({ ids = [], labels = [], sourceLabel }) {
  const normalizedIds = [...new Set(ids.map(asPositiveInteger).filter(Boolean))];
  const normalizedLabels = joinUniqueLabels(labels);

  return {
    kind: 'catalog',
    isSupported: true,
    ids: normalizedIds,
    numberValue: null,
    displayValue: normalizedLabels.join(', '),
    sourceLabel: sourceLabel || 'Unit record'
  };
}

function createNumberActual({ value, sourceLabel, suffix = '', formatter = null }) {
  const numericValue = asFiniteNumber(value);

  return {
    kind: 'number',
    isSupported: true,
    ids: [],
    numberValue: numericValue,
    displayValue: numericValue === null ? '' : (formatter ? formatter(numericValue) : `${numericValue}${suffix}`),
    sourceLabel: sourceLabel || 'Unit record'
  };
}

function createUnsupportedActual(message) {
  return {
    kind: 'unsupported',
    isSupported: false,
    ids: [],
    numberValue: null,
    displayValue: '',
    sourceLabel: '',
    unsupportedMessage: message || 'This requirement cannot be evaluated from the current unit data.'
  };
}

function groupRowsByUnit(rows) {
  const grouped = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const unitId = asPositiveInteger(row.unit_id);

    if (!unitId) {
      return;
    }

    if (!grouped.has(unitId)) {
      grouped.set(unitId, []);
    }

    grouped.get(unitId).push(row);
  });

  return grouped;
}

function buildIdentifierMap(identifierRows) {
  const identifiersByUnit = groupRowsByUnit(identifierRows);
  const result = new Map();

  identifiersByUnit.forEach((rows, unitId) => {
    const byCode = new Map();

    rows.forEach((row) => {
      const code = normalizeIdentifierCode(row.identifier_type_code);
      const value = String(row.identifier_value || '').trim();

      if (!code || !value) {
        return;
      }

      const existing = byCode.get(code);
      const rowIsPrimary = Number(row.is_primary || 0) === 1;
      const existingIsPrimary = Number(existing?.is_primary || 0) === 1;

      if (!existing || (rowIsPrimary && !existingIsPrimary)) {
        byCode.set(code, row);
      }
    });

    result.set(unitId, byCode);
  });

  return result;
}

function buildIdentity(baseRow, identifierMap) {
  const assetTagIdentifier = String(identifierMap?.get('asset_tag')?.identifier_value || '').trim();
  const assetTag = assetTagIdentifier
    ? ensureAssetTagPrefix(assetTagIdentifier)
    : formatAssetTag(baseRow.asset_number);
  const unitSerial = String(identifierMap?.get('unit_serial_number')?.identifier_value || '').trim();
  const biosSerial = String(identifierMap?.get('bios_serial_number')?.identifier_value || '').trim();
  const fallbackUnitId = asPositiveInteger(baseRow.unit_id);
  const label = assetTag || unitSerial || biosSerial || (fallbackUnitId ? `Unit #${fallbackUnitId}` : 'Unit');
  const modelLabel = String(baseRow.model_display_label || '').trim();
  const secondaryParts = [];

  if (modelLabel) {
    secondaryParts.push(modelLabel);
  }

  if (unitSerial && unitSerial !== label) {
    secondaryParts.push(`Unit Serial: ${unitSerial}`);
  }

  if (biosSerial && biosSerial !== label) {
    secondaryParts.push(`BIOS: ${biosSerial}`);
  }

  if (secondaryParts.length === 0 && assetTag && assetTag !== label) {
    secondaryParts.push(`Asset Tag: ${assetTag}`);
  }

  return {
    assetTag,
    unitSerial,
    biosSerial,
    label,
    subLabel: secondaryParts.join(' · ') || 'No secondary identifiers recorded'
  };
}


function buildTechnicianActivityMap(technicianRows) {
  const grouped = groupRowsByUnit(technicianRows);
  const result = new Map();

  grouped.forEach((rows, unitId) => {
    const byUserId = new Map();

    rows.forEach((row) => {
      const userId = asPositiveInteger(row.user_id);
      const firstName = String(row.first_name || '').trim();
      const lastName = String(row.last_name || '').trim();
      const displayName = `${firstName} ${lastName}`.trim() || (userId ? `User ${userId}` : 'Unknown technician');

      if (!userId) {
        return;
      }

      const existing = byUserId.get(userId) || {
        userId,
        displayName,
        completedUnit: false,
        workSessionCount: 0,
        latestActivityAt: null
      };

      if (row.activity_type === 'completion') {
        existing.completedUnit = true;
      }

      if (row.activity_type === 'work_session') {
        existing.workSessionCount += 1;
      }

      if (row.activity_at && (!existing.latestActivityAt || new Date(row.activity_at) > new Date(existing.latestActivityAt))) {
        existing.latestActivityAt = row.activity_at;
      }

      byUserId.set(userId, existing);
    });

    const technicians = [...byUserId.values()]
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

    result.set(unitId, technicians);
  });

  return result;
}

function buildTechnicianSummary(technicians) {
  const safeTechnicians = Array.isArray(technicians) ? technicians : [];

  return safeTechnicians.length > 0
    ? safeTechnicians.map((technician) => technician.displayName).join(', ')
    : 'No technician activity recorded';
}

function buildAssignedTechnician(baseRow = {}) {
  const userId = asPositiveInteger(baseRow.assigned_to_user_id);

  if (!userId) {
    return null;
  }

  const firstName = String(baseRow.assigned_first_name || '').trim();
  const lastName = String(baseRow.assigned_last_name || '').trim();
  const email = String(baseRow.assigned_email || '').trim();
  const displayName = `${firstName} ${lastName}`.trim() || email || `User ${userId}`;

  return {
    userId,
    displayName
  };
}

function buildTechnicianDisplaySummary(assignedTechnician, technicians) {
  const safeTechnicians = Array.isArray(technicians) ? technicians : [];

  if (assignedTechnician) {
    const additionalActivityNames = safeTechnicians
      .filter((technician) => Number(technician.userId) !== Number(assignedTechnician.userId))
      .map((technician) => technician.displayName);

    if (additionalActivityNames.length > 0) {
      return `${assignedTechnician.displayName} (assigned); activity by ${additionalActivityNames.join(', ')}`;
    }

    return assignedTechnician.displayName;
  }

  if (safeTechnicians.length > 0) {
    return safeTechnicians.map((technician) => technician.displayName).join(', ');
  }

  return 'Unassigned';
}

function buildCurrentMemoryActual(baseRow, memoryRows) {
  const meaningfulRows = (memoryRows || []).filter((row) => (
    row.size_gb !== null && row.size_gb !== undefined && asFiniteNumber(row.size_gb) >= 0
  ));

  if (meaningfulRows.length > 0) {
    const totalGb = meaningfulRows.reduce((total, row) => total + Number(row.size_gb), 0);
    const typeRows = meaningfulRows.filter((row) => (
      asFiniteNumber(row.size_gb) > 0 && asPositiveInteger(row.ram_type_config_value_id)
    ));

    return {
      total: createNumberActual({
        value: totalGb,
        sourceLabel: 'Current memory modules',
        formatter: formatHardwareCapacityGb
      }),
      type: createCatalogActual({
        ids: typeRows.map((row) => row.ram_type_config_value_id),
        labels: typeRows.map((row) => row.ram_type_label || row.ram_type_code),
        sourceLabel: 'Current memory modules'
      })
    };
  }

  return {
    total: createNumberActual({
      value: baseRow.ram_gb,
      sourceLabel: 'Unit memory summary',
      formatter: formatHardwareCapacityGb
    }),
    type: createCatalogActual({
      ids: [baseRow.ram_type_config_value_id],
      labels: [baseRow.ram_type_label || baseRow.ram_type_code],
      sourceLabel: 'Unit memory summary'
    })
  };
}

function buildCurrentStorageActual(baseRow, storageRows) {
  const meaningfulRows = (storageRows || []).filter((row) => (
    row.size_gb !== null && row.size_gb !== undefined && asFiniteNumber(row.size_gb) >= 0
  ));

  if (meaningfulRows.length > 0) {
    const totalGb = meaningfulRows.reduce((total, row) => total + Number(row.size_gb), 0);
    const typeRows = meaningfulRows.filter((row) => (
      asFiniteNumber(row.size_gb) > 0 && asPositiveInteger(row.storage_type_config_value_id)
    ));

    return {
      total: createNumberActual({
        value: totalGb,
        sourceLabel: 'Current storage devices',
        formatter: formatHardwareCapacityGb
      }),
      type: createCatalogActual({
        ids: typeRows.map((row) => row.storage_type_config_value_id),
        labels: typeRows.map((row) => row.storage_type_label || row.storage_type_code),
        sourceLabel: 'Current storage devices'
      })
    };
  }

  return {
    total: createNumberActual({
      value: baseRow.storage_gb,
      sourceLabel: 'Unit storage summary',
      formatter: formatHardwareCapacityGb
    }),
    type: createCatalogActual({
      ids: [baseRow.storage_type_config_value_id],
      labels: [baseRow.storage_type_label || baseRow.storage_type_code],
      sourceLabel: 'Unit storage summary'
    })
  };
}

function buildUnitSnapshots({
  baseRows = [],
  identifierRows = [],
  memoryRows = [],
  storageRows = [],
  technicianRows = []
} = {}) {
  const identifiersByUnit = buildIdentifierMap(identifierRows);
  const memoryByUnit = groupRowsByUnit(memoryRows);
  const storageByUnit = groupRowsByUnit(storageRows);
  const techniciansByUnit = buildTechnicianActivityMap(technicianRows);

  return (Array.isArray(baseRows) ? baseRows : []).map((baseRow) => {
    const unitId = asPositiveInteger(baseRow.unit_id);
    const identity = buildIdentity(baseRow, identifiersByUnit.get(unitId));
    const memory = buildCurrentMemoryActual(baseRow, memoryByUnit.get(unitId));
    const storage = buildCurrentStorageActual(baseRow, storageByUnit.get(unitId));
    const technicians = techniciansByUnit.get(unitId) || [];
    const assignedTechnician = buildAssignedTechnician(baseRow);

    return {
      unitId,
      assetNumber: asPositiveInteger(baseRow.asset_number),
      lotId: asPositiveInteger(baseRow.lot_id),
      lotAssignmentSignature: asPositiveInteger(baseRow.lot_id)
        ? buildLotAssignmentSignature({
            unitId,
            lotId: baseRow.lot_id,
            latestLotHistoryId: baseRow.latest_lot_history_id,
            latestLotMovedAt: baseRow.latest_lot_moved_at,
            unitCreatedAt: baseRow.created_at
          })
        : '',
      ...identity,
      assignedTechnician,
      technicians,
      activityTechnicianSummary: buildTechnicianSummary(technicians),
      technicianSummary: buildTechnicianDisplaySummary(assignedTechnician, technicians),
      valuesByKey: {
        unit_type: createCatalogActual({
          ids: [baseRow.unit_category_config_value_id],
          labels: [baseRow.unit_category_label || baseRow.unit_category_code],
          sourceLabel: 'Unit category'
        }),
        manufacturer: createCatalogActual({
          ids: [baseRow.manufacturer_id],
          labels: [baseRow.manufacturer_name],
          sourceLabel: 'Manufacturer'
        }),
        model: createCatalogActual({
          ids: [baseRow.unit_model_id],
          labels: [baseRow.model_display_label || baseRow.model_name],
          sourceLabel: 'Unit model'
        }),
        processor: createCatalogActual({
          ids: [baseRow.processor_model_id],
          labels: [baseRow.processor_display_label || baseRow.processor_model_code],
          sourceLabel: 'Processor model'
        }),
        processor_family: createCatalogActual({
          ids: parseIntegerList(baseRow.processor_family_ids),
          labels: parseLabelList(baseRow.processor_family_labels),
          sourceLabel: 'Processor family membership'
        }),
        ram_gb: memory.total,
        ram_type: memory.type,
        storage_gb: storage.total,
        storage_type: storage.type,
        battery_health: createNumberActual({
          value: baseRow.battery_health_percent,
          sourceLabel: 'Unit battery health',
          suffix: '%'
        })
      }
    };
  });
}

function getRequiredCatalogId(requirement, storageKind) {
  const columnByStorageKind = {
    config_value: 'requirement_config_value_id',
    manufacturer: 'manufacturer_id',
    unit_model: 'unit_model_id',
    processor_model: 'processor_model_id',
    processor_family: 'processor_family_id'
  };
  const columnName = columnByStorageKind[storageKind];

  return columnName ? asPositiveInteger(requirement[columnName]) : null;
}

function getStatusLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'accepted_override') return 'Accepted by Management';
  if (status === 'rejected') return 'Rejected';
  if (status === 'needs_review') return 'Needs Review';
  if (status === 'open') return 'Open';
  return 'Unknown';
}

function evaluateRequirement(unitSnapshot, requirement) {
  const requirementKey = normalizeRequirementKey(requirement.requirement_key);
  const operatorCode = normalizeOperatorCode(requirement.operator_code || 'equals');
  const field = getLotRequirementField(requirementKey);
  const operator = getLotRequirementOperator(operatorCode);
  const actual = unitSnapshot.valuesByKey[requirementKey] || createUnsupportedActual();
  const baseCheck = {
    requirementId: asPositiveInteger(requirement.lot_requirement_id),
    requirementKey,
    requirementLabel: requirement.requirement_label || field?.label || requirementKey,
    operatorCode,
    operatorLabel: requirement.operator_label || operator?.label || operatorCode,
    requiredValue: String(requirement.required_value || '').trim(),
    actualValue: actual.displayValue || '—',
    sourceLabel: actual.sourceLabel || '—'
  };

  if (!field || !operator) {
    return {
      ...baseCheck,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: 'This stored requirement type or rule is not supported.'
    };
  }

  if (!actual.isSupported) {
    return {
      ...baseCheck,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: actual.unsupportedMessage
    };
  }

  if (field.storageKind === 'number') {
    const requiredNumber = asFiniteNumber(requirement.requirement_number);
    const unitSuffix = String(field.unitSuffix || '');
    const formatRequirementNumber = (value) => unitSuffix.trim() === 'GB'
      ? formatHardwareCapacityGb(value)
      : `${formatNumber(value)}${unitSuffix}`;
    const actualNumber = actual.numberValue;

    if (requiredNumber === null) {
      return {
        ...baseCheck,
        passed: false,
        status: 'needs_review',
        statusLabel: getStatusLabel('needs_review'),
        message: 'This requirement is missing its configured numeric value.'
      };
    }

    if (actualNumber === null) {
      return {
        ...baseCheck,
        passed: false,
        status: 'rejected',
        statusLabel: getStatusLabel('rejected'),
        message: `The unit has no recorded ${field.label.toLowerCase()} value.`
      };
    }

    let passed = false;

    if (operatorCode === 'greater_equal') passed = actualNumber >= requiredNumber;
    else if (operatorCode === 'less_equal') passed = actualNumber <= requiredNumber;
    else passed = actualNumber === requiredNumber;

    const expectedText = operatorCode === 'greater_equal'
      ? `at least ${formatRequirementNumber(requiredNumber)}`
      : operatorCode === 'less_equal'
        ? `at most ${formatRequirementNumber(requiredNumber)}`
        : formatRequirementNumber(requiredNumber);

    return {
      ...baseCheck,
      passed,
      status: passed ? 'accepted' : 'rejected',
      statusLabel: getStatusLabel(passed ? 'accepted' : 'rejected'),
      message: passed
        ? `${field.label} meets the requirement.`
        : `Expected ${expectedText}; found ${formatRequirementNumber(actualNumber)}.`
    };
  }

  const requiredId = getRequiredCatalogId(requirement, field.storageKind);

  if (!requiredId) {
    return {
      ...baseCheck,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: 'This requirement is missing its configured catalog value.'
    };
  }

  if (actual.ids.length === 0) {
    return {
      ...baseCheck,
      passed: false,
      status: 'rejected',
      statusLabel: getStatusLabel('rejected'),
      message: `The unit has no recorded ${field.label.toLowerCase()} value.`
    };
  }

  const passed = actual.ids.includes(requiredId);

  return {
    ...baseCheck,
    passed,
    status: passed ? 'accepted' : 'rejected',
    statusLabel: getStatusLabel(passed ? 'accepted' : 'rejected'),
    message: passed
      ? `${field.label} matches the requirement.`
      : `Expected ${baseCheck.requiredValue || `catalog value ${requiredId}`}; found ${baseCheck.actualValue}.`
  };
}

function joinAlternativeValues(values) {
  const uniqueValues = joinUniqueLabels(values);

  if (uniqueValues.length <= 1) {
    return uniqueValues[0] || '';
  }

  return `${uniqueValues.slice(0, -1).join(', ')} or ${uniqueValues.at(-1)}`;
}

function getRequirementGroupKey(requirementKey) {
  const normalizedKey = normalizeRequirementKey(requirementKey);
  return ['processor', 'processor_family'].includes(normalizedKey)
    ? 'processor_match'
    : normalizedKey;
}

function groupRequirementsByField(requirements) {
  const groups = new Map();

  requirements.forEach((requirement) => {
    const requirementKey = normalizeRequirementKey(requirement.requirement_key);
    const groupKey = getRequirementGroupKey(requirementKey);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(requirement);
  });

  return [...groups.values()];
}

function buildGroupedCheckBase(requirements, checks) {
  const firstRequirement = requirements[0] || {};
  const firstCheck = checks[0] || {};
  const requirementIds = requirements
    .map((requirement) => asPositiveInteger(requirement.lot_requirement_id))
    .filter(Boolean);

  return {
    ...firstCheck,
    requirementId: requirementIds[0] || null,
    requirementIds,
    alternativeCount: requirements.length,
    requirementKey: normalizeRequirementKey(firstRequirement.requirement_key),
    requirementLabel: firstCheck.requirementLabel || firstRequirement.requirement_label || '',
    actualValue: firstCheck.actualValue || '—',
    sourceLabel: firstCheck.sourceLabel || '—'
  };
}

function evaluateCatalogRequirementGroup(unitSnapshot, requirements) {
  const checks = requirements.map((requirement) => evaluateRequirement(unitSnapshot, requirement));
  const baseCheck = buildGroupedCheckBase(requirements, checks);
  const acceptedCheck = checks.find((check) => check.status === 'accepted');
  const reviewCheck = checks.find((check) => check.status === 'needs_review');
  const requiredValue = joinAlternativeValues(checks.map((check) => check.requiredValue));
  const status = acceptedCheck
    ? 'accepted'
    : reviewCheck
      ? 'needs_review'
      : 'rejected';
  const hasProcessorRequirement = requirements.some((requirement) => normalizeRequirementKey(requirement.requirement_key) === 'processor');
  const hasProcessorFamilyRequirement = requirements.some((requirement) => normalizeRequirementKey(requirement.requirement_key) === 'processor_family');
  const requirementLabel = hasProcessorRequirement && hasProcessorFamilyRequirement
    ? 'Processor or Processor Family'
    : baseCheck.requirementLabel;
  const operatorLabel = requirements.length > 1 ? 'Must equal one of' : baseCheck.operatorLabel;

  let message;

  if (status === 'accepted') {
    message = requirements.length > 1
      ? `${requirementLabel} matches one of the allowed values.`
      : acceptedCheck.message;
  } else if (status === 'needs_review') {
    message = requirements.length > 1
      ? `One or more allowed ${requirementLabel.toLowerCase()} values are not configured correctly.`
      : reviewCheck.message;
  } else {
    message = requirements.length > 1
      ? `Expected ${requiredValue || 'one of the configured values'}; found ${baseCheck.actualValue}.`
      : checks[0].message;
  }

  return {
    ...baseCheck,
    requirementLabel,
    operatorCode: requirements.length > 1 ? 'any_of' : baseCheck.operatorCode,
    operatorLabel,
    requiredValue,
    passed: status === 'accepted',
    status,
    statusLabel: getStatusLabel(status),
    message
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function evaluateNumericRequirementGroup(unitSnapshot, requirements) {
  const checks = requirements.map((requirement) => evaluateRequirement(unitSnapshot, requirement));
  const baseCheck = buildGroupedCheckBase(requirements, checks);
  const field = getLotRequirementField(baseCheck.requirementKey);
  const unitSuffix = String(field?.unitSuffix || '');
  const formatRequirementNumber = (value) => unitSuffix.trim() === 'GB'
    ? formatHardwareCapacityGb(value)
    : `${formatNumber(value)}${unitSuffix}`;
  const actual = unitSnapshot.valuesByKey[baseCheck.requirementKey] || createUnsupportedActual();
  const malformedCheck = checks.find((check) => check.status === 'needs_review');
  const equalityValues = [];
  const minimumValues = [];
  const maximumValues = [];

  requirements.forEach((requirement) => {
    const operatorCode = normalizeOperatorCode(requirement.operator_code || 'equals');
    const requiredNumber = asFiniteNumber(requirement.requirement_number);

    if (requiredNumber === null) {
      return;
    }

    if (operatorCode === 'greater_equal') minimumValues.push(requiredNumber);
    else if (operatorCode === 'less_equal') maximumValues.push(requiredNumber);
    else equalityValues.push(requiredNumber);
  });

  const uniqueEqualityValues = [...new Set(equalityValues)];
  const minimumValue = minimumValues.length > 0 ? Math.max(...minimumValues) : null;
  const maximumValue = maximumValues.length > 0 ? Math.min(...maximumValues) : null;
  const actualNumber = actual.numberValue;
  const equalityText = joinAlternativeValues(uniqueEqualityValues.map(formatRequirementNumber));
  const rangeText = minimumValue !== null && maximumValue !== null
    ? `${formatRequirementNumber(minimumValue)}–${formatRequirementNumber(maximumValue)}`
    : minimumValue !== null
      ? `at least ${formatRequirementNumber(minimumValue)}`
      : maximumValue !== null
        ? `at most ${formatRequirementNumber(maximumValue)}`
        : '';
  const requiredValue = equalityText && rangeText
    ? `${equalityText}, within ${rangeText}`
    : equalityText || rangeText;
  const operatorLabel = uniqueEqualityValues.length > 0 && (minimumValue !== null || maximumValue !== null)
    ? 'Allowed values and range'
    : uniqueEqualityValues.length > 1
      ? 'Must equal one of'
      : minimumValue !== null && maximumValue !== null
        ? 'Range'
        : baseCheck.operatorLabel;

  if (malformedCheck) {
    return {
      ...baseCheck,
      operatorCode: requirements.length > 1 ? 'combined' : baseCheck.operatorCode,
      operatorLabel,
      requiredValue,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: `One or more ${baseCheck.requirementLabel.toLowerCase()} rules are not configured correctly.`
    };
  }

  if (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue) {
    return {
      ...baseCheck,
      operatorCode: 'combined',
      operatorLabel,
      requiredValue,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: `${baseCheck.requirementLabel} has conflicting minimum and maximum rules.`
    };
  }

  if (
    uniqueEqualityValues.length > 0 &&
    !uniqueEqualityValues.some((value) => (
      (minimumValue === null || value >= minimumValue) &&
      (maximumValue === null || value <= maximumValue)
    ))
  ) {
    return {
      ...baseCheck,
      operatorCode: 'combined',
      operatorLabel,
      requiredValue,
      passed: false,
      status: 'needs_review',
      statusLabel: getStatusLabel('needs_review'),
      message: `${baseCheck.requirementLabel} has allowed values that conflict with its configured range.`
    };
  }

  if (actualNumber === null) {
    return {
      ...baseCheck,
      operatorCode: requirements.length > 1 ? 'combined' : baseCheck.operatorCode,
      operatorLabel,
      requiredValue,
      passed: false,
      status: 'rejected',
      statusLabel: getStatusLabel('rejected'),
      message: `The unit has no recorded ${field.label.toLowerCase()} value.`
    };
  }

  const equalityPassed = uniqueEqualityValues.length === 0 || uniqueEqualityValues.includes(actualNumber);
  const minimumPassed = minimumValue === null || actualNumber >= minimumValue;
  const maximumPassed = maximumValue === null || actualNumber <= maximumValue;
  const passed = equalityPassed && minimumPassed && maximumPassed;

  return {
    ...baseCheck,
    operatorCode: requirements.length > 1 ? 'combined' : baseCheck.operatorCode,
    operatorLabel,
    requiredValue,
    passed,
    status: passed ? 'accepted' : 'rejected',
    statusLabel: getStatusLabel(passed ? 'accepted' : 'rejected'),
    message: passed
      ? `${baseCheck.requirementLabel} meets the grouped requirements.`
      : `Expected ${requiredValue || 'the configured value'}; found ${formatRequirementNumber(actualNumber)}.`
  };
}

function evaluateRequirementGroup(unitSnapshot, requirements) {
  const requirementKey = normalizeRequirementKey(requirements[0]?.requirement_key);
  const field = getLotRequirementField(requirementKey);

  if (field?.storageKind === 'number') {
    return evaluateNumericRequirementGroup(unitSnapshot, requirements);
  }

  return evaluateCatalogRequirementGroup(unitSnapshot, requirements);
}

function summarizeUnitValidation(checks, requirementCount) {
  if (requirementCount === 0) return 'open';
  if (checks.some((check) => check.status === 'rejected')) return 'rejected';
  if (checks.some((check) => check.status === 'needs_review')) return 'needs_review';
  return 'accepted';
}

function evaluateUnitSnapshot(unitSnapshot, requirements) {
  const activeRequirements = (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => Number(requirement.is_active) === 1);
  const requirementGroups = groupRequirementsByField(activeRequirements);
  const checks = requirementGroups.map((group) => evaluateRequirementGroup(unitSnapshot, group));
  const status = summarizeUnitValidation(checks, activeRequirements.length);

  return {
    unitId: unitSnapshot.unitId,
    label: unitSnapshot.label,
    subLabel: unitSnapshot.subLabel,
    assetTag: unitSnapshot.assetTag,
    unitSerial: unitSnapshot.unitSerial,
    biosSerial: unitSnapshot.biosSerial,
    assignedTechnician: unitSnapshot.assignedTechnician || null,
    technicians: unitSnapshot.technicians || [],
    activityTechnicianSummary: unitSnapshot.activityTechnicianSummary || 'No technician activity recorded',
    technicianSummary: unitSnapshot.technicianSummary || 'Unassigned',
    lotAssignmentSignature: unitSnapshot.lotAssignmentSignature,
    status,
    statusLabel: getStatusLabel(status),
    requirementCount: activeRequirements.length,
    requirementGroupCount: requirementGroups.length,
    checks,
    failedChecks: checks.filter((check) => check.status === 'rejected'),
    reviewChecks: checks.filter((check) => check.status === 'needs_review')
  };
}

module.exports = {
  buildAssignedTechnician,
  buildTechnicianActivityMap,
  buildTechnicianDisplaySummary,
  buildTechnicianSummary,
  buildUnitSnapshots,
  getRequirementGroupKey,
  evaluateRequirement,
  ensureAssetTagPrefix,
  evaluateUnitSnapshot,
  formatAssetTag,
  getStatusLabel,
  normalizeIdentifierCode,
  summarizeUnitValidation
};
