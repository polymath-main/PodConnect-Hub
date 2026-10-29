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

export type EmailType = 'direct' | 'mailto' | 'inferred';

export interface DiscoveredEmail {
  email: string;
  type: EmailType;
  confidence: number;
  domainValid?: boolean;
  validationReason?: string;
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
  emailType?: EmailType;
  emailConfidence?: number;
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
  emailType?: EmailType;
  emailConfidence?: number;
  subscribers: number;
  niche: string;
  tags: string[];
  score: number;
  location?: string;
  notes?: string;
  dateScraped: string;
  selected?: boolean;
}

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
  | 'declined'
  | 'unresponsive';

export type SequenceStep = 'initial' | 'follow_up_1' | 'follow_up_2' | 'breakup';

export interface SequenceTouchpoint {
  subject: string;
  body: string;
  talkingPoints?: string[];
  delayDays: number;
  sentAt?: string;
  messageId?: string;
}

export interface OutreachSequence {
  id?: number;
  tenantId?: string;
  leadId: number;
  clientId: string;
  initial: SequenceTouchpoint;
  followUp1: SequenceTouchpoint;
  followUp2: SequenceTouchpoint;
  breakup: SequenceTouchpoint;
  pipelineStage: PipelineStage;
  threadId?: string;
  lastMessageId?: string;
  initialSentAt?: string;
  fu1DueAt?: string;
  fu1SentAt?: string;
  fu2DueAt?: string;
  fu2SentAt?: string;
  breakupDueAt?: string;
  breakupSentAt?: string;
  updatedAt?: string;
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

// ==========================================
// SESSION, AGENT AUTH & MCP PROTOCOL TYPES
// ==========================================

export interface UserSession {
  id: string;
  token: string;
  userId: string;
  email: string;
  authType: 'credentials' | 'firebase_id_token' | 'agent_key' | 'anonymous';
  tenantId: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  clientMeta?: {
    clientName?: string;
    clientVersion?: string;
    userAgent?: string;
    ip?: string;
  };
}

export interface LoginSessionRequest {
  authType: 'credentials' | 'firebase_id_token' | 'agent_key' | 'anonymous';
  token?: string;
  email?: string;
  password?: string;
  tenantId?: string;
  clientMeta?: {
    clientName?: string;
    clientVersion?: string;
    userAgent?: string;
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
  };
  activeTenantId?: string;
  activeTenant?: Tenant;
}

export interface AgentAuthRequest {
  agentKey: string;
  agentId?: string;
  tenantId?: string;
}

export interface AgentAuthResponse {
  success: boolean;
  sessionToken: string;
  agentId: string;
  role: UserRole;
  tenantId: string;
  expiresAt: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
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

export interface McpResourceDefinition {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface UserAgentKey {
  id: string;
  key?: string;
  keyHash?: string;
  keyPrefix: string;
  userId: string;
  email: string;
  tenantId: string;
  role: UserRole;
  name: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface SystemLogItem {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'AUTH' | 'AUDIT' | 'MCP';
  category: 'auth' | 'api' | 'scraper' | 'email' | 'database' | 'mcp' | 'system';
  message: string;
  tenantId: string;
  userId?: string;
  ipAddress?: string;
  metadata?: any;
}


