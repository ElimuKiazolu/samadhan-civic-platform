import React from 'react';
import { Landmark } from 'lucide-react';

/**
 * An OFFICIAL authority comment in an issue thread — the third distinct voice
 * alongside the neutral citizen card and Setu's civic-teal bubble. Styled as a
 * stamped municipal memo (Doc 3 tokens): a solid ink header bar with a department
 * seal + "RMC OFFICIAL" badge, so citizens can never mistake it for a neighbour
 * or the agent. Fact/communication from a verified department account.
 */
export const AuthorityMessage: React.FC<{ department?: string; text: string; time?: string }> = ({
  department,
  text,
  time,
}) => (
  <div className="rounded-[8px] overflow-hidden border-2 border-ink shadow-xs">
    <div className="bg-ink text-white px-3 py-1.5 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Landmark className="w-3.5 h-3.5 text-signal" />
        <span className="text-[9px] font-mono font-black uppercase tracking-widest">RMC Official</span>
        {department && (
          <span className="text-[9px] font-mono text-zinc-300 uppercase tracking-wider truncate max-w-[120px]">· {department}</span>
        )}
      </div>
      {time && <span className="text-[9px] font-mono text-zinc-400">{time}</span>}
    </div>
    <p className="bg-zinc-50 text-xs text-ink font-mono leading-relaxed px-3 py-2.5">{text}</p>
  </div>
);
