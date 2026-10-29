#!/usr/bin/env python3
"""PodConnect Hub MCP Server (Zero-Dependency Stdio JSON-RPC 2.0).

Exposes PodConnect Hub CRM, lead discovery, staging pipeline, and pitch generation
tools directly to AI agents via the Model Context Protocol (MCP).

Transport:
  MCP stdio: newline-delimited JSON-RPC 2.0 on stdin/stdout.

Supports dual modes:
  1. Live HTTP/Serverless Mode: Bridges directly to PodConnect Hub API (Local or Vercel URL).
  2. Local SQLite Direct Mode: Fallback to local SQLite database when server is offline.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

SERVER_NAME = "podconnect-hub"
SERVER_VERSION = "2.0.0"
PROTOCOL_VERSION = "2024-11-05"

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "podconnect_leads.db"

# Default remote cloud production URL
DEFAULT_PROD_URL = "https://pod-connect-hub.vercel.app"

def get_server_url() -> str:
    return os.environ.get("PODCONNECT_URL", DEFAULT_PROD_URL).rstrip("/")

def get_agent_key() -> str:
    return os.environ.get("AGENT_SECRET_KEY", "agent_secret_default_podconnect")

def get_tenant_id() -> str:
    return os.environ.get("PODCONNECT_TENANT_ID", "tenant_default")

# In-memory cached session token
_CACHED_SESSION_TOKEN: Optional[str] = None


# ----------------------------------------------------------------------------
# HTTP Client Helper
# ----------------------------------------------------------------------------
def _http_request(endpoint: str, method: str = "GET", body: Optional[Dict[str, Any]] = None, token: Optional[str] = None) -> Dict[str, Any]:
    server_url = get_server_url()
    tenant_id = get_tenant_id()
    agent_key = get_agent_key()

    url = f"{server_url}{endpoint if endpoint.startswith('/') else '/' + endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-tenant-id": tenant_id,
        "User-Agent": f"PodConnect-MCP-Bridge/{SERVER_VERSION}",
    }

    gemini_key = os.environ.get("GEMINI_API_KEY")
    if gemini_key and not gemini_key.startswith("local-") and gemini_key != "your_gemini_api_key_here":
        headers["x-gemini-api-key"] = gemini_key

    effective_token = token or _CACHED_SESSION_TOKEN or agent_key
    if effective_token:
        headers["Authorization"] = f"Bearer {effective_token}"
        headers["x-agent-key"] = effective_token

    data_bytes = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed_err = json.loads(err_body)
            msg = parsed_err.get("error") or parsed_err.get("message") or err_body
        except Exception:
            msg = err_body or str(e)
        raise RuntimeError(f"HTTP {e.code} on {endpoint}: {msg}")
    except Exception as e:
        raise RuntimeError(f"Connection failed to {url}: {e}")


# ----------------------------------------------------------------------------
# SQLite Fallback Helper
# ----------------------------------------------------------------------------
def _get_db() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise RuntimeError(f"Local SQLite database not found at {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ----------------------------------------------------------------------------
# MCP Tool Implementations
# ----------------------------------------------------------------------------
def tool_authenticate(params: Dict[str, Any]) -> Dict[str, Any]:
    """Authenticates the agent against PodConnect Hub."""
    global _CACHED_SESSION_TOKEN
    agent_key = params.get("agent_key") or get_agent_key()
    agent_id = params.get("agent_id", "agent_mcp")
    tenant_id = params.get("tenant_id") or get_tenant_id()

    # Try HTTP Agent Auth API
    try:
        res = _http_request(
            "/api/auth/agent",
            method="POST",
            body={"agentKey": agent_key, "agentId": agent_id, "tenantId": tenant_id},
            token=agent_key,
        )
        if res.get("sessionToken"):
            _CACHED_SESSION_TOKEN = res["sessionToken"]
        return res
    except Exception as http_err:
        # Fallback to local key validation
        is_dev = os.environ.get("NODE_ENV") != "production"
        valid = agent_key == get_agent_key() or (is_dev and agent_key == "agent_test_key_podconnect")
        
        # Check local SQLite agent_api_keys table
        if not valid and agent_key.startswith("pca_live_"):
            try:
                conn = _get_db()
                cur = conn.cursor()
                cur.execute("SELECT * FROM agent_api_keys WHERE raw_key = ? AND revoked_at IS NULL", [agent_key])
                row = cur.fetchone()
                if row:
                    valid = True
                    tenant_id = row["tenant_id"]
                    agent_id = row["user_id"]
                conn.close()
            except Exception:
                pass

        if not valid:
            raise RuntimeError(f"Authentication failed: Invalid key. (HTTP attempt: {http_err})")

        return {
            "success": True,
            "authenticated": True,
            "mode": "offline_fallback",
            "agentId": agent_id,
            "tenantId": tenant_id,
            "role": "owner",
            "notice": f"Server offline ({http_err}); authenticated via local configuration.",
        }


def tool_search_leads(params: Dict[str, Any]) -> Dict[str, Any]:
    """Search and filter active verified podcast leads in the workspace."""
    client_id = params.get("client_id")
    niche = params.get("niche")
    status = params.get("status")
    limit = int(params.get("limit", 20))

    try:
        query_parts = []
        if client_id:
            query_parts.append(f"clientId={urllib.parse.quote(client_id)}")
        if niche:
            query_parts.append(f"niche={urllib.parse.quote(niche)}")
        if status:
            query_parts.append(f"status={urllib.parse.quote(status)}")
        qs = ("?" + "&".join(query_parts)) if query_parts else ""
        return _http_request(f"/api/leads{qs}")
    except Exception:
        # Direct SQLite fallback
        conn = _get_db()
        sql = "SELECT * FROM leads WHERE tenant_id = ?"
        args: List[Any] = [get_tenant_id()]
        if client_id and client_id != "ALL":
            sql += " AND client_id = ?"
            args.append(client_id)
        if niche:
            sql += " AND niche LIKE ?"
            args.append(f"%{niche}%")
        if status and status != "ALL":
            sql += " AND status = ?"
            args.append(status)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)

        cur = conn.cursor()
        cur.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"success": True, "count": len(rows), "leads": rows, "source": "sqlite_local"}


def tool_get_staged_leads(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch unapproved scraper-discovered leads waiting in staging review."""
    client_id = params.get("client_id")
    try:
        qs = f"?client_id={urllib.parse.quote(client_id)}" if client_id else ""
        return _http_request(f"/api/staged-leads{qs}")
    except Exception:
        conn = _get_db()
        sql = "SELECT * FROM staged_leads WHERE tenant_id = ?"
        args: List[Any] = [get_tenant_id()]
        if client_id and client_id != "ALL":
            sql += " AND client_id = ?"
            args.append(client_id)
        sql += " ORDER BY id DESC LIMIT 50"
        cur = conn.cursor()
        cur.execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"success": True, "count": len(rows), "stagedLeads": rows, "source": "sqlite_local"}


