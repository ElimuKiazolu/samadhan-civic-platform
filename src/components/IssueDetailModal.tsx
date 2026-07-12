import React, { useState, useEffect, useRef } from 'react';
import { CivicIssue, Comment, CaseLogLine, SetuSuggestions } from '../types';
import { X, Map, Users, Send, Check, AlertTriangle, ChevronDown, ChevronUp, Clock, ShieldAlert, Wrench, FileText, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStatusColors } from './IssueCard';
import { useAuth } from '../context/AuthContext';
import { IssueMapModal } from './IssueMapModal';
import { SetuBadge, SetuMessage } from './SetuBadge';
import { AuthorityMessage } from './AuthorityMessage';

interface IssueDetailModalProps {
  issue: CivicIssue;
  onClose: () => void;
  onCorroborate: (id: string) => void;
  /** Re-fetch the full dossier (/api/issues/:id) so persisted comments + any
   *  decorum-gated Setu reply render from the server. */
  onRefreshDetail: (issueId: string) => void | Promise<void>;
  /** Open the sign-in prompt when a logged-out user taps a gated action. */
  onRequireAuth: (reason: string) => void;
}

export const IssueDetailModal: React.FC<IssueDetailModalProps> = ({
  issue,
  onClose,
  onCorroborate,
  onRefreshDetail,
  onRequireAuth,
}) => {
  const { user, role, authedFetch } = useAuth();
  const isAuthority = role === 'authority';
  const [isCaseLogOpen, setIsCaseLogOpen] = useState(true);
  const [showMap, setShowMap] = useState(false);

  // Setu's on-demand fix suggestions (authority dossier only). Generated the first
  // time an authority opens a case and cached on the issue, so re-opens render the
  // cache with no further Gemini call.
  const [suggestions, setSuggestions] = useState<SetuSuggestions | null>(issue.setuSuggestions || null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [corroborated, setCorroborated] = useState(issue.isUserCorroborated || false);
  const [localConfirmedCount, setLocalConfirmedCount] = useState(issue.confirmedCount);
  // Safety net for videos the browser can't decode (e.g. iPhone HEVC/H.265 in
  // Chrome/Firefox): the <video> onError fires and we show a download fallback.
  const [videoError, setVideoError] = useState(false);
  
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

  // Reset suggestions to whatever the (possibly cached) issue carries when the
  // open dossier changes.
  useEffect(() => {
    setSuggestions(issue.setuSuggestions || null);
  }, [issue.id, issue.setuSuggestions]);

  // On-demand generation: ONLY authorities trigger it, ONLY once per open, and
  // ONLY when nothing is cached. On failure we simply render nothing (graceful).
  useEffect(() => {
    if (!isAuthority) return;
    if (suggestions || issue.setuSuggestions) return;
    let cancelled = false;
    setSuggestLoading(true);
    authedFetch(`/api/issues/${issue.id}/suggestions`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setSuggestions(data.suggestions || null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSuggestLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthority, issue.id]);

  const handleCorroborateClick = () => {
    if (corroborated) return;
    if (!user) { onRequireAuth('Sign in to confirm you see this issue too.'); return; }
    setCorroborated(true);
    setLocalConfirmedCount((prev) => prev + 1);
    onCorroborate(issue.id);
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || sending) return;
    if (!user) { onRequireAuth('Sign in to add to the civic record.'); return; }

    setSending(true);
    setCommentText('');
    try {
      // Persist to the comments subcollection. The server applies Setu's
      // rule-based decorum gate (reply only when value-adding; never fabricates).
      const res = await authedFetch(`/api/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('comment failed');
      // Reload the full dossier so the persisted comment (+ any Setu reply) show.
      await onRefreshDetail(issue.id);
    } catch {
      // Restore the text so the citizen can retry; nothing was persisted.
      setCommentText(text);
    } finally {
      setSending(false);
    }
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
          {/* Media Hero — video plays inline with controls; photos as before. */}
          <div className="h-56 bg-zinc-200 relative overflow-hidden rounded-[12px] border border-hairline">
            {issue.mediaType === 'video' ? (
              videoError ? (
                <a
                  href={issue.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-full flex flex-col items-center justify-center gap-2 bg-ink text-zinc-300 text-center px-4"
                >
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                  <span className="text-[11px] font-mono leading-relaxed">
                    This video may not play in this browser.<br />Tap to open or download it.
                  </span>
                </a>
              ) : (
                <video
                  src={issue.mediaUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onError={() => setVideoError(true)}
                  className="w-full h-full object-cover bg-ink"
                />
              )
            ) : (
              <img
                src={issue.mediaUrl}
                alt="Issue Media"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
            
            {/* Tag Overlay — sits at the top for video so it never covers the
                native <video> controls at the bottom; bottom for photos. */}
            <div className={`absolute ${issue.mediaType === 'video' ? 'top-3' : 'bottom-3'} left-4 right-4 flex justify-between items-center pointer-events-none`}>
              <span className="bg-ink text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-[3px]">
                {(issue.category || "").toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wider text-white ${issue.severity === 'HIGH' ? 'bg-st-stalled' : 'bg-st-escalate'}`}>
                SEVERITY {issue.severity}
              </span>
            </div>
          </div>

          {/* Resolution proof — the payoff. Shown only when resolved with proof;
              a SEPARATE panel from the original evidence hero above (before/after). */}
          {issue.status === 'RESOLVED' && issue.proofUrl && (
            <div className="bg-st-resolved/5 border border-st-resolved/30 rounded-[12px] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-st-resolved flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Resolution Proof
                </h3>
                {issue.resolvedBy && (
                  <span className="text-[10px] font-mono text-ink-soft">{issue.resolvedBy}</span>
                )}
              </div>
              <div className="h-44 rounded-[10px] overflow-hidden border border-hairline bg-ink">
                {issue.proofMediaType === 'video' ? (
                  <video src={issue.proofUrl} controls playsInline preload="metadata" className="w-full h-full object-cover" />
                ) : (
                  <img src={issue.proofUrl} alt="Resolution proof" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                )}
              </div>
              <p className="text-[10px] font-mono text-ink-soft leading-relaxed">
                Completion evidence uploaded by the responsible department.
                {issue.resolvedAt && ` · ${new Date(issue.resolvedAt).toLocaleDateString()}`}
              </p>
            </div>
          )}

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
              <div className="flex items-center gap-1.5 font-medium min-w-0">
                <span className="text-civic font-bold font-mono">⬡</span>
                <span className="truncate">{issue.location} · <span className="font-mono text-ink-soft">{issue.ward}</span></span>
              </div>
              <button
                onClick={() => setShowMap(true)}
                className="text-civic hover:text-civic-deep font-bold font-mono flex items-center gap-0.5 text-[11px] uppercase tracking-wider shrink-0"
              >
                <Map className="w-3.5 h-3.5" /> Map View
              </button>
            </div>

            {/* City routing — which municipal corporation owns this case. */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className="bg-civic text-white px-2 py-0.5 rounded-[3px] font-black uppercase tracking-wider">
                {issue.corporationShort || 'RMC'}
              </span>
              <span className="text-ink-soft">
                {issue.city || 'Rajkot'} · {issue.corporationName || 'Rajkot Municipal Corporation'}
              </span>
            </div>

            {/* Category / severity / corroboration meta + full description. */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-100 text-ink-soft px-2 py-0.5 rounded-[3px]">
                {issue.category}
              </span>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-[3px] text-white ${issue.severity === 'HIGH' ? 'bg-st-stalled' : issue.severity === 'LOW' ? 'bg-st-new' : 'bg-st-escalate'}`}>
                {issue.severity}
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-civic-tint text-civic-deep px-2 py-0.5 rounded-[3px] flex items-center gap-1">
                <Users className="w-3 h-3" /> {localConfirmedCount ?? issue.confirmedCount ?? 0} confirmed
              </span>
            </div>
            {issue.description && (
              <p className="text-xs text-ink-soft leading-relaxed font-mono bg-white border border-hairline rounded-[8px] p-3">
                {issue.description}
              </p>
            )}
          </div>

          {/* ── AUTHORITY DOSSIER (officials only) ─────────────────────────────
              Setu's recommended fixes + the drafted RMC complaint. Reuses the
              shared media/map/timeline/case-log sections below for the rest. */}
          {isAuthority && (
            <div className="space-y-3">
              {/* Setu's suggested fixes — distinct ⬡ SETU treatment. */}
              {(suggestLoading || suggestions) && (
                <div className="bg-gradient-to-br from-civic-tint to-civic-tint/30 border border-civic/40 border-l-[3px] border-l-civic rounded-[10px] p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <SetuBadge />
                    <span className="text-[10px] font-mono font-bold text-civic-deep uppercase tracking-wider">Recommended action</span>
                  </div>
                  {suggestLoading && !suggestions ? (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-civic-deep/70 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Setu is assessing the case…
                    </div>
                  ) : suggestions ? (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-st-escalate">
                          <ShieldAlert className="w-3.5 h-3.5" /> Temporary mitigation
                        </div>
                        <p className="text-xs text-ink font-mono leading-relaxed">{suggestions.temporary}</p>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-civic/20">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-civic-deep">
                          <Wrench className="w-3.5 h-3.5" /> Permanent solution
                        </div>
                        <p className="text-xs text-ink font-mono leading-relaxed">{suggestions.permanent}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Drafted RMC complaint (denormalised from the dispatch record). */}
              {issue.complaintDraft && (
                <details className="bg-white border border-hairline rounded-[10px] overflow-hidden">
                  <summary className="cursor-pointer select-none px-3 py-2.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-ink-soft hover:bg-zinc-50">
                    <FileText className="w-3.5 h-3.5 text-civic" /> Drafted RMC complaint
                  </summary>
                  <p className="px-3 pb-3 text-xs text-ink-soft font-mono leading-relaxed whitespace-pre-wrap border-t border-hairline pt-2.5">
                    {issue.complaintDraft}
                  </p>
                </details>
              )}
            </div>
          )}

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
                <SetuBadge size="xs" />
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-zinc-300">
                  Case Log {isStreaming && '[STREAMING]'}
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
                (issue.comments || []).map((comment) =>
                  comment.isAgent || comment.authorRole === 'agent' ? (
                    // Setu — first-class agent, civic-teal bubble.
                    <SetuMessage key={comment.id} text={comment.text} time={comment.time} />
                  ) : comment.authorRole === 'authority' ? (
                    // RMC official — stamped municipal memo (third distinct voice).
                    <AuthorityMessage key={comment.id} department={comment.departmentName || comment.author} text={comment.text} time={comment.time} />
                  ) : (
                    // Citizen — neutral card.
                    <div
                      key={comment.id}
                      className="p-3 rounded-[8px] flex flex-col gap-1 bg-white border border-hairline"
                    >
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <span className="text-ink font-semibold">{comment.author}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">{comment.time}</span>
                      </div>
                      <p className="text-xs text-ink-soft font-mono leading-relaxed">{comment.text}</p>
                    </div>
                  )
                )
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
            disabled={sending}
            placeholder={sending ? 'Posting…' : isAuthority ? 'Post an official RMC response…' : 'Add to transparent civic record...'}
            className="flex-1 text-xs border border-hairline rounded-[6px] px-3.5 py-2 focus:outline-none focus:border-civic font-mono disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !commentText.trim()}
            className="bg-civic text-white p-2 rounded-[6px] hover:bg-civic-deep transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </motion.div>

      {/* Map sheet — a sibling of the detail sheet inside this overlay (which is
          `absolute inset-0` on the phone column and has NO transform), so the map
          sheet's own `absolute inset-0` stays within the ~430px app frame and
          slides up over the detail sheet. */}
      <AnimatePresence>
        {showMap && <IssueMapModal issue={issue} onClose={() => setShowMap(false)} />}
      </AnimatePresence>
    </div>
  );
};
