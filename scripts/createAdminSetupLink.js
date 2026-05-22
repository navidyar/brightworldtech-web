require('dotenv').config();

const crypto = require('crypto');
const authModel = require('../models/authModel');
const { pool } = require('../models/db');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function main() {
  const [firstName, lastName, email] = process.argv.slice(2);

  if (!firstName || !lastName || !email) {
    console.error('Usage: npm run create-admin-link -- "Admin" "User" "admin@example.com"');
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.BASE_URL || 'https://bwtdallas.com';
  const expiresInHours = Number(process.env.PASSWORD_SETUP_EXPIRES_HOURS || 24);

  const user = await authModel.createUserWithRoles({
    firstName,
    lastName,
    email,
    roleCodes: ['admin', 'management']
  });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = addHours(new Date(), expiresInHours);

  await authModel.createPasswordLink({
    userId: user.user_id,
    linkTypeCode: 'initial_password_setup',
    tokenHash,
    expiresAt
  });

  const setupUrl = `${baseUrl.replace(/\/$/, '')}/setup-password?token=${token}`;

  console.log('');
  console.log('Admin user setup link created.');
  console.log('');
  console.log(`User: ${user.first_name} ${user.last_name} <${user.email}>`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log('');
  console.log(setupUrl);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Failed to create admin setup link:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });