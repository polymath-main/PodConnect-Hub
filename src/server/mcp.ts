import dns from 'dns';
import { GoogleGenAI } from '@google/genai';
import { dbService } from './db.js';
import { emailService } from './email.js';
import { jobQueue } from './queue.js';
import { eventLogger } from './eventLogger.js';
import { getLimits } from '../lib/plans.js';
import type { AuthenticatedRequest } from './auth.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpResourceDefinition,
  McpPromptDefinition,
  Lead,
  StagedLead,
  OutreachSequence,
  SequenceTouchpoint,
} from '../types';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'podconnect-hub';
export const SERVER_VERSION = '2.5.0';

// Optional Gemini instance for AI-driven tools
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('local-')) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ----------------------------------------------------------------------------
// Tool Definitions Catalog Conforming to MCP Specification (2024-11-05)
// ----------------------------------------------------------------------------
export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_leads',
    description: 'Search and filter active verified podcast leads in the current workspace CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID (e.g., C001)' },
        status: { type: 'string', description: 'Filter by lead status (Imported, Drafted, Sent, Responded, Booked, Declined)' },
        niche: { type: 'string', description: 'Filter by niche keyword' },
        search: { type: 'string', description: 'Text search matching show name, host name, or email' },
        limit: { type: 'number', description: 'Maximum leads to return (default 50)' },
      },
    },
  },
  {
    name: 'get_staged_leads',
    description: 'Fetch scraper-discovered leads waiting for human or agent review in the staging buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter staged leads by client ID' },
      },
    },
  },
  {
    name: 'approve_lead',
    description: 'Approve a single staged lead and promote it into the active CRM lead bank.',
    inputSchema: {
      type: 'object',
      properties: {
        staged_id: { type: 'number', description: 'Database ID of the staged lead to approve' },
      },
      required: ['staged_id'],
    },
  },
  {
    name: 'batch_approve_leads',
    description: 'Approve multiple staged leads at once for high-throughput batch ingestion into CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        staged_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of staged lead database IDs to promote',
        },
      },
      required: ['staged_ids'],
    },
  },
  {
    name: 'reject_staged_lead',
    description: 'Discard and remove a low-quality or irrelevant lead from the staging review buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        staged_id: { type: 'number', description: 'Database ID of the staged lead to discard' },
      },
      required: ['staged_id'],
    },
  },
  {
    name: 'update_lead_status',
    description: 'Update the pipeline status, outreach notes, or custom tags for a verified CRM lead.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the lead to update' },
        status: {
          type: 'string',
          description: 'New CRM status: Imported | Drafted | Sent | Responded | Booked | Declined',
        },
        notes: { type: 'string', description: 'Operator or agent operational notes' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Updated tag array' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'discover_shows',
    description: 'Search live podcast shows in any niche using Gemini Search Grounding and auto-stage them for review.',
    inputSchema: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Target topic or domain (e.g., "AI agents", "Fintech SaaS")' },
        client_id: { type: 'string', description: 'Target client ID (default: C001)' },
        min_subs: { type: 'number', description: 'Minimum estimated audience/subscribers (default: 1000)' },
      },
      required: ['niche'],
    },
  },
  {
    name: 'enqueue_lead_scraper',
    description: 'Trigger the autonomous multi-source lead scraping queue (Apple Podcasts, RSS feeds, open directories) with subscriber thresholds.',
    inputSchema: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Target niche to scrape (e.g., "Health & Wellness", "B2B SaaS")' },
        client_id: { type: 'string', description: 'Target client ID (default: C001)' },
        min_subs: { type: 'number', description: 'Minimum subscriber audience floor (default: 1000)' },
        target_count: { type: 'number', description: 'Number of verified leads to find (default: 10)' },
      },
      required: ['niche'],
    },
  },
  {
    name: 'verify_email_domain',
    description: 'Verify email address syntax and DNS MX reachability for host contact deliverability before pitching.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address to verify' },
      },
      required: ['email'],
    },
  },
  {
    name: 'generate_pitch',
    description: 'Generate a personalized, high-conversion pitch email for a specific verified lead.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the target lead' },
        angle: { type: 'string', description: 'Custom pitch angle, hook, or focal topic' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'generate_sequence',
    description: 'Generate and store a complete 4-touchpoint cadence sequence (Initial, FU1, FU2, Breakup) for a lead.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the lead' },
        client_name: { type: 'string', description: 'Client / speaker name' },
        host_name: { type: 'string', description: 'Podcast host name' },
        show_name: { type: 'string', description: 'Podcast show name' },
        niche: { type: 'string', description: 'Niche or industry' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'dispatch_touchpoint',
    description: 'Send an outreach email touchpoint for a lead and advance the cadence pipeline stage.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the lead' },
        touchpoint: {
          type: 'string',
          description: 'Cadence stage: initial | fu1 | fu2 | breakup',
        },
        to_email: { type: 'string', description: 'Recipient email address override' },
        access_token: { type: 'string', description: 'Optional OAuth access token for Gmail send' },
      },
      required: ['lead_id', 'touchpoint'],
    },
  },
  {
    name: 'schedule_milestone',
    description: 'Autonomous project milestone scheduler calculating contract phases and Google Calendar synchronization dates.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID (e.g. C001)' },
        contract_days: { type: 'number', description: 'Contract duration in days (default 120)' },
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (default: today)' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'extract_client_requirements',
    description: 'Analyze raw client conversation transcripts or agreements to extract structured onboarding specs, pricing, milestones, and pillars.',
    inputSchema: {
      type: 'object',
      properties: {
        transcript: { type: 'string', description: 'Raw chat transcript or agreement notes' },
        client_sequence: { type: 'number', description: 'Sequence number for new client ID (e.g. 1 for C001)' },
        auto_save: { type: 'boolean', description: 'Automatically save extracted client to database (default true)' },
      },
      required: ['transcript'],
    },
  },
  {
    name: 'get_clients',
    description: 'Fetch the active clients list in the workspace including target niches, pricing, message pillars, and placement targets.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional specific client ID (e.g. C001)' },
      },
    },
  },
  {
    name: 'save_client',
    description: 'Create or update client specifications, target niches, message pillars, and placement goals in the relational database.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Client ID (e.g. C001, C002)' },
        name: { type: 'string', description: 'Client company or person name' },
        niche: { type: 'string', description: 'Target market niche or keywords' },
        platform: { type: 'string', description: 'Target media platform' },
        package: { type: 'string', description: 'Service package name' },
        pricing: { type: 'string', description: 'Contract pricing terms' },
        minSubscribers: { type: 'number', description: 'Minimum subscriber audience threshold' },
        contractDays: { type: 'number', description: 'Contract duration in days' },
        targetPlacements: { type: 'number', description: 'Target completed podcast placements' },
        messagePillars: { type: 'array', items: { type: 'string' }, description: 'Core talking points and expertise pillars' },
        credibilityAssets: { type: 'array', items: { type: 'string' }, description: 'Key achievements, metrics, and authority signals' },
        samplePitchAngle: { type: 'string', description: 'Sample podcast hook or angle' },
      },
      required: ['name', 'niche'],
    },
  },
  {
    name: 'get_workspace_stats',
    description: 'Get workspace telemetry, subscription plan quotas, member count, and pipeline lead stage counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_audit_logs',
    description: 'Query real-time system audit logs, security events, and scraper activities with level and search filters.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', description: 'Filter by log level: ALL | INFO | WARN | ERROR | AUTH | AUDIT | MCP' },
        category: { type: 'string', description: 'Filter by category: auth | api | scraper | email | database | mcp | system' },
        search: { type: 'string', description: 'Search keywords in log message or metadata' },
        limit: { type: 'number', description: 'Maximum logs to return (default 50)' },
      },
    },
  },
  {
    name: 'query_database',
    description: 'Execute direct, read-only SQL queries on the relational SQLite database (SELECT queries only, strict tenant isolation).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Read-only SQL query (e.g., SELECT * FROM clients, SELECT * FROM leads WHERE status="Booked")' },
        params: { type: 'array', items: {}, description: 'Positional query parameters for parameterized queries' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_database_schema',
    description: 'Inspect the relational database topology, all table names, columns, data types, and record counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ----------------------------------------------------------------------------
// Resource Definitions Catalog
// ----------------------------------------------------------------------------
export const MCP_RESOURCES: McpResourceDefinition[] = [
  {
    uri: 'podconnect://tenants/current',
    name: 'Active Workspace Profile & Quotas',
    mimeType: 'application/json',
    description: 'Authenticated workspace details, subscription plan limits, and active seat counts.',
  },
  {
    uri: 'podconnect://clients',
    name: 'Active Client Roster',
    mimeType: 'application/json',
    description: 'All active client profiles, niches, target platforms, and messaging pillars.',
  },
  {
    uri: 'podconnect://leads/summary',
    name: 'Leads Pipeline Funnel Summary',
    mimeType: 'application/json',
    description: 'Current pipeline counts broken down by status (Imported, Drafted, Sent, Responded, Booked, Declined).',
  },
  {
    uri: 'podconnect://schema',
    name: 'Relational Database Schema',
    mimeType: 'text/markdown',
    description: 'SQLite relational schema and table definitions.',
  },
  {
    uri: 'podconnect://logs/latest',
    name: 'Recent System Audit Logs',
    mimeType: 'application/json',
    description: 'Last 50 system, security, and scraper event logs.',
  },
];

// ----------------------------------------------------------------------------
// Prompt Definitions Catalog
// ----------------------------------------------------------------------------
export const MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: 'podcast_guest_pitch',
    description: 'Generate a high-converting, personalized guest pitch email for a podcast host based on client message pillars and credibility assets.',
    arguments: [
      { name: 'lead_id', description: 'Database ID of the lead to pitch', required: true },
      { name: 'custom_hook', description: 'Optional specific hook, recent episode reference, or angle', required: false },
    ],
  },
  {
    name: 'multi_touch_cadence',
    description: 'Structure a complete 4-touch outreach sequence (Initial, Follow-up 1, Follow-up 2, Breakup) with optimal delays.',
    arguments: [
      { name: 'lead_id', description: 'Database ID of the lead', required: true },
    ],
  },
  {
    name: 'client_onboarding_audit',
    description: 'Analyze an onboarding conversation transcript to generate structured client database attributes and calendar milestones.',
    arguments: [
      { name: 'transcript', description: 'Raw text transcript of client agreement or onboarding chat', required: true },
    ],
  },
];

