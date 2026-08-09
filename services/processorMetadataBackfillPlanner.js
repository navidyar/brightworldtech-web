'use strict';

const { classifyProcessorFamilyCodes } = require('./processorFamilyClassifier');
const { getProcessorMetadata, normalizeKey, normalizeText } = require('./processorMetadataCatalog');
const { getProcessorCoverageFamilyDefinition } = require('./processorCoverageFamilyCatalog');

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function familyMembershipKey(processorFamilyId, processorModelId) {
  return `${Number(processorFamilyId)}:${Number(processorModelId)}`;
}

function brandModelKey(brandName, modelCode) {
  return `${normalizeKey(brandName)}:${normalizeKey(modelCode)}`;
}

function buildProcessorMetadataPlan(state) {
  const activeBrands = new Map(
    state.brands
      .filter((brand) => Number(brand.is_active) === 1)
      .map((brand) => [normalizeKey(brand.name), Number(brand.processor_brand_id)])
  );
  const familyByCode = new Map(state.families.map((family) => [String(family.code || '').trim(), family]));
  const familyByBrandName = new Map(state.families.map((family) => [
    `${Number(family.processor_brand_id)}:${normalizeKey(family.name)}`,
    family
  ]));
  const membershipKeys = new Set(state.memberships.map((membership) => (
    familyMembershipKey(membership.processor_family_id, membership.processor_model_id)
  )));

  const metadataUpdates = [];
  const familiesToCreate = new Map();
  const membershipsToCreate = [];
  const blockedInactiveFamilies = [];
  const blockedFamilyConflicts = [];
  const unresolvedFamilyDefinitions = [];
  const unresolvedSpeeds = [];
  const recognizedProcessors = [];

  for (const processor of state.processors) {
    if (Number(processor.is_active) !== 1 || Number(processor.brand_is_active) !== 1) continue;

    const metadata = getProcessorMetadata(processor.model_code);
    if (!metadata || normalizeKey(metadata.brandName) !== normalizeKey(processor.brand_name)) continue;

    const processorModelId = Number(processor.processor_model_id);
    const updates = {};
    if (isBlank(processor.processor_family) && metadata.processorFamily) {
      updates.processorFamily = metadata.processorFamily;
    }
    if (isBlank(processor.generation) && metadata.generation) {
      updates.generation = metadata.generation;
    }
    if (isBlank(processor.base_speed_ghz) && metadata.baseSpeedGhz !== null) {
      updates.baseSpeedGhz = metadata.baseSpeedGhz;
    }
    if (Object.keys(updates).length > 0) {
      metadataUpdates.push({
        processorModelId,
        brandName: processor.brand_name,
        modelCode: processor.model_code,
        updates
      });
    }

    if (isBlank(processor.base_speed_ghz) && metadata.baseSpeedGhz === null) {
      unresolvedSpeeds.push({
        processorModelId,
        brandName: processor.brand_name,
        modelCode: processor.model_code,
        reason: 'No verified base clock is published in the catalog source.'
      });
    }

    const familyCodes = classifyProcessorFamilyCodes({
      brandName: processor.brand_name,
      modelCode: processor.model_code
    });
    recognizedProcessors.push({
      processorModelId,
      brandName: processor.brand_name,
      modelCode: processor.model_code,
      familyCodes
    });

    for (const familyCode of familyCodes) {
      let family = familyByCode.get(familyCode);
      if (family && Number(family.is_active) !== 1) {
        blockedInactiveFamilies.push({
          processorModelId,
          modelCode: processor.model_code,
          familyCode,
          familyName: family.name
        });
        continue;
      }

      if (!family) {
        const definition = getProcessorCoverageFamilyDefinition(familyCode);
        if (!definition) {
          unresolvedFamilyDefinitions.push({
            processorModelId,
            modelCode: processor.model_code,
            familyCode,
            reason: 'The expected standard Processor Family row is missing.'
          });
          continue;
        }
        const processorBrandId = activeBrands.get(normalizeKey(definition.brandName));
        if (!processorBrandId) {
          blockedFamilyConflicts.push({
            processorModelId,
            modelCode: processor.model_code,
            familyCode,
            reason: `${definition.brandName} processor brand is missing or inactive.`
          });
          continue;
        }

        const conflictingFamily = familyByBrandName.get(`${processorBrandId}:${normalizeKey(definition.name)}`);
        if (conflictingFamily && String(conflictingFamily.code || '').trim() !== familyCode) {
          blockedFamilyConflicts.push({
            processorModelId,
            modelCode: processor.model_code,
            familyCode,
            reason: `Family name already exists with code ${conflictingFamily.code}.`
          });
          continue;
        }

        familiesToCreate.set(familyCode, {
          ...definition,
          processorBrandId
        });
        family = { processor_family_id: null, code: familyCode, is_active: 1 };
      }

      if (family.processor_family_id && membershipKeys.has(familyMembershipKey(family.processor_family_id, processorModelId))) {
        continue;
      }
      membershipsToCreate.push({
        processorModelId,
        brandName: processor.brand_name,
        modelCode: processor.model_code,
        familyCode
      });
    }
  }

  return {
    metadataUpdates,
    familiesToCreate: [...familiesToCreate.values()],
    membershipsToCreate,
    blockedInactiveFamilies,
    blockedFamilyConflicts,
    unresolvedFamilyDefinitions,
    unresolvedSpeeds,
    recognizedProcessors,
    recognizedProcessorKeys: recognizedProcessors.map((processor) => brandModelKey(processor.brandName, processor.modelCode))
  };
}

module.exports = {
  brandModelKey,
  buildProcessorMetadataPlan,
  familyMembershipKey,
  isBlank,
  normalizeText
};
