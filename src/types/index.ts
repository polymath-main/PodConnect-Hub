export interface Milestone {
  id?: string;
  title: string;
  dayOffset: number;
  dueDate: string;
  completed: boolean;
  calendarEventId?: string;
  calendarLink?: string;
}

export interface Client {
  id: string; // e.g. "C001", "C002"
  name: string;
  platform: string;
  niche: string;
  package: string;
  pricing: string;
  minSubscribers: number;
  contractDays: number;
  startDate: string;
  endDate: string;
  status: 'Onboarding' | 'Active' | 'Review' | 'Completed';
  messagePillars: string[];
  credibilityAssets: string[];
  samplePitchAngle?: string;
  milestones: Milestone[];
  docs: {
    conversationExportUrl?: string;
    conversationExportTitle?: string;
    requirementsDocUrl?: string;
    requirementsDocTitle?: string;
    outreachStrategyDocUrl?: string;
    outreachStrategyDocTitle?: string;
  };
  lastSyncedAt?: string;
}

export interface Lead {
  id: number;
  clientId: string;
  showName: string;
  hostName: string;
  platform: string;
  showUrl: string;
  feedUrl?: string;
  email: string;
  subscribers: number;
  niche: string;
  score: number;
  status: 'New' | 'Pitch Drafted' | 'Sent' | 'Dispatched' | 'Responded' | 'Booked' | 'Passed';
  dateAdded: string;
}

export interface ScrapeLog {
  id?: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'SUCCESS' | 'RAW';
  message: string;
  lead?: any;
}

export interface PitchDraft {
  leadId: number;
  showName: string;
  hostName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  talkingPoints: string[];
}

export interface WorkspaceAuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  uid: string;
}
