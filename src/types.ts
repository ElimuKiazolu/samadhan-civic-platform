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
}
