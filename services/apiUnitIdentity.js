'use strict';

const SERIAL_TYPE_CODES = new Set(['unit_serial_number', 'bios_serial_number']);

function normalizeIdentifier(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return normalized || '';
}

function normalizeSerial(value) {
  return normalizeIdentifier(value);
}

function normalizeUuid(value) {
  return normalizeIdentifier(value);
}

function groupMatches(matches = []) {
  const grouped = new Map();

  for (const match of Array.isArray(matches) ? matches : []) {
    const unitId = Number(match && match.unitId);
    if (!Number.isSafeInteger(unitId) || unitId <= 0) continue;

    if (!grouped.has(unitId)) {
      grouped.set(unitId, {
        unitId,
        assetNumber: Number(match.assetNumber) || null,
        assetTag: String(match.assetTag || '').trim(),
        lotId: Number(match.lotId) || null,
        lotName: String(match.lotName || '').trim(),
        unitSerialNumber: String(match.unitSerialNumber || '').trim(),
        biosSerialNumber: String(match.biosSerialNumber || '').trim(),
        systemUuid: String(match.systemUuid || '').trim(),
        manufacturerLabel: String(match.manufacturerLabel || '').trim(),
        modelLabel: String(match.modelLabel || '').trim(),
        modelSummary: String(match.modelSummary || '').trim(),
        processorBrandLabel: String(match.processorBrandLabel || '').trim(),
        processorLabel: String(match.processorLabel || '').trim(),
        processorSpeedGhz: match.processorSpeedGhz ?? '',
        cpuSummary: String(match.cpuSummary || '').trim(),
        ramGb: match.ramGb ?? null,
        ramTypeLabel: String(match.ramTypeLabel || '').trim(),
        storageGb: match.storageGb ?? null,
        storageTypeLabel: String(match.storageTypeLabel || '').trim(),
        assignedToUserId: Number(match.assignedToUserId) || null,
        assignedToUsername: String(match.assignedToUsername || '').trim(),
        assignedToName: String(match.assignedToName || '').trim(),
        currentUnitStatusConfigValueId: Number(match.currentUnitStatusConfigValueId) || null,
        currentUnitStatusLabel: String(match.currentUnitStatusLabel || '').trim(),
        isParked: Boolean(match.isParked),
        isArchived: Boolean(match.isArchived),
        rows: []
      });
    }

    grouped.get(unitId).rows.push(match);
  }

  return [...grouped.values()];
}

function getSerialMatchSet(matches, serialValue) {
  const normalized = normalizeSerial(serialValue);
  if (!normalized) return new Set();

  // Unit Serial and BIOS Serial intentionally share one serial-identity namespace.
  return new Set(
    (Array.isArray(matches) ? matches : [])
      .filter((match) => SERIAL_TYPE_CODES.has(String(match.identifierTypeCode || '')))
      .filter((match) => normalizeSerial(match.normalizedValue || match.identifierValue) === normalized)
      .map((match) => Number(match.unitId))
      .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0)
  );
}

function getUuidMatchSet(matches, systemUuid) {
  const normalized = normalizeUuid(systemUuid);
  if (!normalized) return new Set();

  return new Set(
    (Array.isArray(matches) ? matches : [])
      .filter((match) => String(match.identifierTypeCode || '') === 'system_uuid')
      .filter((match) => normalizeUuid(match.normalizedValue || match.identifierValue) === normalized)
      .map((match) => Number(match.unitId))
      .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0)
  );
}

function getAssetMatchSet(matches, assetNumber) {
  const safeAssetNumber = Number(assetNumber);
  if (!Number.isSafeInteger(safeAssetNumber) || safeAssetNumber <= 0) return new Set();

  return new Set(
    (Array.isArray(matches) ? matches : [])
      .filter((match) => String(match.identifierTypeCode || '') === 'asset_tag')
      .filter((match) => Number(match.assetNumber) === safeAssetNumber)
      .map((match) => Number(match.unitId))
      .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0)
  );
}

