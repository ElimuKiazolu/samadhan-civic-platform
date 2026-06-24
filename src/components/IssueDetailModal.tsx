import React, { useState, useEffect, useRef } from 'react';
import { CivicIssue, Comment, CaseLogLine } from '../types';
import { X, Map, Users, Send, Check, AlertTriangle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStatusColors } from './IssueCard';

interface IssueDetailModalProps {
  issue: CivicIssue;
  onClose: () => void;
  onCorroborate: (id: string) => void;
  onAddComment: (issueId: string, comment: Comment) => void;
}

export const IssueDetailModal: React.FC<IssueDetailModalProps> = ({
  issue,
  onClose,
  onCorroborate,
  onAddComment,
}) => {
  const [isCaseLogOpen, setIsCaseLogOpen] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [corroborated, setCorroborated] = useState(issue.isUserCorroborated || false);
  const [localConfirmedCount, setLocalConfirmedCount] = useState(issue.confirmedCount);
  
  // Streaming state for Case Log lines
  const [visibleLinesCount, setVisibleLinesCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    // Reset stream whenever issue changes or panel opens
    setVisibleLinesCount(0);
    setIsStreaming(true);
  }, [issue.id]);

  useEffect(() => {
    const caseLogLength = (issue.caseLog || []).length;
    if (isStreaming && isCaseLogOpen) {
      if (visibleLinesCount < caseLogLength) {
        const timer = setTimeout(() => {
          setVisibleLinesCount((prev) => prev + 1);
        }, 450); // stream every 450ms for a satisfying visual reveal
        return () => clearTimeout(timer);
      } else {
        setIsStreaming(false);
      }
    }
  }, [visibleLinesCount, isStreaming, isCaseLogOpen, issue.caseLog]);

  const handleCorroborateClick = () => {
    if (!corroborated) {
      setCorroborated(true);
      setLocalConfirmedCount((prev) => prev + 1);
      onCorroborate(issue.id);
    }
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment: Comment = {
      id: `comment-${Date.now()}`,
      author: 'You (Citizen)',
      isAgent: false,
      text: commentText,
      time: 'Just now',
    };

    onAddComment(issue.id, newComment);
    const sentText = commentText;
    setCommentText('');

    // Setu simulated reply
    setTimeout(() => {
      let setuResponseText = '';
      if (sentText.toLowerCase().includes('pothole') || sentText.toLowerCase().includes('road')) {
        setuResponseText = `Understood. I have flagged this spot to the Rajkot Municipal Sanitation & Road Maintenance Unit catalog. Case code reference: RC-${Math.floor(10000 + Math.random() * 90000)}.`;
      } else if (sentText.toLowerCase().includes('danger') || sentText.toLowerCase().includes('accident')) {
        setuResponseText = `Warning recorded. Escalating safety assessment parameters to alert Ward Road Safety supervisor. High visibility markers recommended.`;
      } else {
        setuResponseText = `Dossier update: Corroborative feedback added. Dispatched message update to the respective Municipal Engineer.`;
      }

      const setuReply: Comment = {
        id: `setu-reply-${Date.now()}`,
        author: 'Setu',
        isAgent: true,
        text: setuResponseText,
        time: 'Just now',
      };
      onAddComment(issue.id, setuReply);
    }, 1200);
  };

  const colors = getStatusColors(issue.status);

  return (
    <div className="absolute inset-0 bg-ink/40 flex items-end justify-center z-50">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="w-full max-h-[92%] bg-paper rounded-t-[24px] border-t border-hairline flex flex-col overflow-hidden text-ink"
      >
        {/* Handle bar */}
        <div className="h-6 w-full flex items-center justify-center relative flex-shrink-0 cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1 bg-zinc-300 rounded-full"></div>
          <button
            id="close-detail-btn"
            onClick={onClose}
            className="absolute right-4 p-1 rounded-full bg-zinc-100 border border-hairline text-ink-soft hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-5">
          {/* Media Hero */}
          <div className="h-56 bg-zinc-200 relative overflow-hidden rounded-[12px] border border-hairline">
            <img
              src={issue.mediaUrl}
              alt="Issue Media"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            
            {/* Tag Overlay */}
            <div className="absolute bottom-3 left-4 right-4 flex justify-between items-center">
              <span className="bg-ink text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-[3px]">
                {(issue.category || "").toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wider text-white ${issue.severity === 'HIGH' ? 'bg-st-stalled' : 'bg-st-escalate'}`}>
                SEVERITY {issue.severity}
              </span>
            </div>
          </div>

          {/* Title and metadata */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono font-medium text-ink-soft tracking-wider">{issue.dossierId}</span>
              <span className="text-xs text-ink-soft">{issue.age}</span>
            </div>
            <h2 className="text-xl font-bold font-display tracking-tight leading-tight text-ink">
              {issue.title}
            </h2>
            
            {/* Location Banner */}
            <div className="flex items-center justify-between bg-white border border-hairline p-3 rounded-[8px] text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <span className="text-civic font-bold font-mono">⬡</span>
                <span>{issue.location} · <span className="font-mono text-ink-soft">{issue.ward}</span></span>
              </div>
              <button className="text-civic hover:text-civic-deep font-bold font-mono flex items-center gap-0.5 text-[11px] uppercase tracking-wider">
                <Map className="w-3.5 h-3.5" /> Map View
              </button>
            </div>
          </div>

          {/* Case Lifecycle Timeline */}
          <div className="bg-white border border-hairline rounded-[12px] p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-ink-soft border-b border-hairline pb-2">
              Case Timeline
            </h3>
            <div className="relative pl-4 border-l-2 border-hairline space-y-4 pt-1">
              {(issue.timeline || []).map((event, idx) => {
                const isLatest = idx === (issue.timeline || []).length - 1;
                const statusColorInfo = getStatusColors(event.status);
                return (
                  <div key={idx} className="relative">
                    {/* Event bullet */}
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 bg-white ${isLatest ? 'border-civic' : 'border-zinc-400'}`}></div>
                    
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono font-black uppercase tracking-wider rounded-[3px] px-1.5 py-0.5 border ${statusColorInfo.border} ${statusColorInfo.bg} ${statusColorInfo.text}`}>
                          {event.status}
                        </span>
                        <span className="text-[10px] font-mono font-medium text-zinc-400">
                          {event.timestamp} ({event.date})
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft leading-snug">{event.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Signature Aspect: Collapsible Case Log */}
          <div className="bg-ink text-zinc-100 rounded-[12px] overflow-hidden border border-zinc-800 shadow-md">
            <button
              onClick={() => setIsCaseLogOpen(!isCaseLogOpen)}
              className="w-full bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex justify-between items-center hover:bg-zinc-800/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-zinc-300">
                  Setu's Case Log {isStreaming && '[STREAMING]'}
                </span>
              </div>
              {isCaseLogOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>

            <AnimatePresence>
              {isCaseLogOpen && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden font-mono text-[11px] leading-relaxed p-4 bg-zinc-950 text-zinc-200 border-l-[3px] border-civic"
                >
                  <div className="space-y-2">
                    {(issue.caseLog || []).slice(0, visibleLinesCount).map((log, index) => {
                      const isComplete = log.isDone;
                      return (
                        <motion.div
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={index}
                          className="flex items-start gap-2.5"
                        >
                          <span className="text-zinc-500 text-[10px] select-none">{log.time}</span>
                          <span className={`${isComplete ? 'text-civic' : 'text-orange-400'} font-bold`}>{log.glyph}</span>
                          <span className={log.dim ? 'text-zinc-500 italic' : 'text-zinc-200'}>
                            {log.text}
                          </span>
                          {isComplete && <span className="text-civic select-none font-bold">✓</span>}
                        </motion.div>
                      );
                    })}

                    {visibleLinesCount === 0 && (
                      <p className="text-zinc-500 italic select-none">Initializing dossier pipeline stream...</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Area: Corroboration Button */}
          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleCorroborateClick}
              disabled={corroborated}
              className={`flex-1 font-display font-bold py-3 text-xs uppercase tracking-widest border-2 flex items-center justify-center gap-2 transition-all ${
                corroborated
                  ? 'border-st-resolved/40 bg-st-resolved/10 text-st-resolved cursor-default'
                  : 'border-ink bg-ink text-white hover:bg-zinc-800'
              } shadow-[3px_3px_0px_0px_rgba(22,24,29,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]`}
            >
              {corroborated ? (
                <>
                  <Check className="w-4 h-4" />
                  Confirmed Outage
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  I see this too ({localConfirmedCount})
                </>
              )}
            </motion.button>
          </div>

          {/* Comments Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-ink-soft border-b border-hairline pb-2">
              Citizen-Agent Record Thread ({(issue.comments || []).length})
            </h3>

            {/* List and Custom Replies */}
            <div className="space-y-3">
              {(issue.comments || []).length === 0 ? (
                <p className="text-zinc-400 italic text-xs py-2 text-center">No commentary on dossier yet. Enter response below to trigger Setu.</p>
              ) : (
                (issue.comments || []).map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-[8px] flex flex-col gap-1 transition-all ${
                      comment.isAgent
                        ? 'bg-civic-tint/90 border-l-[3px] border-civic ml-4 self-end'
                        : 'bg-white border border-hairline'
                    }`}
                  >
                    <div className="flex justify-between items-baseline">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {comment.isAgent && <span className="text-civic select-none font-bold">⬡</span>}
                        <span className={comment.isAgent ? 'text-civic-deep' : 'text-ink font-semibold'}>
                          {comment.author} {comment.isAgent && '(Setu AI agent)'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">{comment.time}</span>
                    </div>
                    <p className="text-xs text-ink-soft font-mono leading-relaxed">{comment.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sticky Write-Comment Bar */}
        <form
          onSubmit={handleSendComment}
          className="absolute bottom-0 left-0 right-0 bg-white border-t border-hairline px-4 py-3 flex gap-2 items-center z-10"
        >
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add to transparent civic record..."
            className="flex-1 text-xs border border-hairline rounded-[6px] px-3.5 py-2 focus:outline-none focus:border-civic font-mono"
          />
          <button
            type="submit"
            className="bg-civic text-white p-2 rounded-[6px] hover:bg-civic-deep transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </motion.div>
    </div>
  );
};
