import React, { useState } from 'react';
import { X, LogIn, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

// Official Google "G" mark (4-color), per Google's sign-in branding guidelines.
const GoogleG: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

interface SignInScreenProps {
  onClose: () => void;
  reason?: string; // optional context, e.g. "Sign in to report an issue"
}

// Maps Firebase auth error codes to plain, non-apologetic, actionable copy (Doc 6).
function friendlyError(code: string): string {
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'That email already has an account — sign in instead.';
  if (code.includes('weak-password')) return 'Use a password of at least 6 characters.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('network')) return 'Network issue — check your connection and try again.';
  if (code.includes('popup')) return 'Sign-in popup was blocked — redirecting you instead…';
  return 'Could not sign in. Try again.';
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onClose, reason }) => {
  const { signInWithGoogle, signInEmail, registerEmail, configured } = useAuth();
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setError(''); setBusy(true);
    try {
      await signInWithGoogle();
      onClose(); // popup path resolves here; redirect path navigates away
    } catch (e: any) {
      setError(friendlyError(e?.code || ''));
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setError(''); setBusy(true);
    try {
      if (mode === 'create') await registerEmail(email.trim(), password);
      else await signInEmail(email.trim(), password);
      onClose();
    } catch (err: any) {
      setError(friendlyError(err?.code || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-ink/75 flex items-end sm:items-center justify-center z-[60] p-4">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        className="w-full max-w-[390px] bg-paper rounded-[24px] border border-hairline overflow-hidden text-ink shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-hairline bg-white flex justify-between items-center">
          <h2 className="font-display font-black tracking-tight text-sm uppercase flex items-center gap-1.5">
            <LogIn className="w-4 h-4 text-civic" /> Sign in to Samadhan
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-100 text-ink-soft">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-ink-soft leading-relaxed">
            {reason || 'Browsing is open to everyone. Sign in to report, confirm, or comment on civic issues.'}
          </p>

          {!configured && (
            <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-[8px] p-2 text-[10px] text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Sign-in isn't configured in this build. You can still browse the public feed and impact data.</span>
            </div>
          )}

          {/* Google sign-in — follows Google's branding guidelines: white surface,
              official 4-color "G", "Sign in with Google" in Roboto, ≥40px height. */}
          <button
            onClick={handleGoogle}
            disabled={busy || !configured}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#747775] rounded-full h-10 px-3 text-sm text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:opacity-50 transition-colors"
            style={{ fontFamily: "'Roboto','Hanken Grotesk',-apple-system,sans-serif", fontWeight: 500 }}
          >
            {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin text-[#747775]" /> : <GoogleG />}
            <span>Sign in with Google</span>
          </button>

          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
            <div className="flex-1 h-px bg-hairline" /> or <div className="flex-1 h-px bg-hairline" />
          </div>

          {/* Email / password */}
          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              disabled={busy || !configured}
              className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2.5 focus:outline-none focus:border-civic font-mono disabled:opacity-50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'create' ? 'Create a password (6+ chars)' : 'Password'}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              disabled={busy || !configured}
              className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2.5 focus:outline-none focus:border-civic font-mono disabled:opacity-50"
            />

            {error && (
              <div className="flex gap-2 items-start bg-red-50 border border-red-200 rounded-[8px] p-2 text-[10px] text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !configured || !email.trim() || !password}
              className="w-full bg-civic hover:bg-civic-deep text-white font-display font-black py-3 text-xs uppercase tracking-widest rounded-[6px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === 'create' ? 'signin' : 'create'); setError(''); }}
            className="w-full text-center text-[11px] font-mono text-ink-soft hover:text-civic"
          >
            {mode === 'create' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
