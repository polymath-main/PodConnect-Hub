# PodConnect Hub AI — Enterprise Podcast Lead Sourcing & Operations Engine

PodConnect Hub AI is an autonomous enterprise operations platform and podcast marketing manager designed to handle end-to-end freelancer-client onboarding, chat transcript archiving, master database synchronization, milestone scheduling, and multi-source podcast lead scraping and outreach.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural parameters were clarified and confirmed during initial consultation and will guide the build:

- **Confirmed Decision 1 (Scraping Architecture)**: Full-stack hybrid engine with backend scraper execution, real-time log streaming (SSE/WebSocket), live SERP dorking via Google Search grounding (`gemini-3.8-flash`), public RSS parsing, and robust regex email extraction with polite token-bucket rate limits.
- **Confirmed Decision 2 (Google Workspace Integration)**: Full Google Workspace Suite configured via `set_up_oauth` and Firebase Auth covering Google Drive, Google Docs (Conversation Export & Requirements Docs), Google Sheets (`Client_Database_PodConnect_Master`), Google Calendar (milestone scheduling), and Gmail (pitch review & dispatch).
- **Confirmed Decision 3 (Pitch Review & Dispatch Flow)**: Triple-mode outreach hub supporting:
  1. Interactive pitch modal with individual preview & 1-click Gmail dispatch.
  2. Batch queue dispatcher for multi-lead sequence outreach.
  3. Direct export to client-dedicated Google Docs (`Outreach_Strategy_<ClientName>`).

---

## 1. Overview & Core Concept

- **What It Does**: Centralizes podcast guest-placement agency operations into an integrated control room. Users can onboard clients by pasting chat/agreement transcripts, autonomously generate formatted client Google Docs, sync records to a Master Google Sheet, calculate contract phases (e.g. 120-day contracts with 30-day milestones) and publish events directly to Google Calendar, run ethical multi-source podcast scrapers against any niche, and dispatch personalized pitch emails.
- **Target Audience / Persona**: Podcast marketing managers, PR agencies, talent booking freelancers, and growth operators who manage guest-booking campaigns across multiple client niches.
- **Key Value**: Replaces fragmented manual workflows and paid third-party directory APIs (Listen Notes, YouTube Data API, Make/n8n) with a native, zero-cost, fully compliant sourcing and Google Workspace automation pipeline.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Client Ingestion & Archive**:
   - Operator pastes raw client agreement or onboarding chat transcript into the Ingestion Panel.
   - The engine parses deliverables, pricing, niche keywords, subscriber thresholds, and contract dates, assigning a unique sequential Client ID (`C001`, `C002`, etc.).
   - Operator clicks "Generate Workspace Assets": creates `Conversation_Export_<ClientName>` and `Client_Requirements_<ClientName>` in Google Docs, logs the entry into `Client_Database_PodConnect_Master` in Google Sheets with live hyperlinks, and schedules project milestones in Google Calendar.

2. **Autonomous Multi-Source Lead Sourcing**:
   - Operator selects an active client campaign or inputs custom search dorks and niche parameters.
   - Scraper runs multi-source queries: Google Search Grounding with `gemini-3.8-flash` for high-relevance show URLs, Apple Podcasts directory discovery, Buzzsprout/Captivate open feeds, and direct RSS ingestion.
   - Live streaming terminal log displays URL resolution, robots.txt checks, and extraction steps in real-time.
   - Scraped leads are parsed for title, host name, platform, subscriber/follower metrics, and public contact emails (via mailto and domain regex).
   - High-score leads ($\ge 1\text{k}$ subscribers, verified email) are deduplicated in SQLite and saved to the campaign ledger.

3. **Outreach & Campaign Dispatch**:
   - Scored leads are reviewed in the high-density Campaign Grid with sortable relevance scores, subscriber metrics, and contact statuses.
   - Operator can trigger one of three outreach methods:
     - *Modal Preview*: Tailor pitch template, preview Gmail draft, and send immediately.
     - *Batch Queue*: Select multiple validated leads and dispatch personalized Gmail sequences with throttle pacing.
     - *Docs Export*: Compile selected pitches into the client's `Outreach_Strategy_<ClientName>` document.

### Visual Identity & Theme

