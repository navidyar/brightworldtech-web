'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const auth = require('../middleware/authMiddleware');
const { resolveEffectivePermissions } = require('./permissionResolver');
const { LEGACY_ROLE_GRANTS } = require('../config/legacyPermissionBootstrap');

// Execute the real route registrations and authorization middleware. Replace only
// controllers so HTTP authorization tests cannot mutate production business data.
function loadRouter(file) {
  const module = { exports: {} };
  const handler = (req, res) => res.status(200).json({ reachedController: true });
  const controllers = new Proxy({}, { get: () => handler });
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports,
    require: (name) => {
      if (name === 'express') return express;
      if (name.includes('/controllers/')) return controllers;
      if (name.endsWith('/authMiddleware')) return auth;
      if (name.endsWith('/protectedAdminMiddleware')) return { requireProtectedAdminAccess: handler };
      throw new Error(`Unexpected route dependency: ${name}`);
    }
  }, { filename: file });
  return module.exports;
}

test('HTTP workflows accept custom Allow and reject privileged Deny before controllers', async () => {
  const app = express();
  app.use((req, res, next) => {
    const role = req.get('x-test-role') || 'custom';
    req.currentUser = { user_id: 77, roles: [role] };
    req.currentPermissions = resolveEffectivePermissions({
      rolePermissionKeys: LEGACY_ROLE_GRANTS[role] || [],
      userOverrides: JSON.parse(req.get('x-test-overrides') || '[]')
    });
    res.render = (_view, _locals) => res.send('Access denied');
    next();
  });
  for (const file of ['routes/management.js', 'routes/config.js', 'routes/virtualHuddle.js']) app.use(loadRouter(file));
  const server = await new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [method, path, permission, prerequisites = []] of [
      ['POST', '/tech/units/1/park', 'units.park'],
      ['POST', '/tech/units/1/return-to-active', 'units.return_to_active'],
      ['POST', '/tech/units/1/completions/1/reverse', 'units.reverse_completion'],
      ['POST', '/tech/units/1/complete-work', 'units.complete'],
      ['POST', '/tech/units/1/qc-correction', 'qc.correction.submit'],
      ['GET', '/qc/review', 'qc.portal.view'],
      ['GET', '/management/config', 'configuration.view'],
      ['POST', '/management/config/application-time-zone', 'configuration.values.manage', ['configuration.view']],
      ['GET', '/management/virtual-huddle/new/modal', 'huddle.send', ['huddle.administration.view']]
    ]) {
      const allow = await fetch(`${base}${path}`, { method, headers: { 'x-test-role': 'custom', 'x-test-overrides': JSON.stringify([permission, ...prerequisites, ...(path.startsWith('/tech/units') ? ['units.view'] : [])].map((permissionKey) => ({ permissionKey, effect: 'allow' }))) } });
      assert.equal(allow.status, 200, `${method} ${path} custom Allow`);
      assert.equal((await allow.json()).reachedController, true);
      const deny = await fetch(`${base}${path}`, { method, headers: { 'x-test-role': 'admin', 'x-test-overrides': JSON.stringify([{ permissionKey: permission, effect: 'deny' }, ...(permission === 'qc.correction.submit' ? [{ permissionKey: 'qc.correction.submit_any', effect: 'deny' }] : [])]) } });
      assert.equal(deny.status, 403, `${method} ${path} admin Deny`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rendered QC controls honor custom Allow and privileged Deny', () => {
  const ejs = require('ejs');
  const template = fs.readFileSync('views/fragments/tech-unit-qc-review-details-modal.ejs', 'utf8');
  const input = { errorMessages: [], unit: { unitId: 1, assetTag: 'TEST' }, qcStatusPresentation: null, latestQcReview: null, latestQcCorrection: null, canRequestQcReversion: false, canDirectlyRevertQc: false };
  const allow = ejs.render(template, { ...input, currentRoles: ['custom'], hasPermission: (key) => key === 'units.history.view' });
  assert.match(allow, /data-qc-open-unit-history/);
  const deny = ejs.render(template, { ...input, currentRoles: ['admin'], hasPermission: () => false });
  assert.doesNotMatch(deny, /data-qc-open-unit-history/);
});
