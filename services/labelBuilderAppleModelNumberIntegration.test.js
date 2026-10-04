'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { findLabelField } = require('../config/labelFieldRegistry');
const { buildRepresentativeFieldValues } = require('./labelTemplateReadinessService');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Apple Model Number is a supported Label Builder data source with representative content', () => {
  const field = findLabelField('unit.apple_model_number');
  assert.ok(field);
  assert.equal(field.label, 'Apple Model Number');
  assert.equal(field.groupCode, 'catalog');
  assert.equal(field.sampleValue, 'A2141');
  assert.equal(buildRepresentativeFieldValues()['unit.apple_model_number'], 'A2141');
});

test('production field mapping keeps Apple Model Number distinct from the generic Unit Model', () => {
  const printing = read('services/labelLibraryPrintingService.js');
  assert.match(printing, /'unit\.model': String\(unit\.modelName \|\| ''\)\.trim\(\)/);
  assert.match(printing, /'unit\.apple_model_number': String\(unit\.appleModelNumber \|\| ''\)\.trim\(\)/);
});

test('Label Builder and production label paths hydrate the existing Apple specification source', () => {
  const model = read('models/unitSpecsTestsModel.js');
  const libraryController = read('controllers/labelLibraryController.js');
  const techController = read('controllers/techController.js');
  const printing = read('services/labelLibraryPrintingService.js');

  assert.match(model, /async function getAppleModelNumberByUnitId/);
  assert.match(model, /columns\.has\('apple_model_number'\)/);
  assert.match(model, /SELECT apple_model_number FROM unit_specifications WHERE unit_id = \? LIMIT 1/);
  assert.match(printing, /getAppleModelNumberByUnitId\(unit\.unitId\)/);
  assert.equal((libraryController.match(/hydrateLabelUnitFieldSources\(unit\)/g) || []).length, 3);
  const printContextStart = techController.indexOf('async function getTechUnitPrintLabelContext');
  const printContextEnd = techController.indexOf('\n\nasync function buildLabelPrintTemplateOptions', printContextStart);
  assert.match(techController.slice(printContextStart, printContextEnd), /hydrateLabelUnitFieldSources\(baseUnit\)/);
  const qcContextStart = techController.indexOf('async function getQcReviewContext');
  const qcContextEnd = techController.indexOf('\n\nasync function renderQcReviewModal', qcContextStart);
  assert.doesNotMatch(techController.slice(qcContextStart, qcContextEnd), /hydrateLabelUnitFieldSources/);
});
