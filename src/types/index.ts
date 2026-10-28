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
  | 'Follow-Up 1 Sent'
  | 'Follow-Up 2 Sent'
  | 'Breakup Sent'
  | 'Replied'
  | 'Responded'
  | 'Converted'
  | 'Booked'
  | 'Archived'
  | 'Passed';

export type PipelineStage =
  | 'drafted'
  | 'initial_sent'
  | 'fu1_due'
  | 'fu1_sent'
  | 'fu2_due'
  | 'fu2_sent'
  | 'breakup_due'
  | 'breakup_sent'
  | 'responded'
  | 'booked'
  | 'archived';

export type SequenceTouchpoint = 'initial' | 'follow_up_1' | 'follow_up_2' | 'breakup';

export interface SequenceStep {
  subject: string;
  body: string;
  delayDays: number;
  talkingPoints?: string[];
}

export interface OutreachSequence {
  id?: number;
  tenantId?: string;
  leadId: number;
  clientId: string;
  initial: SequenceStep;
  followUp1: SequenceStep;
  followUp2: SequenceStep;
  breakup: SequenceStep;
  pipelineStage: PipelineStage;
  initialSentAt?: string;
  fu1DueAt?: string;
  fu1SentAt?: string;
  fu2DueAt?: string;
  fu2SentAt?: string;
  breakupDueAt?: string;
  breakupSentAt?: string;
  threadId?: string;
  lastMessageId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Lead {
  id: number;
  tenantId?: string;
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
  pipelineStage?: PipelineStage;
  sequence?: OutreachSequence;
}

export interface StagedLead {
  id: number;
  tenantId?: string;
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
  level: 'INFO' | 'WARN' | 'SUCCESS' | 'ERROR' | 'RAW';
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

// ==========================================
// SAAS MULTI-TENANCY & JOB QUEUE TYPES
// ==========================================

export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'agency' | 'enterprise';
  ownerUserId: string;
  createdAt: string;
  memberCount?: number;
  currentRole?: UserRole;
}

export interface TenantMember {
  id: number;
  tenantId: string;
  userId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScrapeJob {
  id: string;
  tenantId: string;
  userId: string;
  clientId: string;
  jobType: 'scraper' | 'search_grounding';
  niche: string;
  minSubs: number;
  targetCount: number;
  status: JobStatus;
  progress: number;
  foundCount: number;
  stagedCount: number;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface JobLogEntry {
  id: number;
  jobId: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'SUCCESS' | 'ERROR' | 'RAW';
  message: string;
  metadata?: any;
}

// --- Session & Multi-Actor Auth Contracts ---
export type AuthType = 'firebase_id_token' | 'agent_key' | 'credentials';

export interface UserSession {
  id: string;               // Session token UUID / hash
  userId: string;           // Firebase UID or Agent Identifier
  email: string;            // User or Agent email
  tenantId: string;         // Active bound workspace ID
  role: UserRole;           // User role in this workspace
  authType: AuthType;       // Auth mechanism used
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface LoginSessionRequest {
  authType: AuthType;
  token?: string;           // Firebase ID token OR Agent API key
  email?: string;           // Optional identifier
  tenantId?: string;        // Target workspace
  clientMeta?: {
    clientName?: string;
    clientVersion?: string;
  };
}

export interface LoginSessionResponse {
  success: boolean;
  sessionToken: string;
  expiresAt: string;
  user: {
    uid: string;
    email: string;
    role: UserRole;
    isAgent: boolean;
  };
  activeTenant: {
    id: string;
    name: string;
    slug: string;
    plan: 'starter' | 'growth' | 'agency' | 'enterprise';
  };
  availableTenants: Tenant[];
}

// --- Lightweight MCP Protocol Contracts ---
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}


