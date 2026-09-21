const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateHeadTemplate,
  validateThemeCss,
  validateSharedVisualCss,
  validateFeatureSafetyCss,
  validateCanonicalTokenUsage,
  validateStylesheetReferenceContract,
  validateCssImportContract,
  validateImportantBudget,
  validateCssDocumentationContract,
  validateRuntimeCssPropertyConsumption,
  validateGlobalTokenOwnership,
  validateCssDirectoryContract,
  validateRetiredStylesheets,
  validatePageStylesheetPlacement,
  validateSharedComponentAdoption,
  validateTemplateInlinePresentation
} = require('./sharedCssFoundationValidator');

test('head template uses only the three authoritative shared stylesheets in order', () => {
  const valid = `
    /css/theme.css?v=any-cache-key
    /css/app.css?v=another-cache-key
    /css/features.css?v=feature-cache-key
  `;
  assert.deepEqual(validateHeadTemplate(valid), []);

  const invalidOrder = `
    /css/app.css?v=another-cache-key
    /css/theme.css?v=any-cache-key
    /css/features.css?v=feature-cache-key
  `;
  assert.ok(validateHeadTemplate(invalidOrder).some((error) => error.includes('after theme.css')));

  const dynamic = `${valid} stylesheets.forEach((stylesheetHref) => {})`;
  assert.ok(validateHeadTemplate(dynamic).some((error) => error.includes('Dynamic page stylesheet loading is retired')));

  const legacy = `${valid} /css/style.css /css/work-area.css`;
  assert.ok(validateHeadTemplate(legacy).some((error) => error.includes('retired legacy stylesheet')));
});

test('theme CSS owns tokens/theme state without component presentation', () => {
  const tokens = '--ui-blue:x; --ui-modal-radius:x; --ui-on-action:x; --ui-space-sm:x; --ui-radius-compact:x; --form-field-value-ink:x; --form-select-value-ink:x; --work-area-bg:x; --site-action-blue:x; --qc-pending-ink:x; --chart-blue:x; --sidebar-width:x;';
  const valid = `:root { ${tokens} }`;
  assert.deepEqual(validateThemeCss(valid), []);
  assert.ok(validateThemeCss(':root { --ui-blue:x; }').length > 0);
  assert.ok(validateThemeCss(`${valid} .sidebar {}`).some((error) => error.includes('component selector')));
  assert.ok(validateThemeCss(`${valid}\n:root { --duplicate-root: 1; }`).some((error) => error.includes('one canonical :root block')));
});

test('shared visual CSS rejects protected feature selectors', () => {
  const valid = '--ui-blue: #315e9d; --ui-scrollbar-thumb:#6f88a5; --chart-bar-width:0%; --dashboard-meter-width:0%; ::-webkit-scrollbar{} .primary-button{} .secondary-button{} .danger-button{} .modal-panel{} .table-card{} .form-section{} .form-field{} .site-clean-section{} .site-clean-actions{} .site-date-picker{} .table-pagination{} .pill{} .site-inline-actions{} .site-summary-panel{} .site-summary-primary{} .site-summary-stats{} .site-summary-icon{} .site-width-full{} .site-space-top-xs{} .site-space-top-sm{} .site-space-top-lg{}';
  assert.deepEqual(validateSharedVisualCss(valid), []);

  const invalid = `${valid} .lot-tree-toggle{}`;
  assert.ok(validateSharedVisualCss(invalid).some((error) => error.includes('lot-tree-toggle')));
  assert.ok(validateSharedVisualCss(`${valid} .is-hidden{}`).some((error) => error.includes('.is-hidden')));
  assert.ok(validateSharedVisualCss(`${valid} .site-date-picker-native{}`).some((error) => error.includes('.site-date-picker-native')));
});

test('feature safety CSS requires protected hidden-state rules', () => {
  const valid = `
    [hidden]{}
    .management-lots-table tr.lot-tree-row-hidden{}
    .tech-unit-form [data-unit-form-field-key][hidden]{}
    #modal-root:empty{}
    :where(.modal-backdrop){}
    html.modal-open{}
    .tech-unit-modal{}
    .label-builder-canvas{}
    .label-builder-region{}
    .label-builder-resize-handle{}
    .is-hidden{}
    .site-date-picker-native{}
  `;
  assert.deepEqual(validateFeatureSafetyCss(valid), []);
  assert.ok(validateFeatureSafetyCss('[hidden]{}').length > 0);
});


test('shared CSS reuses canonical theme values instead of hard-coding them', () => {
  const valid = '.button { color: var(--ui-blue); border-color: var(--ui-control-border); font-family: var(--ui-font-family); box-shadow: var(--ui-shadow); }';
  assert.deepEqual(validateCanonicalTokenUsage(valid, ''), []);

  const invalid = '.button { color: #315e9d; border-color: #c9d6e4; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }';
  const errors = validateCanonicalTokenUsage(invalid, '');
  assert.ok(errors.some((error) => error.includes('#315e9d')));
  assert.ok(errors.some((error) => error.includes('#c9d6e4')));
  assert.ok(errors.some((error) => error.includes('font stack')));
});

