const fs = require('node:fs');
const path = require('node:path');

const SHARED_THEME_PATH = '/css/theme.css';
const SHARED_APP_PATH = '/css/app.css';
const SHARED_FEATURE_PATH = '/css/features.css';
const AUTHORITATIVE_CSS_FILES = new Set(['theme.css', 'app.css', 'features.css']);
const IMPORTANT_BUDGETS = Object.freeze({
  'theme.css': 0,
  'app.css': 305,
  'features.css': 82
});

function findIndexOrFail(content, value, label, errors) {
  const index = content.indexOf(value);
  if (index === -1) {
    errors.push(`Missing ${label}: ${value}`);
  }
  return index;
}

function validateHeadTemplate(content) {
  const errors = [];
  const themeIndex = findIndexOrFail(content, SHARED_THEME_PATH, 'shared theme stylesheet', errors);
  const appIndex = findIndexOrFail(content, SHARED_APP_PATH, 'shared app stylesheet', errors);
  const featuresIndex = findIndexOrFail(content, SHARED_FEATURE_PATH, 'shared feature stylesheet', errors);

  if (themeIndex !== -1 && appIndex !== -1 && appIndex < themeIndex) {
    errors.push('app.css must load after theme.css.');
  }

  if (appIndex !== -1 && featuresIndex !== -1 && featuresIndex < appIndex) {
    errors.push('features.css must load after app.css.');
  }

  if (content.includes('stylesheets.forEach((stylesheetHref)')) {
    errors.push('Dynamic page stylesheet loading is retired; use theme.css, app.css, or features.css.');
  }

  ['/css/style.css', '/css/work-area.css'].forEach((legacyPath) => {
    if (content.includes(legacyPath)) {
      errors.push(`Head template references retired legacy stylesheet: ${legacyPath}.`);
    }
  });

  return errors;
}

