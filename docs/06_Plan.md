# 06 — Implementation Plan (Atomic Checklist)
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Production Grade

---

## Phase 0: Environment Bootstrap ✅ COMPLETE

- [x] 2026-10-24 — Clone repo from `https://github.com/polymath-main/PodConnect-Hub.git`
- [x] 2026-10-24 — Install `nodejs-lts` (v24.22.1) + `npm` (v11.21.1) via `pkg install nodejs-lts`
- [x] 2026-10-24 — Add `react-is` dependency to resolve recharts peer dep conflict
- [x] 2026-10-24 — Downgrade `typescript` to `^5.9.3` (native aarch64 binary available)
- [x] 2026-10-24 — Run `npm install --legacy-peer-deps` (resolves esbuild version conflict)
- [x] 2026-10-24 — Verify build: `npx vite build` exits code 0
- [x] 2026-10-24 — Verify types: `npm run lint` (tsc --noEmit) exits code 0

---

## Phase 1: Database & Auth Layer ✅ COMPLETE

- [x] 2026-10-24 — Create `src/server/db.ts`: `DatabaseService` class using `node:sqlite` (Node 24 built-in)
  - `init()`: WAL mode + 6 table creation + seed `tenant_default`
  - `runMigrations()`: idempotent `ALTER TABLE` for `tenant_id`, `tags`, `notes`, `location`
  - CRUD methods: `getTenantsForUser`, `createTenant`, `getTenantMembers`, `addTenantMember`
  - CRUD methods: `getStagedLeads`, `getStagedLead`, `updateStagedLead`, `approveStagedLead`, `deleteStagedLead`
  - CRUD methods: `getLeads`, `updateLead`, `deleteLead`
  - CRUD methods: `createJob`, `getJob`, `getJobsByTenant`, `updateJobProgress`, `completeJob`, `failJob`, `cancelJob`
  - CRUD methods: `appendJobLog`, `getJobLogs`
- [x] 2026-10-24 — Create `src/server/auth.ts`: `authMiddleware` + `requireRole()` factory
  - Resolves user from `Authorization: Bearer <token>` header
  - Resolves tenant from `X-Tenant-ID` header
  - Validates membership in `tenant_members`; sets `req.user`, `req.tenantId`, `req.userRole`
  - Returns `401` if no auth, `403` if wrong tenant or insufficient role
- [x] 2026-10-24 — Create `src/server/queue.ts`: `JobQueueManager` class
  - Max 2 concurrent workers (Android LMK constraint)
  - `submit()`: queues job, auto-starts if capacity available
  - `cancel()`: sends `SIGTERM` to subprocess, updates job status
  - SSE maps: per-job streams + per-tenant broadcast
  - `getActiveCount()`, `getQueuedCount()` for health check

---

## Phase 2: Core API Refactor ✅ COMPLETE

- [x] 2026-10-25 — Rewrite `server.ts`: Remove all `spawn('python3', ['-c', ...])` subprocess calls
  - Import `dbService` singleton and `jobQueue` singleton
  - Apply `authMiddleware` to all `/api/*` routes (except `/api/health`)
  - Implement `/api/tenants` CRUD (GET, POST, GET members, POST member, PUT member role)
  - Implement `/api/staged-leads` CRUD (GET, PUT, POST approve, DELETE)
  - Implement `/api/leads` CRUD (GET, PUT, DELETE)
  - Implement `/api/jobs` CRUD (GET list, POST submit, GET by ID, DELETE cancel)
  - Implement `/api/jobs/:id/stream` SSE endpoint
  - Implement `/api/jobs/stream/tenant` SSE broadcast endpoint
  - Implement `/api/extract-client-profile` (Gemini structured extraction)
  - Implement `/api/generate-pitch` (Gemini pitch generation)
  - Implement `/api/discover-podcasts` (Gemini + Google Search Grounding)
- [x] 2026-10-25 — Update `scraper.py`:
  - Add `--tenant-id` and `--job-id` CLI args
  - Emit structured JSON progress lines to stdout (`{"type":"progress","progress":N,...}`)
  - Write discovered podcasts to DB with `tenant_id` field
  - Handle `SIGTERM` gracefully: flush current result, exit cleanly
