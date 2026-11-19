import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export type AdminRole = 'SUPER_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN' | 'AI_ADMIN' | 'READ_ONLY';

export interface AdminSession {
  adminId: string;
  email: string;
  role: AdminRole;
  aud: 'bizmind-admin-console'; // Distinct audience: Shop tokens can NEVER pass here
  iat: number;
  exp: number;
}

export interface AdminRequest extends Request {
  admin?: AdminSession;
}

// Separate secret strictly for Admin API (never shared with Shop JWT_SECRET)
const ADMIN_TOKEN_SECRET = process.env.ADMIN_JWT_SECRET || 'bizmind-isolated-admin-secret-2026';
const IDLE_TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function verifyScryptPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const derived = crypto.scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function checkAdminRateLimit(key: string): { blocked: boolean; retryAfterSec?: number } {
  const rec = failedAttempts.get(key);
  if (!rec) return { blocked: false };
  if (rec.lockedUntil > Date.now()) {
    return { blocked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { blocked: false };
}

export function recordFailedAdminLogin(key: string): void {
  const rec = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILED_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  failedAttempts.set(key, rec);
}

export function clearFailedAdminLogin(key: string): void {
  failedAttempts.delete(key);
}

export function signAdminCookieToken(admin: Omit<AdminSession, 'aud' | 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSession = { ...admin, aud: 'bizmind-admin-console', iat: now, exp: now + IDLE_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAdminCookieToken(token: string): AdminSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminSession;
    if (parsed.aud !== 'bizmind-admin-console') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  next();
}

export function setAdminHttpOnlyCookie(res: Response, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `bm_admin_sid=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin-api; Max-Age=${IDLE_TTL_SECONDS}`
  );
}

export function requireAdminRoles(allowed: AdminRole[]) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const cookieHeader = String(req.headers.cookie || '');
    const match = cookieHeader.match(/bm_admin_sid=([^;]+)/);
    const token = match ? match[1] : '';
    const session = verifyAdminCookieToken(token);
    if (!session || !allowed.includes(session.role)) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    req.admin = session;
    next();
  };
}
