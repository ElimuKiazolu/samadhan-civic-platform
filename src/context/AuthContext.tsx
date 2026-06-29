import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  auth,
  firebaseConfigured,
  onAuthChange,
  signInWithGoogle as fbSignInWithGoogle,
  signInWithEmail as fbSignInWithEmail,
  registerWithEmail as fbRegisterWithEmail,
  signOutUser as fbSignOut,
  getIdToken,
} from '../lib/firebase';

type Role = 'citizen' | 'authority';

interface AuthState {
  user: User | null;
  role: Role; // derived from VERIFIED token custom claims (default citizen)
  departmentId: string | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>; // force token refresh (after a claim is granted)
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('citizen');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const readClaims = useCallback(async (u: User | null) => {
    if (!u) {
      setRole('citizen');
      setDepartmentId(null);
      return;
    }
    try {
      const res = await u.getIdTokenResult();
      setRole(res.claims.role === 'authority' ? 'authority' : 'citizen');
      setDepartmentId(typeof res.claims.departmentId === 'string' ? res.claims.departmentId : null);
    } catch {
      // Never silently escalate — on any failure, treat as the least-privileged role.
      setRole('citizen');
      setDepartmentId(null);
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) {
      // No web config baked in → app runs read-only (no sign-in). Don't hang.
      setLoading(false);
      return;
    }
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      await readClaims(u);
      setLoading(false);
    });
    return unsub;
  }, [readClaims]);

  const refreshRole = useCallback(async () => {
    const u = auth.currentUser;
    if (u) {
      await u.getIdToken(true); // force refresh so a newly-granted authority claim lands
      await readClaims(u);
    }
  }, [readClaims]);

  // Attaches the Firebase ID token; on 401 (expiry) force-refreshes once and retries.
  const authedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const run = async (force: boolean) => {
      const token = await getIdToken(force);
      const headers = new Headers(init.headers || {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    };
    let res = await run(false);
    if (res.status === 401) {
      res = await run(true);
    }
    return res;
  }, []);

  const value: AuthState = {
    user,
    role,
    departmentId,
    loading,
    configured: firebaseConfigured,
    signInWithGoogle: fbSignInWithGoogle,
    signInEmail: async (email, password) => { await fbSignInWithEmail(email, password); },
    registerEmail: async (email, password) => { await fbRegisterWithEmail(email, password); },
    signOut: async () => { await fbSignOut(); },
    refreshRole,
    authedFetch,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
