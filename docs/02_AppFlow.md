# 02 — Application Flow Document
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Active

---

## 1. Authentication Flow

```
[Browser Load]
      │
      ▼
Firebase Auth SDK initializes
      │
      ├─ User session exists? ──YES──► [Load App Shell]
      │                                      │
      │                                      ▼
      │                               Resolve active tenantId
      │                               (from localStorage or first tenant)
      │                                      │
      │                                      ▼
      │                               GET /api/tenants → auto-provision
      │                               "Primary Agency Workspace" if none
      │                                      │
      │                                      ▼
      │                               [Render Main App]
      │
      └─ No session? ──────────────► [Auth Gate Screen]
                                            │
                                            ▼
                                     "Sign in with Google" button
                                            │
                                            ▼
                                     Firebase signInWithPopup()
                                     (GoogleAuthProvider, multi-scope)
                                            │
                                     OAuth scopes requested:
                                     - profile, email
                                     - drive.readonly
                                     - documents, documents.readonly
                                     - spreadsheets
                                     - calendar.events
                                     - gmail.send
                                            │
                                            ▼
                                     onAuthStateChanged fires
                                            │
                                            ▼
                                     [Load App Shell] (as above)
```

### Auth Error States
| Error | UI Response |
|-------|-------------|
| `auth/popup-closed-by-user` | Toast: "Sign-in cancelled. Please try again." |
| `auth/network-request-failed` | Toast: "Network error. Check connection." |
| Token expired (401 from API) | Auto re-auth trigger via Firebase `getIdToken(true)` |

---

## 2. Global App Shell

### Header (always visible)
- **Left**: PodConnect Hub AI logo + current view title
- **Center**: Active workspace badge (`tenant.name`) + workspace switcher trigger (chevron icon)
- **Right**: User avatar + email + "Sign Out" button

### Sidebar (always visible on desktop)
Navigation items with icons and active state highlight:

| Icon | Label | View Key | Route Trigger |
|------|-------|----------|---------------|
| Users | Clients | `clients` | Click |
| Database | Lead Bank | `database` | Click |
| UserPlus | Onboarding | `onboarding` | Click |
| Search | Lead Sourcing | `scraper` | Click |
| Send | Outreach Hub | `outreach` | Click |
| Calendar | Milestones | `milestones` | Click |
| Layout | Workspace Hub | `workspace` | Click |

Active view stored in `App.tsx` state `activeView`. No URL-based routing (SPA state machine).

### Workspace Switcher Modal
- Trigger: Click workspace badge in header
- Content: List of all workspaces user belongs to (from `GET /api/tenants`)
- Each row: workspace name, user's role badge, "Switch" button
- Bottom section: "Create New Workspace" form (name + slug fields + Submit)
- Team tab: List members of current workspace, invite by email + role selector
- Close: Click outside overlay or X button

---

## 3. View State Machines

### 3.1 Clients View (`activeView === 'clients'`)

**Tabs**: `Pipeline` (Kanban) | `Table` (sortable list)

#### Pipeline Tab
```
[Load] → GET Firestore /clients (owner-scoped)
      │
      ▼
Kanban board renders columns:
Onboarding | Scoping | Lead Sourcing | Outreach Active | Interview Scheduled | Completed
      │
[Drag card] → Firestore update: client.stage = newStage, stageHistory.push(entry)
      │
[Click card] → Open ClientDetailPanel (right drawer)
      │
[+ Add Client button] → Open AddClientModal
  Fields: name, platform, niche, package, pricing, minSubscribers,
          contractDays, startDate, targetPlacements
  Submit → POST Firestore /clients → refresh board
      │
[Cancel Client] → Open CancelClientModal
  Fields: reason, settlementType, settlementAmount, notes, archiveCalendarEvents
  Submit → Firestore update: status=Cancelled, cancellationDetails
```

#### Table Tab
```
[Render] → same Firestore data, sorted by startDate DESC
[Column sort] → client-side array sort
[Row click] → Open ClientDetailPanel
[Search input] → client-side filter on name/niche
```