- [x] 2026-10-25 — Add `src/types/index.ts` additions:
  - `Tenant`, `TenantMember`, `UserRole` interfaces
  - `ScrapeJob`, `JobStatus`, `JobLogEntry` types
  - `tenantId` field on `Lead` and `StagedLead`
- [x] 2026-10-25 — Run phase tests: `npx tsx scratch/test_phase1_2.ts` → 3/3 PASSED

---

## Phase 3: UI Integration & Client Wiring ✅ COMPLETE

- [x] 2026-10-25T19:07:00+06:00 — Create `src/components/ui/Toast.tsx` notification system (bottom-right stack, 4s auto-dismiss, motion animations, type tokens)
- [x] 2026-10-25T19:07:40+06:00 — Mount `ToastProvider` at application root in `src/main.tsx`
- [x] 2026-10-25T19:14:50+06:00 — Refactor `CentralLeadBankView.tsx`: replace raw `fetch('/api/leads')` with typed `api.getLeads()`, `api.updateLead()`, `api.deleteLead()`, and `api.assignLeadsToClient()`, wiring real-time toast feedback
- [x] 2026-10-25T19:37:50+06:00 — Refactor `OutreachHubView.tsx`: wire `api.getLeads()`, `api.updateLeadStatus()`, `api.generatePitch()` for single, batch, and Google Docs export workflows
- [x] 2026-10-25T19:45:40+06:00 — Refactor `ScraperConsoleView.tsx`: add exponential reconnection backoff (2.5s-10s, 5 attempts max) to real-time SSE stream
- [x] 2026-10-25T19:48:40+06:00 — Refactor `MasterDatabaseView.tsx`: wire live database analytics via `api.getLeads()`, replacing unauthenticated raw fetch calls
- [x] 2026-10-25T19:59:35+06:00 — Build verification: `npm run lint` code 0, `npm run build` production bundle successfully compiled

---

## Phase 4: Server-Side Email Infrastructure ✅ COMPLETE

- [x] 2026-10-25T19:24:25+06:00 — Implement `dbService.getLeadById(tenantId, id)` in `src/server/db.ts` with strict row-level workspace tenant isolation
- [x] 2026-10-25T19:26:10+06:00 — Create `src/server/email.ts` (`EmailService`): RFC 2822 base64url email encoder, sliding window in-memory rate limiter (10 dispatches/min/workspace) and Gmail API relay
- [x] 2026-10-25T19:30:50+06:00 — Add `POST /api/leads/:id/dispatch` in `server.ts` with rate-limiting, lead validation, status updating to `'Dispatched'`, and audit logging
- [x] 2026-10-25T19:33:20+06:00 — Add `api.dispatchPitch(leadId, params)` client method in `src/lib/api.ts`
- [x] 2026-10-25T19:38:30+06:00 — Wire `OutreachHubView.tsx` to server-side `api.dispatchPitch()` for single and batch email dispatches

---

## Phase 5: Billing & Plan Quota Enforcement ✅ COMPLETE

- [x] 2026-10-25T19:26:30+06:00 — Create `src/lib/plans.ts`: define `Plan` tiers (`starter`, `growth`, `agency`, `enterprise`), resource caps (`maxSeats`, `maxJobsPerDay`, `maxLeadsPerMonth`, `maxConcurrentJobs`), and `getLimits(plan)`
- [x] 2026-10-25T19:25:50+06:00 — Add `getTenantMemberCount(tenantId)` and `getJobCountToday(tenantId)` in `src/server/db.ts`
- [x] 2026-10-25T19:27:20+06:00 — Create `requireQuota('job' | 'seat')` middleware in `src/server/auth.ts` enforcing daily job limits and workspace seat limits
- [x] 2026-10-25T19:29:50+06:00 — Attach `requireQuota('seat')` to member invitations, `requireQuota('job')` to job submissions, and add `GET /api/billing/status` endpoint in `server.ts`
- [x] 2026-10-25T19:33:20+06:00 — Add `api.getBillingStatus()` in `src/lib/api.ts`
- [x] 2026-10-25T19:52:30+06:00 — Add interactive "Plan & Quota" tab to `WorkspaceSwitcherModal.tsx` showing current tier badge, daily job meters, seat counters, and monthly limits