function validateThemeCss(content) {
  const errors = [];
  const requiredTokens = [
    '--ui-blue',
    '--ui-modal-radius',
    '--ui-on-action',
    '--ui-space-sm',
    '--ui-radius-compact',
    '--form-field-value-ink',
    '--form-select-value-ink',
    '--work-area-bg',
    '--site-action-blue',
    '--qc-pending-ink',
    '--chart-blue',
    '--sidebar-width'
  ];

  requiredTokens.forEach((token) => {
    if (!content.includes(token)) {
      errors.push(`theme.css is missing shared token: ${token}`);
    }
  });

  ['.theme-toggle', '.sidebar', '.topbar', '.primary-button', '.form-field'].forEach((selector) => {
    if (content.includes(selector)) {
      errors.push(`theme.css must contain tokens/theme state only, not component selector: ${selector}`);
    }
  });

  const rootBlocks = content.match(/(^|\n)\s*:root\s*\{/gm) || [];
  if (rootBlocks.length !== 1) {
    errors.push('theme.css must keep global tokens in one canonical :root block.');
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
    'data-unit-form-auto-collapse',
    'label-builder-canvas',
    'label-builder-region',
    'label-builder-resize-handle',
    '.is-hidden',
    '.site-date-picker-native'
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
    '.form-field',
    '.site-clean-section',
    '.site-clean-actions',
    '.site-date-picker',
    '.table-pagination',
    '.pill',
    '.site-inline-actions',
    '.site-summary-panel',
    '.site-summary-primary',
    '.site-summary-stats',
    '.site-summary-icon',
    '.site-width-full',
    '.site-space-top-xs',
    '.site-space-top-sm',
    '.site-space-top-lg',
    '--chart-bar-width',
    '--dashboard-meter-width',
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
    '#modal-root:empty',
    ':where(.modal-backdrop)',
    'html.modal-open',
    '.tech-unit-modal',
    '.label-builder-canvas',
    '.label-builder-region',
    '.label-builder-resize-handle',
    '.is-hidden',
    '.site-date-picker-native'
  ];

  requiredTokens.forEach((token) => {
    if (!content.includes(token)) {
      errors.push(`features.css is missing protected behavior token: ${token}`);
    }
  });

  return errors;
}


function validateCanonicalTokenUsage(appContent, featuresContent) {
  const errors = [];
  const combined = `${appContent}\n${featuresContent}`.toLowerCase();
  const canonicalLiterals = [
    ['#315e9d', '--ui-blue'],
    ['#274d81', '--ui-blue-dark'],
    ['#eaf1fb', '--ui-blue-soft'],
    ['#21643b', '--ui-green'],
    ['#e9f5ed', '--ui-green-soft'],
    ['#8c2335', '--ui-red'],
    ['#fbecef', '--ui-red-soft'],
    ['#7c5900', '--ui-yellow'],
    ['#fff4d6', '--ui-yellow-soft'],
    ['#26384e', '--ui-field-ink'],
    ['#c9d6e4', '--ui-control-border'],
    ['#5f6c7c', '--ui-muted'],
    ['#6d7d90', '--ui-muted-soft'],
    ['#94a3b8', '--muted-2'],
    ['#475569', '--slate'],
    ['#f5f7fa', '--ui-page'],
    ['#28384c', '--ui-heading'],
    ['#243043', '--ui-ink'],
    ['#d8dee8', '--ui-line'],
    ['#b8c4d3', '--ui-line-strong'],
    ['#fafbfd', '--ui-surface-soft']
  ];

  canonicalLiterals.forEach(([literal, token]) => {
    if (combined.includes(literal)) {
      errors.push(`Shared CSS repeats canonical theme value ${literal}; use var(${token}) instead.`);
    }
  });

  if (combined.includes('inter, ui-sans-serif, system-ui, -apple-system, blinkmacsystemfont, "segoe ui", sans-serif')) {
    errors.push('Shared CSS repeats the canonical application font stack; use var(--ui-font-family).');
  }

  if (combined.includes('0 8px 24px rgba(29, 44, 69, 0.08)')) {
    errors.push('Shared CSS repeats the canonical panel shadow; use var(--ui-shadow).');
  }

  if (combined.includes('0 4px 14px rgba(29, 44, 69, 0.06)')) {
    errors.push('Shared CSS repeats the canonical compact shadow; use var(--ui-shadow-compact).');
  }

  return errors;
}



function validateStylesheetReferenceContract(projectRoot) {
  const errors = [];
  const viewsDirectory = path.join(projectRoot, 'views');
  const allowedFiles = new Set([
    path.join('views', 'partials', 'head.ejs'),
    path.join('views', 'pages', 'error.ejs'),
    path.join('views', 'pages', 'not-found.ejs')
  ]);
  const authoritativePaths = [SHARED_THEME_PATH, SHARED_APP_PATH, SHARED_FEATURE_PATH];

  const walk = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (!entry.name.endsWith('.ejs')) {
        return;
      }

      const relativePath = path.relative(projectRoot, absolutePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const links = [...content.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)]
        .map((match) => match[0]);

      if (links.length === 0) {
        return;
      }

      if (!allowedFiles.has(relativePath)) {
        errors.push(`${relativePath} loads stylesheet links directly; only partials/head.ejs and standalone error pages may load CSS.`);
        return;
      }

      const hrefs = links.map((link) => {
        const hrefMatch = link.match(/\bhref=["']([^"']+)["']/i);
        return hrefMatch ? hrefMatch[1].split('?')[0] : '';
      });

      hrefs.forEach((href) => {
        if (!authoritativePaths.includes(href)) {
          errors.push(`${relativePath} references unauthorized stylesheet: ${href || '(missing href)'}.`);
        }
      });

      authoritativePaths.forEach((href) => {
        const count = hrefs.filter((candidate) => candidate === href).length;
        if (count !== 1) {
          errors.push(`${relativePath} must load ${href} exactly once.`);
        }
      });

      const ordered = authoritativePaths.map((href) => hrefs.indexOf(href));
      if (ordered.every((index) => index >= 0) && !(ordered[0] < ordered[1] && ordered[1] < ordered[2])) {
        errors.push(`${relativePath} must load theme.css, app.css, then features.css in that order.`);
      }
    });
  };

  walk(viewsDirectory);
  return errors;
}

function validateCssImportContract(cssDirectory) {
  const errors = [];

  fs.readdirSync(cssDirectory)
    .filter((filename) => filename.endsWith('.css'))
    .forEach((filename) => {
      const content = fs.readFileSync(path.join(cssDirectory, filename), 'utf8');
      if (/@import\b/i.test(content)) {
        errors.push(`${filename} uses @import; all authored CSS must remain directly inside theme.css, app.css, or features.css.`);
      }
    });

  return errors;
}

