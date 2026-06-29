import React from 'react';
import { CivicIssue } from '../types';
import { Award, CheckSquare, ListTodo, TrendingUp, HelpCircle, LogIn } from 'lucide-react';
import { getStatusColors } from './IssueCard';
import { useAuth } from '../context/AuthContext';

interface YouProfileProps {
  userIssues: CivicIssue[];
  onSelectIssue: (issue: CivicIssue) => void;
  onSignIn: () => void;
}

export const YouProfile: React.FC<YouProfileProps> = ({ userIssues, onSelectIssue, onSignIn }) => {
  const { user } = useAuth();
  const issuesList = userIssues || [];

  // Signed-out state — an invitation, not a dead end (Doc 3 §7).
  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-paper space-y-4">
        <div className="w-14 h-14 rounded-full bg-civic-tint border-2 border-civic flex items-center justify-center text-civic">
          <LogIn className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-display font-black text-ink uppercase tracking-tight">Sign in to track your reports</h2>
          <p className="text-[11px] text-ink-soft font-mono leading-relaxed max-w-[240px]">
            Browsing is open to everyone. Sign in to file dossiers, confirm issues, and follow them to resolution.
          </p>
        </div>
        <button
          onClick={onSignIn}
          className="bg-civic hover:bg-civic-deep text-white font-display font-black py-2.5 px-5 text-xs uppercase tracking-widest rounded-[8px] transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Citizen');
  const initial = (displayName || 'C').trim().charAt(0).toUpperCase();
  const reputationPoints = 120 + issuesList.length * 50;
  const streak = 6; // mock — contribution streak not yet tracked server-side

  return (
    <div className="flex-1 flex flex-col bg-paper overflow-y-auto">
      {/* Identity frame — real signed-in user */}
      <div className="bg-white px-5 py-6 border-b border-hairline shrink-0 space-y-4 shadow-sm">
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full border-2 border-civic object-cover shadow-inner"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-civic-tint border-2 border-civic flex items-center justify-center text-civic text-xl font-bold font-display shadow-inner">
              {initial}
            </div>
          )}
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-md font-bold font-display tracking-tight text-ink truncate">
              {displayName}
            </h2>
            {user.email && (
              <p className="text-[10px] font-mono text-ink-soft truncate max-w-[200px]">{user.email}</p>
            )}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
              <span>Hyperlocal Sentinel League</span> · <span>Rajkot</span>
            </div>
          </div>
        </div>

        {/* Reputation bento grid (Reports is real; rep/streak are display-only for now) */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-zinc-50 border border-hairline p-2.5 rounded-[8px] text-center space-y-0.5">
            <Award className="w-4 h-4 text-civic mx-auto" />
            <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">Rep Score</p>
            <p className="text-md font-bold text-ink leading-tight">{reputationPoints} XP</p>
          </div>
          <div className="bg-zinc-50 border border-hairline p-2.5 rounded-[8px] text-center space-y-0.5">
            <TrendingUp className="w-4 h-4 text-st-escalate mx-auto" />
            <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">Streak</p>
            <p className="text-md font-bold text-ink leading-tight">{streak} Days</p>
          </div>
          <div className="bg-zinc-50 border border-hairline p-2.5 rounded-[8px] text-center space-y-0.5">
            <CheckSquare className="w-4 h-4 text-st-resolved mx-auto" />
            <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">Reports</p>
            <p className="text-md font-bold text-ink leading-tight">{issuesList.length} Case</p>
          </div>
        </div>
      </div>

      {/* Main body area */}
      <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-ink-soft border-b border-hairline pb-2 flex items-center gap-1">
            <ListTodo className="w-4 h-4 text-civic" /> My Transparent Dossiers ({issuesList.length})
          </h3>

          <div className="space-y-3">
            {issuesList.length === 0 ? (
              <div className="text-center py-8 rounded-[12px] border-2 border-dashed border-zinc-200 bg-white/50 p-4 space-y-1">
                <HelpCircle className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Nothing reported yet</p>
                <p className="text-[10px] text-zinc-500 leading-normal max-w-[200px] mx-auto font-mono">Spot a civic issue? Press the [+] Report button on feed to register.</p>
              </div>
            ) : (
              issuesList.map((issue) => {
                const statusColor = getStatusColors(issue?.status || 'SUBMITTED');
                return (
                  <div
                    key={issue?.id}
                    onClick={() => onSelectIssue(issue)}
                    className="bg-white hover:bg-zinc-50/50 p-3 rounded-[8px] border border-hairline flex justify-between items-center cursor-pointer transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0 pr-3">
                      <p className="text-[10px] font-mono text-zinc-400 leading-none">{issue?.dossierId || ''}</p>
                      <h4 className="text-xs font-bold text-ink truncate leading-tight">{issue?.title || ''}</h4>
                      <p className="text-[10px] font-mono text-zinc-400">{issue?.location || ''}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-black border uppercase tracking-wider ${statusColor.border} ${statusColor.bg} ${statusColor.text}`}>
                      {issue?.status || ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Informative voice blurb per decorum */}
        <div className="bg-civic-tint/40 border border-civic/20 p-4 rounded-[12px] space-y-1">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-civic flex items-center gap-1 leading-none">
            ⬡ Setu Network Rulebook
          </span>
          <p className="text-[10px] text-ink-soft leading-relaxed font-mono">
            Every submission is publicly audit-logged. Interacting with dossiers, confirming repairs, or updating logs accrues civic reputation points for your community scorecard.
          </p>
        </div>
      </div>
    </div>
  );
};
