import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, Video, RotateCcw, Check, SwitchCamera, ImagePlus, AlertTriangle, Loader2 } from 'lucide-react';
import {
  pickVideoMimeType,
  extForVideoMime,
  blobToFile,
  MAX_RECORD_MS,
  VIDEO_BITRATE,
  AUDIO_BITRATE,
  CAPTURE_WIDTH_IDEAL,
  JPEG_QUALITY,
  MAX_VIDEO_BYTES,
} from '../lib/capture';

interface CameraCaptureProps {
  /** Hand the captured media back to the report flow (same File shape as an upload). */
  onCapture: (file: File, kind: 'photo' | 'video') => void;
  /** Dismiss the camera without capturing. */
  onCancel: () => void;
  /** Escape hatch from an error state → open the existing gallery/file picker. */
  onRequestUpload?: () => void;
}

type Phase = 'requesting' | 'live' | 'recording' | 'review' | 'error';
type ErrorKind = 'denied' | 'nodevice' | 'other';
type FacingMode = 'environment' | 'user';

interface Captured {
  url: string;
  file: File;
  kind: 'photo' | 'video';
}

/**
 * Full-bleed in-app camera (TikTok/Instagram style). Live getUserMedia preview,
 * photo via canvas→JPEG, video via MediaRecorder with a hard 25 s auto-stop and a
 * visible countdown ring. Produces a File that flows into the SAME upload path as
 * a gallery pick — no server changes. Every failure (permission denied, no camera,
 * insecure/unsupported) degrades to a friendly message with an "upload a file"
 * escape hatch; the camera stream is always torn down on unmount.
 */
