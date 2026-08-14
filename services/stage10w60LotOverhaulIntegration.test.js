'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Lot assignability is explicit and safely migrated from the legacy hierarchy rule', () => {
  const migration = read('scripts/migrateLotAssignability.js');
  const lotModel = read('models/lotModel.js');
  const lotFormModal = read('views/fragments/lot-form-modal.ejs');

  assert.match(migration, /ADD COLUMN is_assignable TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(migration, /SELECT DISTINCT parent_lot_id[\s\S]*?SET l\.is_assignable = CASE WHEN parent_ids\.parent_lot_id IS NULL THEN 1 ELSE 0 END/);
  assert.match(migration, /--apply/);
  assert.match(migration, /Parent Lots already holding direct Units/);
  assert.match(migration, /Existing direct Units in parent Lots will remain in place/);
  assert.match(lotModel, /hasAssignableState: hasColumn\(lotColumns, 'is_assignable'\)/);
  assert.match(lotModel, /addColumn\('is_assignable', isAssignable\)/);
  assert.match(lotFormModal, /Allow Units to be assigned directly to this Lot/);
});

test('Unit assignment workflows prefer is_assignable and only use leaf behavior as pre-migration fallback', () => {
  const techUnitModel = read('models/techUnitModel.js');
  const overrideRequestModel = read('models/overrideRequestModel.js');
  const unitRequestModel = read('models/unitRequestModel.js');
  const techController = read('controllers/techController.js');

  assert.match(techUnitModel, /lot\.is_assignable !== null[\s\S]*?return Number\(lot\.is_assignable\) === 1/);
  assert.match(overrideRequestModel, /lot\.is_assignable !== null[\s\S]*?return Number\(lot\.is_assignable\) === 1/);
  assert.match(unitRequestModel, /const isAssignable = lot && lot\.is_assignable !== null[\s\S]*?!isAssignable/);
  assert.doesNotMatch(techController, /Units can only be assigned to lots that do not have child lots/);
  assert.match(techController, /not open, visible, and assignable/);
});

test('Lot Browser and Lot Details distinguish direct Units from descendant-inclusive totals', () => {
  const lotModel = read('models/lotModel.js');
  const lotsPage = read('views/pages/management-lots.ejs');
  const detailPage = read('views/pages/management-lot-detail.ejs');

  assert.match(lotModel, /directUnitCount/);
  assert.match(lotModel, /descendantUnitCount/);
  assert.match(lotsPage, /Incl\. descendants:/);
  assert.match(detailPage, /Direct Units/);
  assert.match(detailPage, /Incl\. Descendants/);
  assert.match(detailPage, /Unit Assignments/);
});

test('Tech Unit Browser supports explicit direct and descendant Lot scopes', () => {
  const techController = read('controllers/techController.js');
  const techUnitModel = read('models/techUnitModel.js');
  const techUnitsPage = read('views/pages/tech-units.ejs');
  const pagination = read('views/partials/table-pagination.ejs');

  assert.match(techController, /lotScope: String\(req\.query\.lotScope/);
  assert.match(techUnitModel, /filters\.lotScope[\s\S]*?lotModel\.listDescendantLotIds\(lotId\)[\s\S]*?const scopedLotIds = \[lotId, \.\.\.descendantLotIds\]/);
  assert.match(techUnitsPage, /This Lot only/);
  assert.match(techUnitsPage, /This Lot \+ descendants/);
  assert.match(pagination, /'lotScope'/);
});

test('Duplicate Lot is Management-only, starts hidden, and excludes Units and operational history', () => {
  const routes = read('routes/lots.js');
  const controller = read('controllers/lotController.js');
  const lotModel = read('models/lotModel.js');
  const duplicateModal = read('views/fragments/lot-duplicate-modal.ejs');

  assert.match(routes, /'\/management\/lots\/:lotId\/duplicate\/modal'[\s\S]*?requireRole\(lotManagementRoles\)/);
  assert.match(routes, /'\/management\/lots\/:lotId\/duplicate'[\s\S]*?requireRole\(lotManagementRoles\)/);
  assert.match(controller, /lotModel\.duplicateLot/);
  assert.match(lotModel, /normalizeLotDuplicationInheritanceMode/);
  assert.match(lotModel, /preserve_source/);
  assert.match(lotModel, /new_parent/);
  assert.match(lotModel, /await connection\.beginTransaction\(\)/);
  assert.match(lotModel, /await connection\.rollback\(\)/);
  assert.match(lotModel, /createLot\(duplicateFormData, currentUserId, \{ connection \}\)/);
  assert.match(duplicateModal, /Configuration is copied from/);
  assert.doesNotMatch(duplicateModal, /Copy Summary/);
  assert.doesNotMatch(duplicateModal, /0 copied/);
});

test('preserve-source duplication materializes and verifies effective Requirements and Unit Form behavior', () => {
  const lotModel = read('models/lotModel.js');

  assert.match(lotModel, /sourceEffectiveRequirements/);
  assert.match(lotModel, /buildMaterializedUnitFormRules\(sourceEffectiveUnitFormProfile\)/);
  assert.match(lotModel, /copyRequirementInheritanceSuppressionsForPreservedBehavior/);
  assert.match(lotModel, /buildRequirementBehaviorSignature\(targetEffectiveRequirements\)/);
  assert.match(lotModel, /buildUnitFormBehaviorSignature\(targetEffectiveUnitFormProfile\)/);
  assert.match(lotModel, /No Lot was created/);
});