function validateCssDocumentationContract(cssByFilename) {
  const errors = [];
  const retiredStylesheetPattern = /\b(?:style|work-area|modal|lots|management|tech-units-clean|tech|unit-requests|label-builder|processor-catalog-associations|copy-link|error-pages)\.css\b/i;
  const chronologyPatterns = [
    /\bReset Design\b/i,
    /\bStage\s+[A-Za-z0-9]/i,
    /\bStep\s+[A-Za-z0-9]/i,
    /\bMigrated from\b/i
  ];

  Object.entries(cssByFilename).forEach(([filename, content]) => {
    const comments = content.match(/\/\*[\s\S]*?\*\//g) || [];
    comments.forEach((comment) => {
      const compact = comment.replace(/\s+/g, ' ').trim();
      if (chronologyPatterns.some((pattern) => pattern.test(compact))) {
        errors.push(`${filename} contains development-chronology CSS documentation; describe current functional ownership instead: ${compact.slice(0, 160)}`);
      }
      if (retiredStylesheetPattern.test(compact)) {
        errors.push(`${filename} documents a retired stylesheet name; CSS comments must describe the current three-file architecture: ${compact.slice(0, 160)}`);
      }
    });
  });

  return errors;
}

function validateImportantBudget(cssByFilename) {
  const errors = [];

  Object.entries(IMPORTANT_BUDGETS).forEach(([filename, maximum]) => {
    const content = cssByFilename[filename] || '';
    const count = (content.match(/!important\b/g) || []).length;
    if (count > maximum) {
      errors.push(`${filename} exceeds the !important non-growth ceiling (${count} > ${maximum}). Prefer normal cascade/scoping or explicitly lower existing debt before adding new !important usage.`);
    }
  });

  return errors;
}

function validateRuntimeCssPropertyConsumption(projectRoot, combinedCss) {
  const errors = [];
  const viewsDirectory = path.join(projectRoot, 'views');
  const runtimeProperties = new Map();

  const walk = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (!entry.name.endsWith('.ejs')) {
        return;
      }

      const relativePath = path.relative(projectRoot, absolutePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const styleAttributePattern = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/g;
      let match;
      while ((match = styleAttributePattern.exec(content)) !== null) {
        match[2]
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .forEach((declaration) => {
            const separatorIndex = declaration.indexOf(':');
            if (separatorIndex === -1) {
              return;
            }
            const propertyName = declaration.slice(0, separatorIndex).trim();
            if (!propertyName.startsWith('--')) {
              return;
            }
            if (!runtimeProperties.has(propertyName)) {
              runtimeProperties.set(propertyName, new Set());
            }
            runtimeProperties.get(propertyName).add(relativePath);
          });
      }
    });
  };

  walk(viewsDirectory);

  runtimeProperties.forEach((paths, propertyName) => {
    const consumptionPattern = new RegExp(`var\\(\\s*${propertyName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:\\s*[,)]|\\s*\\))`);
    if (!consumptionPattern.test(combinedCss)) {
      errors.push(`Runtime CSS property ${propertyName} is injected by ${[...paths].join(', ')} but is not consumed by the shared stylesheets.`);
    }
  });

  return errors;
}

function validateGlobalTokenOwnership(cssDirectory) {
  const errors = [];

  fs.readdirSync(cssDirectory)
    .filter((filename) => filename.endsWith('.css') && filename !== 'theme.css')
    .forEach((filename) => {
      const content = fs.readFileSync(path.join(cssDirectory, filename), 'utf8');
      if (/(^|\n)\s*:root\s*\{/m.test(content)) {
        errors.push(`${filename} declares :root tokens; global tokens belong in theme.css.`);
      }
    });

  return errors;
}

function validateRetiredStylesheets(projectRoot) {
  const errors = [];
  const retiredFiles = [
    'modal.css',
    'lots.css',
    'management.css',
    'processor-catalog-associations.css',
    'copy-link.css',
    'error-pages.css',
    'tech-units-clean.css',
    'tech.css',
    'unit-requests.css',
    'label-builder.css',
    'style.css',
    'work-area.css'
  ];
  const cssDirectory = path.join(projectRoot, 'public', 'css');

  retiredFiles.forEach((filename) => {
    if (fs.existsSync(path.join(cssDirectory, filename))) {
      errors.push(`Retired stylesheet still exists: public/css/${filename}`);
    }
  });

  const viewsDirectory = path.join(projectRoot, 'views');
  const walk = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (!entry.name.endsWith('.ejs')) {
        return;
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      retiredFiles.forEach((filename) => {
        if (content.includes(`/css/${filename}`)) {
          errors.push(`${path.relative(projectRoot, absolutePath)} references retired stylesheet /css/${filename}.`);
        }
      });
    });
  };

  walk(viewsDirectory);
  return errors;
}

