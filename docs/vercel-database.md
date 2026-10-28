# Vercel Deployment & Database Architecture Guide

This document outlines the cloud deployment topology, database persistence models, environment variable requirements, and autonomous AI agent operations for **PodConnect Hub AI** on Vercel.

---

## 1. Vercel Cloud Architecture Overview

PodConnect Hub runs as a zero-config, single-repository fullstack application on Vercel:

| Component | Vercel Implementation | Characteristics |
|---|---|---|
| **Frontend SPA** | Vite React 19 bundled into `dist/` | Served globally via Vercel Edge CDN with sub-second asset delivery |
| **Serverless API Bridge** | Express app hosted at [`api/index.ts`](file:///data/data/com.termux/files/home/Projects/PodConnect-Hub/api/index.ts) | Routes `/api/(.*)` requests into Node.js 22+ serverless functions |
| **Routing Rewrites** | Configured in [`vercel.json`](file:///data/data/com.termux/files/home/Projects/PodConnect-Hub/vercel.json) | `/api/*` ➔ Serverless function; all other routes ➔ `/index.html` (SPA routing) |
| **Autonomous MCP Server** | Hosted at `/api/mcp` | Lightweight JSON-RPC 2.0 interface for AI assistants and agent swarms |

---

## 2. Database Models & Storage Topologies

### A. Cloud Firestore (Primary Persistent Database)
- **Role**: Durable, cross-session storage for client profiles (`/clients`), persistent CRM leads (`/leads`), and campaign milestones (`/milestones`).
- **Owner-Scoped Security**: Firestore Security Rules in [`firestore.rules`](file:///data/data/com.termux/files/home/Projects/PodConnect-Hub/firestore.rules) guarantee tenant and user isolation (`request.auth.uid == resource.data.userId`).
- **Persistence**: 100% durable in Google Cloud; persists across cold-starts, redeployments, and server restarts.

### B. SQLite in `/tmp` (Serverless Staging & Session Cache)
- **Location**: `os.tmpdir()` (`/tmp/podconnect_leads.db`).
- **Role**: High-speed relational engine (via Node 22 native `node:sqlite`) for:
  - Multi-tenant workspace metadata (`tenants`, `tenant_members`).
  - Active user and agent sessions (`sessions`).
  - Personal Agent API keys (`agent_api_keys`).
  - Scraper pre-import staging queue (`staged_leads`).
- **Serverless Constraint**: Vercel lambdas have a read-only filesystem except `/tmp`. Data in `/tmp` is preserved across warm invocations of the same function instance, but resets on new cold-start instances.

### C. External Relational Database (Optional Production Upgrade)
If you require SQLite relational tables (`tenants`, `agent_api_keys`) to persist across lambdas without re-seeding:
- Use an edge database like **Turso** (libSQL/SQLite over HTTP), **Neon** (serverless Postgres), or **Supabase**.
- Set `DATABASE_URL` in Vercel environment variables to connect.

---

## 3. Required Environment Variables Matrix

Configure these variables in **Vercel Project Settings > Environment Variables**:

### Frontend Client Variables (Vite Bundled, prefixed with `VITE_`)
*Vite injects these into browser client bundles at build time:*

| Variable Name | Required | Description | Example |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | **Yes** | Firebase Web API Key | `AIzaSyBjruizvq6pq...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Yes** | Firebase Auth domain | `my-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | **Yes** | Google Cloud / Firebase Project ID | `my-project-12345` |
| `VITE_FIREBASE_STORAGE_BUCKET` | **Yes** | Firebase Storage bucket | `my-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | **Yes** | Cloud Messaging sender ID | `795913807202` |
| `VITE_FIREBASE_APP_ID` | **Yes** | Firebase Web App ID | `1:795913807202:web:4d893e1...` |
| `VITE_FIREBASE_DATABASE_ID` | Optional | Firestore database ID | Leave blank for `(default)` |
| `VITE_API_URL` | Optional | Backend API base URL override | Leave blank on Vercel (same-origin `/api` rewrites apply) |

### Serverless API Variables (Node.js Runtime on Vercel)
*Accessed securely by serverless functions in [`api/index.ts`](file:///data/data/com.termux/files/home/Projects/PodConnect-Hub/api/index.ts):*

| Variable Name | Required | Description | Example |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | Google AI Studio Key (Gemini 2.5 Flash + Search Grounding) | `AIzaSy...` |
| `AGENT_SECRET_KEY` | **Yes** | Master secret key for autonomous MCP agent access | `agent_sec_...` |

---

## 4. How to Generate and Store `AGENT_SECRET_KEY`

### Step 1: Generate a Cryptographically Strong Secret Key
Run this in your terminal:

```bash
# Option A: Using Node.js crypto
node -e "console.log('agent_sec_' + crypto.randomBytes(24).toString('hex'))"

# Option B: Using OpenSSL
echo "agent_sec_$(openssl rand -hex 24)"
```

### Step 2: Store it in Vercel

#### Method A: Via Vercel CLI (Recommended)
```bash
# In your terminal inside PodConnect-Hub:
vercel env add AGENT_SECRET_KEY production
# When prompted, paste your generated key.

# Optionally add to preview environments:
vercel env add AGENT_SECRET_KEY preview
```

#### Method B: Via Vercel Web Dashboard
1. Open [vercel.com](https://vercel.com) and navigate to your **PodConnect-Hub** project.
2. Go to **Settings > Environment Variables**.
3. Under **Key**, enter `AGENT_SECRET_KEY`.
4. Under **Value**, paste your generated secret key.
5. Select **Production**, **Preview**, and **Development**, then click **Save**.
6. Trigger a redeployment for changes to take effect.

---

## 5. The `PODCONNECT_URL` Scoping Standard

> [!IMPORTANT]
> **Do I need to store `PODCONNECT_URL` in Vercel configs?**
>
> **On Vercel: NO.**
> Inside the deployed Vercel application, the React frontend and Express API routes share the exact same origin. Requests to `/api/*` resolve relatively without needing an absolute domain.
>
> **On Local AI Agents & MCP Clients: YES.**
> External AI agents (e.g. Antigravity, Claude Desktop, Cursor, OpenCode) running on your local machine need to know the remote Vercel HTTPS endpoint to communicate with the cloud MCP gateway:
> ```json
> {
>   "mcpServers": {
>     "podconnect-hub": {
>       "command": "python3",
>       "args": ["/path/to/PodConnect-Hub/mcp/podconnect_mcp.py"],
>       "env": {
>         "PODCONNECT_URL": "https://<your-project>.vercel.app",
>         "AGENT_SECRET_KEY": "pca_live_your_personal_user_key"
>       }
>     }
>   }
> }
> ```

---

## 6. Multi-Tenant User Agent Secret Key & MCP Gateway

PodConnect Hub supports multi-tenant, user-scoped agent authentication:

```
┌────────────────────────────────────────────────────────┐
│ 1. User logs in via Google/Firebase Auth               │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ 2. Backend auto-provisions user key: pca_live_<hash>   │
│    Stored in SQLite `agent_api_keys` and bound to user │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ 3. User clicks "Agent MCP" in the Header               │
│    Copies personal key & 1-click tailored MCP JSON     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ 4. External Agent (Antigravity/OpenCode/Claude)        │
│    Connects to cloud Vercel /api/mcp using user key    │
│    All actions are strictly isolated to user's tenant  │
└────────────────────────────────────────────────────────┘
```

1. **Auto-Provisioning**: When any user signs in, an Agent Secret Key (`pca_live_...`) is generated and tied directly to their `userId` and `tenantId`.
2. **Tenant Isolation**: When an agent sends requests with that key, the cloud API resolves their exact workspace tenant with `owner` role.
3. **1-Click MCP Config**: The **"Agent MCP"** modal in the UI generates ready-to-paste configurations for Antigravity, Claude, and Cursor.
4. **Key Rotation**: Users can rotate their personal key at any time, instantly revoking previous keys.

---

## 7. Verifying Cloud Deployment

Verify that your Vercel deployment and agent authentication are working correctly:

```bash
node ./scratch/test_live_agent_auth.ts https://<your-project>.vercel.app <YOUR_AGENT_SECRET_KEY>
```

Expected output:
```text
🤖 PodConnect Hub — Agent Auth & Live MCP Test Suite
[Test 1] Public Health Check (GET /api/health) ... ✅ PASS
[Test 2] Public MCP Manifest (GET /api/mcp) ... ✅ PASS
[Test 3] Agent Auth Rejection without Credentials (GET /api/auth/agent) ... ✅ PASS
[Test 4] Agent Auth Rejection with Invalid Key (POST /api/auth/agent) ... ✅ PASS
[Test 5] Agent Authentication via POST /api/auth/agent ... ✅ PASS
[Test 6] Verify Session via GET /api/auth/agent (Bearer sessionToken) ... ✅ PASS
[Test 7] Verify Direct Key via GET /api/auth/agent (x-agent-key header) ... ✅ PASS
[Test 8] Authenticated MCP JSON-RPC Handshake (initialize) ... ✅ PASS
[Test 9] Authenticated MCP Tool Execution (get_workspace_stats) ... ✅ PASS
Results: 9/9 tests PASSED
```
