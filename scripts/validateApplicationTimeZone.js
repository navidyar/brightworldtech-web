const { pool } = require('../models/db');
const { isValidTimeZone } = require('../utils/timeZone');

async function run() {
  try {
    const [rows] = await pool.query(
      `SELECT application_settings_id, default_time_zone
       FROM application_settings
       WHERE application_settings_id = 1
       LIMIT 1`
    );

    const row = rows[0] || null;
    if (!row) throw new Error('application_settings row #1 is missing.');
    if (!isValidTimeZone(row.default_time_zone)) {
      throw new Error(`Configured application time zone is invalid: ${row.default_time_zone}`);
    }

    console.log('Application timezone validation passed.');
    console.log(`Application default time zone: ${row.default_time_zone}`);
    console.log('Browser IANA timezone detection overrides the default automatically when available.');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