- **Aesthetic Direction**: High-density executive console inspired by modern enterprise operations platforms (Linear, Raycast, and Vercel Dashboard). Utilitarian, fast, dark slate palette with crisp typographic hierarchy and zero decorative clutter.
- **Color Palette**:
  - Neutral Canvas: Deep Obsidian (`#090D16`) and Slate Base (`#0F172A`).
  - Structural Surfaces: Surface Elevated (`#1E293B`), Hairline Borders (`rgba(255, 255, 255, 0.08)`).
  - Accent / Primary Action: Electric Indigo (`#6366F1`) and Sky Cyan (`#0EA5E9`).
  - Semantic Status: Active/Verified Emerald (`#10B981`), Warning Amber (`#F59E0B`), Critical Rose (`#F43F5E`).
- **Typography**:
  - Primary Display & Navigation: `Plus Jakarta Sans` for crisp brand structure.
  - Body Prose & Forms: `Public Sans` / `Plus Jakarta Sans` at 13px–15px for dense readability.
  - Data, Metrics & Console: `JetBrains Mono` with `tabular-nums` for subscriber counts, dates, and live scraping logs.
- **Component Styling & Layout**:
  - Full-width workspace canvas with responsive sidebar navigation (Clients, Lead Scraper, Master Database, Calendar Milestones, Outreach Hub, Workspace Settings).
  - Compact data grids (38px row height) with clean column alignment, status indicators, and keyboard-friendly actions.
  - Anti-Slop Discipline: No decorative pulsing dots, no code-comment titles, no static pill badge sandwiches, no floating cards within cards.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero External Paid API Sourcing**:
  - *Chosen Approach*: Native search dorking paired with server-side Google Search Grounding (`gemini-3.8-flash`), public RSS feed parsing, and BeautifulSoup/regex extraction.
  - *Why*: Eliminates subscriptions to expensive podcast directory databases while delivering up-to-date, niche-specific show links and hosts.
  - *Compliance*: Enforces robots.txt parsing and rate-limited token bucket fetchers.
- **Decision 2: Google Workspace OAuth & Client-Side Token Architecture**:
  - *Chosen Approach*: Single Google OAuth sign-in flow via Firebase Auth requesting scopes for Drive, Docs, Sheets, Calendar, and Gmail (`auth/drive.file`, `auth/documents`, `auth/spreadsheets`, `auth/calendar.events`, `auth/gmail.send`, `auth/gmail.compose`).
  - *Why*: Adheres to strict environment constraints where ephemeral preview URLs prohibit server-side redirect OAuth flows. Tokens are securely held in memory.
  - *Destructive Action Protection*: All file generation, row insertion, and email dispatches use explicit confirmation modals detailing target documents, recipients, and subject lines.
- **Decision 3: Multi-Client Lead Deduplication**:
  - *Chosen Approach*: Persistent SQLite database (`podconnect_leads.db`) with unique indexing on `(client_id, show_url, email)` plus global show deduplication flags.
  - *Why*: Prevents embarrassing duplicate pitches across multiple clients pitching the same podcast host.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PodConnect Hub AI (React 19 + Tailwind v4)           │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Client Database  │  │ Multi-Source     │  │ Outreach & Pitch     │  │
│  │ & Ingestion View │  │ Scraper Console  │  │ Dispatch Hub         │  │
│  └─────────┬────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│            │                    │                       │              │
│            ▼                    ▼                       ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │       Workspace State & OAuth Context (In-Memory Token Cache)    │  │
│  └─────────┬────────────────────┬───────────────────────┬───────────┘  │
└────────────┼────────────────────┼───────────────────────┼──────────────┘
             │                    │                       │
             ▼                    ▼                       ▼
  ┌───────────────────────┐ ┌──────────────┐ ┌───────────────────────────┐
  │ Google Workspace APIs │ │ Express/Node │ │ Google GenAI (Server)     │
  │ • Google Drive v3     │ │ Backend API  │ │ • gemini-3.8-flash        │
  │ • Google Docs v1      │ │ • RSS Engine │ │ • Google Search Grounding │
  │ • Google Sheets v4    │ │ • SQLite DB  │ │ • Requirement Extractor   │
  │ • Google Calendar v3  │ │ • SSE Stream │ │ • Personalized Pitcher    │
  │ • Gmail API v1        │ │ • Scraper    │ │                           │
  └───────────────────────┘ └──────────────┘ └───────────────────────────┘
