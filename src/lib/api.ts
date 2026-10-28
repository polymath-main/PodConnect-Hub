import {
  Tenant,
  TenantMember,
  UserRole,
  ScrapeJob,
  StagedLead,
  Lead,
  JobLogEntry,
  OutreachSequence,
  SequenceTouchpoint,
  SequenceStep,
  PipelineStage,
  LoginSessionRequest,
  LoginSessionResponse,
  AgentAuthRequest,
  AgentAuthResponse,
  JsonRpcResponse,
} from '../types';
import { PlanLimits } from './plans';

const STORAGE_ACTIVE_TENANT_KEY = 'podconnect_active_tenant_id';
const STORAGE_SESSION_TOKEN_KEY = 'podconnect_session_token';

class ApiClient {
  private activeTenantId: string = localStorage.getItem(STORAGE_ACTIVE_TENANT_KEY) || 'tenant_default';
  private sessionToken: string | null = localStorage.getItem(STORAGE_SESSION_TOKEN_KEY);
  private userId: string = 'operator_system';
  private userEmail: string = 'operator@podconnect.agency';

  public setTenantId(tenantId: string) {
    this.activeTenantId = tenantId;
    localStorage.setItem(STORAGE_ACTIVE_TENANT_KEY, tenantId);
  }

  public getTenantId(): string {
    return this.activeTenantId;
  }

  public setSessionToken(token: string | null) {
    this.sessionToken = token;
    if (token) {
      localStorage.setItem(STORAGE_SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_SESSION_TOKEN_KEY);
    }
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public setUserContext(userId: string, email: string) {
    this.userId = userId;
    this.userEmail = email;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': this.activeTenantId,
      'x-user-id': this.userId,
      'x-user-email': this.userEmail,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `API Request Failed (${res.status}): ${res.statusText}`);
    }

