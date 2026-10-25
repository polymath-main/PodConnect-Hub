# 01 — Product Requirements Document (PRD)
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Active

---

## 1. Problem Statement

Podcast guest booking agencies, PR freelancers, and talent managers operate across 5–8 fragmented tools simultaneously: spreadsheets for lead tracking, Gmail for outreach, Google Docs for pitch drafts, Spotify/Apple Podcasts for discovery, and Calendly for scheduling. This creates:

- **Manual data entry loops**: Hosts scraped from one tool must be re-entered into another
- **Context switching tax**: Switching between tabs loses client-specific context
- **No quality gate**: Unqualified leads pollute the active outreach pipeline
- **No AI leverage**: Pitch drafts are written from scratch for every show; no learning
- **Zero workspace isolation**: All clients share one flat spreadsheet; data leaks between accounts

**PodConnect Hub AI** is a single-pane-of-glass SaaS platform that unifies lead sourcing, AI pitch generation, Gmail dispatch, Google Workspace sync, milestone tracking, and client pipeline management — all within a multi-tenant, role-gated workspace.

---

## 2. Target Persona

### Primary — Podcast Booking Agency Owner
- Manages 5–20 active clients simultaneously
- Needs rapid context switching between client workspaces
- Must control team RBAC (managers, assistants, contractors)
- Billable by placement; maximizes throughput per client

### Secondary — Freelance Podcast Booking Manager
- Solo operator, 1–5 clients
- Needs fast AI-assisted pitching and scraping
- No team management required; single-user workspace

### Tertiary — In-House PR/Marketing Manager
- Works inside one brand's team
- Needs structured milestone tracking and Google Workspace integration
- Reads-only analytics for stakeholder reporting

---

## 3. MVP User Stories

### Epic A: Client Management
- **A1**: As an agency owner, I can create a new client profile with name, niche, platform preference, subscriber minimum, contract dates, and target placement count, so I have a single source of truth for each engagement.
- **A2**: As a manager, I can drag a client card between pipeline stages (`Onboarding → Scoping → Lead Sourcing → Outreach Active → Interview Scheduled → Completed`) and the system auto-records the timestamp and actor in stage history.
- **A3**: As an owner, I can cancel a client with a reason, settlement type, and notes; the client moves to `Cancelled` state and its calendar events are optionally archived.

### Epic B: Client Onboarding & AI Extraction
- **B1**: As a manager, I can paste a raw conversation transcript URL (Google Doc) and trigger AI extraction to auto-populate the client's niche, ICP (Ideal Customer Profile), message pillars, credibility assets, and pitch angle — all without manual re-entry.
- **B2**: As a manager, I can approve, edit, or reject the AI-extracted fields before they are written to Firestore.
- **B3**: As a manager, I can sync the finalized client profile to a Google Requirements Doc and Outreach Strategy Doc with one click.

### Epic C: Lead Sourcing (Scraper + Gemini)
- **C1**: As a manager, I can submit a scrape job with niche keywords, minimum subscriber count, target count, and client assignment — the job enters a capped queue (max 2 concurrent workers) and I see real-time progress via SSE.
- **C2**: As a manager, I can view all staged leads (the holding area) per client, inspect each lead's show name, host, platform, URL, email, subscribers, niche, tags, score, and location before approving.
- **C3**: As a manager, I can approve selected staged leads (moves them to the active leads database) or reject them (deletes from staging), maintaining a clean pipeline.
- **C4**: As an owner, I can cancel a running job; the worker receives SIGTERM and the job status updates to `cancelled`.

### Epic D: Outreach & Pitch Generation
- **D1**: As a manager, I can select one or more approved leads and trigger AI pitch generation using the client's ICP, message pillars, credibility assets, and pitch angle as context.
- **D2**: As a manager, I can edit the generated pitch draft inline before dispatching.
- **D3**: As a manager, I can dispatch a pitch to a lead's email via Gmail API directly from the UI; the lead status transitions to `Dispatched`.

### Epic E: Google Workspace Integration
- **E1**: As a manager, I can export the full leads database for a client to Google Sheets with column headers and data formatting preserved.
- **E2**: As a manager, I can view, open, and navigate all Google Drive files associated with a client workspace from within the hub.
- **E3**: As a manager, I can create a new Google Calendar milestone event for a client and see it reflected in the milestones view.

### Epic F: Multi-Tenant Workspace
- **F1**: As an owner, I can create a new workspace with a name and slug; I am auto-assigned the `owner` role.
- **F2**: As an owner or admin, I can invite team members by email with a role (`admin | manager | member | viewer`).
- **F3**: As a user, I can switch between workspaces I belong to; all views reload scoped to the selected workspace's `tenant_id`.

---

## 4. Success Metrics

| Metric | Target (90-day) |
|--------|----------------|
| Leads discovered per scrape session | ≥ 15 qualified leads |
| Pitch draft generation time | ≤ 8 seconds |
| Leads-to-Dispatched conversion rate | ≥ 60% of approved leads |
| Stage transition time (Onboarding → Outreach Active) | ≤ 48 hours |
| Client profile AI extraction accuracy | ≥ 85% field accuracy vs. manual |
| Job queue throughput | 2 concurrent jobs, no deadlock |
| Multi-tenant data isolation failures | 0 (zero tolerance) |

---

## 5. Out of Scope (Non-Goals for MVP)

> [!IMPORTANT]
> The following are explicitly excluded. Do not implement, reference, or design towards these in the current phase.

- **Mobile application** (iOS/Android native; responsive web only)
- **White-label / custom domain** for workspace tenants
- **Subscription billing** (Stripe integration is Phase 5; no payment flows now)
- **Email sequence automation** (drip campaigns, follow-up scheduling)
- **Advanced analytics dashboards** (conversion funnels, revenue attribution)
- **Light mode theme** (dark-only; no theme toggle)
- **Real-time collaborative editing** (Google Docs-style multi-cursor)
- **Webhook ingestion** from external CRMs (Salesforce, HubSpot)
- **SMS / WhatsApp outreach** channels
- **AI model fine-tuning** on user pitch data
- **Lead deduplication ML** (rule-based dedup by `client_id + show_name` only)
- **Role-based field-level permissions** (table-level RLS only)