export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onCancel, onRequestUpload }) => {
  const [phase, setPhase] = useState<Phase>('requesting');
  const [errorKind, setErrorKind] = useState<ErrorKind>('other');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sizeError, setSizeError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef<number>(0);
  // Latest captured URL, mirrored in a ref so unmount cleanup can revoke it
  // without re-subscribing the effect on every capture.
  const capturedUrlRef = useRef<string>('');

  const videoMime = pickVideoMimeType(); // null → hide video mode (photo only)

  const clearTimers = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null; }
  };

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (facing: FacingMode) => {
    setPhase('requesting');
    setSizeError('');
    // Stop any existing stream before re-acquiring (e.g. on facing switch).
    stopStream();
    const constraints: MediaStreamConstraints = {
      video: { facingMode: facing, width: { ideal: CAPTURE_WIDTH_IDEAL } },
      audio: true,
    };
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        // Retry video-only when the mic is the blocker (no mic / overconstrained),
        // so photo capture and muted video still work.
        if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing, width: { ideal: CAPTURE_WIDTH_IDEAL } },
          });
        } else {
          throw err;
        }
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Play can reject if the element unmounted mid-await; ignore.
        videoRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setErrorKind('denied');
      else if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') setErrorKind('nodevice');
      else setErrorKind('other');
      setPhase('error');
    }
  }, [stopStream]);

  // Mount: start the camera. Unmount: tear everything down (tracks + timers + URL).
  useEffect(() => {
    startStream('environment');
    return () => {
      clearTimers();
      stopStream();
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCapturedMedia = (file: File, kind: 'photo' | 'video') => {
    const url = URL.createObjectURL(file);
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = url;
    setCaptured({ url, file, kind });
    setPhase('review');
  };

  // ── Photo: grab the current frame to a canvas → JPEG File ──────────────────
  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedMedia(blobToFile(blob, 'jpg'), 'photo');
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  };

  // ── Video: MediaRecorder with hard 25 s auto-stop + live countdown ─────────
  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || !videoMime) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: videoMime,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
    } catch {
      // Bitrate/mime combo rejected → let the browser choose defaults.
      try {
        recorder = new MediaRecorder(stream, { mimeType: videoMime });
      } catch {
        setErrorKind('other');
        setPhase('error');
        return;
      }
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      clearTimers();
      const ext = extForVideoMime(videoMime);
      const blob = new Blob(chunksRef.current, { type: videoMime });
      if (blob.size > MAX_VIDEO_BYTES) {
        setSizeError('That clip is over 25 MB. Record a shorter one.');
        setPhase('live');
        return;
      }
      setCapturedMedia(blobToFile(blob, ext), 'video');
    };
    recorderRef.current = recorder;
    recordStartRef.current = Date.now();
    setElapsedMs(0);
    recorder.start();
    setPhase('recording');
    tickRef.current = setInterval(() => setElapsedMs(Date.now() - recordStartRef.current), 100);
    hardStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    clearTimers();
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
  };

  const retake = () => {
    if (capturedUrlRef.current) { URL.revokeObjectURL(capturedUrlRef.current); capturedUrlRef.current = ''; }
    setCaptured(null);
    setSizeError('');
    // Stream stays live through review, so retake just returns to the preview.
    // If the tracks were ended for any reason, re-acquire.
    if (!streamRef.current || streamRef.current.getVideoTracks().every((t) => t.readyState === 'ended')) {
      startStream(facingMode);
    } else {
      setPhase('live');
    }
  };

  const useIt = () => {
    if (!captured) return;
    // Hand off first; parent unmounts us, and the cleanup effect stops the stream.
    onCapture(captured.file, captured.kind);
  };

  const switchCamera = () => {
    const next: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startStream(next);
  };

  const remainingSecs = Math.max(0, Math.ceil((MAX_RECORD_MS - elapsedMs) / 1000));
  const progress = Math.min(1, elapsedMs / MAX_RECORD_MS);

  // ── Render ────────────────────────────────────────────────────────────────
  const errorCopy: Record<ErrorKind, { title: string; body: string }> = {
    denied: {
      title: 'Camera permission denied',
      body: 'Allow camera access in your browser settings to capture in-app, or upload a photo/video from your gallery instead.',
    },
    nodevice: {
      title: 'No camera available',
      body: "We couldn't find a usable camera (it may be in use by another app). You can upload a photo or video from your gallery instead.",
    },
    other: {
      title: 'Camera unavailable',
      body: 'The in-app camera could not start on this device. You can upload a photo or video from your gallery instead.',
    },
  };

  return (
    <div className="fixed inset-0 z-[60] bg-ink text-white flex flex-col select-none">
      {/* Live preview / captured review fills the frame */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Live stream video (kept mounted so retake is instant) */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover ${phase === 'review' ? 'hidden' : ''} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* Requesting overlay */}
        {phase === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <Loader2 className="w-8 h-8 text-civic animate-spin" />
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-300">Requesting camera…</p>
          </div>
        )}

        {/* Error state with upload escape hatch */}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-black/80">
            <AlertTriangle className="w-9 h-9 text-amber-400" />
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold tracking-tight">{errorCopy[errorKind].title}</h3>
              <p className="text-[11px] text-zinc-300 leading-relaxed max-w-xs">{errorCopy[errorKind].body}</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[240px] pt-2">
              {onRequestUpload && (
                <button
                  onClick={onRequestUpload}
                  className="w-full flex items-center justify-center gap-2 bg-white text-ink font-display font-black py-2.5 text-[11px] uppercase tracking-widest rounded-[8px]"
                >
                  <ImagePlus className="w-4 h-4" /> Upload a file instead
                </button>
              )}
              <button
                onClick={onCancel}
                className="w-full text-[11px] font-mono uppercase tracking-wider text-zinc-400 py-2"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Captured review */}
        {phase === 'review' && captured && (
          captured.kind === 'video' ? (
            <video src={captured.url} controls playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
          ) : (
            <img src={captured.url} alt="Captured" className="absolute inset-0 w-full h-full object-contain bg-black" />
          )
        )}

        {/* Recording countdown chip (top) */}
        {phase === 'recording' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-mono font-bold tabular-nums">0:{remainingSecs.toString().padStart(2, '0')}</span>
          </div>
        )}

        {/* Close button (top-left), hidden during error (its own Back button) */}
        {phase !== 'error' && (
          <button
            onClick={onCancel}
            className="absolute top-3 left-3 p-2 rounded-full bg-black/40 hover:bg-black/60"
            aria-label="Close camera"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Switch camera (top-right) — only live/recording, when supported */}
        {(phase === 'live' || phase === 'recording') && (
          <button
            onClick={switchCamera}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-40"
            aria-label="Switch camera"
            disabled={phase === 'recording'}
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        )}

        {sizeError && (
          <div className="absolute bottom-4 left-4 right-4 flex gap-2 items-start bg-amber-500/90 text-ink rounded-[8px] p-2 text-[11px] font-medium">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{sizeError}</span>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex-shrink-0 bg-ink px-6 pt-4 pb-8">
        {phase === 'review' ? (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 rounded-[10px] py-3 text-[11px] font-display font-black uppercase tracking-widest"
            >
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
            <button
              onClick={useIt}
              className="flex-1 flex items-center justify-center gap-2 bg-civic hover:bg-civic-deep rounded-[10px] py-3 text-[11px] font-display font-black uppercase tracking-widest"
            >
              <Check className="w-4 h-4" /> Use this
            </button>
          </div>
        ) : phase === 'live' || phase === 'recording' ? (
          <div className="flex flex-col items-center gap-4">
            {/* Mode toggle (hidden while recording) */}
            {phase === 'live' && videoMime && (
              <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
                <button
                  onClick={() => setMode('photo')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${mode === 'photo' ? 'bg-white text-ink' : 'text-zinc-300'}`}
                >
                  <Camera className="w-3.5 h-3.5" /> Photo
                </button>
                <button
                  onClick={() => setMode('video')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${mode === 'video' ? 'bg-white text-ink' : 'text-zinc-300'}`}
                >
                  <Video className="w-3.5 h-3.5" /> Video
                </button>
              </div>
            )}

            {/* Shutter / record button with countdown ring */}
            <button
              onClick={() => {
                if (mode === 'photo') takePhoto();
                else if (phase === 'recording') stopRecording();
                else startRecording();
              }}
              className="relative w-[74px] h-[74px] flex items-center justify-center"
              aria-label={mode === 'photo' ? 'Take photo' : phase === 'recording' ? 'Stop recording' : 'Start recording'}
            >
              {/* Progress ring while recording */}
              {phase === 'recording' && (
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 74 74">
                  <circle cx="37" cy="37" r="34" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                  <circle
                    cx="37" cy="37" r="34" fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - progress)}
                  />
                </svg>
              )}
              <span className="absolute inset-0 rounded-full border-4 border-white" />
              {mode === 'photo' ? (
                <span className="w-[58px] h-[58px] rounded-full bg-white" />
              ) : phase === 'recording' ? (
                <span className="w-6 h-6 rounded-[4px] bg-red-500" />
              ) : (
                <span className="w-[58px] h-[58px] rounded-full bg-red-500" />
              )}
            </button>

            <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 h-3">
              {mode === 'video'
                ? phase === 'recording'
                  ? `Recording — auto-stops at 25s`
                  : 'Tap to record (max 25s)'
                : 'Tap to capture'}
            </p>
          </div>
        ) : (
          <div className="h-[130px]" /> /* reserve space during requesting/error */
        )}
      </div>
    </div>
  );
};