---

## Phase 6: DevOps, Containerization & Production Deployment ✅ COMPLETE

- [x] 2026-10-25T20:01:05+06:00 — Create `.env.example` documenting all configuration keys (`PORT`, `NODE_ENV`, `GEMINI_API_KEY`, `APP_URL`, Firebase)
- [x] 2026-10-25T20:01:26+06:00 — Create production `Dockerfile` with Node 24 slim, Python 3 runtime, volume mount for `podconnect_leads.db`, and healthcheck
- [x] 2026-10-25T20:01:46+06:00 — Create `docker-compose.yml` with automated container healthcheck and volume persistence
- [x] 2026-10-25T20:02:19+06:00 — Create GitHub Actions CI workflow in `.github/workflows/ci.yml` (automated checkout, lint, build)
- [x] 2026-10-25T19:31:21+06:00 — Implement `SIGTERM` and `SIGINT` graceful shutdown handlers in `server.ts` with 10s drain timeout
- [x] 2026-10-25T19:29:07+06:00 — Enhance `GET /api/health` endpoint with active/queued job counters, db status, version, and uptime telemetry
- [x] 2026-10-25T20:09:14+06:00 — Execute end-to-end integration test (`scratch/test_phase3_to_6.ts`): all quota, isolation, and rate-limiting assertions PASSED
- [x] 2026-10-25T20:10:08+06:00 — Static structural integrity verified via Universal QA Analyzer (UNIVERSAL QA PASS)

---

## Phase 7: SwarmScraper Autonomous Lead Sourcing Engine ✅ COMPLETE

- [x] 2026-10-25T22:15:00+06:00 — Overhaul `scraper.py`: eliminate hardcoded sample feeds; implement `search_itunes_podcasts(query, limit)` querying Apple Podcasts public API (zero-paid-API).
- [x] 2026-10-25T22:23:00+06:00 — Implement `LivenessGate`: parse episode `<pubDate>` with `email.utils.parsedate_to_datetime` across recent episodes; discard dormant shows inactive for >60 days.
- [x] 2026-10-25T22:25:00+06:00 — Implement `SwarmWebsiteContactSpider`: crawl show homepage and `/contact`, `/about`, `/booking` sub-pages when RSS email is generic (`@anchor.fm`, `@buzzsprout.com`); extract direct domain emails, host socials (Twitter/X, LinkedIn), and booking forms (Typeform, PodMatch, Tally).
- [x] 2026-10-25T22:27:00+06:00 — Implement `expand_search_terms(niche)`: decompose compound queries into bigrams and high-intent terms to ensure robust recall and mitigate podfade.
- [x] 2026-10-25T22:28:00+06:00 — Implement strict RFC email validation with `email_priority` scoring and domain hints, preventing npm package false positives (`react@18.3.1`).
- [x] 2026-10-25T22:29:00+06:00 — Standardize database resolution in `PodcastLeadScraper` to `DEFAULT_DB_PATH` and pass `cwd` in `JobQueueManager.startWorker` (`src/server/queue.ts`).
- [x] 2026-10-25T22:30:00+06:00 — Create comprehensive verification test suite `scratch/test_swarm_discovery.py` testing live Apple search, liveness gate, contact spidering, and SQLite staging persistence: 4/4 PASSED.

---

## Phase 8: Multi-Touch Outreach Sequence & Cadence Pipeline Engine ✅ COMPLETE

