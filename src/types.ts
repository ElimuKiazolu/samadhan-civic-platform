export interface CaseLogLine {
  time: string;
  glyph: string;
  text: string;
  isDone: boolean;
  dim?: boolean;
}

export interface TimelineEvent {
  status: 'SUBMITTED' | 'VALIDATED' | 'ESCALATED' | 'IN_PROGRESS' | 'RESOLVED' | 'STALLED';
  timestamp: string;
  date: string;
  note: string;
}

export interface Comment {
  id: string;
  author: string;
  isAgent: boolean;
  text: string;
  time: string;
}

export interface CivicIssue {
  id: string;
  dossierId: string;
  title: string;
  category: 'Roads/Potholes' | 'Streetlights' | 'Water' | 'Garbage/Waste' | 'Drainage/Sewage' | 'Other';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'SUBMITTED' | 'VALIDATED' | 'ESCALATED' | 'IN_PROGRESS' | 'STALLED' | 'RESOLVED';
  location: string;
  ward: string;
  age: string;
  confirmedCount: number;
  agentStatus: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  timeline: TimelineEvent[];
  caseLog: CaseLogLine[];
  comments: Comment[];
  isUserCorroborated?: boolean;
  // Optional server-side fields (denormalized issue shape; see db.ts / triage.ts).
  reporterId?: string;
  /** Authority resolution proof — a SEPARATE media field so the original evidence
   *  (mediaUrl) is never overwritten. Set by POST /api/issues/:id/status. */
  proofUrl?: string;
  proofMediaType?: 'photo' | 'video';
  resolvedAt?: string;
  resolvedBy?: string;
  description?: string;
  lat?: number;
  lng?: number;
  /** True when lat/lng is a coarse ward-level approximation (not GPS/EXIF/typed),
   *  so the map can label it honestly. Set by the triage pipeline. */
  approxLocation?: boolean;
  zone?: string;
  confidence?: number;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
