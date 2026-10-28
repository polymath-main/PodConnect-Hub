import { GoogleGenAI } from '@google/genai';
import { dbService } from './db.js';
import { emailService } from './email.js';
import { getLimits } from '../lib/plans.js';
import type { AuthenticatedRequest } from './auth.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  Lead,
  StagedLead,
  OutreachSequence,
  SequenceTouchpoint,
} from '../types';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'podconnect-hub';
const SERVER_VERSION = '2.0.0';

// Optional Gemini instance for AI-driven tools
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Tool definitions catalog conforming to MCP specifications
export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_leads',
    description: 'Search and filter active verified podcast leads in the current workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID (e.g., C001)' },
        status: { type: 'string', description: 'Filter by lead status (Imported, Drafted, Sent, Responded, Booked)' },
        limit: { type: 'number', description: 'Maximum leads to return (default 50)' },
      },
    },
  },
  {
    name: 'get_staged_leads',
    description: 'Fetch scraper-discovered leads waiting for human/agent review in staging.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID' },
      },
    },
  },
  {
    name: 'approve_lead',
    description: 'Approve a staged lead and promote it into the active CRM lead bank.',
    inputSchema: {
      type: 'object',
      properties: {
        staged_id: { type: 'number', description: 'Database ID of the staged lead to approve' },
      },
      required: ['staged_id'],
    },
  },
  {
    name: 'discover_shows',
    description: 'Search live podcast shows in a niche using Gemini Search Grounding and stage them for review.',
    inputSchema: {
      type: 'object',
      properties: {
        niche: { type: 'string', description: 'Target topic or domain (e.g., "AI agents", "DevOps")' },
        client_id: { type: 'string', description: 'Target client ID (default: C001)' },
        min_subs: { type: 'number', description: 'Minimum estimated audience/subscribers (default: 1000)' },
      },
      required: ['niche'],
    },
  },
  {
    name: 'generate_pitch',
    description: 'Generate a personalized, high-conversion pitch email for a specific lead.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the target lead' },
        angle: { type: 'string', description: 'Custom angle or focal topic' },
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
    description: 'Send an outreach email touchpoint for a lead and advance the cadence pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'number', description: 'Database ID of the lead' },
        touchpoint: {
          type: 'string',
          description: 'Cadence stage: initial | fu1 | fu2 | breakup',
        },
        to_email: { type: 'string', description: 'Recipient email address override' },
        access_token: { type: 'string', description: 'OAuth access token for Gmail send' },
      },
      required: ['lead_id', 'touchpoint'],
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
];

/**
 * Handle incoming Model Context Protocol JSON-RPC 2.0 requests
 */
export async function handleMcpRequest(
  req: AuthenticatedRequest,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const id = body.id !== undefined ? body.id : null;
  const method = body.method;
  const params = body.params || {};
  const tenantId = req.tenantId || 'tenant_default';

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
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION,
            },
          },
        };
      }

      case 'notifications/initialized': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: { status: 'pong', timestamp: new Date().toISOString() } };
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
        const toolName = params.name;
        const args = params.arguments || {};
        const toolResult = await executeTool(tenantId, req, toolName, args);
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
      }

      // 4. Resources Discovery
      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: `podconnect://tenants/${tenantId}`,
                name: 'Active Tenant Context',
                mimeType: 'application/json',
              },
              {
                uri: 'podconnect://schema',
                name: 'PodConnect Hub SQLite Data Schema',
                mimeType: 'text/markdown',
              },
            ],
          },
        };
      }

      case 'resources/read': {
        const uri = params.uri || '';
        if (uri.startsWith('podconnect://tenants/')) {
          const tenant = dbService.getTenantById(tenantId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(tenant, null, 2),
                },
              ],
            },
          };
        }

        if (uri === 'podconnect://schema') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'text/markdown',
                  text: 'Tables: tenants, tenant_members, staged_leads, leads, jobs, job_logs, outreach_sequences, sessions',
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

/**
 * Execute specific tool dispatch with tenant isolation
 */
async function executeTool(
  tenantId: string,
  req: AuthenticatedRequest,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'search_leads': {
      const { client_id, status, limit = 50 } = args;
      const allLeads = dbService.getLeads(tenantId, {
        clientId: client_id,
        status: status,
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
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
        },
      });

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
          niche: niche,
          score: 85,
          location: '',
        });
        if (saved) {
          stagedResults.push({ showName: show.showName, email: show.email });
        }
      }

      return {
        success: true,
        niche,
        discoveredCount: shows.length,
        stagedLeads: stagedResults,
      };
    }

    case 'generate_pitch': {
      const leadId = Number(args.lead_id);
      if (!leadId) throw new Error('lead_id is required');
      const lead = dbService.getLeadById(tenantId, leadId);
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const ai = getAiClient();
      if (!ai) {
        return {
          subject: `Guest Interview Pitch: ${lead.showName}`,
          body: `Hi ${lead.hostName || 'there'},\n\nI love your podcast ${lead.showName}. Would love to discuss a guest placement on ${lead.niche}.`,
        };
      }

      const prompt = `Write a high-converting, concise guest pitch email to ${lead.hostName || 'the host'} of "${lead.showName}". Topic: ${lead.niche}. Custom angle: ${args.angle || 'industry insights'}. Return JSON with "subject" and "body".`;
      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      let parsed = { subject: `Interview Pitch: ${lead.showName}`, body: res.text || '' };
      try {
        parsed = JSON.parse(res.text || '{}');
      } catch {
        // Fallback
      }
      return parsed;
    }

    case 'generate_sequence': {
      const leadId = Number(args.lead_id);
      if (!leadId) throw new Error('lead_id is required');
      const lead = dbService.getLeadById(tenantId, leadId);
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const clientName = args.client_name || 'Guest Expert';
      const hostName = args.host_name || lead.hostName || 'Host';
      const showName = args.show_name || lead.showName;
      const niche = args.niche || lead.niche;

      const initialSubject = `Guest Pitch: ${clientName} x ${showName}`;
      const initialBody = `Hi ${hostName},\n\nLong-time listener of ${showName}. I believe ${clientName} would be an exceptional guest on ${niche}.\n\nBest,\nOutreach Team`;
      const fu1Subject = `Re: ${initialSubject}`;
      const fu1Body = `Hi ${hostName},\n\nFollowing up on my note regarding having ${clientName} on ${showName}. Would 10 mins this week work?\n\nBest,\nOutreach Team`;
      const fu2Subject = `Quick follow-up: ${clientName} on ${showName}`;
      const fu2Body = `Hi ${hostName},\n\nWanted to ensure this didn't slip through the cracks. Attached recent interview recordings for reference.\n\nBest,\nOutreach Team`;
      const breakupSubject = `Closing the loop: ${showName}`;
      const breakupBody = `Hi ${hostName},\n\nAssuming you are fully booked for the season! If guest slots open in the future, let us know.\n\nBest,\nOutreach Team`;

      const seq: OutreachSequence = {
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
      if (!seq) throw new Error(`No outreach sequence configured for lead ${leadId}`);

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

      // Headless / agent mode without direct user Gmail OAuth token
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
        note: 'Dispatched in autonomous agent staging mode',
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

    default:
      throw new Error(`Tool "${name}" is not implemented.`);
  }
}
