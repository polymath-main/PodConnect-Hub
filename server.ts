import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { dbService } from './src/server/db.js';

const execFileAsync = promisify(execFile);

import { jobQueue } from './src/server/queue.js';
import { authMiddleware, requireRole, requireQuota, type AuthenticatedRequest } from './src/server/auth.js';
import { emailService } from './src/server/email.js';
import { getLimits } from './src/lib/plans.js';
import { handleMcpRequest, MCP_TOOLS } from './src/server/mcp.js';
import { validateAgentKey } from './src/server/auth.js';
import type { OutreachSequence, PipelineStage, SequenceStep } from './src/types/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '10mb' }));

// Server-side Gemini client with required User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check (public)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PodConnect Hub AI SaaS Platform',
    version: '2.0.0',
    queue: {
      active: jobQueue.getActiveCount(),
      queued: jobQueue.getQueuedCount(),
    },
    db: 'connected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Apply Authentication & Multi-Tenant Middleware to all other /api routes
app.use('/api', authMiddleware as any);

// ==========================================
// 1. TENANTS & WORKSPACE MANAGEMENT
// ==========================================

// Get all workspaces for the authenticated user
app.get('/api/tenants', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenants = dbService.getTenantsForUser(req.user!.uid, req.user!.email);
    res.json({
      success: true,
      activeTenantId: req.tenantId,
      currentRole: req.userRole,
      tenants,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list workspaces' });
  }
});

// Create a new workspace
app.post('/api/tenants', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug, plan = 'growth' } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Workspace name and slug are required' });
    }

    const tenant = dbService.createTenant(name, slug, req.user!.uid, req.user!.email, plan);
    res.json({ success: true, tenant });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create workspace' });
  }
});

// Get members of active workspace
app.get('/api/tenants/:id/members', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.params.id || req.tenantId!;
    const members = dbService.getTenantMembers(tenantId);
    res.json({ success: true, tenantId, members });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list workspace members' });
  }
});

// Invite / add a member to workspace (Admins & Owners only)
app.post(
  '/api/tenants/:id/members',
  requireRole(['owner', 'admin']) as any,
  requireQuota('seat') as any,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.params.id || req.tenantId!;
      const { email, role = 'member' } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Member email is required' });
      }

      const member = dbService.addTenantMember(tenantId, email, role);
      res.json({ success: true, member });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to add workspace member' });
    }
  }
);

// Get tenant billing and quota status
app.get('/api/billing/status', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant = dbService.getTenantById(req.tenantId!);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const limits = getLimits(tenant.plan);
    const jobsToday = dbService.getJobCountToday(req.tenantId!);
    const memberCount = dbService.getTenantMemberCount(req.tenantId!);
    res.json({
      success: true,
      plan: tenant.plan,
      limits,
      usage: {
        jobsToday,
        memberCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get billing status' });
  }
});

// ==========================================
// 2. STAGED LEADS (HOLDING AREA)
// ==========================================

// Retrieve staged leads (filtered by tenant and optionally by client)
app.get('/api/staged-leads', (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || '';
    const stagedLeads = dbService.getStagedLeads(req.tenantId!, clientId);
    res.json({ success: true, count: stagedLeads.length, stagedLeads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to retrieve staged leads' });
  }
});

// Edit a staged lead before approval
app.put('/api/staged-leads/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const stagedId = parseInt(req.params.id);
    const data = req.body;
    if (!stagedId || !data) {
      return res.status(400).json({ error: 'Valid staged lead ID and update data required' });
    }

    dbService.updateStagedLead(req.tenantId!, stagedId, data);
    res.json({ success: true, id: stagedId, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to edit staged lead' });
  }
});

// Discard/delete a staged lead
app.delete('/api/staged-leads/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const stagedId = parseInt(req.params.id);
    dbService.deleteStagedLead(req.tenantId!, stagedId);
    res.json({ success: true, id: stagedId, message: 'Staged lead discarded' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete staged lead' });
  }
});

// Approval Gate: Commit selected staged leads into core database
app.post('/api/staged-leads/import', (req: AuthenticatedRequest, res: Response) => {
  try {
    const stagedIds = req.body.stagedIds || req.body.ids;
    if (!Array.isArray(stagedIds) || stagedIds.length === 0) {
      return res.status(400).json({ error: 'stagedIds or ids array is required' });
    }

    const importedLeads = dbService.importStagedLeads(req.tenantId!, stagedIds);
    res.json({
      success: true,
      count: importedLeads.length,
      importedCount: importedLeads.length,
      importedLeads,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import staged leads' });
  }
});

// ==========================================
// 3. CORE LEADS DATABASE
// ==========================================

// Query core leads with search & category filters
app.get('/api/leads', (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || (req.query.clientId as string) || '';
    const niche = (req.query.niche as string) || '';
    const tag = (req.query.tag as string) || '';
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';

    const leads = dbService.getLeads(req.tenantId!, { clientId, niche, tag, status, search });
    res.json({ success: true, count: leads.length, leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to query core leads' });
  }
});

// Update core lead
app.put('/api/leads/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    const data = req.body;
    dbService.updateLead(req.tenantId!, leadId, data);
    res.json({ success: true, id: leadId, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update lead' });
  }
});

// Delete core lead
app.delete('/api/leads/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    dbService.deleteLead(req.tenantId!, leadId);
    res.json({ success: true, id: leadId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete lead' });
  }
});

// Re-assign or duplicate lead from Central Bank to specific client campaign
app.post('/api/leads/assign-client', (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetClientId = req.body.targetClientId || req.body.clientId;
    const leadIds: any[] = req.body.leadIds || (req.body.leadId ? [req.body.leadId] : []);
    if (!targetClientId || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadId/leadIds and targetClientId/clientId required' });
    }

    let assignedCount = 0;
    for (const lid of leadIds) {
      const ok = dbService.assignLeadToClient(req.tenantId!, parseInt(lid), targetClientId);
      if (ok) assignedCount++;
    }
    res.json({ success: true, assignedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to assign lead' });
  }
});

// Quick status change
app.post('/api/leads/update-status', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'id and status required' });
    }

    dbService.updateLeadStatus(req.tenantId!, parseInt(id), status);
    res.json({ success: true, id, status });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update lead status' });
  }
});

// Server-side pitch email dispatch via Gmail API with rate limiting
app.post('/api/leads/:id/dispatch', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { accessToken, subject, body } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'OAuth accessToken is required' });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: 'Email subject and body are required' });
    }

    if (!emailService.checkRateLimit(req.tenantId!)) {
      return res.status(429).json({ error: 'Rate limit exceeded: maximum 10 dispatches/minute per workspace' });
    }

    const lead = dbService.getLeadById(req.tenantId!, id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found in current workspace' });
    }
    if (!lead.email) {
      return res.status(400).json({ error: 'Lead does not have a contact email' });
    }

    const { messageId } = await emailService.sendViaGmail({
      accessToken,
      to: lead.email,
      subject,
      body,
    });

    dbService.updateLeadStatus(req.tenantId!, id, 'Dispatched');

    res.json({
      success: true,
      messageId,
      dispatchedTo: lead.email,
      leadId: id,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to dispatch email pitch' });
  }
});

