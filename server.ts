import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dbService } from './src/server/db.js';
import { jobQueue } from './src/server/queue.js';
import { authMiddleware, requireRole, requireQuota, type AuthenticatedRequest } from './src/server/auth.js';
import { emailService } from './src/server/email.js';
import { getLimits } from './src/lib/plans.js';

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
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const jobId = req.params.id;
  jobQueue.subscribeJob(jobId, res);

  req.on('close', () => {
    jobQueue.unsubscribeJob(jobId, res);
  });
});

// General SSE stream for all workspace jobs (backward compatible with ScraperConsoleView)
app.get('/api/scrape/stream', (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const tenantId = req.tenantId || 'tenant_default';
  jobQueue.subscribeTenant(tenantId, res);

  req.on('close', () => {
    jobQueue.unsubscribeTenant(tenantId, res);
  });
});

// ==========================================
// 5. GEMINI AI APIS
// ==========================================

// AI Requirement Extraction from Client Transcripts
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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

    const parsedData = JSON.parse(response.text || '{}');
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Extract transcript error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract transcript' });
  }
});

// Live Podcast Discovery using Google Search Grounding with gemini-3.8-flash
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
      if (match) {
        shows = JSON.parse(match[0]);
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

// Personalized Pitch Generator using gemini-3.8-flash
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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

    const parsed = JSON.parse(response.text || '{}');
    res.json({ success: true, pitch: parsed });
  } catch (error: any) {
    console.error('Generate pitch error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate pitch' });
  }
});

// ==========================================
// 6. VITE MIDDLEWARE INTEGRATION
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
