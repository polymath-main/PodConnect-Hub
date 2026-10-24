import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

// In-memory SSE clients for real-time live terminal streaming
interface SSEClient {
  id: number;
  res: Response;
}
let sseClients: SSEClient[] = [];
let nextClientId = 1;

function broadcastLog(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(message);
    } catch {
      // Ignore write errors to dead clients
    }
  });
}

// Ensure database exists initially
function initDatabase() {
  const p = spawn('python3', [
    path.join(__dirname, 'scraper.py'),
    '--dump-json',
  ]);
  p.on('error', (err) => console.error('Python init error:', err));
}
initDatabase();

// --- API ROUTES ---

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'PodConnect Hub AI Backend' });
});

// SSE endpoint for live scraping logs
app.get('/api/scrape/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = nextClientId++;
  const newClient: SSEClient = { id: clientId, res };
  sseClients.push(newClient);

  // Initial handshake event
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Live scrape telemetry connected' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

// Retrieve leads from SQLite via python
app.get('/api/leads', (req: Request, res: Response) => {
  const clientId = (req.query.client_id as string) || '';
  const args = [path.join(__dirname, 'scraper.py'), '--dump-json'];
  if (clientId) {
    args.push('--client', clientId);
  }

  const py = spawn('python3', args);
  let output = '';
  let errorOutput = '';

  py.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  py.stderr.on('data', (chunk) => {
    errorOutput += chunk.toString();
  });

  py.on('close', (code) => {
    if (code === 0 && output) {
      try {
        const leads = JSON.parse(output.trim());
        return res.json({ success: true, leads });
      } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to parse leads output' });
      }
    }
    res.status(500).json({ success: false, error: errorOutput || 'Failed to query leads' });
  });
});

// Update lead status (e.g., Pitch Drafted, Dispatched, Booked, Passed)
app.post('/api/leads/update-status', (req: Request, res: Response) => {
  const { id, status } = req.body;
  if (!id || !status) {
    return res.status(400).json({ error: 'id and status required' });
  }

  // Python one-liner to update status in SQLite
  const code = `
import sqlite3, sys
conn = sqlite3.connect("podconnect_leads.db")
c = conn.cursor()
c.execute("UPDATE leads SET status = ? WHERE id = ?", (sys.argv[1], sys.argv[2]))
conn.commit()
print("OK")
`;

  const py = spawn('python3', ['-c', code, status, id.toString()]);
  py.on('close', (code) => {
    if (code === 0) {
      res.json({ success: true, id, status });
    } else {
      res.status(500).json({ error: 'Failed to update lead status' });
    }
  });
});

// Start scraper job
let isScrapingActive = false;
app.post('/api/scrape/start', (req: Request, res: Response) => {
  const { clientId = 'C001', niche = 'B2B SaaS', minSubs = 1000, limit = 5 } = req.body;

  if (isScrapingActive) {
    return res.status(409).json({ error: 'A scraping job is already running' });
  }

  isScrapingActive = true;
  broadcastLog({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: `[JOB START] Initiating multi-source discovery for client ${clientId} (${niche})`,
  });

  const py = spawn('python3', [
    path.join(__dirname, 'scraper.py'),
    '--client',
    clientId,
    '--niche',
    niche,
    '--min-subs',
    minSubs.toString(),
    '--limit',
    limit.toString(),
  ]);

  py.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line.trim());
        broadcastLog(parsed);
      } catch {
        broadcastLog({
          timestamp: new Date().toISOString(),
          level: 'RAW',
          message: line.trim(),
        });
      }
    }
  });

  py.stderr.on('data', (data) => {
    broadcastLog({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: data.toString().trim(),
    });
  });

  py.on('close', (code) => {
    isScrapingActive = false;
    broadcastLog({
      timestamp: new Date().toISOString(),
      level: 'SUCCESS',
      message: `[JOB FINISHED] Scraper completed with exit code ${code}`,
    });
  });

  res.json({ success: true, message: 'Scraping job started', clientId, niche });
});

// AI Requirement Extraction from Client Transcripts / Agreements
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
app.post('/api/gemini/discover-shows', async (req: Request, res: Response) => {
  try {
    const { niche, clientId = 'C001', minSubs = 1000 } = req.body;
    if (!niche) {
      return res.status(400).json({ error: 'Niche keyword is required' });
    }

    broadcastLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `[SEARCH GROUNDING] Querying live search data for active podcasts in niche: "${niche}"`,
    });

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
      // If parsing fails due to markdown wrapper
      const match = response.text?.match(/\[\s*\{.*\}\s*\]/s);
      if (match) {
        shows = JSON.parse(match[0]);
      }
    }

    // Save discovered shows to SQLite via python script
    if (shows.length > 0) {
      for (const show of shows) {
        const leadPayload = {
          client_id: clientId,
          show_name: show.showName || 'Active Podcast Show',
          host_name: show.hostName || 'Show Host',
          platform: show.platform || 'Apple Podcasts',
          show_url: show.showUrl || 'https://podcasts.apple.com',
          feed_url: '',
          email: show.email || '',
          subscribers: show.subscribers || minSubs,
          niche: niche,
          score: 8.5,
        };

        const pyCode = `
import sqlite3, json, sys
data = json.loads(sys.argv[1])
conn = sqlite3.connect("podconnect_leads.db")
c = conn.cursor()
c.execute("""
    INSERT INTO leads (client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')
    ON CONFLICT(client_id, show_name) DO UPDATE SET
        host_name = excluded.host_name,
        email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
        subscribers = max(leads.subscribers, excluded.subscribers),
        score = excluded.score
""", (data['client_id'], data['show_name'], data['host_name'], data['platform'], data['show_url'], data.get('feed_url', ''), data['email'], data['subscribers'], data['niche'], data['score']))
conn.commit()
print("SAVED")
`;
        const py = spawn('python3', ['-c', pyCode, JSON.stringify(leadPayload)]);
        py.on('close', () => {
          broadcastLog({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Grounded Show Indexed: ${leadPayload.show_name} (${leadPayload.host_name})`,
            lead: leadPayload,
          });
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
  "body": "Hi [Host],\n\n...",
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

// --- Vite Middleware integration ---
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PodConnect Hub AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