#### Empty State
- No clients: Illustration + "Add your first client" CTA button
- Loading: Skeleton card grid (3 columns × 2 rows)

---

### 3.2 Lead Bank View (`activeView === 'database'`)

```
[Load] → GET /api/leads?client_id=<active>
       → GET Firestore /leads (for pitchDraft overlay)
      │
[Client selector dropdown] → re-fetch with new client_id
      │
[Table renders] columns: show_name, host_name, platform, subscribers,
               niche, score, status badge, email, tags, date_added
      │
[Row actions]:
  - Edit (pencil) → inline editable row (status, notes, tags)
  - Archive (trash) → DELETE /api/leads/:id
      │
[Bulk approve staged] → POST /api/staged-leads/:id/approve per selected
      │
[Export to Sheets] → POST Google Sheets API (client-side OAuth)
  → Creates new sheet named "{client.name} Leads {date}"
  → Writes header row + data rows
  → Opens new tab to sheet URL
      │
[Analytics cards] (top row):
  - Total leads count
  - Leads by status donut chart (recharts)
  - Avg score gauge
  - Leads added this week bar chart
```

#### Empty State
- No leads for client: "No leads found. Start a scrape job to populate."

---

### 3.3 Client Onboarding View (`activeView === 'onboarding'`)

```
[Step 1: Select Client]
  → Dropdown of all Firestore clients
  → "Start Onboarding" button

[Step 2: Paste Transcript URL]
  → Input field: Google Doc URL
  → "Extract with AI" button
      │
      ▼
  POST /api/extract-client-profile
  Body: { transcriptUrl, clientId }
  → Server fetches Doc content via Docs API
  → Gemini structured extraction:
    niche, ICP, messagePillars[], credibilityAssets[],
    samplePitchAngle, contractDays, minSubscribers
      │
[Step 3: Review & Edit Extracted Fields]
  → Editable fields displayed
  → "Approve & Save" button
      │
  → Firestore update: client.icp, client.messagePillars, etc.
  → Toast: "Profile updated successfully"

[Step 4: Sync to Google Workspace]
  → "Create Requirements Doc" button
    → POST Google Docs API (create new doc, write client brief)
    → Firestore update: client.docs.requirementsDocUrl
  → "Create Outreach Strategy Doc" button
    → Similar flow
  → Each button shows spinner while in-flight
```

#### Error States
| Error | Response |
|-------|----------|
| Invalid Google Doc URL | Inline error: "Enter a valid Google Docs URL" |
| Docs API permission denied | Toast: "Google Docs access not authorized. Re-sign in." |
| Gemini extraction failed | Toast: "AI extraction failed. Try again or enter manually." |

---

### 3.4 Lead Sourcing / Scraper Console (`activeView === 'scraper'`)

**Tabs**: `Submit Job` | `Job Queue & Concurrency Pool` | `Staged Leads`

#### Submit Job Tab
```
Form fields:
  - Client selector (dropdown, required)
  - Niche keywords (text input, required)
  - Minimum subscribers (number, default 1000)
  - Target count (number, default 10)

[Submit Scrape Job]
  → POST /api/jobs
  → Response: { jobId }
  → Auto-switch to Job Queue tab
  → SSE connect: GET /api/jobs/:id/stream
```

#### Job Queue Tab
```
[Load] → GET /api/jobs
[SSE] → GET /api/jobs/stream/tenant (auto-connects)
      │
Per-job card shows:
  - Job ID, client name, niche, status badge
  - Progress bar (0–100%)
  - Found count / Staged count
  - "View Logs" toggle → expands log terminal
  - "Cancel" button (visible if status === 'running')
      │
[Cancel] → DELETE /api/jobs/:id → job status → 'cancelled'
[Log terminal] → Shows job_logs entries with level-colored text:
  INFO (gray), SUCCESS (emerald), WARN (amber), ERROR (rose)
```

