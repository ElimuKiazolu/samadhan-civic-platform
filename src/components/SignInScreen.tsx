import React, { useState } from 'react';
import { X, LogIn, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

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

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={busy || !configured}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-ink rounded-[8px] py-3 text-xs font-display font-black uppercase tracking-widest text-ink hover:bg-zinc-50 disabled:opacity-50 shadow-[3px_3px_0px_0px_rgba(22,24,29,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="font-mono text-base leading-none">G</span>}
            Continue with Google
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