- [x] 2026-10-25T23:05:00+06:00 — Extend types in `src/types/index.ts`: define `PipelineStage`, `SequenceTouchpoint`, `SequenceStep`, and `OutreachSequence`; extend `Lead` with `pipelineStage` and `sequence`.
- [x] 2026-10-25T23:06:00+06:00 — Enhance `EmailService` in `src/server/email.ts`: add conversation threading support using RFC 2822 `In-Reply-To` and `References` headers and Gmail API `threadId`.
- [x] 2026-10-25T23:07:00+06:00 — Add `outreach_sequences` table in SQLite (`src/server/db.ts`) with indices on `tenant_id, lead_id` and `pipeline_stage`.
- [x] 2026-10-25T23:08:00+06:00 — Implement sequence repository in `DatabaseService`: `getSequenceByLeadId`, `saveSequence`, `updateSequenceStage`, and left-join pipeline stage in `getLeads()`.
- [x] 2026-10-25T23:09:00+06:00 — Add backend API endpoints in `server.ts`:
  - `POST /api/gemini/generate-outreach-sequence`: structured 4-touchpoint generation (Initial, Value Bump, Proof Point, Breakup) via Gemini 3.8 Flash.
  - `GET /api/leads/:id/sequence`: sequence retrieval.
  - `PUT /api/leads/:id/sequence`: sequence draft save and manual refinement.
  - `POST /api/leads/:id/dispatch-touchpoint`: thread-aware Gmail API delivery with automatic cadence stage progression.
- [x] 2026-10-25T23:11:00+06:00 — Add typed API methods in `src/lib/api.ts` (`generateOutreachSequence`, `getLeadSequence`, `saveLeadSequence`, `dispatchTouchpoint`).
- [x] 2026-10-25T23:20:00+06:00 — Overhaul `src/components/OutreachHubView.tsx`:
  - Multi-touch Sequence Studio with 4 tabs (🎯 Initial Pitch, ⚡ Follow-Up 1, 📊 Follow-Up 2, 🚪 Final Breakup).
  - Personalization variable tokens toolbar (`+ {{hostName}}`, `+ {{showName}}`, `+ {{clientName}}`, `+ {{niche}}`).
  - Cadence Stage & Threading Telemetry bar.
  - Pipeline Stage filter bar on the shows selection list (`All`, `Drafted`, `Pitch Sent`, `FU 1 Due`, `FU 2 Due`, `Breakup Due`, `Responded`, `Booked`).
- [x] 2026-10-25T23:27:00+06:00 — Create comprehensive test suite `scratch/test_outreach_sequence.ts` verifying threading headers, sequence CRUD, and stage progression: 4/4 PASSED.

---

## Phase 9: Vercel Cloud Hosting & Serverless Architecture ✅ COMPLETE

- [x] 2026-10-27T14:45:00+06:00 — Configure `vercel.json` with SPA routing rewrites and `/api/(.*)` serverless bridge
- [x] 2026-10-27T14:45:15+06:00 — Create `api/index.ts` serverless handler wrapping Express application with path normalization
- [x] 2026-10-27T14:45:30+06:00 — Update `server.ts` with named/default exports, `/api` root healthcheck, and serverless listening guard
- [x] 2026-10-27T14:45:45+06:00 — Adapt `src/server/db.ts` for serverless ephemeral filesystems via `os.tmpdir()` and seed database copying
- [x] 2026-10-27T14:46:00+06:00 — Enhance `src/server/queue.ts` worker process error trapping (`py.on('error')`) preventing uncaught exceptions
- [x] 2026-10-27T14:46:15+06:00 — Add `VITE_API_URL` prefix support in `src/lib/api.ts` for decoupled client/server Vercel deployments
- [x] 2026-10-27T14:46:30+06:00 — Update `package.json` with `engines.node >= 22.5.0` for Vercel Node 22 native SQLite support
- [x] 2026-10-27T14:46:45+06:00 — Configure `.vercelignore` to exclude local caches, databases, and scratch suites

---

## Verification Commands

```bash
# Type check
npm run lint

# Production build
npm run build

# Static structural integrity
python3 ~/.gemini/config/skills/qa-analyzer/scripts/analyzer.py src/

# End-to-end integration test (Phases 3 - 6)
node ./node_modules/tsx/dist/cli.mjs scratch/test_phase3_to_6.ts

# SwarmScraper lead discovery test suite (Phase 7)
python3 scratch/test_swarm_discovery.py

# Multi-touch outreach sequence & cadence test suite (Phase 8)
node ./node_modules/tsx/dist/cli.mjs scratch/test_outreach_sequence.ts

# Server health check
curl http://localhost:3000/api/health
```
