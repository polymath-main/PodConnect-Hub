# PodConnect Hub AI — Agent Instructions

> **This file MUST be read before executing any task in this repository.**
> Every AI coding agent, IDE plugin, or automated assistant operating on this codebase must follow the workflow defined here.

---

## 1. Read-First Protocol

Before writing any code, making any change, or answering any architecture question about this project, you MUST read the following 6 documents **in order**:

| # | File | What It Tells You |
|---|------|------------------|
| 1 | [`docs/01_PRD.md`](./docs/01_PRD.md) | What the product is, who it's for, user stories, and what is OUT OF SCOPE |
| 2 | [`docs/02_AppFlow.md`](./docs/02_AppFlow.md) | Every screen's state machine, navigation routes, button actions, error states |
| 3 | [`docs/03_UI_Spec.md`](./docs/03_UI_Spec.md) | Exact hex colors, typography scale, spacing tokens, and all component states |
| 4 | [`docs/04_TRD.md`](./docs/04_TRD.md) | Locked tech stack (exact versions), folder structure, API routes, security rules |
| 5 | [`docs/05_Schema.md`](./docs/05_Schema.md) | Full database schema (SQLite + Firestore), indexes, RLS rules, RBAC matrix |
| 6 | [`docs/06_Plan.md`](./docs/06_Plan.md) | Atomic implementation checklist — what is done, what is next, in dependency order |

**Do not proceed with any implementation until you have read all 6 documents.**

---

## 2. Update Protocol

After completing any implementation step:

1. Open [`docs/06_Plan.md`](./docs/06_Plan.md)
2. Find the checkbox for the step you just completed
3. Change `[ ]` to `[x]`
4. Append: ` {ISO-8601-timestamp} — {one-line summary of what was done}`

Example:
```
- [x] 2026-10-25T18:00:00+06:00 — Created EmailService with Resend SDK, rate limiting, and webhook handler
```

This keeps the plan file as the **live source of truth** for project state.

---

## 3. Architecture Constraints

### Technology
- **Do not add new dependencies** without checking `docs/04_TRD.md` first
- **Do not change library versions** — all versions are locked; breaking peer deps on aarch64/Termux is a known risk
- **Run `npm install` with `--legacy-peer-deps`** always

### Code Style
- **TypeScript strict mode** — no `any` unless explicitly justified with a comment
- **All server queries use `req.tenantId`** — never query without tenant scope
- **Parameterized SQL only** — no string interpolation in database calls
- **All new API routes** must apply `authMiddleware` and document in `docs/04_TRD.md`

### Design
- **Dark-only theme** — never introduce light mode variables or conditional theming
- **All hex values from `docs/03_UI_Spec.md`** — never invent new colors
- **All spacing in multiples of 4px** — use `--space-*` tokens

### Termux / Android
- **Binary paths**: `$PREFIX/bin/` not `/usr/bin/`
- **Python packages**: `pip install --break-system-packages <pkg>`
- **Max 2 concurrent scraper workers** — do not increase without memory analysis
- **No unbounded filesystem scans**: use `fd` or `rg` with explicit path scope
- **SQLite**: use `node:sqlite` (Node 24 built-in) — do not install `better-sqlite3`

---

## 4. Workflow Checklist (Per Task)

```
1. [ ] Read all 6 docs (or confirm they were read this session)
2. [ ] Check docs/06_Plan.md — find the next TODO step
3. [ ] Implement the step
4. [ ] Run: npm run lint                  (must exit 0)
5. [ ] Run: npx vite build               (must exit 0)
6. [ ] Run: QA analyzer on changed files
7. [ ] Update docs/06_Plan.md: mark step [x] with timestamp
8. [ ] If schema changed: update docs/05_Schema.md
9. [ ] If new API routes added: update docs/04_TRD.md
10. [ ] If new user story implemented: update docs/01_PRD.md
```

---

## 5. Anti-Hallucination Rules

- **Never invent API routes** that aren't in `docs/04_TRD.md` or `server.ts`
- **Never invent color values** outside `docs/03_UI_Spec.md`
- **Never reference table columns** that aren't in `docs/05_Schema.md`
- **Never mark a step complete** unless the code compiles and lint passes
- **If something is unclear**, read the relevant doc again before guessing
- **Never implement Out-of-Scope features** listed in `docs/01_PRD.md §5`

---

## 6. Environment Setup (New Machine / Session)

```bash
# Termux only
pkg install nodejs-lts python

# Install deps
cd /data/data/com.termux/files/home/Projects/PodConnect-Hub
npm install --legacy-peer-deps

# Set environment
cp .env.example .env
# Add GEMINI_API_KEY and Firebase config

# Run dev server
npm run dev   # tsx server.ts + vite dev

# Verify
curl http://localhost:3000/api/health
```

---

## 7. Key File Map

| File | Purpose |
|------|---------|
| `server.ts` | Express API server (all `/api/*` routes) |
| `src/server/db.ts` | `DatabaseService` singleton — all SQLite operations |
| `src/server/auth.ts` | `authMiddleware` + `requireRole()` — RBAC enforcement |
| `src/server/queue.ts` | `JobQueueManager` — scrape job concurrency, SSE streams |
| `src/lib/api.ts` | Frontend typed API client — all `fetch()` calls go here |
| `src/types/index.ts` | All TypeScript interfaces and type unions |
| `scraper.py` | Python podcast discovery (spawned as subprocess by queue) |
| `firebase-applet-config.json` | Firebase client config (committed, public-safe) |
| `firestore.rules` | Firestore security rules |
| `podconnect_leads.db` | SQLite WAL database (gitignored, generated at runtime) |