    return res.json();
  }

  // ==========================================
  // TENANTS / WORKSPACES
  // ==========================================

  public async getTenants(): Promise<{ success: boolean; activeTenantId: string; currentRole: UserRole; tenants: Tenant[] }> {
    return this.request('/api/tenants');
  }

  public async createTenant(name: string, slug: string, plan: string = 'growth'): Promise<{ success: boolean; tenant: Tenant }> {
    return this.request('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({ name, slug, plan }),
    });
  }

  public async getTenantMembers(tenantId: string): Promise<{ success: boolean; members: TenantMember[] }> {
    return this.request(`/api/tenants/${tenantId}/members`);
  }

  public async addTenantMember(tenantId: string, email: string, role: UserRole): Promise<{ success: boolean; member: TenantMember }> {
    return this.request(`/api/tenants/${tenantId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  // ==========================================
  // STAGED LEADS
  // ==========================================

  public async getStagedLeads(clientId?: string): Promise<{ success: boolean; count: number; stagedLeads: StagedLead[] }> {
    const query = clientId && clientId !== 'ALL' ? `?client_id=${encodeURIComponent(clientId)}` : '';
    return this.request(`/api/staged-leads${query}`);
  }

  public async updateStagedLead(id: number, data: Partial<StagedLead>): Promise<{ success: boolean; id: number }> {
    return this.request(`/api/staged-leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async deleteStagedLead(id: number): Promise<{ success: boolean }> {
    return this.request(`/api/staged-leads/${id}`, {
      method: 'DELETE',
    });
  }

  public async importStagedLeads(stagedIds: number[]): Promise<{ success: boolean; count: number; importedLeads: Lead[] }> {
    return this.request('/api/staged-leads/import', {
      method: 'POST',
      body: JSON.stringify({ stagedIds }),
    });
  }

  // ==========================================
  // CORE LEADS DATABASE
  // ==========================================

  public async getLeads(filters: {
    clientId?: string;
    niche?: string;
    tag?: string;
    status?: string;
    search?: string;
  } = {}): Promise<{ success: boolean; count: number; leads: Lead[] }> {
    const params = new URLSearchParams();
    if (filters.clientId && filters.clientId !== 'ALL') params.set('clientId', filters.clientId);
    if (filters.niche) params.set('niche', filters.niche);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/leads${query}`);
  }

  public async updateLead(id: number, data: Partial<Lead>): Promise<{ success: boolean; id: number }> {
    return this.request(`/api/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async deleteLead(id: number): Promise<{ success: boolean; id: number }> {
    return this.request(`/api/leads/${id}`, {
      method: 'DELETE',
    });
  }

  public async assignLeadToClient(leadId: number, targetClientId: string): Promise<{ success: boolean }> {
    return this.request('/api/leads/assign-client', {
      method: 'POST',
      body: JSON.stringify({ leadId, targetClientId }),
    });
  }

  public async assignLeadsToClient(leadIds: number[], targetClientId: string): Promise<{ success: boolean; assignedCount?: number }> {
    return this.request('/api/leads/assign-client', {
      method: 'POST',
      body: JSON.stringify({ leadIds, targetClientId }),
    });
  }

  public async updateLeadStatus(id: number, status: string): Promise<{ success: boolean; id: number; status: string }> {
    return this.request('/api/leads/update-status', {
      method: 'POST',
      body: JSON.stringify({ id, status }),
    });
  }

  public async dispatchPitch(leadId: number, params: {
    accessToken: string;
    subject: string;
    body: string;
  }): Promise<{ success: boolean; messageId: string; dispatchedTo?: string; leadId?: number }> {
    return this.request(`/api/leads/${leadId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async getBillingStatus(): Promise<{
    success: boolean;
    plan: string;
    limits: PlanLimits;
    usage: { jobsToday: number; memberCount: number };
  }> {
    return this.request('/api/billing/status');
  }

  // ==========================================
  // JOB QUEUE
  // ==========================================

  public async enqueueScrapeJob(params: {
    clientId: string;
    niche: string;
    minSubs?: number;
    limit?: number;
  }): Promise<{ success: boolean; job: ScrapeJob }> {
    return this.request('/api/scrape/jobs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async getJobs(): Promise<{ success: boolean; count: number; jobs: ScrapeJob[] }> {
    return this.request('/api/scrape/jobs');
  }

  public async getJobDetails(jobId: string): Promise<{ success: boolean; job: ScrapeJob; logs: JobLogEntry[] }> {
    return this.request(`/api/scrape/jobs/${jobId}`);
  }

  public async cancelJob(jobId: string): Promise<{ success: boolean }> {
    return this.request(`/api/scrape/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  // ==========================================
  // GEMINI AI ENGINES
  // ==========================================

  public async extractTranscript(transcript: string, clientSequence: number = 1): Promise<any> {
    return this.request('/api/gemini/extract-transcript', {
      method: 'POST',
      body: JSON.stringify({ transcript, clientSequence }),
    });
  }

  public async discoverShows(niche: string, clientId: string = 'C001', minSubs: number = 1000): Promise<any> {
    return this.request('/api/gemini/discover-shows', {
      method: 'POST',
      body: JSON.stringify({ niche, clientId, minSubs }),
    });
  }

  public async generatePitch(params: {
    clientName: string;
    niche: string;
    messagePillars: string[];
    credibilityAssets: string[];
    showName: string;
    hostName: string;
  }): Promise<any> {
    return this.request('/api/gemini/generate-pitch', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async generateOutreachSequence(params: {
    clientName: string;
    niche: string;
    messagePillars: string[];
    credibilityAssets: string[];
    showName: string;
    hostName: string;
    recentTopic?: string;
  }): Promise<{ success: boolean; sequence: any }> {
    return this.request('/api/gemini/generate-outreach-sequence', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async getLeadSequence(leadId: number): Promise<{ success: boolean; sequence: OutreachSequence | null }> {
    return this.request(`/api/leads/${leadId}/sequence`);
  }

  public async saveLeadSequence(
    leadId: number,
    sequence: Partial<OutreachSequence>
  ): Promise<{ success: boolean; sequence: OutreachSequence }> {
    return this.request(`/api/leads/${leadId}/sequence`, {
      method: 'PUT',
      body: JSON.stringify(sequence),
    });
  }

  public async dispatchTouchpoint(
    leadId: number,
    params: {
      accessToken: string;
      touchpoint: SequenceStep | SequenceTouchpoint | string;
      customSubject?: string;
      customBody?: string;
    }
  ): Promise<any> {
    return this.request(`/api/leads/${leadId}/dispatch-touchpoint`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Session Management & Agent MCP Methods ---
  public async loginSession(payload: LoginSessionRequest): Promise<LoginSessionResponse> {
    const res = await this.request<LoginSessionResponse>('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.sessionToken) {
      this.setSessionToken(res.sessionToken);
      this.setUserContext(res.user.uid, res.user.email);
      if (res.activeTenant?.id) {
        this.setTenantId(res.activeTenant.id);
      }
    }
    return res;
  }

  public async loginAgent(payload: AgentAuthRequest): Promise<AgentAuthResponse> {
    const res = await this.request<AgentAuthResponse>('/api/auth/agent', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.sessionToken) {
      this.setSessionToken(res.sessionToken);
      this.setUserContext(res.agentId, `${res.agentId}@podconnect.agent`);
      if (res.tenantId) {
        this.setTenantId(res.tenantId);
      }
    }
    return res;
  }

  public async verifyAgent(keyOrToken?: string): Promise<{ success: boolean; authenticated: boolean; status?: string; agentId?: string; tenantId?: string }> {
    const headers: Record<string, string> = {};
    if (keyOrToken) {
      headers['Authorization'] = `Bearer ${keyOrToken}`;
    }
    return this.request('/api/auth/agent', { method: 'GET', headers });
  }

  public async getSession(): Promise<LoginSessionResponse> {
    return this.request<LoginSessionResponse>('/api/auth/session');
  }

  public async logoutSession(): Promise<void> {
    try {
      await this.request<{ success: boolean }>('/api/auth/session', { method: 'DELETE' });
    } catch {
      // Ignore network errors on logout
    } finally {
      this.setSessionToken(null);
    }
  }

  public async getUserAgentKey(): Promise<{
    success: boolean;
    key: string;
    keyPrefix: string;
    name: string;
    createdAt: string;
    tenantId: string;
    mcpConfig: {
      serverName: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  }> {
    return this.request('/api/user/agent-key');
  }

  public async rotateUserAgentKey(): Promise<{
    success: boolean;
    message: string;
    key: string;
    keyPrefix: string;
    name: string;
    createdAt: string;
    tenantId: string;
    mcpConfig: {
      serverName: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  }> {
    return this.request('/api/user/agent-key/rotate', { method: 'POST' });
  }

  public async callMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const res = await this.request<JsonRpcResponse>('/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    if (res.error) {
      throw new Error(`MCP Error (${res.error.code}): ${res.error.message}`);
    }
    return res.result;
  }
}

export const api = new ApiClient();
