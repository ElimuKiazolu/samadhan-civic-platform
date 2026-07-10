/**
 * Server-side input validation & sanitization for the report path.
 *
 * These are intentionally framework-agnostic (no Express types) so they can be
 * unit-reasoned in isolation and reused across the upload, classify-preview, and
 * report endpoints. They implement Doc 4 §9 ("input hardening") and back the
 * Doc 6 resilience laws — every external-facing field is checked before it ever
 * reaches Gemini, Storage, or Firestore.
 */

export const ALLOWED_CATEGORIES = [
  'Roads/Potholes',
  'Streetlights',
  'Water',
  'Garbage/Waste',
  'Drainage/Sewage',
  'Other',
] as const;
export type IssueCategory = (typeof ALLOWED_CATEGORIES)[number];

export const ALLOWED_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type IssueSeverity = (typeof ALLOWED_SEVERITIES)[number];

export const DESCRIPTION_MAX = 1000;
export const TITLE_MAX = 120;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
// Video cap sits safely UNDER Cloud Run's 32 MiB HTTP/1 request ceiling (a 50 MB
// upload would be rejected at the edge with a silent 413 before it ever reaches
// multer). 25 MB leaves headroom for multipart framing. Raising this later would
// require enabling end-to-end HTTP/2 on the Cloud Run service (--use-http2).
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MEDIA_TYPES = ['photo', 'video'] as const;
export type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

// Rough Rajkot bounding box — used for a SOFT "outside service area" hint only;
// coordinates outside it are still accepted (a citizen reporting just over a
// ward edge is legitimate). Hard rejection is reserved for non-real lat/lng.
const RAJKOT_BBOX = { minLat: 22.0, maxLat: 22.6, minLng: 70.5, maxLng: 71.1 };

interface DescriptionResult {
  ok: boolean;
  value: string;
  error?: string;
}

/**
 * Trim, strip control characters, collapse whitespace runs, and enforce the
 * length cap. React escapes on render so this is defense-in-depth against XSS,
 * and it keeps prompt-injection noise / control bytes out of the Gemini prompt.
 */
export function sanitizeDescription(raw: unknown): DescriptionResult {
  if (raw === undefined || raw === null) {
    return { ok: false, value: '', error: 'Description is required.' };
  }
  let value = String(raw);
  // Strip ASCII control chars except tab (\x09) and newline (\x0A).
  value = value.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  // Collapse 3+ consecutive newlines and runs of spaces/tabs.
  value = value.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

  if (value.length === 0) {
    return { ok: false, value: '', error: 'Description is required.' };
  }
  if (value.length > DESCRIPTION_MAX) {
    value = value.slice(0, DESCRIPTION_MAX);
  }
  return { ok: true, value };
}

/**
 * Sanitize a short title/heading. Returns empty string for missing input so the
 * caller can fall back to a generated title; never throws.
 */
export function sanitizeTitle(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  let value = String(raw).replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (value.length > TITLE_MAX) value = value.slice(0, TITLE_MAX);
  return value;
}

export function normalizeCategory(raw: unknown): IssueCategory {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(String(raw))
    ? (raw as IssueCategory)
    : 'Other';
}

export function normalizeSeverity(raw: unknown): IssueSeverity {
  const v = String(raw).toUpperCase();
  if (v === 'MED') return 'MEDIUM';
  return (ALLOWED_SEVERITIES as readonly string[]).includes(v) ? (v as IssueSeverity) : 'MEDIUM';
}

/** Clamp an arbitrary confidence value into the valid [0,1] probability range. */
export function clampConfidence(raw: unknown, fallback = 0.5): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

interface CoordsResult {
  ok: boolean;
  lat: number;
  lng: number;
  outsideServiceArea: boolean;
  error?: string;
}

/**
 * Parse + validate a latitude/longitude pair. Rejects non-finite or
 * out-of-globe values; flags (but accepts) anything outside the Rajkot bbox.
 */
