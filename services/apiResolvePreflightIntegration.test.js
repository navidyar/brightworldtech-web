'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('existing Resolve endpoint is augmented with authenticated read-only Preflight context', () => {
  const controller = read('controllers/apiUnitController.js');
  const intake = read('services/apiUnitIntake.js');
  assert.match(controller, /preflightContext:[\s\S]*userId: req\.apiUser\.user_id[\s\S]*roleCodes: req\.apiUser\.roles[\s\S]*toolSource: req\.apiToolSource/);
  assert.match(intake, /response\.preflight = await apiUnitPreflight\.buildPreflight/);
});

test('Preflight reuses server-owned identity, Lot Tool policy, and Lot requirement services', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.match(source, /resolveLotToolPolicy/);
  assert.match(source, /techLotRequirementModel\.buildWorkflowForForm/);
  assert.match(source, /const allLots = await lotModel\.listLots\(\{ includeHidden: true \}\);/);
  assert.match(source, /techUnitModel\.getAssignableLots\(allLots\)/);
  assert.doesNotMatch(source, /techUnitModel\.getAssignableLots\(\s*\)/);
  assert.match(source, /techUnitModel\.assertLotMovePermission/);
  assert.match(source, /unitExpandedFormModel\.getExpandedFormDataByUnitId/);
  assert.match(source, /current_lot:/);
  assert.doesNotMatch(source, /PREVIOUS_MEMORY_REQUIRED|PREVIOUS_STORAGE_REQUIRED|previous_component_requirements/);
  assert.doesNotMatch(source, /lotUnitFormProfileModel|getResolvedUnitFormField/);
});

test('Preflight is read-only and does not call Unit mutation or production-cycle APIs', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.doesNotMatch(source, /createTechUnit|updateTechUnit|assignTechUnit|assumeExistingTechUnitFromDuplicateMatch|recordUnitWorkCompletion|reverseUnitWorkCompletion|productionCycleModel|productionWeightModel/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+units|DELETE\s+FROM/i);
});

test('rejections include universal restoration guidance without guessing ambiguous identity configuration', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.match(source, /configuration_known: false/);
  assert.match(source, /Restore any physical Memory or Storage changes/);
  assert.match(source, /memory: summarizeMemory/);
  assert.match(source, /storage: summarizeStorage/);
});

test('no preflight id, work session, orphan Unit, or API-controlled production cycle is introduced', () => {
  const source = read('services/apiUnitPreflight.js');
  assert.doesNotMatch(source, /preflight_id|work_session|pending_observation|orphan|production_cycle_key/i);
});



test('Lot strictness and Lot field visibility never gate Tool data acquisition', () => {
  const preflight = read('services/apiUnitPreflight.js');
  const scalarInventory = read('services/apiScalarInventory.js');
  assert.doesNotMatch(preflight, /LOT_REQUIREMENTS_BLOCKED/);
  assert.match(preflight, /LOT_REQUIREMENTS_NOT_SATISFIED/);
  assert.match(preflight, /LOT_REQUIREMENTS_INCOMPLETE/);
  assert.doesNotMatch(scalarInventory, /lotUnitFormProfileModel|getResolvedUnitFormField|unitFormSubmissionPolicy/);
});

function helperBoundaryRuntimeStubs() {
  const lot = {
    lot_id: 127,
    lot_name: '#Alltherequirements',
    parent_lot_id: null,
    allow_duplicate_unit_assumption: 0,
    requirement_policy_code: 'strict'
  };
  const formOptions = {
    lots: [lot],
    unitCategories: [
      { id: 7, label: 'Laptop' },
      { id: 8, label: 'Desktop' }
    ],
    manufacturers: [],
    unitModels: [],
    processorBrands: [],
    processorModels: [],
    ramTypes: [],
    memoryInstallTypes: [],
    storageTypes: [],
    storageWipeStatuses: []
  };
  const techUnitModel = {
    findDuplicateUnitsForForm: async () => [],
    getTechUnitFormOptions: async () => formOptions,
    getAssignableLots: (lots) => lots,
    getBlankUnitFormData: () => ({
      unitCategoryConfigValueId: '',
      manufacturerId: '',
      unitModelId: '',
      processorModelId: '',
      memoryModules: [],
      storageDevices: []
    })
  };
  const unitExpandedFormModel = {
    getExpandedFormOptions: async () => ({}),
    getBlankExpandedFormData: () => ({})
  };
  const workflow = async ({ formData }) => {
    const categoryId = Number(formData.unitCategoryConfigValueId || 0);
    const categoryCheck = {
      requirementKey: 'unit_type',
      requirementLabel: 'Unit Type',
      requiredValue: 'Laptop',
      actualValue: categoryId === 8 ? 'Desktop' : categoryId === 7 ? 'Laptop' : '—',
      status: categoryId === 7 ? 'accepted' : 'rejected',
      message: categoryId === 7 ? 'Unit Type matches.' : 'Unit Type does not match.'
    };
    const manufacturerCheck = {
      requirementKey: 'manufacturer',
      requirementLabel: 'Manufacturer',
      requiredValue: 'Dell',
      actualValue: '—',
      status: 'rejected',
      message: 'The unit has no recorded manufacturer value.'
    };
    return {
      checks: [categoryCheck, manufacturerCheck],
      strictBlocked: true,
      technicalFailure: true,
      managementAccepted: false,
      policyCode: 'strict',
      saveAllowed: false,
      message: 'Correct the highlighted Unit values or choose another Lot before saving.'
    };
  };
  return {
    lot,
    stubs: new Map([
      ['../models/techUnitModel', techUnitModel],
      ['../models/unitExpandedFormModel', unitExpandedFormModel],
      ['../models/unitAuditEventModel', {}],
      ['../models/lotModel', { listLots: async () => [lot] }],
      ['../models/techLotRequirementModel', { buildWorkflowForForm: workflow }],
      ['./unitAuditSnapshot', { buildUnitFormAuditEvent: () => ({}) }]
    ])
  };
}

