import 'dotenv/config';
import express from 'express';
import path from 'path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import exifr from 'exifr';
// import { fileURLToPath } from 'url';
import { dbService } from './src/services/db';
import { processTriagePipeline, classifyForPreview } from './src/services/triage';
import { decideSetuReply } from './src/services/decorum';
import { runSentinel } from './src/services/sentinel';
import { seedDemoBreachedIssue } from './src/services/seed';
import { uploadIssueImage, UPLOADS_DIR } from './src/services/storage';
import {
  sanitizeDescription,
  sanitizeTitle,
  validateCoords,
  sniffImageMime,
  normalizeCategory,
  normalizeSeverity,
  clampConfidence,
  MAX_IMAGE_BYTES,
} from './src/lib/validation';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Behind Cloud Run's front end: trust ONE proxy hop so req.ip reflects the real
// client (X-Forwarded-For) and the per-IP rate limiter throttles per device,
// not the whole fleet as a single proxy IP.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));

// Per-IP throttle on the Gemini- and Storage-touching write endpoints (Doc 4 §9).
// In-memory store: correct for the current single-instance Cloud Run/demo; a
// multi-instance deploy would need a shared store (Redis/Firestore).
const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 12, // 12 write/AI calls per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports from this device. Please wait a minute and try again.' },
});

// Lighter per-IP limiter for social writes (comments/corroborations). Separate
// budget from reports so commenting can't exhaust the Gemini/Storage allowance.
const socialLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many actions from this device. Please slow down a moment.' },
});

// Multipart parser for the upload endpoint: memory storage, single file, hard
// 8 MB cap enforced by multer before the buffer ever reaches our handler.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Samadhan Civic Engine', agent: 'Setu v0.1' });
});

app.get('/api/issues', async (req, res) => {
  try {
    const issues = await dbService.getIssues();
    res.json(issues);
  } catch (error: any) {
    console.error('Error fetching issues in GET /api/issues:', error);
    res.status(500).json({ error: 'Failed to retrieve active issues' });
  }
});

