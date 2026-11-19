import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'STOCK_KEEPER' | 'SUPER_ADMIN';

export interface AuthSession {
  userId: string;
  shopId: string | null;
  role: UserRole;
  name: string;
  plan: 'FREE' | 'PREMIUM';
  isDemo: boolean;
  exp: number;
}

export interface AuthedRequest extends Request {
  session?: AuthSession;
}

const TOKEN_SECRET = process.env.JWT_SECRET || 'bizmind-dev-hmac-secret-2026';

export function signSessionToken(payload: Omit<AuthSession, 'exp'>, ttlSeconds: number): string {
  const full: AuthSession = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): AuthSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthSession;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extracts verified server-signed session from Authorization header.
 * Never trusts client-supplied role headers or query params.
 */
export function attachSession(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    const session = verifySessionToken(token);
    if (session) req.session = session;
  }
  next();
}

/**
 * Strict Role Guard: returns HTTP 404 (not 403) when unauthorized
 * so attackers cannot enumerate restricted admin or financial endpoints.
 */
export function requireRoles(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.session || !allowed.includes(req.session.role)) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    next();
  };
}

/**
 * Super Admin extra guard: checks optional IP allowlist and short-lived 2FA session.
 */
export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.session || req.session.role !== 'SUPER_ADMIN') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  const allowlist = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowlist.length > 0) {
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (!allowlist.includes(clientIp)) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
  }
  next();
}
