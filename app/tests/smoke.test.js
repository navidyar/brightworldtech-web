const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function getText(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();

  return {
    response,
    text
  };
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const json = await response.json();

  return {
    response,
    json
  };
}

test('GET /api/health returns healthy JSON', async () => {
  const { response, json } = await getJson('/api/health');

  assert.equal(response.status, 200);
  assert.equal(json.app, 'ok');
});

test('GET / returns portal hub HTML page', async () => {
  const { response, text } = await getText('/');

  assert.equal(response.status, 200);
  assert.match(text, /BWTDallas Portal Hub/i);
  assert.match(text, /Management Portal/i);
  assert.match(text, /Warehouse Portal/i);
});

test('GET each department portal returns HTML page', async () => {
  const portals = ['management', 'tech', 'warehouse', 'sales'];

  for (const portal of portals) {
    const { response, text } = await getText(`/portals/${portal}`);

    assert.equal(response.status, 200);
    assert.match(text, /Portal/i);
    assert.match(text, /Core Metrics/i);
  }
});

test('GET /api/portals/summary returns JSON summary object', async () => {
  const { response, json } = await getJson('/api/portals/summary');

  assert.equal(response.status, 200);
  assert.equal(typeof json, 'object');
  assert.ok(Object.hasOwn(json, 'employees'));
  assert.ok(Object.hasOwn(json, 'units'));
  assert.ok(Object.hasOwn(json, 'inventoryQuantity'));
});

test('GET missing portal returns 404 page', async () => {
  const { response, text } = await getText('/portals/not-a-real-portal');

  assert.equal(response.status, 404);
  assert.match(text, /404|Page Not Found/i);
});

test('GET missing route returns 404 page', async () => {
  const { response, text } = await getText('/this-route-should-not-exist');

  assert.equal(response.status, 404);
  assert.match(text, /404|Page Not Found/i);
});
