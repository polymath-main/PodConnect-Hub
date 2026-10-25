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
  stage?: ClientStage;
  status: ClientStatus;
  orderNumber?: string;
  targetPlacements?: number;
  bookedPlacements?: number;
  cancellationDetails?: CancellationDetails;
  stageHistory?: StageHistoryEntry[];
  icp?: ClientICP;
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

export type ClientStage =
  | 'Onboarding'
  | 'Scoping'
  | 'Lead Sourcing'
  | 'Outreach Active'
  | 'Interview Scheduled'
  | 'Completed'
  | 'Paused'
  | 'Cancelled';

export type ClientStatus = 'Active' | 'Paused' | 'Cancelled' | 'Completed' | 'Onboarding' | 'Review';

export interface CancellationDetails {
  reason: string;
  cancelledAt: string;
  settlementType: 'Full Refund' | 'Partial Settlement' | 'Retained as Credit' | 'Non-Refundable (Delivered)' | 'No Settlement Required';
  settlementAmount?: string;
  notes?: string;
  archiveCalendarEvents?: boolean;
  cancelledBy?: string;
}

export interface StageHistoryEntry {
  fromStage: ClientStage;
  toStage: ClientStage;
  timestamp: string;
  note?: string;
}

export type LeadStatus =
  | 'Staged'
  | 'Imported'
  | 'New'
  | 'Pitch Drafted'
  | 'Contacted'
  | 'Sent'
  | 'Dispatched'
  | 'Replied'
  | 'Responded'
  | 'Converted'
  | 'Booked'
  | 'Archived'
  | 'Passed';

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
  tags?: string[];
  score: number;
  status: LeadStatus;
  dateAdded: string;
  notes?: string;
  location?: string;
  pitchDraft?: PitchDraft;
}

export interface StagedLead {
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
  tags: string[];
  score: number;
  location?: string;
  notes?: string;
  dateScraped: string;
  selected?: boolean;
}

export interface ClientICP {
  targetGeos?: string[];
  audienceFloor?: number;
  keywords?: string[];
  targetPlatforms?: string[];
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
