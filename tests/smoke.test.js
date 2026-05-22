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

test('GET /units returns HTML page', async () => {
  const { response, text } = await getText('/units');

  assert.equal(response.status, 200);
  assert.match(text, /BWTDallas Items App/i);
});

test('GET /units/table returns fragment HTML', async () => {
  const { response, text } = await getText('/units/table');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('<table') ||
    text.includes('No units found'),
    'Expected units fragment HTML'
  );
});

test('GET /api/units returns JSON array', async () => {
  const { response, json } = await getJson('/api/units');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(json), 'Expected /api/units to return an array');
});

test('GET missing route returns 404 page', async () => {
  const { response, text } = await getText('/this-route-should-not-exist');

  assert.equal(response.status, 404);
  assert.match(text, /404|Page Not Found/i);
});

test('GET /units/:id works when at least one unit exists', async () => {
  const { response, json } = await getJson('/api/units');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(json), 'Expected /api/units to return an array');

  if (json.length === 0) {
    return;
  }

  const firstItem = json[0];
  const details = await getText(`/units/${firstItem.id}`);

  assert.equal(details.response.status, 200);
  assert.match(details.text, /Item Details/i);
});

test('GET /units/table with search query returns successfully', async () => {
  const { response, text } = await getText('/units/table?search=Dell');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected searchable units fragment HTML'
  );
});

test('GET /units/table with sort query returns successfully', async () => {
  const { response, text } = await getText('/units/table?sort=price_desc');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected sortable units fragment HTML'
  );
});

test('GET /units/table with pagination query returns successfully', async () => {
  const { response, text } = await getText('/units/table?page=2');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('Page') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected paginated units fragment HTML'
  );
});

test('GET /units/table with search + sort + page works together', async () => {
  const { response, text } = await getText('/units/table?search=Dell&sort=name_asc&page=1');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected combined filter fragment HTML'
  );
});

test('GET /units/table with invalid page does not crash', async () => {
  const { response, text } = await getText('/units/table?page=not-a-number');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected safe fallback for invalid page input'
  );
});

test('GET /units/table with out-of-range page does not crash', async () => {
  const { response, text } = await getText('/units/table?page=99999');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('units-fragment') ||
    text.includes('No units found') ||
    text.includes('<table'),
    'Expected safe fallback for large page input'
  );
});