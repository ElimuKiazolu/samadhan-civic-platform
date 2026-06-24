import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbService } from './src/services/db';
import { processTriagePipeline } from './src/services/triage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

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

app.post('/api/report', async (req, res) => {
  try {
    let description = req.body.description || req.body.title || '';
    let mediaUrl = req.body.mediaUrl || '';
    let lat = Number(req.body.lat);
    let lng = Number(req.body.lng);
    const reporterId = req.body.reporterId || 'citizen-demo';

    // Map ward string to stable latitude/longitude fallback for location lookup
    if (isNaN(lat) || isNaN(lng)) {
      const wardStr = String(req.body.ward || '').trim();
      if (wardStr.includes('12')) {
        lat = 22.305;
        lng = 70.806;
      } else if (wardStr.includes('8')) {
        lat = 22.303;
        lng = 70.804;
      } else if (wardStr.includes('10')) {
        lat = 22.304;
        lng = 70.805;
      } else if (wardStr.includes('7')) {
        lat = 22.303;
        lng = 70.803;
      } else {
        lat = 22.3;
        lng = 70.8;
      }
    }
    
    // Process live triage pipeline (Gemini, geohash, duplicate merge, decision gate)
    const result = await processTriagePipeline({
      description,
      mediaUrl,
      lat,
      lng,
      reporterId
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
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Samadhan Civic Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
