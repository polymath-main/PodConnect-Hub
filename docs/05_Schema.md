# 05 — Database Schema
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Locked

---

## 1. SQLite Database

**File**: `podconnect_leads.db` (project root, gitignored)
**Engine**: `node:sqlite` (Node.js 24 built-in)
**Mode**: WAL (`PRAGMA journal_mode = WAL`)
**Location**: Resolved relative to `src/server/db.ts` → `../../podconnect_leads.db`

---

## 2. Table Definitions

### 2.1 `tenants`

Represents an isolated workspace. Every data record is scoped to a `tenant_id`.

```sql
CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,           -- Format: 'tenant_<uuid>' or 'tenant_default'
  name          TEXT NOT NULL,              -- Display name: "Primary Agency Workspace"
  slug          TEXT UNIQUE NOT NULL,       -- URL-safe slug: "primary-workspace"
  plan          TEXT DEFAULT 'growth',      -- Enum: 'growth' | 'agency' | 'enterprise'
  owner_user_id TEXT NOT NULL,              -- Firebase UID of workspace creator
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**: `PRIMARY KEY` on `id`, `UNIQUE` on `slug`.
**Seed**: `tenant_default` row is auto-inserted on first `DatabaseService` init.

---

### 2.2 `tenant_members`

Junction table linking Firebase users to workspaces with a role.

```sql
CREATE TABLE IF NOT EXISTS tenant_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT NOT NULL,                 -- FK → tenants.id
  user_id    TEXT NOT NULL,                 -- Firebase UID
  email      TEXT NOT NULL,                 -- User email (used for invite flow)
  role       TEXT NOT NULL DEFAULT 'member',-- Enum: 'owner'|'admin'|'manager'|'member'|'viewer'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, user_id)               -- One role per user per workspace
);
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_members_user ON tenant_members(user_id);
```

**Role Hierarchy** (enforced by `requireRole()` middleware):
```
owner > admin > manager > member > viewer
```

---

### 2.3 `staged_leads`

Holding area for scraper-discovered leads awaiting human review. Leads here are **not** active in the pipeline.

```sql
CREATE TABLE IF NOT EXISTS staged_leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT DEFAULT 'tenant_default', -- FK → tenants.id (migration-added)
  client_id    TEXT,                           -- Client this job was run for
  show_name    TEXT,                           -- Podcast show name
  host_name    TEXT,                           -- Host full name
  platform     TEXT,                           -- e.g., 'Spotify', 'Apple Podcasts'
  show_url     TEXT,                           -- Show landing page URL
  feed_url     TEXT,                           -- RSS feed URL
  email        TEXT,                           -- Contact email
  subscribers  INTEGER,                        -- Listener/subscriber count
  niche        TEXT,                           -- e.g., 'Business', 'Health & Wellness'
  tags         TEXT,                           -- JSON array: '["marketing","startup"]'
  score        REAL,                           -- AI quality score (0.0–1.0)
  location     TEXT,                           -- Host/show geographic location
  date_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, show_name)                -- Prevents duplicate staging per client
);
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_staged_tenant ON staged_leads(tenant_id, client_id);
```

---

### 2.4 `leads`

Approved leads in the active pipeline. Promoted from `staged_leads` via the approval gate.

```sql
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  TEXT DEFAULT 'tenant_default', -- FK → tenants.id (migration-added)
  client_id  TEXT,                           -- Client this lead belongs to
  show_name  TEXT,                           -- Podcast show name
  host_name  TEXT,                           -- Host full name
  platform   TEXT,                           -- e.g., 'Spotify', 'Apple Podcasts'
  show_url   TEXT,                           -- Show landing page URL
  feed_url   TEXT,                           -- RSS feed URL
  email      TEXT,                           -- Contact email
  subscribers INTEGER,                       -- Listener/subscriber count
  niche      TEXT,                           -- Niche category
  score      REAL,                           -- Quality score (0.0–1.0)
  status     TEXT DEFAULT 'Imported',        -- LeadStatus enum (see below)
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tags       TEXT,                           -- JSON array (migration-added)
  notes      TEXT,                           -- Manager notes (migration-added)
  location   TEXT,                           -- Geographic location (migration-added)
  UNIQUE(client_id, show_name)
);
```

**LeadStatus Enum** (enforced at application layer, stored as TEXT):
```
'Staged' | 'Imported' | 'New' | 'Pitch Drafted' | 'Contacted' |
'Sent' | 'Dispatched' | 'Replied' | 'Responded' | 'Converted' |
'Booked' | 'Archived' | 'Passed'
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id, client_id);
```

---

### 2.5 `jobs`

Tracks scrape job lifecycle and progress.

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,           -- UUID: 'job_<timestamp>_<rand>'
  tenant_id     TEXT NOT NULL,              -- FK → tenants.id
  user_id       TEXT NOT NULL,              -- Firebase UID of submitter
  client_id     TEXT NOT NULL,              -- Client this job runs for
  job_type      TEXT NOT NULL DEFAULT 'scraper',
  niche         TEXT NOT NULL,              -- Niche keywords
  min_subs      INTEGER NOT NULL DEFAULT 1000,
  target_count  INTEGER NOT NULL DEFAULT 10,
  status        TEXT NOT NULL DEFAULT 'pending', -- JobStatus enum
  progress      INTEGER NOT NULL DEFAULT 0, -- 0–100
  found_count   INTEGER NOT NULL DEFAULT 0, -- Raw podcasts found
  staged_count  INTEGER NOT NULL DEFAULT 0, -- Podcasts passing quality filter
  error_message TEXT,                       -- Populated on failure/cancellation
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at    TIMESTAMP,                  -- Set when worker picks up job
  completed_at  TIMESTAMP                   -- Set on completion/failure/cancel
);
```