test('global :root tokens are owned only by theme.css', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-tokens-'));
  fs.writeFileSync(path.join(directory, 'theme.css'), ':root { --token: 1; }');
  fs.writeFileSync(path.join(directory, 'app.css'), '.button { color: red; }');
  assert.deepEqual(validateGlobalTokenOwnership(directory), []);

  fs.writeFileSync(path.join(directory, 'features.css'), ':root { --bad-token: 1; }');
  assert.ok(validateGlobalTokenOwnership(directory).some((error) => error.includes('features.css')));
});

test('public/css contains exactly the three authoritative stylesheets', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-contract-'));
  ['theme.css', 'app.css', 'features.css'].forEach((filename) => fs.writeFileSync(path.join(directory, filename), ''));
  assert.deepEqual(validateCssDirectoryContract(directory), []);

  fs.writeFileSync(path.join(directory, 'page.css'), '.page{}');
  assert.ok(validateCssDirectoryContract(directory).some((error) => error.includes('Unauthorized stylesheet')));

  fs.unlinkSync(path.join(directory, 'features.css'));
  assert.ok(validateCssDirectoryContract(directory).some((error) => error.includes('Missing authoritative stylesheet')));
});

test('retired standalone stylesheets cannot return through files or view references', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-retired-'));
  fs.mkdirSync(path.join(projectRoot, 'public', 'css'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'views', 'pages'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'views', 'pages', 'page.ejs'), '<div></div>');
  assert.deepEqual(validateRetiredStylesheets(projectRoot), []);

  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'modal.css'), '.modal{}');
  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'lots.css'), '.lots{}');
  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'tech-units-clean.css'), '.units{}');
  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'label-builder.css'), '.builder{}');
  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'style.css'), '.legacy{}');
  fs.writeFileSync(path.join(projectRoot, 'public', 'css', 'work-area.css'), '.legacy{}');
  fs.writeFileSync(path.join(projectRoot, 'views', 'pages', 'page.ejs'), '<link href="/css/lots.css"><link href="/css/tech-units-clean.css"><link href="/css/label-builder.css">');
  const errors = validateRetiredStylesheets(projectRoot);
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists')));
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists: public/css/lots.css')));
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists: public/css/tech-units-clean.css')));
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists: public/css/label-builder.css')));
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists: public/css/style.css')));
  assert.ok(errors.some((error) => error.includes('Retired stylesheet still exists: public/css/work-area.css')));
  assert.ok(errors.some((error) => error.includes('references retired stylesheet /css/tech-units-clean.css')));
  assert.ok(errors.some((error) => error.includes('references retired stylesheet /css/label-builder.css')));
  assert.ok(errors.some((error) => error.includes('references retired stylesheet')));
});

test('representative pages reuse canonical shared summary and action components', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-components-'));
  const files = {
    'views/pages/management-lots.ejs': 'site-summary-panel site-summary-primary site-summary-stats site-summary-icon site-inline-actions',
    'views/pages/management-lot-detail.ejs': 'site-summary-panel site-summary-primary site-summary-stats site-summary-icon site-inline-actions',
    'views/pages/management-label-library.ejs': 'site-summary-panel site-summary-primary site-summary-stats site-summary-icon site-inline-actions',
    'views/pages/management-users.ejs': 'site-inline-actions',
    'views/fragments/dashboard-filters.ejs': 'site-inline-actions'
  };

  Object.entries(files).forEach(([relativePath, content]) => {
    const absolutePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  });

  assert.deepEqual(validateSharedComponentAdoption(projectRoot), []);

  fs.writeFileSync(path.join(projectRoot, 'views/pages/management-lots.ejs'), 'site-summary-panel');
  assert.ok(validateSharedComponentAdoption(projectRoot).some((error) => error.includes('management-lots.ejs')));
});


test('templates keep static presentation out of inline style attributes', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-inline-'));
  const viewsDirectory = path.join(projectRoot, 'views');
  fs.mkdirSync(path.join(viewsDirectory, 'pages'), { recursive: true });

  fs.writeFileSync(
    path.join(viewsDirectory, 'pages', 'valid.ejs'),
    '<div style="--runtime-width: <%= width %>%; --runtime-color: <%= color %>;"></div>'
  );
  assert.deepEqual(validateTemplateInlinePresentation(projectRoot), []);

  fs.writeFileSync(
    path.join(viewsDirectory, 'pages', 'invalid.ejs'),
    '<div style="margin-top: 12px; --runtime-width: 50%;"></div><style>.bad{color:red}</style>'
  );
  const errors = validateTemplateInlinePresentation(projectRoot);
  assert.ok(errors.some((error) => error.includes('margin-top')));
  assert.ok(errors.some((error) => error.includes('inline <style> block')));
});