async function withHelperBoundaryRuntime(run) {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const { stubs } = helperBoundaryRuntimeStubs();
  const intakePath = require.resolve('./apiUnitIntake');
  const preflightPath = require.resolve('./apiUnitPreflight');
  delete require.cache[intakePath];
  delete require.cache[preflightPath];
  Module._load = function loadHelperBoundaryRuntimeDependencies(request, parent, isMain) {
    if (stubs.has(request)) return stubs.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { resolveUnit } = require('./apiUnitIntake');
    await run(resolveUnit);
  } finally {
    Module._load = originalLoad;
    delete require.cache[intakePath];
    delete require.cache[preflightPath];
  }
}

test('Strict Lot missing fields remain informational while a valid Tool prerequisite allows continuation', async () => {
  await withHelperBoundaryRuntime(async (resolveUnit) => {
    const result = await resolveUnit({
      lot_id: 127,
      unit_serial_number: 'HELPER-BOUNDARY-MISSING-001',
      bios_serial_number: 'HELPER-BOUNDARY-MISSING-BIOS-001',
      unit_category_config_value_id: 7
    }, {
      preflightContext: { userId: 7, roleCodes: ['tech'], toolSource: 'techtools' }
    });

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.preflight.can_proceed, true);
    assert.equal(result.preflight.blockers.length, 0);
    assert.equal(result.preflight.requirements.save_allowed_by_existing_lot_policy, false);
    assert.ok(result.preflight.warnings.some((entry) => entry.code === 'LOT_REQUIREMENTS_INCOMPLETE'));
  });
});

test('Strict Lot known noncompliance is reported but never blocks the helper Tool', async () => {
  await withHelperBoundaryRuntime(async (resolveUnit) => {
    const result = await resolveUnit({
      lot_id: 127,
      unit_serial_number: 'HELPER-BOUNDARY-FAIL-001',
      bios_serial_number: 'HELPER-BOUNDARY-FAIL-BIOS-001',
      unit_category_config_value_id: 8
    }, {
      preflightContext: { userId: 7, roleCodes: ['tech'], toolSource: 'techtools' }
    });

    assert.equal(result.preflight.can_proceed, true);
    assert.equal(result.preflight.requirements.status, 'FAIL');
    assert.equal(result.preflight.blockers.length, 0);
    assert.ok(result.preflight.warnings.some((entry) => entry.code === 'LOT_REQUIREMENTS_NOT_SATISFIED'));
  });
});

test('new Unit creation still blocks on Unit Category because it is a Tool processing prerequisite', async () => {
  await withHelperBoundaryRuntime(async (resolveUnit) => {
    const result = await resolveUnit({
      lot_id: 127,
      unit_serial_number: 'HELPER-BOUNDARY-CATEGORY-001',
      bios_serial_number: 'HELPER-BOUNDARY-CATEGORY-BIOS-001'
    }, {
      preflightContext: { userId: 7, roleCodes: ['tech'], toolSource: 'techtools' }
    });

    assert.equal(result.preflight.can_proceed, false);
    assert.ok(result.preflight.blockers.some((entry) => entry.code === 'UNIT_CATEGORY_REQUIRED'));
    assert.equal(result.preflight.blockers.some((entry) => entry.code === 'LOT_REQUIREMENTS_BLOCKED'), false);
  });
});

