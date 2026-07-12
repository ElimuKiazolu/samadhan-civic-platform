import React, { useRef, useState } from 'react';
import { CivicIssue } from '../types';
import { ShieldAlert, CheckCircle2, Clock, MapPin, Loader2, UploadCloud, Camera, ImagePlus, Siren, ArrowUpCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getStatusColors } from './IssueCard';
import { useAuth } from '../context/AuthContext';
import { CameraCapture } from './CameraCapture';
import { isCaptureSupported, MAX_VIDEO_BYTES } from '../lib/capture';

interface AuthorityDashboardProps {
  issues: CivicIssue[];
  onUpdateStatus: (id: string, nextStatus: CivicIssue['status'], proofUrl?: string, proofMediaType?: 'photo' | 'video') => void | Promise<void>;
  onRefresh?: () => Promise<void> | void;
  /** Open the full case dossier (reuses the shared IssueDetailModal). */
  onSelectIssue?: (issue: CivicIssue) => void;
}

export const AuthorityDashboard: React.FC<AuthorityDashboardProps> = ({ issues, onUpdateStatus, onRefresh, onSelectIssue }) => {
  const { authedFetch } = useAuth();
  const [filter, setFilter] = useState<'ALL' | 'VALIDATED' | 'IN_PROGRESS' | 'SLA_BREACH'>('ALL');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Proof capture/upload state (reuses the citizen flow's two-option pattern).
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string>('');
  const [proofMediaType, setProofMediaType] = useState<'photo' | 'video'>('photo');
  const [proofError, setProofError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSupported] = useState(() => isCaptureSupported());
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Autonomous SLA sweep (Setu sentinel) trigger state.
  const [sweepState, setSweepState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [sweepMsg, setSweepMsg] = useState<string>('');

  const handleRunSweep = async () => {
    if (sweepState === 'running') return;
    setSweepState('running');
    setSweepMsg('Setu scanning SLA windows…');
    try {
      const res = await authedFetch('/api/sentinel', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || data.ok === false) throw new Error('Sweep rejected');

      const escalated = Array.isArray(data.escalated) ? data.escalated.length : 0;
      const maxed = Array.isArray(data.maxedOut) ? data.maxedOut.length : 0;
      const scanned = typeof data.scanned === 'number' ? data.scanned : 0;

      if (escalated > 0) {
        setSweepMsg(`↑ ${escalated} case${escalated === 1 ? '' : 's'} re-escalated to next tier · ${scanned} scanned`);
      } else if (maxed > 0) {
        setSweepMsg(`⚠ ${maxed} case${maxed === 1 ? '' : 's'} at top tier · ${scanned} scanned, none escalated`);
      } else {
        setSweepMsg(`✓ No SLA breaches · ${scanned} case${scanned === 1 ? '' : 's'} scanned`);
      }
      setSweepState('done');

      // Pull the refreshed feed so escalations are visible immediately.
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('SLA sweep failed:', err);
      setSweepMsg('Sweep failed — check engine and retry.');
      setSweepState('error');
    }
  };

  const issuesList = issues || [];

  // Filter issues based on status
  const filteredIssues = issuesList.filter((issue) => {
    if (!issue) return false;
    const status = issue.status || 'SUBMITTED';
    if (filter === 'ALL') return true;
    if (filter === 'VALIDATED') return status === 'VALIDATED' || status === 'OPEN';
    if (filter === 'IN_PROGRESS') return status === 'IN_PROGRESS' || status === 'ESCALATED';
    if (filter === 'SLA_BREACH') return status === 'STALLED';
    return true;
  });

  const clearProof = () => {
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(null);
    setProofPreviewUrl('');
    setProofError('');
  };

  const closeResolveModal = () => {
    clearProof();
    setSelectedIssueId(null);
    setShowCamera(false);
  };

  const handleOpenResolveModal = (issueId: string) => {
    clearProof();
    setSelectedIssueId(issueId);
  };

  // Shared proof intake for BOTH the file picker and the in-app camera.
  const acceptProof = (f: File, kind: 'photo' | 'video'): boolean => {
    if (kind === 'video' && f.size > MAX_VIDEO_BYTES) {
      setProofError('That video is over 25 MB. Record a shorter clip.');
      return false;
    }
    setProofError('');
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(f);
    setProofMediaType(kind);
    setProofPreviewUrl(URL.createObjectURL(f));
    return true;
  };

  const handlePickProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind: 'photo' | 'video' = f.type.startsWith('video/') ? 'video' : 'photo';
    if (!acceptProof(f, kind)) e.target.value = '';
  };

  const handleConfirmResolution = async () => {
    if (!selectedIssueId || !proofFile) return;
    setIsResolving(true);
    setProofError('');
    try {
      // Reuse the existing /api/upload path (same validation/sniff/storage).
      const form = new FormData();
      form.append('photo', proofFile);
      const res = await authedFetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.mediaUrl) throw new Error(data.error || 'Proof upload failed.');
      const kind: 'photo' | 'video' = data.mediaType === 'video' ? 'video' : 'photo';
      await onUpdateStatus(selectedIssueId, 'RESOLVED', data.mediaUrl, kind);
      closeResolveModal();
    } catch (err: any) {
      setProofError(err?.message || 'Could not certify proof. Please try again.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-paper">
      
      {/* Control Banner */}
      <div className="bg-white px-5 py-4 border-b border-hairline shrink-0 space-y-3 shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] font-mono leading-none text-zinc-400 font-bold uppercase tracking-widest">Authorized Dashboard</p>
            <h2 className="text-sm font-display font-black text-ink uppercase tracking-tight flex items-center gap-1">
              RMC Roads Unit · <span className="text-civic font-mono">Ward 12 ▾</span>
            </h2>
          </div>
          <div className="bg-st-stalled/10 border border-st-stalled/20 text-st-stalled text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-st-stalled" /> SLA Monitor
          </div>
        </div>

        {/* Tab filters */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-[6px] text-[11px] font-mono font-bold">
          <button
            onClick={() => setFilter('ALL')}
            className={`flex-1 py-1.5 rounded-[4px] text-center uppercase tracking-tight border ${filter === 'ALL' ? 'bg-white text-ink border-hairline shadow-xs font-black' : 'text-zinc-500 border-transparent'}`}
          >
            All ({issuesList.length})
          </button>
          <button
            onClick={() => setFilter('VALIDATED')}
            className={`flex-1 py-1.5 rounded-[4px] text-center uppercase tracking-tight border ${filter === 'VALIDATED' ? 'bg-white text-ink border-transparent shadow-xs font-black' : 'text-zinc-500 border-transparent'}`}
          >
            New ({issuesList.filter(i => i?.status === 'VALIDATED' || i?.status === 'OPEN').length})
          </button>
          <button
            onClick={() => setFilter('IN_PROGRESS')}
            className={`flex-1 py-1.5 rounded-[4px] text-center uppercase tracking-tight border ${filter === 'IN_PROGRESS' ? 'bg-white text-ink border-transparent shadow-xs font-black' : 'text-zinc-500 border-transparent'}`}
          >
            Active ({issuesList.filter(i => i?.status === 'IN_PROGRESS' || i?.status === 'ESCALATED').length})
          </button>
          <button
            onClick={() => setFilter('SLA_BREACH')}
            className={`flex-1 py-1.5 rounded-[4px] text-center uppercase tracking-tight border ${filter === 'SLA_BREACH' ? 'bg-st-stalled/10 text-st-stalled border-st-stalled/30 font-black' : 'text-zinc-500 border-transparent'}`}
          >
            SLA Breach ({issuesList.filter(i => i?.status === 'STALLED').length})
          </button>
        </div>

        {/* Autonomous SLA sweep trigger — runs Setu's sentinel on demand */}
        <div className="space-y-2">
          <button
            onClick={handleRunSweep}
            disabled={sweepState === 'running'}
            className={`w-full py-2.5 rounded-[6px] font-mono font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5 border transition-all active:scale-[0.99] ${
              sweepState === 'error'
                ? 'bg-st-stalled/10 text-st-stalled border-st-stalled/40 hover:bg-st-stalled/20'
                : 'bg-ink text-white border-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:border-zinc-300'
            }`}
          >
            {sweepState === 'running' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sweeping SLAs…
              </>
            ) : sweepState === 'error' ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" /> Retry SLA Sweep
              </>
            ) : (
              <>
                <Siren className="w-3.5 h-3.5" /> Run SLA Sweep
              </>
            )}
          </button>

          {sweepMsg && sweepState !== 'idle' && (
            <div
              className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-[6px] border ${
                sweepState === 'error'
                  ? 'bg-st-stalled/5 text-st-stalled border-st-stalled/20'
                  : sweepState === 'running'
                  ? 'bg-zinc-50 text-ink-soft border-hairline'
                  : 'bg-civic/5 text-civic-deep border-civic/20'
              }`}
            >
              {sweepState === 'done' && <ArrowUpCircle className="w-3 h-3 shrink-0" />}
              {sweepState === 'error' && <AlertTriangle className="w-3 h-3 shrink-0" />}
              <span className="truncate">{sweepMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Queue scrollable */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {filteredIssues.length === 0 ? (
          <div className="text-center py-12 px-6 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-st-resolved mx-auto" />
            <h3 className="font-bold text-sm font-display tracking-tight text-ink uppercase">No Actionable Cases Found</h3>
            <p className="text-[11px] text-ink-soft max-w-xs mx-auto">All reports within this jurisdiction are safely triaged, resolved, or currently delegated.</p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const statusStr = issue?.status || 'SUBMITTED';
            const statusColor = getStatusColors(statusStr);
            
            // SLA parameters simulation
            let slaText = '⏱ 4d limit';
            let isBreaching = false;
            if (statusStr === 'STALLED') {
              slaText = '⏱ BREACHED (Overdue)';
              isBreaching = true;
            } else if (statusStr === 'ESCALATED' || issue?.severity === 'HIGH') {
              slaText = '⏱ 1d remaining';
              isBreaching = true;
            } else if (statusStr === 'RESOLVED') {
              slaText = '✓ RESOLVED';
            }

            return (
              <div
                key={issue?.id}
                onClick={() => issue && onSelectIssue?.(issue)}
                className={`bg-white rounded-[12px] border border-hairline p-4 space-y-3 shadow-xs ${onSelectIssue ? 'cursor-pointer hover:border-civic/50 hover:shadow-md transition-all' : ''}`}
              >
                {/* ID & category */}
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-zinc-400">{issue?.dossierId || ''}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isBreaching ? 'text-st-stalled animate-pulse' : 'text-ink-soft'}`}>
                      {slaText}
                    </span>
                    <span className={`px-2 py-0.2 uppercase border rounded-[3px] font-black text-[9px] ${statusColor.border} ${statusColor.bg} ${statusColor.text}`}>
                      {statusStr}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-ink leading-tight">
                    {issue?.title || ''}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-soft">
                    <MapPin className="w-3 h-3 text-civic" />
                    <span className="truncate">{issue?.location || ''}</span>
                    <span className="bg-zinc-100 px-1 rounded text-[9px] font-mono">{issue?.ward || ''}</span>
                  </div>
                </div>

                {/* Confirmations tally */}
                <div className="flex justify-between items-center bg-zinc-50 border border-hairline/50 p-2 rounded-[6px] text-[10px] font-mono">
                  <span className="text-ink-soft">Citizen Tally corroborated:</span>
                  <span className="text-civic font-black font-sans text-xs">{issue?.confirmedCount ?? 0} Verified pings</span>
                </div>

                {/* Case Action Buttons — stopPropagation so acting doesn't also
                    open the dossier (the rest of the card opens it). */}
                {statusStr !== 'RESOLVED' && issue?.id && (
                  <div className="flex gap-2 pt-1">
                    {statusStr === 'VALIDATED' || statusStr === 'OPEN' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(issue.id, 'IN_PROGRESS'); }}
                        className="flex-1 bg-ink text-white font-mono uppercase font-bold tracking-wider py-2 text-[10px] rounded-[6px] hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1 border border-zinc-900"
                      >
                        <Clock className="w-3.5 h-3.5" /> Acknowledge Case
                      </button>
                    ) : null}

                    {statusStr !== 'RESOLVED' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenResolveModal(issue.id); }}
                        className="flex-1 bg-civic hover:bg-civic-deep text-white font-mono uppercase font-bold tracking-wider py-2 text-[10px] rounded-[6px] transition-colors flex items-center justify-center gap-1 border border-civic"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve w/ Proof
                      </button>
                    )}
                  </div>
                )}

                {onSelectIssue && (
                  <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest text-center pt-0.5 select-none">
                    Tap card for full dossier ›
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Resolve with Proof Overlay Modal */}
      <AnimatePresence>
        {selectedIssueId && (
          <div className="absolute inset-0 bg-ink/50 flex items-center justify-center z-50 p-5">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[340px] bg-white rounded-[16px] border border-hairline overflow-hidden p-5 space-y-4 shadow-xl"
            >
              <div className="space-y-1.5 text-center">
                <CheckCircle2 className="w-8 h-8 text-st-resolved mx-auto" />
                <h3 className="font-display font-black text-sm uppercase tracking-tight">Attach Resolution Proof</h3>
                <p className="text-[11px] text-ink-soft max-w-[240px] mx-auto">We upload complete evidentiary completion photographs to transparent case log.</p>
              </div>

              {/* Real proof capture/upload — in-app camera (reused CameraCapture)
                  + gallery/file picker, both feeding the same /api/upload path. */}
              <div className="space-y-2">
                <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest block">Attach completion evidence:</span>

                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handlePickProof}
                  className="hidden"
                />

                {proofPreviewUrl && (
                  <div className="relative w-full h-36 rounded-[8px] overflow-hidden border border-hairline">
                    {proofMediaType === 'video' ? (
                      <video src={proofPreviewUrl} controls playsInline muted className="w-full h-full object-cover bg-ink" />
                    ) : (
                      <img src={proofPreviewUrl} alt="Selected proof" className="w-full h-full object-cover" />
                    )}
                  </div>
                )}

                <div className={cameraSupported ? 'grid grid-cols-2 gap-2' : ''}>
                  {cameraSupported && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="bg-white border border-dashed border-zinc-300 rounded-[8px] py-4 text-[10px] font-mono font-bold text-ink-soft hover:text-ink hover:border-civic flex flex-col items-center gap-1 transition-all"
                    >
                      <Camera className="w-5 h-5 text-zinc-400" />
                      {proofPreviewUrl ? 'Retake' : 'Take photo/video'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => proofInputRef.current?.click()}
                    className={`bg-white border border-dashed border-zinc-300 rounded-[8px] ${cameraSupported ? 'py-4' : 'py-5 w-full'} text-[10px] font-mono font-bold text-ink-soft hover:text-ink hover:border-civic flex flex-col items-center gap-1 transition-all`}
                  >
                    <ImagePlus className="w-5 h-5 text-zinc-400" />
                    {proofPreviewUrl ? 'Change / upload' : 'Upload from files'}
                  </button>
                </div>

                {proofError && (
                  <div className="flex gap-1.5 items-start bg-amber-50 border border-amber-200 rounded-[6px] p-2 text-[10px] text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{proofError}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeResolveModal}
                  className="flex-1 bg-zinc-100 border border-hairline py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[6px] text-zinc-500 hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!proofFile || isResolving}
                  onClick={handleConfirmResolution}
                  className="flex-1 bg-civic text-white py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[6px] hover:bg-civic-deep disabled:bg-zinc-200 disabled:text-zinc-400 hover:shadow transition-all flex items-center justify-center gap-1.5"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Transmitting...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Certify Proof
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* In-app camera for proof capture — reuses the citizen flow's component. */}
      {showCamera && (
        <CameraCapture
          onCapture={(f, kind) => { acceptProof(f, kind); setShowCamera(false); }}
          onCancel={() => setShowCamera(false)}
          onRequestUpload={() => { setShowCamera(false); proofInputRef.current?.click(); }}
        />
      )}

    </div>
  );
};