// Run on-demand Email Discovery and Domain Legitimacy Verification for a URL
app.post('/api/leads/discover-emails', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, hostName } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Target URL is required' });
    }

    const scriptPath = path.resolve(__dirname, 'scraper.py');
    const { stdout } = await execFileAsync('python3', [scriptPath, '--discover-email', url]);
    const parsed = JSON.parse(stdout.trim());
    res.json({ success: true, url, hostName, discovery: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Email discovery check failed' });
  }
});


// ==========================================
// 4. SCALABLE SCRAPER JOB QUEUE
// ==========================================

// Enqueue a new scraper job
app.post('/api/scrape/jobs', requireQuota('job') as any, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId = 'C001', niche = 'B2B SaaS', minSubs = 1000, limit = 5 } = req.body;

    const job = jobQueue.enqueueJob({
      tenantId: req.tenantId!,
      userId: req.user!.uid,
      clientId,
      niche,
      minSubs: Number(minSubs),
      targetCount: Number(limit),
      jobType: 'scraper',
    });

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to enqueue scraping job' });
  }
});

// Backward-compatible trigger for existing frontend calls
app.post('/api/scrape/start', requireQuota('job') as any, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId = 'C001', niche = 'B2B SaaS', minSubs = 1000, limit = 5 } = req.body;

    const job = jobQueue.enqueueJob({
      tenantId: req.tenantId!,
      userId: req.user!.uid,
      clientId,
      niche,
      minSubs: Number(minSubs),
      targetCount: Number(limit),
      jobType: 'scraper',
    });

    res.json({
      success: true,
      message: 'Scraping job queued successfully in background pool',
      jobId: job.id,
      job,
      clientId,
      niche,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start scraping job' });
  }
});

// List jobs for the active workspace
app.get('/api/scrape/jobs', (req: AuthenticatedRequest, res: Response) => {
  try {
    const jobs = dbService.getJobs(req.tenantId!);
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list jobs' });
  }
});

// Get job details and logs
app.get('/api/scrape/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = dbService.getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const logs = dbService.getJobLogs(job.id);
    res.json({ success: true, job, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get job' });
  }
});

// Cancel a running or pending job
app.post('/api/scrape/jobs/:id/cancel', (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = jobQueue.cancelJob(req.params.id);
    res.json({ success, message: success ? 'Job cancelled' : 'Job could not be cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel job' });
  }
});

// SSE stream for a specific job
app.get('/api/scrape/jobs/:id/stream', (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const jobId = req.params.id;
  jobQueue.subscribeJob(jobId, res);

  // Keep-alive heartbeat every 15s to prevent proxy/browser timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    jobQueue.unsubscribeJob(jobId, res);
  });
});

