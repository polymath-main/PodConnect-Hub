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
} from 'lucide-react';
import { Client, Lead, StagedLead, ScrapeLog } from '../types';
import { LeadStagingPanel } from './leads/LeadStagingPanel';
import { CentralLeadBankView } from './leads/CentralLeadBankView';

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

  const [activeTab, setActiveTab] = useState<'console' | 'staging' | 'bank'>('console');
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
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

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
  }, [activeClientId]);

  useEffect(() => {
    const eventSource = new EventSource('/api/scrape/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        setLogs((prev) => [
          ...prev.slice(-150),
          {
            timestamp: data.timestamp || new Date().toISOString(),
            level: data.level || 'INFO',
            message: data.message || '',
            lead: data.lead,
          },
        ]);

        if (data.lead || data.level === 'SUCCESS') {
          loadStagedLeads(activeClient?.id);
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [activeClient?.id]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadStagedLeads = async (clientId?: string) => {
    try {
      const url = clientId && clientId !== 'ALL' ? `/api/staged-leads?client_id=${clientId}` : '/api/staged-leads';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setStagedLeads(json);
      }
    } catch (err) {
      console.error('Failed to load staged leads:', err);
    }
  };

  const loadLeads = async (clientId?: string) => {
    setIsLoadingLeads(true);
    try {
      const url = clientId && clientId !== 'ALL' ? `/api/leads?clientId=${clientId}` : '/api/leads';
      const res = await fetch(url);
      const json = await res.json();
      if (Array.isArray(json)) {
        setLeads(json);
      } else if (json.success && Array.isArray(json.leads)) {
        setLeads(json.leads);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const handleStartPythonScraper = async () => {
    setIsScraping(true);
    try {
      const res = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeClient?.id || 'C001',
          niche: nicheQuery,
          minSubs,
          limit: targetCount,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to start scraper job');
      } else {
        loadStagedLeads(activeClient?.id);
      }
    } catch (err: any) {
      alert(`Error starting scraper: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleStartGoogleSearchGrounding = async () => {
    setIsDiscoveringGrounded(true);
    try {
      const res = await fetch('/api/gemini/discover-shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: nicheQuery,
          clientId: activeClient?.id || 'C001',
          minSubs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search grounding discovery failed');
      loadStagedLeads(activeClient?.id);
      setActiveTab('staging');
    } catch (err: any) {
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
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
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

      {/* Tab Content */}
      {activeTab === 'staging' && (
        <LeadStagingPanel
          stagedLeads={stagedLeads}
          activeClient={activeClient}
          onRefresh={() => {
            loadStagedLeads(activeClient?.id);
            loadLeads(activeClient?.id);
          }}
          onImportSuccess={(importedCount) => {
            loadLeads(activeClient?.id);
            loadStagedLeads(activeClient?.id);
          }}
        />
      )}

      {activeTab === 'bank' && (
        <CentralLeadBankView
          clients={clients}
          activeClient={activeClient}
          onOpenPitchModal={onOpenPitchModal}
        />
      )}

      {activeTab === 'console' && (
        <div className="space-y-6">
          {/* Control Panel Grid: Responsive 1 col on mobile/tablet, 2 col on lg */}
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
                      <span>Executing Python Multi-Source Scraper...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Run Python Lead Scraper to Staging</span>
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
                  <span className="truncate">Live Telemetry Terminal</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="hidden sm:inline">SSE STREAM</span>
                  <button
                    onClick={() => setLogs([])}
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
