// Adds an administrator account to the admin table.
// Usage: node scripts/create-admin.js <email> <password> "<first name>" "<last name>"

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const adminModel = require('../models/adminModel');

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

async function main() {
  const [email, password, firstName = 'BRB', lastName = 'Administrator'] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js <email> <password> "<first name>" "<last name>"');
    process.exitCode = 1;
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (await adminModel.findByEmail(normalizedEmail)) {
    console.error(`An admin with the email ${normalizedEmail} already exists.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await adminModel.create({ firstName, lastName, email: normalizedEmail, passwordHash });

  console.log(`Admin account created for ${normalizedEmail}.`);
}

main()
  .catch((error) => {
    console.error(`Could not create the admin account: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
