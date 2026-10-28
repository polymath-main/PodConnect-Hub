import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Key,
  Copy,
  Check,
  RotateCw,
  Cpu,
  Shield,
  Building2,
  ExternalLink,
  Code2,
  Terminal,
  LogOut,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { WorkspaceAuthUser, Tenant } from '../../types';
import { api } from '../../lib/api';

interface UserSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: WorkspaceAuthUser | null;
  activeTenant: Tenant | null;
  onSignOut: () => void;
  onOpenWorkspaceSwitcher?: () => void;
  onOpenFullMcpModal?: () => void;
}

export const UserSpaceModal: React.FC<UserSpaceModalProps> = ({
  isOpen,
  onClose,
  user,
  activeTenant,
  onSignOut,
  onOpenWorkspaceSwitcher,
  onOpenFullMcpModal,
}) => {
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [keyData, setKeyData] = useState<{
    key: string;
    keyPrefix: string;
    name: string;
    createdAt?: string;
    tenantId?: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'agent_key' | 'mcp_configs'>('agent_key');
  const [mcpClient, setMcpClient] = useState<'antigravity' | 'claude' | 'cursor'>('antigravity');
  const [copiedConfig, setCopiedConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUserAgentKey();
    }
  }, [isOpen, activeTenant?.id]);

  const loadUserAgentKey = async () => {
    setLoading(true);
    try {
      const res = await api.getUserAgentKey();
      if (res.success) {
        setKeyData(res);
      }
    } catch (err) {
      console.error('Failed to load user agent key:', err);
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
      console.error('Failed to rotate user agent key:', err);
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
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pod-connect-hub.vercel.app';
    const key = keyData?.key || 'pca_live_your_key_here';
    const tenant = keyData?.tenantId || activeTenant?.id || 'tenant_default';

    if (mcpClient === 'antigravity') {
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

    if (mcpClient === 'claude') {
      return JSON.stringify(
        {
          mcpServers: {
            podconnect: {
              command: 'python3',
              args: ['/ABSOLUTE/PATH/TO/PodConnect-Hub/mcp/podconnect_mcp.py'],
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

    return JSON.stringify(
      {
        mcp: {
          servers: {
            podconnect: {
              type: 'stdio',
              command: 'python3',
              args: ['./mcp/podconnect_mcp.py'],
              env: {
                PODCONNECT_URL: origin,
                AGENT_SECRET_KEY: key,
              },
            },
          },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="relative">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{user?.displayName || 'User Space'}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 uppercase font-semibold border border-indigo-500/30">
                  {activeTenant?.currentRole || 'Owner'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[220px] sm:max-w-xs">
                {user?.email || 'operator@podconnect.agency'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 px-4 bg-slate-950/40 text-xs font-medium">
          <button
            onClick={() => setActiveTab('agent_key')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'agent_key'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Agent Secret Key</span>
          </button>
          <button
            onClick={() => setActiveTab('mcp_configs')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'mcp_configs'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>MCP Configs</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Workspace Context</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'agent_key' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Autonomous Agent Access Control</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  This user agent key links any autonomous AI agent (Antigravity, OpenCode, Claude, Cursor) directly to your personal workspace tenant. All CRM leads, pitches, and staging operations execute securely within your account.
                </p>
              </div>

              {/* Secret Key Display Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Personal Agent Secret Key
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {keyData?.keyPrefix || 'pca_live_...'}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-xs">
                  <div className="flex-1 truncate select-all text-slate-200">
                    {loading ? (
                      <span className="text-slate-500">Generating secret key...</span>
                    ) : keyData?.key ? (
                      showKey ? keyData.key : `••••••••••••••••••••••••••••••••${keyData.key.slice(-8)}`
                    ) : (
                      <span className="text-slate-500">No active key found</span>
                    )}
                  </div>

                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                    title={showKey ? 'Hide key' : 'Show full key'}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={handleCopyKey}
                    disabled={!keyData?.key}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {copiedKey ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Key Rotation Section */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Created: {keyData?.createdAt ? new Date(keyData.createdAt).toLocaleDateString() : 'Active'}
                  </span>

                  {confirmRotate ? (
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 font-medium">Revoke old key?</span>
                      <button
                        onClick={handleRotateKey}
                        disabled={rotating}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {rotating ? 'Rotating...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmRotate(false)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRotate(true)}
                      className="text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Rotate Key</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Fast action to view full MCP setup instructions */}
              <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div>
                  <h4 className="font-semibold text-slate-200">1-Click MCP Setup Guide</h4>
                  <p className="text-[11px] text-slate-400">Export configurations for Claude Desktop, Antigravity, and Cursor.</p>
                </div>
                <button
                  onClick={() => setActiveTab('mcp_configs')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  View Configs
                </button>
              </div>
            </div>
          )}

          {activeTab === 'mcp_configs' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['antigravity', 'claude', 'cursor'] as const).map((client) => (
                  <button
                    key={client}
                    onClick={() => setMcpClient(client)}
                    className={`flex-1 py-1.5 text-center rounded-md font-medium capitalize transition-colors cursor-pointer text-xs ${
                      mcpClient === client
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {client === 'antigravity' ? 'Antigravity / OpenCode' : client}
                  </button>
                ))}
              </div>

              <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] overflow-x-auto text-slate-300">
                <button
                  onClick={handleCopyConfig}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                >
                  {copiedConfig ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Snippet</span>
                    </>
                  )}
                </button>
                <pre>{getMcpSnippet()}</pre>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-3">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Active Workspace</span>
                  <span className="font-semibold text-slate-200">{activeTenant?.name || 'Primary Workspace'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Tenant UUID</span>
                  <span className="font-mono text-[11px] text-slate-300">{activeTenant?.id || 'tenant_default'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Role in Workspace</span>
                  <span className="capitalize text-indigo-400 font-semibold">{activeTenant?.currentRole || 'Owner'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Plan Tier</span>
                  <span className="capitalize text-emerald-400 font-semibold">{activeTenant?.plan || 'Growth'}</span>
                </div>
              </div>

              {onOpenWorkspaceSwitcher && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenWorkspaceSwitcher();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors cursor-pointer"
                >
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Switch Workspace or Manage Team</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
