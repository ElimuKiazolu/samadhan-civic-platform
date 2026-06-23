import { useState, useEffect } from 'react';
import { CivicIssue, Comment } from './types';
import { IssueCard } from './components/IssueCard';
import { IssueDetailModal } from './components/IssueDetailModal';
import { ReportWizard } from './components/ReportWizard';
import { AuthorityDashboard } from './components/AuthorityDashboard';
import { AlertsView } from './components/AlertsView';
import { YouProfile } from './components/YouProfile';
import { Radio, Users, Bell, User, Plus, ShieldAlert, SlidersHorizontal, MapPin, Eye, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Local high-fidelity initial fallback mock data
const INITIAL_MOCK_ISSUES: CivicIssue[] = [
  {
    id: 'iss-101',
    dossierId: 'Dossier #4829-X',
    title: 'Active sinkhole and severe pothole cluster near Metro Pillar 142',
    category: 'Roads/Potholes',
    severity: 'HIGH',
    status: 'ESCALATED',
    location: 'University Rd, Metro Corridor',
    ward: 'Ward 12',
    age: '3h ago',
    confirmedCount: 42,
    agentStatus: 'Setu: Dispatched to RMC Roads. No response in 48h → re-escalated.',
    mediaUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '09:12', date: 'Today', note: 'Citizen photo & GPS logged' },
      { status: 'VALIDATED', timestamp: '09:14', date: 'Today', note: 'Setu Vision triage: Confirmed High Hazard' },
      { status: 'ESCALATED', timestamp: '11:22', date: 'Today', note: 'Complaint dispatched to RMC Roads' }
    ],
    caseLog: [
      { time: '09:12', glyph: '›', text: 'classifying media……………… pothole · severity HIGH', isDone: true },
      { time: '09:13', glyph: '›', text: 'locating………………………… Ward 12, University Rd', isDone: true },
      { time: '09:14', glyph: '›', text: 'duplicate check……………… merged 3 parallel pings', isDone: true },
      { time: '09:14', glyph: '✦', text: 'complaint dispatched → RMC Roads (demo inbox)', isDone: true },
      { time: '11:22', glyph: '↑', text: 'SLA priority check…………… raised internal priority level', isDone: true }
    ],
    comments: [
      {
        id: 'c-1',
        author: 'Citizen #102',
        isAgent: false,
        text: 'This is the third report this week. Very dangerous for two-wheelers at night.',
        time: '2h ago'
      },
      {
        id: 'c-2',
        author: 'Setu',
        isAgent: true,
        text: 'Citizen #102, corroboration logged. RMC Executive Engineer (Roads) has been alerted with urgent priority tag P-3212.',
        time: '1h ago'
      }
    ]
  },
  {
    id: 'iss-102',
    dossierId: 'Dossier #3911-S',
    title: 'Streetlights flickering and completely dead along Canal Walkway',
    category: 'Streetlights',
    severity: 'MEDIUM',
    status: 'STALLED',
    location: 'Canal Walkway, Kalawad Rd',
    ward: 'Ward 8',
    age: '2d ago',
    confirmedCount: 19,
    agentStatus: 'Setu: SLA breached (48h limit). Re-escalating to RMC Electrical.',
    mediaUrl: 'https://images.unsplash.com/photo-1542314831-c6a4d27e66c9?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '18:30', date: '2 days ago', note: 'Logged by night walker' },
      { status: 'VALIDATED', timestamp: '18:31', date: '2 days ago', note: 'Setu triage confirmed' },
      { status: 'STALLED', timestamp: '18:31', date: 'Today', note: 'SLA countdown breached without acknowledgment' }
    ],
    caseLog: [
      { time: '18:30', glyph: '›', text: 'classifying media……………… streetlight outage · MED', isDone: true },
      { time: '18:31', glyph: '✦', text: 'routed → RMC Electrical Dept', isDone: true },
      { time: '18:31', glyph: '↑', text: 'no acknowledgment in 48h → marked STALLED & alerted chief', isDone: true }
    ],
    comments: [
      { id: 'c-3', author: 'Ramesh Patel', isAgent: false, text: 'Pitch dark near the sitting benches.', time: '1d ago' }
    ]
  },
  {
    id: 'iss-103',
    dossierId: 'Dossier #5102-W',
    title: 'Severe drinking supply pipeline burst flooding main crossroads',
    category: 'Water',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    location: 'Amin Marg Crossroads',
    ward: 'Ward 10',
    age: '5h ago',
    confirmedCount: 63,
    agentStatus: 'Setu: RMC Water team dispatched emergency valve repair unit.',
    mediaUrl: 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '06:15', date: 'Today', note: 'Reported with video verification' },
      { status: 'VALIDATED', timestamp: '06:16', date: 'Today', note: 'High acute water loss detected' },
      { status: 'ESCALATED', timestamp: '06:18', date: 'Today', note: 'Emergency SMS & mail dispatched' },
      { status: 'IN_PROGRESS', timestamp: '08:40', date: 'Today', note: 'RMC Ward 10 plumber unit on site' }
    ],
    caseLog: [
      { time: '06:15', glyph: '›', text: 'classifying media……………… acute pipe burst · HIGH hazard', isDone: true },
      { time: '06:16', glyph: '✦', text: 'hotline trigger dispatched → RMC Hydraulic Engineer', isDone: true },
      { time: '08:40', glyph: '✓', text: 'authority telemetry acknowledged → field crew active', isDone: true }
    ],
    comments: []
  },
  {
    id: 'iss-104',
    dossierId: 'Dossier #2809-G',
    title: 'Overflowing community garbage dump blocking pedestrian sidewalk',
    category: 'Garbage/Waste',
    severity: 'MEDIUM',
    status: 'VALIDATED',
    location: 'Sadhu Vaswani Rd, Behind Temple',
    ward: 'Ward 12',
    age: '1d ago',
    confirmedCount: 14,
    agentStatus: 'Setu: Awaiting sanitation tipper truck schedule.',
    mediaUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '11:00', date: 'Yesterday', note: 'Citizen complaint' },
      { status: 'VALIDATED', timestamp: '11:01', date: 'Yesterday', note: 'Routed to Solid Waste Mgmt' }
    ],
    caseLog: [
      { time: '11:00', glyph: '›', text: 'classifying media……………… solid waste overflow · MED', isDone: true },
      { time: '11:01', glyph: '✦', text: 'queued → RMC Health & Sanitation Ward 12', isDone: true }
    ],
    comments: []
  },
  {
    id: 'iss-105',
    dossierId: 'Dossier #1944-D',
    title: 'Raw sewage backflow from storm drain during evening peak hours',
    category: 'Drainage/Sewage',
    severity: 'HIGH',
    status: 'RESOLVED',
    location: 'Yagnik Rd, Near Gymkhana',
    ward: 'Ward 7',
    age: '3d ago',
    confirmedCount: 31,
    agentStatus: 'Setu: RMC uploaded resolution proof. Community verification pending.',
    mediaUrl: 'https://images.unsplash.com/photo-1504307651591-00dcc993a6ff?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '17:20', date: '3 days ago', note: 'Multiple citizen complaints' },
      { status: 'VALIDATED', timestamp: '17:21', date: '3 days ago', note: 'Triage complete' },
      { status: 'ESCALATED', timestamp: '17:25', date: '3 days ago', note: 'Dispatched to Drainage RMC' },
      { status: 'IN_PROGRESS', timestamp: '10:00', date: 'Yesterday', note: 'Suction jet machine deployed' },
      { status: 'RESOLVED', timestamp: '16:45', date: 'Yesterday', note: 'Line cleared & sanitized. Proof attached.' }
    ],
    caseLog: [
      { time: '17:20', glyph: '›', text: 'classifying media……………… drainage backup · HIGH', isDone: true },
      { time: '17:25', glyph: '✦', text: 'complaint dispatched → RMC Drainage Dept', isDone: true },
      { time: '16:45', glyph: '✓', text: 'case marked RESOLVED with photographic proof id #RF-99', isDone: true }
    ],
    comments: [
      { id: 'c-4', author: 'Setu', isAgent: true, text: 'RMC Drainage team has cleared the obstruction. Tap to verify if the area remains clean.', time: '18h ago' }
    ]
  }
];

