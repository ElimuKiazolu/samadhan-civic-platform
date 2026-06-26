import React, { useState, useEffect, useRef } from 'react';
import { CivicIssue } from '../types';
import { X, Camera, MapPin, Check, Loader2, Sparkles, AlertTriangle, Crosshair, ImagePlus } from 'lucide-react';
import { motion } from 'motion/react';

export interface ReportResult {
  outcome: 'VALIDATED' | 'NEEDS_INFO' | 'REJECTED' | 'DUPLICATE';
  issue: any;
}

interface ReportFlowProps {
  onClose: () => void;
  onPosted: (result: ReportResult) => void;
}

interface Suggestion {
  category: CivicIssue['category'];
  severity: CivicIssue['severity'];
  title: string;
  confidence: number;
  ward: number;
  zone: string;
  duplicateCandidate: { id: string; title: string; confirmedCount: number } | null;
}

const CATEGORIES: CivicIssue['category'][] = [
  'Roads/Potholes',
  'Streetlights',
  'Water',
  'Garbage/Waste',
  'Drainage/Sewage',
  'Other',
];

const DESCRIPTION_MAX = 1000;

type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export const ReportFlow: React.FC<ReportFlowProps> = ({ onClose, onPosted }) => {
  const [step, setStep] = useState<'compose' | 'analyzing' | 'preview' | 'posting' | 'result'>('compose');

  // Compose inputs
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location ladder: GPS (primary) → EXIF (bonus) → manual
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [exifCoords, setExifCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Upload result
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploadWarning, setUploadWarning] = useState('');

  // Setu suggestion + editable preview state
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<CivicIssue['category']>('Roads/Potholes');
  const [editSeverity, setEditSeverity] = useState<CivicIssue['severity']>('MEDIUM');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');

  const [analyzeError, setAnalyzeError] = useState('');
  const [postError, setPostError] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);

  // GPS is primary: request it as soon as the sheet opens.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }
    setGpsStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('granted');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Revoke the object URL when the chosen file changes / unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const effectiveCoords = (): { lat: number; lng: number } | null => gpsCoords ?? exifCoords ?? null;

  const handleAnalyze = async () => {
    if (description.trim().length === 0) return;
    setStep('analyzing');
    setAnalyzeError('');
    setUploadWarning('');

    let uploadedUrl = '';
    let exifFromUpload: { lat: number; lng: number } | null = null;

    // 1. Upload the photo (optional) — server validates + extracts EXIF GPS.
    if (file) {
      try {
        const form = new FormData();
        form.append('photo', file);
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.mediaUrl) {
          uploadedUrl = data.mediaUrl;
          if (Number.isFinite(data.exifLat) && Number.isFinite(data.exifLng)) {
            exifFromUpload = { lat: data.exifLat, lng: data.exifLng };
            setExifCoords(exifFromUpload);
          }
        } else {
          setUploadWarning(data.error || 'Photo could not be uploaded — you can still post without it.');
        }
      } catch {
        setUploadWarning('Photo upload failed — you can still post without it.');
      }
    }
    setMediaUrl(uploadedUrl);

    // 2. Resolve coordinates by the ladder: GPS → EXIF → none (manual later).
    const coords = gpsCoords ?? exifFromUpload ?? null;

    // 3. Read-only classification for the preview.
    try {
      const res = await fetch('/api/classify-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          mediaUrl: uploadedUrl,
          lat: coords?.lat,
          lng: coords?.lng,
        }),
      });
      if (!res.ok) throw new Error('classify failed');
      const s: Suggestion = await res.json();
      applySuggestion(s, coords);
    } catch (err) {
      // Degrade: let the citizen fill in details manually (Doc 6 law 2).
      setAnalyzeError('Setu could not auto-analyze this — please set the details below.');
      applySuggestion(
        {
          category: 'Other',
          severity: 'MEDIUM',
          title: description.trim().slice(0, 50),
          confidence: 0.4,
          ward: 0,
          zone: 'Central',
          duplicateCandidate: null,
        },
        coords
      );
    }
    setStep('preview');
  };

  const applySuggestion = (s: Suggestion, coords: { lat: number; lng: number } | null) => {
    setSuggestion(s);
    setEditTitle(s.title);
    setEditCategory(s.category);
    setEditSeverity(s.severity);
    if (coords) {
      setEditLat(coords.lat.toFixed(6));
      setEditLng(coords.lng.toFixed(6));
    }
  };

  const handlePost = async () => {
    setStep('posting');
    setPostError('');
    const latNum = parseFloat(editLat);
    const lngNum = parseFloat(editLng);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          mediaUrl,
          title: editTitle.trim(),
          category: editCategory,
          severity: editSeverity,
          confidence: suggestion?.confidence ?? 0.6,
          ...(hasCoords ? { lat: latNum, lng: lngNum } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not post the report.');
      }
      const r: ReportResult = await res.json();
      setResult(r);
      setStep('result');
    } catch (err: any) {
      setPostError(err?.message || 'Could not post the report. Tap to retry.');
      setStep('preview');
    }
  };

  const gpsChip = () => {
    const map: Record<GpsStatus, { text: string; cls: string }> = {
      idle: { text: 'Locating…', cls: 'text-zinc-400' },
      requesting: { text: 'Getting GPS…', cls: 'text-civic' },
      granted: { text: 'GPS locked', cls: 'text-st-resolved' },
      denied: { text: 'GPS denied — EXIF/manual', cls: 'text-st-stalled' },
      unavailable: { text: 'No GPS — EXIF/manual', cls: 'text-st-stalled' },
    };
    const c = map[gpsStatus];
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider ${c.cls}`}>
        <Crosshair className="w-3 h-3" /> {c.text}
      </span>
    );
  };

  return (
    <div className="absolute inset-0 bg-ink/75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[390px] h-[640px] bg-paper rounded-[24px] border border-hairline overflow-hidden flex flex-col justify-between text-ink relative shadow-2xl"
      >
        {/* Header */}
        {step !== 'result' && (
          <div className="px-5 py-4 border-b border-hairline bg-white flex justify-between items-center flex-shrink-0">
            <h2 className="font-display font-black tracking-tight text-sm uppercase">
              {step === 'preview' || step === 'posting' ? 'Review & Post' : 'Report Civic Issue'}
            </h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-100 text-ink-soft">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* STEP 1 — Compose: description + optional photo + GPS */}
          {step === 'compose' && (
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">
                  What's the problem?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  rows={4}
                  autoFocus
                  placeholder="Describe what you see — e.g. 'Huge pothole near the metro pillar, bikes are swerving around it.'"
                  className="w-full bg-white text-sm border border-hairline rounded-[10px] p-3 focus:outline-none focus:border-civic resize-none leading-relaxed"
                />
                <div className="text-right text-[9px] font-mono text-zinc-400">
                  {description.length}/{DESCRIPTION_MAX}
                </div>
              </div>

              {/* Photo attach (camera on mobile via capture; file picker on desktop) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">
                  Add a photo <span className="text-zinc-400 normal-case font-normal">(recommended)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePickFile}
                  className="hidden"
                />
                {previewUrl ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-full h-40 rounded-[12px] overflow-hidden border border-hairline group"
                  >
                    <img src={previewUrl} alt="Selected" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-ink text-[10px] font-mono font-bold uppercase px-2 py-1 rounded">
                        Change photo
                      </span>
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-white border border-dashed border-zinc-300 rounded-[12px] py-7 text-xs font-medium text-ink-soft hover:text-ink hover:border-civic flex flex-col items-center gap-1.5 transition-all"
                  >
                    <ImagePlus className="w-6 h-6 text-zinc-400" />
                    Tap to take or choose a photo
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                {gpsChip()}
                <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">Location auto-detected</span>
              </div>
            </div>
          )}

          {/* STEP 2 — Analyzing */}
          {step === 'analyzing' && (
            <div className="h-full bg-ink text-white p-6 flex flex-col justify-center items-center text-center space-y-5 select-none">
              <Loader2 className="w-10 h-10 text-civic animate-spin" />
              <div className="space-y-2">
                <h3 className="text-md font-bold tracking-tight">Setu is reviewing…</h3>
                <p className="text-[10px] text-zinc-400 font-mono tracking-wider max-w-xs uppercase">
                  Classifying · locating · checking for nearby duplicates
                </p>
              </div>
            </div>
          )}

          {/* STEP 3 — Editable preview */}
          {step === 'preview' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-civic">
                <Sparkles className="w-4 h-4" />
                <p className="text-[11px] font-mono font-bold uppercase tracking-wider">Setu suggests — edit anything</p>
              </div>

              {analyzeError && (
                <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-[8px] p-2 text-[10px] text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{analyzeError}</span>
                </div>
              )}
              {uploadWarning && (
                <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-[8px] p-2 text-[10px] text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{uploadWarning}</span>
                </div>
              )}

              {suggestion?.duplicateCandidate && (
                <div className="bg-civic-tint border border-civic/40 rounded-[8px] p-2.5 text-[10px] text-civic-deep leading-relaxed">
                  <span className="font-bold">Looks like an existing report nearby</span> — "{suggestion.duplicateCandidate.title}"
                  ({suggestion.duplicateCandidate.confirmedCount} confirmed). Posting will add your confirmation instead of a duplicate.
                </div>
              )}

              {previewUrl && (
                <img src={previewUrl} alt="Evidence" className="w-full h-32 object-cover rounded-[10px] border border-hairline" />
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 120))}
                  className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as CivicIssue['category'])}
                    className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Severity</label>
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value as CivicIssue['severity'])}
                    className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Location (lat / lng)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    placeholder="Latitude"
                    className="bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    placeholder="Longitude"
                    className="bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                  />
                </div>
                <p className="text-[9px] font-mono text-zinc-400 leading-relaxed">
                  {gpsStatus === 'granted'
                    ? 'From device GPS.'
                    : exifCoords
                      ? 'From photo EXIF.'
                      : 'Set manually — Setu resolves the ward from these coordinates.'}
                  {suggestion && suggestion.ward > 0 && ` Setu read: Ward ${suggestion.ward}, ${suggestion.zone} Zone.`}
                </p>
              </div>

              {postError && (
                <button
                  onClick={handlePost}
                  className="w-full flex gap-2 items-center justify-center bg-red-50 border border-red-200 rounded-[8px] p-2 text-[10px] text-red-700 font-mono"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> {postError}
                </button>
              )}
            </div>
          )}

          {/* posting spinner reuses preview frame footer */}
          {step === 'posting' && (
            <div className="h-full flex flex-col justify-center items-center text-center space-y-4">
              <Loader2 className="w-9 h-9 text-civic animate-spin" />
              <p className="text-[10px] text-ink-soft font-mono uppercase tracking-wider">Posting to the civic feed…</p>
            </div>
          )}

          {/* STEP 4 — Result */}
          {step === 'result' && result && (
            <ResultPanel result={result} />
          )}
        </div>

        {/* Footer actions */}
        {step === 'compose' && (
          <div className="p-4 border-t border-hairline bg-white flex-shrink-0">
            <button
              disabled={description.trim().length === 0}
              onClick={handleAnalyze}
              className={`w-full font-display font-black py-3 text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                description.trim().length === 0
                  ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                  : 'bg-ink hover:bg-zinc-800 text-white border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(22,24,29,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Analyze with Setu
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div className="p-4 border-t border-hairline bg-white flex-shrink-0">
            <button
              onClick={handlePost}
              className="w-full bg-civic hover:bg-civic-deep text-white font-display font-black py-3 text-xs uppercase tracking-widest border-2 border-civic-deep shadow-[3px_3px_0px_0px_rgba(10,79,76,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
            >
              Post to feed
            </button>
          </div>
        )}

        {step === 'result' && (
          <div className="p-4 border-t border-hairline bg-white flex-shrink-0">
            <button
              onClick={() => result && onPosted(result)}
              className="w-full bg-ink hover:bg-zinc-800 text-white font-display font-black py-3 text-xs uppercase tracking-widest"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const ResultPanel: React.FC<{ result: ReportResult }> = ({ result }) => {
  const copy: Record<ReportResult['outcome'], { title: string; body: string; good: boolean }> = {
    VALIDATED: {
      title: 'Reported — it\'s live!',
      body: "Setu validated your report and routed it to the right RMC department. It's now in the public feed.",
      good: true,
    },
    DUPLICATE: {
      title: 'Added your voice',
      body: 'This matches an issue already reported nearby. Setu added your confirmation to it — no duplicate created.',
      good: true,
    },
    NEEDS_INFO: {
      title: 'Setu needs a little more',
      body: "This is saved privately in your reports. Setu couldn't gauge it confidently — add a clearer photo or detail to push it live.",
      good: false,
    },
    REJECTED: {
      title: 'Not a civic issue',
      body: "This doesn't look like something RMC can act on. It's saved privately — edit and resubmit if that's wrong.",
      good: false,
    },
  };
  const c = copy[result.outcome];
  return (
    <div className="h-full px-5 flex flex-col items-center justify-center text-center space-y-6 bg-civic-tint bg-radial">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${
          c.good ? 'bg-st-resolved/20 border-st-resolved text-st-resolved' : 'bg-amber-100 border-amber-400 text-amber-600'
        }`}
      >
        {c.good ? <Check className="w-8 h-8" /> : <AlertTriangle className="w-7 h-7" />}
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-bold font-display tracking-tight leading-tight text-ink">{c.title}</h3>
        <p className="text-xs text-ink-soft leading-relaxed max-w-[260px] mx-auto">{c.body}</p>
        {result.issue?.dossierId && (
          <div className="py-2 inline-block px-3 border border-dashed border-civic text-[10px] font-mono text-civic bg-white uppercase font-bold tracking-widest rounded-[3px]">
            {result.issue.dossierId}
          </div>
        )}
      </div>
    </div>
  );
};
