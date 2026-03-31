#!/usr/bin/env node
/**
 * One-time script to reset a user's password hash in Redis
 * after changing AUTH_SALT.
 *
 * Usage:
 *   UPSTASH_REDIS_REST_URL=<url> UPSTASH_REDIS_REST_TOKEN=<token> AUTH_SALT=<salt> \
 *     node reset-admin-pw.js <email> <new-password>
 *
 * DELETE THIS FILE after use — do not commit to git.
 */

const crypto = require('crypto');

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const SALT        = (process.env.AUTH_SALT || '').trim();

const email    = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || '';

if (!REDIS_URL || !REDIS_TOKEN || !SALT) {
  console.error('ERROR: Set UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AUTH_SALT env vars');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node reset-admin-pw.js <email> <new-password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('ERROR: Password must be at least 8 characters');
  process.exit(1);
}

function hashPw(pw) {
  return crypto.createHmac('sha256', SALT).update(pw).digest('hex');
}

async function redis(cmd, args) {
  const res = await fetch(`${REDIS_URL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function main() {
  const key = 'user:' + email;

  // Get existing user record
  const raw = await redis('GET', [key]);
  if (!raw) {
    console.error(`ERROR: No user found at key "${key}"`);
    process.exit(1);
  }

  const user = JSON.parse(raw);
  console.log(`Found user: ${user.name} (${user.email}), plan: ${user.plan}, role: ${user.role || 'user'}`);

  // Update password hash
  user.hash = hashPw(password);

  await redis('SET', [key, JSON.stringify(user)]);
  console.log(`Password updated for ${email}`);
  console.log('You can now sign in with the new password.');
  console.log('\n⚠️  DELETE this script: rm reset-admin-pw.js');
}

main().catch(e => { console.error(e); process.exit(1); });