def tool_approve_lead(params: Dict[str, Any]) -> Dict[str, Any]:
    """Approve a staged lead and promote it into the active CRM lead bank."""
    staged_id = params.get("staged_id")
    if not staged_id:
        raise ValueError("staged_id is required")

    return _http_request("/api/staged-leads/import", method="POST", body={"stagedIds": [int(staged_id)]})


def tool_discover_shows(params: Dict[str, Any]) -> Dict[str, Any]:
    """Search live podcast shows using Gemini AI search grounding and stage them."""
    niche = params.get("niche")
    if not niche:
        raise ValueError("niche is required (e.g. 'B2B SaaS', 'DevOps')")
    client_id = params.get("client_id", "C001")
    min_subs = int(params.get("min_subs", 1000))

    return _http_request(
        "/api/gemini/discover-shows",
        method="POST",
        body={"niche": niche, "clientId": client_id, "minSubs": min_subs},
    )


def tool_generate_pitch(params: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a personalized pitch email for a specific lead."""
    lead_id = params.get("lead_id")
    if not lead_id:
        raise ValueError("lead_id is required")

    # Delegate to server MCP endpoint
    return _http_request(
        "/api/mcp",
        method="POST",
        body={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "generate_pitch", "arguments": {"lead_id": int(lead_id), "angle": params.get("angle", "")}},
        },
    )


def tool_get_workspace_stats(params: Dict[str, Any]) -> Dict[str, Any]:
    """Get workspace telemetry, quota usage, and lead pipeline counts."""
    tenant_id = get_tenant_id()
    try:
        return _http_request("/api/billing/status")
    except Exception:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM leads WHERE tenant_id = ?", [tenant_id])
        lead_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM staged_leads WHERE tenant_id = ?", [tenant_id])
        staged_count = cur.fetchone()[0]
        conn.close()
        return {
            "success": True,
            "activeTenant": tenant_id,
            "stats": {"leads": lead_count, "stagedLeads": staged_count},
            "source": "sqlite_local",
        }


def tool_live_ping(params: Dict[str, Any]) -> Dict[str, Any]:
    """Ping the PodConnect Hub API server and check agent authentication."""
    target_url = params.get("server_url") or get_server_url()
    agent_key = params.get("agent_key") or get_agent_key()

    health_url = f"{target_url}/api/health"
    agent_url = f"{target_url}/api/auth/agent"

    results: Dict[str, Any] = {"serverUrl": target_url}

    # 1. Health check
    try:
        req = urllib.request.Request(health_url, headers={"User-Agent": f"PodConnect-MCP/{SERVER_VERSION}"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            results["health"] = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        results["health"] = {"status": "error", "message": str(e)}

    # 2. Agent Auth Verification check
    try:
        req = urllib.request.Request(
            agent_url,
            headers={
                "Authorization": f"Bearer {agent_key}",
                "x-agent-key": agent_key,
                "User-Agent": f"PodConnect-MCP/{SERVER_VERSION}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            results["agentAuth"] = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        results["agentAuth"] = {"status": "error", "message": str(e)}

    return results


def tool_get_clients(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch active clients in the workspace."""
    client_id = params.get("client_id")
    endpoint = f"/api/clients/{client_id}" if client_id else "/api/clients"
    try:
        return _http_request(endpoint)
    except Exception:
        # SQLite local fallback
        conn = _get_db()
        cur = conn.cursor()
        tenant_id = get_tenant_id()
        if client_id:
            cur.execute("SELECT * FROM clients WHERE tenant_id = ? AND id = ?", [tenant_id, client_id])
            row = cur.fetchone()
            conn.close()
            return {"success": True, "count": 1 if row else 0, "clients": [dict(row)] if row else [], "source": "sqlite_local"}
        else:
            cur.execute("SELECT * FROM clients WHERE tenant_id = ? ORDER BY created_at DESC", [tenant_id])
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return {"success": True, "count": len(rows), "clients": rows, "source": "sqlite_local"}


def tool_save_client(params: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update a client in the database."""
    return _http_request("/api/clients", method="POST", body=params)


def tool_query_database(params: Dict[str, Any]) -> Dict[str, Any]:
    """Directly query the database with read-only SQL."""
    query = params.get("query")
    if not query:
        raise ValueError("query parameter is required")
    query_params = params.get("params", [])

    try:
        return _http_request("/api/db/query", method="POST", body={"query": query, "params": query_params})
    except Exception:
        # Direct local SQLite execution
        first_word = query.strip().split()[0].upper()
        if first_word not in ("SELECT", "PRAGMA", "EXPLAIN", "WITH"):
            raise ValueError(f"Only SELECT and PRAGMA read queries permitted. Prohibited: {first_word}")
        disallowed = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "REPLACE"]
        for kw in disallowed:
            if re.search(rf"\b{kw}\b", query, re.I):
                raise ValueError(f"Query contains prohibited statement: {kw}")

        conn = _get_db()
        cur = conn.cursor()
        cur.execute(query, query_params)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"success": True, "count": len(rows), "rows": rows, "source": "sqlite_local"}


def tool_get_database_schema(params: Dict[str, Any]) -> Dict[str, Any]:
    """Inspect database schema, table definitions, and row counts."""
    try:
        return _http_request("/api/db/schema")
    except Exception:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [r[0] for r in cur.fetchall()]
        res = {}
        for t in tables:
            cur.execute(f"PRAGMA table_info({t})")
            cols = [{"name": c[1], "type": c[2], "notnull": bool(c[3]), "pk": bool(c[5])} for c in cur.fetchall()]
            cur.execute(f"SELECT count(*) FROM {t}")
            cnt = cur.fetchone()[0]
            res[t] = {"rowCount": cnt, "columns": cols}
        conn.close()
        return {"success": True, "schema": {"database": "SQLite (Local Core)", "tablesCount": len(tables), "tables": res}, "source": "sqlite_local"}


# ----------------------------------------------------------------------------
# Catalog & Dispatch Table
# ----------------------------------------------------------------------------
MCP_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "podconnect_authenticate",
        "description": "Authenticate an autonomous agent with PodConnect Hub to receive a session token and verify permissions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent_key": {"type": "string", "description": "AGENT_SECRET_KEY configured in environment variables"},
                "agent_id": {"type": "string", "description": "Unique agent identifier (e.g. agent_alpha)"},
                "tenant_id": {"type": "string", "description": "Target workspace tenant ID (default: tenant_default)"},
            },
        },
    },
    {
        "name": "podconnect_search_leads",
        "description": "Search and filter verified podcast leads in the active workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Filter by client ID"},
                "niche": {"type": "string", "description": "Filter by niche"},
                "status": {"type": "string", "description": "Filter by lead status (New, Pitch Drafted, Sent, Booked)"},
                "limit": {"type": "number", "description": "Maximum records to return (default 20)"},
            },
        },
    },
    {
        "name": "podconnect_get_staged_leads",
        "description": "Fetch unapproved scraper-discovered leads waiting in the pre-import staging queue.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Filter by client ID"},
            },
        },
    },
    {
        "name": "podconnect_approve_lead",
        "description": "Approve a staged lead and promote it into the CRM central lead bank.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "staged_id": {"type": "number", "description": "ID of the staged lead to import"},
            },
            "required": ["staged_id"],
        },
    },
    {
        "name": "podconnect_discover_shows",
        "description": "Execute live podcast discovery in a niche using Gemini Search Grounding.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "niche": {"type": "string", "description": "Topic or industry dork keyword (e.g. 'B2B SaaS')"},
                "client_id": {"type": "string", "description": "Client ID (default: C001)"},
                "min_subs": {"type": "number", "description": "Minimum subscriber audience threshold (default: 1000)"},
            },
            "required": ["niche"],
        },
    },
    {
        "name": "podconnect_generate_pitch",
        "description": "Synthesize a personalized pitch email for a specific lead using client positioning.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "number", "description": "Database ID of target lead"},
                "angle": {"type": "string", "description": "Custom angle or topic"},
            },
            "required": ["lead_id"],
        },
    },
    {
        "name": "podconnect_get_workspace_stats",
        "description": "Get workspace usage statistics, active tenant, quotas, and lead pipeline counts.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "podconnect_live_ping",
        "description": "Ping the live PodConnect Hub server (Local or Vercel URL) and test the Agent Auth API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "server_url": {"type": "string", "description": "Optional server URL override (e.g. https://<app>.vercel.app)"},
                "agent_key": {"type": "string", "description": "Optional agent secret key override"},
            },
        },
    },
    {
        "name": "podconnect_get_clients",
        "description": "Fetch active clients list in the workspace including target niches, pricing, message pillars, and placement targets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Optional specific client ID (e.g. C001)"},
            },
        },
    },
    {
        "name": "podconnect_save_client",
        "description": "Create or update client specifications, target niches, message pillars, and placement goals in the database.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Client ID (e.g. C001)"},
                "name": {"type": "string", "description": "Client name"},
                "niche": {"type": "string", "description": "Target niche"},
                "platform": {"type": "string", "description": "Target platform"},
                "package": {"type": "string", "description": "Package name"},
                "pricing": {"type": "string", "description": "Pricing terms"},
                "minSubscribers": {"type": "number", "description": "Min audience requirement"},
            },
            "required": ["name", "niche"],
        },
    },
    {
        "name": "podconnect_query_database",
        "description": "Execute direct, read-only SQL queries on the relational SQLite database (SELECT queries only).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Read-only SQL query (e.g. 'SELECT * FROM clients', 'SELECT * FROM leads WHERE status=\"Booked\"')"},
                "params": {"type": "array", "items": {}, "description": "Positional query parameters"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "podconnect_get_database_schema",
        "description": "Inspect the relational database topology, all table names, columns, data types, and record counts.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]

_DISPATCH = {
    "podconnect_authenticate": tool_authenticate,
    "podconnect_search_leads": tool_search_leads,
    "podconnect_get_staged_leads": tool_get_staged_leads,
    "podconnect_approve_lead": tool_approve_lead,
    "podconnect_discover_shows": tool_discover_shows,
    "podconnect_generate_pitch": tool_generate_pitch,
    "podconnect_get_workspace_stats": tool_get_workspace_stats,
    "podconnect_live_ping": tool_live_ping,
    "podconnect_get_clients": tool_get_clients,
    "podconnect_save_client": tool_save_client,
    "podconnect_query_database": tool_query_database,
    "podconnect_get_database_schema": tool_get_database_schema,
}


# ----------------------------------------------------------------------------
# JSON-RPC 2.0 Dispatcher Loop
# ----------------------------------------------------------------------------
def _respond(message_id: Any, result: Any = None, error: Any = None) -> None:
    payload: Dict[str, Any] = {"jsonrpc": "2.0", "id": message_id}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def _handle(request: Dict[str, Any]) -> None:
    method = request.get("method")
    message_id = request.get("id")
    params = request.get("params") or {}

    if message_id is None and method and method.startswith("notifications/"):
        return

    if method == "initialize":
        _respond(
            message_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
        return

    if method == "ping":
        _respond(message_id, {"status": "pong"})
        return

    if method == "tools/list":
        _respond(message_id, {"tools": MCP_TOOLS})
        return

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        fn = _DISPATCH.get(name)
        if not fn:
            _respond(
                message_id,
                error={"code": -32601, "message": f"Unknown tool: '{name}'"},
            )
            return

        try:
            out = fn(args)
            text = json.dumps(out, indent=2) if not isinstance(out, str) else out
            _respond(
                message_id,
                {"content": [{"type": "text", "text": text}]},
            )
        except Exception as e:
            _respond(
                message_id,
                {
                    "content": [{"type": "text", "text": f"Error: {e}"}],
                    "isError": True,
                },
            )
        return

    _respond(
        message_id,
        error={"code": -32601, "message": f"Method not supported: '{method}'"},
    )


def main() -> None:
    # Ensure stdout is in unbuffered or line-buffered mode
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            _handle(req)
        except json.JSONDecodeError as err:
            _respond(None, error={"code": -32700, "message": f"Invalid JSON: {err}"})
        except Exception as err:
            _respond(None, error={"code": -32603, "message": f"Internal error: {err}"})


if __name__ == "__main__":
    main()
