'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

test('abandoned import/sample-analysis routes and UI are removed', () => {
  const routes = read('routes/management.js');
  const controller = read('controllers/labelLibraryController.js');
  const page = read('views/pages/management-label-library.ejs');

  assert.doesNotMatch(routes, /label-library\/import|sample-analysis|generate-layout|test-render/);
  assert.doesNotMatch(controller, /labelTemplateImport|labelSample|DifferentUnit|GeneratedTemplateLayout/);
  assert.doesNotMatch(page, /Import Sample PNG|Analyze Sample|Review Analysis|Review \/ Verify|Needs Verification/);
});

test('abandoned pre-pivot implementation files are deleted', () => {
  const removedFiles = [
    'public/js/label-template-import.js',
    'public/js/label-sample-region-editor.js',
    'views/fragments/label-template-import-modal.ejs',
    'views/fragments/label-template-analysis-modal.ejs',
    'services/labelTemplateImportService.js',
    'services/labelSampleAnalysisService.js',
    'services/labelSampleGraphicExtractionService.js',
    'services/labelStructuredLayoutService.js',
    'scripts/auditLabelTemplateImportD1.js',
    'scripts/auditLabelSampleAnalysisD2.js',
    'scripts/auditLabelSampleGraphicExtractionD2B.js',
    'scripts/auditLabelSampleRegionCorrectionD2C.js',
    'scripts/auditLabelSampleFieldMappingD3A.js',
    'scripts/auditLabelSampleCodeMappingD3B.js',
    'scripts/auditLabelStructuredLayoutD3C.js',
    'scripts/auditLabelDifferentUnitTestRenderD4A.js',
    'scripts/seedLabelLibraryPhaseB.js'
  ];

  for (const relativePath of removedFiles) {
    assert.equal(exists(relativePath), false, `${relativePath} should be removed`);
  }
});

test('persistent asset contract is config JSON plus reusable PNG/SVG assets only', () => {
  const config = require('../config/labelLibrary');
  const storage = read('services/labelAssetStorage.js');

  assert.deepEqual(config.LABEL_ASSET_KINDS, ['logo', 'image', 'background', 'config_json']);
  assert.deepEqual(config.LABEL_ASSET_ROLES, ['logo', 'image', 'background', 'config_json']);
  assert.match(storage, /'application\/json': '\.json'/);
  assert.match(storage, /'image\/png': '\.png'/);
  assert.match(storage, /'image\/svg\+xml': '\.svg'/);
  assert.doesNotMatch(storage, /image\/jpeg|\.jpg/);
});

test('no persisted flattened label preview or imported_at remains in core foundation', () => {
  const foundation = read('scripts/migrateLabelLibraryFoundation.js');
  const model = read('models/labelLibraryModel.js');
  const page = read('views/pages/management-label-library.ejs');

  assert.doesNotMatch(foundation, /imported_at/);
  assert.doesNotMatch(model, /preview_asset_id|preview_bytes|original_sample|sample_analysis|background_candidate/);
  assert.doesNotMatch(page, /preview_asset_id|Imported sample|original_sample/);
});

test('cleanup migration protects production history while removing legacy workflow state', () => {
  const migration = read('scripts/migrateLabelBuilderPivotCleanup.js');
  const audit = read('scripts/auditLabelBuilderPivotCleanup.js');

  assert.match(migration, /lot_assignment_count/);
  assert.match(migration, /print_history_count/);
  assert.match(migration, /String\(template\.status\) === 'active'/);
  assert.match(migration, /autoDetachTemplates/);
  assert.match(migration, /DELETE FROM lot_label_template_sets WHERE lot_id IN/);
  assert.match(migration, /reset this Lot to label inheritance/);
  assert.match(migration, /DROP COLUMN imported_at/);
  assert.match(migration, /deleteContentAddressedAsset/);
  assert.match(migration, /SAMPLE_TEMPLATE_ROLES/);
  assert.match(audit, /Reusable image assets outside PNG\/SVG/);
  assert.match(audit, /Persistent label state is template metadata \+ config_json \+ reusable PNG\/SVG assets/);
});

test('Label Library core and physical print path remain intact', () => {
  const page = read('views/pages/management-label-library.ejs');
  const assetsSection = read('views/fragments/label-library-assets-section.ejs');
  const printingLibrary = read('services/labelLibraryPrintingService.js');
  const printingService = read('services/labelPrintingService.js');
  const packageJson = JSON.parse(read('package.json'));

  assert.match(assetsSection, /Shared Assets/);
  assert.match(assetsSection, /\/management\/label-library\/assets\/<%= asset\.asset_id %>\/preview\/modal/);
  assert.match(printingLibrary, /config_json/);
  assert.match(printingService, /\/usr\/bin\/lp/);
  assert.ok(packageJson.scripts['validate:label-library-phase-c7b']);
  assert.ok(packageJson.scripts['validate:label-builder-pivot-cleanup']);
  assert.doesNotMatch(JSON.stringify(packageJson.scripts), /label-library-phase-d[1-4]/i);
});
