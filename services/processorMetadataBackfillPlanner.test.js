'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProcessorMetadataPlan } = require('./processorMetadataBackfillPlanner');

function baseState(overrides = {}) {
  return {
    brands: [
      { processor_brand_id: 1, name: 'Intel', is_active: 1 },
      { processor_brand_id: 2, name: 'AMD', is_active: 1 },
      { processor_brand_id: 3, name: 'Qualcomm', is_active: 1 }
    ],
    processors: [],
    families: [],
    memberships: [],
    ...overrides
  };
}

function processor(overrides = {}) {
  return {
    processor_model_id: 10,
    processor_brand_id: 1,
    brand_name: 'Intel',
    brand_is_active: 1,
    model_code: 'i5-13500',
    processor_family: null,
    generation: null,
    base_speed_ghz: null,
    is_active: 1,
    ...overrides
  };
}

test('fills blank processor family, generation, and base GHz metadata', () => {
  const plan = buildProcessorMetadataPlan(baseState({ processors: [processor()] }));

  assert.deepEqual(plan.metadataUpdates, [{
    processorModelId: 10,
    brandName: 'Intel',
    modelCode: 'i5-13500',
    updates: {
      processorFamily: 'Core',
      generation: '13th Gen',
      baseSpeedGhz: 2.5
    }
  }]);
  assert.equal(plan.unresolvedSpeeds.length, 0);
});

test('preserves existing manually populated processor metadata', () => {
  const plan = buildProcessorMetadataPlan(baseState({
    processors: [processor({
      processor_family: 'Custom family',
      generation: 'Custom generation',
      base_speed_ghz: 9.99
    })]
  }));

  assert.deepEqual(plan.metadataUpdates, []);
});

test('plans missing standard Processor Family definitions and memberships', () => {
  const plan = buildProcessorMetadataPlan(baseState({
    processors: [processor({ model_code: 'i7-14700T' })]
  }));

  assert.deepEqual(plan.familiesToCreate.map((family) => family.code), ['intel-i7-14th-gen']);
  assert.deepEqual(plan.membershipsToCreate, [{
    processorModelId: 10,
    brandName: 'Intel',
    modelCode: 'i7-14700T',
    familyCode: 'intel-i7-14th-gen'
  }]);
});

test('does not duplicate an existing family membership', () => {
  const plan = buildProcessorMetadataPlan(baseState({
    processors: [processor()],
    families: [{
      processor_family_id: 90,
      processor_brand_id: 1,
      code: 'intel-i5-13th-gen',
      name: 'Intel i5-13th Gen',
      is_active: 1
    }],
    memberships: [{ processor_family_id: 90, processor_model_id: 10 }]
  }));

  assert.deepEqual(plan.familiesToCreate, []);
  assert.deepEqual(plan.membershipsToCreate, []);
});

test('preserves inactive Processor Family decisions', () => {
  const plan = buildProcessorMetadataPlan(baseState({
    processors: [processor()],
    families: [{
      processor_family_id: 90,
      processor_brand_id: 1,
      code: 'intel-i5-13th-gen',
      name: 'Intel i5-13th Gen',
      is_active: 0
    }]
  }));

  assert.equal(plan.blockedInactiveFamilies.length, 1);
  assert.deepEqual(plan.membershipsToCreate, []);
});

test('leaves Microsoft SQ GHz blank when no verified base clock is cataloged', () => {
  const plan = buildProcessorMetadataPlan(baseState({
    processors: [processor({
      processor_model_id: 30,
      processor_brand_id: 3,
      brand_name: 'Qualcomm',
      model_code: 'Microsoft SQ3'
    })]
  }));

  assert.deepEqual(plan.metadataUpdates[0].updates, {
    processorFamily: 'Microsoft SQ',
    generation: 'SQ3'
  });
  assert.equal(plan.unresolvedSpeeds.length, 1);
  assert.equal(plan.unresolvedSpeeds[0].modelCode, 'Microsoft SQ3');
  assert.deepEqual(plan.familiesToCreate.map((family) => family.code), ['qualcomm-microsoft-sq']);
});
