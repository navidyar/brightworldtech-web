const fs = require('node:fs');
const path = require('node:path');

const SHARED_THEME_PATH = '/css/theme.css';
const SHARED_APP_PATH = '/css/app.css';
const SHARED_FEATURE_PATH = '/css/features.css';

function findIndexOrFail(content, value, label, errors) {
  const index = content.indexOf(value);
  if (index === -1) {
    errors.push(`Missing ${label}: ${value}`);
  }
  return index;
}

function validateHeadTemplate(content) {
  const errors = [];
  const pageStylesIndex = findIndexOrFail(
    content,
    'stylesheets.forEach((stylesheetHref)',
    'page stylesheet loop',
    errors
  );
  const themeIndex = findIndexOrFail(content, SHARED_THEME_PATH, 'shared theme stylesheet', errors);
  const appIndex = findIndexOrFail(content, SHARED_APP_PATH, 'shared app stylesheet', errors);
  const featuresIndex = findIndexOrFail(content, SHARED_FEATURE_PATH, 'shared feature stylesheet', errors);

  if (themeIndex !== -1 && appIndex !== -1 && appIndex < themeIndex) {
    errors.push('app.css must load after theme.css.');
  }

  if (pageStylesIndex !== -1 && appIndex !== -1 && appIndex < pageStylesIndex) {
    errors.push('app.css must load after legacy/page stylesheets.');
  }

  if (appIndex !== -1 && featuresIndex !== -1 && featuresIndex < appIndex) {
    errors.push('features.css must load after app.css.');
  }

  return errors;
}

function validateSharedVisualCss(content) {
  const errors = [];
  const protectedTokens = [
    'lot-tree-toggle',
    'lot-tree-row-hidden',
    'data-unit-form-field-key',
    'data-unit-form-follows-key',
    'data-unit-form-auto-collapse'
  ];

  protectedTokens.forEach((token) => {
    if (content.includes(token)) {
      errors.push(`app.css must not style protected feature token: ${token}`);
    }
  });

  const requiredTokens = [
    '--ui-blue',
    '.primary-button',
    '.secondary-button',
    '.danger-button',
    '.modal-panel',
    '.table-card',
    '.form-section',
    '::-webkit-scrollbar',
    '--ui-scrollbar-thumb'
  ];

  requiredTokens.forEach((token) => {
    if (!content.includes(token)) {
      errors.push(`app.css is missing shared visual contract token: ${token}`);
    }
  });

  return errors;
}

function validateFeatureSafetyCss(content) {
  const errors = [];
  const requiredTokens = [
    '[hidden]',
    '.management-lots-table tr.lot-tree-row-hidden',
    '.tech-unit-form [data-unit-form-field-key][hidden]',
    '#modal-root:empty'
  ];

  requiredTokens.forEach((token) => {
    if (!content.includes(token)) {
      errors.push(`features.css is missing protected behavior token: ${token}`);
    }
  });

  return errors;
}

function validatePageStylesheetPlacement(pagesDirectory) {
  const errors = [];
  const allowedStandalonePages = new Set(['error.ejs', 'not-found.ejs']);

  fs.readdirSync(pagesDirectory)
    .filter((filename) => filename.endsWith('.ejs'))
    .forEach((filename) => {
      if (allowedStandalonePages.has(filename)) {
        return;
      }

      const content = fs.readFileSync(path.join(pagesDirectory, filename), 'utf8');
      if (/<link\s+rel=["']stylesheet["']/i.test(content)) {
        errors.push(`${filename} loads a stylesheet outside partials/head.ejs.`);
      }
    });

  return errors;
}

function validateSharedCssFoundation(projectRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

  errors.push(...validateHeadTemplate(read('views/partials/head.ejs')));
  errors.push(...validateSharedVisualCss(read('public/css/app.css')));
  errors.push(...validateFeatureSafetyCss(read('public/css/features.css')));
  errors.push(...validatePageStylesheetPlacement(path.join(projectRoot, 'views/pages')));

  return errors;
}

module.exports = {
  SHARED_THEME_PATH,
  SHARED_APP_PATH,
  SHARED_FEATURE_PATH,
  validateHeadTemplate,
  validateSharedVisualCss,
  validateFeatureSafetyCss,
  validatePageStylesheetPlacement,
  validateSharedCssFoundation
};
