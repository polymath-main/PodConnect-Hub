# Blueprint: Client Management System & Staging Automation Engine

## 1. System Objectives & Architecture
The Client Management System provides an enterprise operations control center for PodConnect Hub AI. It transitions raw onboarded client agreements through a structured, multi-stage delivery pipeline, tracks contract health, executes automated stage transitions, coordinates Google Workspace synchronizations (Docs, Sheets, Calendar), and provides a formal Order Cancellation workflow with audit logging and asset cleanup.

---

## 2. Core Modules & Data Schemas

### A. Extended Types (`/src/types/index.ts`)
- **`ClientStage`**:
  - `Onboarding`: Initial transcript ingestion, ID creation (`C001`, `C002`).
  - `Scoping`: Requirements doc generation, messaging pillars & credibility asset validation.
  - `Lead Sourcing`: Autonomous multi-source podcast scraping, directory harvesting, $\ge 1\text{k}$ subs filtering.
  - `Outreach Active`: Personalized pitch drafting, email sequences, Gmail dispatching.
  - `Interview Scheduled`: Placement confirmation, show booking, calendar date confirmed.
  - `Completed`: Contract deliverables fulfilled, wrap-up review complete.
  - `Paused`: Temporary client hiatus.
  - `Cancelled`: Terminated agreement with documented cancellation reason, settlement terms, and calendar cleanup.
- **`ClientStatus`**: `'Active' | 'Paused' | 'Cancelled' | 'Completed'`
- **`CancellationDetails`**:
  - `reason`: Reason code/string (Budget Freeze, Strategy Pivot, Scheduling Conflict, Mutual Agreement, Terms Non-Compliance, Other)
  - `cancelledAt`: ISO date timestamp
  - `settlementType`: `'Full Refund' | 'Partial Settlement' | 'Retained as Credit' | 'Non-Refundable (Delivered)'`
  - `settlementAmount`?: string
  - `notes`?: string
  - `archiveCalendarEvents`: boolean
  - `cancelledBy`: string
- **`StageHistoryEntry`**:
  - `fromStage`: ClientStage
  - `toStage`: ClientStage
  - `timestamp`: string
  - `note`?: string
- **`Client`**:
  - `stage`: ClientStage
  - `orderNumber`?: string (e.g. `ORD-2026-C001`)
  - `cancellationDetails`?: CancellationDetails
  - `stageHistory`?: StageHistoryEntry[]
  - `targetPlacements`?: number
  - `bookedPlacements`?: number

---

## 3. Component Architecture & Separation of Concerns

```
src/components/clients/
├── ClientManagementView.tsx      # Main View orchestrator (Metrics, View switcher, Filters)
├── ClientStagingPipeline.tsx     # Kanban board with stage columns & quick actions
├── ClientsTableListing.tsx       # High-density operational data table with filters
├── ClientCancellationModal.tsx   # Formal Order Cancellation workflow & settlement modal
├── ClientDetailDrawer.tsx        # Slide-over order inspector, timeline & deliverables
└── StagingAutomationBanner.tsx   # Visual staging automation triggers & execution monitor
```

---

## 4. Staging Automation Triggers
1. **Onboarding -> Scoping**:
   - Triggers check for `Client_Requirements_<ClientName>` Google Doc.
   - If missing, offers 1-click generation from message pillars.
2. **Scoping -> Lead Sourcing**:
   - Pre-configures search dorks and niche parameters for the scraping engine.
   - Deep-links operator directly into Scraper Console with client context.
3. **Lead Sourcing -> Outreach Active**:
   - Pre-loads discovered high-scoring leads into the pitch generator.
   - Deep-links operator into Outreach Hub with selected client.
4. **Outreach Active -> Interview Scheduled**:
   - Marks interview milestone completed and records event on Google Calendar.
   - Increments `bookedPlacements` counter.
5. **Stage -> Cancelled**:
   - Prompts Order Cancellation Modal with settlement policy and notes.
   - Optional purge or prefix `[CANCELLED]` on Google Calendar milestones.
   - Updates Master Google Sheet row status to `Cancelled`.
   - Syncs updated client state to Cloud Firestore.

---

## 5. Google Workspace & Firestore Synchronization
- **Google Sheets**:
  - Helper `updateClientInMasterSheet(spreadsheetId, client)` reads existing rows and updates row in-place matching `client.id`.
- **Google Calendar**:
  - Helper `cancelClientMilestonesOnCalendar(client, purgeEvents)` cleans up or marks events cancelled.
- **Cloud Firestore**:
  - Persists `stage`, `status`, `cancellationDetails`, `stageHistory`, and `bookedPlacements` in `/clients/{clientId}`.

---

## 6. Implementation Sequence
1. Update `/src/types/index.ts` with new stages, cancellation structures, and history entries.
2. Add Google Sheets in-place update and Calendar cancellation helpers to `/src/lib/workspace.ts`.
3. Build `/src/components/clients/ClientCancellationModal.tsx`.
4. Build `/src/components/clients/ClientDetailDrawer.tsx`.
5. Build `/src/components/clients/ClientStagingPipeline.tsx`.
6. Build `/src/components/clients/ClientsTableListing.tsx`.
7. Build `/src/components/clients/StagingAutomationBanner.tsx`.
8. Build `/src/components/clients/ClientManagementView.tsx`.
9. Integrate into `/src/App.tsx`, `/src/components/Sidebar.tsx`, and `/src/components/Header.tsx`.
10. Verify via `compile_applet` and test edge cases.
