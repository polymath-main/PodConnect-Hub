import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Terminal,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  Mail,
  User,
  ExternalLink,
  Send,
  AlertCircle,
  Database,
  Globe,
  Radio,
  Target,
  Sparkles,
  Layers,
  Tag,
  ShieldCheck,
  Building2,
  MapPin,
  Users,
  Clock,
  Ban,
  Activity,
  Check,
} from 'lucide-react';
import { Client, Lead, StagedLead, ScrapeLog, ScrapeJob } from '../types';
import { LeadStagingPanel } from './leads/LeadStagingPanel';
import { CentralLeadBankView } from './leads/CentralLeadBankView';
import { api } from '../lib/api';
import { useToast } from './ui/Toast';

interface ScraperConsoleViewProps {
  clients: Client[];
  activeClientId: string;
  onSelectClient: (id: string) => void;
  onOpenPitchModal: (lead: Lead) => void;
}

export const ScraperConsoleView: React.FC<ScraperConsoleViewProps> = ({
  clients,
  activeClientId,
  onSelectClient,
  onOpenPitchModal,
}) => {
  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0];

  const [activeTab, setActiveTab] = useState<'console' | 'queue' | 'staging' | 'bank'>('console');
  const [nicheQuery, setNicheQuery] = useState(activeClient?.niche || 'B2B SaaS and AI');
  const [minSubs, setMinSubs] = useState<number>(activeClient?.minSubscribers || 1000);
  const [targetCount, setTargetCount] = useState<number>(10);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'Apple Podcasts',
    'RSS Feeds',
    'Buzzsprout',
    'YouTube',
  ]);

  const [isScraping, setIsScraping] = useState(false);
  const [isDiscoveringGrounded, setIsDiscoveringGrounded] = useState(false);
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const [stagedLeads, setStagedLeads] = useState<StagedLead[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [selectedJobIdForLogs, setSelectedJobIdForLogs] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeClient) {
      setNicheQuery(activeClient.niche);
      setMinSubs(activeClient.minSubscribers || 1000);
      loadLeads(activeClient.id);
      loadStagedLeads(activeClient.id);
    } else {
      loadLeads();
      loadStagedLeads();
    }
    loadJobs();
  }, [activeClientId]);

  // Real-time SSE Telemetry connection with robust reconnection backoff
  useEffect(() => {
    let reconnectTimer: any = null;
    let attempts = 0;
    const maxAttempts = 10;
    let currentEventSource: EventSource | null = null;
    let isCleanedUp = false;

    const connectSSE = () => {
      if (isCleanedUp) return;

      const tenantId = api.getTenantId();
      const token = api.getSessionToken();
      const params = new URLSearchParams();
      if (tenantId) params.set('tenantId', tenantId);
      if (token) params.set('token', token);
      if (selectedJobIdForLogs) params.set('jobId', selectedJobIdForLogs);

      const streamUrl = `/api/scrape/stream?${params.toString()}`;
      const eventSource = new EventSource(streamUrl);
      currentEventSource = eventSource;

      eventSource.onopen = () => {
        attempts = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') return;

          // If job status updated or finished, refresh job queue and staged leads
          if (
            data.type === 'job_queued' ||
            data.type === 'job_started' ||
            data.type === 'job_completed' ||
            data.type === 'job_failed' ||
            data.type === 'job_cancelled'
          ) {
            loadJobs();
            loadStagedLeads(activeClient?.id);
          }

          const logItem = data.log || (data.message ? {
            timestamp: data.timestamp || new Date().toISOString(),
            level: data.level || 'INFO',
            message: data.message,
            lead: data.lead,
          } : null);

          if (logItem) {
            setLogs((prev) => [
              ...prev.slice(-200),
              {
                timestamp: logItem.timestamp || new Date().toISOString(),
                level: logItem.level || 'INFO',
                message: logItem.message || '',
                lead: logItem.lead,
              },
            ]);

            if (logItem.lead || logItem.level === 'SUCCESS') {
              loadStagedLeads(activeClient?.id);
            }
          }
        } catch (err) {
          console.error('SSE parsing error:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!isCleanedUp && attempts < maxAttempts) {
          attempts++;
          const delay = Math.min(attempts * 2000, 10000);
          console.warn(`SSE stream disconnected. Reconnecting in ${delay}ms (attempt ${attempts}/${maxAttempts})...`);
          reconnectTimer = setTimeout(connectSSE, delay);
        }
      };
    };

    connectSSE();

    return () => {
      isCleanedUp = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentEventSource) currentEventSource.close();
    };
  }, [activeClient?.id, selectedJobIdForLogs]);

  // Intelligent Realtime Polling Fallback when any job is active
  useEffect(() => {
    const hasActiveJobs = jobs.some((j) => j.status === 'running' || j.status === 'pending');
    if (!hasActiveJobs && !isScraping) return;

    const interval = setInterval(() => {
      loadJobs();
      loadStagedLeads(activeClient?.id);

      if (selectedJobIdForLogs) {
        api.getJobDetails(selectedJobIdForLogs).then((res) => {
          if (res.success && res.logs && res.logs.length > 0) {
            setLogs(res.logs.map((l) => ({
              timestamp: l.timestamp,
              level: l.level as any,
              message: l.message,
              lead: l.metadata,
            })));
          }
        }).catch(() => {});
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [jobs, isScraping, selectedJobIdForLogs, activeClient?.id]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadStagedLeads = async (clientId?: string) => {
    try {
      const res = await api.getStagedLeads(clientId);
      if (res.success) {
        setStagedLeads(res.stagedLeads);
      }
    } catch (err) {
      console.error('Failed to load staged leads:', err);
    }
  };

  const loadLeads = async (clientId?: string) => {
    try {
      const res = await api.getLeads({ clientId });
      if (res.success) {
        setLeads(res.leads);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    }
  };

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const res = await api.getJobs();
      if (res.success) {
        setJobs(res.jobs);
      }
    } catch (err) {
      console.error('Failed to load job queue:', err);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const handleStartPythonScraper = async () => {
    setIsScraping(true);
    setActiveTab('console');
    setLogs([
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Dispatching SwarmScraper worker for "${nicheQuery}" (Audience Floor: ${minSubs}, Limit: ${targetCount})...`,
      },
    ]);
    try {
      const res = await api.enqueueScrapeJob({
        clientId: activeClient?.id || 'C001',
        niche: nicheQuery,
        minSubs,
        limit: targetCount,
      });
      if (res.success && res.job) {
        setSelectedJobIdForLogs(res.job.id);
        setLogs((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message: `Job ${res.job.id} queued successfully. Streaming live telemetry...`,
          },
        ]);
        loadJobs();
        loadStagedLeads(activeClient?.id);
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Job dispatch failed: ${err.message}`,
        },
      ]);
      alert(`Error enqueuing scraper job: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
      loadJobs();
    } catch (err: any) {
      alert(`Failed to cancel job: ${err.message}`);
    }
  };

  const handleViewJobLogs = async (job: ScrapeJob) => {
    setSelectedJobIdForLogs(job.id);
    setActiveTab('console');
    try {
      const res = await api.getJobDetails(job.id);
      if (res.success && res.logs.length > 0) {
        setLogs(res.logs.map((l) => ({
          timestamp: l.timestamp,
          level: l.level as any,
          message: l.message,
          lead: l.metadata,
        })));
      }
    } catch (err) {
      console.error('Failed to load specific job logs:', err);
    }
  };

  const handleStartGoogleSearchGrounding = async () => {
    setIsDiscoveringGrounded(true);
    setActiveTab('console');
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Initializing Google Search Grounding discovery for "${nicheQuery}" (Min Subs: ${minSubs})...`,
      },
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Querying real-time Google Search grounding index with contact extraction...`,
      },
    ]);

    try {
      const res = await api.discoverShows(nicheQuery, activeClient?.id || 'C001', minSubs);
      if (!res.success) throw new Error(res.error || 'Search grounding discovery failed');
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          message: `Grounded discovery complete: Staged ${res.stagedCount || 'candidate'} shows into review pipeline.`,
        },
      ]);
      loadStagedLeads(activeClient?.id);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Google Search Grounding failed: ${err.message}`,
        },
      ]);
      alert(`Error during Google Search Grounding: ${err.message}`);
    } finally {
      setIsDiscoveringGrounded(false);
    }
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  };

  const activeRunningJobs = jobs.filter((j) => j.status === 'running');
  const activePendingJobs = jobs.filter((j) => j.status === 'pending');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Client Niche Profiling Header Banner */}
      {activeClient && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl shrink-0 mt-0.5">
                <Target className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-xs font-mono font-bold bg-slate-800 text-indigo-300 px-2 py-0.5 rounded border border-slate-700">
                    {activeClient.id}
                  </span>
                  <h2 className="text-lg font-bold text-slate-100">{activeClient.name}</h2>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Niche: {activeClient.niche}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    Audience Floor: <strong className="text-slate-200">{activeClient.minSubscribers?.toLocaleString()}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    Package: <strong className="text-slate-200">{activeClient.package}</strong>
                  </span>
                  {activeClient.icp?.keywords && activeClient.icp.keywords.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-slate-500" />
                      ICP Keywords: <span className="text-indigo-300 font-medium">{activeClient.icp.keywords.join(', ')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 self-end md:self-center shrink-0">
              <span className="text-xs text-slate-400 font-semibold">Active Client:</span>
              <select
                value={activeClientId}
                onChange={(e) => onSelectClient(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 shadow-inner"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.id}] {c.name} ({c.niche})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tab Bar */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 flex-wrap gap-y-2">
        <button
          onClick={() => setActiveTab('console')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'console'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Sourcing & Scraper Console</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'queue'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Job Queue & Concurrency Pool</span>
          {(activeRunningJobs.length > 0 || activePendingJobs.length > 0) && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-indigo-500 text-white font-bold animate-pulse">
              {activeRunningJobs.length + activePendingJobs.length} active
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('staging')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'staging'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Pre-Import Staging Review</span>
          {stagedLeads.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
              {stagedLeads.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('bank')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'bank'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Central Niche Tag Bank</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
            {leads.length}
          </span>
        </button>
      </div>

      {/* Tab: JOB QUEUE & CONCURRENCY MONITOR */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Scraper Background Job Queue (Max 2 Concurrent Workers)
              </h3>
              <p className="text-xs text-slate-400">
                Independent background workers execute multi-source searches without blocking the UI or crashing on concurrency.
              </p>
            </div>
            <button
              onClick={loadJobs}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh Queue</span>
            </button>
          </div>

          {/* Active Workers Section */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Active Workers & Queued Tasks ({jobs.filter((j) => j.status === 'running' || j.status === 'pending').length})
            </span>

            {jobs.filter((j) => j.status === 'running' || j.status === 'pending').length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-xs">
                No active scraping jobs running. Start a job from the Sourcing Console to test worker orchestration.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs
                  .filter((j) => j.status === 'running' || j.status === 'pending')
                  .map((job) => (
                    <div
                      key={job.id}
                      className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 shadow-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-indigo-300">[{job.clientId}]</span>
                            <span className="text-sm font-semibold text-white">{job.niche}</span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">ID: {job.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              job.status === 'running'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            }`}
                          >
                            {job.status}
                          </span>
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Cancel Job"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-slate-400">
                          <span>Progress</span>
                          <span>{job.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                        <span>Found: <strong className="text-white">{job.foundCount}</strong> leads</span>
                        <button
                          onClick={() => handleViewJobLogs(job)}
                          className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-[11px]"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>View Live Logs</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Historical Jobs Table */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Historical Jobs
            </span>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Job ID</th>
                    <th className="py-2.5 px-3">Client & Niche</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Yield</th>
                    <th className="py-2.5 px-3">Started</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {jobs.filter((j) => j.status !== 'running' && j.status !== 'pending').length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">
                        No previous jobs recorded in this workspace.
                      </td>
                    </tr>
                  ) : (
                    jobs
                      .filter((j) => j.status !== 'running' && j.status !== 'pending')
                      .slice(0, 10)
                      .map((job) => (
                        <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">{job.id}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-white">{job.niche}</span>
                            <span className="text-[11px] text-slate-500 ml-1">({job.clientId})</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                job.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                  : job.status === 'cancelled'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            {job.foundCount} staged
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleViewJobLogs(job)}
                              className="text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                              Inspect Logs
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: STAGING */}
      {activeTab === 'staging' && (
        <LeadStagingPanel
          stagedLeads={stagedLeads}
          activeClient={activeClient}
          onRefresh={() => {
            loadStagedLeads(activeClient?.id);
            loadLeads(activeClient?.id);
          }}
          onImportSuccess={() => {
            loadLeads(activeClient?.id);
            loadStagedLeads(activeClient?.id);
          }}
        />
      )}

      {/* Tab Content: BANK */}
      {activeTab === 'bank' && (
        <CentralLeadBankView
          clients={clients}
          activeClient={activeClient}
          onOpenPitchModal={onOpenPitchModal}
        />
      )}

      {/* Tab Content: CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Parameters Column */}
            <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Sourcing & Discovery Parameters
                </h2>
                <Sliders className="w-4 h-4 text-slate-500" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Target Niche / Dork Keywords</label>
                <input
                  type="text"
                  value={nicheQuery}
                  onChange={(e) => setNicheQuery(e.target.value)}
                  placeholder="e.g. B2B SaaS, DevOps, AI Founders"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Min Subscribers</label>
                  <input
                    type="number"
                    value={minSubs}
                    onChange={(e) => setMinSubs(parseInt(e.target.value) || 1000)}
                    step={500}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Shows to Query</label>
                  <input
                    type="number"
                    value={targetCount}
                    onChange={(e) => setTargetCount(parseInt(e.target.value) || 10)}
                    min={1}
                    max={20}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>
              </div>

              {/* Platform Segmented Toggles */}
              <div>
                <label className="text-xs text-slate-400 block mb-2">Target Directories & Sources</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['Apple Podcasts', 'RSS Feeds', 'Buzzsprout', 'YouTube'].map((plat) => {
                    const isChecked = selectedPlatforms.includes(plat);
                    return (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => togglePlatform(plat)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors cursor-pointer text-left min-h-[40px] ${
                          isChecked
                            ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-300 font-medium'
                            : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-700'
                          }`}
                        >
                          {isChecked && <span className="text-[10px]">✓</span>}
                        </span>
                        <span className="truncate">{plat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Triggers */}
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <button
                  onClick={handleStartPythonScraper}
                  disabled={isScraping || !nicheQuery.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] shadow-lg shadow-indigo-600/20"
                >
                  {isScraping ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Queueing Scraper Job...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Enqueue Python Lead Scraper</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleStartGoogleSearchGrounding}
                  disabled={isDiscoveringGrounded || !nicheQuery.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-700/60 min-h-[42px]"
                >
                  {isDiscoveringGrounded ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                      <span>Grounding via Google Search (gemini-3.8-flash)...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span>Discover Live Shows via Google Search</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Real-time Streaming Terminal */}
            <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-72 sm:h-80 lg:h-[420px] shadow-xl">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300 font-mono">
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {selectedJobIdForLogs ? `Telemetry: ${selectedJobIdForLogs}` : 'Live Telemetry Terminal'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">SSE STREAM</span>
                  <button
                    onClick={() => { setLogs([]); setSelectedJobIdForLogs(null); }}
                    className="hover:text-white transition-colors cursor-pointer ml-1 p-1"
                    title="Clear terminal"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex-1 p-3 sm:p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-slate-300">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center p-4">
                    <Radio className="w-6 h-6 mb-2 animate-pulse text-slate-700" />
                    <p>Telemetry standby. Start a scraping job to view live stream logs.</p>
                    <p className="text-[11px] text-slate-700 mt-1">
                      Discovered shows will automatically land in Pre-Import Staging Review for user approval.
                    </p>
                  </div>
                ) : (
                  logs.map((log, idx) => {
                    let badgeColor = 'text-slate-400';
                    if (log.level === 'WARN') badgeColor = 'text-amber-400';
                    if (log.level === 'SUCCESS') badgeColor = 'text-emerald-400 font-bold';
                    if (log.level === 'ERROR') badgeColor = 'text-rose-400 font-bold';
                    return (
                      <div key={idx} className="leading-relaxed flex items-start gap-1.5 sm:gap-2">
                        <span className="text-[10px] text-slate-600 shrink-0 select-none hidden sm:inline">
                          {log.timestamp.split('T')[1]?.replace('Z', '') || ''}
                        </span>
                        <span className={`text-[10px] uppercase font-bold shrink-0 ${badgeColor}`}>
                          [{log.level}]
                        </span>
                        <span className="text-slate-300 break-all">{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