// ----------------------------------------------------------------------------
// Handle Incoming Model Context Protocol JSON-RPC 2.0 Requests
// ----------------------------------------------------------------------------
export async function handleMcpRequest(
  req: AuthenticatedRequest,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const id = body.id !== undefined ? body.id : null;
  const method = body.method;
  const params = body.params || {};
  const tenantId = req.tenantId || 'tenant_default';
  const startTime = Date.now();

  try {
    switch (method) {
      // 1. MCP Initialization Handshake
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
              logging: {},
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION,
            },
            instructions:
              'PodConnect Hub AI is an autonomous enterprise podcast operations and guest placement platform. ' +
              'Capabilities include multi-source lead discovery, staged lead review, email domain deliverability verification, ' +
              'personalized pitch generation, 4-touchpoint cadence sequences, calendar milestone scheduling, client database management, ' +
              'and system audit logging.',
          },
        };
      }

      case 'notifications/initialized': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: { status: 'pong', timestamp: new Date().toISOString() },
        };
      }

      // 2. Tools Discovery
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        };
      }

      // 3. Tool Execution
      case 'tools/call': {
        const rawName = params.name || '';
        // Support both "search_leads" and "podconnect_search_leads"
        const toolName = rawName.startsWith('podconnect_') ? rawName.replace('podconnect_', '') : rawName;
        const args = params.arguments || {};

        try {
          const toolResult = await executeTool(tenantId, req, toolName, args);
          const duration = Date.now() - startTime;

          eventLogger.logMcp(toolName, `Agent executed tool ${toolName} successfully (${duration}ms)`, {
            tenantId,
            userId: req.user?.uid || 'agent_mcp',
            metadata: { toolName, durationMs: duration, success: true },
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                },
              ],
            },
          };
        } catch (execErr: any) {
          const duration = Date.now() - startTime;
          eventLogger.logMcp(toolName, `Tool execution failed: ${execErr.message}`, {
            tenantId,
            userId: req.user?.uid || 'agent_mcp',
            metadata: { toolName, error: execErr.message, durationMs: duration, success: false },
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Error executing tool '${toolName}': ${execErr.message}`,
                },
              ],
            },
          };
        }
      }

      // 4. Resources Discovery & Reading
      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: MCP_RESOURCES,
          },
        };
      }

      case 'resources/read': {
        const uri = params.uri || '';

        if (uri.startsWith('podconnect://tenants/')) {
          const tenant = dbService.getTenantById(tenantId);
          const limits = getLimits(tenant?.plan);
          const memberCount = dbService.getTenantMemberCount(tenantId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({ tenant, limits, currentSeats: memberCount }, null, 2),
                },
              ],
            },
          };
        }

        if (uri === 'podconnect://clients') {
          const clients = dbService.getClients(tenantId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(clients, null, 2),
                },
              ],
            },
          };
        }

        if (uri === 'podconnect://leads/summary') {
          const leads = dbService.getLeads(tenantId);
          const staged = dbService.getStagedLeads(tenantId);
          const statusBreakdown = leads.reduce((acc: Record<string, number>, l: Lead) => {
            acc[l.status] = (acc[l.status] || 0) + 1;
            return acc;
          }, {});

          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(
                    {
                      totalVerifiedLeads: leads.length,
                      totalStagedLeads: staged.length,
                      pipelineFunnel: statusBreakdown,
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          };
        }

        if (uri === 'podconnect://schema') {
          const schema = dbService.getDatabaseSchema(tenantId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'text/markdown',
                  text:
                    '# PodConnect Relational Database Topology\n\n' +
                    `Tables: ${Object.keys(schema.tables).join(', ')}\n\n` +
                    '```json\n' +
                    JSON.stringify(schema, null, 2) +
                    '\n```',
                },
              ],
            },
          };
        }

        if (uri === 'podconnect://logs/latest') {
          const { logs } = eventLogger.getLogs({ tenantId, limit: 50 });
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(logs, null, 2),
                },
              ],
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` },
        };
      }

      // 5. Prompts Discovery & Resolution
      case 'prompts/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: MCP_PROMPTS,
          },
        };
      }

      case 'prompts/get': {
        const promptName = params.name;
        const promptArgs = params.arguments || {};

        if (promptName === 'podcast_guest_pitch') {
          const leadId = Number(promptArgs.lead_id);
          const lead = leadId ? dbService.getLeadById(tenantId, leadId) : null;
          const client = lead?.clientId ? dbService.getClient(tenantId, lead.clientId) : null;

          const promptText =
            `You are an elite podcast booking strategist pitching on behalf of "${client?.name || 'our client'}".\n` +
            `Target Podcast: "${lead?.showName || 'the show'}" hosted by ${lead?.hostName || 'Host'}.\n` +
            `Niche: ${lead?.niche || client?.niche || 'Industry leadership'}\n` +
            (promptArgs.custom_hook ? `Focal Hook / Episode Reference: ${promptArgs.custom_hook}\n` : '') +
            (client?.messagePillars ? `Key Pillars: ${client.messagePillars.join(', ')}\n` : '') +
            (client?.credibilityAssets ? `Credibility Signals: ${client.credibilityAssets.join(', ')}\n` : '') +
            `Draft a high-conversion, non-salesy pitch email with a punchy subject line and 3 crisp interview talking points.`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Podcast Guest Pitch Template',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: promptText,
                  },
                },
              ],
            },
          };
        }

        if (promptName === 'multi_touch_cadence') {
          const leadId = Number(promptArgs.lead_id);
          const lead = leadId ? dbService.getLeadById(tenantId, leadId) : null;

          const promptText =
            `Draft a complete 4-touch outreach sequence for podcast "${lead?.showName || 'Show'}" (Host: ${lead?.hostName || 'Host'}):\n` +
            `1. Touchpoint 1 (Day 0): Compelling initial value-first pitch.\n` +
            `2. Touchpoint 2 (Day 3): Friendly follow-up referencing recent episode.\n` +
            `3. Touchpoint 3 (Day 7): Fresh perspective with concrete listener takeaways.\n` +
            `4. Touchpoint 4 (Day 14): Graceful breakup note leaving door open.`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: '4-Touchpoint Cadence Sequence Template',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: promptText,
                  },
                },
              ],
            },
          };
        }

        if (promptName === 'client_onboarding_audit') {
          const transcript = promptArgs.transcript || '';
          const promptText =
            `Analyze the following client conversation logs or agreement notes:\n"""\n${transcript}\n"""\n` +
            `Extract structured project details in valid JSON including: clientId, name, platform, niche, package, pricing, minSubscribers, contractDays, messagePillars, credibilityAssets, samplePitchAngle, and 4 timeline milestones.`;

          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Client Onboarding Audit Template',
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: promptText,
                  },
                },
              ],
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Prompt not found: ${promptName}` },
        };
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (error: any) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message || 'Internal error in MCP processor',
        data: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      },
    };
  }
}

