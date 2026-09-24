'use strict';

require('dotenv').config();
const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');

const APPLY = process.argv.includes('--apply');

function normalizedLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
}

async function getPortCategoryId(connection) {
  const [rows] = await connection.query(
    `SELECT config_category_id
       FROM system_config_categories
      WHERE system_config_category_id = ?
      LIMIT 1`,
    [SYSTEM_CONFIG_CATEGORY_IDS.PORT_TYPES]
  );
  const categoryId = Number(rows[0]?.config_category_id || 0);
  if (!categoryId) throw new Error('Ports / Expansion Types does not have a system configuration category binding.');
  return categoryId;
}

async function loadPortValues(connection, categoryId) {
  const [rows] = await connection.query(
    `SELECT config_value_id, label, value, is_active
       FROM config_values
      WHERE config_category_id = ?
      ORDER BY config_value_id`,
    [categoryId]
  );
  return rows.map((row) => ({ ...row, config_value_id: Number(row.config_value_id) }));
}

function matchesPort(row, target) {
  return [row.label, row.value].some((value) => normalizedLabel(value) === target);
}

async function main() {
  const connection = await pool.getConnection();
  try {
    const categoryId = await getPortCategoryId(connection);
    const rows = await loadPortValues(connection, categoryId);
    const usbRows = rows.filter((row) => matchesPort(row, 'usb'));
    const usbARows = rows.filter((row) => matchesPort(row, 'usb-a'));

    console.log(`Ports / Expansion Types category ID: ${categoryId}`);
    console.log(`USB value(s) found: ${usbRows.length}`);
    console.log(`USB-A value(s) found: ${usbARows.length}`);

    if (usbRows.length > 1 || usbARows.length > 1 || (usbRows.length && usbARows.length)) {
      throw new Error('USB/USB-A configuration is ambiguous. Review the Ports / Expansion Types list before applying this migration.');
    }

    if (!usbRows.length) {
      console.log(usbARows.length ? 'USB-A is already configured. No change is needed.' : 'No USB value was found. Add USB-A through Configuration if it is required.');
      return;
    }

    const usb = usbRows[0];
    console.log(`Config value ${usb.config_value_id} will be renamed from USB to USB-A without changing its ID or existing Unit references.`);

    if (!APPLY) {
      console.log('No database changes were made. Re-run with --apply after reviewing this audit.');
      return;
    }

    await connection.query(
      `UPDATE config_values
          SET label = ?,
              value = CASE WHEN LOWER(TRIM(COALESCE(value, ''))) = 'usb' THEN ? ELSE value END
        WHERE config_value_id = ?
        LIMIT 1`,
      ['USB-A', 'USB-A', usb.config_value_id]
    );
    console.log('USB-A port-type migration applied.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