test('explicit Intentional Duplicate confirmation evaluates a blank new-Unit preflight rather than mutating a matched Unit', () => {
  const intake = read('services/apiUnitIntake.js');
  const preflight = read('services/apiUnitPreflight.js');
  assert.match(intake, /intentionalDuplicate: normalizeBoolean\(body\.confirm_duplicate_match_creation/);
  assert.match(preflight, /const matchedUnitId = !intentionalDuplicateRequested/);
  assert.match(preflight, /action: 'intentional_duplicate'/);
  assert.match(preflight, /INTENTIONAL_DUPLICATE_MATCH_REQUIRED/);
});

test('Resolve + Preflight executes detected catalog issue evaluation for a missing Tool-observed Model', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  const lot = {
    lot_id: 91,
    lot_name: 'ELS Test',
    parent_lot_id: null,
    allow_duplicate_unit_assumption: 0
  };
  const formOptions = {
    lots: [lot],
    unitCategories: [{ id: 10, label: 'Desktop' }],
    manufacturers: [{ id: 1, label: 'Dell' }],
    unitModels: [],
    processorBrands: [],
    processorModels: [],
    ramTypes: [],
    memoryInstallTypes: [],
    storageTypes: [],
    storageWipeStatuses: []
  };
  const techUnitModel = {
    findDuplicateUnitsForForm: async () => [],
    getTechUnitFormOptions: async () => formOptions,
    getAssignableLots: (lots) => lots,
    getBlankUnitFormData: () => ({
      unitCategoryConfigValueId: '',
      manufacturerId: '',
      unitModelId: '',
      processorModelId: '',
      memoryModules: [],
      storageDevices: []
    })
  };
  const unitExpandedFormModel = {
    getExpandedFormOptions: async () => ({}),
    getBlankExpandedFormData: () => ({})
  };
  const stubs = new Map([
    ['../models/techUnitModel', techUnitModel],
    ['../models/unitExpandedFormModel', unitExpandedFormModel],
    ['../models/unitAuditEventModel', {}],
    ['../models/lotModel', { listLots: async () => [lot] }],
    ['../models/techLotRequirementModel', {
      buildWorkflowForForm: async () => ({
        checks: [],
        strictBlocked: false,
        technicalFailure: false,
        policyCode: null,
        saveAllowed: true
      })
    }],
    ['./unitAuditSnapshot', { buildUnitFormAuditEvent: () => ({}) }]
  ]);

  const intakePath = require.resolve('./apiUnitIntake');
  const preflightPath = require.resolve('./apiUnitPreflight');
  delete require.cache[intakePath];
  delete require.cache[preflightPath];
  Module._load = function loadResolveRuntimeDependencies(request, parent, isMain) {
    if (stubs.has(request)) return stubs.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { resolveUnit } = require('./apiUnitIntake');
    const result = await resolveUnit({
      lot_id: 91,
      unit_serial_number: 'MJOJH675',
      bios_serial_number: 'MJOJH675',
      unit_category_config_value_id: 10,
      fields: {
        manufacturer: 'Dell',
        unit_model: 'Retired Model 123'
      }
    }, {
      preflightContext: {
        userId: 7,
        roleCodes: ['tech'],
        toolSource: 'techtools'
      }
    });

    assert.equal(result.status, 'NOT_FOUND');
    assert.equal(result.preflight.catalog_issues.length, 1);
    assert.equal(result.preflight.catalog_issues[0].code, 'MODEL_NOT_AVAILABLE');
    assert.equal(result.preflight.catalog_issues[0].request_supported, true);
    assert.ok(result.preflight.blockers.some((entry) => entry.code === 'MODEL_NOT_AVAILABLE'));

    const processorWithoutModel = await resolveUnit({
      lot_id: 91,
      unit_serial_number: 'PROCESSOR-PREREQ-001',
      bios_serial_number: 'PROCESSOR-PREREQ-BIOS-001',
      unit_category_config_value_id: 10,
      fields: {
        processor_model: 'Intel Core i7-1185G7'
      }
    }, {
      preflightContext: {
        userId: 7,
        roleCodes: ['tech'],
        toolSource: 'techtools'
      }
    });
    assert.ok(processorWithoutModel.preflight.blockers.some((entry) => entry.code === 'PROCESSOR_CONTEXT_UNRESOLVED'));


    // Unit-form requiredness remains an application-side/manual-workflow concern.
    // Tool Resolve must stay helper-oriented and must not require Previous Memory/Storage.
    const helperOnly = await resolveUnit({
      lot_id: 91,
      unit_serial_number: 'HELPER-ONLY-001',
      bios_serial_number: 'HELPER-ONLY-BIOS-001',
      unit_category_config_value_id: 10
    }, {
      preflightContext: {
        userId: 7,
        roleCodes: ['tech'],
        toolSource: 'techtools'
      }
    });

    assert.equal(helperOnly.preflight.can_proceed, true);
    assert.equal(helperOnly.preflight.blockers.some((entry) => entry.code === 'PREVIOUS_MEMORY_REQUIRED'), false);
    assert.equal(helperOnly.preflight.blockers.some((entry) => entry.code === 'PREVIOUS_STORAGE_REQUIRED'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(helperOnly.preflight, 'previous_component_requirements'), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[intakePath];
    delete require.cache[preflightPath];
  }
});
