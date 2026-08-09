'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot configuration exposes the explicit moved-in production-cycle policy', () => {
  const lotModel = read('models/lotModel.js');
  const lotController = read('controllers/lotController.js');
  const lotModal = read('views/fragments/lot-form-modal.ejs');

  assert.match(lotModel, /hasStartNewProductionCycleOnMove: hasColumn\(lotColumns, 'start_new_production_cycle_on_move'\)/);
  assert.match(lotController, /startNewProductionCycleOnMove: req\.body\.startNewProductionCycleOnMove === '1'/);
  assert.match(lotModal, /Start a new production cycle for completed Units moved into this Lot/);
  assert.match(lotModal, /physical Unit is not duplicated/);
});

test('all active-Lot move paths record production-cycle-aware Lot history before weight synchronization', () => {
  const techModel = read('models/techUnitModel.js');
  const overrideModel = read('models/overrideRequestModel.js');

  assert.match(techModel, /productionCycleModel\.recordLotMove/);
  assert.match(techModel, /allowNewProductionCycle: !wasParked/);
  assert.match(techModel, /allowNewProductionCycle: false/);
  assert.match(
    techModel,
    /recordUnitLotHistory\(connection,[\s\S]*?productionWeightSyncModel\.syncEffectiveManualCompletionWeights/
  );
  assert.match(
    overrideModel,
    /productionCycleModel\.recordLotMove\([\s\S]*?allowNewProductionCycle: !wasParked[\s\S]*?productionWeightSyncModel\.syncEffectiveManualCompletionWeights/
  );
});

test('new-cycle policy keys off existing production credit rather than current Lot completion', () => {
  const policy = read('services/productionCyclePolicy.js');
  const cycleModel = read('models/productionCycleModel.js');

  assert.match(policy, /hasCurrentProductionCredit/);
  assert.doesNotMatch(policy, /currentLotCompleted/);
  assert.match(cycleModel, /hasActiveProductionCreditForCycle/);
  assert.match(cycleModel, /productionCycleKey: currentProductionCycleKey/);
});

test('completion rows separate operational completion from production credit', () => {
  const techModel = read('models/techUnitModel.js');
  const completionModal = read('views/fragments/tech-unit-complete-work-modal.ejs');

  assert.match(techModel, /insertColumns\.push\('production_cycle_key'\)/);
  assert.match(techModel, /insertColumns\.push\('grants_production_credit'\)/);
  assert.match(techModel, /Existing production cycle retained — no additional unit or weight credit/);
  assert.match(completionModal, /no additional unit or weight/);
  assert.match(completionModal, /grantsProductionCredit/);
});

test('productivity dashboard counts production-credit rows instead of every operational completion', () => {
  const dashboardModel = read('models/dashboardModel.js');
  const techModel = read('models/techUnitModel.js');

  assert.match(dashboardModel, /grants_production_credit = 1/);
  assert.match(techModel, /productionCreditFilter[\s\S]*grants_production_credit = 1/);
});

test('weight synchronization follows only the current credited production cycle', () => {
  const syncModel = read('models/productionWeightSyncModel.js');

  assert.match(syncModel, /loadCurrentProductionCycleKeys/);
  assert.match(syncModel, /grants_production_credit = 1/);
  assert.match(syncModel, /production:initial:/);
  assert.match(syncModel, /currentProductionCycleKeys\.get/);
});

test('migration preserves existing metrics and prevents two active credits for one new production cycle', () => {
  const migration = read('scripts/migrateProductionCycles.js');

  assert.match(migration, /start_new_production_cycle_on_move/);
  assert.match(migration, /starts_new_production_cycle/);
  assert.match(migration, /production_cycle_key/);
  assert.match(migration, /grants_production_credit/);
  assert.match(migration, /CONCAT\('legacy:', unit_id, ':', unit_work_completion_id\)/);
  assert.match(migration, /grants_production_credit = 1/);
  assert.match(migration, /uniq_unit_work_completions_active_production_credit/);
  assert.doesNotMatch(migration, /DELETE FROM unit_work_completions/);
});

test('package provides separate audit, apply, and validation commands', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(packageJson.scripts['audit:production-cycles'], 'node scripts/migrateProductionCycles.js');
  assert.equal(packageJson.scripts['migrate:production-cycles'], 'node scripts/migrateProductionCycles.js --apply');
  assert.match(packageJson.scripts['validate:production-cycles'], /stage10w22ProductionCyclesIntegration\.test\.js/);
});