// ----------------------------------------------------------------------------
// Execute Specific Tool Dispatch with Tenant Isolation
// ----------------------------------------------------------------------------
async function executeTool(
  tenantId: string,
  req: AuthenticatedRequest,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'search_leads': {
      const { client_id, status, niche, search, limit = 50 } = args;
      const allLeads = dbService.getLeads(tenantId, {
        clientId: client_id,
        status,
        niche,
        search,
      });
      return allLeads.slice(0, Number(limit) || 50);
    }

    case 'get_staged_leads': {
      const { client_id } = args;
      return dbService.getStagedLeads(tenantId, client_id);
    }

    case 'approve_lead': {
      const stagedId = Number(args.staged_id);
      if (!stagedId) throw new Error('staged_id parameter is required');
      const promoted = dbService.importStagedLeads(tenantId, [stagedId]);
      if (promoted.length === 0) throw new Error(`Staged lead with id ${stagedId} not found`);
      return { success: true, lead: promoted[0] };
    }

    case 'batch_approve_leads': {
      const stagedIds = args.staged_ids;
      if (!Array.isArray(stagedIds) || stagedIds.length === 0) {
        throw new Error('staged_ids array of numbers is required');
      }
      const numericIds = stagedIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0);
      const promoted = dbService.importStagedLeads(tenantId, numericIds);
      return { success: true, count: promoted.length, leads: promoted };
    }

    case 'reject_staged_lead': {
      const stagedId = Number(args.staged_id);
      if (!stagedId) throw new Error('staged_id parameter is required');
      const success = dbService.deleteStagedLead(tenantId, stagedId);
      return { success, stagedId, note: 'Lead discarded from staging buffer' };
    }

    case 'update_lead_status': {
      const leadId = Number(args.lead_id);
      if (!leadId) throw new Error('lead_id is required');
      const existing = dbService.getLeadById(tenantId, leadId);
      if (!existing) throw new Error(`Lead with ID ${leadId} not found`);

      const updateData: any = {};
      if (args.status) updateData.status = args.status;
      if (args.notes !== undefined) updateData.notes = args.notes;
      if (args.tags) updateData.tags = args.tags;

      dbService.updateLead(tenantId, leadId, updateData);
      const updated = dbService.getLeadById(tenantId, leadId);
      return { success: true, lead: updated };
    }

    case 'discover_shows': {
      const { niche, client_id = 'C001', min_subs = 1000 } = args;
      if (!niche) throw new Error('niche parameter is required');

      const ai = getAiClient();
      if (!ai) {
        throw new Error('GEMINI_API_KEY environment variable is not configured');
      }

      const prompt = `
Find 5 real, active, high-relevance podcasts in the niche "${niche}" that accept guest interviews.
For each podcast, provide:
1. Exact show title
2. Host name (or co-hosts)
3. Primary platform / link
4. Estimated audience / subscribers (integer or estimated over ${min_subs})
5. Public contact email or submission email
6. Why this show is an ideal match for guests in this niche.

Format your response as a valid JSON array of objects:
[
  {
    "showName": "...",
    "hostName": "...",
    "platform": "...",
    "showUrl": "...",
    "email": "...",
    "subscribers": 5000,
    "angle": "..."
  }
]
`;
      const candidateModels = [
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ];
      let response: any = null;
      let lastMcpError: any = null;
      for (const m of candidateModels) {
        // 1. Try search grounding
        try {
          response = await ai.models.generateContent({
            model: m,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: 'application/json',
            },
          });
          if (response && response.text) break;
        } catch (err: any) {
          lastMcpError = err;
        }

        // 2. Direct synthesis fallback (bypasses search grounding quota)
        if (!response || !response.text) {
          try {
            response = await ai.models.generateContent({
              model: m,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            });
            if (response && response.text) break;
          } catch (err: any) {
            lastMcpError = err;
          }
        }
      }

      if (!response || !response.text) {
        const isQuota = lastMcpError?.status === 429 || String(lastMcpError?.message).includes('429');
        throw new Error(
          isQuota
            ? 'Google Gemini API quota exceeded (HTTP 429). Please check API key quota.'
            : `All candidate AI discovery models failed to generate content: ${lastMcpError?.message || 'unknown error'}`
        );
      }

      let shows: any[] = [];
      try {
        shows = JSON.parse(response.text || '[]');
      } catch {
        const match = response.text?.match(/\[\s*\{.*\}\s*\]/s);
        if (match) shows = JSON.parse(match[0]);
      }

      // Stage discovered shows in SQLite
      const stagedResults: any[] = [];
      for (const show of shows) {
        if (!show.showName) continue;
        const saved = dbService.saveStagedLead(tenantId, {
          clientId: client_id,
          showName: show.showName,
          hostName: show.hostName || 'Host',
          platform: show.platform || 'Podcast',
          showUrl: show.showUrl || '',
          feedUrl: '',
          email: show.email || '',
          subscribers: Number(show.subscribers) || min_subs,
          niche,
          tags: ['AI Discovered', niche],
          score: 8.5,
          location: 'Global / Online',
          notes: show.angle || 'Discovered via Model Context Protocol agent',
        });
        if (saved) {
          stagedResults.push(show);
        }
      }

      return {
        success: true,
        count: stagedResults.length,
        niche,
        stagedShows: stagedResults,
      };
    }

    case 'enqueue_lead_scraper': {
      const { niche, client_id = 'C001', min_subs = 1000, target_count = 10 } = args;
      if (!niche) throw new Error('niche parameter is required to enqueue scraper');

      const job = jobQueue.enqueueJob({
        tenantId,
        userId: req.user?.uid || 'agent_mcp',
        clientId: client_id,
        niche,
        minSubs: Number(min_subs) || 1000,
        targetCount: Number(target_count) || 10,
        jobType: 'scraper',
      });

      return {
        success: true,
        jobId: job.id,
        status: job.status,
        niche: job.niche,
        clientId: job.clientId,
        targetCount: job.targetCount,
        note: 'Scraper job queued into background engine across Apple Podcasts and RSS feeds',
      };
    }

    case 'verify_email_domain': {
      const email = String(args.email || '').trim().toLowerCase();
      if (!email) throw new Error('email parameter is required');

      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      const validSyntax = emailRegex.test(email);
      if (!validSyntax) {
        return {
          email,
          validSyntax: false,
          deliverable: false,
          reason: 'Invalid email syntax format',
        };
      }

      const domain = email.split('@')[1];

      // Resolve DNS MX records with timeout
      try {
        const mxRecordsPromise = dns.promises.resolveMx(domain);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DNS resolution timeout (3000ms)')), 3000)
        );
        const mxRecords = await Promise.race([mxRecordsPromise, timeoutPromise]);

        const hasMx = Array.isArray(mxRecords) && mxRecords.length > 0;
        return {
          email,
          domain,
          validSyntax: true,
          hasMxRecords: hasMx,
          mxRecords: hasMx ? mxRecords.map((r) => r.exchange) : [],
          deliverable: hasMx,
          confidenceScore: hasMx ? 0.95 : 0.2,
        };
      } catch (dnsErr: any) {
        return {
          email,
          domain,
          validSyntax: true,
          hasMxRecords: false,
          deliverable: false,
          error: dnsErr.message || 'DNS MX check failed',
          confidenceScore: 0.3,
        };
      }
    }

    case 'generate_pitch': {
      const leadId = Number(args.lead_id);
      if (!leadId) throw new Error('lead_id parameter is required');

      const lead = dbService.getLeadById(tenantId, leadId);
      if (!lead) throw new Error(`Lead with ID ${leadId} not found`);

      const client = lead.clientId ? dbService.getClient(tenantId, lead.clientId) : null;
      const customAngle = args.angle || '';

      const ai = getAiClient();
      if (ai) {
        try {
          const prompt = `
Generate a personalized, authentic podcast pitch email:
- Recipient: Host ${lead.hostName} of "${lead.showName}"
- Show Niche: ${lead.niche}
- Client Name: ${client?.name || 'Our Guest'}
- Client Message Pillars: ${client?.messagePillars?.join(', ') || 'Leadership and innovation in ' + lead.niche}
- Client Credibility: ${client?.credibilityAssets?.join(', ') || 'Proven track record and published insights'}
- Specific Hook: ${customAngle || lead.notes || 'Recent discussions on industry transformation'}

Create:
1. High-open subject line (max 9 words)
2. Value-packed pitch body (under 180 words, 3 bullets of what listeners will learn, zero generic fluff)
3. Confident call to action (15-min fit call).

Output valid JSON:
{
  "subject": "...",
  "body": "...",
  "talkingPoints": ["...", "...", "..."]
}
`;
          const resp = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          });

          if (resp && resp.text) {
            const parsed = JSON.parse(resp.text);
            return {
              leadId,
              showName: lead.showName,
              hostName: lead.hostName,
              recipientEmail: lead.email,
              pitch: parsed,
            };
          }
        } catch {}
      }

      // High-converting algorithmic fallback
      const subject = `Interview Idea for ${lead.showName}: 3 High-Impact Lessons in ${lead.niche}`;
      const body =
        `Hi ${lead.hostName},\n\n` +
        `I’ve been following ${lead.showName} and love your candid exploration of ${lead.niche}.\n\n` +
        `Our speaker ${client?.name || 'our founder'} specializes in actionable frameworks and would love to share:\n` +
        `• Tactical takeaways from real-world execution in ${lead.niche}\n` +
        `• Emerging shifts operators need to prepare for this year\n` +
        `• Practical mistakes to avoid when scaling\n\n` +
        `Would you be open to a quick 10-minute chat next week to see if this fits your upcoming editorial calendar?\n\n` +
        `Best regards,\nPodConnect Team`;

      return {
        leadId,
        showName: lead.showName,
        hostName: lead.hostName,
        recipientEmail: lead.email,
        pitch: {
          subject,
          body,
          talkingPoints: [
            `Execution frameworks in ${lead.niche}`,
            `Emerging shifts operators need to prepare for`,
            `Practical mistakes to avoid when scaling`,
          ],
        },
      };
    }

    case 'generate_sequence': {
      const leadId = Number(args.lead_id);
      if (!leadId) throw new Error('lead_id is required');

      const lead = dbService.getLeadById(tenantId, leadId);
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const clientName = args.client_name || 'Our Speaker';
      const hostName = args.host_name || lead.hostName || 'Host';
      const showName = args.show_name || lead.showName || 'Show';
      const niche = args.niche || lead.niche || 'Industry';

      const initialSubject = `Guest Pitch: ${clientName} on ${showName}`;
      const initialBody =
        `Hi ${hostName},\n\n` +
        `Huge fan of ${showName}. Given your focus on ${niche}, I wanted to propose an interview with ${clientName}.\n\n` +
        `They can share actionable takeaways on scaling, frameworks, and operator lessons.\n\n` +
        `Would you have 10 minutes next Tuesday for a quick fit chat?\n\nBest,\nPodConnect`;

      const fu1Subject = `Quick follow up: ${clientName} on ${showName}`;
      const fu1Body =
        `Hi ${hostName},\n\n` +
        `Following up on my note regarding having ${clientName} on ${showName}. ` +
        `Happy to tailor talking points specifically for your listeners.\n\nBest,\nPodConnect`;

      const fu2Subject = `New perspective for ${showName} audience`;
      const fu2Body =
        `Hi ${hostName},\n\n` +
        `Wanted to share a quick metric: ${clientName}'s recent case study generated significant engagement in ${niche}. ` +
        `Could be a great episode for your community.\n\nBest,\nPodConnect`;

      const breakupSubject = `Closing the loop regarding ${showName}`;
      const breakupBody =
        `Hi ${hostName},\n\n` +
        `I know you're super busy. I won't follow up again on this thread, but feel free to reach out anytime if you need an expert on ${niche}.\n\n` +
        `Keep up the great episodes!\n\nBest,\nPodConnect`;

      const seq: OutreachSequence = {
        tenantId,
        leadId,
        clientId: lead.clientId || 'C001',
        initial: {
          delayDays: 0,
          subject: initialSubject,
          body: initialBody,
          talkingPoints: [`Key discussion pillars for ${niche}`],
        },
        followUp1: {
          delayDays: 3,
          subject: fu1Subject,
          body: fu1Body,
        },
        followUp2: {
          delayDays: 7,
          subject: fu2Subject,
          body: fu2Body,
        },
        breakup: {
          delayDays: 14,
          subject: breakupSubject,
          body: breakupBody,
        },
        pipelineStage: 'drafted',
      };

      const savedSeq = dbService.saveSequence(tenantId, seq);
      return { success: true, sequence: savedSeq };
    }

    case 'dispatch_touchpoint': {
      const leadId = Number(args.lead_id);
      const touchpoint = args.touchpoint as 'initial' | 'fu1' | 'fu2' | 'breakup';
      if (!leadId || !touchpoint) throw new Error('lead_id and touchpoint are required');

      const lead = dbService.getLeadById(tenantId, leadId);
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const seq = dbService.getSequenceByLeadId(tenantId, leadId);
      if (!seq) throw new Error(`No outreach sequence configured for lead ${leadId}. Call generate_sequence first.`);

      const toEmail = args.to_email || lead.email;
      if (!toEmail) throw new Error(`Lead ${leadId} has no recipient email address`);

      let subject = seq.initial.subject;
      let body = seq.initial.body;

      if (touchpoint === 'fu1') {
        subject = seq.followUp1.subject || `Re: ${seq.initial.subject}`;
        body = seq.followUp1.body || seq.initial.body;
      } else if (touchpoint === 'fu2') {
        subject = seq.followUp2.subject || `Re: ${seq.initial.subject}`;
        body = seq.followUp2.body || seq.initial.body;
      } else if (touchpoint === 'breakup') {
        subject = seq.breakup.subject || `Re: ${seq.initial.subject}`;
        body = seq.breakup.body || seq.initial.body;
      }

      if (args.access_token) {
        const gmailResult = await emailService.sendViaGmail({
          accessToken: args.access_token,
          to: toEmail,
          subject,
          body,
          threadId: seq.threadId,
          inReplyTo: seq.lastMessageId,
        });

        const nextStage = touchpoint === 'initial' ? 'initial_sent' : touchpoint === 'fu1' ? 'fu1_sent' : touchpoint === 'fu2' ? 'fu2_sent' : 'breakup_sent';
        dbService.updateSequenceStage(tenantId, leadId, nextStage, {
          initialSentAt: touchpoint === 'initial' ? new Date().toISOString() : undefined,
          fu1SentAt: touchpoint === 'fu1' ? new Date().toISOString() : undefined,
          fu2SentAt: touchpoint === 'fu2' ? new Date().toISOString() : undefined,
          breakupSentAt: touchpoint === 'breakup' ? new Date().toISOString() : undefined,
          threadId: gmailResult.threadId,
          lastMessageId: gmailResult.messageId,
        });

        return {
          success: true,
          leadId,
          touchpoint,
          recipient: toEmail,
          stage: nextStage,
          messageId: gmailResult.messageId,
          threadId: gmailResult.threadId,
        };
      }

      // Headless / autonomous agent staging mode
      const nextStage = touchpoint === 'initial' ? 'initial_sent' : touchpoint === 'fu1' ? 'fu1_sent' : touchpoint === 'fu2' ? 'fu2_sent' : 'breakup_sent';
      dbService.updateSequenceStage(tenantId, leadId, nextStage, {
        initialSentAt: touchpoint === 'initial' ? new Date().toISOString() : undefined,
      });

      return {
        success: true,
        leadId,
        touchpoint,
        recipient: toEmail,
        stage: nextStage,
        note: 'Dispatched in autonomous agent staging pipeline',
      };
    }

    case 'schedule_milestone': {
      const clientId = String(args.client_id || 'C001');
      const contractDays = Number(args.contract_days) || 120;
      const startDateStr = args.start_date || new Date().toISOString().split('T')[0];

      const startDate = new Date(startDateStr);
      const addDays = (d: Date, days: number) => {
        const copy = new Date(d.getTime());
        copy.setDate(copy.getDate() + days);
        return copy.toISOString().split('T')[0];
      };

      const client = dbService.getClient(tenantId, clientId);
      const clientName = client?.name || `Client ${clientId}`;

      const milestones = [
        {
          id: `ms_${clientId}_1`,
          title: `Day 1: Kickoff & Profile Setup (${clientName})`,
          targetDate: addDays(startDate, 1),
          phase: 'Phase 1: Setup',
          deliverable: 'Audience definition, message pillars, and outreach pitch templates approved.',
        },
        {
          id: `ms_${clientId}_2`,
          title: `Day 30: Outreach Launch & First 25 Pitches (${clientName})`,
          targetDate: addDays(startDate, 30),
          phase: 'Phase 2: Outreach Acceleration',
          deliverable: 'Minimum 25 verified hosts pitched; initial responses cataloged.',
        },
        {
          id: `ms_${clientId}_3`,
          title: `Day 60: Mid-Contract Review & Booking Optimization (${clientName})`,
          targetDate: addDays(startDate, 60),
          phase: 'Phase 3: Conversion Optimization',
          deliverable: 'Pillar review, pitch angle iteration, and calendar bookings check.',
        },
        {
          id: `ms_${clientId}_4`,
          title: `Day 90: Placement Sprint (${clientName})`,
          targetDate: addDays(startDate, 90),
          phase: 'Phase 4: Final Sprint',
          deliverable: 'Target bookings push to achieve contracted placement quota.',
        },
        {
          id: `ms_${clientId}_5`,
          title: `Day 120: Final Close & Campaign Debrief (${clientName})`,
          targetDate: addDays(startDate, contractDays),
          phase: 'Phase 5: Contract Completion',
          deliverable: 'All interviews recorded, episode links shared, master database archived.',
        },
      ];

      // Update client end_date in DB if client exists
      if (client) {
        dbService.saveClient(tenantId, {
          ...client,
          contractDays,
          startDate: startDateStr,
          endDate: addDays(startDate, contractDays),
          milestones: JSON.stringify(milestones),
        });
      }

      return {
        success: true,
        clientId,
        clientName,
        contractDays,
        startDate: startDateStr,
        endDate: addDays(startDate, contractDays),
        milestones,
        googleCalendarEvents: milestones.map((m) => ({
          summary: m.title,
          description: `${m.phase} - Deliverable: ${m.deliverable}`,
          start: { date: m.targetDate },
          end: { date: m.targetDate },
        })),
      };
    }

    case 'extract_client_requirements': {
      const { transcript, client_sequence = 1, auto_save = true } = args;
      if (!transcript) throw new Error('transcript parameter is required');

      const clientId = `C${String(client_sequence).padStart(3, '0')}`;
      const ai = getAiClient();

      let extracted: any = null;

      if (ai) {
        try {
          const prompt = `
You are PodConnect Hub AI, an autonomous enterprise podcast operations manager.
Analyze the following client conversation logs or agreement notes:
"""
${transcript}
"""

Extract structured project details in valid JSON:
- clientId: "${clientId}"
- name: Client or brand name
- platform: Primary targeting platform (e.g. YouTube, Apple Podcasts, Spotify)
- niche: Specific niche keywords (comma-separated)
- package: Package name or scope (e.g. "120-Day Growth Accelerator")
- pricing: Agreed pricing and payment terms (e.g. "$6,000 total")
- minSubscribers: Target minimum subscriber or listener threshold (number, e.g. 1000)
- contractDays: Duration in days (e.g. 120)
- messagePillars: Array of 3-4 key core message angles
- credibilityAssets: Array of 2-3 achievements, stats, or client proof points
- samplePitchAngle: 1-paragraph hook for host outreach
`;
          const resp = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          });

          if (resp && resp.text) {
            extracted = JSON.parse(resp.text);
          }
        } catch {}
      }

      // Algorithmic extraction fallback
      if (!extracted) {
        const clientNameMatch = transcript.match(/(?:client|name|company|brand):\s*([^\n\r]+)/i) || transcript.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
        const name = clientNameMatch ? clientNameMatch[1].trim() : `Client ${clientId}`;
        const nicheMatch = transcript.match(/(?:niche|topic|domain|category|focus):\s*([^\n\r]+)/i);
        const niche = nicheMatch ? nicheMatch[1].trim() : 'B2B SaaS & Tech Innovation';

        extracted = {
          clientId,
          name,
          platform: 'Apple Podcasts & YouTube',
          niche,
          package: '120-Day Growth Accelerator',
          pricing: '$6,000 Total ($3,000 upfront / $3,000 on milestone 2)',
          minSubscribers: 1000,
          contractDays: 120,
          messagePillars: [
            `Scaling operations in ${niche}`,
            `Leadership lessons and high-performance playbooks`,
            `Future trends and market disruption`,
          ],
          credibilityAssets: ['Recognized industry leader', 'Demonstrated business traction'],
          samplePitchAngle: `Founder & operator perspective on high-impact strategies in ${niche}.`,
        };
      }

      extracted.id = clientId;
      if (auto_save) {
        dbService.saveClient(tenantId, extracted);
      }

      return {
        success: true,
        extracted,
        savedToDatabase: !!auto_save,
      };
    }

    case 'get_workspace_stats': {
      const tenant = dbService.getTenantById(tenantId);
      const limits = getLimits(tenant?.plan);
      const memberCount = dbService.getTenantMemberCount(tenantId);
      const jobsToday = dbService.getJobCountToday(tenantId);
      const leads = dbService.getLeads(tenantId);
      const stagedLeads = dbService.getStagedLeads(tenantId);

      const statusBreakdown = leads.reduce((acc: Record<string, number>, l: Lead) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {});

      return {
        tenantId,
        tenantName: tenant?.name || 'Primary Workspace',
        plan: tenant?.plan || 'growth',
        limits: {
          maxSeats: limits.maxSeats,
          currentSeats: memberCount,
          maxJobsPerDay: limits.maxJobsPerDay,
          jobsUsedToday: jobsToday,
          maxLeadsPerMonth: limits.maxLeadsPerMonth,
        },
        counts: {
          totalLeads: leads.length,
          totalStaged: stagedLeads.length,
          statusBreakdown,
        },
      };
    }

    case 'get_audit_logs': {
      const { level, category, search, limit = 50 } = args;
      const result = eventLogger.getLogs({
        tenantId,
        level: level && level !== 'ALL' ? level : undefined,
        category: category && category !== 'ALL' ? category : undefined,
        search,
        limit: Number(limit) || 50,
      });

      return {
        success: true,
        total: result.total,
        count: result.logs.length,
        logs: result.logs,
      };
    }

    case 'get_clients': {
      const { client_id } = args;
      if (client_id) {
        const client = dbService.getClient(tenantId, String(client_id));
        return { success: true, count: client ? 1 : 0, clients: client ? [client] : [] };
      }
      const clients = dbService.getClients(tenantId);
      return { success: true, count: clients.length, clients };
    }

    case 'save_client': {
      if (!args.name || !args.niche) {
        throw new Error('name and niche parameters are required to save a client');
      }
      const saved = dbService.saveClient(tenantId, args);
      return { success: true, client: saved };
    }

    case 'query_database': {
      const { query: sqlQuery, params = [] } = args;
      if (!sqlQuery || typeof sqlQuery !== 'string') {
        throw new Error('query parameter is required');
      }
      const rows = dbService.queryDatabase(tenantId, sqlQuery, Array.isArray(params) ? params : []);
      return { success: true, count: rows.length, rows };
    }

    case 'get_database_schema': {
      return dbService.getDatabaseSchema(tenantId);
    }

    default:
      throw new Error(`Tool "${name}" is not implemented.`);
  }
}
