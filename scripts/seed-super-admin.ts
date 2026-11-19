/**
 * BizMind AI — CLI Seed Script for Initial Super Admin
 * Usage:
 *   INITIAL_ADMIN_EMAIL=owner@bizmind.ai INITIAL_ADMIN_PASSWORD='YourStrong12+CharPassword!' npx tsx scripts/seed-super-admin.ts
 * Never commit passwords to GitHub. Remove env vars immediately after first run.
 */
import crypto from 'crypto';

const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD || '';

if (!email || password.length < 12) {
  console.error('ERROR: Provide INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 12 characters) via environment variables.');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
const passwordHash = `scrypt:${salt}:${derivedKey}`;
const totpSecret = crypto.randomBytes(20).toString('hex').slice(0, 32).toUpperCase();

console.log('=== BizMind AI Super Admin Provisioned (CLI Only — Public Signup Disabled) ===');
console.log(JSON.stringify({
  email,
  role: 'SUPER_ADMIN',
  passwordHash: passwordHash.slice(0, 28) + '...[REDACTED]',
  totpEnrollmentUri: `otpauth://totp/BizMind-Admin:${encodeURIComponent(email)}?secret=${totpSecret}&issuer=BizMind-Admin`,
  reminder: 'Remove INITIAL_ADMIN_PASSWORD from environment immediately after saving to database.',
}, null, 2));
