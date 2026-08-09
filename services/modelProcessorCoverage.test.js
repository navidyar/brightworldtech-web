'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCuratedProcessorCodes,
  inferProcessorDefinition
} = require('./modelProcessorCoverage');

test('Dell OptiPlex form factors receive generation-appropriate common processors', () => {
  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Dell',
      categoryCode: 'desktop',
      modelName: 'OptiPlex 3040 Small Form Factor'
    }),
    ['i3-6100', 'i5-6500', 'i7-6700']
  );

  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Dell',
      categoryCode: 'desktop',
      modelName: 'OptiPlex 7010 Micro'
    }),
    ['i3-12100T', 'i5-12500T', 'i7-12700T', 'i3-13100T', 'i5-13500T', 'i7-13700T']
  );
});



test('Dell transition-generation OptiPlex models expose both documented processor generations', () => {
  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Dell',
      categoryCode: 'desktop',
      modelName: 'OptiPlex 5090 Micro'
    }),
    ['i3-10100T', 'i5-10500T', 'i7-10700T', 'i5-11500T', 'i7-11700T']
  );
});

test('Dell Latitude and Precision variants no longer lose processor coverage because of suffixes', () => {
  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Dell',
      categoryCode: 'laptop',
      modelName: 'Latitude 5320 2-in-1'
    }),
    ['i5-1135G7', 'i5-1145G7', 'i7-1185G7']
  );

  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Dell',
      categoryCode: 'laptop',
      modelName: 'Precision 7560'
    }),
    ['i5-11400H', 'i7-11800H', 'Xeon W-11955M']
  );
});

test('Lenovo ThinkPad prefixes and generation names resolve to their common processor generations', () => {
  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Lenovo',
      categoryCode: 'laptop',
      modelName: 'ThinkPad T480'
    }),
    ['i5-8250U', 'i5-8350U', 'i7-8650U']
  );

  assert.deepEqual(
    getCuratedProcessorCodes({
      manufacturerName: 'Lenovo',
      categoryCode: 'laptop',
      modelName: 'ThinkPad T14 Gen 4'
    }),
    ['i5-1335U', 'i5-1345U', 'i7-1365U']
  );
});

test('Chromebook fallback is available for catalog models added after the original seed', () => {
  const processors = getCuratedProcessorCodes({
    manufacturerName: 'Dell',
    categoryCode: 'chrome',
    modelName: 'Chromebook Custom Education Model'
  });

  assert.ok(processors.includes('Celeron N4000'));
  assert.ok(processors.includes('Celeron N4500'));
  assert.ok(processors.includes('i5-10210U'));
});

test('new processor definitions preserve the correct processor brand and family', () => {
  assert.deepEqual(inferProcessorDefinition('i5-13500'), {
    brandName: 'Intel',
    modelCode: 'i5-13500',
    processorFamily: 'Core',
    generation: '13th Gen',
    baseSpeedGhz: 2.5
  });
  assert.deepEqual(inferProcessorDefinition('Ryzen 7 8845HS'), {
    brandName: 'AMD',
    modelCode: 'Ryzen 7 8845HS',
    processorFamily: 'Ryzen',
    generation: '8000 Series',
    baseSpeedGhz: 3.8
  });
  assert.deepEqual(inferProcessorDefinition('Microsoft SQ3'), {
    brandName: 'Qualcomm',
    modelCode: 'Microsoft SQ3',
    processorFamily: 'Microsoft SQ',
    generation: 'SQ3',
    baseSpeedGhz: null
  });
  assert.equal(inferProcessorDefinition('Core Ultra 7 155H').processorFamily, 'Core Ultra');
});