```

### Data Models & State Schema

1. **Client Record**:
   - `id`: Unique string (`C001`, `C002`, etc.)
   - `name`: Client or brand name
   - `platform`: Primary platform (e.g., "YouTube", "Apple Podcasts", "Spotify")
   - `niche`: Primary niche keywords (e.g., "B2B SaaS, AI Infrastructure")
   - `package`: Selected package (e.g., "120-Day Growth Accelerator")
   - `pricing`: Total contract value and terms
   - `startDate`, `endDate`: Contract timeline
   - `milestones`: Array of `{ name, dueDate, completed, calendarEventId }`
   - `docs`: Links to `Conversation_Export`, `Client_Requirements`, and `Outreach_Strategy`
   - `status`: `'Onboarding' | 'Active' | 'Review' | 'Completed'`

2. **Scraped Lead Record**:
   - `id`: Auto-increment integer
   - `clientId`: Target client ID
   - `showName`: Podcast title
   - `hostName`: Primary host or producer
   - `platform`: Source platform (Apple, YouTube, Buzzsprout, RSS)
   - `showUrl`: Show landing page or directory link
   - `feedUrl`: Direct RSS feed URL
   - `email`: Discovered public contact email
   - `subscribers`: Estimated subscriber or listener count
   - `niche`: Matched niche
   - `score`: Relevance and quality score (1.0 – 10.0)
   - `status`: `'New' | 'Pitch Drafted' | 'Dispatched' | 'Booked' | 'Passed'`
   - `dateAdded`: Timestamp

3. **Workspace Configuration & State**:
   - `masterSheetId`: ID of `Client_Database_PodConnect_Master`
   - `driveFolderId`: Root PodConnect Hub Drive directory
   - `calendarId`: Primary Google Calendar target
   - `oauthUser`: Connected Google account profile & permissions

---

## 5. Phased Implementation Plan

1. **Phase 1: Workspace OAuth & Firebase Client Setup**:
   - Invoke `set_up_oauth` with `userConfirmedInUI: false` for Drive, Docs, Sheets, Calendar, and Gmail.
   - Configure Firebase Auth client initialization with in-memory token cache and official "Sign in with Google" modal button.
2. **Phase 2: Full-Stack Express Server & Scraper Core**:
   - Set up Express proxy routes (`/api/scrape`, `/api/scrape/stream`, `/api/leads`, `/api/gemini/extract-transcript`, `/api/gemini/generate-pitch`).
   - Implement Python-inspired robust RSS parser, Cheerio/BeautifulSoup DOM scraper, regex email extractor, and SQLite lead persistence layer.
   - Implement Gemini Search Grounding using `gemini-3.8-flash` with `{ googleSearch: {} }` for live SERP show discovery.
3. **Phase 3: Client Ingestion, Archiving & Master Sheet Syncing**:
   - Build client onboarding workspace: transcript parser, metadata extractor, and Google Doc generator (`Conversation_Export_<ClientName>`, `Client_Requirements_<ClientName>`).
   - Implement Google Sheets Master Database sync creating or updating `Client_Database_PodConnect_Master` with hyperlinks.
   - Implement autonomous Google Calendar event scheduler for milestone structuring (120-day contracts, 30-day review cycles).
4. **Phase 4: Multi-Source Scraping Console & Real-Time Terminal**:
   - Build interactive scraping controller with niche keyword inputs, subscriber threshold filters ($\ge 1\text{k}$), and target platform toggles.
   - Real-time log terminal with live SSE event feed displaying live crawling, robots.txt status, and parsed email findings.
5. **Phase 5: Outreach Pitch Hub (Modal, Queue, Docs)**:
   - Implement the triple outreach engine:
     1. Interactive pitch modal with AI personalization and 1-click Gmail sending (`gmail.send`).
     2. Batch queue dispatcher with throttled sending and confirmation modal.
     3. Direct export to `Outreach_Strategy_<ClientName>` Google Doc.
6. **Phase 6: Verification & End-to-End Testing**:
   - Test full onboarding flow, live scraping, SQLite deduplication, Google Workspace API calls, and compilation via `compile_applet`.