export default function App() {
  const [issues, setIssues] = useState<CivicIssue[]>(INITIAL_MOCK_ISSUES);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'alerts' | 'you'>('feed');
  const [isReporting, setIsReporting] = useState(false);
  const [role, setRole] = useState<'citizen' | 'authority'>('citizen');
  
  // Local reported list tracker to populate in "You" tab dynamically
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [selectedWard, setSelectedWard] = useState<string>('All Wards');

  useEffect(() => {
    // Dynamic fetch from Express API
    fetch('/api/issues')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setIssues(data);
        }
      })
      .catch((err) => {
        console.log('Using initial client fallback data safely', err);
      });
  }, []);

  // Update selected issue reference when active issue is mutated globally
  useEffect(() => {
    if (selectedIssue) {
      const updated = issues.find((i) => i.id === selectedIssue.id);
      if (updated && updated !== selectedIssue) {
        setSelectedIssue(updated);
      }
    }
  }, [issues, selectedIssue]);

  const handleCorroborate = (issueId: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              confirmedCount: issue.confirmedCount + 1,
              isUserCorroborated: true,
              agentStatus: 'Setu: Corroborated. Relaying density spike data to department directors.',
            }
          : issue
      )
    );
  };

  const handleAddComment = (issueId: string, newComment: Comment) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              comments: [...issue.comments, newComment],
            }
          : issue
      )
    );
  };

  const handleAddIssue = (newIssueData: Omit<CivicIssue, 'id' | 'dossierId' | 'age' | 'timeline' | 'comments'>) => {
    const id = `iss-${Date.now()}`;
    const dossierId = `Dossier #${Math.floor(1000 + Math.random() * 9000)}-Z`;
    
    const newIssue: CivicIssue = {
      ...newIssueData,
      id,
      dossierId,
      age: 'Just now',
      timeline: [
        { status: 'SUBMITTED', timestamp: '10:02', date: 'Today', note: 'Citizen photo & GPS logged' },
        { status: 'VALIDATED', timestamp: '10:02', date: 'Today', note: 'Setu Vision triage passed: Ingestion completed' }
      ],
      comments: []
    };

    // Prepend to issue list
    setIssues((prev) => [newIssue, ...prev]);
    // Save to user reports list
    setReportedIds((prev) => [...prev, id]);
    setIsReporting(false);
    setActiveTab('feed');

    // POST to express endpoint if active to keep server in sync
    fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIssue),
    }).catch(() => {});
  };

  const handleUpdateStatus = (issueId: string, nextStatus: CivicIssue['status'], proofUrl?: string) => {
    setIssues((prev) =>
      prev.map((issue) => {
        if (issue.id === issueId) {
          const updatedTimeline = [...issue.timeline];
          const updatedCaseLog = [...issue.caseLog];
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
                          onSelect={(iss) => setSelectedIssue(iss)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'alerts' && <AlertsView />}

              {activeTab === 'you' && (
                <YouProfile
                  userIssues={userCreatedIssues}
                  onSelectIssue={(iss) => setSelectedIssue(iss)}
                />
              )}
            </>
          ) : (
            // Authority view states
            <AuthorityDashboard
              issues={issues}
              onUpdateStatus={handleUpdateStatus}
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
                onClick={() => setActiveTab('alerts')}
                className={`flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'alerts' ? 'text-civic font-black scale-105' : 'text-zinc-400'
                }`}
              >
                <div className="relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-0 right-0 w-2 h-2 bg-st-stalled rounded-full border border-white"></span>
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
            <ReportWizard
              onClose={() => setIsReporting(false)}
              onSubmit={handleAddIssue}
            />
          )}

          {selectedIssue && (
            <IssueDetailModal
              issue={selectedIssue}
              onClose={() => setSelectedIssue(null)}
              onCorroborate={handleCorroborate}
              onAddComment={handleAddComment}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
