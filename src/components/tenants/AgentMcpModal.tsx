import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Copy,
  Check,
  RotateCw,
  Cpu,
  Terminal,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Layers,
  Code2,
} from 'lucide-react';
import { api } from '../../lib/api';

interface AgentMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTenantId?: string;
}

export const AgentMcpModal: React.FC<AgentMcpModalProps> = ({
  isOpen,
  onClose,
  activeTenantId,
}) => {
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [keyData, setKeyData] = useState<{
    key: string;
    keyPrefix: string;
    name: string;
    createdAt: string;
    tenantId: string;
    mcpConfig?: any;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'antigravity' | 'claude' | 'cursor'>('antigravity');
  const [confirmRotate, setConfirmRotate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadKey();
    }
  }, [isOpen]);

  const loadKey = async () => {
    setLoading(true);
    try {
      const res = await api.getUserAgentKey();
      if (res.success) {
        setKeyData(res);
      }
    } catch (err) {
      console.error('Failed to load agent key:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRotateKey = async () => {
    setRotating(true);
    try {
      const res = await api.rotateUserAgentKey();
      if (res.success) {
        setKeyData(res);
        setConfirmRotate(false);
      }
    } catch (err) {
      console.error('Failed to rotate key:', err);
    } finally {
      setRotating(false);
    }
  };

  const handleCopyKey = () => {
    if (!keyData?.key) return;
    navigator.clipboard.writeText(keyData.key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const getMcpSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app';
    const key = keyData?.key || 'pca_live_your_key_here';
    const tenant = keyData?.tenantId || activeTenantId || 'tenant_default';

    if (activeTab === 'antigravity') {
      return JSON.stringify(
        {
          mcpServers: {
            'podconnect-hub': {
              command: 'python3',
              args: ['${workspaceFolder}/mcp/podconnect_mcp.py'],
              env: {
                PODCONNECT_URL: origin,
                AGENT_SECRET_KEY: key,
                PODCONNECT_TENANT_ID: tenant,
              },
            },
          },
        },
        null,
        2
      );
    }

    if (activeTab === 'claude') {
      return JSON.stringify(
        {
          mcpServers: {
            'podconnect-hub': {
              command: 'python3',
              args: ['/path/to/PodConnect-Hub/mcp/podconnect_mcp.py'],
              env: {
                PODCONNECT_URL: origin,
                AGENT_SECRET_KEY: key,
              },
            },
          },
        },
        null,
        2
      );
    }

    // Cursor / generic HTTP endpoint
    return JSON.stringify(
      {
        name: 'podconnect-hub',
        url: `${origin}/api/mcp`,
        headers: {
          Authorization: `Bearer ${key}`,
        },
      },
      null,
      2
    );
  };

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(getMcpSnippet());
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 p-5 sm:p-6 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Autonomous Agent & MCP Gateway</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Operate your PodConnect cloud workspace directly from any AI agent.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
            <RotateCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span>Resolving your personal Agent API Key...</span>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Personal Key Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  Your Personal Agent Secret Key
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Workspace: <strong className="text-slate-300">{keyData?.tenantId || activeTenantId}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-indigo-300 select-all overflow-x-auto">
                  {showFullKey ? keyData?.key : keyData?.keyPrefix || '••••••••••••••••••••••••'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullKey(!showFullKey)}
                  className="px-2.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors shrink-0"
                >
                  {showFullKey ? 'Hide' : 'Reveal'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                This key gives your agent sovereign <strong className="text-slate-400">Owner</strong> access to search leads, stage podcasts, and draft pitches in this workspace. Never share it publicly.
              </p>
            </div>

            {/* 1-Click MCP Config Tabs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  1-Click MCP Installation Configuration
                </span>
                <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setActiveTab('antigravity')}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      activeTab === 'antigravity'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Antigravity / OpenCode
                  </button>
                  <button
                    onClick={() => setActiveTab('claude')}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      activeTab === 'claude'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Claude Desktop
                  </button>
                  <button
                    onClick={() => setActiveTab('cursor')}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      activeTab === 'cursor'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cursor / JSON-RPC
                  </button>
                </div>
              </div>

              <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] text-slate-300">
                <button
                  onClick={handleCopyConfig}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
                  title="Copy MCP snippet"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedConfig ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <pre className="overflow-x-auto whitespace-pre pr-16">{getMcpSnippet()}</pre>
              </div>

              <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Installation Location:</span>
                </div>
                {activeTab === 'antigravity' ? (
                  <p className="text-[11px] font-mono text-slate-300">
                    Paste inside <code className="text-indigo-400">~/.gemini/config/mcp_config.json</code> under <code className="text-indigo-400">mcpServers</code>.
                  </p>
                ) : activeTab === 'claude' ? (
                  <p className="text-[11px] font-mono text-slate-300">
                    Paste inside <code className="text-indigo-400">~/Library/Application Support/Claude/claude_desktop_config.json</code>.
                  </p>
                ) : (
                  <p className="text-[11px] font-mono text-slate-300">
                    Add custom MCP server endpoint pointing to your cloud Vercel URL.
                  </p>
                )}
              </div>
            </div>

            {/* Key Rotation / Revocation Area */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              {!confirmRotate ? (
                <button
                  type="button"
                  onClick={() => setConfirmRotate(true)}
                  className="text-rose-400 hover:text-rose-300 font-medium transition-colors flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate / Revoke Agent Key</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Revoke current key and generate new?
                  </span>
                  <button
                    onClick={handleRotateKey}
                    disabled={rotating}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold"
                  >
                    {rotating ? 'Rotating...' : 'Confirm Rotate'}
                  </button>
                  <button
                    onClick={() => setConfirmRotate(false)}
                    className="px-2 py-1 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
