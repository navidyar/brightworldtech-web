const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('password-link status uses server-formatted effective-timezone display text', () => {
  const usersPage = read('views/pages/management-users.ejs');
  const statusJs = read('public/js/password-link-status.js');

  assert.match(usersPage, /data-password-link-expiry-display="<%= formatDateTime\(user\.latest_password_link_expires_at\) %>"/);
  assert.match(statusJs, /data-password-link-expiry-display/);
  assert.doesNotMatch(statusJs, /Intl\.DateTimeFormat/);
  assert.doesNotMatch(statusJs, /toLocaleString/);
});

test('generated setup/reset-link expiry uses server-formatted effective-timezone display text', () => {
  const linkPage = read('views/pages/management-setup-link.ejs');
  const createdModal = read('views/fragments/management-user-created-modal.ejs');
  const copyLinkJs = read('public/js/copy-link.js');

  assert.match(linkPage, /data-expiry-display="<%= formatDateTime\(setupLink\.expiresAt\) %>"/);
  assert.match(createdModal, /data-expiry-display="<%= formatDateTime\(setupLink\.expiresAt\) %>"/);
  assert.match(copyLinkJs, /data-expiry-display/);
  assert.doesNotMatch(copyLinkJs, /toLocaleString/);
});

test('browser scripts retain ISO timestamps only for absolute expiry comparisons', () => {
  const statusJs = read('public/js/password-link-status.js');
  const copyLinkJs = read('public/js/copy-link.js');

  assert.match(statusJs, /Date\.now\(\) >= expiresAt\.getTime\(\)/);
  assert.match(copyLinkJs, /Date\.now\(\) < expiresAt\.getTime\(\)/);
  assert.match(statusJs, /expiryDisplay = .*expiresAtRaw/);
  assert.match(copyLinkJs, /expiryDisplay = .*expiresAtRaw/);
});
