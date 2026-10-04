'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getSystemUuidState,
  resolveUnitIdentity,
  applySelectedCandidate
} = require('./apiUnitIdentity');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function match({ unitId, type, value, systemUuid = '', unitSerialNumber = '', biosSerialNumber = '' }) {
  return {
    unitId,
    identifierTypeCode: type,
    identifierValue: value,
    normalizedValue: value,
    assetTag: `BWT${unitId}`,
    lotId: 175,
    systemUuid,
    unitSerialNumber,
    biosSerialNumber
  };
}

test('System UUID validation accepts real 128-bit values and treats malformed/null placeholders as unavailable', () => {
  assert.equal(getSystemUuidState('').reason, 'not_supplied');
  assert.equal(getSystemUuidState('886F9E6B-7576-4B67-9DEF-08F689EF89DF').usable, true);
  assert.equal(getSystemUuidState('886F9E6B75764B679DEF08F689EF89DF').usable, true);
  assert.equal(getSystemUuidState('00000000-0000-0000-0000-000000000000').reason, 'placeholder');
  assert.equal(getSystemUuidState('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF').reason, 'placeholder');
  assert.equal(getSystemUuidState('NOT-A-UUID').reason, 'malformed');

  const intake = read('services/apiUnitIntake.js');
  const inventory = read('services/apiScalarInventory.js');
  assert.doesNotMatch(intake, /'INVALID_SYSTEM_UUID'/);
  assert.match(intake, /UUID unavailable/);
  assert.match(inventory, /topLevelSystemUuidState\.usable \? rawTopLevelSystemUuid : ''/);
  assert.match(inventory, /legacySecurityUuidState\.usable \? rawLegacySecurityUuid : ''/);
});

test('explicitly selecting one of multiple identical UUID/serial candidates safely disambiguates only an actual candidate', () => {
  const uuid = '886F9E6B-7576-4B67-9DEF-08F689EF89DF';
  const serial = '5CG2390TCC';
  const matches = [
    match({ unitId: 4350, type: 'unit_serial_number', value: serial, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid }),
    match({ unitId: 4350, type: 'bios_serial_number', value: serial, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid }),
    match({ unitId: 4350, type: 'system_uuid', value: uuid, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid }),
    match({ unitId: 4353, type: 'unit_serial_number', value: serial, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid }),
    match({ unitId: 4353, type: 'bios_serial_number', value: serial, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid }),
    match({ unitId: 4353, type: 'system_uuid', value: uuid, unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid })
  ];
  const automatic = resolveUnitIdentity({ unitSerialNumber: serial, biosSerialNumber: serial, systemUuid: uuid, matches });
  assert.equal(automatic.status, 'AMBIGUOUS');
  assert.equal(automatic.matchMode, 'serial_and_uuid');

  const selected = applySelectedCandidate(automatic, 4353);
  assert.equal(selected.status, 'MATCHED');
  assert.equal(selected.matchedUnitId, 4353);
  assert.equal(selected.selectedCandidateConfirmed, true);
  assert.match(selected.matchMode, /selected_unit$/);

  const invalidSelection = applySelectedCandidate(automatic, 9999);
  assert.equal(invalidSelection.status, 'AMBIGUOUS');
});

test('direct Tool duplicate creation is forbidden for matching UUID even when the Lot allows serial duplicates', () => {
  const intake = read('services/apiUnitIntake.js');
  const preflight = read('services/apiUnitPreflight.js');
  assert.match(intake, /matching_system_uuid_requires_intentional_duplicate_approval/);
  assert.match(intake, /uuid_match_requires_approval: true/);
  assert.match(intake, /UUID_DUPLICATE_APPROVAL_REQUIRED/);
  assert.match(preflight, /const directIntentionalDuplicateAuthorized = uuidDuplicateApprovalSatisfied \|\| \(allowDuplicateWithoutApproval && !uuidDuplicateRequiresApproval\)/);
  assert.match(preflight, /code: 'UUID_DUPLICATE_APPROVAL_REQUIRED'/);
  assert.match(preflight, /Lot duplicate setting cannot bypass UUID approval/);
});

test('serial-only duplicate behavior still follows the Lot duplicate permission', () => {
  const intake = read('services/apiUnitIntake.js');
  assert.match(intake, /reason: duplicateMatchAllowed\s*\? 'lot_allows_duplicate_match_unit_assumption'/);
  assert.match(intake, /duplicate_match_creation_allowed: duplicateMatchAllowed/);
});

test('UUID is optional but Tool intake requires at least one serial identity', () => {
  const intake = read('services/apiUnitIntake.js');
  const identity = read('services/apiUnitIdentity.js');
  assert.match(intake, /if \(!unitSerialNumber && !biosSerialNumber\)/);
  assert.match(intake, /'UNIT_SERIAL_REQUIRED'/);
  assert.match(intake, /Asset Tag and System UUID are supplemental identity signals/);
  assert.match(intake, /const systemUuid = systemUuidState\.usable \? rawSystemUuid : ''/);
  assert.doesNotMatch(identity, /uuid_fallback/);
  assert.match(identity, /serial_not_found_uuid_conflict/);
});
