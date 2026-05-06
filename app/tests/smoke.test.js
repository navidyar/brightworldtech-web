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

test('GET /items returns HTML page', async () => {
  const { response, text } = await getText('/items');

  assert.equal(response.status, 200);
  assert.match(text, /BWTDallas Items App/i);
});

test('GET /items/table returns fragment HTML', async () => {
  const { response, text } = await getText('/items/table');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('<table') ||
    text.includes('No items found'),
    'Expected items fragment HTML'
  );
});

test('GET /api/items returns JSON array', async () => {
  const { response, json } = await getJson('/api/items');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(json), 'Expected /api/items to return an array');
});

test('GET missing route returns 404 page', async () => {
  const { response, text } = await getText('/this-route-should-not-exist');

  assert.equal(response.status, 404);
  assert.match(text, /404|Page Not Found/i);
});

test('GET /items/:id works when at least one item exists', async () => {
  const { response, json } = await getJson('/api/items');

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(json), 'Expected /api/items to return an array');

  if (json.length === 0) {
    return;
  }

  const firstItem = json[0];
  const details = await getText(`/items/${firstItem.id}`);

  assert.equal(details.response.status, 200);
  assert.match(details.text, /Item Details/i);
});

test('GET /items/table with search query returns successfully', async () => {
  const { response, text } = await getText('/items/table?search=Dell');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected searchable items fragment HTML'
  );
});

test('GET /items/table with sort query returns successfully', async () => {
  const { response, text } = await getText('/items/table?sort=price_desc');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected sortable items fragment HTML'
  );
});

test('GET /items/table with pagination query returns successfully', async () => {
  const { response, text } = await getText('/items/table?page=2');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('Page') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected paginated items fragment HTML'
  );
});

test('GET /items/table with search + sort + page works together', async () => {
  const { response, text } = await getText('/items/table?search=Dell&sort=name_asc&page=1');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected combined filter fragment HTML'
  );
});

test('GET /items/table with invalid page does not crash', async () => {
  const { response, text } = await getText('/items/table?page=not-a-number');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected safe fallback for invalid page input'
  );
});

test('GET /items/table with out-of-range page does not crash', async () => {
  const { response, text } = await getText('/items/table?page=99999');

  assert.equal(response.status, 200);
  assert.ok(
    text.includes('items-fragment') ||
    text.includes('No items found') ||
    text.includes('<table'),
    'Expected safe fallback for large page input'
  );
});