#### Staged Leads Tab
```
[Load] → GET /api/staged-leads?client_id=<selected>
      │
[Table] columns: show_name, host, platform, subscribers, email, score, tags
      │
[Row actions]:
  - Edit (pencil) → PUT /api/staged-leads/:id (inline edit)
  - Approve (check) → POST /api/staged-leads/:id/approve → moves to leads
  - Reject (X) → DELETE /api/staged-leads/:id
      │
[Bulk Approve All] button → iterates all staged, posts approve per row
```

#### Empty State
- No jobs yet: "No scrape jobs submitted. Start one above."
- No staged leads: "No staged leads. Run a job to populate."

---

### 3.5 Outreach Hub (`activeView === 'outreach'`)

```
[Load] → GET /api/leads?status=Imported,New (tenant+client scoped)
      │
[Lead selector] → checkbox multi-select from table
      │
[Generate Pitch button]
  → POST /api/generate-pitch
  Body: { leadIds[], clientId }
  → Server sends each lead + client context to Gemini
  → Returns PitchDraft[] (subject, body, personalization notes)
      │
[Pitch Editor]
  → Subject field (editable)
  → Body textarea (editable, markdown preview toggle)
  → "Dispatch via Gmail" button
      │
[Dispatch]
  → POST Gmail API (client-side OAuth token)
  Body: To=lead.email, Subject, Body
  → PUT /api/leads/:id { status: 'Dispatched' }
  → Toast: "Pitch dispatched to {show_name}"
      │
[Pitch history] section → Lists all 'Dispatched' leads with timestamp
```

#### Error States
| Error | Response |
|-------|----------|
| Lead has no email | Warning badge: "No email — pitch generation only" |
| Gmail API `403` | Toast: "Gmail access denied. Re-authorize Google account." |
| Gemini pitch timeout | Toast: "Generation timed out. Retry." |

---

### 3.6 Calendar Milestones View (`activeView === 'milestones'`)

```
[Load] → GET Firestore /milestones (owner-scoped, sorted by dueDate)
       → GET Google Calendar events (client-side, primary calendar)
      │
[Calendar grid] → month view, milestone dots per day
      │
[Milestone card] shows:
  - Title, dueDate, client name, completed checkbox
      │
[Toggle complete] → Firestore update: milestone.completed = true/false
      │
[+ Add Milestone button]
  → Modal: title, client, dayOffset from contract start, dueDate (auto-calc)
  → "Create Calendar Event" toggle
  → Submit → Firestore write + optional Google Calendar event creation
           → Firestore update: milestone.calendarEventId, calendarLink
```

---

### 3.7 Workspace Hub (`activeView === 'workspace'`)

```
[Load] → List Google Drive files (client-side, drive.readonly scope)
       → GET /api/tenants/:id/members
      │
[Drive Files section]:
  - File list: name, type icon, last modified, "Open" button
  - "Open" → termux-open-url or window.open()
      │
[Sheets section]:
  - "Export Leads" button → same as Lead Bank export flow
      │
[Team Members section]:
  - Table: email, role badge, joined date
  - "Invite Member" button → modal: email + role selector
  → POST /api/tenants/:id/members
      │
[Workspace Settings]:
  - Name (editable, owner only)
  - Slug (read-only after creation)
  - Plan badge
```

---

## 4. Cross-Cutting Navigation Rules

| Scenario | Behavior |
|----------|----------|
| Unauthenticated → any view | Redirect to Auth Gate |
| Token expired mid-session | Silent re-auth via `getIdToken(true)`, retry original request |
| Tenant switch | Re-fetch all active view data with new `X-Tenant-ID` header |
| `viewer` role → clicks destructive action | Button is disabled + tooltip: "Insufficient permissions" |
| API 500 error | Toast (red): "Server error. Try again." + console.error |
| Network offline | Toast (amber): "Connection lost. Reconnect to continue." |
| SSE connection lost | Auto-reconnect with 3s exponential backoff (max 3 retries) |