test('coverage planning learns historical pairs before using curated fallback choices', () => {
  const { buildPlan } = require('./modelProcessorCoveragePlanner');
  const state = {
    models: [{
      unit_model_id: 10,
      model_name: 'OptiPlex 3040 Small Form Factor',
      manufacturer_name: 'Dell',
      category_code: 'desktop',
      unit_count: 4
    }],
    brands: [{ processor_brand_id: 1, name: 'Intel', is_active: 1 }],
    processors: [{
      processor_model_id: 20,
      processor_brand_id: 1,
      brand_name: 'Intel',
      model_code: 'i5-6500',
      is_active: 1
    }],
    mappings: [],
    historicalPairs: [{ unit_model_id: 10, processor_model_id: 20 }]
  };

  const plan = buildPlan(state);
  assert.equal(plan.mappingsToCreate.length, 1);
  assert.equal(plan.mappingsToCreate[0].source, 'historical');
  assert.equal(plan.modelOutcomes[0].curatedPlanned, 0);
  assert.equal(plan.processorsToCreate.length, 0);
});

test('coverage planning adds curated choices only when no active or historical choice exists', () => {
  const { buildPlan } = require('./modelProcessorCoveragePlanner');
  const state = {
    models: [{
      unit_model_id: 11,
      model_name: 'OptiPlex 3040 Small Form Factor',
      manufacturer_name: 'Dell',
      category_code: 'desktop',
      unit_count: 0
    }],
    brands: [{ processor_brand_id: 1, name: 'Intel', is_active: 1 }],
    processors: [],
    mappings: [],
    historicalPairs: []
  };

  const plan = buildPlan(state);
  assert.deepEqual(
    plan.mappingsToCreate.map((mapping) => mapping.modelCode),
    ['i3-6100', 'i5-6500', 'i7-6700']
  );
  assert.ok(plan.mappingsToCreate.every((mapping) => mapping.source === 'curated'));
  assert.equal(plan.processorsToCreate.length, 3);
});

test('coverage planning does not add curated choices when an active compatible processor already exists', () => {
  const { buildPlan } = require('./modelProcessorCoveragePlanner');
  const state = {
    models: [{
      unit_model_id: 12,
      model_name: 'OptiPlex 3040 Small Form Factor',
      manufacturer_name: 'Dell',
      category_code: 'desktop',
      unit_count: 2
    }],
    brands: [{ processor_brand_id: 1, name: 'Intel', is_active: 1 }],
    processors: [{
      processor_model_id: 21,
      processor_brand_id: 1,
      brand_name: 'Intel',
      brand_is_active: 1,
      model_code: 'i5-6500',
      is_active: 1
    }],
    mappings: [{ unit_model_id: 12, processor_model_id: 21, is_active: 1 }],
    historicalPairs: []
  };

  const plan = buildPlan(state);
  assert.equal(plan.mappingsToCreate.length, 0);
  assert.equal(plan.processorsToCreate.length, 0);
  assert.equal(plan.modelOutcomes[0].activeOptionsBefore, 1);
});

test('coverage planning preserves inactive brands and inactive compatibility mappings', () => {
  const { buildPlan } = require('./modelProcessorCoveragePlanner');
  const state = {
    models: [{
      unit_model_id: 13,
      model_name: 'OptiPlex 3040 Small Form Factor',
      manufacturer_name: 'Dell',
      category_code: 'desktop',
      unit_count: 1
    }],
    brands: [{ processor_brand_id: 1, name: 'Intel', is_active: 0 }],
    processors: [{
      processor_model_id: 22,
      processor_brand_id: 1,
      brand_name: 'Intel',
      brand_is_active: 0,
      model_code: 'i5-6500',
      is_active: 1
    }],
    mappings: [{ unit_model_id: 13, processor_model_id: 22, is_active: 0 }],
    historicalPairs: [{ unit_model_id: 13, processor_model_id: 22 }]
  };

  const plan = buildPlan(state);
  assert.equal(plan.mappingsToCreate.length, 0);
  assert.ok(plan.blockedInactiveProcessors.length >= 1);
  assert.equal(plan.modelOutcomes[0].projectedOptionCount, 0);
});
