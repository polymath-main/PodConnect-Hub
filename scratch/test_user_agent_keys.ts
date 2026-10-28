#!/usr/bin/env node
/**
 * Automated Verification Test Suite for:
 * 1. User Agent Key Auto-Provisioning on Login
 * 2. User-Scoped Agent Key Authentication & Tenant Scoping
 * 3. 1-Click MCP Config Generation
 * 4. User Key Rotation & Revocation Security
 * 5. MCP Tool Execution using User-Scoped Keys
 */
import assert from 'assert';
import http from 'http';
import app from '../server.js';

let server: http.Server | null = null;
let baseUrl: string = (process.argv[2] || '').replace(/\/+$/, '');

async function startServer(): Promise<void> {
  if (baseUrl) return;
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
}

function stopServer() {
  if (server) server.close();
}

console.log('====================================================');
console.log('🔑 PodConnect Hub — User Agent Key & MCP Verification');
console.log('====================================================\n');

async function runTests() {
  await startServer();
  console.log(`[TEST] Ephemeral test instance listening on ${baseUrl}\n`);

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

  let userSessionToken = '';
  let userAgentKey = '';
  let userTenantId = '';

  // 1. User Login Session Auto-Provisions Agent Key
  await step('User Login Session Auto-Provisions Agent Key (POST /api/auth/session)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authType: 'credentials',
        email: 'agency_director@podconnect.agency',
        tenantId: 'tenant_default',
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.ok(data.sessionToken.startsWith('pcs_'));
    assert.ok(data.agentKey?.key, 'Expected agentKey in session response');
    assert.ok(data.agentKey.key.startsWith('pca_live_'), `Expected pca_live_ prefix, got ${data.agentKey.key}`);
    userSessionToken = data.sessionToken;
    userAgentKey = data.agentKey.key;
    userTenantId = data.activeTenant.id;
  });

  // 2. Retrieve User Agent Key Endpoint
  await step('Retrieve Personal Agent Key & 1-Click MCP Config (GET /api/user/agent-key)', async () => {
    const res = await fetch(`${baseUrl}/api/user/agent-key`, {
      headers: {
        Authorization: `Bearer ${userSessionToken}`,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.key, userAgentKey);
    assert.strictEqual(data.tenantId, userTenantId);
    assert.ok(data.mcpConfig?.env?.AGENT_SECRET_KEY === userAgentKey);
    assert.ok(data.mcpConfig?.env?.PODCONNECT_URL);
  });

  // 3. Authenticate Agent with User-Scoped Key
  let agentSessionToken = '';
  await step('Agent Authentication via User-Scoped Key (POST /api/auth/agent)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAgentKey}`,
      },
      body: JSON.stringify({
        agentId: 'director_agent_swarm',
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.tenantId, userTenantId);
    assert.ok(data.sessionToken.startsWith('pcs_'));
    agentSessionToken = data.sessionToken;
  });

  // 4. Verify User Key via GET /api/auth/agent
  await step('Agent Key Direct Verification (GET /api/auth/agent with x-agent-key)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/agent`, {
      headers: {
        'x-agent-key': userAgentKey,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.authMode, 'user_agent_key');
    assert.strictEqual(data.tenantId, userTenantId);
  });

  // 5. MCP Tool Call via User-Scoped Key
  await step('MCP JSON-RPC Tool Call with User Agent Key (POST /api/mcp)', async () => {
    const res = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAgentKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 201,
        method: 'tools/call',
        params: {
          name: 'get_workspace_stats',
          arguments: {},
        },
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.ok(data.result?.content?.[0]?.text);
    const stats = JSON.parse(data.result.content[0].text);
    assert.strictEqual(stats.tenantId, userTenantId);
  });

  // 6. Rotate User Agent Key
  let rotatedKey = '';
  await step('User Key Rotation (POST /api/user/agent-key/rotate)', async () => {
    const res = await fetch(`${baseUrl}/api/user/agent-key/rotate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userSessionToken}`,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert.ok(data.key.startsWith('pca_live_'));
    assert.notStrictEqual(data.key, userAgentKey, 'New key must differ from rotated key');
    rotatedKey = data.key;
  });

  // 7. Revoked Key Rejected
  await step('Old Revoked Key Rejection (POST /api/auth/agent)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userAgentKey}`,
      },
    });
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized for revoked key, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, false);
  });

  // 8. New Rotated Key Accepted
  await step('New Rotated Key Accepted (POST /api/auth/agent)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rotatedKey}`,
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK for new key, got ${res.status}`);
    const data = await res.json() as any;
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.tenantId, userTenantId);
  });

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed}/${total} tests PASSED`);
  console.log('====================================================');

  stopServer();
  process.exit(passed === total ? 0 : 1);
}

runTests().catch((err) => {
  stopServer();
  console.error('Fatal execution error:', err);
  process.exit(1);
});