app.get('/api/issues/:id', async (req, res) => {
  try {
    const issue = await dbService.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Dossier not found' });
    res.json(issue);
  } catch (error: any) {
    console.error(`Error retrieving issue ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to retrieve selected dossier' });
  }
});

// Post a citizen comment to an issue's thread (persisted to the comments
// subcollection per Doc 5). After persisting, the decorum gate (rule-based, NO
// Gemini call) decides whether Setu adds a fact-only reply or stays silent.
app.post('/api/issues/:id/comments', socialLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const desc = sanitizeDescription(req.body.text);
    if (!desc.ok) {
      return res.status(400).json({ error: 'Comment text is required.' });
    }
    const issue = await dbService.getIssueById(id);
    if (!issue) return res.status(404).json({ error: 'Dossier not found' });

    const citizenComment = await dbService.addComment(id, {
      author: sanitizeTitle(req.body.author) || 'You (Citizen)',
      isAgent: false,
      text: desc.value,
    });

    // Decorum gate: reply ONLY when value-adding (and not back-to-back). The
    // issue we loaded carries the current comment list for the debounce check.
    let setuReply: any = null;
    try {
      const replyText = decideSetuReply(desc.value, issue);
      if (replyText) {
        setuReply = await dbService.addComment(id, { author: 'Setu', isAgent: true, text: replyText });
      }
    } catch (gateErr) {
      console.warn('Decorum gate failed (non-fatal, comment still saved):', gateErr);
    }

    res.status(201).json({ ok: true, comment: citizenComment, setuReply });
  } catch (error: any) {
    console.error(`Error posting comment to ${req.params.id}:`, error);
    res.status(500).json({ error: 'Could not save your comment. Please try again.' });
  }
});

// Corroborate an issue ("I see this too"). One-per-device via the client uid
// (no auth yet); persisted to corroborations/{uid} with atomic count increment.
app.post('/api/issues/:id/corroborate', socialLimiter, async (req, res) => {
  try {
    const id = req.params.id;
    const uid = sanitizeTitle(req.body.reporterId) || 'citizen-demo';
    const result = await dbService.addCorroboration(id, uid);
    res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    console.error(`Error corroborating ${req.params.id}:`, error);
    res.status(500).json({ error: 'Could not record your confirmation. Please try again.' });
  }
});

// Image upload (server-side via Admin SDK; see src/services/storage.ts for the
// upload-vs-client rationale). Validates the file is genuinely an image by its
// magic bytes (not the client-supplied Content-Type), re-checks the size cap,
// extracts any EXIF GPS as a location bonus, and returns a renderable URL.
app.post('/api/upload', writeLimiter, (req, res) => {
  upload.single('photo')(req, res, async (err: any) => {
    try {
      if (err) {
        const tooLarge = err?.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 400).json({
          error: tooLarge ? 'Image is too large (max 8 MB).' : 'Could not read the uploaded file.',
        });
      }
      const file = (req as any).file as { buffer: Buffer; size: number } | undefined;
      if (!file || !file.buffer || file.size === 0) {
        return res.status(400).json({ error: 'No photo was uploaded.' });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'Image is too large (max 8 MB).' });
      }

      // Trust the bytes, not the header.
      const sniffed = sniffImageMime(file.buffer);
      if (!sniffed) {
        return res.status(400).json({ error: 'That file is not a supported image (JPEG, PNG, WebP, or HEIC).' });
      }

      // EXIF GPS is a best-effort bonus in the location ladder (GPS > EXIF > manual).
      let exifLat: number | undefined;
      let exifLng: number | undefined;
      try {
        const gps = await exifr.gps(file.buffer);
        if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
          const check = validateCoords(gps.latitude, gps.longitude);
          if (check.ok) {
            exifLat = check.lat;
            exifLng = check.lng;
          }
        }
      } catch (exifErr) {
        console.warn('EXIF GPS extraction failed (non-fatal):', exifErr);
      }

      const mediaUrl = await uploadIssueImage(file.buffer, sniffed.mime, sniffed.ext);
      res.status(201).json({ mediaUrl, exifLat, exifLng });
    } catch (error: any) {
      console.error('Upload failure inside POST /api/upload:', error);
      res.status(500).json({ error: 'Could not store the image. Please try again.' });
    }
  });
});

// Read-only classification for the preview step. Runs Gemini (full retry/re-ask/
// safe-default ladder) + ward/zone resolution + a NON-mutating duplicate lookup.
// Writes nothing — the citizen reviews/edits before any persistence happens.
app.post('/api/classify-preview', writeLimiter, async (req, res) => {
  try {
    const desc = sanitizeDescription(req.body.description);
    if (!desc.ok) {
      return res.status(400).json({ error: desc.error });
    }
    const mediaUrl = typeof req.body.mediaUrl === 'string' ? req.body.mediaUrl : '';

    // Coordinates are optional at preview time (manual entry may still be pending);
    // default to Rajkot centre so classification + ward resolution can proceed.
    const coords = validateCoords(req.body.lat, req.body.lng);
    const lat = coords.ok ? coords.lat : 22.3;
    const lng = coords.ok ? coords.lng : 70.8;

    const suggestion = await classifyForPreview({ description: desc.value, mediaUrl, lat, lng });
    res.json(suggestion);
  } catch (error: any) {
    console.error('Preview classification failed inside POST /api/classify-preview:', error);
    res.status(500).json({ error: 'Setu could not analyze this report right now. You can still fill in the details and post.' });
  }
});

app.post('/api/report', writeLimiter, async (req, res) => {
  try {
    const desc = sanitizeDescription(req.body.description ?? req.body.title);
    if (!desc.ok) {
      return res.status(400).json({ error: desc.error });
    }
    const description = desc.value;
    const mediaUrl = typeof req.body.mediaUrl === 'string' ? req.body.mediaUrl : '';
    const reporterId = sanitizeTitle(req.body.reporterId) || 'citizen-demo';

    // Coordinates: the new flow always supplies them (GPS/EXIF/manual). Fall back
    // to the legacy ward-string → centroid map only if they're missing/invalid,
    // and ultimately to Rajkot centre — never reject the report for want of a pin.
    const coords = validateCoords(req.body.lat, req.body.lng);
    let lat: number;
    let lng: number;
    if (coords.ok) {
      lat = coords.lat;
      lng = coords.lng;
    } else {
      const wardStr = String(req.body.ward || '').trim();
      if (wardStr.includes('12')) { lat = 22.305; lng = 70.806; }
      else if (wardStr.includes('8')) { lat = 22.303; lng = 70.804; }
      else if (wardStr.includes('10')) { lat = 22.304; lng = 70.805; }
      else if (wardStr.includes('7')) { lat = 22.303; lng = 70.803; }
      else { lat = 22.3; lng = 70.8; }
    }

    // If the citizen confirmed Setu's classification in the preview, pass it
    // through as overrides (skips a redundant Gemini call, honours their edits).
    // The server still owns the decision gate, run on the carried confidence.
    // `humanConfirmed` signals the citizen EXPLICITLY picked the category (vs
    // passively accepting the auto-guess) — it rescues a low-confidence/outage
    // classification through the gate (real categories only; never "Other").
    const humanConfirmed = req.body.humanConfirmed === true;
    let overrides:
      | {
          category: ReturnType<typeof normalizeCategory>;
          severity: ReturnType<typeof normalizeSeverity>;
          title: string;
          confidence: number;
          humanConfirmed: boolean;
        }
      | undefined;
    if (req.body.category || req.body.severity) {
      overrides = {
        category: normalizeCategory(req.body.category),
        severity: normalizeSeverity(req.body.severity),
        title: sanitizeTitle(req.body.title) || description.substring(0, 50),
        confidence: clampConfidence(req.body.confidence, 0.3),
        humanConfirmed,
      };
    }

    // Coarse ward-level location → skip duplicate-merge so distinct reports that
    // share a ward centroid don't wrongly corroborate. Also flag when no real
    // coords were supplied at all (defensive: UI requires a location).
    const approxLocation = req.body.approxLocation === true || !coords.ok;
    const classifierUnavailable = req.body.classifierUnavailable === true;

    // Process live triage pipeline (geohash, duplicate merge, decision gate, dispatch)
    const result = await processTriagePipeline({
      description,
      mediaUrl,
      lat,
      lng,
      reporterId,
      overrides,
      approxLocation,
      classifierUnavailable,
    });

    // Outcome: VALIDATED, NEEDS_INFO, REJECTED, DUPLICATE
    res.status(201).json({
      outcome: result.outcome,
      issue: result.issue
    });
  } catch (error: any) {
    console.error('Pipeline failure inside POST /api/report:', error);
    res.status(500).json({ error: 'Civic engine intelligence pipeline failed' });
  }
});

// Demo seeder (Doc 4 §6.5 demo support). Plants ONE breached Roads/Potholes case
// into the ACTIVE store (Firestore OR local) so the sentinel escalation can be shown
// live on the deployed app. Idempotent on a fixed id — re-arms an existing case.
app.post('/api/seed-demo', async (req, res) => {
  try {
    const { created, issue } = await seedDemoBreachedIssue();
    res.status(created ? 201 : 200).json({
      ok: true,
      created,
      id: issue?.id,
      status: issue?.status,
      escalationTier: issue?.escalationTier,
      slaDueAt: issue?.slaDueAt,
      message: created ? 'Demo breached case planted.' : 'Demo case re-armed to breached state.',
    });
  } catch (error: any) {
    console.error('Seed demo failed in POST /api/seed-demo:', error);
    res.status(500).json({ ok: false, error: 'Failed to seed demo issue' });
  }
});

// Autonomous SLA sentinel (Doc 4 §6.5). Manual trigger for the demo + the target
// Cloud Scheduler/interval hits. Returns the sweep result so the UI can show it.
app.post('/api/sentinel', async (req, res) => {
  try {
    const result = await runSentinel();
    res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Sentinel run failed in POST /api/sentinel:', error);
    res.status(500).json({ ok: false, error: 'Sentinel sweep failed' });
  }
});

// Serve locally-stored uploads (the Storage degrade-fallback path). Registered
// in both dev and prod, before the SPA catch-all, so /uploads/<file> resolves.
app.use('/uploads', express.static(UPLOADS_DIR));

// Vite middleware setup for full-stack SPA serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
   const distPath = __dirname;  // const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Samadhan Civic Server running on http://0.0.0.0:${PORT}`);
  });

  const sentinelMs = Number(process.env.SENTINEL_INTERVAL_MS || 0);
  if (sentinelMs > 0) {
    console.log(`Sentinel auto-loop enabled: every ${sentinelMs}ms`);
    setInterval(() => {
      runSentinel().catch(err => console.error('Sentinel interval tick failed:', err));
    }, sentinelMs);
  }
}

startServer();
