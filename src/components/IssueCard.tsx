import React from 'react';
import { CivicIssue } from '../types';
import { MapPin, Users, MessageSquare, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

interface IssueCardProps {
  issue: CivicIssue;
  onSelect: (issue: CivicIssue) => void;
}

export const getStatusColors = (status: string) => {
  switch (status) {
    case 'SUBMITTED':
      return { bg: 'bg-st-new/10', text: 'text-st-new', border: 'border-st-new' };
    case 'VALIDATED':
    case 'OPEN':
      return { bg: 'bg-st-open/10', text: 'text-st-open', border: 'border-st-open' };
    case 'ESCALATED':
      return { bg: 'bg-st-escalate/10', text: 'text-st-escalate', border: 'border-st-escalate' };
    case 'STALLED':
      return { bg: 'bg-st-stalled/10', text: 'text-st-stalled', border: 'border-st-stalled' };
    case 'IN_PROGRESS':
      return { bg: 'bg-st-progress/10', text: 'text-st-progress', border: 'border-st-progress' };
    case 'RESOLVED':
      return { bg: 'bg-st-resolved/10', text: 'text-st-resolved', border: 'border-st-resolved' };
    default:
      return { bg: 'bg-zinc-100', text: 'text-zinc-600', border: 'border-zinc-300' };
  }
};

export const IssueCard: React.FC<IssueCardProps> = ({ issue, onSelect }) => {
  const colors = getStatusColors(issue.status);

  return (
    <motion.div
      id={`card-${issue.id}`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(issue)}
      className="bg-surface rounded-[12px] overflow-hidden border border-hairline shadow-sm hover:shadow-md cursor-pointer transition-shadow flex flex-col"
    >
      {/* Media Thumbnail */}
      <div className="h-44 w-full bg-zinc-100 relative overflow-hidden">
        <img
          src={issue.mediaUrl}
          alt={issue.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent"></div>
        
        {/* Category Chip + Status Stamp */}
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
          <span className="bg-ink text-white text-[9px] font-bold px-2 py-1 uppercase tracking-wider rounded-[3px]">
            {issue.category.substring(issue.category.indexOf('/') + 1 || 0).toUpperCase() || issue.category.toUpperCase()}
          </span>
          <div className={`border-2 ${colors.border} ${colors.bg} ${colors.text} px-2 py-0.5 shadow-[1px_1px_0px_rgba(0,0,0,0.15)] font-mono text-[9px] font-black uppercase rotate-[-1deg] rounded-[3px]`}>
            {issue.status}
          </div>
        </div>
      </div>

      {/* Content Details */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-ink-soft tracking-wider">{issue.dossierId}</span>
            <span className="text-[10px] font-mono text-zinc-400">{issue.age}</span>
          </div>
          <h3 className="text-sm font-bold text-ink leading-tight font-display tracking-tight line-clamp-2">
            {issue.title}
          </h3>
        </div>

        {/* Location & Metadata info */}
        <div className="flex items-center justify-between text-[11px] text-ink-soft border-t border-hairline/60 pt-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-civic flex-shrink-0" />
            <span className="truncate">{issue.location}</span>
            <span className="bg-zinc-100 px-1 py-0.5 rounded-[3px] text-[10px] font-mono shrink-0">{issue.ward}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0 pl-2">
            <div className="flex items-center gap-1 text-civic-deep font-semibold">
              <Users className="w-3.5 h-3.5 text-civic" />
              <span>{issue.confirmedCount}</span>
            </div>
            {issue.comments.length > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                <span>{issue.comments.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* One-line Agent Status */}
        {issue.agentStatus && (
          <div className="bg-civic-tint/70 border-l-2 border-civic p-2 text-[10px] flex items-start gap-1.5 rounded-r-[4px]">
            <span className="text-civic font-mono font-bold leading-none select-none">⬡</span>
            <span className="text-ink-soft font-mono leading-tight truncate">{issue.agentStatus}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
