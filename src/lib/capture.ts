/**
 * In-app camera capture helpers (MediaDevices / MediaRecorder).
 *
 * Pure, dependency-free utilities shared by CameraCapture.tsx. The whole feature
 * is frontend-only: capture produces a File that flows into the SAME
 * /api/upload path as a gallery pick, so there are no server changes. Everything
 * here is feature-detected and safe to call in any browser — unsupported
 * environments simply report `isCaptureSupported() === false` and the UI hides
 * the capture option, falling back to the existing file upload.
 */

// 25 MB server cap (validation.ts MAX_VIDEO_BYTES) is the hard ceiling. A 25 s
// clip at ~2.63 Mbps (video + audio) lands around ~8 MB — roughly a third of the
// cap, leaving generous headroom for container overhead and bitrate spikes.
export const MAX_RECORD_MS = 25_000; // hard auto-stop at 25 seconds
export const VIDEO_BITRATE = 2_500_000; // 2.5 Mbps video
export const AUDIO_BITRATE = 128_000; // 128 kbps audio
export const CAPTURE_WIDTH_IDEAL = 1280; // keeps the encoder (and file size) honest
export const JPEG_QUALITY = 0.85; // photo quality → ~200–600 KB, well under 8 MB

// Client mirror of MAX_VIDEO_BYTES so an oversized recording is caught before an
// upload attempt (parallels the guard already in ReportFlow.handlePickFile).
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * Ordered video mime preference — MP4/H.264 first (universally decodable, matches
 * iOS Safari's only supported recording format), WebM as the Android/desktop
 * fallback. The first `MediaRecorder.isTypeSupported` hit wins.
 */
const VIDEO_MIME_PREFERENCE = [
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

/**
 * True only when in-app capture can actually work: a secure context (getUserMedia
 * requires HTTPS or localhost), a MediaDevices.getUserMedia implementation, and a
 * MediaRecorder implementation. When false, the caller hides the capture option
 * entirely and keeps the file-upload path.
 */
export function isCaptureSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!window.isSecureContext) return false;
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return false;
  if (typeof (window as any).MediaRecorder !== 'function') return false;
  return true;
}

/**
 * Pick the best supported recording mime, or null if MediaRecorder can't record
 * any video type we accept (→ photo-only capture; video via file fallback).
 */
export function pickVideoMimeType(): string | null {
  const MR = (window as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  for (const mime of VIDEO_MIME_PREFERENCE) {
    try {
      if (MR.isTypeSupported(mime)) return mime;
    } catch {
      /* isTypeSupported can throw on some engines — treat as unsupported */
    }
  }
  return null;
}

/** Map a recording mime to the file extension the server sniffer expects. */
export function extForVideoMime(mime: string): string {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Wrap a Blob as a File with a stable, extension-correct name. */
export function blobToFile(blob: Blob, ext: string): File {
  const type = blob.type || (ext === 'jpg' ? 'image/jpeg' : `video/${ext}`);
  return new File([blob], `capture-${Date.now()}.${ext}`, { type });
}