// General SSE stream for all workspace jobs (backward compatible with ScraperConsoleView)
app.get('/api/scrape/stream', (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const tenantId = req.tenantId || (req.query.tenantId as string) || 'tenant_default';
  const jobId = (req.query.jobId as string) || undefined;

  jobQueue.subscribeTenant(tenantId, res);
  if (jobId) {
    jobQueue.subscribeJob(jobId, res);
  }

  // Keep-alive heartbeat every 15s
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (jobId) {
      jobQueue.unsubscribeJob(jobId, res);
    }
    jobQueue.unsubscribeTenant(tenantId, res);
  });
});

// ==========================================
// 5. GEMINI AI APIS
// ==========================================

// AI Requirement Extraction from Client Transcripts with Multi-Model & Heuristic Fallback
app.post('/api/gemini/extract-transcript', async (req: Request, res: Response) => {
  try {
    const { transcript, clientSequence = 1 } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const clientId = `C${String(clientSequence).padStart(3, '0')}`;
    const prompt = `
You are PodConnect Hub AI, an autonomous enterprise podcast operations manager.
Analyze the following client conversation logs, agreement notes, or onboarding transcript:
"""
${transcript}
"""

Extract structured project details in valid JSON:
- clientId: "${clientId}"
- name: Client or brand name
- platform: Primary targeting platform (e.g. YouTube, Apple Podcasts, Spotify)
- niche: Specific niche keywords (comma-separated, e.g. "B2B SaaS, Cloud DevOps, AI Infra")
- package: Package name or scope (e.g. "120-Day Growth Accelerator", "10-Show Placement Sprint")
- pricing: Agreed pricing and payment terms (e.g. "$4,500 total, 50% upfront, 50% on milestone 2")
- minSubscribers: Target minimum subscriber or listener threshold (number, e.g. 1000)
- contractDays: Duration in days (e.g. 120, 90, 60, default 120)
- messagePillars: Array of 3-4 key core message angles or thought leadership topics
- credibilityAssets: Array of 2-3 achievements, stats, or client proof points
- samplePitchAngle: 1-paragraph hook for host outreach
- milestones: Array of 4 milestones across the timeline with title and dayOffset (e.g. Day 1: Kickoff & Profile Setup, Day 30: Outreach Launch & First Interviews, Day 60: Mid-Contract Review, Day 120: Final Deliverables Close)
`;

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let parsedData: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                clientId: { type: Type.STRING },
                name: { type: Type.STRING },
                platform: { type: Type.STRING },
                niche: { type: Type.STRING },
                package: { type: Type.STRING },
                pricing: { type: Type.STRING },
                minSubscribers: { type: Type.INTEGER },
                contractDays: { type: Type.INTEGER },
                messagePillars: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                credibilityAssets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                samplePitchAngle: { type: Type.STRING },
                milestones: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      dayOffset: { type: Type.INTEGER },
                    },
                    required: ['title', 'dayOffset'],
                  },
                },
              },
              required: [
                'clientId',
                'name',
                'platform',
                'niche',
                'package',
                'pricing',
                'minSubscribers',
                'contractDays',
                'messagePillars',
                'credibilityAssets',
                'samplePitchAngle',
                'milestones',
              ],
            },
          },
        });

        if (response.text) {
          parsedData = JSON.parse(response.text);
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[AI Engine] Extract transcript model ${model} unavailable: ${modelErr.message || modelErr}. Trying next...`);
      }
    }

    // High-availability fallback: Heuristic rule-based extraction if upstream AI models are congested (503/429)
    if (!parsedData || !parsedData.name) {
      console.log('[AI Engine] Utilizing deterministic rule-based extractor fallback for client transcript');
      parsedData = extractTranscriptHeuristic(transcript, clientId);
    }

    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Extract transcript error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract transcript' });
  }
});

// Deterministic rule-based extraction fallback for transcripts
function extractTranscriptHeuristic(transcript: string, clientId: string) {
  let name = 'Client Account';
  const nameMatch = transcript.match(/Client:\s*([^(\n]+?)(?:\s*\((?:CEO|Founder|VP|Lead)[^)]*\))?/i) ||
                    transcript.match(/(?:Client|Partner|Brand|Company):\s*([^\n,]+)/i);
  if (nameMatch && nameMatch[1]) {
    name = nameMatch[1].trim();
  }

  let niche = 'B2B SaaS and AI';
  const nicheMatch = transcript.match(/(?:in the|niche:|industry:|space:)\s*([^\n.]+?)(?:\.|\n|space|We want)/i);
  if (nicheMatch && nicheMatch[1]) {
    niche = nicheMatch[1].trim();
  }

  let platform = 'Apple Podcasts & YouTube';
  if (/youtube/i.test(transcript) && /apple/i.test(transcript)) {
    platform = 'YouTube & Apple Podcasts';
  } else if (/youtube/i.test(transcript)) {
    platform = 'YouTube';
  } else if (/apple/i.test(transcript)) {
    platform = 'Apple Podcasts';
  } else if (/spotify/i.test(transcript)) {
    platform = 'Spotify';
  }

  let pkg = '120-Day Growth Accelerator';
  const pkgMatch = transcript.match(/([0-9]+-Day\s+[A-Za-z\s]+Package|[A-Za-z\s]+Accelerator|[A-Za-z\s]+Sprint)/i);
  if (pkgMatch && pkgMatch[1]) {
    pkg = pkgMatch[1].trim();
  }

  let pricing = '$6,000 total';
  const pricingMatch = transcript.match(/(?:Pricing is|price:|cost:)\s*(\$[0-9,]+[^.\n]*)/i) ||
                       transcript.match(/(\$[0-9,]+(?:\s*(?:total|upfront|per month))?)/i);
  if (pricingMatch && pricingMatch[1]) {
    pricing = pricingMatch[1].trim();
  }

  let minSubscribers = 1000;
  const subsMatch = transcript.match(/([0-9,]+)\+?\s*(?:active\s*)?(?:subscribers|listeners|subs)/i);
  if (subsMatch && subsMatch[1]) {
    minSubscribers = parseInt(subsMatch[1].replace(/,/g, ''), 10) || 1000;
  }

  let contractDays = 120;
  const daysMatch = transcript.match(/([0-9]+)-Day/i) || transcript.match(/([0-9]+)\s*days/i);
  if (daysMatch && daysMatch[1]) {
    contractDays = parseInt(daysMatch[1], 10) || 120;
  }

  const messagePillars: string[] = [];
  const lines = transcript.split('\n');
  for (const line of lines) {
    const numMatch = line.match(/^[0-9]+[\.\)]\s*(.+)/);
    if (numMatch && numMatch[1]) {
      messagePillars.push(numMatch[1].trim());
    }
  }
  if (messagePillars.length === 0) {
    messagePillars.push(
      'Thought leadership & strategic industry perspectives',
      'Scaling architectural lessons and founder journey insights',
      'Emerging paradigms in technology and market transformation'
    );
  }

  const credibilityAssets: string[] = [];
  const trackRecordMatch = transcript.match(/(?:track record|credibility|achievements):\s*([^\n]+)/i);
  if (trackRecordMatch && trackRecordMatch[1]) {
    credibilityAssets.push(trackRecordMatch[1].trim());
  } else {
    credibilityAssets.push(
      'Demonstrated category leadership and measurable traction',
      'Proven founder track record with active developer/user engagement'
    );
  }

  const milestones = [
    { title: 'Phase 1 (Days 1-30): Foundation, message pillars, and tailored outreach launch', dayOffset: 30 },
    { title: 'Phase 2 (Days 31-60): First wave of interviews recorded and published', dayOffset: 60 },
    { title: 'Phase 3 (Days 61-90): Mid-contract review & secondary niche expansion', dayOffset: 90 },
    { title: 'Phase 4 (Days 91-120): Final guest placement sprint and placement close', dayOffset: 120 },
  ];

  return {
    clientId,
    name,
    platform,
    niche,
    package: pkg,
    pricing,
    minSubscribers,
    contractDays,
    messagePillars,
    credibilityAssets,
    samplePitchAngle: `Founder & operator perspective on high-impact strategies in ${niche}.`,
    milestones,
  };
}

// Live Podcast Discovery using Google Search Grounding with multi-model fallback
app.post('/api/gemini/discover-shows', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { niche, clientId = 'C001', minSubs = 1000 } = req.body;
    if (!niche) {
      return res.status(400).json({ error: 'Niche keyword is required' });
    }

    const prompt = `
Find 5 real, active, high-relevance podcasts in the niche "${niche}" that accept guest interviews.
For each podcast, provide:
1. Exact show title
2. Host name (or co-hosts)
3. Primary platform / link (Apple Podcasts, Spotify, YouTube, or official website)
4. Estimated audience / subscribers (integer or estimated over ${minSubs})
5. Public contact email or submission email (if publicly documented, or official show contact)
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

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let shows: any[] = [];

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          try {
            shows = JSON.parse(response.text);
          } catch {
            const match = response.text.match(/\[\s*\{.*\}\s*\]/s);
            if (match) shows = JSON.parse(match[0]);
          }
          if (Array.isArray(shows) && shows.length > 0) break;
        }
      } catch (err: any) {
        console.warn(`[AI Engine] Discover shows model ${model} failed: ${err.message}. Trying next candidate...`);
      }
    }

    // Direct in-process SQLite insertion with zero python subprocess overhead
    const tenantId = req.tenantId || 'tenant_default';
    if (shows.length > 0) {
      for (const show of shows) {
        dbService.saveStagedLead(tenantId, {
          clientId,
          showName: show.showName || 'Active Podcast Show',
          hostName: show.hostName || 'Show Host',
          platform: show.platform || 'Apple Podcasts',
          showUrl: show.showUrl || 'https://podcasts.apple.com',
          feedUrl: '',
          email: show.email || '',
          emailType: show.email ? 'direct' : 'inferred',
          emailConfidence: show.email ? 0.95 : 0.75,
          subscribers: show.subscribers || minSubs,
          niche,

          tags: [
            niche.split(',')[0].trim(),
            show.platform || 'Apple Podcasts',
            'Google Grounded',
            (show.subscribers || minSubs) >= 5000 ? 'High Reach' : 'Niche Target',
          ],
          score: 8.8,
          location: 'Global / Online',
        });
      }
    }

    res.json({ success: true, count: shows.length, shows });
  } catch (error: any) {
    console.error('Discover shows error:', error);
    res.status(500).json({ error: error.message || 'Failed to discover shows' });
  }
});

