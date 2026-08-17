'use strict';

const {
  getCuratedProcessorCodes,
  inferProcessorDefinition,
  normalizeText
} = require('./modelProcessorCoverage');

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function pairKey(unitModelId, processorModelId) {
  return `${Number(unitModelId)}:${Number(processorModelId)}`;
}

function processorKey(brandName, modelCode) {
  return `${normalizeKey(brandName)}:${normalizeKey(modelCode)}`;
}

function buildPlan(state) {
  const brandByName = new Map(
    state.brands.map((brand) => [normalizeKey(brand.name), {
      id: Number(brand.processor_brand_id),
      name: brand.name,
      isActive: Number(brand.is_active) === 1
    }])
  );
  const processorByKey = new Map(
    state.processors.map((processor) => [processorKey(processor.brand_name, processor.model_code), {
      id: Number(processor.processor_model_id),
      brandId: Number(processor.processor_brand_id),
      brandName: processor.brand_name,
      modelCode: processor.model_code,
      isActive: Number(processor.is_active) === 1 && Number(processor.brand_is_active ?? 1) === 1
    }])
  );
  const processorById = new Map(
    state.processors.map((processor) => [Number(processor.processor_model_id), {
      id: Number(processor.processor_model_id),
      brandName: processor.brand_name,
      modelCode: processor.model_code,
      isActive: Number(processor.is_active) === 1 && Number(processor.brand_is_active ?? 1) === 1
    }])
  );
  const mappingByPair = new Map(
    state.mappings.map((mapping) => [pairKey(mapping.unit_model_id, mapping.processor_model_id), {
      isActive: Number(mapping.is_active) === 1
    }])
  );
  const historicalByModel = new Map();
  state.historicalPairs.forEach((pair) => {
    const unitModelId = Number(pair.unit_model_id);
    if (!historicalByModel.has(unitModelId)) historicalByModel.set(unitModelId, []);
    historicalByModel.get(unitModelId).push(Number(pair.processor_model_id));
  });

  const processorsToCreate = new Map();
  const mappingsToCreate = [];
  const blockedInactiveProcessors = [];
  const blockedInactiveMappings = [];
  const modelOutcomes = [];

  for (const model of state.models) {
    const unitModelId = Number(model.unit_model_id);
    const activeProcessorIds = new Set();

    for (const mapping of state.mappings) {
      if (Number(mapping.unit_model_id) !== unitModelId || Number(mapping.is_active) !== 1) continue;
      const processor = processorById.get(Number(mapping.processor_model_id));
      if (processor?.isActive) activeProcessorIds.add(processor.id);
    }

    let historicalPlanned = 0;
    for (const processorModelId of historicalByModel.get(unitModelId) || []) {
      const processor = processorById.get(processorModelId);
      if (!processor?.isActive) continue;
      const key = pairKey(unitModelId, processorModelId);
      const existing = mappingByPair.get(key);
      if (existing?.isActive) {
        activeProcessorIds.add(processorModelId);
        continue;
      }
      if (existing && !existing.isActive) {
        blockedInactiveMappings.push({
          unitModelId,
          modelName: model.model_name,
          processorModelId,
          processorCode: processor.modelCode,
          source: 'historical'
        });
        continue;
      }
      mappingsToCreate.push({
        unitModelId,
        processorModelId,
        brandName: processor.brandName,
        modelCode: processor.modelCode,
        source: 'historical'
      });
      activeProcessorIds.add(processorModelId);
      historicalPlanned += 1;
    }

    let curatedPlanned = 0;
    let curatedCodes = [];
    if (activeProcessorIds.size === 0) {
      curatedCodes = getCuratedProcessorCodes({
        manufacturerName: model.manufacturer_name,
        categoryCode: model.category_code,
        categorySystemConfigValueId: model.category_system_config_value_id,
        modelName: model.model_name
      });

      for (const code of curatedCodes) {
        const definition = inferProcessorDefinition(code);
        const brand = brandByName.get(normalizeKey(definition.brandName));
        if (brand && !brand.isActive) {
          blockedInactiveProcessors.push({
            unitModelId,
            modelName: model.model_name,
            brandName: definition.brandName,
            processorCode: code,
            reason: 'processor brand is inactive'
          });
          continue;
        }

        const key = processorKey(definition.brandName, code);
        const existingProcessor = processorByKey.get(key);
        if (existingProcessor && !existingProcessor.isActive) {
          blockedInactiveProcessors.push({
            unitModelId,
            modelName: model.model_name,
            brandName: definition.brandName,
            processorCode: code,
            reason: 'processor model is inactive'
          });
          continue;
        }

        if (!existingProcessor) processorsToCreate.set(key, definition);

        if (existingProcessor) {
          const existingMapping = mappingByPair.get(pairKey(unitModelId, existingProcessor.id));
          if (existingMapping?.isActive) {
            activeProcessorIds.add(existingProcessor.id);
            continue;
          }
          if (existingMapping && !existingMapping.isActive) {
            blockedInactiveMappings.push({
              unitModelId,
              modelName: model.model_name,
              processorModelId: existingProcessor.id,
              processorCode: code,
              source: 'curated'
            });
            continue;
          }
        }

        mappingsToCreate.push({
          unitModelId,
          processorModelId: existingProcessor?.id || null,
          brandName: definition.brandName,
          modelCode: code,
          source: 'curated'
        });
        curatedPlanned += 1;
      }
    }

    modelOutcomes.push({
      unitModelId,
      manufacturerName: model.manufacturer_name,
      categoryCode: model.category_code,
      categorySystemConfigValueId: Number(model.category_system_config_value_id || 0) || null,
      modelName: model.model_name,
      unitCount: Number(model.unit_count || 0),
      activeOptionsBefore: activeProcessorIds.size - historicalPlanned,
      historicalPlanned,
      curatedPlanned,
      curatedCodes,
      projectedOptionCount: activeProcessorIds.size + curatedPlanned
    });
  }

  return {
    processorsToCreate: [...processorsToCreate.values()],
    mappingsToCreate,
    blockedInactiveProcessors,
    blockedInactiveMappings,
    modelOutcomes
  };
}


module.exports = { buildPlan };
