'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const techUnitModel = require('../models/techUnitModel');
const { buildUnitWeightBrowserPresentation } = require('../services/unitWeightBrowserPresentation');

async function main() {
  const [rows] = await pool.query(
    `SELECT unit_id, is_parked, production_weight_override
     FROM units
     WHERE production_weight_override IS NOT NULL
     ORDER BY updated_at DESC, unit_id DESC
     LIMIT 1`
  );
  const stored = rows[0];

  if (!stored) {
    throw new Error('No Unit with an individual production-weight override exists. Save one override, then rerun this validator.');
  }

  const result = await techUnitModel.listTechUnits({
    unitId: String(stored.unit_id),
    unitState: Number(stored.is_parked || 0) === 1 ? 'parked' : 'active',
    page: '1',
    perPage: '10',
    restrictToCurrentAssignment: false,
    canViewParkedUnits: true,
    canSearchParkedUnits: true,
    allowAnyLotFilter: true
  });
  const unit = Array.isArray(result.units)
    ? result.units.find((entry) => Number(entry.unitId) === Number(stored.unit_id))
    : null;

  if (!unit) {
    throw new Error(`Unit #${stored.unit_id} was not returned by the Unit Browser data path.`);
  }

  const presentation = buildUnitWeightBrowserPresentation(unit);
  const expected = Number(stored.production_weight_override).toFixed(2);

  if (!presentation.showIndividualWeightPill) {
    throw new Error(`Unit #${stored.unit_id} has stored override ${expected}, but the Unit Browser pill is disabled.`);
  }

  if (presentation.formattedIndividualWeightPill !== expected) {
    throw new Error(
      `Unit #${stored.unit_id} has stored override ${expected}, but the Unit Browser prepared ${presentation.formattedIndividualWeightPill}.`
    );
  }

  console.log('Unit Browser individual-weight pill live path passed.');
  console.log(`Unit ID: ${stored.unit_id}`);
  console.log(`Stored override: ${expected}`);
  console.log(`Rendered pill value: ${presentation.formattedIndividualWeightPill}`);
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
