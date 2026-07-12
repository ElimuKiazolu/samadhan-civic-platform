import React from 'react';

/**
 * Setu agent identity chrome — used everywhere the autonomous agent "speaks" so
 * its posts are instantly distinguishable from a neighbour's. On-brand (Doc 3
 * tokens: civic teal + the hexagon dossier mark, mono type). Reused across the
 * in-thread resolution/decorum messages, the feed card agent line, the case log
 * header, and agent alerts — never restyle Setu posts ad hoc.
 */

/** The `⬡ SETU` pill — solid civic-teal so it reads as a system actor, not a user. */
export const SetuBadge: React.FC<{ size?: 'sm' | 'xs' }> = ({ size = 'sm' }) => (
  <span
    className={`inline-flex items-center gap-1 bg-civic text-white font-mono font-black uppercase tracking-widest rounded-[3px] leading-none ${
      size === 'xs' ? 'text-[8px] px-1 py-[3px]' : 'text-[9px] px-1.5 py-0.5'
    }`}
  >
    <span aria-hidden className="leading-none">⬡</span> Setu
  </span>
);

/**
 * A Setu message bubble for issue threads — visually a first-class agent card:
 * civic-tint gradient, a left civic accent rail, and the SETU badge header. Kept
 * deliberately distinct from the plain white bordered card used for citizen
 * comments so the two never blur together.
 */
export const SetuMessage: React.FC<{ text: string; time?: string }> = ({ text, time }) => (
  <div className="relative bg-gradient-to-br from-civic-tint to-civic-tint/30 border border-civic/40 border-l-[3px] border-l-civic rounded-[8px] p-3 flex flex-col gap-1.5 shadow-xs">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-1.5">
        <SetuBadge />
        <span className="text-[10px] font-mono font-bold text-civic-deep uppercase tracking-wider">Autonomous Agent</span>
      </div>
      {time && <span className="text-[10px] font-mono text-civic-deep/60">{time}</span>}
    </div>
    <p className="text-xs text-ink font-mono leading-relaxed">{text}</p>
  </div>
);
