const path = require('node:path');
const { validateSharedCssFoundation } = require('../services/sharedCssFoundationValidator');

const projectRoot = path.resolve(__dirname, '..');
const errors = validateSharedCssFoundation(projectRoot);

if (errors.length > 0) {
  console.error('Shared CSS foundation validation failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Shared CSS foundation valid: visual CSS is global and protected feature behavior remains isolated.');
}
