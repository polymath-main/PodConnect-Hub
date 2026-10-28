/**
 * Comprehensive Automated Verification Suite for:
 * 1. Unified Login Session Request Engine
 * 2. Lightweight Vercel-Hosted MCP Server
 */
import http from 'http';
import app from '../server.js';

let server: http.Server;
let port: number;
let baseUrl: string;

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[TEST] Test server listening on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('🚀 Starting Login Session Request & MCP Server Verification...');
  await startServer();

  let sessionToken = '';

  try {
    // -------------------------------------------------------------
    // TEST 1: POST /api/auth/session (Agent Key Authentication)
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Agent Key Login Session Request ---');
    const loginRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authType: 'agent_key',
        token: 'agent_test_key_podconnect',
        tenantId: 'tenant_default',
        clientMeta: { clientName: 'Antigravity Verification Agent', clientVersion: '2.0.0' },
      }),
    });

    assert(loginRes.status === 200, `Login returns HTTP 200 (got ${loginRes.status})`);
    const loginData = await loginRes.json() as any;
    assert(loginData.success === true, 'Response indicates success: true');
    assert(typeof loginData.sessionToken === 'string' && loginData.sessionToken.startsWith('pcs_'), 'sessionToken is valid UUID token (pcs_*)');
    assert(loginData.user.isAgent === true, 'user.isAgent is true');
    assert(loginData.activeTenant?.id === 'tenant_default', 'activeTenant is tenant_default');
    assert(Array.isArray(loginData.availableTenants), 'availableTenants is an array');

    sessionToken = loginData.sessionToken;

    // -------------------------------------------------------------
    // TEST 1b: Verify Invalid Wildcard Key is Rejected (SEC-01)
    // -------------------------------------------------------------
    console.log('\n--- Test 1b: Invalid Wildcard Agent Key Rejection ---');
    const invalidKeyRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authType: 'agent_key',
        token: 'agent_sk_unauthorized_attacker_key',
      }),
    });
    assert(invalidKeyRes.status === 401, `Invalid agent key returns HTTP 401 (got ${invalidKeyRes.status})`);

    // -------------------------------------------------------------
    // TEST 2: GET /api/auth/session (Inspect Active Session)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Inspect Active Session with Bearer Token ---');
    const inspectRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    assert(inspectRes.status === 200, `Inspect returns HTTP 200 (got ${inspectRes.status})`);
    const inspectData = await inspectRes.json() as any;
    assert(inspectData.success === true, 'Inspect returns success');
    assert(inspectData.sessionToken === sessionToken, 'Inspect sessionToken matches issued token');
    assert(inspectData.user.uid === 'agent_default', 'User UID is agent_default');

    // -------------------------------------------------------------
    // TEST 3: GET /api/mcp (Public Discovery Manifest)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Public MCP Manifest Discovery ---');
    const mcpManifestRes = await fetch(`${baseUrl}/api/mcp`);
    assert(mcpManifestRes.status === 200, `MCP Manifest returns HTTP 200 (got ${mcpManifestRes.status})`);
    const manifestData = await mcpManifestRes.json() as any;
    assert(manifestData.name === 'podconnect-hub', 'MCP server name is podconnect-hub');
    assert(manifestData.protocolVersion === '2024-11-05', 'Protocol version is 2024-11-05');
    assert(manifestData.toolsCount >= 8, `Exposes 8 or more tools (got ${manifestData.toolsCount})`);

    // -------------------------------------------------------------
    // TEST 4: POST /api/mcp (JSON-RPC initialize)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: MCP JSON-RPC Handshake (initialize) ---');
    const initRes = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-agent', version: '1.0.0' },
        },
      }),
    });

    assert(initRes.status === 200, `MCP initialize returns HTTP 200`);
    const initData = await initRes.json() as any;
    assert(initData.jsonrpc === '2.0', 'JSON-RPC 2.0 format');
    assert(initData.id === 1, 'Response id matches request id');
    assert(initData.result.serverInfo.name === 'podconnect-hub', 'Server info matches');
    assert(initData.result.capabilities.tools !== undefined, 'Tools capability declared');

    // -------------------------------------------------------------
    // TEST 5: POST /api/mcp (JSON-RPC tools/list)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: MCP Tool Listing (tools/list) ---');
    const listRes = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    });

    assert(listRes.status === 200, 'tools/list returns HTTP 200');
    const listData = await listRes.json() as any;
    const toolNames = listData.result.tools.map((t: any) => t.name);
    assert(toolNames.includes('search_leads'), 'Includes search_leads tool');
    assert(toolNames.includes('get_workspace_stats'), 'Includes get_workspace_stats tool');
    assert(toolNames.includes('approve_lead'), 'Includes approve_lead tool');
    assert(toolNames.includes('generate_sequence'), 'Includes generate_sequence tool');

    // -------------------------------------------------------------
    // TEST 6: POST /api/mcp (JSON-RPC tools/call: get_workspace_stats)
    // -------------------------------------------------------------
    console.log('\n--- Test 6: MCP Tool Call (get_workspace_stats) ---');
    const callRes = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_workspace_stats',
          arguments: {},
        },
      }),
    });

    assert(callRes.status === 200, 'tools/call returns HTTP 200');
    const callData = await callRes.json() as any;
    assert(Array.isArray(callData.result.content), 'Content is an array');
    const stats = JSON.parse(callData.result.content[0].text);
    assert(stats.tenantId === 'tenant_default', 'Stats tenantId is tenant_default');
    assert(typeof stats.limits?.maxJobsPerDay === 'number', 'Stats contains maxJobsPerDay limit');

    // -------------------------------------------------------------
    // TEST 7: POST /api/mcp (JSON-RPC tools/call: search_leads)
    // -------------------------------------------------------------
    console.log('\n--- Test 7: MCP Tool Call (search_leads) ---');
    const searchRes = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_leads',
          arguments: { limit: 10 },
        },
      }),
    });

    assert(searchRes.status === 200, 'search_leads tool call returns HTTP 200');
    const searchData = await searchRes.json() as any;
    const leads = JSON.parse(searchData.result.content[0].text);
    assert(Array.isArray(leads), 'search_leads returns an array of leads');

    // -------------------------------------------------------------
    // TEST 8: DELETE /api/auth/session (Session Revocation / Logout)
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Revoke Session via DELETE /api/auth/session ---');
    const revokeRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    assert(revokeRes.status === 200, 'Revoke returns HTTP 200');
    const revokeData = await revokeRes.json() as any;
    assert(revokeData.success === true, 'Revocation success is true');

    // -------------------------------------------------------------
    // TEST 9: Protected Endpoint with Revoked Token (Expect 401)
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Verify Revoked Token is Rejected (HTTP 401) ---');
    const rejectedRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    assert(rejectedRes.status === 401, `Revoked token returns HTTP 401 (got ${rejectedRes.status})`);
    const rejectedData = await rejectedRes.json() as any;
    assert(rejectedData.error.includes('revoked'), 'Error message confirms session is revoked');

    console.log('\n🎉 ALL 9 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } finally {
    await stopServer();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
