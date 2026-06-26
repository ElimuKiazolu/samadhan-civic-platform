import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { retryWithBackoff } from './gemini';

/**
 * Image upload abstraction — parallels dbService (db.ts).
 *
 * Uploads go through the SERVER (Admin SDK), never client-direct: the Admin SDK
 * authenticates with the service account and BYPASSES Storage security rules,
 * which lets those rules deny ALL client writes (see storage.rules). This is the
 * genuinely locked-down posture for an app with no client-side Firebase Auth.
 *
 * Resilience ladder (Doc 6 §2): retry-with-backoff around the cloud upload, then
 * DEGRADE to a local-disk write under ./uploads (served by an express.static
 * route) so a Storage outage never blocks a citizen's report.
 */

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'samadhan-ac08f.firebasestorage.app';

// Local fallback dir (mirrors db.ts's process.cwd()-relative db.json).
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/** True only when firebase-admin has an initialized app (set up in db.ts). */
function firebaseReady(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

function writeToDisk(buffer: Buffer, ext: string): string {
  ensureUploadsDir();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);
  console.log(`Storage fallback: wrote image to local disk /uploads/${fileName}`);
  return `/uploads/${fileName}`;
}

/**
 * Upload a validated image buffer and return a stable, renderable URL.
 *
 * @param buffer   raw image bytes (already magic-byte sniffed by the caller)
 * @param mimeType canonical image mime (e.g. 'image/jpeg')
 * @param ext      file extension matching the sniffed type (e.g. 'jpg')
 */
export async function uploadIssueImage(buffer: Buffer, mimeType: string, ext: string): Promise<string> {
  if (!firebaseReady()) {
    console.warn('Storage: firebase-admin not initialized — using local-disk fallback.');
    return writeToDisk(buffer, ext);
  }

  try {
    return await retryWithBackoff(async () => {
      const bucket = getStorage().bucket(BUCKET_NAME);
      const downloadToken = crypto.randomUUID();
      const objectPath = `issues/${crypto.randomUUID()}.${ext}`;
      const file = bucket.file(objectPath);

      await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
        metadata: {
          contentType: mimeType,
          // The Firebase download-token URL is governed by this token (not by
          // security rules) and never expires — preferable to V4 signed URLs
          // (≤7-day expiry) and to makePublic() (object ACLs are disabled on
          // uniform-bucket-level-access .firebasestorage.app buckets).
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });

      const encodedPath = encodeURIComponent(objectPath);
      const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      console.log(`Storage: uploaded ${objectPath} to Firebase Storage`);
      return url;
    });
  } catch (error) {
    console.error('Storage: Firebase upload failed after retries — degrading to local disk:', error);
    return writeToDisk(buffer, ext);
  }
}

export { UPLOADS_DIR };