**JobStatus Enum**:
```
'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id, status);
```

**Concurrency**: `JobQueueManager` in `src/server/queue.ts` enforces max 2 concurrent jobs per process. Workers are spawned as `scraper.py` subprocesses; cancellation sends `SIGTERM`.

---

### 2.6 `job_logs`

Append-only log stream for each job. Powers the SSE terminal in the UI.

```sql
CREATE TABLE IF NOT EXISTS job_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id    TEXT NOT NULL,                  -- FK → jobs.id
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  level     TEXT NOT NULL,                  -- 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR'
  message   TEXT NOT NULL,
  metadata  TEXT                            -- Optional JSON payload
);
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id);
```

### 2.7 `sessions`

Multi-actor authentication session tokens supporting both interactive users (Google OAuth / Firebase) and autonomous AI agents (Agent Secret Key).

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,              -- Format: 'pcs_<uuid>'
  user_id     TEXT NOT NULL,                 -- Firebase UID or Agent ID
  email       TEXT NOT NULL,                 -- User/Agent email address
  tenant_id   TEXT NOT NULL,                 -- FK → tenants.id
  role        TEXT NOT NULL DEFAULT 'member',-- Role inside active tenant
  auth_type   TEXT NOT NULL,                 -- 'firebase_id_token' | 'agent_key' | 'credentials'
  user_agent  TEXT,                          -- Client identifier string
  ip_address  TEXT,                          -- Remote IP address
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,            -- ISO 8601 expiry timestamp
  revoked_at  TIMESTAMP,                     -- NULL if active; timestamp when revoked
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

**Indexes**:
```sql
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
```

---

## 3. Migration Strategy

Migrations are applied **idempotently** on every `DatabaseService` instantiation via `runMigrations()` in `src/server/db.ts`. Pattern:

```typescript
const cols = (db.prepare('PRAGMA table_info(table_name)').all()).map(c => c.name);
if (!cols.includes('new_column')) {
  db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
}
```

This guarantees backward compatibility — existing databases are upgraded, never dropped.

---

## 4. Cloud Firestore Schema

**Project**: Configured in `firebase-applet-config.json`
**Security**: `firestore.rules` — all documents enforce `request.auth.uid == resource.data.ownerId`

### 4.1 `/clients/{clientId}` Collection