function intersectSets(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function unionSets(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function candidateSerialState(candidate, submittedValue, preferredField) {
  const submitted = normalizeSerial(submittedValue);
  if (!submitted) return 'not_supplied';

  const preferredStored = normalizeSerial(candidate && candidate[preferredField]);
  const alternateField = preferredField === 'unitSerialNumber' ? 'biosSerialNumber' : 'unitSerialNumber';
  const alternateStored = normalizeSerial(candidate && candidate[alternateField]);

  if (submitted === preferredStored || submitted === alternateStored) return 'matched';
  if (!preferredStored) return 'unconfirmed';
  return 'conflict';
}

function candidateUuidState(candidate, submittedValue) {
  const submitted = normalizeUuid(submittedValue);
  if (!submitted) return 'not_supplied';
  const stored = normalizeUuid(candidate && candidate.systemUuid);
  if (!stored) return 'unconfirmed';
  return submitted === stored ? 'matched' : 'conflict';
}

function buildEvidence(candidate, identity) {
  const assetNumber = Number(identity.assetNumber) || null;
  const assetMatches = assetNumber
    ? Number(candidate && candidate.assetNumber) === assetNumber
    : null;

  return {
    asset_tag: assetNumber ? (assetMatches ? 'matched' : 'not_matched') : 'not_supplied',
    unit_serial_number: candidateSerialState(candidate, identity.unitSerialNumber, 'unitSerialNumber'),
    bios_serial_number: candidateSerialState(candidate, identity.biosSerialNumber, 'biosSerialNumber'),
    system_uuid: candidateUuidState(candidate, identity.systemUuid)
  };
}

function filterCandidates(candidates, unitIds) {
  return candidates.filter((candidate) => unitIds.has(Number(candidate.unitId)));
}

function annotateCandidates(candidates, identity, { assetSet, unitSerialSet, biosSerialSet, uuidSet }) {
  return candidates.map((candidate) => {
    const unitId = Number(candidate.unitId);
    const matchReasons = [];
    if (assetSet.has(unitId)) matchReasons.push('asset_tag');
    if (unitSerialSet.has(unitId)) matchReasons.push('unit_serial_number');
    if (biosSerialSet.has(unitId)) matchReasons.push('bios_serial_number');
    if (uuidSet.has(unitId)) matchReasons.push('system_uuid');
    return {
      ...candidate,
      matchReasons,
      evidence: buildEvidence(candidate, identity)
    };
  });
}

function finalize({ status, matchMode, candidates, matchedUnitId = null, identity, sets }) {
  const annotated = annotateCandidates(candidates, identity, sets);
  const matchedCandidate = matchedUnitId
    ? annotated.find((candidate) => Number(candidate.unitId) === Number(matchedUnitId)) || null
    : null;

  return {
    status,
    matchMode,
    matchCount: annotated.length,
    candidates: annotated,
    candidate: matchedCandidate,
    evidence: matchedCandidate ? matchedCandidate.evidence : null,
    matchedUnitId: matchedUnitId || null
  };
}

function resolveWithUuidTieBreak({ candidateSet, uuidSet, groupedCandidates, identity, sets, baseMode }) {
  if (!normalizeUuid(identity.systemUuid)) return null;

  const intersection = intersectSets(candidateSet, uuidSet);
  if (intersection.size === 1) {
    return finalize({
      status: 'MATCHED',
      matchMode: `${baseMode}_uuid`,
      candidates: filterCandidates(groupedCandidates, intersection),
      matchedUnitId: [...intersection][0],
      identity,
      sets
    });
  }
  if (intersection.size > 1) {
    return finalize({
      status: 'AMBIGUOUS',
      matchMode: `${baseMode}_uuid`,
      candidates: filterCandidates(groupedCandidates, intersection),
      identity,
      sets
    });
  }
  if (uuidSet.size > 0) {
    const conflictSet = unionSets(candidateSet, uuidSet);
    return finalize({
      status: 'CONFLICT',
      matchMode: `${baseMode}_uuid_conflict`,
      candidates: filterCandidates(groupedCandidates, conflictSet),
      identity,
      sets
    });
  }
  return null;
}

function resolveUuidFallback({ uuidSet, groupedCandidates, identity, sets }) {
  if (uuidSet.size === 0) {
    return finalize({ status: 'NOT_FOUND', matchMode: 'none', candidates: [], identity, sets });
  }
  const candidates = filterCandidates(groupedCandidates, uuidSet);
  return finalize({
    status: uuidSet.size === 1 ? 'MATCHED' : 'AMBIGUOUS',
    matchMode: 'uuid_fallback',
    candidates,
    matchedUnitId: uuidSet.size === 1 ? [...uuidSet][0] : null,
    identity,
    sets
  });
}

function resolveUnitIdentity({ assetNumber = null, unitSerialNumber = '', biosSerialNumber = '', systemUuid = '', matches = [] } = {}) {
  const identity = { assetNumber, unitSerialNumber, biosSerialNumber, systemUuid };
  const groupedCandidates = groupMatches(matches);
  const assetSet = getAssetMatchSet(matches, assetNumber);
  const unitSerialSet = getSerialMatchSet(matches, unitSerialNumber);
  const biosSerialSet = getSerialMatchSet(matches, biosSerialNumber);
  const uuidSet = getUuidMatchSet(matches, systemUuid);
  const sets = { assetSet, unitSerialSet, biosSerialSet, uuidSet };

  // Asset Tag remains authoritative. Other identity evidence is returned for
  // conservative preflight handling but never silently changes the Asset match.
  if (assetNumber && assetSet.size > 0) {
    const assetCandidates = filterCandidates(groupedCandidates, assetSet);
    if (assetSet.size === 1) {
      return finalize({
        status: 'MATCHED',
        matchMode: 'asset_tag_exact',
        candidates: assetCandidates,
        matchedUnitId: [...assetSet][0],
        identity,
        sets
      });
    }
    return finalize({ status: 'AMBIGUOUS', matchMode: 'asset_tag_exact', candidates: assetCandidates, identity, sets });
  }

  const hasUnitSerial = Boolean(normalizeSerial(unitSerialNumber));
  const hasBiosSerial = Boolean(normalizeSerial(biosSerialNumber));

  if (hasUnitSerial && hasBiosSerial) {
    const serialAnd = intersectSets(unitSerialSet, biosSerialSet);
    if (serialAnd.size > 0) {
      const uuidResolution = resolveWithUuidTieBreak({
        candidateSet: serialAnd,
        uuidSet,
        groupedCandidates,
        identity,
        sets,
        baseMode: 'serial_and'
      });
      if (uuidResolution) return uuidResolution;

      const candidates = filterCandidates(groupedCandidates, serialAnd);
      return finalize({
        status: serialAnd.size === 1 ? 'MATCHED' : 'AMBIGUOUS',
        matchMode: 'serial_and',
        candidates,
        matchedUnitId: serialAnd.size === 1 ? [...serialAnd][0] : null,
        identity,
        sets
      });
    }

    const serialOr = unionSets(unitSerialSet, biosSerialSet);
    if (serialOr.size > 0) {
      const uuidResolution = resolveWithUuidTieBreak({
        candidateSet: serialOr,
        uuidSet,
        groupedCandidates,
        identity,
        sets,
        baseMode: 'serial_or'
      });
      if (uuidResolution && uuidResolution.status === 'MATCHED') return uuidResolution;
      if (uuidResolution && uuidSet.size > 0) return uuidResolution;

      return finalize({
        status: 'CONFLICT',
        matchMode: 'serial_or_fallback',
        candidates: filterCandidates(groupedCandidates, serialOr),
        identity,
        sets
      });
    }

    return resolveUuidFallback({ uuidSet, groupedCandidates, identity, sets });
  }

  const hasSingleSerial = hasUnitSerial || hasBiosSerial;
  if (hasSingleSerial) {
    const singleSet = hasUnitSerial ? unitSerialSet : biosSerialSet;
    if (singleSet.size > 0) {
      const baseMode = hasUnitSerial ? 'unit_serial_only' : 'bios_serial_only';
      const uuidResolution = resolveWithUuidTieBreak({
        candidateSet: singleSet,
        uuidSet,
        groupedCandidates,
        identity,
        sets,
        baseMode
      });
      if (uuidResolution) return uuidResolution;

      const candidates = filterCandidates(groupedCandidates, singleSet);
      return finalize({
        status: singleSet.size === 1 ? 'MATCHED' : 'AMBIGUOUS',
        matchMode: baseMode,
        candidates,
        matchedUnitId: singleSet.size === 1 ? [...singleSet][0] : null,
        identity,
        sets
      });
    }
  }

  return resolveUuidFallback({ uuidSet, groupedCandidates, identity, sets });
}

module.exports = {
  normalizeSerial,
  normalizeUuid,
  groupMatches,
  resolveUnitIdentity
};
