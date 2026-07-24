'use strict';

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

function createNumberActual({ value, sourceLabel, suffix = '' }) {
  const numericValue = asFiniteNumber(value);

  return {
    kind: 'number',
    isSupported: true,
    ids: [],
    numberValue: numericValue,
    displayValue: numericValue === null ? '' : `${numericValue}${suffix}`,
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

function buildCurrentMemoryActual(baseRow, memoryRows) {
  const meaningfulRows = (memoryRows || []).filter((row) => asFiniteNumber(row.size_gb) > 0);

  if (meaningfulRows.length > 0) {
    const totalGb = meaningfulRows.reduce((total, row) => total + Number(row.size_gb), 0);
    const typeRows = meaningfulRows.filter((row) => asPositiveInteger(row.ram_type_config_value_id));

    return {
      total: createNumberActual({
        value: totalGb,
        sourceLabel: 'Current memory modules',
        suffix: ' GB'
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
      suffix: ' GB'
    }),
    type: createCatalogActual({
      ids: [baseRow.ram_type_config_value_id],
      labels: [baseRow.ram_type_label || baseRow.ram_type_code],
      sourceLabel: 'Unit memory summary'
    })
  };
}

function buildCurrentStorageActual(baseRow, storageRows) {
  const meaningfulRows = (storageRows || []).filter((row) => asFiniteNumber(row.size_gb) > 0);

  if (meaningfulRows.length > 0) {
    const totalGb = meaningfulRows.reduce((total, row) => total + Number(row.size_gb), 0);
    const typeRows = meaningfulRows.filter((row) => asPositiveInteger(row.storage_type_config_value_id));

    return {
      total: createNumberActual({
        value: totalGb,
        sourceLabel: 'Current storage devices',
        suffix: ' GB'
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
      suffix: ' GB'
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
      technicians,
      technicianSummary: buildTechnicianSummary(technicians),
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
        ram_gb: memory.total,
        ram_type: memory.type,
        storage_gb: storage.total,
        storage_type: storage.type
      }
    };
  });
}

function getRequiredCatalogId(requirement, storageKind) {
  const columnByStorageKind = {
    config_value: 'requirement_config_value_id',
    manufacturer: 'manufacturer_id',
    unit_model: 'unit_model_id',
    processor_model: 'processor_model_id'
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
      ? `at least ${requiredNumber}`
      : operatorCode === 'less_equal'
        ? `at most ${requiredNumber}`
        : `${requiredNumber}`;

    return {
      ...baseCheck,
      passed,
      status: passed ? 'accepted' : 'rejected',
      statusLabel: getStatusLabel(passed ? 'accepted' : 'rejected'),
      message: passed
        ? `${field.label} meets the requirement.`
        : `Expected ${expectedText} GB; found ${actualNumber} GB.`
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

function summarizeUnitValidation(checks, requirementCount) {
  if (requirementCount === 0) return 'open';
  if (checks.some((check) => check.status === 'rejected')) return 'rejected';
  if (checks.some((check) => check.status === 'needs_review')) return 'needs_review';
  return 'accepted';
}

function evaluateUnitSnapshot(unitSnapshot, requirements) {
  const activeRequirements = (Array.isArray(requirements) ? requirements : [])
    .filter((requirement) => Number(requirement.is_active) === 1);
  const checks = activeRequirements.map((requirement) => evaluateRequirement(unitSnapshot, requirement));
  const status = summarizeUnitValidation(checks, activeRequirements.length);

  return {
    unitId: unitSnapshot.unitId,
    label: unitSnapshot.label,
    subLabel: unitSnapshot.subLabel,
    assetTag: unitSnapshot.assetTag,
    unitSerial: unitSnapshot.unitSerial,
    biosSerial: unitSnapshot.biosSerial,
    technicians: unitSnapshot.technicians || [],
    technicianSummary: unitSnapshot.technicianSummary || 'No technician activity recorded',
    lotAssignmentSignature: unitSnapshot.lotAssignmentSignature,
    status,
    statusLabel: getStatusLabel(status),
    checks,
    failedChecks: checks.filter((check) => check.status === 'rejected'),
    reviewChecks: checks.filter((check) => check.status === 'needs_review')
  };
}

module.exports = {
  buildTechnicianActivityMap,
  buildTechnicianSummary,
  buildUnitSnapshots,
  evaluateRequirement,
  ensureAssetTagPrefix,
  evaluateUnitSnapshot,
  formatAssetTag,
  getStatusLabel,
  normalizeIdentifierCode,
  summarizeUnitValidation
};
