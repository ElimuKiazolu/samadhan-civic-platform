import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Mock issues data for backend API
const mockServerIssues = [
  {
    id: 'iss-101',
    dossierId: 'Dossier #4829-X',
    title: 'Active sinkhole and severe pothole cluster near Metro Pillar 142',
    category: 'Roads/Potholes',
    severity: 'HIGH',
    status: 'ESCALATED',
    location: 'University Rd, Metro Corridor',
    ward: 'Ward 12',
    age: '3h ago',
    confirmedCount: 42,
    agentStatus: 'Setu: Dispatched to RMC Roads. No response in 48h → re-escalated.',
    mediaUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '09:12', date: 'Today', note: 'Citizen photo & GPS logged' },
      { status: 'VALIDATED', timestamp: '09:14', date: 'Today', note: 'Setu Vision triage: Confirmed High Hazard' },
      { status: 'ESCALATED', timestamp: '11:22', date: 'Today', note: 'Complaint dispatched to RMC Roads demo inbox' }
    ],
    caseLog: [
      { time: '09:12', glyph: '›', text: 'classifying media……………… pothole · severity HIGH', isDone: true },
      { time: '09:13', glyph: '›', text: 'locating………………………… Ward 12, University Rd', isDone: true },
      { time: '09:14', glyph: '›', text: 'duplicate check……………… merged 3 parallel pings', isDone: true },
      { time: '09:14', glyph: '✦', text: 'complaint dispatched → RMC Roads (demo inbox)', isDone: true },
      { time: '11:22', glyph: '↑', text: 'SLA priority check…………… raised internal priority level', isDone: true }
    ],
    comments: [
      {
        id: 'c-1',
        author: 'Citizen #102',
        isAgent: false,
        text: 'This is the third report this week. Very dangerous for two-wheelers at night.',
        time: '2h ago'
      },
      {
        id: 'c-2',
        author: 'Setu',
        isAgent: true,
        text: 'Citizen #102, corroboration logged. RMC Executive Engineer (Roads) has been alerted with urgent priority tag P-3212.',
        time: '1h ago'
      }
    ]
  },
  {
    id: 'iss-102',
    dossierId: 'Dossier #3911-S',
    title: 'Streetlights flickering and completely dead along Canal Walkway',
    category: 'Streetlights',
    severity: 'MEDIUM',
    status: 'STALLED',
    location: 'Canal Walkway, Kalawad Rd',
    ward: 'Ward 8',
    age: '2d ago',
    confirmedCount: 19,
    agentStatus: 'Setu: SLA breached (48h limit). Re-escalating to RMC Electrical.',
    mediaUrl: 'https://images.unsplash.com/photo-1542314831-c6a4d27e66c9?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '18:30', date: '2 days ago', note: 'Logged by night walker' },
      { status: 'VALIDATED', timestamp: '18:31', date: '2 days ago', note: 'Setu triage confirmed' },
      { status: 'STALLED', timestamp: '18:31', date: 'Today', note: 'SLA countdown breached without acknowledgment' }
    ],
    caseLog: [
      { time: '18:30', glyph: '›', text: 'classifying media……………… streetlight outage · MED', isDone: true },
      { time: '18:31', glyph: '✦', text: 'routed → RMC Electrical Dept', isDone: true },
      { time: '18:31', glyph: '↑', text: 'no acknowledgment in 48h → marked STALLED & alerted chief', isDone: true }
    ],
    comments: [
      { id: 'c-3', author: 'Ramesh Patel', isAgent: false, text: 'Pitch dark near the sitting benches.', time: '1d ago' }
    ]
  },
  {
    id: 'iss-103',
    dossierId: 'Dossier #5102-W',
    title: 'Severe drinking supply pipeline burst flooding main crossroads',
    category: 'Water',
    severity: 'HIGH',
    status: 'IN PROGRESS',
    location: 'Amin Marg Crossroads',
    ward: 'Ward 10',
    age: '5h ago',
    confirmedCount: 63,
    agentStatus: 'Setu: RMC Water team dispatched emergency valve repair unit.',
    mediaUrl: 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '06:15', date: 'Today', note: 'Reported with video verification' },
      { status: 'VALIDATED', timestamp: '06:16', date: 'Today', note: 'High acute water loss detected' },
      { status: 'ESCALATED', timestamp: '06:18', date: 'Today', note: 'Emergency SMS & mail dispatched' },
      { status: 'IN PROGRESS', timestamp: '08:40', date: 'Today', note: 'RMC Ward 10 plumber unit on site' }
    ],
    caseLog: [
      { time: '06:15', glyph: '›', text: 'classifying media……………… acute pipe burst · HIGH hazard', isDone: true },
      { time: '06:16', glyph: '✦', text: 'hotline trigger dispatched → RMC Hydraulic Engineer', isDone: true },
      { time: '08:40', glyph: '✓', text: 'authority telemetry acknowledged → field crew active', isDone: true }
    ],
    comments: []
  },
  {
    id: 'iss-104',
    dossierId: 'Dossier #2809-G',
    title: 'Overflowing community garbage dump blocking pedestrian sidewalk',
    category: 'Garbage/Waste',
    severity: 'MEDIUM',
    status: 'OPEN',
    location: 'Sadhu Vaswani Rd, Behind Temple',
    ward: 'Ward 12',
    age: '1d ago',
    confirmedCount: 14,
    agentStatus: 'Setu: Awaiting sanitation tipper truck schedule.',
    mediaUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '11:00', date: 'Yesterday', note: 'Citizen complaint' },
      { status: 'VALIDATED', timestamp: '11:01', date: 'Yesterday', note: 'Routed to Solid Waste Mgmt' }
    ],
    caseLog: [
      { time: '11:00', glyph: '›', text: 'classifying media……………… solid waste overflow · MED', isDone: true },
      { time: '11:01', glyph: '✦', text: 'queued → RMC Health & Sanitation Ward 12', isDone: true }
    ],
    comments: []
  },
  {
    id: 'iss-105',
    dossierId: 'Dossier #1944-D',
    title: 'Raw sewage backflow from storm drain during evening peak hours',
    category: 'Drainage/Sewage',
    severity: 'HIGH',
    status: 'RESOLVED',
    location: 'Yagnik Rd, Near Gymkhana',
    ward: 'Ward 7',
    age: '3d ago',
    confirmedCount: 31,
    agentStatus: 'Setu: RMC uploaded resolution proof. Community verification pending.',
    mediaUrl: 'https://images.unsplash.com/photo-1504307651591-00dcc993a6ff?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: '17:20', date: '3 days ago', note: 'Multiple citizen complaints' },
      { status: 'VALIDATED', timestamp: '17:21', date: '3 days ago', note: 'Triage complete' },
      { status: 'ESCALATED', timestamp: '17:25', date: '3 days ago', note: 'Dispatched to Drainage RMC' },
      { status: 'IN PROGRESS', timestamp: '10:00', date: 'Yesterday', note: 'Suction jet machine deployed' },
      { status: 'RESOLVED', timestamp: '16:45', date: 'Yesterday', note: 'Line cleared & sanitized. Proof attached.' }
    ],
    caseLog: [
      { time: '17:20', glyph: '›', text: 'classifying media……………… drainage backup · HIGH', isDone: true },
      { time: '17:25', glyph: '✦', text: 'complaint dispatched → RMC Drainage Dept', isDone: true },
      { time: '16:45', glyph: '✓', text: 'case marked RESOLVED with photographic proof id #RF-99', isDone: true }
    ],
    comments: [
      { id: 'c-4', author: 'Setu', isAgent: true, text: 'RMC Drainage team has cleared the obstruction. Tap to verify if the area remains clean.', time: '18h ago' }
    ]
  }
];

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Samadhan Civic Engine', agent: 'Setu v0.1' });
});

