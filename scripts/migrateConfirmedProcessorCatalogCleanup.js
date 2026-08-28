'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const processorCatalogModel = require('../models/processorCatalogModel');

const APPLY = process.argv.includes('--apply');
const AMD_PROCESSOR_ID = 246;
const INTEL_DUPLICATE_ID = 241;
const INTEL_CANONICAL_ID = 52;
const AMD_MOBILE_DUPLICATE_ID = 242;
const AMD_MOBILE_CANONICAL_ID = 74;
const INTEL_I9_ID = 245;
const INTEL_I9_FAMILY_NAME = 'Intel i9-9th Gen';

function assertProcessor(processor, { id, brandName, allowedModelCodes }) {
  if (!processor) {
    throw new Error(`Expected processor #${id} was not found.`);
  }
  if (processor.brandName !== brandName || !allowedModelCodes.includes(processor.modelCode)) {
    throw new Error(
      `Processor #${id} is ${processor.brandName} ${processor.modelCode}; refusing an unexpected catalog change.`
    );
  }
}

function printProcessor(label, processor) {
  if (!processor) {
    console.log(`${label}: already absent`);
    return;
  }
  console.log(
    `${label}: #${processor.id} ${processor.brandName} ${processor.modelCode}; `
    + `${processor.unitCount} Unit(s), ${processor.unitModelCount} model option(s), `
    + `${processor.processorFamilyCount} family membership(s)`
  );
}

async function loadState() {
  const [amd, intelDuplicate, intelCanonical, amdMobileDuplicate, amdMobileCanonical, intelI9] = await Promise.all([
    processorCatalogModel.getProcessorById(AMD_PROCESSOR_ID),
    processorCatalogModel.getProcessorById(INTEL_DUPLICATE_ID),
    processorCatalogModel.getProcessorById(INTEL_CANONICAL_ID),
    processorCatalogModel.getProcessorById(AMD_MOBILE_DUPLICATE_ID),
    processorCatalogModel.getProcessorById(AMD_MOBILE_CANONICAL_ID),
    processorCatalogModel.getProcessorById(INTEL_I9_ID)
  ]);
  assertProcessor(amd, {
    id: AMD_PROCESSOR_ID,
    brandName: 'AMD',
    allowedModelCodes: ['5650GE', 'Ryzen 5 PRO 5650GE']
  });
  assertProcessor(intelCanonical, {
    id: INTEL_CANONICAL_ID,
    brandName: 'Intel',
    allowedModelCodes: ['Core Ultra 7 165U']
  });
  if (intelDuplicate) {
    assertProcessor(intelDuplicate, {
      id: INTEL_DUPLICATE_ID,
      brandName: 'Intel',
      allowedModelCodes: ['Ultra 7 165U']
    });
  }
  assertProcessor(amdMobileCanonical, {
    id: AMD_MOBILE_CANONICAL_ID,
    brandName: 'AMD',
    allowedModelCodes: ['Ryzen 5 PRO 5650U']
  });
  if (amdMobileDuplicate) {
    assertProcessor(amdMobileDuplicate, {
      id: AMD_MOBILE_DUPLICATE_ID,
      brandName: 'AMD',
      allowedModelCodes: ['5650U']
    });
  }
  assertProcessor(intelI9, {
    id: INTEL_I9_ID,
    brandName: 'Intel',
    allowedModelCodes: ['i9-9900']
  });
  return { amd, intelDuplicate, intelCanonical, amdMobileDuplicate, amdMobileCanonical, intelI9 };
}

async function main() {
  const before = await loadState();
  console.log(`\nConfirmed processor catalog cleanup (${APPLY ? 'preflight before apply' : 'dry-run'})`);
  printProcessor('AMD normalization', before.amd);
  printProcessor('Intel duplicate source', before.intelDuplicate);
  printProcessor('Intel canonical target', before.intelCanonical);
  printProcessor('AMD mobile duplicate source', before.amdMobileDuplicate);
  printProcessor('AMD mobile canonical target', before.amdMobileCanonical);
  printProcessor('Intel i9-9900 correction', before.intelI9);

  if (!APPLY) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
    return;
  }

  if (before.amd.modelCode === '5650GE') {
    await processorCatalogModel.updateProcessorModel(AMD_PROCESSOR_ID, {
      processorBrandId: before.amd.processorBrandId,
      modelCode: 'Ryzen 5 PRO 5650GE',
      legacyFamily: 'Ryzen PRO',
      generation: '5000 Series',
      baseSpeedGhz: 3.4,
      isActive: before.amd.isActive
    });
    console.log('Normalized AMD processor #246.');
  } else {
    console.log('AMD processor #246 was already normalized.');
  }

  if (before.intelDuplicate) {
    const result = await processorCatalogModel.mergeProcessorModels({
      sourceProcessorModelId: INTEL_DUPLICATE_ID,
      targetProcessorModelId: INTEL_CANONICAL_ID
    });
    console.log(`Merged Intel processor #241 into #52: ${JSON.stringify(result.affected)}.`);
  } else {
    console.log('Intel processor #241 was already merged.');
  }

  if (before.amdMobileDuplicate) {
    const result = await processorCatalogModel.mergeProcessorModels({
      sourceProcessorModelId: AMD_MOBILE_DUPLICATE_ID,
      targetProcessorModelId: AMD_MOBILE_CANONICAL_ID
    });
    console.log(`Merged AMD processor #${AMD_MOBILE_DUPLICATE_ID} into #${AMD_MOBILE_CANONICAL_ID}: ${JSON.stringify(result.affected)}.`);
  } else {
    console.log(`AMD processor #${AMD_MOBILE_DUPLICATE_ID} was already merged.`);
  }

  const intelI9NeedsCorrection = Number(before.intelI9.baseSpeedGhz) !== 3.1
    || before.intelI9.legacyFamily !== 'Core'
    || before.intelI9.generation !== '9th Gen'
    || !before.intelI9.processorFamilyLabels.includes(INTEL_I9_FAMILY_NAME);
  if (intelI9NeedsCorrection) {
    await processorCatalogModel.updateProcessorModel(INTEL_I9_ID, {
      processorBrandId: before.intelI9.processorBrandId,
      modelCode: 'i9-9900',
      legacyFamily: 'Core',
      generation: '9th Gen',
      baseSpeedGhz: 3.1,
      isActive: before.intelI9.isActive
    });
    console.log(`Corrected Intel processor #${INTEL_I9_ID} and assigned its standard Processor Family.`);
  } else {
    console.log(`Intel processor #${INTEL_I9_ID} was already corrected.`);
  }

  const after = await loadState();
  if (
    after.amd.modelCode !== 'Ryzen 5 PRO 5650GE'
    || after.amd.generation !== '5000 Series'
    || Number(after.amd.baseSpeedGhz) !== 3.4
    || after.intelDuplicate
    || after.amdMobileDuplicate
    || Number(after.intelI9.baseSpeedGhz) !== 3.1
    || !after.intelI9.processorFamilyLabels.includes(INTEL_I9_FAMILY_NAME)
  ) {
    throw new Error('Confirmed processor cleanup verification failed.');
  }
  console.log('\nConfirmed processor catalog cleanup applied successfully.');
  printProcessor('AMD normalized', after.amd);
  printProcessor('Intel canonical', after.intelCanonical);
  printProcessor('AMD mobile canonical', after.amdMobileCanonical);
  printProcessor('Intel i9-9900 corrected', after.intelI9);
}

main()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
