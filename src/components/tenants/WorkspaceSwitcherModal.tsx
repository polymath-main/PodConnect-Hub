import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Plus,
  Check,
  Shield,
  UserPlus,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  AlertCircle,
  CreditCard,
  Zap,
  Key,
  Copy,
  RotateCw,
  Cpu,
  Eye,
  EyeOff,
  Terminal,
} from 'lucide-react';
import { Tenant, TenantMember, UserRole } from '../../types';
import { api } from '../../lib/api';

interface WorkspaceSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTenant: Tenant | null;
  onSelectTenant: (tenant: Tenant) => void;
  tenants: Tenant[];
  onTenantsUpdated: () => void;
}

export const WorkspaceSwitcherModal: React.FC<WorkspaceSwitcherModalProps> = ({
  isOpen,
  onClose,
  activeTenant,
  onSelectTenant,
  tenants,
  onTenantsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'new' | 'team' | 'plan' | 'agent'>('switch');
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);

  // Agent Key state
  const [agentKeyData, setAgentKeyData] = useState<any>(null);
  const [isLoadingAgentKey, setIsLoadingAgentKey] = useState(false);
  const [isRotatingAgentKey, setIsRotatingAgentKey] = useState(false);
  const [showAgentKey, setShowAgentKey] = useState(false);
  const [copiedAgentKey, setCopiedAgentKey] = useState(false);
  const [confirmRotateKey, setConfirmRotateKey] = useState(false);
  const [mcpClientChoice, setMcpClientChoice] = useState<'antigravity' | 'claude' | 'cursor'>('antigravity');
  const [copiedMcpSnippet, setCopiedMcpSnippet] = useState(false);

  // New Workspace form state
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceSlug, setNewWorkspaceSlug] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | 'agency'>('growth');
  const [isCreating, setIsCreating] = useState(false);

  // Invite member form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen && activeTenant && activeTab === 'team') {
      loadMembers(activeTenant.id);
    }
    if (isOpen && activeTenant && activeTab === 'plan') {
      loadBillingStatus();
    }
    if (isOpen && activeTab === 'agent') {
      loadAgentKey();
    }
  }, [isOpen, activeTenant, activeTab]);

  const loadAgentKey = async () => {
    setIsLoadingAgentKey(true);
    try {
      const res = await api.getUserAgentKey();
      if (res.success) {
        setAgentKeyData(res);
      }
    } catch (err: any) {
      console.error('Failed to load agent key:', err);
    } finally {
      setIsLoadingAgentKey(false);
    }
  };

  const handleRotateAgentKey = async () => {
    setIsRotatingAgentKey(true);
    try {
      const res = await api.rotateUserAgentKey();
      if (res.success) {
        setAgentKeyData(res);
        setConfirmRotateKey(false);
        setStatusMessage({ text: 'Agent secret key rotated successfully. Previous key revoked.', type: 'success' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to rotate agent key', type: 'error' });
    } finally {
      setIsRotatingAgentKey(false);
    }
  };

  const handleCopyAgentKey = () => {
    if (!agentKeyData?.key) return;
    navigator.clipboard.writeText(agentKeyData.key);
    setCopiedAgentKey(true);
    setTimeout(() => setCopiedAgentKey(false), 2000);
  };

  const getMcpSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pod-connect-hub.vercel.app';
    const key = agentKeyData?.key || 'pca_live_your_key_here';
    const tenant = agentKeyData?.tenantId || activeTenant?.id || 'tenant_default';

    if (mcpClientChoice === 'antigravity') {
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

    if (mcpClientChoice === 'claude') {
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

  const handleCopyMcpSnippet = () => {
    navigator.clipboard.writeText(getMcpSnippet());
    setCopiedMcpSnippet(true);
    setTimeout(() => setCopiedMcpSnippet(false), 2000);
  };

  const loadBillingStatus = async () => {
    setIsLoadingBilling(true);
    try {
      const res = await api.getBillingStatus();
      if (res.success) {
        setBillingStatus(res);
      }
    } catch (err: any) {
      console.error('Failed to load billing status:', err);
    } finally {
      setIsLoadingBilling(false);
    }
  };

  if (!isOpen) return null;

  const loadMembers = async (tenantId: string) => {
    setIsLoadingMembers(true);
    setStatusMessage(null);
    try {
      const res = await api.getTenantMembers(tenantId);
      if (res.success) {
        setMembers(res.members);
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to load team members', type: 'error' });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleNameChange = (val: string) => {
    setNewWorkspaceName(val);
    setNewWorkspaceSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
    );
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName || !newWorkspaceSlug) return;

    setIsCreating(true);
    setStatusMessage(null);
    try {
      const res = await api.createTenant(newWorkspaceName, newWorkspaceSlug, selectedPlan);
      if (res.success) {
        onTenantsUpdated();
        onSelectTenant(res.tenant);
        setNewWorkspaceName('');
        setNewWorkspaceSlug('');
        setActiveTab('switch');
        setStatusMessage({ text: `Workspace "${res.tenant.name}" created successfully`, type: 'success' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to create workspace', type: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !activeTenant) return;

    setIsInviting(true);
    setStatusMessage(null);
    try {
      const res = await api.addTenantMember(activeTenant.id, inviteEmail, inviteRole);
      if (res.success) {
        setInviteEmail('');
        loadMembers(activeTenant.id);
        setStatusMessage({ text: `Member ${inviteEmail} added with role ${inviteRole}`, type: 'success' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to invite member', type: 'error' });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Workspaces & Organizations</h3>
              <p className="text-xs text-slate-400">Manage client agency workspaces and team access controls</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center px-6 pt-3 border-b border-slate-800 bg-slate-950/40 gap-4 text-xs font-medium">
          <button
            onClick={() => { setActiveTab('switch'); setStatusMessage(null); }}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'switch'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Workspaces ({tenants.length})
          </button>
          <button
            onClick={() => { setActiveTab('team'); setStatusMessage(null); }}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'team'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Team & RBAC
          </button>
          <button
            onClick={() => { setActiveTab('new'); setStatusMessage(null); }}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'new'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Workspace
          </button>
          <button
            onClick={() => { setActiveTab('plan'); setStatusMessage(null); }}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'plan'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Plan & Quota
          </button>
          <button
            onClick={() => { setActiveTab('agent'); setStatusMessage(null); }}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'agent'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Agent Secret Keys
          </button>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* TAB 1: SWITCH WORKSPACE */}
          {activeTab === 'switch' && (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Your Workspaces
              </span>
              <div className="space-y-2">
                {tenants.map((t) => {
                  const isSelected = activeTenant?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        onSelectTenant(t);
                        onClose();
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500/40 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{t.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                              {t.plan}
                            </span>
                            {t.currentRole && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                                {t.currentRole}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">ID: {t.id} • {t.memberCount || 1} member(s)</p>
                        </div>
                      </div>
                      {isSelected ? (
                        <div className="p-1 rounded-full bg-indigo-500/20 text-indigo-400">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-slate-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: TEAM & RBAC */}
          {activeTab === 'team' && (
            <div className="space-y-5">
              {/* Invite member form */}
              <form onSubmit={handleInviteMember} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                  Add Team Member to {activeTenant?.name}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@agency.com"
                      required
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isInviting || !inviteEmail}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isInviting ? 'Adding Member...' : 'Add Member to Workspace'}
                </button>
              </form>

              {/* Members Listing */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Current Members
                </span>
                {isLoadingMembers ? (
                  <p className="text-xs text-slate-500 py-3 text-center">Loading workspace members...</p>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs uppercase">
                            {m.email.slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-medium text-white">{m.email}</p>
                            <p className="text-[11px] text-slate-500">UID: {m.userId}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 border border-slate-700 text-indigo-300">
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CREATE WORKSPACE */}
          {activeTab === 'new' && (
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Workspace / Agency Name</label>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Apex Media Agency"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">URL Identifier (Slug)</label>
                <input
                  type="text"
                  value={newWorkspaceSlug}
                  onChange={(e) => setNewWorkspaceSlug(e.target.value)}
                  placeholder="apex-media"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Subscription Tier</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['starter', 'growth', 'agency'] as const).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`p-2.5 rounded-xl border text-xs font-medium capitalize transition-all ${
                        selectedPlan === plan
                          ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating || !newWorkspaceName}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 mt-2"
              >
                {isCreating ? 'Provisioning Workspace...' : 'Create New Agency Workspace'}
              </button>
            </form>
          )}

          {/* TAB 4: PLAN & QUOTA */}
          {activeTab === 'plan' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold uppercase text-slate-300 tracking-wider">
                      Current Subscription Tier
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {billingStatus?.plan || activeTenant?.plan || 'growth'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Resource allocations and daily throughput are strictly bounded to protect Termux system memory and host stability.
                </p>
              </div>

              {isLoadingBilling ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  Loading plan telemetry...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">Daily Scraper Jobs</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {billingStatus?.usage?.jobsToday ?? 0} / {billingStatus?.limits?.maxJobsPerDay ?? 10}
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((billingStatus?.usage?.jobsToday ?? 0) /
                                (billingStatus?.limits?.maxJobsPerDay || 10)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">Workspace Team Seats</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {billingStatus?.usage?.memberCount ?? 1} / {billingStatus?.limits?.maxSeats ?? 3}
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((billingStatus?.usage?.memberCount ?? 1) /
                                (billingStatus?.limits?.maxSeats || 3)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">Monthly Lead Discovery Cap</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {billingStatus?.limits?.maxLeadsPerMonth?.toLocaleString() ?? '500'} leads/mo
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">Max Concurrent Workers</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {billingStatus?.limits?.maxConcurrentJobs ?? 2} (LMK Bounded)
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 bg-slate-800 text-slate-500 rounded-xl text-xs font-semibold cursor-not-allowed border border-slate-700/50"
                  title="Contact agency admin to upgrade billing tier"
                >
                  Upgrade Subscription (Contact Support)
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: AGENT SECRET KEYS & MCP ACCESS */}
          {activeTab === 'agent' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Workspace-Scoped Autonomous Agent Credentials</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Your personal agent secret key grants AI assistants (Antigravity CLI, OpenCode, Claude, Cursor) direct access to this workspace via the Model Context Protocol (MCP). Actions taken by agents are bound to your user role ({activeTenant?.currentRole || 'owner'}).
                </p>
              </div>

              {/* Secret Key Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    Agent Secret Key
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {agentKeyData?.keyPrefix || 'pca_live_...'}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-xs">
                  <div className="flex-1 truncate select-all text-slate-200">
                    {isLoadingAgentKey ? (
                      <span className="text-slate-500">Loading secret key...</span>
                    ) : agentKeyData?.key ? (
                      showAgentKey ? agentKeyData.key : `••••••••••••••••••••••••••••••••${agentKeyData.key.slice(-8)}`
                    ) : (
                      <span className="text-slate-500">No active key found</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAgentKey(!showAgentKey)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                    title={showAgentKey ? 'Hide key' : 'Show full key'}
                  >
                    {showAgentKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyAgentKey}
                    disabled={!agentKeyData?.key}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {copiedAgentKey ? (
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

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Tenant: <strong className="text-slate-400 font-mono">{activeTenant?.name}</strong> ({activeTenant?.id})
                  </span>

                  {confirmRotateKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 font-medium">Revoke old key?</span>
                      <button
                        type="button"
                        onClick={handleRotateAgentKey}
                        disabled={isRotatingAgentKey}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isRotatingAgentKey ? 'Rotating...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRotateKey(false)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRotateKey(true)}
                      className="text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Rotate Key</span>
                    </button>
                  )}
                </div>
              </div>

              {/* MCP Toolchain Configs */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    1-Click MCP Setup Configs
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {(['antigravity', 'claude', 'cursor'] as const).map((client) => (
                    <button
                      key={client}
                      type="button"
                      onClick={() => setMcpClientChoice(client)}
                      className={`flex-1 py-1.5 text-center rounded-md font-medium capitalize transition-colors cursor-pointer text-xs ${
                        mcpClientChoice === client
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
                    type="button"
                    onClick={handleCopyMcpSnippet}
                    className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                  >
                    {copiedMcpSnippet ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                  <pre>{getMcpSnippet()}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
