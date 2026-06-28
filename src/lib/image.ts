import { Jimp, JimpMime } from 'jimp';
import fs from 'fs';
import path from 'path';

/**
 * Image handling for Setu's VISION classification.
 *
 * The citizen's photo lives at a URL by the time we classify (a Firebase Storage
 * download URL, a local /uploads path in fallback mode, or — defensively — a
 * data: URL). To let Gemini actually SEE the photo we fetch the bytes, downscale
 * to ~768px longest edge as JPEG (capping image tokens at the cheap ~258–1032
 * range instead of thousands for a full-res photo), and return an inlineData
 * Part. Everything here is best-effort and NEVER throws — on any failure the
 * caller degrades to text-only classification (Doc 6 resilience ladder).
 *
 * Cost guard: we only ever send properly downscaled image BYTES as an image
 * part — a raw data: URL or huge string is never inlined into the text prompt.
 */

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_FETCH_BYTES = 15 * 1024 * 1024; // don't download absurdly large originals
const MAX_EDGE = 768; // longest-edge cap → cheap image-token bucket
const JPEG_QUALITY = 70;
const FETCH_TIMEOUT_MS = 6000;

export interface InlineImagePart {
  inlineData: { mimeType: string; data: string };
}

/** Resolve the raw image bytes behind a mediaUrl. Returns null on anything odd. */
async function rawBytesFromMediaUrl(mediaUrl: string): Promise<Buffer | null> {
  try {
    // data: URL → decode the base64 payload directly (never used as text).
    if (mediaUrl.startsWith('data:')) {
      const comma = mediaUrl.indexOf(',');
      if (comma === -1) return null;
      const buf = Buffer.from(mediaUrl.slice(comma + 1), 'base64');
      return buf.length ? buf : null;
    }

    // Local-disk fallback upload (storage.ts writeToDisk → /uploads/<file>).
    if (mediaUrl.startsWith('/uploads/')) {
      const p = path.join(UPLOADS_DIR, path.basename(mediaUrl));
      if (!fs.existsSync(p)) return null;
      return fs.readFileSync(p);
    }

    // Remote URL (Firebase Storage download URL, etc.) — fetch with a timeout.
    if (/^https?:\/\//i.test(mediaUrl)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(mediaUrl, { signal: ctrl.signal });
        if (!res.ok) return null;
        const len = Number(res.headers.get('content-length') || 0);
        if (len && len > MAX_FETCH_BYTES) return null;
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0 || ab.byteLength > MAX_FETCH_BYTES) return null;
        return Buffer.from(ab);
      } finally {
        clearTimeout(timer);
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch + downscale the photo behind mediaUrl into a Gemini inlineData Part.
 * Returns null when there's no usable image (no url, fetch fail, decode fail) so
 * the caller falls back to text-only classification.
 */
export async function loadImagePart(mediaUrl?: string): Promise<InlineImagePart | null> {
  if (!mediaUrl) return null;
  const raw = await rawBytesFromMediaUrl(mediaUrl);
  if (!raw || raw.length === 0) return null;

  try {
    const image = await Jimp.read(raw);
    const { width, height } = image.bitmap;
    if (Math.max(width, height) > MAX_EDGE) {
      image.scaleToFit({ w: MAX_EDGE, h: MAX_EDGE });
    }
    const jpeg = await image.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
    return { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } };
  } catch (e: any) {
    console.warn('vision: image fetch/downscale failed — falling back to text-only:', e?.message);
    return null;
  }
}
