import React, { useState, useEffect } from 'react';
import { CivicIssue, Comment } from '../types';
import { X, Camera, MapPin, Check, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReportWizardProps {
  onClose: () => void;
  onSubmit: (newIssue: Omit<CivicIssue, 'id' | 'dossierId' | 'age' | 'timeline' | 'comments'>) => void;
}

const PRESET_CIVIC_MEDIA = [
  {
    category: 'Roads/Potholes',
    title: 'Collapsed pavement grid near Sector 4 pillar',
    url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    description: 'Road cave-in starting to widen. Cars are veering sharply to avoid it.',
  },
  {
    category: 'Streetlights',
    title: 'Streetlights dark across third residential avenue',
    url: 'https://images.unsplash.com/photo-1542314831-c6a4d27e66c9?auto=format&fit=crop&w=800&q=80',
    description: 'All lamps from 1st block corner to the park gate are completely unlit.',
  },
  {
    category: 'Water',
    title: 'Underground supply junction bursting water',
    url: 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=800&q=80',
    description: 'Main pipeline leak spraying high-pressure drinking water straight into current traffic lanes.',
  },
  {
    category: 'Garbage/Waste',
    title: 'Heaps of plastic and bio-waste dumped at roadside',
    url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    description: 'Sanitation deposit overflowing on sidewalk. Pedestrians blocked.',
  }
];

export const ReportWizard: React.FC<ReportWizardProps> = ({ onClose, onSubmit }) => {
  const [step, setStep] = useState<'capture' | 'details' | 'triage' | 'success'>('capture');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [category, setCategory] = useState<CivicIssue['category']>('Roads/Potholes');
  const [severity, setSeverity] = useState<CivicIssue['severity']>('MEDIUM');
  const [ward, setWard] = useState('Ward 12');
  const [location, setLocation] = useState('University Rd, Rajkot');

  // Live Triage Logs
  const [triageLogs, setTriageLogs] = useState<string[]>([]);
  const [triageStepIndex, setTriageStepIndex] = useState(0);

  const filterCategoryPreset = (categoryStr: string): CivicIssue['category'] => {
    if (categoryStr.includes('Potholes')) return 'Roads/Potholes';
    if (categoryStr.includes('Streetlights')) return 'Streetlights';
    if (categoryStr.includes('Water')) return 'Water';
    if (categoryStr.includes('Garbage')) return 'Garbage/Waste';
    if (categoryStr.includes('Drainage')) return 'Drainage/Sewage';
    return 'Other';
  };

  const handleSelectPreset = (idx: number) => {
    setSelectedPreset(idx);
    const preset = PRESET_CIVIC_MEDIA[idx];
    setCustomTitle(preset.title);
    setCustomDesc(preset.description);
    setCategory(filterCategoryPreset(preset.category));
    setStep('details');
  };

  const startTriageSequence = () => {
    setStep('triage');
    setTriageLogs([]);
    setTriageStepIndex(0);
  };

  useEffect(() => {
    if (step === 'triage') {
      const messages = [
        '› initializing sensory input pipeline………… OK',
        `› analyzing media metadata for ${category}………… severity rated ${severity}`,
        '› query EXIF database / querying GPS coordinates………… Ward 12 confirmed',
        '› searching hyperlocal duplicates index………… no surrounding active cases found',
        '✦ validation stamp APPROVED · generating transparent dossier'
      ];

      if (triageStepIndex < messages.length) {
        const timer = setTimeout(() => {
          setTriageLogs((prev) => [...prev, messages[triageStepIndex]]);
          setTriageStepIndex((prev) => prev + 1);
        }, 800);
        return () => clearTimeout(timer);
      } else {
        const finishTimer = setTimeout(() => {
          setStep('success');
        }, 1000);
        return () => clearTimeout(finishTimer);
      }
    }
  }, [step, triageStepIndex, category, severity]);

  const handleCompleteSubmit = () => {
    const finalMedia = selectedPreset !== null ? PRESET_CIVIC_MEDIA[selectedPreset].url : 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80';
    
    onSubmit({
      title: customTitle || 'Civic infrastructure malfunction report',
      category: category,
      severity: severity,
      location: location,
      ward: ward,
      confirmedCount: 1,
      agentStatus: 'Setu: Dispatched complaint draft to RMC departments.',
      mediaUrl: finalMedia,
      mediaType: 'photo',
      caseLog: [
        { time: '10:02', glyph: '›', text: `classifying media……………… ${category.toLowerCase()} · severity ${severity}`, isDone: true },
        { time: '10:02', glyph: '›', text: `locating………………………… ${ward}, ${location}`, isDone: true },
        { time: '10:02', glyph: '✦', text: 'dossier validation verified by Setu Core', isDone: true }
      ]
    });
  };

  return (
    <div className="absolute inset-0 bg-ink/75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[390px] h-[640px] bg-paper rounded-[24px] border border-hairline overflow-hidden flex flex-col justify-between text-ink relative shadow-2xl"
      >
        {/* Header (unless in full triage/success screens) */}
        {step !== 'triage' && step !== 'success' && (
          <div className="px-5 py-4 border-b border-hairline bg-white flex justify-between items-center flex-shrink-0">
            <h2 className="font-display font-black tracking-tight text-sm uppercase">
              Report Civic Issue
            </h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-zinc-100 text-ink-soft">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dynamic Step Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'capture' && (
            <div className="p-5 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs text-ink-soft">Capture evidence of the civic malfunction.</p>
                <p className="text-[10px] font-mono text-zinc-400">Select a preset to simulate instant camera acquisition:</p>
              </div>

              {/* Presets representing photos taken on street */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {PRESET_CIVIC_MEDIA.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectPreset(idx)}
                    className="group bg-white rounded-[12px] overflow-hidden border border-hairline hover:border-civic text-left flex flex-col transition-all cursor-pointer shadow-sm hover:shadow"
                  >
                    <div className="h-24 bg-zinc-100 relative overflow-hidden">
                      <img src={preset.url} alt={preset.category} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute bottom-1 right-1 bg-ink/70 px-1 py-0.5 rounded text-[8px] text-white font-mono uppercase font-bold tracking-wider">
                        {preset.category.substring(preset.category.indexOf('/') + 1)}
                      </div>
                    </div>
                    <div className="p-2 flex-1 flex flex-col justify-between">
                      <span className="text-[9px] font-mono font-medium truncate text-ink">{preset.title}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Or manual entry */}
              <div className="pt-4 border-t border-hairline flex flex-col items-center">
                <button
                  onClick={() => {
                    setSelectedPreset(null);
                    setStep('details');
                  }}
                  className="w-full bg-white border border-dashed border-zinc-300 rounded-[12px] py-4 text-xs font-medium text-ink-soft hover:text-ink hover:border-civic flex flex-col items-center gap-1 transition-all"
                >
                  <Camera className="w-6 h-6 text-zinc-400" />
                  Or skip media & file dry-text dossier
                </button>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="p-5 space-y-4">
              {/* Selected feedback */}
              {selectedPreset !== null && (
                <div className="flex gap-3 bg-zinc-100/50 p-2 border border-hairline rounded-[8px] items-center">
                  <img src={PRESET_CIVIC_MEDIA[selectedPreset].url} className="w-12 h-12 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase font-mono tracking-wider">Acquired Evidence</p>
                    <p className="text-xs font-semibold text-ink leading-tight truncate">{PRESET_CIVIC_MEDIA[selectedPreset].title}</p>
                  </div>
                </div>
              )}

              {/* Categorization & Priority */}
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as CivicIssue['category'])}
                      className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                    >
                      <option value="Roads/Potholes">Roads/Potholes</option>
                      <option value="Streetlights">Streetlights</option>
                      <option value="Water">Water Leak</option>
                      <option value="Garbage/Waste">Garbage/Waste</option>
                      <option value="Drainage/Sewage">Drainage/Sewage</option>
                      <option value="Other">Other Code</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Severity Assessment</label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as CivicIssue['severity'])}
                      className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                    >
                      <option value="LOW">LOW — Maintenance</option>
                      <option value="MEDIUM">MEDIUM — Outage</option>
                      <option value="HIGH">HIGH — Safety Hazard</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Dossier Heading Statement</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Short summary of the malfunctioning issue..."
                    className="w-full bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider font-mono text-ink-soft">Incident Coordinates (Ward / Location)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={ward}
                      onChange={(e) => setWard(e.target.value)}
                      className="bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                    >
                      <option value="Ward 12">Ward 12</option>
                      <option value="Ward 8">Ward 8</option>
                      <option value="Ward 10">Ward 10</option>
                      <option value="Ward 7">Ward 7</option>
                    </select>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Street, Landmark..."
                      className="col-span-2 bg-white text-xs border border-hairline rounded-[6px] p-2 focus:outline-none focus:border-civic font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'triage' && (
            <div className="h-full bg-ink text-white p-6 flex flex-col justify-center space-y-8 select-none">
              <div className="flex flex-col items-center text-center space-y-3">
                <Loader2 className="w-10 h-10 text-civic animate-spin" />
                <h3 className="text-md font-bold tracking-tight">Setu is Triaging...</h3>
                <p className="text-[10px] text-zinc-400 font-mono tracking-wider max-w-xs uppercase">
                  Processing transparent dossier ingestion & computer vision evaluation
                </p>
              </div>

              {/* Terminal Logs Container */}
              <div className="bg-black/40 border border-zinc-800 rounded-[8px] p-4 font-mono text-[10px] leading-relaxed text-zinc-300 space-y-2 min-h-36">
                {triageLogs.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-civic select-none">›</span>
                    <span>{log}</span>
                  </div>
                ))}
                {triageStepIndex < 5 && (
                  <div className="animate-pulse text-orange-400 px-3">⟳ digesting telemetry...</div>
                )}
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="h-full px-5 flex flex-col items-center justify-center text-center space-y-6 bg-civic-tint bg-radial">
              <div className="w-16 h-16 rounded-full bg-st-resolved/20 border-2 border-st-resolved flex items-center justify-center text-st-resolved">
                <Check className="w-8 h-8 font-black" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold font-display tracking-tight leading-tight text-ink">
                  Dossier Validated!
                </h3>
                <p className="text-xs text-ink-soft leading-relaxed max-w-[240px] mx-auto">
                  Setu agent has registered Case Log parameters and compiled the formal municipal draft.
                </p>
                <div className="py-2 inline-block px-3 border border-dashed border-civic text-[10px] font-mono text-civic bg-white uppercase font-bold tracking-widest rounded-[3px]">
                  ID Reference #SAM-{Math.floor(1000 + Math.random() * 9000)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions depending on step */}
        {step !== 'triage' && step !== 'success' && (
          <div className="p-4 border-t border-hairline bg-white flex-shrink-0">
            {step === 'capture' ? (
              <button
                disabled={selectedPreset === null}
                onClick={() => setStep('details')}
                className="w-full bg-zinc-200 text-zinc-400 py-3 rounded-[8px] text-xs font-mono font-bold uppercase tracking-wider cursor-not-allowed"
              >
                Accept Selection Photo
              </button>
            ) : (
              <button
                onClick={startTriageSequence}
                className="w-full bg-ink hover:bg-zinc-800 text-white font-display font-black py-3 text-xs uppercase tracking-widest border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(22,24,29,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                Ingest to Triage Flow
              </button>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="p-4 border-t border-hairline bg-white flex-shrink-0">
            <button
              onClick={handleCompleteSubmit}
              className="w-full bg-civic hover:bg-civic-deep text-white font-display font-black py-3 text-xs uppercase tracking-widest border-2 border-civic-deep shadow-[3px_3px_0px_0px_rgba(10,79,76,1)]"
            >
              Expose to Public Feed
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