function validateCssDirectoryContract(cssDirectory) {
  const errors = [];
  const cssFiles = fs.readdirSync(cssDirectory).filter((filename) => filename.endsWith('.css')).sort();

  cssFiles.forEach((filename) => {
    if (!AUTHORITATIVE_CSS_FILES.has(filename)) {
      errors.push(`Unauthorized stylesheet in public/css: ${filename}. Use theme.css, app.css, or features.css.`);
    }
  });

  AUTHORITATIVE_CSS_FILES.forEach((filename) => {
    if (!cssFiles.includes(filename)) {
      errors.push(`Missing authoritative stylesheet: public/css/${filename}`);
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

function validateSharedComponentAdoption(projectRoot) {
  const errors = [];
  const checks = [
    {
      relativePath: 'views/pages/management-lots.ejs',
      tokens: ['site-summary-panel', 'site-summary-primary', 'site-summary-stats', 'site-summary-icon', 'site-inline-actions']
    },
    {
      relativePath: 'views/pages/management-lot-detail.ejs',
      tokens: ['site-summary-panel', 'site-summary-primary', 'site-summary-stats', 'site-summary-icon', 'site-inline-actions']
    },
    {
      relativePath: 'views/pages/management-label-library.ejs',
      tokens: ['site-summary-panel', 'site-summary-primary', 'site-summary-stats', 'site-summary-icon', 'site-inline-actions']
    },
    {
      relativePath: 'views/pages/management-users.ejs',
      tokens: ['site-inline-actions']
    },
    {
      relativePath: 'views/fragments/dashboard-filters.ejs',
      tokens: ['site-inline-actions']
    }
  ];

  checks.forEach(({ relativePath, tokens }) => {
    const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    tokens.forEach((token) => {
      if (!content.includes(token)) {
        errors.push(`${relativePath} must reuse shared component class: ${token}`);
      }
    });
  });

  return errors;
}


function validateTemplateInlinePresentation(projectRoot) {
  const errors = [];
  const viewsDirectory = path.join(projectRoot, 'views');

  const walk = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (!entry.name.endsWith('.ejs')) {
        return;
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = path.relative(projectRoot, absolutePath);

      if (/<style\b/i.test(content)) {
        errors.push(`${relativePath} contains an inline <style> block; use theme.css, app.css, or features.css.`);
      }

      const styleAttributePattern = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/g;
      let match;
      while ((match = styleAttributePattern.exec(content)) !== null) {
        const declarations = match[2]
          .split(';')
          .map((declaration) => declaration.trim())
          .filter(Boolean);

        declarations.forEach((declaration) => {
          const separatorIndex = declaration.indexOf(':');
          const propertyName = separatorIndex === -1
            ? declaration
            : declaration.slice(0, separatorIndex).trim();

          if (!propertyName.startsWith('--')) {
            errors.push(`${relativePath} uses static inline presentation property "${propertyName}"; inline style attributes are reserved for runtime CSS custom properties.`);
          }
        });
      }
    });
  };

  walk(viewsDirectory);
  return errors;
}

function validateSharedCssFoundation(projectRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

  errors.push(...validateHeadTemplate(read('views/partials/head.ejs')));
  errors.push(...validateThemeCss(read('public/css/theme.css')));
  const appCss = read('public/css/app.css');
  const featuresCss = read('public/css/features.css');
  errors.push(...validateSharedVisualCss(appCss));
  errors.push(...validateFeatureSafetyCss(featuresCss));
  errors.push(...validateCanonicalTokenUsage(appCss, featuresCss));
  const cssDirectory = path.join(projectRoot, 'public/css');
  errors.push(...validateGlobalTokenOwnership(cssDirectory));
  errors.push(...validateCssDirectoryContract(cssDirectory));
  errors.push(...validateCssImportContract(cssDirectory));
  errors.push(...validateImportantBudget({
    'theme.css': read('public/css/theme.css'),
    'app.css': appCss,
    'features.css': featuresCss
  }));
  errors.push(...validateCssDocumentationContract({
    'theme.css': read('public/css/theme.css'),
    'app.css': appCss,
    'features.css': featuresCss
  }));
  errors.push(...validateRetiredStylesheets(projectRoot));
  errors.push(...validatePageStylesheetPlacement(path.join(projectRoot, 'views/pages')));
  errors.push(...validateStylesheetReferenceContract(projectRoot));
  errors.push(...validateSharedComponentAdoption(projectRoot));
  errors.push(...validateTemplateInlinePresentation(projectRoot));
  errors.push(...validateRuntimeCssPropertyConsumption(projectRoot, `${read('public/css/theme.css')}\n${appCss}\n${featuresCss}`));

  return errors;
}

module.exports = {
  SHARED_THEME_PATH,
  SHARED_APP_PATH,
  SHARED_FEATURE_PATH,
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
  validateTemplateInlinePresentation,
  validateSharedCssFoundation
};
