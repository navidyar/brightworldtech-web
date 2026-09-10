'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const {
  TOOL_SOURCES,
  getToolCredentialConfigurationError,
  resolveToolSource
} = require('./apiToolCredential');
const {
  DEFAULT_API_SESSION_HOURS,
  hashApiToken,
  getApiSessionHours
} = require('./apiToken');
const { readBearerToken } = require('./apiAuthorization');

test('tool credential determines ScanTool versus TechTools source', () => {
  const env = {
    SCANTOOLS_API_SECRET: 'scan-secret-that-is-intentionally-different',
    TECHTOOLS_API_SECRET: 'tech-secret-that-is-intentionally-different'
  };

  assert.equal(getToolCredentialConfigurationError(env), null);
  assert.equal(resolveToolSource(env.SCANTOOLS_API_SECRET, env), TOOL_SOURCES.SCANTOOL);
  assert.equal(resolveToolSource(env.TECHTOOLS_API_SECRET, env), TOOL_SOURCES.TECHTOOLS);
  assert.equal(resolveToolSource('wrong-secret', env), null);
  assert.match(
    getToolCredentialConfigurationError({ ...env, TECHTOOLS_API_SECRET: env.SCANTOOLS_API_SECRET }),
    /must be different/
  );
});

test('API session token helpers hash tokens and use a bounded work-shift lifetime', () => {
  assert.equal(hashApiToken('abc').length, 64);
  assert.equal(getApiSessionHours({}), DEFAULT_API_SESSION_HOURS);
  assert.equal(getApiSessionHours({ BWT_API_SESSION_HOURS: '0' }), 1);
  assert.equal(getApiSessionHours({ BWT_API_SESSION_HOURS: '48' }), 24);
});

test('Bearer parsing accepts only bearer authorization tokens', () => {
  const request = (authorization) => ({ get: () => authorization });
  assert.equal(readBearerToken(request('Bearer token-value')), 'token-value');
  assert.equal(readBearerToken(request('bearer another-token')), 'another-token');
  assert.equal(readBearerToken(request('Basic abc')), '');
});

test('API v1 routes expose health and user authentication without Unit write endpoints', () => {
  const routes = read('routes/api.js');
  assert.match(routes, /router\.get\('\/health'/);
  assert.match(routes, /router\.post\('\/auth\/login'/);
  assert.match(routes, /router\.get\('\/auth\/me'/);
  assert.match(routes, /router\.post\('\/auth\/logout'/);
  assert.doesNotMatch(routes, /techUnitModel|unitExpandedFormModel|unitSpecsTestsModel/);
});

test('API authentication reuses BWTDallas user credentials and stores opaque hashed sessions', () => {
  const controller = read('controllers/apiAuthController.js');
  const model = read('models/apiAuthModel.js');
  assert.match(controller, /getUserByLoginIdentifier/);
  assert.match(controller, /argon2\.verify/);
  assert.match(controller, /resolveToolSource/);
  assert.match(controller, /createApiToken/);
  assert.match(controller, /hashApiToken/);
  assert.match(model, /token_hash/);
  assert.doesNotMatch(model, /password_hash/);
});

test('API foundation migration creates session and idempotent tool-run storage only', () => {
  const migration = read('scripts/migrateApiFoundation.js');
  assert.match(migration, /CREATE TABLE api_tool_sessions/);
  assert.match(migration, /CREATE TABLE unit_tool_runs/);
  assert.match(migration, /UNIQUE KEY uniq_api_tool_sessions_token_hash/);
  assert.match(migration, /UNIQUE KEY uniq_unit_tool_runs_source_report \(tool_source, report_id\)/);
  assert.match(migration, /ENUM\('scantool', 'techtools'\)/);
  assert.doesNotMatch(migration, /ALTER TABLE units/);
  assert.doesNotMatch(migration, /unit_production_cycles/);
});

test('server mounts API v1 ahead of browser routes and preserves JSON errors for API requests', () => {
  const server = read('server.js');
  assert.match(server, /const apiRoutes = require\('\.\/routes\/api'\)/);
  assert.match(server, /app\.use\('\/api\/v1', apiRoutes\)/);
  assert.match(server, /req\.originalUrl\.startsWith\('\/api\/v1\/'\)/);
  assert.match(server, /API_INTERNAL_ERROR/);
});
