import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { buildEscalationLadder } from './routing';

let firestoreDb: any = null;
let useLocalFallback = false;

const DB_FILE = path.join(process.cwd(), 'db.json');

// Initialize Firebase Admin or Fallback
let firebaseInitialized = false;

// 1. Try environment variable
if (!firebaseInitialized && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: cert(serviceAccount)
    });
    firestoreDb = getFirestore();
    console.log('Firebase init: env var');
    firebaseInitialized = true;
  } catch (error) {
    console.error('Failed to init Firebase via env var:', error);
  }
}

// 2. Try serviceAccountKey.json file
if (!firebaseInitialized) {
  try {
    const serviceKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');
    if (fs.existsSync(serviceKeyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceKeyPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      firestoreDb = getFirestore();
      console.log('Firebase init: file');
      firebaseInitialized = true;
    }
  } catch (error) {
    console.error('Failed to init Firebase via file:', error);
  }
}

// 3. Fallback to local JSON fallback
if (!firebaseInitialized) {
  console.log('Firebase init: local JSON fallback');
  useLocalFallback = true;
}

// Ensure local DB file has pre-seeded mock index on startup if not present
const defaultMockIssues = [
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
    departmentId: 'bandhkam',
    departmentName: 'Bandhkam (Roads & Buildings / Public Works)',
    zone: 'Central',
    escalationTier: 1,                 // already dispatched to HOD → next rung is DMC (tier 2)
    slaHours: 48,
    slaDueAt: new Date(Date.now() - 3600000).toISOString(), // 1h in the PAST → breached
    escalationLadder: buildEscalationLadder('bandhkam', 'Bandhkam (Roads & Buildings / Public Works)', 'Central'),
    agentStatus: 'Setu: Dispatched to RMC Roads. No response in 48h → re-escalated.',
    mediaUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    isPublic: true,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    timeline: [
      { status: 'SUBMITTED', timestamp: '09:12', date: 'Today', note: 'Citizen photo & GPS logged' },
      { status: 'VALIDATED', timestamp: '09:14', date: 'Today', note: 'Setu Vision triage: Confirmed High Hazard' },
      { status: 'ESCALATED', timestamp: '11:22', date: 'Today', note: 'Complaint dispatched to RMC Roads demo inbox' }
    ],
    caseLog: [
      { ts: new Date(Date.now() - 11000).toISOString(), glyph: '›', kind: 'reasoning', text: 'classifying media……………… pothole · severity HIGH' },
      { ts: new Date(Date.now() - 10000).toISOString(), glyph: '›', kind: 'tool', text: 'locating………………………… Ward 12, University Rd' },
      { ts: new Date(Date.now() - 9000).toISOString(), glyph: '›', kind: 'tool', text: 'duplicate check……………… merged 3 parallel pings' },
      { ts: new Date(Date.now() - 8000).toISOString(), glyph: '✦', kind: 'dispatch', text: 'complaint dispatched → RMC Roads (demo inbox)' },
      { ts: new Date().toISOString(), glyph: '↑', kind: 'escalation', text: 'SLA priority check…………… raised internal priority level' }
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
    isPublic: true,
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    timeline: [
      { status: 'SUBMITTED', timestamp: '18:30', date: '2 days ago', note: 'Logged by night walker' },
      { status: 'VALIDATED', timestamp: '18:31', date: '2 days ago', note: 'Setu triage confirmed' },
      { status: 'STALLED', timestamp: '18:31', date: 'Today', note: 'SLA countdown breached without acknowledgment' }
    ],
    caseLog: [
      { ts: new Date(Date.now() - 48 * 3600000).toISOString(), glyph: '›', kind: 'reasoning', text: 'classifying media……………… streetlight outage · MED' },
      { ts: new Date(Date.now() - 47.9 * 3600000).toISOString(), glyph: '✦', kind: 'dispatch', text: 'routed → RMC Electrical Dept' },
      { ts: new Date(Date.now() - 1000).toISOString(), glyph: '↑', kind: 'escalation', text: 'no acknowledgment in 48h → marked STALLED & alerted chief' }
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
    status: 'IN_PROGRESS',
    location: 'Amin Marg Crossroads',
    ward: 'Ward 10',
    age: '5h ago',
    confirmedCount: 63,
    agentStatus: 'Setu: RMC Water team dispatched emergency valve repair unit.',
    mediaUrl: 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    isPublic: true,
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    timeline: [
      { status: 'SUBMITTED', timestamp: '06:15', date: 'Today', note: 'Reported with video verification' },
      { status: 'VALIDATED', timestamp: '06:16', date: 'Today', note: 'High acute water loss detected' },
      { status: 'ESCALATED', timestamp: '06:18', date: 'Today', note: 'Emergency SMS & mail dispatched' },
      { status: 'IN_PROGRESS', timestamp: '08:40', date: 'Today', note: 'RMC Ward 10 plumber unit on site' }
    ],
    caseLog: [
      { ts: new Date(Date.now() - 5 * 3600000).toISOString(), glyph: '›', kind: 'reasoning', text: 'classifying media……………… acute pipe burst · HIGH hazard' },
      { ts: new Date(Date.now() - 4.9 * 3600000).toISOString(), glyph: '✦', kind: 'dispatch', text: 'hotline trigger dispatched → RMC Hydraulic Engineer' },
      { ts: new Date(Date.now() - 3.2 * 3600000).toISOString(), glyph: '✓', kind: 'action', text: 'authority telemetry acknowledged → field crew active' }
    ],
    comments: []
  },
  {
    id: 'iss-104',
    dossierId: 'Dossier #2809-G',
    title: 'Overflowing community garbage dump blocking pedestrian sidewalk',
    category: 'Garbage/Waste',
    severity: 'MEDIUM',
    status: 'VALIDATED',
    location: 'Sadhu Vaswani Rd, Behind Temple',
    ward: 'Ward 12',
    age: '1d ago',
    confirmedCount: 14,
    agentStatus: 'Setu: Awaiting sanitation tipper truck schedule.',
    mediaUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    mediaType: 'photo',
    isPublic: true,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    timeline: [
      { status: 'SUBMITTED', timestamp: '11:00', date: 'Yesterday', note: 'Citizen complaint' },
      { status: 'VALIDATED', timestamp: '11:01', date: 'Yesterday', note: 'Routed to Solid Waste Mgmt' }
    ],
    caseLog: [
      { ts: new Date(Date.now() - 24 * 3600000).toISOString(), glyph: '›', kind: 'reasoning', text: 'classifying media……………… solid waste overflow · MED' },
      { ts: new Date(Date.now() - 23.9 * 3600000).toISOString(), glyph: '✦', kind: 'dispatch', text: 'queued → RMC Health & Sanitation Ward 12' }
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
    isPublic: true,
    createdAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    timeline: [
      { status: 'SUBMITTED', timestamp: '17:20', date: '3 days ago', note: 'Multiple citizen complaints' },
      { status: 'VALIDATED', timestamp: '17:21', date: '3 days ago', note: 'Triage complete' },
      { status: 'ESCALATED', timestamp: '17:25', date: '3 days ago', note: 'Dispatched to Drainage RMC' },
      { status: 'IN_PROGRESS', timestamp: '10:00', date: 'Yesterday', note: 'Suction jet machine deployed' },
      { status: 'RESOLVED', timestamp: '16:45', date: 'Yesterday', note: 'Line cleared & sanitized. Proof attached.' }
    ],
    caseLog: [
      { ts: new Date(Date.now() - 72 * 3600000).toISOString(), glyph: '›', kind: 'reasoning', text: 'classifying media……………… drainage backup · HIGH' },
      { ts: new Date(Date.now() - 71.9 * 3600000).toISOString(), glyph: '✦', kind: 'dispatch', text: 'complaint dispatched → RMC Drainage Dept' },
      { ts: new Date(Date.now() - 24 * 3600000).toISOString(), glyph: '✓', kind: 'action', text: 'case marked RESOLVED with photographic proof id #RF-99' }
    ],
    comments: [
      { id: 'c-4', author: 'Setu', isAgent: true, text: 'RMC Drainage team has cleared the obstruction. Tap to verify if the area remains clean.', time: '18h ago' }
    ]
  }
];

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ issues: defaultMockIssues }, null, 2));
}

