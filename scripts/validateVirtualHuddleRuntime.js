'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const templates = [
  'views/fragments/virtual-huddle-recipient-dialog.ejs',
  'views/fragments/virtual-huddle-compose-modal.ejs',
  'views/fragments/virtual-huddle-preview-modal.ejs',
  'views/fragments/virtual-huddle-revoke-modal.ejs',
  'views/fragments/virtual-huddle-delete-modal.ejs',
  'views/fragments/virtual-huddle-delete-own-modal.ejs',
  'views/pages/management-virtual-huddle.ejs',
  'views/pages/management-virtual-huddle-detail.ejs',
  'views/pages/my-huddles.ejs',
  'views/pages/my-huddle-detail.ejs',
  'views/pages/my-huddle-admin-inbox-detail.ejs',
  'views/pages/virtual-huddle-required.ejs',
  'views/partials/head.ejs',
  'views/partials/sidebar.ejs'
];

for (const relativePath of templates) {
  const filename = path.join(root, relativePath);
  ejs.compile(fs.readFileSync(filename, 'utf8'), { filename });
}

// Load the full feature dependency graph without starting the HTTP server.
require('../routes/virtualHuddle');

console.log(`Virtual Huddle runtime validation passed: ${templates.length} EJS templates and route dependencies loaded.`);
