import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';

// PUBLIC web config (safe to ship in the client bundle — these are identifiers,
// not secrets). Baked at BUILD time by Vite from VITE_FIREBASE_* (see Dockerfile
// build args for Cloud Run).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// True only when the web config is present. If a build forgot the VITE_* vars,
// the UI degrades to read-only rather than crashing on a half-configured app.
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Google sign-in: try popup first; on popup-block / unsupported (common on
 * mobile Safari / embedded webviews) fall back to a full-page redirect so
 * sign-in never dead-ends (Doc 6 resilience).
 */
export async function signInWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code: string = err?.code || '';
    if (
      code.includes('popup-blocked') ||
      code.includes('popup-closed') ||
      code.includes('cancelled-popup') ||
      code.includes('operation-not-supported')
    ) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    throw err;
  }
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

/** Current user's Firebase ID token (or null when logged out). */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}