// Local File DB Helper functions
function readLocalDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ issues: defaultMockIssues }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading local JSON db:', err);
    return { issues: defaultMockIssues };
  }
}

function writeLocalDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing local JSON db:', err);
  }
}

// Normalizes database issue states to ensure robust array structures and properties for client-side consumption
function normalizeIssue(issue: any): any {
  if (!issue) return null;
  const normalized = {
    comments: [],
    caseLog: [],
    timeline: [],
    ...issue
  };
  
  // Guard arrays to prevent type errors on map
  normalized.comments = Array.isArray(normalized.comments) ? normalized.comments : [];
  normalized.caseLog = Array.isArray(normalized.caseLog) ? normalized.caseLog : [];
  normalized.timeline = Array.isArray(normalized.timeline) ? normalized.timeline : [];

  // Normalize caseLog lines
  normalized.caseLog = normalized.caseLog.map((log: any) => {
    if (!log) return { time: '', glyph: '›', text: '', isDone: true, dim: false };
    let time = log.time || '';
    if (!time && log.ts) {
      try {
        time = new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        time = '';
      }
    }
    return {
      time,
      glyph: log.glyph || '›',
      text: log.text || '',
      isDone: log.isDone !== undefined ? log.isDone : true,
      dim: log.dim || (log.kind === 'reasoning'),
    };
  });

  return normalized;
}