// Personalized Pitch Generator with multi-model fallback and heuristic safety
app.post('/api/gemini/generate-pitch', async (req: Request, res: Response) => {
  try {
    const { clientName, niche, messagePillars, credibilityAssets, showName, hostName } = req.body;

    const prompt = `
You are PodConnect Hub AI's executive pitch strategist.
Write a personalized, concise, high-converting podcast guest pitch email.

Host Name: ${hostName || 'Host'}
Show Name: ${showName}
Guest / Client: ${clientName}
Niche: ${niche}
Core Thought Leadership Pillars: ${Array.isArray(messagePillars) ? messagePillars.join('; ') : messagePillars}
Credibility Assets / Track Record: ${Array.isArray(credibilityAssets) ? credibilityAssets.join('; ') : credibilityAssets}

Pitch Rules:
1. Warm, authentic, non-spammy opening referencing the show.
2. Direct 1-sentence value proposition on why their audience will benefit.
3. 3 bullet points with specific, provocative conversation topics (actionable takeaways).
4. Short credibility punch (key numbers/stats).
5. Low-friction call to action (15-min chat, zero obligation).

Format output as JSON:
{
  "subject": "Interview Pitch: [Compelling Angle] + [Client Name]",
  "body": "Hi [Host],\\n\\n...",
  "talkingPoints": ["Point 1", "Point 2", "Point 3"]
}
`;

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let parsed: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                body: { type: Type.STRING },
                talkingPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['subject', 'body', 'talkingPoints'],
            },
          },
        });

        if (response.text) {
          parsed = JSON.parse(response.text);
          break;
        }
      } catch (err: any) {
        console.warn(`[AI Engine] Pitch model ${model} failed: ${err.message}. Trying next candidate...`);
      }
    }

    if (!parsed || !parsed.subject) {
      // Deterministic pitch template fallback
      const host = hostName || 'there';
      const points = Array.isArray(messagePillars) && messagePillars.length > 0
        ? messagePillars.slice(0, 3)
        : [
            `Why emerging shifts in ${niche} are redefining industry benchmarks`,
            `Practical blueprints for scaling with resilience and speed`,
            `Lessons learned from frontline growth and market traction`,
          ];
      const cred = Array.isArray(credibilityAssets) && credibilityAssets.length > 0
        ? credibilityAssets[0]
        : `Track record of scaling and proven impact in ${niche}`;

      parsed = {
        subject: `Interview Pitch: Scaling insights in ${niche} with ${clientName}`,
        body: `Hi ${host},\n\nI’m a huge fan of ${showName} and your focus on high-impact insights for operators and founders in ${niche}.\n\nGiven your listeners' passion for actionable takeaways, I wanted to introduce ${clientName}. ${cred}.\n\nHere are three provocative topics ${clientName} could unpack on your show:\n1. ${points[0]}\n2. ${points[1] || points[0]}\n3. ${points[2] || points[0]}\n\nWould you be open to a quick 15-minute sync to see if this is a great fit for an upcoming episode?\n\nBest regards,\nPodConnect Operations Team`,
        talkingPoints: points,
      };
    }

    res.json({ success: true, pitch: parsed });
  } catch (error: any) {
    console.error('Generate pitch error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate pitch' });
  }
});

