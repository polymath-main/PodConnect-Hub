# 04 — Technical Requirements Document (TRD)
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Locked

---

## 1. Locked Tech Stack

> [!IMPORTANT]
> All library versions below are **locked** to what is installed in `package.json`. Do not upgrade without a full regression test.

### Frontend

| Library | Version | Purpose |
|---------|---------|---------|
| `react` | `^19.0.1` | UI framework |
| `react-dom` | `^19.0.1` | DOM rendering |
| `react-is` | `^19.3.1` | React type checking (recharts peer dep) |
| `vite` | `^8.3.0` | Build tool & dev server |
| `@vitejs/plugin-react` | `^6.1.1` | React fast refresh |
| `tailwindcss` | `^4.3.3` | Utility-first CSS |
| `@tailwindcss/vite` | `^4.3.3` | Tailwind Vite plugin |
| `lucide-react` | `^0.546.0` | Icon system |
| `motion` | `^12.23.24` | Animation (Framer Motion v12) |
| `recharts` | `^3.10.1` | Data visualization charts |
| `firebase` | `^13.1.0` | Firebase Auth + Firestore client SDK |
| `@google/genai` | `^2.4.0` | Gemini AI client (frontend + server) |

### Backend / Server

| Library | Version | Purpose |
|---------|---------|---------|
| `express` | `^4.21.2` | HTTP server framework |
| `dotenv` | `^17.2.3` | Environment variable loading |
| `cheerio` | `^1.2.0` | HTML parsing for scraper |
| `tsx` | `^4.21.0` | TypeScript execution (no compile step) |
| `typescript` | `^5.9.3` | Type system |
| `node:sqlite` | built-in (Node 24) | SQLite database (WAL mode) |

### Dev Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@types/express` | `^4.17.21` | Express type definitions |
| `@types/node` | `^22.14.0` | Node.js type definitions |
| `@types/react` | `^19.3.0` | React type definitions |
| `@types/react-dom` | `^19.3.0` | React-DOM type definitions |
| `autoprefixer` | `^10.4.21` | CSS autoprefixer |
| `esbuild` | `^0.25.0` | Bundler used by Vite |

### Runtime Environment

| Property | Value |
|----------|-------|
| Node.js | v24.22.1 (aarch64, Android/Termux) |
| npm | v11.21.1 |
| Python | 3.14 (for `scraper.py`) |
| OS | Android 16, Linux 5.15.189 aarch64 |
| Shell | `/data/data/com.termux/files/usr/bin/bash` |
| DB file | `podconnect_leads.db` (SQLite WAL) |

---

## 2. External APIs & Services

### Google Workspace APIs (OAuth 2.0)

All Google API access uses client-side OAuth tokens. **No Google tokens are ever stored server-side.**

| API | Scopes | Usage |
|-----|--------|-------|
| Google Drive API v3 | `drive.readonly`, `drive.file` | List/open client files |
| Google Docs API v1 | `documents.readonly`, `documents` | Read transcripts, create/update docs |
| Google Sheets API v4 | `spreadsheets` | Export leads to Sheets |
| Google Calendar API v3 | `calendar.events` | Create/read milestone events |
| Gmail API v1 | `gmail.send` | Dispatch pitch emails |

OAuth token is passed via `Authorization: Bearer <token>` header on frontend API calls. The backend reads it via `req.headers.authorization` for user identity resolution.

### Gemini AI API

| Property | Value |
|----------|-------|
| SDK | `@google/genai` v2.4.0 |
| Model | `gemini-2.5-flash` (server-side inference) |
| Features used | Text generation, structured JSON output (`Type` schema), Google Search Grounding (live podcast discovery) |
| API key source | `GEMINI_API_KEY` environment variable (`.env`) |
| User-Agent header | `aistudio-build` (required) |

### Firebase

| Service | Usage |
|---------|-------|
| Firebase Auth | Google OAuth provider, user session tokens, UID resolution |
| Cloud Firestore | Clients collection, leads metadata, milestones (real-time sync) |
| Security rules | Owner-scoped field-level access (`request.auth.uid == resource.data.ownerId`) |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (React 19)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Firebase │  │ Google   │  │ Gemini   │  │ Express    │  │
│  │ Auth     │  │ Workspace│  │ AI (fe)  │  │ API Client │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└───────────────────────────────┬─────────────────────────────┘
                                │ HTTP / SSE