// Complete Database abstraction layer supporting Firestore & robust Fallback
export const dbService = {
  async getIssues(): Promise<any[]> {
    if (!useLocalFallback && firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('issues').where('isPublic', '==', true).get();
        const list: any[] = [];
        snapshot.forEach((doc: any) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return list.map(item => normalizeIssue(item));
      } catch (error) {
        console.error('Firestore getIssues failed, switching permanently to local JSON fallback:', error);
        useLocalFallback = true;
      }
    }
    
    // Fallback mode
    const local = readLocalDb();
    const publicIssues = local.issues.filter((i: any) => i.isPublic === true);
    publicIssues.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return publicIssues.map(item => normalizeIssue(item));
  },

  /**
   * Returns ALL issues (public + private) in raw stored shape — no isPublic filter,
   * no client normalization. Used by the SLA sentinel which must see escalation
   * fields (slaDueAt, escalationTier, escalationLadder) verbatim. Firestore→JSON
   * fallback like every other method.
   */
  async getAllIssues(): Promise<any[]> {
    if (!useLocalFallback && firestoreDb) {
      try {
        const snapshot = await firestoreDb.collection('issues').get();
        const list: any[] = [];
        snapshot.forEach((doc: any) => list.push({ id: doc.id, ...doc.data() }));
        return list;
      } catch (error) {
        console.error('Firestore getAllIssues failed, switching permanently to local JSON fallback:', error);
        useLocalFallback = true;
      }
    }
    const local = readLocalDb();
    return Array.isArray(local.issues) ? local.issues : [];
  },

  async getIssueById(issueId: string): Promise<any | null> {
    if (!useLocalFallback && firestoreDb) {
      try {
        const docRef = firestoreDb.collection('issues').doc(issueId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const mainData = docSnap.data();
          
          // Fetch subcollections in Firestore
          const commentsSnap = await docRef.collection('comments').orderBy('createdAt', 'asc').get();
          const comments: any[] = [];
          commentsSnap.forEach((d: any) => comments.push({ id: d.id, ...d.data() }));

          const caseLogSnap = await docRef.collection('caseLog').orderBy('ts', 'asc').get();
          const caseLog: any[] = [];
          caseLogSnap.forEach((d: any) => caseLog.push({ id: d.id, ...d.data() }));

          const timelineSnap = await docRef.collection('statusHistory').orderBy('ts', 'asc').get();
          const timeline: any[] = [];
          timelineSnap.forEach((d: any) => timeline.push({ id: d.id, ...d.data() }));

          return normalizeIssue({
            id: issueId,
            ...mainData,
            comments,
            caseLog,
            timeline
          });
        }
      } catch (error) {
        console.error(`Firestore getIssueById for ${issueId} failed, switching permanently to local JSON fallback:`, error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const issue = local.issues.find((i: any) => i.id === issueId);
    return normalizeIssue(issue);
  },

  async createIssue(issueData: any): Promise<any> {
    const issueId = issueData.id || `iss-${Date.now()}`;
    const cleanIssue = {
      ...issueData,
      id: issueId,
      createdAt: issueData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: issueData.comments || [],
      caseLog: issueData.caseLog || [],
      timeline: issueData.timeline || [],
      corroborationCount: issueData.corroborationCount || 1,
      commentCount: issueData.commentCount || 0
    };

    if (!useLocalFallback && firestoreDb) {
      try {
        // Expose nested subcollections for direct querying as per doc guidelines
        const { comments, caseLog, timeline, ...flatData } = cleanIssue;
        const docRef = firestoreDb.collection('issues').doc(issueId);
        await docRef.set(flatData);

        // Populate comments
        for (const c of comments) {
          await docRef.collection('comments').add({
            ...c,
            createdAt: c.createdAt || new Date().toISOString()
          });
        }

        // Populate case logs
        for (const cl of caseLog) {
          await docRef.collection('caseLog').add({
            ...cl,
            ts: cl.ts || new Date().toISOString()
          });
        }

        // Populate timeline
        for (const t of timeline) {
          await docRef.collection('statusHistory').add({
            ...t,
            ts: t.ts || new Date().toISOString()
          });
        }

        console.log(`Successfully created issue ${issueId} in Firestore`);
        return normalizeIssue(cleanIssue);
      } catch (error) {
        console.error('Firestore createIssue failed, switching permanently to local JSON fallback:', error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    local.issues.unshift(cleanIssue);
    writeLocalDb(local);
    console.log(`Successfully created issue ${issueId} in local JSON database`);
    return normalizeIssue(cleanIssue);
  },

  async updateIssue(issueId: string, updates: any): Promise<boolean> {
    if (!useLocalFallback && firestoreDb) {
      try {
        const docRef = firestoreDb.collection('issues').doc(issueId);
        await docRef.update({
          ...updates,
          updatedAt: new Date().toISOString()
        });
        console.log(`Successfully updated issue ${issueId} in Firestore`);
        return true;
      } catch (error) {
        console.error(`Firestore updateIssue for ${issueId} failed, switching permanently to local JSON fallback:`, error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const idx = local.issues.findIndex((i: any) => i.id === issueId);
    if (idx !== -1) {
      local.issues[idx] = {
        ...local.issues[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      writeLocalDb(local);
      console.log(`Successfully updated issue ${issueId} in local JSON database`);
      return true;
    }
    return false;
  },

  async addComment(issueId: string, comment: any): Promise<any> {
    const cleanComment = {
      id: comment.id || `c-${Date.now()}`,
      author: comment.author || 'Anonymous',
      isAgent: !!comment.isAgent,
      text: comment.text || '',
      time: comment.time || 'Just now',
      createdAt: new Date().toISOString()
    };

    if (!useLocalFallback && firestoreDb) {
      try {
        const docRef = firestoreDb.collection('issues').doc(issueId);
        await docRef.collection('comments').doc(cleanComment.id).set(cleanComment);
        await docRef.update({
          commentCount: FieldValue.increment(1),
          updatedAt: new Date().toISOString()
        });
        return cleanComment;
      } catch (error) {
        console.error(`Firestore addComment to ${issueId} failed, switching permanently to local JSON fallback:`, error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const issue = local.issues.find((i: any) => i.id === issueId);
    if (issue) {
      issue.comments = issue.comments || [];
      issue.comments.push(cleanComment);
      issue.commentCount = (issue.commentCount || 0) + 1;
      issue.updatedAt = new Date().toISOString();
      writeLocalDb(local);
      return cleanComment;
    }
    return null;
  },

  async addCaseLog(issueId: string, entry: any): Promise<any> {
    const cleanEntry = {
      ts: entry.ts || new Date().toISOString(),
      glyph: entry.glyph || '›',
      kind: entry.kind || 'reasoning',
      text: entry.text || ''
    };

    if (!useLocalFallback && firestoreDb) {
      try {
        const docRef = firestoreDb.collection('issues').doc(issueId);
        await docRef.collection('caseLog').add(cleanEntry);
        return cleanEntry;
      } catch (error) {
        console.error(`Firestore addCaseLog to ${issueId} failed, switching permanently to local JSON fallback:`, error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const issue = local.issues.find((i: any) => i.id === issueId);
    if (issue) {
      issue.caseLog = issue.caseLog || [];
      // map to CaseLogLine expected by UI schema: { time, glyph, text, isDone, dim }
      const lineTime = new Date(cleanEntry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      issue.caseLog.push({
        time: lineTime,
        glyph: cleanEntry.glyph,
        text: cleanEntry.text,
        isDone: true
      });
      issue.updatedAt = new Date().toISOString();
      writeLocalDb(local);
    }
    return cleanEntry;
  },

  async addStatusHistory(issueId: string, entry: any): Promise<any> {
    const cleanEntry = {
      status: entry.status,
      timestamp: entry.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: entry.date || 'Today',
      note: entry.note || '',
      ts: new Date().toISOString()
    };

    if (!useLocalFallback && firestoreDb) {
      try {
        const docRef = firestoreDb.collection('issues').doc(issueId);
        await docRef.collection('statusHistory').add(cleanEntry);
        await docRef.update({
          status: entry.status,
          updatedAt: new Date().toISOString()
        });
        return cleanEntry;
      } catch (error) {
        console.error(`Firestore addStatusHistory to ${issueId} failed, switching permanently to local JSON fallback:`, error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const issue = local.issues.find((i: any) => i.id === issueId);
    if (issue) {
      issue.status = entry.status;
      issue.timeline = issue.timeline || [];
      issue.timeline.push(cleanEntry);
      issue.updatedAt = new Date().toISOString();
      writeLocalDb(local);
    }
    return cleanEntry;
  },

  /**
   * Find duplicates of same category within nearby coordinates (about 150m is approx same geohash or direct lat/lng comparison)
   */
  async findDuplicates(category: string, lat: number, lng: number): Promise<any | null> {
    // We can fetch same-category issues in similar proximity
    const threshold = 0.0015; // roughly ~150 meters lat/lng diff
    
    if (!useLocalFallback && firestoreDb) {
      try {
        const snap = await firestoreDb.collection('issues').where('category', '==', category).get();
        let closest: any = null;
        let minDist = threshold;
        
        snap.forEach((doc: any) => {
          const data = doc.data();
          const dLat = Math.abs(data.lat - lat);
          const dLng = Math.abs(data.lng - lng);
          const dist = Math.max(dLat, dLng);
          if (dist < minDist) {
            minDist = dist;
            closest = { id: doc.id, ...data };
          }
        });
        return closest;
      } catch (error) {
        console.error('Firestore findDuplicates failed, switching permanently to local JSON fallback:', error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    const categoryMatches = local.issues.filter((i: any) => i.category === category);
    let closest: any = null;
    let minDist = threshold;
    for (const issue of categoryMatches) {
      const dLat = Math.abs((issue.lat || 0) - lat);
      const dLng = Math.abs((issue.lng || 0) - lng);
      const dist = Math.max(dLat, dLng);
      if (dist < minDist) {
        minDist = dist;
        closest = issue;
      }
    }
    return closest;
  },

  /**
   * Creates a dispatch record (a sent/queued complaint) in the `dispatches`
   * collection. Idempotent on `idempotencyKey` (issueId_tier) so re-running
   * dispatch for the same tier never duplicates. Server-write-only per Doc 5 §2.
   */
  async createDispatch(dispatchData: any): Promise<any> {
    const idempotencyKey = dispatchData.idempotencyKey || `${dispatchData.issueId}_${dispatchData.tier}`;
    const cleanDispatch = {
      id: dispatchData.id || `dsp-${Date.now()}`,
      issueId: dispatchData.issueId,
      departmentId: dispatchData.departmentId || null,
      tier: dispatchData.tier ?? 1,
      toInbox: dispatchData.toInbox || '',
      gmailMessageId: dispatchData.gmailMessageId || `pending-${idempotencyKey}`,
      body: dispatchData.body || '',
      status: dispatchData.status || 'PENDING',
      idempotencyKey,
      createdAt: new Date().toISOString()
    };

    if (!useLocalFallback && firestoreDb) {
      try {
        // Idempotency guard: one dispatch per issueId_tier.
        const existingSnap = await firestoreDb
          .collection('dispatches')
          .where('idempotencyKey', '==', idempotencyKey)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          const d = existingSnap.docs[0];
          console.log(`Dispatch for ${idempotencyKey} already exists (${d.id}); skipping duplicate.`);
          return { id: d.id, ...d.data() };
        }

        const ref = await firestoreDb.collection('dispatches').add(cleanDispatch);
        console.log(`Created dispatch ${ref.id} for issue ${cleanDispatch.issueId} (tier ${cleanDispatch.tier}) in Firestore`);
        return { id: ref.id, ...cleanDispatch };
      } catch (error) {
        console.error('Firestore createDispatch failed, switching permanently to local JSON fallback:', error);
        useLocalFallback = true;
      }
    }

    // Fallback mode
    const local = readLocalDb();
    local.dispatches = local.dispatches || [];
    const existing = local.dispatches.find((d: any) => d.idempotencyKey === idempotencyKey);
    if (existing) {
      console.log(`Dispatch for ${idempotencyKey} already exists locally; skipping duplicate.`);
      return existing;
    }
    local.dispatches.push(cleanDispatch);
    writeLocalDb(local);
    console.log(`Created dispatch ${cleanDispatch.id} for issue ${cleanDispatch.issueId} (tier ${cleanDispatch.tier}) in local JSON database`);
    return cleanDispatch;
  }
};
