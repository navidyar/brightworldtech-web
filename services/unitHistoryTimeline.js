'use strict';

const { formatHardwareCapacityGb } = require('./hardwareCapacity');
const {
  buildHardwareComponentComparisons,
  componentText
} = require('./hardwareComponentComparison');
const { buildLotHierarchyLookup, resolveSnapshotPath } = require('./lotHierarchyPresentation');

const LEGACY_GROUP_WINDOW_MS = 60 * 1000;
const AUDIT_DUPLICATE_WINDOW_MS = 5 * 1000;

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function actorName(value, fallback = 'System') {
  return normalizeText(value) || fallback;
}

function valueOrFallback(value, fallback = 'Not provided') {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function normalizePositiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildLotNameById(operationalHistory = {}, lotCatalog = []) {
  const names = new Map();
  const add = (id, name) => {
    const lotId = normalizePositiveId(id);
    const lotName = normalizeText(name);
    if (lotId && lotName && lotName !== 'No active lot') {
      names.set(lotId, lotName);
    }
  };

  (Array.isArray(lotCatalog) ? lotCatalog : []).forEach((lot) => {
    add(lot && (lot.lot_id ?? lot.lotId ?? lot.value), lot && (lot.lot_name ?? lot.lotName ?? lot.label ?? lot.name));
  });

  (operationalHistory.lotMoves || []).forEach((row) => {
    add(row.fromLotId, row.fromLotName);
    add(row.toLotId, row.toLotName);
  });

  (operationalHistory.lifecycleEvents || []).forEach((row) => {
    add(row.fromLotId, row.fromLotName);
    add(row.toLotId, row.toLotName);
  });

  return names;
}

function buildLotPathById(lotCatalog = []) {
  const lookup = buildLotHierarchyLookup(Array.isArray(lotCatalog) ? lotCatalog : [], { includeInactiveAncestors: true });
  const paths = new Map();
  lookup.forEach((presentation, id) => {
    if (presentation && presentation.fullPath) paths.set(Number(id), presentation.fullPath);
  });
  return paths;
}

function resolveLotAuditValueText(valueText, rawValue, lotNameById) {
  const currentText = normalizeText(valueText);
  const parsedRawValue = parseJson(rawValue);
  const rawId = normalizePositiveId(parsedRawValue);
  const textId = normalizePositiveId(currentText);
  const lotId = rawId || textId;

  if (!lotId || !(lotNameById instanceof Map)) {
    return currentText;
  }

  return lotNameById.get(lotId) || currentText;
}

function resolveAuditChangeDisplay(change = {}, lotNameById = new Map(), lotPathById = new Map(), metadata = {}) {
  const fieldKey = normalizeText(change.fieldKey);
  if (!['assignable_lot', 'completion_lot'].includes(fieldKey)) {
    return change;
  }

  const oldValueText = resolveLotAuditValueText(change.oldValueText, change.oldValue, lotNameById);
  const newValueText = resolveLotAuditValueText(change.newValueText, change.newValue, lotNameById);
  const hierarchyMetadata = metadata && metadata.lotHierarchyPaths && metadata.lotHierarchyPaths[fieldKey]
    ? metadata.lotHierarchyPaths[fieldKey]
    : null;
  const parsedOldValue = normalizePositiveId(parseJson(change.oldValue));
  const parsedNewValue = normalizePositiveId(parseJson(change.newValue));
  const oldHierarchyText = hierarchyMetadata && hierarchyMetadata.old
    ? resolveSnapshotPath(hierarchyMetadata.old, lotNameById)
    : (parsedOldValue && lotPathById instanceof Map ? lotPathById.get(parsedOldValue) || '' : '');
  const newHierarchyText = hierarchyMetadata && hierarchyMetadata.new
    ? resolveSnapshotPath(hierarchyMetadata.new, lotNameById)
    : (parsedNewValue && lotPathById instanceof Map ? lotPathById.get(parsedNewValue) || '' : '');

  return {
    ...change,
    oldValueText: oldHierarchyText || oldValueText,
    newValueText: newHierarchyText || newValueText
  };
}

function auditChangeText(change = {}) {
  const changeType = normalizeText(change.changeType).toLowerCase();
  const oldValue = normalizeText(change.oldValueText);
  const newValue = normalizeText(change.newValueText);

  if (changeType === 'created' || changeType === 'added' || changeType === 'accepted' || changeType === 'recorded') {
    return valueOrFallback(newValue);
  }

  if (changeType === 'removed') {
    return `${valueOrFallback(oldValue)} → Removed`;
  }

  if (changeType === 'revoked') {
    return newValue || 'Revoked';
  }

  if (oldValue || newValue) {
    return `${valueOrFallback(oldValue)} → ${valueOrFallback(newValue)}`;
  }

  return 'Changed';
}

const COMPONENT_CHANGE_FIELDS = Object.freeze({
  previous_memory_modules: { kind: 'memory', label: 'Previous Memory' },
  memory_modules: { kind: 'memory', label: 'Current Memory' },
  previous_storage_devices: { kind: 'storage', label: 'Previous Storage' },
  storage_devices: { kind: 'storage', label: 'Current Storage' }
});

function componentChangeText(comparison) {
  const previousText = comparison.previousText || componentText(comparison.previous);
  const currentText = comparison.currentText || componentText(comparison.current);

  if (comparison.statusCode === 'added') {
    return `Added ${currentText}`;
  }

  if (comparison.statusCode === 'removed') {
    return `${previousText} → ${currentText}`;
  }

  if (comparison.statusCode === 'changed') {
    return `${previousText} → ${currentText}`;
  }

  return currentText || previousText || 'Changed';
}

function expandComponentAuditChange(change = {}) {
  const definition = COMPONENT_CHANGE_FIELDS[normalizeText(change.fieldKey)];

  if (!definition) {
    return null;
  }

  const oldValue = parseJson(change.oldValue);
  const newValue = parseJson(change.newValue);
  const oldRows = Array.isArray(oldValue) ? oldValue : [];
  const newRows = Array.isArray(newValue) ? newValue : [];

  if (oldRows.length === 0 && newRows.length === 0) {
    return null;
  }

  const comparisons = buildHardwareComponentComparisons(oldRows, newRows, {
    kind: definition.kind
  });
  const meaningfulComparisons = comparisons
    .map((comparison) => {
      if (comparison.statusCode === 'current_only') {
        return { ...comparison, statusCode: 'added' };
      }

      if (comparison.statusCode === 'previous_only') {
        return { ...comparison, statusCode: 'removed' };
      }

      return comparison;
    })
    .filter((comparison) => ['added', 'removed', 'changed'].includes(comparison.statusCode));

  if (meaningfulComparisons.length === 0) {
    return null;
  }

  return meaningfulComparisons.map((comparison) => ({
    label: `${definition.label} · ${comparison.slotLabel}`,
    text: componentChangeText(comparison),
    oldValueText: comparison.previousText,
    newValueText: comparison.currentText,
    changeType: comparison.statusCode
  }));
}

function normalizeAuditEvent(event = {}, { lotNameById = new Map(), lotPathById = new Map() } = {}) {
  const metadata = parseJson(event.metadata) || {};
  const isCreation = event.eventType === 'unit_created';

  return {
    id: `audit:${Number(event.eventId)}`,
    source: 'audit',
    eventType: normalizeText(event.eventType) || 'unit_activity',
    title: normalizeText(event.eventSummary) || (isCreation ? 'Created unit' : 'Updated unit'),
    actorName: actorName(event.actorName, event.actorUserId ? 'User not recorded' : 'System'),
    actorUserId: Number(event.actorUserId) || null,
    occurredAt: normalizeDate(event.occurredAt),
    isCreation,
    isLegacy: false,
    metadata,
    changes: (Array.isArray(event.changes) ? event.changes : []).flatMap((change) => {
      const displayChange = resolveAuditChangeDisplay(change, lotNameById, lotPathById, metadata);
      const expandedChanges = expandComponentAuditChange(displayChange);

      if (expandedChanges) {
        return expandedChanges;
      }

      return [{
        label: normalizeText(displayChange.fieldLabel) || normalizeText(displayChange.fieldKey) || 'Change',
        text: auditChangeText(displayChange),
        oldValueText: normalizeText(displayChange.oldValueText),
        newValueText: normalizeText(displayChange.newValueText),
        changeType: normalizeText(displayChange.changeType) || 'changed'
      }];
    }),
    notes: []
  };
}

function legacyChange(label, text, changeType = 'recorded') {
  return {
    label: normalizeText(label) || 'Change',
    text: valueOrFallback(text),
    oldValueText: '',
    newValueText: normalizeText(text),
    changeType
  };
}

function makeLegacyEvent({
  id,
  eventType,
  title,
  actor,
  occurredAt,
  changes = [],
  notes = [],
  groupable = false,
  metadata = {}
}) {
  return {
    id: `legacy:${id}`,
    source: 'legacy',
    eventType,
    title,
    actorName: actorName(actor, 'User not recorded'),
    actorUserId: null,
    occurredAt: normalizeDate(occurredAt),
    isCreation: false,
    isLegacy: true,
    groupable,
    metadata,
    changes,
    notes: notes.map(normalizeText).filter(Boolean)
  };
}

function formatGb(value) {
  return formatHardwareCapacityGb(value);
}

function formatMhz(value) {
  const normalized = normalizeText(value);
  return normalized ? `${normalized} MHz` : '';
}

function joinParts(parts, separator = ' · ') {
  return parts.map(normalizeText).filter(Boolean).join(separator);
}

function auditHasNearbyMatch(auditEvents, legacyEvent, eventTypes = []) {
  const legacyTime = legacyEvent.occurredAt ? legacyEvent.occurredAt.getTime() : null;
  if (!legacyTime) return false;

  const legacyActor = normalizeText(legacyEvent.actorName).toLowerCase();

  return auditEvents.some((event) => {
    if (eventTypes.length > 0 && !eventTypes.includes(event.eventType)) return false;
    if (!event.occurredAt) return false;
    if (Math.abs(event.occurredAt.getTime() - legacyTime) > AUDIT_DUPLICATE_WINDOW_MS) return false;

    const auditActor = normalizeText(event.actorName).toLowerCase();
    return !legacyActor || !auditActor || legacyActor === auditActor;
  });
}

function acceptanceCoveredByAudit(auditEvents, overrideId, eventType) {
  return auditEvents.some((event) => {
    if (event.eventType !== eventType) return false;
    return Number(event.metadata && event.metadata.overrideId) === Number(overrideId);
  });
}

function buildLegacyEvents({
  historyDetails = {},
  overrideHistory = {},
  operationalHistory = {},
  acceptanceHistory = [],
  auditEvents = []
} = {}) {
  const events = [];
  const add = (event, duplicateTypes = []) => {
    if (!event || !event.occurredAt) return;
    if (duplicateTypes.length > 0 && auditHasNearbyMatch(auditEvents, event, duplicateTypes)) return;
    events.push(event);
  };

  (operationalHistory.workCompletions || []).forEach((row) => {
    add(makeLegacyEvent({
      id: `completion:${row.unitWorkCompletionId || row.completedAt}`,
      eventType: 'unit_completed',
      title: row.creditSourceLabel || 'Completed unit work',
      actor: row.completedByName,
      occurredAt: row.completedAt,
      changes: [
        legacyChange('Lot', row.lotName || 'No active lot'),
        legacyChange('Production Credit', row.formattedProductionWeight || '—')
      ],
      notes: [row.recordedByName && row.recordedByName !== row.completedByName ? `Recorded by ${row.recordedByName}` : '', row.notes]
    }), ['unit_completed']);
  });

  (operationalHistory.assignmentChanges || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `assignment:${index}:${row.changedAt}`,
      eventType: 'unit_assignment_changed',
      title: 'Changed assignment',
      actor: row.changedByName || 'System',
      occurredAt: row.changedAt,
      changes: [legacyChange('Assigned Technician', `${row.fromUserName || 'Unassigned'} → ${row.toUserName || 'Unassigned'}`, 'changed')],
      notes: [row.notes]
    }), ['unit_assignment_changed', 'unit_parked', 'unit_returned_to_active', 'unit_assumed', 'override_request_approved']);
  });

  (operationalHistory.lotMoves || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `lot:${index}:${row.movedAt}`,
      eventType: 'unit_lot_changed',
      title: 'Moved unit to another Lot',
      actor: row.movedByName || 'System',
      occurredAt: row.movedAt,
      changes: [legacyChange('Lot', `${row.fromLotName || 'No active lot'} → ${row.toLotName || 'No active lot'}`, 'changed')],
      notes: [row.notes]
    }), ['unit_lot_changed', 'unit_returned_to_active', 'unit_assumed', 'override_request_approved', 'unit_updated']);
  });

  (operationalHistory.lifecycleEvents || []).forEach((row, index) => {
    const changes = [];
    const fromLot = row.fromLotName || 'No active lot';
    const toLot = row.toLotName || 'No active lot';
    const fromAssigned = row.fromAssignedToName || 'Unassigned';
    const toAssigned = row.toAssignedToName || 'Unassigned';
    if (fromLot !== toLot) changes.push(legacyChange('Lot', `${fromLot} → ${toLot}`, 'changed'));
    if (fromAssigned !== toAssigned) changes.push(legacyChange('Assigned Technician', `${fromAssigned} → ${toAssigned}`, 'changed'));

    add(makeLegacyEvent({
      id: `lifecycle:${index}:${row.changedAt}`,
      eventType: normalizeText(row.eventType) || 'unit_lifecycle_changed',
      title: row.eventLabel || 'Changed Unit lifecycle',
      actor: row.changedByName || 'System',
      occurredAt: row.changedAt,
      changes,
      notes: [row.notes]
    }), ['unit_parked', 'unit_returned_to_active', 'unit_assumed']);
  });

  (acceptanceHistory || []).forEach((row) => {
    const overrideId = Number(row.overrideId || 0);
    if (row.approvedAt && !acceptanceCoveredByAudit(auditEvents, overrideId, 'lot_requirement_exception_accepted')) {
      add(makeLegacyEvent({
        id: `acceptance:${overrideId}:approved`,
        eventType: 'lot_requirement_exception_accepted',
        title: 'Accepted Lot requirement exception',
        actor: row.approvedByName || row.requestedByName || 'Management',
        occurredAt: row.approvedAt,
        changes: [legacyChange('Lot Requirement Acceptance', `${row.lotName || 'Unknown lot'}: ${row.reason || 'No reason recorded'}`, 'accepted')],
        metadata: { overrideId }
      }));
    }

    if (row.revokedAt && !acceptanceCoveredByAudit(auditEvents, overrideId, 'lot_requirement_exception_revoked')) {
      add(makeLegacyEvent({
        id: `acceptance:${overrideId}:revoked`,
        eventType: 'lot_requirement_exception_revoked',
        title: 'Revoked Lot requirement exception',
        actor: row.revokedByName || 'Management',
        occurredAt: row.revokedAt,
        changes: [legacyChange('Lot Requirement Acceptance', `${row.lotName || 'Unknown lot'} → Revoked`, 'revoked')],
        notes: [row.reason ? `Original acceptance note: ${row.reason}` : ''],
        metadata: { overrideId }
      }));
    }

    if (row.expiredAt && !acceptanceCoveredByAudit(auditEvents, overrideId, 'lot_requirement_exception_expired')) {
      add(makeLegacyEvent({
        id: `acceptance:${overrideId}:expired`,
        eventType: 'lot_requirement_exception_expired',
        title: 'Lot requirement exception expired',
        actor: 'System',
        occurredAt: row.expiredAt,
        changes: [legacyChange('Lot Requirement Acceptance', `${row.lotName || 'Unknown lot'} → Expired`, 'expired')],
        notes: [row.reason ? `Original acceptance note: ${row.reason}` : ''],
        metadata: { overrideId }
      }));
    }
  });

  (historyDetails.gradeHistory || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `grade:${index}:${row.assessedAt}`,
      eventType: 'legacy_unit_details_changed',
      title: 'Updated unit details',
      actor: row.assessedByName || row.sourceCode,
      occurredAt: row.assessedAt,
      changes: [legacyChange('Overall Grade', row.gradeLabel || 'Not graded')],
      notes: [row.notes],
      groupable: true
    }), ['unit_created', 'unit_updated']);
  });

  (historyDetails.memoryHistory || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `memory:${index}:${row.updatedAt || row.installedAt}`,
      eventType: 'legacy_unit_details_changed',
      title: 'Updated unit details',
      actor: row.changedByName || row.sourceCode,
      occurredAt: row.updatedAt || row.installedAt,
      changes: [legacyChange('Memory Module', joinParts([
        row.slotLabel || 'Slot',
        formatGb(row.sizeGb),
        row.ramTypeLabel,
        formatMhz(row.speedMhz),
        row.manufacturerName,
        row.partNumber ? `Part ${row.partNumber}` : '',
        row.serialNumber ? `Serial ${row.serialNumber}` : '',
        row.isCurrent === false ? 'Removed/Prior' : 'Current'
      ]))],
      notes: [row.changeReasonLabel, row.changeNotes],
      groupable: true
    }), ['unit_created', 'unit_updated']);
  });

  (historyDetails.storageHistory || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `storage:${index}:${row.updatedAt || row.installedAt}`,
      eventType: 'legacy_unit_details_changed',
      title: 'Updated unit details',
      actor: row.changedByName || row.sourceCode,
      occurredAt: row.updatedAt || row.installedAt,
      changes: [legacyChange('Storage Device', joinParts([
        row.slotLabel || 'Drive',
        formatGb(row.sizeGb),
        row.storageTypeLabel,
        row.modelNumber || row.manufacturerName,
        row.serialNumber ? `Serial ${row.serialNumber}` : '',
        row.wipeStatusLabel ? `Wipe ${row.wipeStatusLabel}` : '',
        row.isCurrent === false ? 'Removed/Prior' : 'Current'
      ]))],
      notes: [row.changeReasonLabel, row.changeNotes],
      groupable: true
    }), ['unit_created', 'unit_updated']);
  });

  (historyDetails.hardwareIssueHistory || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `hardware:${index}:${row.updatedAt || row.createdAt}`,
      eventType: 'legacy_unit_details_changed',
      title: 'Updated unit details',
      actor: row.updatedByName || row.createdByName || row.sourceCode,
      occurredAt: row.updatedAt || row.createdAt,
      changes: [legacyChange('Hardware Issue', joinParts([
        row.issueLabel || 'Hardware Issue',
        row.locationLabel,
        row.isCurrent === false ? 'Resolved/Prior' : 'Current'
      ]))],
      notes: [row.issueRemark],
      groupable: true
    }), ['unit_created', 'unit_updated']);
  });

  (historyDetails.cosmeticIssueHistory || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `cosmetic:${index}:${row.updatedAt || row.createdAt}`,
      eventType: 'legacy_unit_details_changed',
      title: 'Updated unit details',
      actor: row.updatedByName || row.createdByName || row.sourceCode,
      occurredAt: row.updatedAt || row.createdAt,
      changes: [legacyChange('Cosmetic Issue', joinParts([
        row.issueLabel || 'Cosmetic Issue',
        row.severityLabel,
        row.locationLabel,
        row.isCurrent === false ? 'Resolved/Prior' : 'Current'
      ]))],
      notes: [row.issueRemark],
      groupable: true
    }), ['unit_created', 'unit_updated']);
  });

  (overrideHistory.requests || []).forEach((row, index) => {
    add(makeLegacyEvent({
      id: `override-request:${index}:${row.createdAt}`,
      eventType: 'override_request_recorded',
      title: row.requestTypeLabel || 'Recorded override request',
      actor: row.requestedByName,
      occurredAt: row.createdAt,
      changes: [
        legacyChange('Request Status', row.statusLabel || 'Request'),
        legacyChange('System Check', row.validationLabel || 'Not captured'),
        legacyChange('Decision', row.decisionLabel || 'Not captured')
      ],
      notes: [
        row.reason,
        row.reviewedByName ? `Reviewed by ${row.reviewedByName}` : '',
        row.reviewNotes,
        row.priorTechCreditGranted ? `Prior Tech credit: ${row.priorTechCreditUserName || 'Prior Tech'} · ${Number(row.priorTechCreditWeight || 0).toFixed(2)}` : ''
      ]
    }));
  });

  return events;
}

