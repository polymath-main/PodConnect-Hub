#!/usr/bin/env node
/**
 * Live Agent Auth & MCP Verification Test Suite
 *
 * Verifies:
 *  1. Health & Discovery (/api/health, /api/mcp)
 *  2. Dedicated Agent Auth Endpoint (/api/auth/agent)
 *     - Unauthorized rejection (401)
 *     - Authorized issuance via Bearer header or body payload
 *     - Session verification ping (GET /api/auth/agent)
 *  3. Authenticated Streamable MCP Handshake & Tool Execution (/api/mcp)
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs scratch/test_live_agent_auth.ts [BASE_URL] [AGENT_KEY]
 */
import assert from 'assert';
import http from 'http';
import app from '../server.js';

let targetUrl = (process.argv[2] || process.env.PODCONNECT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const agentKey = process.argv[3] || process.env.AGENT_SECRET_KEY || 'agent_test_key_podconnect';

let localServer: http.Server | null = null;

async function ensureServerTarget(): Promise<string> {
  if (!targetUrl.includes('localhost') && !targetUrl.includes('127.0.0.1')) {
    return targetUrl;
  }

  // Check if existing local server is running
  try {
    const res = await fetch(`${targetUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) return targetUrl;
  } catch {
    // Port not open, spawn ephemeral in-process test server
  }

  return new Promise((resolve) => {
    localServer = app.listen(0, () => {
      const addr = localServer!.address() as any;
      const port = addr.port;
      const spawnedUrl = `http://localhost:${port}`;
      console.log(`[LOCAL] Spawned ephemeral test instance on ${spawnedUrl}`);
      resolve(spawnedUrl);
    });
  });
}

console.log('====================================================');
console.log('🤖 PodConnect Hub — Agent Auth & Live MCP Test Suite');
console.log('====================================================');

async function runTests() {
  targetUrl = await ensureServerTarget();
  console.log(`Target URL : ${targetUrl}`);
  console.log(`Agent Key  : ${agentKey.substring(0, 4)}**** (length: ${agentKey.length})`);
  console.log('----------------------------------------------------\n');

  let passed = 0;
  let total = 0;

  async function step(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`[Test ${total}] ${name} ... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err: any) {
      console.log(`❌ FAIL: ${err.message}`);
    }
  }

  // 1. Healthcheck
  await step('Public Health Check (GET /api/health)', async () => {
    const res = await fetch(`${targetUrl}/api/health`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.status, 'ok');
  });

  // 2. Public MCP Manifest
  await step('Public MCP Manifest (GET /api/mcp)', async () => {
    const res = await fetch(`${targetUrl}/api/mcp`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.name, 'podconnect-hub');
    assert.ok(data.toolsCount >= 8, `Expected at least 8 tools, got ${data.toolsCount}`);
  });

  // 3. Unauthorized Agent Auth Rejection
  await step('Agent Auth Rejection without Credentials (GET /api/auth/agent)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/agent`);
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, false);
  });

  // 4. Invalid Agent Key Rejection
  await step('Agent Auth Rejection with Invalid Key (POST /api/auth/agent)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentKey: 'completely_invalid_key_12345' }),
    });
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, false);
  });

  // 5. Authorized Agent Auth via POST
  let sessionToken = '';
  await step('Agent Authentication via POST /api/auth/agent', async () => {
    const res = await fetch(`${targetUrl}/api/auth/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentKey,
        agentId: 'agent_tester_live',
        tenantId: 'tenant_default',
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.authenticated, true);
    assert.ok(data.sessionToken.startsWith('pcs_'), `Expected sessionToken prefix pcs_, got ${data.sessionToken}`);
    assert.strictEqual(data.agentId, 'agent_tester_live');
    assert.ok(data.mcp.toolsCount >= 8);
    sessionToken = data.sessionToken;
  });

  // 6. Verify Active Agent Session via GET /api/auth/agent
  await step('Verify Session via GET /api/auth/agent (Bearer sessionToken)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/agent`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.status, 'active');
    assert.strictEqual(data.authMode, 'session_token');
  });

  // 7. Verify Direct Agent Key Verification via GET /api/auth/agent (x-agent-key header)
  await step('Verify Direct Key via GET /api/auth/agent (x-agent-key header)', async () => {
    const res = await fetch(`${targetUrl}/api/auth/agent`, {
      headers: {
        'x-agent-key': agentKey,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.status, 'active');
    assert.strictEqual(data.authMode, 'agent_key');
  });

  // 8. Authenticated MCP Handshake (initialize)
  await step('Authenticated MCP JSON-RPC Handshake (initialize)', async () => {
    const res = await fetch(`${targetUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          clientInfo: { name: 'LiveTestAgent', version: '1.0.0' },
        },
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.result.serverInfo.name, 'podconnect-hub');
    assert.strictEqual(data.result.protocolVersion, '2024-11-05');
  });

  // 9. Authenticated MCP Tool Call (get_workspace_stats)
  await step('Authenticated MCP Tool Execution (get_workspace_stats)', async () => {
    const res = await fetch(`${targetUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'tools/call',
        params: {
          name: 'get_workspace_stats',
          arguments: {},
        },
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.ok(data.result?.content?.[0]?.text, 'Expected content text in result');
    const parsedStats = JSON.parse(data.result.content[0].text);
    assert.ok(parsedStats.tenantId, 'Expected tenantId in workspace stats');
    assert.ok(parsedStats.limits, 'Expected limits object in workspace stats');
  });

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed}/${total} tests PASSED`);
  console.log('====================================================');

  if (localServer) {
    localServer.close();
  }

  process.exit(passed === total ? 0 : 1);
}

runTests().catch((err) => {
  if (localServer) {
    localServer.close();
  }
  console.error('Fatal execution error:', err);
  process.exit(1);
});
