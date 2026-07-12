import React from 'react';
import { motion } from 'motion/react';

interface ConfirmDialogProps {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' tints the confirm button red; 'default' uses the ink action style. */
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small, on-brand confirmation sheet (Doc 3 tokens: paper/ink/civic, mono labels,
 * the neo-brutalist shadow button). Rendered inside the phone column's overlay
 * layer. Used for irreversible/attention actions like sign-out.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="absolute inset-0 bg-ink/60 flex items-center justify-center z-[70] p-6">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[320px] bg-paper rounded-[16px] border border-hairline overflow-hidden p-5 space-y-4 shadow-xl"
      >
        <div className="space-y-1.5">
          <h3 className="font-display font-black text-sm uppercase tracking-tight text-ink">{title}</h3>
          {body && <p className="text-[11px] text-ink-soft font-mono leading-relaxed">{body}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-white border border-hairline py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[6px] text-ink-soft hover:bg-zinc-100 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-[10px] font-mono font-black uppercase tracking-wider rounded-[6px] text-white transition-all border-2 shadow-[3px_3px_0px_0px_rgba(22,24,29,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] ${
              tone === 'danger'
                ? 'bg-st-stalled border-st-stalled hover:brightness-95'
                : 'bg-ink border-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
