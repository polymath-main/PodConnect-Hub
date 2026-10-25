# Blueprint: Autonomous Lead Generation, Staging & Centralized Lead Bank

## 1. System Objectives
Provide an end-to-end, real-world lead management architecture connecting client requirements, autonomous scraping, pre-import staging/data review, a persistent niche/tag-based lead database, personalized pitch synthesis, and synchronized campaign completion.

---

## 2. Core Architecture & Modules

### Module 1: Client Selection & Niche Profiling
- Real-time client session context: Client ID, Name, Target Niche, Platform, ICP criteria (keywords, location, subscriber threshold).
- Sourcing console auto-configures parameters directly from active client profile.

### Module 2: Lead Sourcing & Scraping Engine
- Backend Python scraper & Gemini Search Grounding output directly into a dedicated **Staging Ledger** (`staged_leads` SQLite table).
- Automatic tag generation: based on niche keywords, platform, host presence, and audience size.
- Email extraction and validation using robust regex with domain deduplication.

### Module 3: Pre-Import Staging & Data Selection
- Staging table before database commitment:
  - Multi-select checkboxes for bulk operations.
  - Inline / Modal editing: Correct email addresses, edit show title, host name, platform, subscriber count, and tags.
  - Discard/delete low-quality or irrelevant staged leads.
  - Approval Gate: "Approve & Import Selected Leads" commits staged leads into the central database.

### Module 4: Centralized Lead Database (Niche & Tag-Based)
- Schema:
  - `id`: Unique integer / ID
  - `clientId`: Foreign key to active client
  - `showName`: Podcast title
  - `hostName`: Primary host or producer
  - `platform`: Apple Podcasts, YouTube, Spotify, RSS, Buzzsprout, etc.
  - `showUrl`: Show landing page or directory url
  - `feedUrl`: Direct RSS feed
  - `email`: Public verified contact email
  - `subscribers`: Audience metric
  - `niche`: Primary industry / category
  - `tags`: Array of string tags (e.g. `["B2B SaaS", "DevOps", "AI", "Founder", "US"]`)
  - `score`: Calculated quality rating (1.0 - 10.0)
  - `status`: `Imported`, `Pitch Drafted`, `Contacted`, `Replied`, `Converted`, `Archived`
  - `notes`: Custom operator metadata
  - `dateAdded`: Timestamp
- Persistence: SQLite `leads` table + Cloud Firestore `/leads/{leadId}` with user authentication.
- Retrieval: Filterable by Niche, Tags, Status, Platform, and Client. Enables reusing high-value leads across future campaigns.

### Module 5: Pitch Generation & Outreach
- Cross-references lead show name & host with active client's `messagePillars`, `credibilityAssets`, and `samplePitchAngle`.
- Generates high-converting tailored outreach via `gemini-3.8-flash`.
- Automatically transitions lead status to `Contacted` upon Gmail dispatch.

### Module 6: Full Pipeline Synchronization & Job Completion
- When lead reaches `Converted` (Booked):
  - Automatically updates client booked placements count.
  - Advances or marks milestone completed.
  - Transitions client stage to `Interview Scheduled`.
- When all contract milestones/placements are fulfilled:
  - Prompts completion and archives campaign to `Completed`.
- Synchronizes with Google Sheets Master and Google Calendar.

---

## 3. Implementation Steps
1. Update `/src/types/index.ts` with `LeadStatus`, `StagedLead`, `tags`, `icp`, `notes`.
2. Update `scraper.py` and `server.ts` with `staged_leads` table, CRUD endpoints, and auto-tagging.
3. Build `/src/components/leads/LeadEditModal.tsx` for editing staged and imported leads.
4. Build `/src/components/leads/LeadStagingPanel.tsx` for review, bulk selection, editing, discarding, and approval gate.
5. Build `/src/components/leads/CentralLeadBankView.tsx` for tag-based filtering, niche exploration, and client re-assignment.
6. Upgrade `/src/components/ScraperConsoleView.tsx` with Client Niche profiling, Staging tab, and Central Lead Bank.
7. Verify synchronization with `/src/components/OutreachHubView.tsx` and `/src/components/clients/ClientManagementView.tsx`.
8. Test and compile with `lint_applet` and `compile_applet`.
