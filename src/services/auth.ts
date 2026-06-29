import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request, Response, NextFunction } from 'express';

/**
 * Server-side auth: verify the Firebase ID token on protected writes and read the
 * role from VERIFIED custom claims. Public reads stay open. The role can NEVER be
 * self-assigned by a client — it lives in the token claim, set out-of-band by the
 * admin script (scripts/set-authority-claim.ts).
 */

export interface AuthedUser {
  uid: string;
  email?: string;
  role: 'citizen' | 'authority';
  departmentId?: string | null;
}

function firebaseReady(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

function bearerToken(req: Request): string | null {
  const h = (req.headers.authorization || '') as string;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * Dev bypass — STRICTLY non-production AND firebase-admin not initialized.
 * In production firebase-admin IS initialized (service account present), so this
 * is structurally unreachable there; it only lets local dev without Firebase
 * exercise the citizen write paths.
 */
function devBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && !firebaseReady();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (devBypass()) {
    (req as any).user = { uid: 'citizen-demo', role: 'citizen', departmentId: null } as AuthedUser;
    console.warn('[auth] DEV BYPASS (NODE_ENV!=production && firebase-admin not initialized) — synthetic citizen-demo.');
    return next();
  }

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sign in required to do that.' });
  }
  try {
    const decoded: any = await getAuth().verifyIdToken(token);
    (req as any).user = {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role === 'authority' ? 'authority' : 'citizen',
      departmentId: typeof decoded.departmentId === 'string' ? decoded.departmentId : null,
    } as AuthedUser;
    return next();
  } catch (err: any) {
    console.warn('[auth] ID token verification failed:', err?.code || err?.message);
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}

/** Gate to a role. Must run AFTER requireAuth. 403 (never silent) on mismatch. */
export function requireRole(role: 'authority') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthedUser | undefined;
    if (!user || user.role !== role) {
      return res.status(403).json({ error: 'You do not have access to this action.' });
    }
    return next();
  };
}

/**
 * For a department-scoped authority action: returns false (and sends 403) if the
 * authority is acting outside their own department (Doc 4 §7). Ready for the
 * future persisted authority-action endpoint.
 */
export function requireDepartment(req: Request, res: Response, issue: any): boolean {
  const user = (req as any).user as AuthedUser | undefined;
  if (!user || user.role !== 'authority') {
    res.status(403).json({ error: 'Authority access required.' });
    return false;
  }
  if (user.departmentId && issue?.departmentId && user.departmentId !== issue.departmentId) {
    res.status(403).json({ error: 'This case belongs to another department.' });
    return false;
  }
  return true;
}

export function currentUser(req: Request): AuthedUser | undefined {
  return (req as any).user as AuthedUser | undefined;
}