function groupLegacyEvents(events) {
  const sorted = events.slice().sort((left, right) => {
    const leftTime = left.occurredAt ? left.occurredAt.getTime() : 0;
    const rightTime = right.occurredAt ? right.occurredAt.getTime() : 0;
    return leftTime - rightTime;
  });
  const grouped = [];

  sorted.forEach((event) => {
    if (!event.groupable || !event.occurredAt || event.actorName === 'User not recorded') {
      grouped.push(event);
      return;
    }

    const previous = grouped[grouped.length - 1];
    const canMerge = Boolean(
      previous
      && previous.groupable
      && previous.actorName === event.actorName
      && previous.occurredAt
      && Math.abs(event.occurredAt.getTime() - previous.occurredAt.getTime()) <= LEGACY_GROUP_WINDOW_MS
    );

    if (!canMerge) {
      grouped.push(event);
      return;
    }

    previous.id = `${previous.id}+${event.id}`;
    previous.changes.push(...event.changes);
    previous.notes.push(...event.notes);
    previous.notes = Array.from(new Set(previous.notes.filter(Boolean)));
    if (event.occurredAt > previous.occurredAt) previous.occurredAt = event.occurredAt;
  });

  return grouped;
}

function buildLegacyCreationEvent(creationContext, auditEvents) {
  if (!creationContext || auditEvents.some((event) => event.isCreation)) return null;
  const occurredAt = normalizeDate(creationContext.createdAt);
  if (!occurredAt) return null;

  const assetTag = normalizeText(creationContext.assetTag) || 'Unit';
  return makeLegacyEvent({
    id: `creation:${creationContext.unitId || assetTag}`,
    eventType: 'legacy_unit_created',
    title: `Created unit ${assetTag}`,
    actor: creationContext.createdByName || 'User not recorded',
    occurredAt,
    notes: ['Original field values were not captured in the audit system. Later history is shown from available legacy records.']
  });
}

