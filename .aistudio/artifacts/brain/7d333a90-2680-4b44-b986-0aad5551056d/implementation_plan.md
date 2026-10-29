# Implementation Plan: Authentication Security Hardening & Event Logs Dashboard

## 1. Problem Statement & Objectives
A source code security review highlighted critical authentication risks in `src/server/auth.ts` and `server.ts`:
1. **Unauthenticated Fallback Identity**: Requests lacking credentials fell back to `operator_system` (`operator@podconnect.agency`) with `owner` privileges instead of returning `401 Unauthorized`.
2. **Predictable Default Secret**: `validateAgentKey` accepted a hardcoded fallback string (`agent_secret_default_podconnect`) if `AGENT_SECRET_KEY` was unset.
3. **Unverified Headers & JWT Claims**: Raw `x-user-id` and `x-user-email` headers and unverified JWT payloads could allow identity spoofing.
4. **Unprotected Credential & AI Endpoints**: `/api/user/agent-key` and `/api/gemini/extract-transcript` lacked strict fail-closed enforcement.

Additionally, the user requested an **Event Console Logs Dashboard** accessible as a dedicated tab in the main navigation, displaying real-time event logs with search/filtering and one-click JSON/CSV exports for administrative sharing and auditing.

---

## 2. Proposed Architecture & Remediation

### Phase 1: Authentication & Authorization Security Remediation (Fail-Closed)
- **Fail-Closed `authMiddleware`**:
  - Completely eliminate the `operator_system` fallback identity.
  - Require valid authentication credentials on every protected API route:
    - **Firebase Authentication Token**: Verified via Firebase Auth token structure.
    - **User Agent Key**: Verified via stateless HMAC-SHA256 signature (`pca_live_<payload>_<signature>`) against server secret.
    - **Workspace Agent Key**: Verified against stored tenant hashes or strict server secret.
  - Reject requests without valid credentials with HTTP `401 Unauthorized`.
  - Disallow raw `x-user-id` and `x-user-email` header spoofing without cryptographic proof.
- **Remove Predictable Static Default Secrets**:
  - Remove `agent_secret_default_podconnect`. If `AGENT_SECRET_KEY` is not configured, generate a secure dynamic runtime fallback or fail closed immediately.
- **Endpoint Protection**:
  - Secure `/api/user/agent-key`: Restrict strictly to authenticated users with verified identities; unauthenticated callers receive `401`.
  - Ensure `/api/gemini/extract-transcript` and `/api/gemini/discover-shows` strictly require authenticated sessions.
  - Audit `/api/db/query` and MCP endpoints for tenant isolation and role restrictions (`owner`/`admin`).
- **Vercel API Gateway Verification**:
  - Validate that `vercel.json` rewrites and `api/index.ts` forward the full request path, headers, and authorization headers to the Express application without dropping query parameters or tokens.

### Phase 2: Centralized Event Logging Service (`src/server/eventLogger.ts`)
- **Event Logger Engine**:
  - Structured log schema: `id`, `timestamp`, `level` (`INFO`, `WARN`, `ERROR`, `AUTH`, `AUDIT`, `MCP`), `category` (`auth`, `api`, `scraper`, `email`, `database`, `mcp`, `system`), `message`, `tenantId`, `userId`, `ipAddress`, `metadata`.
  - Dual storage:
    - High-speed in-memory ring buffer (last 1,000 events) for real-time querying and low-latency dashboard loads.
    - SQLite persistence in `system_logs` table for durable audit history across sessions.
  - Automatic interception of console errors/warnings, failed authentication attempts, MCP tool invocations, email dispatches, and scraping jobs.
- **Backend Log Endpoints**:
  - `GET /api/system/logs`: Query logs with filters (`level`, `category`, `search`, `limit`, `offset`).
  - `GET /api/system/logs/export`: Download formatted audit logs in both **JSON** and **CSV** formats with Content-Disposition headers.
  - `DELETE /api/system/logs`: Clear logs (restricted strictly to authenticated `owner` role).

### Phase 3: Event Console Logs Dashboard Frontend (`src/components/logs/LogsDashboardView.tsx`)
- **Main Navigation Integration**:
  - Add **"Logs & Audit"** tab to `src/components/Header.tsx` and route state in `src/App.tsx`.
- **Dashboard Features**:
  - Real-time log stream with auto-refresh toggle (every 3s) and manual refresh.
  - Level filter pills: All, Error, Warn, Info, Auth, Audit, MCP.
  - Category and full-text keyword search.
  - Interactive log detail drawer showing request context, IP, user ID, and formatted JSON metadata.
  - **Export to JSON**: One-click download of filtered or full audit log bundle.
  - **Export to CSV**: Formatted spreadsheet download with timestamps, levels, categories, users, and messages.
  - **Copy for Admin**: One-click clipboard copy of sanitized error and audit logs formatted for sharing with support or system administrators.

---

## 3. Verification & Testing Plan
1. **Automated Security Verification**:
   - Execute test scripts (`scratch/test_security_fail_closed.ts`):
     - Unauthenticated request to `/api/leads` -> Verify returns `401 Unauthorized`.
     - Unauthenticated request to `/api/user/agent-key` -> Verify returns `401 Unauthorized`.
     - Request with spoofed `x-user-id` -> Verify rejected or ignored without valid signature.
     - Request with old hardcoded secret `agent_secret_default_podconnect` -> Verify rejected with `401`.
     - Request with valid signed key -> Verify accepted with proper tenant isolation.
2. **Event Logging & Export Verification**:
   - Trigger sample events (auth, scraping job, lead update, direct query).
   - Verify logs appear in `/api/system/logs` and the Logs Dashboard.
   - Verify CSV export parses cleanly into RFC-4180 CSV columns.
   - Verify JSON export contains full structured metadata.
3. **Code Quality**:
   - Run `lint_applet` (`tsc --noEmit`) to verify 0 TypeScript errors.
   - Run `compile_applet` to confirm successful production bundle build.