┌───────────────────────────────▼─────────────────────────────┐
│                   Express Server (tsx, port 3000)            │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ authMiddleware │  │  JobQueueManager│  │  DatabaseSvc │ │
│  │ (RBAC + tenant)│  │  (max 2 workers)│  │  (node:sqlite│ │
│  └────────────────┘  └─────────────────┘  │   WAL mode)  │ │
│                             │              └──────────────┘ │
│                    ┌────────▼────────┐                      │
│                    │  scraper.py     │                      │
│                    │  (subprocess,   │                      │
│                    │  SIGTERM-cancel)│                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
  podconnect_leads.db                  Cloud Firestore
  (SQLite WAL, local)              (clients/leads/milestones)
```

---

## 4. Folder Structure

```
PodConnect-Hub/
├── server.ts                    # Express entry point (tsx)
├── scraper.py                   # Python podcast discovery script
├── podconnect_leads.db          # SQLite WAL database (gitignored)
├── .env                         # GEMINI_API_KEY, PORT (gitignored)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── firebase-applet-config.json  # Firebase client config
├── firestore.rules              # Firestore security rules
├── agents.md                    # AI agent instructions (this repo)
├── .cursorrules                 # Cursor AI rules (mirrors agents.md)
├── docs/                        # ← 6-document context architecture
│   ├── 01_PRD.md
│   ├── 02_AppFlow.md
│   ├── 03_UI_Spec.md
│   ├── 04_TRD.md                # ← this file
│   ├── 05_Schema.md
│   └── 06_Plan.md
├── src/
│   ├── main.tsx                 # React DOM entry
│   ├── App.tsx                  # Root component + routing state
│   ├── index.css                # Tailwind base + custom tokens
│   ├── lib/
│   │   └── api.ts               # Typed frontend API client
│   ├── server/
│   │   ├── db.ts                # DatabaseService (node:sqlite)
│   │   ├── auth.ts              # Auth middleware + RBAC
│   │   └── queue.ts             # JobQueueManager + SSE streams
│   ├── types/
│   │   └── index.ts             # All TypeScript interfaces & enums
│   └── components/
│       ├── Header.tsx           # Global header + workspace badge
│       ├── Sidebar.tsx          # Navigation sidebar
│       ├── ConfirmationModal.tsx
│       ├── ClientOnboardingView.tsx
│       ├── ScraperConsoleView.tsx
│       ├── MasterDatabaseView.tsx
│       ├── OutreachHubView.tsx
│       ├── CalendarMilestonesView.tsx
│       ├── WorkspaceHubView.tsx
│       ├── clients/             # Client management sub-components
│       ├── leads/               # Lead management sub-components
│       └── tenants/
│           └── WorkspaceSwitcherModal.tsx
└── dist/                        # Vite build output (gitignored)
```

---

## 5. API Routes Reference

All routes under `/api/*` (except `/api/health`) require `Authorization: Bearer <token>` and `X-Tenant-ID` headers.

### Auth & Multi-Tenant
| Method | Route | Role | Description |
|--------|-------|------|-------------|
| `GET` | `/api/health` | Public | Server health check |
| `POST` | `/api/auth/session` | Public | Multi-actor login session request (Firebase Token or Agent Key) |
| `GET` | `/api/auth/session` | Authenticated | Inspect active session profile, user role & tenant |
| `DELETE` | `/api/auth/session` | Authenticated | Revoke active session token (Logout) |
| `GET` | `/api/tenants` | Any | List workspaces for user |
| `POST` | `/api/tenants` | Any | Create new workspace |
| `GET` | `/api/tenants/:id/members` | Any | List workspace members |
| `POST` | `/api/tenants/:id/members` | owner/admin | Invite member |
| `PUT` | `/api/tenants/:id/members/:uid` | owner/admin | Update member role |

### Model Context Protocol (MCP) Server
| Method | Route | Role | Description |
|--------|-------|------|-------------|
| `GET` | `/api/mcp` | Public | MCP server manifest, protocol version & available tools catalog |
| `POST` | `/api/mcp` | Authenticated | Streamable JSON-RPC 2.0 endpoint (`initialize`, `tools/list`, `tools/call`, `resources/list`) |

### Staged Leads
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/staged-leads` | List staged leads (tenant-scoped) |
| `PUT` | `/api/staged-leads/:id` | Edit staged lead |
| `POST` | `/api/staged-leads/:id/approve` | Promote to leads table |
| `DELETE` | `/api/staged-leads/:id` | Reject staged lead |

### Leads
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/leads` | List approved leads (tenant-scoped) |
| `PUT` | `/api/leads/:id` | Update lead (status, notes, tags) |
| `DELETE` | `/api/leads/:id` | Archive/delete lead |

### Job Queue
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/jobs` | Submit new scrape job |
| `GET` | `/api/jobs` | List all jobs (tenant-scoped) |
| `GET` | `/api/jobs/:id` | Get job details + logs |
| `DELETE` | `/api/jobs/:id` | Cancel running job (SIGTERM) |
| `GET` | `/api/jobs/:id/stream` | SSE stream: per-job progress |
| `GET` | `/api/jobs/stream/tenant` | SSE stream: all tenant jobs |

### AI Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/extract-client-profile` | Gemini: transcript → client ICP |
| `POST` | `/api/generate-pitch` | Gemini: lead + client context → pitch draft |
| `POST` | `/api/discover-podcasts` | Gemini + Google Search Grounding |

---

## 6. Security Constraints

### Multi-Tenant Row-Level Isolation
- Every database query MUST include `WHERE tenant_id = ?` scoped to `req.tenantId`
- `req.tenantId` is resolved by `authMiddleware` from `X-Tenant-ID` header and validated against `tenant_members` table
- Cross-tenant data access returns `403 Forbidden`

### RBAC Enforcement
- `requireRole(['owner', 'admin'])` middleware on destructive operations
- Role hierarchy: `owner > admin > manager > member > viewer`
- Viewers cannot POST, PUT, or DELETE any resource

### Firebase Security Rules
- Firestore rules enforce `request.auth.uid == resource.data.ownerId` for all client/lead/milestone documents
- Anonymous access is denied at the Firestore rule level

### No Server-Side Token Storage
- Google OAuth tokens live in browser memory only (via Firebase Auth session)
- Passed as `Authorization: Bearer` on each request; never written to disk or database

### Input Validation
- JSON body size limit: 10MB
- All required fields validated before database writes (400 if missing)
- SQLite parameterized queries throughout (no string interpolation)

---

## 7. Termux / Android Constraints

> [!WARNING]
> This service runs on Android Termux (aarch64). Standard Linux paths do NOT apply.

| Constraint | Rule |
|------------|------|
| Binary paths | Use `$PREFIX/bin/` (e.g., `/data/data/com.termux/files/usr/bin/`) not `/usr/bin/` |
| Python packages | `pip install --break-system-packages <pkg>` |
| Python executable | `python3` (via Termux pkg) |
| Max parallel jobs | 2 concurrent scraper workers (Android LMK pressure) |
| SSE buffering | Use `buffer.indexOf("\n\n")` split loops; do not assume full chunks |
| Node.js ESM | Server runs via `tsx server.ts`; do not use `node server.ts` |
| SQLite | Use `node:sqlite` built-in (Node 24+); do not use `better-sqlite3` |
| File searches | Use `fd` / `rg` with explicit path scope; no unbounded `find /` |

---

## 8. Vercel Cloud Deployment Architecture

The application supports zero-config deployment on Vercel:

| Component | Vercel Implementation |
|-----------|------------------------|
| Frontend SPA | Bundled via `vite build` into `dist/`, served globally via Vercel Edge CDN |
| Client Routing | `vercel.json` rewrites `/((?!api/).*)` to `/index.html` preventing 404s |
| API Layer | Serverless function at `api/index.ts` routing `/api/(.*)` to Express |
| SQLite Database | Ephemeral seed staging to `os.tmpdir()` (`/tmp/podconnect_leads.db`) with fallback |
| External Backend Proxy | Optional `VITE_API_URL` environment variable for standalone container backends |
| Node.js Runtime | `engines.node >= 22.5.0` enforcing Node 22+ with native `node:sqlite` |
