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
} from 'lucide-react';
import { Client, Lead, ScrapeLog } from '../types';

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

  const [nicheQuery, setNicheQuery] = useState(activeClient?.niche || 'B2B SaaS and AI');
  const [minSubs, setMinSubs] = useState<number>(activeClient?.minSubscribers || 1000);
  const [targetCount, setTargetCount] = useState<number>(5);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'Apple Podcasts',
    'RSS Feeds',
    'Buzzsprout',
    'YouTube',
  ]);

  const [isScraping, setIsScraping] = useState(false);
  const [isDiscoveringGrounded, setIsDiscoveringGrounded] = useState(false);
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeClient) {
      setNicheQuery(activeClient.niche);
      setMinSubs(activeClient.minSubscribers || 1000);
      loadLeads(activeClient.id);
    } else {
      loadLeads();
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
          loadLeads(activeClient?.id);
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

  const loadLeads = async (clientId?: string) => {
    setIsLoadingLeads(true);
    try {
      const url = clientId ? `/api/leads?client_id=${clientId}` : '/api/leads';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.leads)) {
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
      loadLeads(activeClient?.id);
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
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Multi-Source Lead Sourcing & Scraping</h1>
            <span className="text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
              Python + SQLite + Gemini
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous show discovery, RSS XML & directory extraction, robots.txt courtesy token bucket, and verified contact harvesting.
          </p>
        </div>

        {clients.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-slate-500">Client:</span>
            <select
              value={activeClientId}
              onChange={(e) => onSelectClient(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-indigo-500 min-h-[38px]"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.id}] {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Control Panel Grid: Responsive 1 col on mobile/tablet, 2 col on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Parameters Column */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Scraping & Discovery Parameters
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
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Shows to Query</label>
              <input
                type="number"
                value={targetCount}
                onChange={(e) => setTargetCount(parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
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
                    className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer text-left min-h-[40px] ${
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
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
            >
              {isScraping ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Executing Python Multi-Source Scraper...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Run Compliant Python Lead Scraper</span>
                </>
              )}
            </button>

            <button
              onClick={handleStartGoogleSearchGrounding}
              disabled={isDiscoveringGrounded || !nicheQuery.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-700/60 min-h-[42px]"
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
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-72 sm:h-80 lg:h-[420px]">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-mono">
              <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Live Telemetry Terminal</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
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
                  Parsing robots.txt directives, RSS XML enclosures, and email regular expressions.
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

      {/* Discovered & Stored Leads Ledger */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">
              Persistent Sourced Leads ({leads.length})
            </h2>
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">podconnect_leads.db</span>
          </div>

          <button
            onClick={() => loadLeads(activeClient?.id)}
            disabled={isLoadingLeads}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer min-h-[34px]"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoadingLeads ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {leads.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">No leads stored in database for this client yet.</p>
            <p className="text-[11px] text-slate-600">
              Run the Python scraper or Gemini Search Grounding above to populate discovered shows.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Lead Cards (Visible on phones < md) */}
            <div className="md:hidden divide-y divide-slate-800/80">
              {leads.map((lead) => (
                <div key={lead.id} className="py-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-white text-sm flex items-center gap-1.5">
                        <span>{lead.showName}</span>
                        {lead.showUrl && (
                          <a
                            href={lead.showUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-indigo-400"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <User className="w-3 h-3 text-slate-500" />
                        <span>{lead.hostName || 'Show Host'}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">{lead.platform}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-indigo-400 tabular-nums">
                        {lead.score?.toFixed(1)}/10
                      </span>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {lead.subscribers?.toLocaleString()} subs
                      </div>
                    </div>
                  </div>

                  {lead.email && (
                    <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          lead.status === 'Booked'
                            ? 'bg-emerald-400'
                            : lead.status === 'Dispatched'
                            ? 'bg-sky-400'
                            : lead.status === 'Pitch Drafted'
                            ? 'bg-amber-400'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span className="text-slate-300 font-medium">{lead.status}</span>
                    </div>

                    <button
                      onClick={() => onOpenPitchModal(lead)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer min-h-[36px]"
                    >
                      <Send className="w-3 h-3" />
                      <span>Pitch Host</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Tablet Table (Visible on md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Show & Host</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Contact Email</th>
                    <th className="py-2.5 px-3">Subscribers</th>
                    <th className="py-2.5 px-3">Relevance</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Outreach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{lead.showName}</span>
                          {lead.showUrl && (
                            <a
                              href={lead.showUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-indigo-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{lead.hostName || 'Show Host'}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-500 font-mono text-[10px]">{lead.niche}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{lead.platform}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {lead.email ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-emerald-500" />
                            <span>{lead.email}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Scrape from form</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200">
                        {lead.subscribers?.toLocaleString() || '1,000+'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-400 tabular-nums">
                        {lead.score?.toFixed(1) || '7.5'} / 10
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              lead.status === 'Booked'
                                ? 'bg-emerald-400'
                                : lead.status === 'Dispatched'
                                ? 'bg-sky-400'
                                : lead.status === 'Pitch Drafted'
                                ? 'bg-amber-400'
                                : 'bg-slate-500'
                            }`}
                          />
                          <span className="font-medium text-slate-300">{lead.status}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onOpenPitchModal(lead)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Pitch Host</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
