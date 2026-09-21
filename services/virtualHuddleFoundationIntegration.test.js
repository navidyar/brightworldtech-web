'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Virtual Huddle schema persists immutable message, selected-target, and frozen recipient records', () => {
  const sql = read('sql/2026-09-virtual-huddle.sql');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS virtual_huddle_messages/i);
  assert.match(sql, /sender_name_snapshot VARCHAR\(200\) NOT NULL/i);
  assert.match(sql, /sender_role_code_snapshot VARCHAR\(50\) NOT NULL/i);
  assert.match(sql, /thread_root_message_id BIGINT UNSIGNED NULL/i);
  assert.match(sql, /parent_message_id BIGINT UNSIGNED NULL/i);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS virtual_huddle_targets/i);
  assert.match(sql, /target_role_code_snapshot VARCHAR\(50\) NULL/i);
  assert.match(sql, /target_user_name_snapshot VARCHAR\(200\) NULL/i);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS virtual_huddle_recipients/i);
  assert.match(sql, /user_name_snapshot VARCHAR\(200\) NOT NULL/i);
  assert.match(sql, /role_code_snapshot VARCHAR\(50\) NOT NULL/i);
  assert.match(sql, /UNIQUE KEY uq_virtual_huddle_recipients_message_user \(virtual_huddle_message_id, user_id\)/i);
});

test('recipient schema separates delivery mechanics from acknowledgment audit data', () => {
  const sql = read('sql/2026-09-virtual-huddle.sql');

  assert.match(sql, /acknowledgment_mode_code VARCHAR\(30\) NOT NULL/i);
  assert.match(sql, /recipient_state_code VARCHAR\(30\) NOT NULL/i);
  assert.match(sql, /dismissed_at DATETIME\(6\) NULL/i);
  assert.match(sql, /acknowledgment_phrase_snapshot VARCHAR\(80\) NULL/i);
  assert.match(sql, /acknowledgment_note TEXT NULL/i);
  assert.match(sql, /acknowledged_at DATETIME\(6\) NULL/i);
  assert.match(sql, /revoked_by_user_id INT NULL/i);
  assert.match(sql, /revoked_at DATETIME\(6\) NULL/i);
  assert.match(sql, /revocation_reason VARCHAR\(1000\) NULL/i);
  assert.doesNotMatch(sql, /read_at/i);
});

test('Admin hard-delete cleanup cascades from a message while user deletion preserves historical snapshots', () => {
  const sql = read('sql/2026-09-virtual-huddle.sql');

  assert.match(sql, /fk_virtual_huddle_targets_message[\s\S]*?ON DELETE CASCADE/i);
  assert.match(sql, /fk_virtual_huddle_recipients_message[\s\S]*?ON DELETE CASCADE/i);
  assert.match(sql, /fk_virtual_huddle_messages_sender[\s\S]*?ON DELETE SET NULL/i);
  assert.match(sql, /fk_virtual_huddle_recipients_user[\s\S]*?ON DELETE SET NULL/i);
});

test('Virtual Huddle exposes read-only preflight, apply, check, and protected rollback commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  const scripts = packageJson.scripts || {};

  assert.equal(scripts['preflight:virtual-huddle'], 'bash scripts/preflight-virtual-huddle.sh');
  assert.equal(scripts['migrate:virtual-huddle'], 'bash scripts/apply-virtual-huddle.sh');
  assert.equal(scripts['check:virtual-huddle'], 'bash scripts/check-virtual-huddle.sh');
  assert.equal(scripts['rollback:virtual-huddle'], 'bash scripts/rollback-virtual-huddle.sh');

  const rollback = read('scripts/rollback-virtual-huddle.sh');
  assert.match(rollback, /rollback refused/i);
  assert.match(rollback, /row_counts/);
});

test('Virtual Huddle does not add a dedicated feature CSS file', () => {
  const cssFiles = fs.readdirSync(path.join(root, 'public/css'));
  assert.equal(cssFiles.includes('virtual-huddle.css'), false);
});