```typescript
interface FirestoreClient {
  id: string;                    // Document ID (e.g., "C001")
  name: string;
  platform: string;              // "Spotify" | "Apple Podcasts" | "YouTube"
  niche: string;
  package: string;               // Service package name
  pricing: string;
  minSubscribers: number;
  contractDays: number;
  startDate: string;             // ISO 8601
  endDate: string;
  stage: ClientStage;
  status: ClientStatus;
  orderNumber?: string;
  targetPlacements?: number;
  bookedPlacements?: number;
  cancellationDetails?: {
    reason: string;
    cancelledAt: string;
    settlementType: SettlementType;
    settlementAmount?: string;
    notes?: string;
    archiveCalendarEvents?: boolean;
    cancelledBy?: string;
  };
  stageHistory: Array<{
    fromStage: ClientStage;
    toStage: ClientStage;
    timestamp: string;
    note?: string;
  }>;
  icp?: {
    targetAudience: string;
    painPoints: string[];
    goals: string[];
    demographics: string;
  };
  messagePillars: string[];
  credibilityAssets: string[];
  samplePitchAngle?: string;
  milestones: Milestone[];       // Embedded sub-collection
  docs: {
    conversationExportUrl?: string;
    conversationExportTitle?: string;
    requirementsDocUrl?: string;
    requirementsDocTitle?: string;
    outreachStrategyDocUrl?: string;
    outreachStrategyDocTitle?: string;
  };
  lastSyncedAt?: string;
  ownerId: string;               // Firebase UID — used in security rules
  createdAt: Timestamp;
}
```

**ClientStage**: `'Onboarding' | 'Scoping' | 'Lead Sourcing' | 'Outreach Active' | 'Interview Scheduled' | 'Completed' | 'Paused' | 'Cancelled'`
**ClientStatus**: `'Active' | 'Paused' | 'Cancelled' | 'Completed' | 'Onboarding' | 'Review'`

---

### 4.2 `/leads/{leadId}` Collection

```typescript
interface FirestoreLead {
  id: string;
  clientId: string;              // Reference to /clients/{clientId}
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
  pitchDraft?: {
    subject: string;
    body: string;
    generatedAt: string;
    personalizationNotes?: string;
  };
  ownerId: string;               // Firebase UID
}
```

---

### 4.3 `/milestones/{milestoneId}` Collection

```typescript
interface FirestoreMilestone {
  id: string;
  title: string;
  clientId: string;              // Reference to /clients/{clientId}
  dayOffset: number;             // Days from client.startDate
  dueDate: string;               // ISO 8601 computed date
  completed: boolean;
  calendarEventId?: string;      // Google Calendar event ID
  calendarLink?: string;         // Google Calendar event URL
  ownerId: string;               // Firebase UID
  createdAt: Timestamp;
}
```

---

## 5. Auth & Row-Level Security

### SQLite (Application-Layer RLS)

- `authMiddleware` in `src/server/auth.ts` resolves `req.tenantId` from `X-Tenant-ID` header
- Validates user is a member of that tenant via `tenant_members` table
- All database queries include `WHERE tenant_id = ?` with `req.tenantId`
- Attempting to query another tenant's data returns `403 Forbidden`

### Firestore (Rule-Layer RLS)

```javascript
// firestore.rules (simplified)
match /clients/{clientId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == resource.data.ownerId;
}
match /leads/{leadId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == resource.data.ownerId;
}
match /milestones/{milestoneId} {
  allow read, write: if request.auth != null
                     && request.auth.uid == resource.data.ownerId;
}
```

### RBAC Decision Matrix

| Action | owner | admin | manager | member | viewer |
|--------|-------|-------|---------|--------|--------|
| Create workspace | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update member roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Submit scrape job | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cancel scrape job | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve staged leads | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete leads | ✅ | ✅ | ✅ | ❌ | ❌ |
| Generate pitch | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dispatch Gmail | ✅ | ✅ | ✅ | ❌ | ❌ |
| View all data | ✅ | ✅ | ✅ | ✅ | ✅ |
