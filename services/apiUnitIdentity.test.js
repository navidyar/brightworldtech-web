'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveUnitIdentity } = require('./apiUnitIdentity');

function match({
  unitId,
  type,
  value,
  assetNumber = null,
  unitSerialNumber = '',
  biosSerialNumber = '',
  systemUuid = ''
}) {
  return {
    unitId,
    identifierTypeCode: type,
    identifierValue: value,
    normalizedValue: value,
    assetNumber,
    assetTag: assetNumber ? `BWT${assetNumber}` : '',
    lotId: 10,
    unitSerialNumber,
    biosSerialNumber,
    systemUuid
  };
}

test('returns NOT_FOUND when no supplied identity matches', () => {
  const result = resolveUnitIdentity({ unitSerialNumber: 'ABC123', matches: [] });
  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.matchMode, 'none');
  assert.equal(result.matchCount, 0);
});

test('returns MATCHED for one unique serial match', () => {
  const result = resolveUnitIdentity({
    unitSerialNumber: 'ABC123',
    matches: [match({ unitId: 7, type: 'unit_serial_number', value: 'ABC123', assetNumber: 2300007, unitSerialNumber: 'ABC123' })]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'unit_serial_only');
  assert.equal(result.matchedUnitId, 7);
});

test('requires AND across both submitted serial values before treating the serial pair as a strong match', () => {
  const result = resolveUnitIdentity({
    unitSerialNumber: 'UNIT111',
    biosSerialNumber: 'BIOS111',
    matches: [
      match({ unitId: 11, type: 'unit_serial_number', value: 'UNIT111', unitSerialNumber: 'UNIT111', biosSerialNumber: 'BIOS111' }),
      match({ unitId: 11, type: 'bios_serial_number', value: 'BIOS111', unitSerialNumber: 'UNIT111', biosSerialNumber: 'BIOS111' }),
      match({ unitId: 22, type: 'bios_serial_number', value: 'BIOS111', unitSerialNumber: 'OTHER22', biosSerialNumber: 'BIOS111' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'serial_and');
  assert.equal(result.matchedUnitId, 11);
  assert.deepEqual(result.candidates.map((candidate) => candidate.unitId), [11]);
});

test('falls back to OR candidates only after the serial AND search finds nothing', () => {
  const result = resolveUnitIdentity({
    unitSerialNumber: 'UNIT111',
    biosSerialNumber: 'BIOS222',
    matches: [
      match({ unitId: 11, type: 'unit_serial_number', value: 'UNIT111', unitSerialNumber: 'UNIT111', biosSerialNumber: 'BIOS111' }),
      match({ unitId: 22, type: 'bios_serial_number', value: 'BIOS222', unitSerialNumber: 'UNIT222', biosSerialNumber: 'BIOS222' })
    ]
  });
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.matchMode, 'serial_or_fallback');
  assert.equal(result.matchCount, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.unitId), [11, 22]);
});

test('returns AMBIGUOUS when one serial belongs to intentional duplicate candidates', () => {
  const result = resolveUnitIdentity({
    unitSerialNumber: 'DUP123',
    matches: [
      match({ unitId: 31, type: 'unit_serial_number', value: 'DUP123', unitSerialNumber: 'DUP123' }),
      match({ unitId: 32, type: 'bios_serial_number', value: 'DUP123', biosSerialNumber: 'DUP123' })
    ]
  });
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.matchCount, 2);
});

test('Asset Tag is authoritative even when supplied serial evidence points elsewhere', () => {
  const result = resolveUnitIdentity({
    assetNumber: 2300051,
    unitSerialNumber: 'OTHER52',
    matches: [
      match({ unitId: 51, type: 'asset_tag', value: '2300051', assetNumber: 2300051, unitSerialNumber: 'UNIT51' }),
      match({ unitId: 52, type: 'unit_serial_number', value: 'OTHER52', assetNumber: 2300052, unitSerialNumber: 'OTHER52' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'asset_tag_exact');
  assert.equal(result.matchedUnitId, 51);
  assert.equal(result.evidence.unit_serial_number, 'conflict');
});

test('Asset Tag disambiguates duplicate serial candidates when the labeled Unit also matches', () => {
  const result = resolveUnitIdentity({
    assetNumber: 2300041,
    unitSerialNumber: 'DUP999',
    matches: [
      match({ unitId: 41, type: 'asset_tag', value: '2300041', assetNumber: 2300041, unitSerialNumber: 'DUP999' }),
      match({ unitId: 41, type: 'unit_serial_number', value: 'DUP999', assetNumber: 2300041, unitSerialNumber: 'DUP999' }),
      match({ unitId: 42, type: 'unit_serial_number', value: 'DUP999', assetNumber: 2300042, unitSerialNumber: 'DUP999' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'asset_tag_exact');
  assert.equal(result.matchedUnitId, 41);
});

test('allows an Asset Tag match when a supplied serial is not yet stored on that Unit', () => {
  const result = resolveUnitIdentity({
    assetNumber: 2300061,
    biosSerialNumber: 'NEWBIOS61',
    matches: [
      match({ unitId: 61, type: 'asset_tag', value: '2300061', assetNumber: 2300061, unitSerialNumber: '', biosSerialNumber: '' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.evidence.bios_serial_number, 'unconfirmed');
});

test('System UUID disambiguates duplicate serial candidates', () => {
  const result = resolveUnitIdentity({
    unitSerialNumber: 'DUP777',
    systemUuid: '550e8400-e29b-41d4-a716-446655440001',
    matches: [
      match({ unitId: 71, type: 'unit_serial_number', value: 'DUP777', unitSerialNumber: 'DUP777', systemUuid: '550e8400-e29b-41d4-a716-446655440001' }),
      match({ unitId: 72, type: 'unit_serial_number', value: 'DUP777', unitSerialNumber: 'DUP777', systemUuid: '550e8400-e29b-41d4-a716-446655440002' }),
      match({ unitId: 71, type: 'system_uuid', value: '550e8400-e29b-41d4-a716-446655440001', unitSerialNumber: 'DUP777', systemUuid: '550e8400-e29b-41d4-a716-446655440001' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'unit_serial_only_uuid');
  assert.equal(result.matchedUnitId, 71);
});

test('System UUID is a strong fallback when serial matching is inconclusive', () => {
  const result = resolveUnitIdentity({
    systemUuid: '550e8400-e29b-41d4-a716-446655440003',
    matches: [
      match({ unitId: 73, type: 'system_uuid', value: '550e8400-e29b-41d4-a716-446655440003', systemUuid: '550e8400-e29b-41d4-a716-446655440003' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'uuid_fallback');
  assert.equal(result.matchedUnitId, 73);
});

test('System UUID conflict does not override an authoritative Asset Tag match', () => {
  const result = resolveUnitIdentity({
    assetNumber: 2300074,
    systemUuid: '550e8400-e29b-41d4-a716-446655440075',
    matches: [
      match({ unitId: 74, type: 'asset_tag', value: '2300074', assetNumber: 2300074, systemUuid: '550e8400-e29b-41d4-a716-446655440074' }),
      match({ unitId: 75, type: 'system_uuid', value: '550e8400-e29b-41d4-a716-446655440075', assetNumber: 2300075, systemUuid: '550e8400-e29b-41d4-a716-446655440075' })
    ]
  });
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.matchMode, 'asset_tag_exact');
  assert.equal(result.matchedUnitId, 74);
  assert.equal(result.evidence.system_uuid, 'conflict');
});