app.get('/api/issues', (req, res) => {
  res.json(mockServerIssues);
});

app.get('/api/issues/:id', (req, res) => {
  const issue = mockServerIssues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Dossier not found' });
  res.json(issue);
});

app.post('/api/report', (req, res) => {
  const newIssue = {
    id: `iss-${Date.now()}`,
    dossierId: `Dossier #${Math.floor(1000 + Math.random() * 9000)}-N`,
    title: req.body.title || 'Newly reported civic hazard',
    category: req.body.category || 'Other',
    severity: req.body.severity || 'MEDIUM',
    status: 'VALIDATED',
    location: req.body.location || 'Rajkot Municipal Limit',
    ward: req.body.ward || 'Ward 12',
    age: 'Just now',
    confirmedCount: 1,
    agentStatus: 'Setu: Triage complete. Complaint queued for RMC dispatch.',
    mediaUrl: req.body.mediaUrl || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    mediaType: req.body.mediaType || 'photo',
    timeline: [
      { status: 'SUBMITTED', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), date: 'Today', note: 'Citizen submission' },
      { status: 'VALIDATED', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), date: 'Today', note: 'Setu Vision triage passed' }
    ],
    caseLog: [
      { time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), glyph: '›', text: `classifying media……………… ${req.body.category || 'issue'} · ${req.body.severity || 'MED'}`, isDone: true },
      { time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), glyph: '›', text: `locating………………………… ${req.body.ward || 'Ward 12'}`, isDone: true },
      { time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), glyph: '✦', text: 'complaint registered in transparent civic dossier', isDone: true }
    ],
    comments: []
  };
  mockServerIssues.unshift(newIssue);
  res.status(201).json(newIssue);
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
