'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RUNTIME_DIRS = ['models', 'controllers', 'routes', 'services'];

function walk(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) return [];
    return [relativePath];
  });
}

function findConfigAliases(source, tableName) {
  const aliases = new Set();
  const pattern = new RegExp(`\\b(?:FROM|JOIN)\\s+${tableName}\\s+(?:AS\\s+)?([A-Za-z_][A-Za-z0-9_]*)`, 'gi');
  for (const match of source.matchAll(pattern)) aliases.add(match[1]);
  return aliases;
}

function findForbiddenConfigCodeReferences(relativePath, source) {
  const failures = [];
  for (const tableName of ['config_values', 'config_categories']) {
    if (new RegExp(`\\b${tableName}\\s*\\.\\s*code\\b`, 'i').test(source)) {
      failures.push(`${relativePath}: direct ${tableName}.code reference`);
    }
    for (const alias of findConfigAliases(source, tableName)) {
      if (new RegExp(`\\b${alias}\\s*\\.\\s*code\\b`, 'i').test(source)) {
        failures.push(`${relativePath}: ${alias}.code references ${tableName}.code`);
      }
    }
  }
  return failures;
}

test('runtime application code does not depend on config category/value code columns', () => {
  const failures = RUNTIME_DIRS
    .flatMap(walk)
    .flatMap((relativePath) => findForbiddenConfigCodeReferences(
      relativePath,
      fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    ));

  assert.deepEqual(failures, []);
});

test('active maintenance scripts remain compatible after config code columns are removed', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const referencedScripts = new Set();
  for (const command of Object.values(packageJson.scripts || {})) {
    for (const match of String(command).matchAll(/(?:node|bash)\s+([^\s;&]+\.(?:js|sh))/g)) {
      referencedScripts.add(match[1]);
    }
  }

  const failures = [];
  for (const relativePath of referencedScripts) {
    if (relativePath === 'scripts/migrateConfigIdentities.js') continue;
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    failures.push(...findForbiddenConfigCodeReferences(relativePath, fs.readFileSync(absolutePath, 'utf8')));
  }
  assert.deepEqual(failures, []);
});

test('configuration value editor does not expose a mutable Code field', () => {
  const form = fs.readFileSync(path.join(ROOT, 'views/fragments/config-value-form-modal.ejs'), 'utf8');
  assert.doesNotMatch(form, /name=["']code["']/i);
  assert.doesNotMatch(form, />\s*Code\s*</i);
  assert.match(form, /database ID remains unchanged/i);
});