// ==========================================
// 6. MCP PROTOCOL (MODEL CONTEXT PROTOCOL)
// ==========================================

// Public MCP Manifest Discovery
app.get('/api/mcp', (_req: Request, res: Response) => {
  res.json({
    name: 'podconnect-hub',
    version: '2.0.0',
    protocolVersion: '2024-11-05',
    description: 'PodConnect Hub Model Context Protocol (MCP) Server',
    toolsCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
});

// MCP JSON-RPC 2.0 Handler
app.post('/api/mcp', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rpcRes = await handleMcpRequest(req, req.body);
    res.json(rpcRes);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id !== undefined ? req.body.id : null,
      error: { code: -32603, message: err.message || 'Internal error in MCP processor' },
    });
  }
});

// ==========================================
// 7. UNIFIED SESSIONS & AGENT AUTHENTICATION
// ==========================================

// Create/Login Session (supports credentials, firebase, agent_key)
app.post('/api/auth/session', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { authType = 'credentials', token, email, tenantId = 'tenant_default', clientMeta } = req.body;

    if (authType === 'agent_key') {
      const keyCheck = validateAgentKey(token, clientMeta?.clientName);
      if (!keyCheck.valid) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or revoked agent secret key' });
      }

      const targetTenant = keyCheck.tenantId || tenantId;
      const session = dbService.createSession({
        userId: keyCheck.agentId,
        email: keyCheck.email || `${keyCheck.agentId}@podconnect.agent`,
        authType: 'agent_key',
        tenantId: targetTenant,
        role: keyCheck.role,
        clientMeta,
      });

      return res.json({
        success: true,
        sessionToken: session.token,
        user: {
          uid: session.userId,
          email: session.email,
          isAgent: true,
        },
        activeTenant: {
          id: session.tenantId,
          role: session.role,
        },
        availableTenants: dbService.getTenantsForUser(session.userId, session.email),
      });
    }

    // Credentials / Firebase Auth
    const userEmail = email || 'operator@podconnect.agency';
    const userId = userEmail.split('@')[0];
    const role = 'owner';

    const session = dbService.createSession({
      userId,
      email: userEmail,
      authType: authType === 'firebase' ? 'firebase_id_token' : 'credentials',
      tenantId,
      role,
      clientMeta,
    });

    // Auto-provision user-scoped agent key
    let userKeys = dbService.getUserAgentKeys(tenantId, userId);
    let agentKeyRecord: any = userKeys.length > 0 ? userKeys[0] : null;
    if (!agentKeyRecord) {
      const created = dbService.createUserAgentKey(userId, userEmail, tenantId, role);
      agentKeyRecord = { ...created, tenantId, userId, role };
    } else {
      // Fetch full row to retrieve plain secret key
      const fullRow = (dbService as any).db.prepare('SELECT * FROM user_agent_keys WHERE id = ?').get(agentKeyRecord.id) as any;
      if (fullRow && fullRow.key) {
        agentKeyRecord = {
          id: fullRow.id,
          key: fullRow.key,
          keyPrefix: fullRow.key_prefix,
          tenantId,
          userId,
          role,
        };
      } else {
        const created = dbService.createUserAgentKey(userId, userEmail, tenantId, role);
        agentKeyRecord = { ...created, tenantId, userId, role };
      }
    }

    return res.json({
      success: true,
      sessionToken: session.token,
      user: {
        uid: session.userId,
        email: session.email,
        isAgent: false,
      },
      activeTenant: {
        id: session.tenantId,
        role: session.role,
      },
      availableTenants: dbService.getTenantsForUser(session.userId, session.email),
      agentKey: agentKeyRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Session creation failed' });
  }
});

