#!/usr/bin/env node
/**
 * PodConnect Hub MCP Stdio Server (Model Context Protocol 2024-11-05)
 *
 * Runs over standard input/output (stdio) for local autonomous agent execution
 * (compatible with Claude Desktop, Cursor, Gemini Agents, custom orchestration).
 *
 * Usage:
 *   npx tsx mcp/stdio.ts
 *
 * Environment variables:
 *   AGENT_SECRET_KEY: User-scoped agent key (e.g. pca_live_...)
 *   PODCONNECT_TENANT_ID: Target workspace tenant ID (default: tenant_default)
 */

import readline from 'readline';
import { handleMcpRequest } from '../src/server/mcp.js';
import type { AuthenticatedRequest } from '../src/server/auth.js';
import type { JsonRpcRequest } from '../src/types/index.js';

const tenantId = process.env.PODCONNECT_TENANT_ID || 'tenant_default';
const agentKey = process.env.AGENT_SECRET_KEY || 'pca_stdio_agent';

const fakeReq: AuthenticatedRequest = {
  tenantId,
  userRole: 'owner',
  user: {
    uid: 'agent_stdio',
    email: 'agent@podconnect.hub',
    isAgent: true,
  },
  headers: {
    'x-agent-key': agentKey,
    'x-tenant-id': tenantId,
  },
} as any;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const rpcRequest = JSON.parse(trimmed) as JsonRpcRequest;
    const response = await handleMcpRequest(fakeReq, rpcRequest);
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err: any) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error / invalid JSON: ${err.message}`,
      },
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});
