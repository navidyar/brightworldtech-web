'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const forbiddenTopLevel = [
  '=',
  'CACHED',
  '[internal]',
  'bwtdallas-app@1.0.0',
  'exporting',
  'naming',
  'node',
  'reading',
  'resolve',
  'resolving',
  'transferring',
  'unpacking'
];

const errors = forbiddenTopLevel
  .filter((name) => fs.existsSync(path.join(projectRoot, name)))
  .map((name) => `Unexpected top-level artifact remains: ${name}`);

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (/\.(?:orig|rej)$/.test(entry.name)) {
      errors.push(`Patch artifact remains: ${path.relative(projectRoot, fullPath)}`);
    }
  }
}

walk(projectRoot);

if (errors.length > 0) {
  console.error('Stage 10T source cleanup validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Stage 10T source cleanup valid: no confirmed temporary or patch-backup artifacts remain.');
