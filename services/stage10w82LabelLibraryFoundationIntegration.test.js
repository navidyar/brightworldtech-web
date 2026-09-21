'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const labelLibraryConfig = require('../config/labelLibrary');
const storage = require('./labelAssetStorage');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Label Library policy keeps the agreed 14-day New window and reusable asset categories', () => {
  assert.equal(labelLibraryConfig.LABEL_TEMPLATE_NEW_BADGE_DAYS, 14);
  assert.deepEqual(
    labelLibraryConfig.LABEL_TEMPLATE_CATEGORIES.map((entry) => entry.code),
    ['standard', 'dell', 'lenovo', 'hp', 'custom', 'other']
  );
  assert.ok(labelLibraryConfig.LABEL_ASSET_KINDS.includes('logo'));
  assert.ok(labelLibraryConfig.LABEL_ASSET_KINDS.includes('background'));
  assert.ok(labelLibraryConfig.LABEL_ASSET_KINDS.includes('config_json'));
  assert.ok(!labelLibraryConfig.LABEL_ASSET_KINDS.includes('preview'));
  assert.ok(!labelLibraryConfig.LABEL_ASSET_KINDS.includes('analysis_json'));
  assert.ok(!labelLibraryConfig.LABEL_ASSET_KINDS.includes('original_sample'));
});

test('Docker keeps Label Library assets on the host filesystem rather than in the image', () => {
  const compose = read('docker-compose.yml');
  const dockerignore = read('.dockerignore');

  assert.match(compose, /\.\/storage\/label-library:\/app\/storage\/label-library/);
  assert.match(dockerignore, /^storage\/label-library\/$/m);
});

test('foundation migration is dry-run by default and prepares all agreed repository/history tables', () => {
  const migration = read('scripts/migrateLabelLibraryFoundation.js');
  const tableNames = [
    'label_templates',
    'label_assets',
    'label_template_asset_links',
    'lot_label_template_sets',
    'lot_label_templates',
    'label_print_sets',
    'label_print_jobs',
    'label_print_job_items',
    'label_print_attempts',
    'label_library_audit_events'
  ];

  assert.match(migration, /process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /getColumnType\(connection, 'users', 'user_id'\)/);
  assert.match(migration, /getColumnType\(connection, 'lots', 'lot_id'\)/);
  assert.match(migration, /getColumnType\(connection, 'units', 'unit_id'\)/);
  assert.match(migration, /ensureLabelLibraryStorage\(\)/);
  assert.doesNotMatch(migration, /imported_at/);

  for (const tableName of tableNames) {
    assert.match(migration, new RegExp(`\\b${tableName}\\b`));
  }
});

test('Lot label customization can represent an explicitly empty set independently of inheritance', () => {
  const migration = read('scripts/migrateLabelLibraryFoundation.js');
  assert.match(migration, /CREATE TABLE lot_label_template_sets/);
  assert.match(migration, /CREATE TABLE lot_label_templates/);
  assert.match(migration, /REFERENCES lot_label_template_sets\(lot_id\) ON DELETE CASCADE/);
});

test('print history supports separate print sets, actions, items, and reroute attempts', () => {
  const migration = read('scripts/migrateLabelLibraryFoundation.js');
  assert.match(migration, /CREATE TABLE label_print_sets/);
  assert.match(migration, /CREATE TABLE label_print_jobs/);
  assert.match(migration, /CREATE TABLE label_print_job_items/);
  assert.match(migration, /CREATE TABLE label_print_attempts/);
  assert.match(migration, /printer_location_snapshot/);
  assert.match(migration, /attempt_number/);
  assert.match(migration, /cups_job_ids_json JSON/);
});

test('content-addressed storage deduplicates files and prevents repository path traversal', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bwtdallas-label-library-'));

  try {
    const content = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>');
    const first = await storage.writeContentAddressedAsset(content, {
      mimeType: 'image/svg+xml',
      rootPath: tempRoot
    });
    const second = await storage.writeContentAddressedAsset(content, {
      mimeType: 'image/svg+xml',
      rootPath: tempRoot
    });

    assert.equal(first.sha256, second.sha256);
    assert.equal(first.relativePath, second.relativePath);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.match(first.relativePath, /^assets\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.svg$/);
    assert.equal(fs.existsSync(storage.resolveAssetAbsolutePath(first.relativePath, tempRoot)), true);
    assert.throws(() => storage.resolveAssetAbsolutePath('../outside', tempRoot), /escapes the repository root/);
    assert.throws(() => storage.normalizeMimeType('image/jpeg'), /Unsupported label asset MIME type/);
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
});

test('current Print Label implementation remains on the existing CUPS lp path', () => {
  const labelPrintingConfig = read('config/labelPrinting.js');
  const labelPrintingService = read('services/labelPrintingService.js');
  assert.match(labelPrintingConfig, /BWT_NavidPrinter/);
  assert.match(labelPrintingService, /\/usr\/bin\/lp/);
  assert.doesNotMatch(labelPrintingService, /label_templates|label_assets|lot_label_templates/);
});