test('normal pages do not load page CSS after the shared head partial', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-pages-'));
  fs.writeFileSync(path.join(directory, 'normal.ejs'), '<%- include("head") %>');
  fs.writeFileSync(path.join(directory, 'error.ejs'), '<link rel="stylesheet" href="/css/error.css">');
  assert.deepEqual(validatePageStylesheetPlacement(directory), []);

  fs.writeFileSync(path.join(directory, 'broken.ejs'), '<link rel="stylesheet" href="/css/broken.css">');
  assert.ok(validatePageStylesheetPlacement(directory).some((error) => error.includes('broken.ejs')));
});


test('stylesheet links cannot bypass the shared head or three-file order', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-links-'));
  const files = {
    'views/partials/head.ejs': '<link rel="stylesheet" href="/css/theme.css?v=1"><link rel="stylesheet" href="/css/app.css?v=1"><link rel="stylesheet" href="/css/features.css?v=1">',
    'views/pages/error.ejs': '<link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/features.css">',
    'views/pages/not-found.ejs': '<link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/features.css">',
    'views/pages/normal.ejs': '<%- include("../partials/head") %>'
  };
  Object.entries(files).forEach(([relativePath, content]) => {
    const absolutePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  });
  assert.deepEqual(validateStylesheetReferenceContract(projectRoot), []);

  const fragmentPath = path.join(projectRoot, 'views/fragments/broken.ejs');
  fs.mkdirSync(path.dirname(fragmentPath), { recursive: true });
  fs.writeFileSync(fragmentPath, '<link rel="stylesheet" href="/css/app.css">');
  assert.ok(validateStylesheetReferenceContract(projectRoot).some((error) => error.includes('loads stylesheet links directly')));

  fs.unlinkSync(fragmentPath);
  fs.writeFileSync(path.join(projectRoot, 'views/pages/error.ejs'), '<link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/features.css"><link rel="stylesheet" href="/css/rogue.css">');
  let errors = validateStylesheetReferenceContract(projectRoot);
  assert.ok(errors.some((error) => error.includes('unauthorized stylesheet')));
  assert.ok(errors.some((error) => error.includes('must load theme.css, app.css, then features.css')));

  fs.writeFileSync(path.join(projectRoot, 'views/pages/error.ejs'), '<link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/app.css">');
  errors = validateStylesheetReferenceContract(projectRoot);
  assert.ok(errors.some((error) => error.includes('must load /css/features.css exactly once')));
});

test('shared CSS cannot bypass the three-file boundary with @import', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-imports-'));
  fs.writeFileSync(path.join(directory, 'theme.css'), ':root{}');
  fs.writeFileSync(path.join(directory, 'app.css'), '.button{}');
  fs.writeFileSync(path.join(directory, 'features.css'), '.feature{}');
  assert.deepEqual(validateCssImportContract(directory), []);

  fs.writeFileSync(path.join(directory, 'app.css'), '@import url("page.css");');
  assert.ok(validateCssImportContract(directory).some((error) => error.includes('@import')));
});

test('important usage has a non-growth ceiling in each authoritative stylesheet', () => {
  const withinBudget = {
    'theme.css': '',
    'app.css': '.a{color:red!important;}'.repeat(305),
    'features.css': '.b{display:none!important;}'.repeat(82)
  };
  assert.deepEqual(validateImportantBudget(withinBudget), []);

  const overBudget = { ...withinBudget, 'app.css': `${withinBudget['app.css']} .extra{color:red!important;}` };
  assert.ok(validateImportantBudget(overBudget).some((error) => error.includes('non-growth ceiling')));
});

test('CSS comments describe current functional ownership instead of development chronology', () => {
  const valid = {
    'theme.css': '/* Global design tokens. */',
    'app.css': '/* Unit Browser presentation. */',
    'features.css': '/* Lot hierarchy mechanics. */'
  };
  assert.deepEqual(validateCssDocumentationContract(valid), []);

  const historical = {
    ...valid,
    'app.css': '/* Stage 10W99 — old rollout note. */ /* Migrated from lots.css. */'
  };
  const errors = validateCssDocumentationContract(historical);
  assert.ok(errors.some((error) => error.includes('development-chronology')));
  assert.ok(errors.some((error) => error.includes('retired stylesheet')));
});

test('runtime CSS custom properties injected by templates must be consumed by shared CSS', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-css-runtime-vars-'));
  const viewsDirectory = path.join(projectRoot, 'views', 'pages');
  fs.mkdirSync(viewsDirectory, { recursive: true });
  fs.writeFileSync(path.join(viewsDirectory, 'page.ejs'), '<div style="--runtime-width: <%= width %>%;"></div>');

  assert.deepEqual(validateRuntimeCssPropertyConsumption(projectRoot, '.bar{width:var(--runtime-width, 0%);}'), []);
  assert.ok(validateRuntimeCssPropertyConsumption(projectRoot, '.bar{width:50%;}').some((error) => error.includes('--runtime-width')));
});
