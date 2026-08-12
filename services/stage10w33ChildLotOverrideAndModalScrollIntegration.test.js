'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEffectiveLotRequirements } = require('./lotRequirementInheritance');
const { buildLotRequirementFormConstraints } = require('../config/lotRequirementFormPolicy');
const { resolveLotUnitFormProfile, getResolvedUnitFormField } = require('./lotUnitFormProfileResolver');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('suppressed inherited requirements stop forcing the child Unit form while direct child configuration remains effective', () => {
  const lineage = [
    { lotId: 10, parentLotId: null, name: 'Parent' },
    { lotId: 20, parentLotId: 10, name: 'Child' }
  ];
  const effectiveRequirements = buildEffectiveLotRequirements({
    lineage,
    requirementGroups: [
      [{ lot_requirement_id: 1, requirement_key: 'battery_health', requirement_label: 'Battery Health', is_active: 1 }],
      []
    ],
    selectedLotId: 20,
    suppressedFieldKeys: ['battery_health']
  });
  const constraints = buildLotRequirementFormConstraints(effectiveRequirements, 'strict');
  const profile = resolveLotUnitFormProfile({
    lineage,
    rules: [
      { lotId: 10, fieldKey: 'battery_health', visibilityMode: 'visible', requirementMode: 'required' },
      { lotId: 20, fieldKey: 'battery_health', visibilityMode: 'visible', requirementMode: 'optional' }
    ],
    lotRequirementConstraints: constraints
  });
  const battery = getResolvedUnitFormField(profile, 'battery_health');

  assert.equal(effectiveRequirements.length, 0);
  assert.equal(constraints.length, 0);
  assert.equal(battery.visible, true);
  assert.equal(battery.required, false);
  assert.equal(battery.requirementSource.lotId, 20);
});

test('Requirements UI exposes reversible child-only Stop Inheriting controls', () => {
  const modal = read('views/fragments/lot-requirements-modal.ejs');
  const routes = read('routes/lots.js');
  const model = read('models/lotModel.js');

  assert.match(modal, /Stop Inheriting/);
  assert.match(modal, /Restore Inheritance/);
  assert.match(modal, /Parent inheritance stopped for this Lot/);
  assert.match(routes, /stop-inheriting/);
  assert.match(routes, /requirements\/inheritance\/:requirementTypeConfigValueId\/restore/);
  assert.match(model, /lot_requirement_inheritance_suppressions/);
  assert.match(model, /suppressedFieldKeys/);
});

test('Configure Unit Form uses one full modal-body scrollbar and keeps actions in normal document flow', () => {
  const css = read('public/css/lots.css');

  assert.match(css, /lot-unit-form-rules-modal\.modal-panel\.site-clean-modal > \.modal-body \{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /lot-unit-form-rules-modal\.modal-panel\.site-clean-modal \{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /lot-unit-form-rules-scroll \{[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(css, /\.lot-unit-form-rules-actions \{[\s\S]*?position:\s*(?:sticky|fixed)/);
});

test('Stage 10W33 migration preflights incompatible placeholder tables before creating suppression storage', () => {
  const migration = read('sql/2026-08-stage-10w33-lot-requirement-inheritance-suppressions.sql');

  assert.match(migration, /incompatible non-empty lot_requirement_inheritance_suppressions table/i);
  assert.match(migration, /CREATE TABLE lot_requirement_inheritance_suppressions/);
  assert.match(migration, /UNIQUE KEY uq_lot_req_inherit_suppression_lot_field/);
  assert.match(migration, /FOREIGN KEY \(lot_id\)/);
  assert.match(migration, /FOREIGN KEY \(requirement_type_config_value_id\)/);
});