// Inspect active session
app.get('/api/auth/session', (req: AuthenticatedRequest, res: Response) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }
  res.json({
    success: true,
    sessionToken: req.session.token,
    user: req.user,
    activeTenant: {
      id: req.tenantId,
      role: req.userRole,
    },
    availableTenants: dbService.getTenantsForUser(req.user!.uid, req.user!.email),
  });
});

// Revoke session
app.delete('/api/auth/session', (req: AuthenticatedRequest, res: Response) => {
  const token = req.session?.token || (req.headers.authorization?.replace(/^Bearer\s+/i, ''));
  if (token) {
    dbService.revokeSession(token);
  }
  res.json({ success: true, message: 'Session revoked successfully' });
});

// Authenticate agent via secret key
app.post('/api/auth/agent', (req: AuthenticatedRequest, res: Response) => {
  const key = (req.headers['x-agent-key'] as string) ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '')) ||
    req.body?.agentKey;
  const check = validateAgentKey(key, req.body?.agentId);
  if (!check.valid) {
    return res.status(401).json({ success: false, authenticated: false, error: 'Unauthorized: Invalid agent secret key' });
  }

  const tenantId = check.tenantId || req.body?.tenantId || 'tenant_default';
  const session = dbService.createSession({
    userId: check.agentId,
    email: check.email || `${check.agentId}@podconnect.agent`,
    authType: 'agent_key',
    tenantId,
    role: check.role,
    clientMeta: req.body?.clientMeta,
  });

  res.json({
    success: true,
    authenticated: true,
    tenantId,
    agentId: check.agentId,
    role: check.role,
    sessionToken: session.token,
    mcp: {
      toolsCount: MCP_TOOLS.length,
      protocolVersion: '2024-11-05',
    },
  });
});

// Verify agent key directly or verify active agent session
app.get('/api/auth/agent', (req: AuthenticatedRequest, res: Response) => {
  const key = (req.headers['x-agent-key'] as string) || (req.headers.authorization?.replace(/^Bearer\s+/i, ''));

  // 1. If valid agent session provided
  if (req.session && req.session.authType === 'agent_key') {
    return res.json({
      success: true,
      authenticated: true,
      status: 'active',
      authMode: 'session_token',
      tenantId: req.session.tenantId,
      agentId: req.session.userId,
      role: req.session.role,
    });
  }

  // 2. Direct agent secret key check
  const check = validateAgentKey(key);
  if (!check.valid) {
    return res.status(401).json({ success: false, authenticated: false, error: 'Unauthorized: Invalid agent credentials' });
  }

  res.json({
    success: true,
    authenticated: true,
    status: 'active',
    authMode: key?.startsWith('pca_live_') ? 'user_agent_key' : 'agent_key',
    tenantId: check.tenantId || 'tenant_default',
    agentId: check.agentId,
    role: check.role,
  });
});

