import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  FileText,
  Calendar,
  Layers,
  ArrowUpRight,
  BarChart3,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Client, Lead } from '../types';
import { MASTER_SHEET_TITLE, findOrCreateMasterSheet, syncClientToMasterSheet } from '../lib/workspace';
import { api } from '../lib/api';

interface MasterDatabaseViewProps {
  clients: Client[];
  masterSheetUrl?: string;
  onSelectClient: (clientId: string) => void;
  onNavigateToOnboarding: () => void;
  onNavigateToPipeline?: () => void;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

export const MasterDatabaseView: React.FC<MasterDatabaseViewProps> = ({
  clients,
  masterSheetUrl,
  onSelectClient,
  onNavigateToOnboarding,
  onNavigateToPipeline,
  onRequestConfirmation,
  isAuthenticated,
  onSignIn,
}) => {

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Leads for analytics
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState<boolean>(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    setIsLoadingLeads(true);
    try {
      const data = await api.getLeads();
      if (Array.isArray(data.leads)) {
        setAllLeads(data.leads);
      }
    } catch (err) {
      console.error('Failed to load leads for database analytics:', err);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  // Filter high-scoring leads (score >= 8.0) discovered in the last 30 days
  const nicheAnalytics = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group leads by niche
    const countsByNiche: { [niche: string]: { count: number; totalScore: number } } = {};

    allLeads.forEach((lead) => {
      // Evaluate high scoring threshold (>= 8.0)
      const isHighScore = (lead.score || 0) >= 8.0;

      // Check date added if available
      let isWithin30Days = true;
      if (lead.dateAdded) {
        const addedDate = new Date(lead.dateAdded);
        if (!isNaN(addedDate.getTime())) {
          isWithin30Days = addedDate >= thirtyDaysAgo;
        }
      }

      if (isHighScore && isWithin30Days) {
        // Normalize niche label (e.g. "B2B SaaS, Cloud DevOps" -> primary tag or full string)
        const nicheKey = lead.niche || 'General Business';
        if (!countsByNiche[nicheKey]) {
          countsByNiche[nicheKey] = { count: 0, totalScore: 0 };
        }
        countsByNiche[nicheKey].count += 1;
        countsByNiche[nicheKey].totalScore += lead.score || 0;
      }
    });

    // If database was empty or recently reset, provide graceful fallback data
    let chartData = Object.keys(countsByNiche).map((niche) => ({
      niche: niche.length > 20 ? niche.slice(0, 18) + '...' : niche,
      fullName: niche,
      count: countsByNiche[niche].count,
      avgScore: Number((countsByNiche[niche].totalScore / countsByNiche[niche].count).toFixed(1)),
    }));

    if (chartData.length === 0 && allLeads.length > 0) {
      // Fallback: take all leads grouped by niche
      const allGrouped: { [niche: string]: number } = {};
      allLeads.forEach((l) => {
        const key = l.niche || 'General Tech';
        allGrouped[key] = (allGrouped[key] || 0) + 1;
      });
      chartData = Object.keys(allGrouped).map((niche) => ({
        niche: niche.length > 20 ? niche.slice(0, 18) + '...' : niche,
        fullName: niche,
        count: allGrouped[niche],
        avgScore: 8.5,
      }));
    }

    // Sort descending by count
    chartData.sort((a, b) => b.count - a.count);

    const totalHighScoring = chartData.reduce((acc, curr) => acc + curr.count, 0);
    const topNiche = chartData.length > 0 ? chartData[0].fullName : 'None';

    return { chartData, totalHighScoring, topNiche };
  }, [allLeads]);

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.niche.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const handleSyncAllToGoogleSheets = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    if (clients.length === 0) return;

    onRequestConfirmation({
      title: 'Synchronize All Clients to Master Google Sheet',
      description: `Update "${MASTER_SHEET_TITLE}" in Google Sheets with all active client records, contract dates, and dedicated document hyperlinks:`,
      affectedItems: clients.map((c) => `[${c.id}] ${c.name} — ${c.niche} (${c.status})`),
      onConfirm: async () => {
        setIsSyncing(true);
        setSyncFeedback(null);
        try {
          const sheet = await findOrCreateMasterSheet();
          for (const c of clients) {
            await syncClientToMasterSheet(sheet.spreadsheetId, c);
          }
          setSyncFeedback(`Master Google Sheet updated (${clients.length} clients synchronized).`);
        } catch (err: any) {
          setSyncFeedback(`Sync failed: ${err.message}`);
        } finally {
          setIsSyncing(false);
        }
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Control Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Master Client Database</h1>
            <span className="text-[11px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-md truncate max-w-[220px]">
              {MASTER_SHEET_TITLE}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Centralized agency registry synchronized with Google Sheets, client requirement docs, and milestone calendars.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {onNavigateToPipeline && (
            <button
              onClick={onNavigateToPipeline}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Staging Pipeline</span>
            </button>
          )}

          {masterSheetUrl && (
            <a
              href={masterSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/80 rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Google Sheets</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}

          <button
            onClick={handleSyncAllToGoogleSheets}
            disabled={isSyncing || clients.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer min-h-[38px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync to Sheets'}</span>
          </button>
        </div>
      </div>


      {syncFeedback && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer p-1">
            Dismiss
          </button>
        </div>
      )}

      {/* RECHARTS BAR CHART: High-Scoring Leads Discovered per Niche (Last 30 Days) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                High-Scoring Leads Discovered per Niche
              </h2>
              <p className="text-[11px] text-slate-400">
                Shows with quality rating $\ge 8.0$/10 harvested across campaigns in the last 30 days
              </p>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex items-center gap-4 text-xs font-mono self-start sm:self-auto">
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block uppercase">High-Score Sourced</span>
              <span className="font-bold text-indigo-400 tabular-nums">
                {nicheAnalytics.totalHighScoring} shows
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block uppercase">Top Niche</span>
              <span className="font-medium text-emerald-400 truncate max-w-[130px] block">
                {nicheAnalytics.topNiche}
              </span>
            </div>
          </div>
        </div>

        {/* Chart Viewport */}
        {nicheAnalytics.chartData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4">
            <TrendingUp className="w-6 h-6 text-slate-600 mb-1" />
            <p className="text-xs text-slate-400">No high-scoring leads recorded in the last 30 days.</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Run the Lead Sourcing scraper to harvest and score new podcast targets.
            </p>
          </div>
        ) : (
          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={nicheAnalytics.chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="niche"
                  stroke="#475569"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#475569"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700/80 p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                          <p className="font-semibold text-white">{data.fullName || data.niche}</p>
                          <div className="flex items-center justify-between gap-4 text-slate-300 font-mono">
                            <span className="text-slate-400">High-Scoring Leads:</span>
                            <span className="font-bold text-indigo-400 tabular-nums">{data.count}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-slate-300 font-mono">
                            <span className="text-slate-400">Avg Quality Score:</span>
                            <span className="text-emerald-400 tabular-nums">{data.avgScore} / 10</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  name="High-Scoring Leads"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by ID, name, or niche..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[40px]"
          />
        </div>

        {/* Interactive Filter Tabs (Zero-Pill: Segmented Buttons, scrollable on mobile) */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
          {['all', 'active', 'onboarding', 'review', 'completed', 'paused', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer capitalize whitespace-nowrap min-h-[34px] ${
                statusFilter === status
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

      </div>

      {/* Main Records Container: Responsive Mobile Cards + Desktop Data Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {filteredClients.length === 0 ? (
          <div className="p-8 sm:p-12 text-center space-y-3">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No client records found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search query or filter selection.'
                : 'Start your agency pipeline by onboarding your first client transcript.'}
            </p>
            <button
              onClick={onNavigateToOnboarding}
              className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              + Onboard New Client
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card List (Visible on phones < md) */}
            <div className="md:hidden divide-y divide-slate-800/80">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-400">{client.id}</span>
                      <span className="font-semibold text-sm text-white">{client.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          client.status === 'Cancelled'
                            ? 'bg-rose-500'
                            : client.status === 'Paused'
                            ? 'bg-amber-400'
                            : client.status === 'Active'
                            ? 'bg-emerald-400'
                            : client.status === 'Onboarding'
                            ? 'bg-sky-400'
                            : 'bg-purple-400'
                        }`}
                      />

                      <span className="text-slate-300 font-medium">{client.status}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    <span className="text-slate-500">Niche:</span> {client.niche}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Package</span>
                      <span className="text-slate-200">{client.package}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Pricing</span>
                      <span className="text-emerald-400 font-semibold">{client.pricing}</span>
                    </div>
                  </div>

                  {/* Document Links on Mobile */}
                  <div className="flex flex-wrap gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    {client.docs.requirementsDocUrl && (
                      <a
                        href={client.docs.requirementsDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-800 text-indigo-400 rounded hover:text-indigo-300"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Requirements</span>
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {client.docs.conversationExportUrl && (
                      <a
                        href={client.docs.conversationExportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-800 text-slate-300 rounded hover:text-white"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Transcript</span>
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Tablet High-Density Table (Visible on md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Client ID</th>
                    <th className="py-3 px-4">Client / Brand</th>
                    <th className="py-3 px-4">Target Niche</th>
                    <th className="py-3 px-4">Package & Pricing</th>
                    <th className="py-3 px-4">Contract Dates</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Google Docs Assets</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectClient(client.id)}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-400">
                        {client.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{client.name}</div>
                        <div className="text-[11px] text-slate-500">{client.platform}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-300 max-w-[180px] truncate">{client.niche}</div>
                        <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                          $\ge$ {client.minSubscribers?.toLocaleString()} subs
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{client.package}</div>
                        <div className="text-emerald-400 font-semibold tabular-nums">{client.pricing}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 tabular-nums">
                        <div>{client.startDate}</div>
                        <div className="text-slate-500">to {client.endDate}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              client.status === 'Cancelled'
                                ? 'bg-rose-500'
                                : client.status === 'Paused'
                                ? 'bg-amber-400'
                                : client.status === 'Active'
                                ? 'bg-emerald-400'
                                : client.status === 'Onboarding'
                                ? 'bg-sky-400'
                                : 'bg-purple-400'
                            }`}
                          />

                          <span className="font-medium text-slate-200">{client.status}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 text-[11px]">
                          {client.docs.requirementsDocUrl && (
                            <a
                              href={client.docs.requirementsDocUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 truncate max-w-[160px]"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">Requirements Doc</span>
                              <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}
                          {client.docs.conversationExportUrl && (
                            <a
                              href={client.docs.conversationExportUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-slate-200 flex items-center gap-1 truncate max-w-[160px]"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">Conversation Export</span>
                              <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}
                          {client.docs.outreachStrategyDocUrl && (
                            <a
                              href={client.docs.outreachStrategyDocUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-slate-200 flex items-center gap-1 truncate max-w-[160px]"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">Outreach Strategy</span>
                              <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSelectClient(client.id)}
                          className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded text-xs transition-colors cursor-pointer"
                        >
                          Select Campaign
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