function buildUnitHistoryTimeline({
  auditEvents = [],
  historyDetails = {},
  overrideHistory = {},
  operationalHistory = {},
  acceptanceHistory = [],
  creationContext = null,
  lotCatalog = []
} = {}) {
  const lotNameById = buildLotNameById(operationalHistory, lotCatalog);
  const lotPathById = buildLotPathById(lotCatalog);
  const normalizedAuditEvents = (Array.isArray(auditEvents) ? auditEvents : [])
    .map((event) => normalizeAuditEvent(event, { lotNameById, lotPathById }));
  const legacyEvents = groupLegacyEvents(buildLegacyEvents({
    historyDetails,
    overrideHistory,
    operationalHistory,
    acceptanceHistory,
    auditEvents: normalizedAuditEvents
  }));
  const legacyCreationEvent = buildLegacyCreationEvent(creationContext, normalizedAuditEvents);
  if (legacyCreationEvent) legacyEvents.push(legacyCreationEvent);

  const events = [...normalizedAuditEvents, ...legacyEvents]
    .filter((event) => event.occurredAt)
    .sort((left, right) => {
      const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
      if (timeDifference !== 0) return timeDifference;
      if (left.source === right.source) return String(right.id).localeCompare(String(left.id));
      return left.source === 'audit' ? -1 : 1;
    });

  return {
    events,
    totalEvents: events.length,
    totalChanges: events.reduce((total, event) => total + event.changes.length, 0),
    hasLegacyEvents: events.some((event) => event.isLegacy),
    hasAuditEvents: events.some((event) => !event.isLegacy)
  };
}

module.exports = {
  AUDIT_DUPLICATE_WINDOW_MS,
  LEGACY_GROUP_WINDOW_MS,
  auditChangeText,
  buildLotNameById,
  buildLotPathById,
  buildUnitHistoryTimeline,
  groupLegacyEvents,
  normalizeAuditEvent,
  resolveAuditChangeDisplay
};