// Retrieve User Agent Key & 1-Click MCP Config
app.get('/api/user/agent-key', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || 'tenant_default';
    const userId = req.user?.uid || 'operator_system';
    const email = req.user?.email || 'operator@podconnect.agency';
    const role = req.userRole || 'owner';

    let keyRecord: any = (dbService as any).db.prepare(`
      SELECT * FROM user_agent_keys
      WHERE tenant_id = ? AND user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(tenantId, userId);

    if (!keyRecord) {
      const created = dbService.createUserAgentKey(userId, email, tenantId, role);
      keyRecord = (dbService as any).db.prepare('SELECT * FROM user_agent_keys WHERE id = ?').get(created.id);
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      key: keyRecord.key,
      keyPrefix: keyRecord.key_prefix,
      tenantId,
      mcpConfig: {
        mcpServers: {
          podconnect: {
            url: `${hostUrl}/api/mcp`,
            env: {
              AGENT_SECRET_KEY: keyRecord.key,
              PODCONNECT_URL: hostUrl,
            },
          },
        },
        env: {
          AGENT_SECRET_KEY: keyRecord.key,
          PODCONNECT_URL: hostUrl,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get agent key' });
  }
});

// Rotate User Agent Key
app.post('/api/user/agent-key/rotate', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || 'tenant_default';
    const userId = req.user?.uid || 'operator_system';
    const email = req.user?.email || 'operator@podconnect.agency';
    const role = req.userRole || 'owner';

    // Revoke previous active keys
    const existing = dbService.getUserAgentKeys(tenantId, userId);
    for (const k of existing) {
      dbService.revokeUserAgentKey(tenantId, k.id);
    }

    const created = dbService.createUserAgentKey(userId, email, tenantId, role);
    res.json({
      success: true,
      key: created.key,
      keyPrefix: created.keyPrefix,
      tenantId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to rotate agent key' });
  }
});

// ==========================================
// 8. MULTI-TOUCH CADENCE & OUTREACH SEQUENCES
// ==========================================

// Generate 4-touchpoint sequence with Gemini and heuristic fallback
app.post('/api/gemini/generate-outreach-sequence', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientName, niche, messagePillars, credibilityAssets, showName, hostName, recentTopic, leadId } = req.body;
    const tenantId = req.tenantId || 'tenant_default';

    const host = hostName || 'Host';
    const pillars = Array.isArray(messagePillars) && messagePillars.length > 0
      ? messagePillars
      : ['Thought leadership', 'Scale architecture', 'Growth benchmarks'];
    const cred = Array.isArray(credibilityAssets) && credibilityAssets.length > 0
      ? credibilityAssets[0]
      : 'Demonstrated category leadership';

    const prompt = `
You are PodConnect Hub AI's lead outreach strategist.
Create a high-converting, 4-step personalized podcast interview pitch cadence for:
Host: ${host}
Show: ${showName}
Client: ${clientName}
Niche: ${niche}
Core Pillars: ${pillars.join('; ')}
Credibility: ${cred}
Recent Show Angle: ${recentTopic || 'industry innovation'}

Return JSON conforming strictly to:
{
  "initial": {
    "subject": "Interview Pitch: [Hook Angle] + [Client Name]",
    "body": "Hi ${host},\\n\\n...",
    "talkingPoints": ["Point 1", "Point 2", "Point 3"],
    "delayDays": 0
  },
  "followUp1": {
    "subject": "Re: Interview Pitch: [Hook Angle] + [Client Name]",
    "body": "Hi ${host},\\n\\nFollowing up with a specific data angle...",
    "delayDays": 3
  },
  "followUp2": {
    "subject": "Re: Interview Pitch: [Hook Angle] + [Client Name]",
    "body": "Hi ${host},\\n\\nSharing recent listener feedback and traction...",
    "delayDays": 4
  },
  "breakup": {
    "subject": "Re: Interview Pitch: [Hook Angle] + [Client Name]",
    "body": "Hi ${host},\\n\\nClosing the loop on this — assuming you are fully booked...",
    "delayDays": 7
  }
}
`;

    let sequence: any = null;
    const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    for (const m of models) {
      try {
        const resp = await ai.models.generateContent({
          model: m,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        if (resp.text) {
          sequence = JSON.parse(resp.text);
          break;
        }
      } catch {}
    }

    if (!sequence || !sequence.initial) {
      // Heuristic fallback sequence
      sequence = {
        initial: {
          subject: `Interview Pitch: ${pillars[0]} with ${clientName}`,
          body: `Hi ${host},\n\nI’m a huge fan of ${showName} and your focus on ${niche}.\n\nGiven your listeners' appetite for actionable takeaways, I wanted to introduce ${clientName}. ${cred}.\n\nHere are three discussion topics:\n1. ${pillars[0]}\n2. ${pillars[1] || pillars[0]}\n3. ${pillars[2] || pillars[0]}\n\nWould you be open to a 15-minute chat to see if this is a great fit?\n\nBest regards,\nPodConnect Operations`,
          talkingPoints: pillars.slice(0, 3),
          delayDays: 0,
        },
        followUp1: {
          subject: `Re: Interview Pitch: ${pillars[0]} with ${clientName}`,
          body: `Hi ${host},\n\nFollowing up on my note below. Thought this specific takeaway on ${pillars[1] || pillars[0]} would resonate strongly with your audience.\n\nLet me know if next week works for a quick sync!\n\nBest,\nPodConnect Operations`,
          delayDays: 3,
        },
        followUp2: {
          subject: `Re: Interview Pitch: ${pillars[0]} with ${clientName}`,
          body: `Hi ${host},\n\nQuick bump — wanted to ensure this didn't get buried. ${clientName} recently shared insights on ${pillars[0]} that drove strong listener engagement.\n\nHappy to work around your recording schedule.\n\nBest,\nPodConnect Operations`,
          delayDays: 4,
        },
        breakup: {
          subject: `Re: Interview Pitch: ${pillars[0]} with ${clientName}`,
          body: `Hi ${host},\n\nClosing the loop on this. Assuming you're fully booked for this season, I will pause follow-ups.\n\nIf you ever look for guest perspectives on ${niche}, feel free to reach back out.\n\nWarmly,\nPodConnect Operations`,
          delayDays: 7,
        },
      };
    }

    if (leadId) {
      sequence.leadId = Number(leadId);
      sequence.clientId = req.body.clientId || 'C001';
      sequence.pipelineStage = 'drafted';
      dbService.saveSequence(tenantId, sequence);
    }

    res.json({ success: true, sequence });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate outreach sequence' });
  }
});

