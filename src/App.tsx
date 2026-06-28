import { useState, useEffect, useMemo } from 'react';
import { CivicIssue } from './types';
import { IssueCard } from './components/IssueCard';
import { IssueDetailModal } from './components/IssueDetailModal';
import { ReportFlow, ReportResult } from './components/ReportFlow';
import { AuthorityDashboard } from './components/AuthorityDashboard';
import { AlertsView } from './components/AlertsView';
import { YouProfile } from './components/YouProfile';
import { deriveAlerts } from './lib/alerts';
import { Radio, Users, Bell, User, Plus, ShieldAlert, SlidersHorizontal, MapPin, Eye, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Derive a human "age" label from an ISO createdAt timestamp. Real issues from
// the server carry createdAt (not the legacy mock `age` string), so the feed
// computes it client-side.
function deriveAge(createdAt?: string): string {
  if (!createdAt) return 'Just now';
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return 'Just now';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Normalize a server issue for the feed: ensure a displayable age + location.
function hydrateIssue(issue: any): CivicIssue {
  return {
    ...issue,
    age: issue.age || deriveAge(issue.createdAt),
    location: issue.location || issue.ward || 'Rajkot',
  };
}

// Stable anonymous per-device id (no auth yet) → "one corroboration per device".
function getDeviceUid(): string {
  try {
    let id = localStorage.getItem('samadhan_uid');
    if (!id) {
      id = `cit-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem('samadhan_uid', id);
    }
    return id;
  } catch {
    return 'citizen-demo';
  }
}

// Read-alert ids persist in localStorage so the bell's unread dot survives refresh.
const READ_ALERTS_KEY = 'samadhan_read_alerts';
function loadReadAlertIds(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(READ_ALERTS_KEY) || '[]'));
  } catch {
    return new Set<string>();
  }
}

export default function App() {
  // Feed starts EMPTY and is populated from the live API (the single source of
  // truth). No bundled mock data — only real Firestore/local reports appear.
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'alerts' | 'you'>('feed');
  const [isReporting, setIsReporting] = useState(false);
  const [role, setRole] = useState<'citizen' | 'authority'>('citizen');
  
  // Local reported list tracker to populate in "You" tab dynamically
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [selectedWard, setSelectedWard] = useState<string>('All Wards');

  // Stable device id for one-per-device corroboration; alert read-state (localStorage).
  const deviceUid = useMemo(getDeviceUid, []);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => loadReadAlertIds());

  // Real alerts derived from live issue events (no mock data).
  const alerts = useMemo(() => deriveAlerts(issues), [issues]);
  const unreadCount = useMemo(
    () => alerts.reduce((n, a) => (readAlertIds.has(a.id) ? n : n + 1), 0),
    [alerts, readAlertIds]
  );

  const markAlertsRead = () => {
    setReadAlertIds((prev) => {
      const next = new Set(prev);
      alerts.forEach((a) => next.add(a.id));
      try { localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Re-fetch the live issue feed from the Express API. Reused on mount and after
  // the authority "Run SLA Sweep" so the feed visibly reflects sentinel escalations.
  const refreshIssues = async () => {
    try {
      const res = await fetch('/api/issues');
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      // The server is the single source of truth: a successful fetch always
      // replaces local state — including an empty array (a clean feed), so stale
      // data never lingers. Only a network/parse error preserves prior state.
      if (Array.isArray(data)) {
        setIssues(data.map(hydrateIssue));
      }
    } catch (err) {
      console.log('Issue refresh failed; keeping current data safely', err);
    }
  };

  useEffect(() => {
    refreshIssues();
  }, []);

  // Keep the open dossier's TOP-LEVEL fields in sync when the feed refreshes,
  // but PRESERVE detail-loaded subcollections (comments/caseLog/timeline) — the
  // feed list doesn't carry them, so a background refresh must not wipe them.
  // Depends on `issues` only (functional update) to avoid a re-render loop.
  useEffect(() => {
    setSelectedIssue((prev) => {
      if (!prev) return prev;
      const updated = issues.find((i) => i.id === prev.id);
      if (!updated) return prev;
      return {
        ...updated,
        comments: prev.comments?.length ? prev.comments : updated.comments,
        caseLog: prev.caseLog?.length ? prev.caseLog : updated.caseLog,
        timeline: prev.timeline?.length ? prev.timeline : updated.timeline,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues]);

  // Load the FULL dossier (comments + caseLog + timeline) from /api/issues/:id.
  const refetchDetail = async (issueId: string) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`);
      if (res.ok) {
        const full = await res.json();
        setSelectedIssue(hydrateIssue(full));
      }
    } catch (err) {
      console.log('Detail refetch failed; keeping current view', err);
    }
  };

  // Open a dossier: show the feed item instantly, then hydrate with full detail.
  const selectIssue = (issue: CivicIssue) => {
    setSelectedIssue(issue);
    refetchDetail(issue.id);
  };

  // Corroboration now PERSISTS (one-per-device via deviceUid). Optimistic, then
  // reconciled to the authoritative server count.
  const handleCorroborate = async (issueId: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? { ...issue, confirmedCount: (issue.confirmedCount || 0) + 1, isUserCorroborated: true }
          : issue
      )
    );
    try {
      const res = await fetch(`/api/issues/${issueId}/corroborate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reporterId: deviceUid }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.count === 'number') {
        setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, confirmedCount: data.count, isUserCorroborated: true } : i)));
        setSelectedIssue((prev) => (prev && prev.id === issueId ? { ...prev, confirmedCount: data.count, isUserCorroborated: true } : prev));
      }
    } catch (err) {
      console.log('Corroborate failed', err);
    }
  };

  // ReportFlow owns the upload + classify + post round-trips and hands back the
  // server's result. We just record the new issue id, optimistically show it,
  // and re-pull the authoritative feed.
  const handleReportPosted = (result: ReportResult) => {
    const issue = result?.issue;
    if (issue?.id) {
      setReportedIds((prev) => (prev.includes(issue.id) ? prev : [...prev, issue.id]));
      // Public outcomes appear in the feed immediately; private ones (NEEDS_INFO/
      // REJECTED) stay off the public feed but remain in "You".
      if (issue.isPublic !== false) {
        setIssues((prev) => {
          const hydrated = hydrateIssue(issue);
          const without = prev.filter((i) => i.id !== hydrated.id);
          return [hydrated, ...without];
        });
      }
    }
    setIsReporting(false);
    setActiveTab('feed');
    // Reconcile against the server (dedup merges, dispatch state, etc.).
    refreshIssues();
  };

  const handleUpdateStatus = (issueId: string, nextStatus: CivicIssue['status'], proofUrl?: string) => {
    setIssues((prev) =>
      prev.map((issue) => {
        if (issue.id === issueId) {
          const updatedTimeline = [...(issue.timeline || [])];
          const updatedCaseLog = [...(issue.caseLog || [])];
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          // Determine status modifications
          let agentStatus = issue.agentStatus;
          if (nextStatus === 'IN_PROGRESS') {
            agentStatus = 'Setu: Acknowledged by RMC. Dispatch crew assigned.';
            updatedTimeline.push({
              status: 'IN_PROGRESS',
              timestamp: timeStr,
              date: 'Today',
              note: 'RMC Roads crew acknowledged case, queued deployment.'
            });
            updatedCaseLog.push({
              time: timeStr,
              glyph: '✓',
              text: 'Authority acknowledged. Dispatched task schedule.',
              isDone: true
            });
          } else if (nextStatus === 'RESOLVED') {
            agentStatus = 'Setu: Resolved. Resolution proof verified.';
            updatedTimeline.push({
              status: 'RESOLVED',
              timestamp: timeStr,
              date: 'Today',
              note: 'RMC uploaded completion photographs. Line cleared.'
            });
            updatedCaseLog.push({
              time: timeStr,
              glyph: '✓',
              text: 'Case marked RESOLVED with photographic verification.',
              isDone: true
            });
          }

          return {
            ...issue,
            status: nextStatus,
            agentStatus,
            mediaUrl: proofUrl || issue.mediaUrl,
            timeline: updatedTimeline,
            caseLog: updatedCaseLog
          };
        }
        return issue;
      })
    );
  };

  // Filter issues for "You" tab
  const userCreatedIssues = issues.filter((i) => reportedIds.includes(i.id));

  // Ward specific filter for citizen feed
  const filteredCitizenIssues = issues.filter((issue) => {
    if (selectedWard === 'All Wards') return true;
    return issue.ward === selectedWard;
  });

  return (
    <div className="w-full h-screen bg-paper flex justify-center overflow-hidden">
      {/* Main Single Column Container */}
      <div className="w-full max-w-[430px] h-screen bg-white relative flex flex-col md:shadow-[0_0_24px_rgba(22,24,29,0.06)] md:border-x md:border-hairline overflow-hidden">
        {/* Absolute role switcher container (Floating at page top, constrained within max-width area) */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-center bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-xs z-50 shadow-md">
          <span className="text-zinc-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            Samadhan Engine Switch
          </span>
          <div className="flex gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => {
                setRole('citizen');
                setActiveTab('feed');
              }}
              className={`px-3 py-1.5 rounded-md font-mono font-bold uppercase text-[9px] tracking-wider transition-all flex items-center gap-1 ${
                role === 'citizen' ? 'bg-civic text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-3 h-3" /> Citizen
            </button>
            <button
              onClick={() => {
                setRole('authority');
                setActiveTab('feed'); // resets view
              }}
              className={`px-3 py-1.5 rounded-md font-mono font-bold uppercase text-[9px] tracking-wider transition-all flex items-center gap-1 ${
                role === 'authority' ? 'bg-st-stalled text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ShieldAlert className="w-3 h-3" /> Authority
            </button>
          </div>
        </div>

        {/* Brand App Header */}
        <header className="pt-[72px] px-6 pb-2.5 border-b border-hairline flex justify-between items-baseline shrink-0 bg-white">
          <h1 className="text-xl font-display font-black tracking-tighter text-ink uppercase">
            Samadhan
          </h1>
          <span className="text-[9px] font-mono font-semibold text-ink-soft tracking-wider uppercase">
            Dossiers #IN-RG-12
          </span>
        </header>

        {/* Scrollable/Interactive Internal View Body */}
        <div className="flex-1 flex flex-col overflow-hidden bg-paper pb-20 relative">
          
          {role === 'citizen' ? (
            // Citizen view states
            <>
              {activeTab === 'feed' && (
                <div className="flex-1 flex flex-col min-h-0 bg-paper">
                  {/* Location Switch / Filter */}
                  <div className="bg-white px-5 py-3 border-b border-hairline flex justify-between items-center shrink-0 shadow-xs z-10 select-none">
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                      Hyperlocal Feed Network
                    </span>
                    <select
                      value={selectedWard}
                      onChange={(e) => setSelectedWard(e.target.value)}
                      className="bg-zinc-50 text-[10px] font-mono font-black text-civic-deep border border-hairline rounded-[6px] px-2 py-1 focus:outline-none uppercase"
                    >
                      <option value="All Wards">All Wards ▾</option>
                      <option value="Ward 12">Ward 12 ▾</option>
                      <option value="Ward 8">Ward 8 ▾</option>
                      <option value="Ward 10">Ward 10 ▾</option>
                      <option value="Ward 7">Ward 7 ▾</option>
                    </select>
                  </div>

                  {/* Scrollable list card feed */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {filteredCitizenIssues.length === 0 ? (
                      <div className="text-center py-12 px-2 text-zinc-400 space-y-2">
                        <MapPin className="w-8 h-8 text-zinc-300 mx-auto" />
                        <p className="text-xs font-bold uppercase tracking-wide">No active dossiers near you yet</p>
                        <p className="text-[10px] font-mono leading-relaxed max-w-[220px] mx-auto">All systems operational. Click report plus button below if you observe anomalies.</p>
                      </div>
                    ) : (
                      filteredCitizenIssues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          onSelect={selectIssue}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'alerts' && <AlertsView alerts={alerts} readIds={readAlertIds} />}

              {activeTab === 'you' && (
                <YouProfile
                  userIssues={userCreatedIssues}
                  onSelectIssue={selectIssue}
                />
              )}
            </>
          ) : (
            // Authority view states
            <AuthorityDashboard
              issues={issues}
              onUpdateStatus={handleUpdateStatus}
              onRefresh={refreshIssues}
            />
          )}

          {/* Citizen view navigation bar */}
          {role === 'citizen' && (
            <nav className="absolute bottom-0 left-0 right-0 h-[64px] bg-white border-t border-hairline flex justify-around items-center px-4 pb-2 z-30 select-none shadow-[0_-2px_12px_rgba(22,24,29,0.03)]">
              <button
                onClick={() => setActiveTab('feed')}
                className={`flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'feed' ? 'text-civic font-black scale-105' : 'text-zinc-400'
                }`}
              >
                <Radio className="w-5 h-5" />
                <span className="text-[10px] font-mono uppercase tracking-tight">Feed</span>
              </button>

              {/* Centered Emphasized Report Button */}
              <button
                onClick={() => setIsReporting(true)}
                className="w-11 h-11 bg-ink hover:bg-zinc-800 text-white rounded-full flex items-center justify-center shadow-lg -mt-6 border-4 border-white transition-all transform hover:scale-105 active:scale-95"
              >
                <Plus className="w-6 h-6" />
              </button>

              <button
                onClick={() => { setActiveTab('alerts'); markAlertsRead(); }}
                className={`flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'alerts' ? 'text-civic font-black scale-105' : 'text-zinc-400'
                }`}
              >
                <div className="relative">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-st-stalled rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono uppercase tracking-tight">Alerts</span>
              </button>

              <button
                onClick={() => setActiveTab('you')}
                className={`flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'you' ? 'text-civic font-black scale-105' : 'text-zinc-400'
                }`}
              >
                <User className="w-5 h-5" />
                <span className="text-[10px] font-mono uppercase tracking-tight">You</span>
              </button>
            </nav>
          )}

        </div>

        {/* Overlays / Modal Wizards */}
        <AnimatePresence>
          {isReporting && (
            <ReportFlow
              onClose={() => setIsReporting(false)}
              onPosted={handleReportPosted}
            />
          )}

          {selectedIssue && (
            <IssueDetailModal
              issue={selectedIssue}
              onClose={() => setSelectedIssue(null)}
              onCorroborate={handleCorroborate}
              onRefreshDetail={refetchDetail}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