export function validateCoords(rawLat: unknown, rawLng: unknown): CoordsResult {
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, lat: NaN, lng: NaN, outsideServiceArea: true, error: 'Coordinates are not valid numbers.' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, lat, lng, outsideServiceArea: true, error: 'Coordinates are out of range.' };
  }
  const outsideServiceArea =
    lat < RAJKOT_BBOX.minLat || lat > RAJKOT_BBOX.maxLat || lng < RAJKOT_BBOX.minLng || lng > RAJKOT_BBOX.maxLng;
  return { ok: true, lat, lng, outsideServiceArea };
}

const MEDIA_SIGNATURES: Array<{ mime: string; ext: string; kind: MediaType; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', ext: 'jpg', kind: 'photo', test: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    kind: 'photo',
    test: (b) =>
      b.length > 7 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    kind: 'photo',
    test: (b) =>
      b.length > 11 &&
      b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    // HEIC/HEIF: an ISO-BMFF 'ftyp' box whose major brand is one of these. NOTE:
    // the 'hevc' brand here is the HEIC still-image container, NOT H.265 video —
    // keep it classified as a photo. Checked BEFORE the video ftyp branch below;
    // the brand sets are disjoint so order is safe either way.
    mime: 'image/heic',
    ext: 'heic',
    kind: 'photo',
    test: (b) => {
      if (b.length < 12 || b.toString('ascii', 4, 8) !== 'ftyp') return false;
      const brand = b.toString('ascii', 8, 12);
      return ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'].includes(brand);
    },
  },
  {
    // MP4 / ISO-BMFF video: an 'ftyp' box whose major brand is a known video
    // brand. (HEIC image brands are matched above and excluded here.)
    mime: 'video/mp4',
    ext: 'mp4',
    kind: 'video',
    test: (b) => {
      if (b.length < 12 || b.toString('ascii', 4, 8) !== 'ftyp') return false;
      const brand = b.toString('ascii', 8, 12);
      return ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'mp71', 'dash', 'm4v ', 'MSNV'].includes(brand);
    },
  },
  {
    // QuickTime MOV — the common iPhone container (major brand 'qt  ', trailing
    // spaces). May wrap H.264 or HEVC/H.265; we accept the container and let the
    // browser decode (HEVC playback risk is handled in the UI, not here).
    mime: 'video/quicktime',
    ext: 'mov',
    kind: 'video',
    test: (b) => {
      if (b.length < 12 || b.toString('ascii', 4, 8) !== 'ftyp') return false;
      return b.toString('ascii', 8, 12) === 'qt  ';
    },
  },
  {
    // WebM / Matroska: EBML header magic. We don't distinguish webm vs mkv here
    // (both start with this) — video/webm is the correct, playable label for our use.
    mime: 'video/webm',
    ext: 'webm',
    kind: 'video',
    test: (b) => b.length > 3 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
];

export interface SniffedMedia {
  mime: string;
  ext: string;
  kind: MediaType;
}

/**
 * Verify a buffer is genuinely one of our accepted media formats (image OR video)
 * by inspecting its magic bytes — NOT by trusting the client-supplied
 * Content-Type header, which is attacker-controlled. Returns null if the bytes
 * aren't a known image or video, plus a `kind` discriminator so callers can
 * branch size/EXIF/classification per media type.
 */
export function sniffMediaMime(buffer: Buffer): SniffedMedia | null {
  if (!buffer || buffer.length < 12) return null;
  for (const sig of MEDIA_SIGNATURES) {
    if (sig.test(buffer)) return { mime: sig.mime, ext: sig.ext, kind: sig.kind };
  }
  return null;
}

/** Legacy alias — image-only sniff for any caller that must reject video. */
export function sniffImageMime(buffer: Buffer): SniffedMedia | null {
  const sniffed = sniffMediaMime(buffer);
  return sniffed && sniffed.kind === 'photo' ? sniffed : null;
}

/** Normalize a client-supplied media type to our closed set (defaults to photo). */
export function normalizeMediaType(raw: unknown): MediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(String(raw))
    ? (raw as MediaType)
    : 'photo';
}