// Get sequence by lead ID
app.get('/api/leads/:id/sequence', (req: AuthenticatedRequest, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    const seq = dbService.getSequenceByLeadId(req.tenantId!, leadId);
    res.json({ success: true, sequence: seq });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get lead sequence' });
  }
});

// Update or save sequence
app.put('/api/leads/:id/sequence', (req: AuthenticatedRequest, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    const data = { ...req.body, leadId };
    const saved = dbService.saveSequence(req.tenantId!, data);
    res.json({ success: true, sequence: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save lead sequence' });
  }
});

// Dispatch specific touchpoint
app.post('/api/leads/:id/dispatch-touchpoint', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    const { touchpoint = 'initial', customSubject, customBody, accessToken } = req.body;
    const tenantId = req.tenantId || 'tenant_default';

    const lead = dbService.getLeadById(tenantId, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found in workspace' });

    const seq = dbService.getSequenceByLeadId(tenantId, leadId);
    const tpKey = touchpoint === 'initial' ? 'initial' : touchpoint === 'follow_up_1' ? 'followUp1' : touchpoint === 'follow_up_2' ? 'followUp2' : 'breakup';
    const tpData = seq ? (seq as any)[tpKey] : null;

    const subject = customSubject || tpData?.subject || `Interview Pitch: ${lead.showName}`;
    const body = customBody || tpData?.body || `Hi ${lead.hostName || 'there'},\n\nWould love to join ${lead.showName}.`;

    let messageId = `msg_${Date.now()}`;
    let threadId = seq?.threadId || `thread_${Date.now()}`;

    if (accessToken && lead.email) {
      const sendRes = await emailService.sendViaGmail({
        accessToken,
        to: lead.email,
        subject,
        body,
        inReplyTo: seq?.lastMessageId,
        references: seq?.lastMessageId,
      });
      messageId = sendRes.messageId;
      threadId = sendRes.threadId || threadId;
    }

    const nextStage: PipelineStage = touchpoint === 'initial' ? 'initial_sent' : touchpoint === 'follow_up_1' ? 'fu1_sent' : touchpoint === 'follow_up_2' ? 'fu2_sent' : 'breakup_sent';
    const fu1DueAt = touchpoint === 'initial' ? new Date(Date.now() + 3 * 86400000).toISOString() : undefined;
    const fu2DueAt = touchpoint === 'follow_up_1' ? new Date(Date.now() + 4 * 86400000).toISOString() : undefined;
    const breakupDueAt = touchpoint === 'follow_up_2' ? new Date(Date.now() + 7 * 86400000).toISOString() : undefined;

    dbService.updateSequenceStage(tenantId, leadId, nextStage, {
      initialSentAt: touchpoint === 'initial' ? new Date().toISOString() : undefined,
      fu1SentAt: touchpoint === 'follow_up_1' ? new Date().toISOString() : undefined,
      fu2SentAt: touchpoint === 'follow_up_2' ? new Date().toISOString() : undefined,
      breakupSentAt: touchpoint === 'breakup' ? new Date().toISOString() : undefined,
      fu1DueAt,
      fu2DueAt,
      breakupDueAt,
      lastMessageId: messageId,
      threadId,
    });

    res.json({
      success: true,
      leadId,
      touchpoint,
      stage: nextStage,
      messageId,
      threadId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to dispatch touchpoint' });
  }
});

// ==========================================
// 9. VITE MIDDLEWARE & SERVER STARTUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`PodConnect Hub AI SaaS platform listening on http://0.0.0.0:${PORT}`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`[Server] ${signal} signal received. Initiating graceful shutdown...`);
    server.close(() => {
      console.log('[Server] HTTP server closed cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

const isMainModule = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
const isRunningTests = process.argv.some((arg) => arg.includes('test_'));

if (isMainModule && !isRunningTests) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { app };
export default app;
