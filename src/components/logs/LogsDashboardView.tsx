import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollText,
  Search,
  RotateCw,
  Download,
  Copy,
  Check,
  Trash2,
  Filter,
  Shield,
  AlertTriangle,
  AlertCircle,
  Info,
  Key,
  Bot,
  Database,
  ExternalLink,
  ChevronRight,
  X,
  Clock,
  Terminal,
  FileSpreadsheet,
  FileCode,
  Share2,
} from 'lucide-react';
import { SystemLogItem } from '../../types';
import { api } from '../../lib/api';
import { useToast } from '../ui/Toast';

interface LogsDashboardViewProps {
  tenantId?: string;
  userRole?: string;
}

export const LogsDashboardView: React.FC<LogsDashboardViewProps> = ({
  tenantId = 'tenant_default',
  userRole = 'owner',
}) => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<SystemLogItem | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copiedAdminReport, setCopiedAdminReport] = useState<boolean>(false);

  const autoRefreshTimerRef = useRef<any>(null);

  const fetchLogs = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setIsLoading(true);
    try {
      const res = await api.getSystemLogs({
        level: selectedLevel !== 'ALL' ? selectedLevel : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        search: searchQuery.trim() || undefined,
        limit: 100,
        offset: 0,
      });

      if (res.success) {
        setLogs(res.logs || []);
        setTotalLogs(res.total || 0);
      }
    } catch (err: any) {
      console.warn('Failed to load system logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
  }, [selectedLevel, selectedCategory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchLogs(false);
      }, 3000);
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, selectedLevel, selectedCategory, searchQuery]);

  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(true);
    try {
      const { content, filename } = await api.exportSystemLogs({
        format,
        level: selectedLevel !== 'ALL' ? selectedLevel : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        search: searchQuery.trim() || undefined,
      });

      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Audit logs exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyAdminReport = () => {
    const errorCount = logs.filter((l) => l.level === 'ERROR').length;
    const warnCount = logs.filter((l) => l.level === 'WARN').length;
    const authCount = logs.filter((l) => l.level === 'AUTH').length;

    const reportHeader = [
      `=====================================================`,
      `PODCONNECT HUB AI - SYSTEM AUDIT & EVENT LOGS REPORT`,
      `Generated At: ${new Date().toISOString()}`,
      `Workspace Tenant: ${tenantId}`,
      `Reported By: Operator (Role: ${userRole})`,
      `Total Log Entries Captured: ${logs.length}`,
      `Summary: [Errors: ${errorCount} | Warnings: ${warnCount} | Auth Events: ${authCount}]`,
      `=====================================================\n`,
    ].join('\n');

    const formattedEvents = logs.slice(0, 50).map((l, idx) => {
      const meta = l.metadata ? ` | Meta: ${JSON.stringify(l.metadata)}` : '';
      const user = l.userId ? ` | User: ${l.userId}` : '';
      const ip = l.ipAddress ? ` | IP: ${l.ipAddress}` : '';
      return `[${l.timestamp}] [${l.level}] [${l.category.toUpperCase()}] ${l.message}${user}${ip}${meta}`;
    }).join('\n');

    const fullReport = `${reportHeader}\nLATEST 50 EVENT ENTRIES:\n${formattedEvents}\n\n=====================================================`;

    navigator.clipboard.writeText(fullReport);
    setCopiedAdminReport(true);
    toast.success('Sanitized diagnostics report copied to clipboard. Share with system admin.');
    setTimeout(() => setCopiedAdminReport(false), 3000);
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear system event logs for this workspace? This cannot be undone.')) {
      return;
    }
    try {
      await api.clearSystemLogs();
      setLogs([]);
      setTotalLogs(0);
      toast.success('System logs cleared cleanly');
    } catch (err: any) {
      toast.error(`Failed to clear logs: ${err.message}`);
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3 shrink-0" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            WARN
          </span>
        );
      case 'AUTH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Shield className="w-3 h-3 shrink-0" />
            AUTH
          </span>
        );
      case 'AUDIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Key className="w-3 h-3 shrink-0" />
            AUDIT
          </span>
        );
      case 'MCP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <Bot className="w-3 h-3 shrink-0" />
            MCP
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
            <Info className="w-3 h-3 shrink-0" />
            INFO
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auth':
        return <Shield className="w-3.5 h-3.5 text-indigo-400" />;
      case 'scraper':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case 'mcp':
        return <Bot className="w-3.5 h-3.5 text-cyan-400" />;
      case 'database':
        return <Database className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <ScrollText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const levels = ['ALL', 'ERROR', 'WARN', 'AUTH', 'AUDIT', 'MCP', 'INFO'];
  const categories = ['ALL', 'auth', 'api', 'scraper', 'email', 'database', 'mcp', 'system'];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl shrink-0 mt-0.5">
              <ScrollText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white">Event Console & Audit Logs</h1>
                <span className="text-xs font-mono font-bold bg-slate-800 text-indigo-300 px-2 py-0.5 rounded border border-slate-700">
                  {totalLogs} Events
                </span>
                <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                  Tenant: {tenantId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time security auditing, MCP agent tool traces, API access verifications, and scraping engine diagnostics.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyAdminReport}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
              title="Copy formatted diagnostic log report to share with system administrators"
            >
              {copiedAdminReport ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedAdminReport ? 'Copied Report!' : 'Share with Admin'}</span>
            </button>

            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
              <button
                onClick={() => handleExport('json')}
                disabled={isExporting || logs.length === 0}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Export as structured JSON file"
              >
                <FileCode className="w-3.5 h-3.5 text-sky-400" />
                <span>JSON</span>
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting || logs.length === 0}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Export as CSV spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
            </div>

            {(userRole === 'owner' || userRole === 'admin') && (
              <button
                onClick={handleClearLogs}
                disabled={logs.length === 0}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl border border-slate-800 hover:border-rose-500/30 transition-colors cursor-pointer disabled:opacity-40"
                title="Clear system event logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event messages, user IDs, tools, or metadata keywords..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown & Auto Refresh Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-200">
                    {cat === 'ALL' ? 'All Categories' : cat.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Toggle live log polling (every 3 seconds)"
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span>{autoRefresh ? 'Live Stream: On' : 'Live Stream: Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchLogs(true)}
              className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors cursor-pointer"
              title="Refresh logs now"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Level Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 text-xs scrollbar-none">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Level:</span>
          {levels.map((lvl) => {
            const isSelected = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-mono">
              <tr>
                <th className="py-3 px-4 w-44">Timestamp</th>
                <th className="py-3 px-3 w-28">Level</th>
                <th className="py-3 px-3 w-28">Category</th>
                <th className="py-3 px-3 w-36">Context</th>
                <th className="py-3 px-4">Event Message</th>
                <th className="py-3 px-3 text-right w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Terminal className="w-8 h-8 text-slate-600" />
                      <p className="text-slate-400 font-medium">No event logs matching your current filters.</p>
                      <p className="text-[11px] text-slate-600">
                        Adjust search filters or trigger actions (scraping, authentication, MCP tools) to generate logs.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                        {log.timestamp.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getLevelBadge(log.level)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                          {getCategoryIcon(log.category)}
                          <span className="capitalize">{log.category}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[150px]">
                        {log.userId ? (
                          <span className="text-indigo-300 font-medium">@{log.userId}</span>
                        ) : log.ipAddress ? (
                          <span className="text-slate-500">{log.ipAddress}</span>
                        ) : (
                          <span className="text-slate-600">system</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-200 break-all leading-relaxed">
                        <span className="group-hover:text-white transition-colors">{log.message}</span>
                        {log.metadata && (
                          <span className="ml-2 text-[10px] bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
                            +data
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold flex items-center gap-1 ml-auto"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Inspector Modal / Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Event Log Inspector</h3>
                  <p className="text-[11px] font-mono text-slate-500">{selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Level</span>
                  <div>{getLevelBadge(selectedLog.level)}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Category</span>
                  <div className="text-slate-200 font-bold capitalize">{selectedLog.category}</div>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Tenant</span>
                  <div className="text-indigo-300 font-bold">{selectedLog.tenantId}</div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Timestamp</span>
                <div className="text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedLog.timestamp}</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Message</span>
                <div className="text-slate-100 font-mono text-xs leading-relaxed break-all">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.metadata && (
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Metadata / Payload</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(selectedLog.metadata, null, 2));
                        toast.success('Metadata JSON copied to clipboard');
                      }}
                      className="text-indigo-400 hover:text-indigo-300 text-[10px] font-semibold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </button>
                  </div>
                  <pre className="text-[11px] text-emerald-400 font-mono bg-slate-900/80 p-3 rounded-lg overflow-x-auto border border-slate-800/80 max-h-48">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => {
                  const line = `[${selectedLog.timestamp}] [${selectedLog.level}] [${selectedLog.category}] ${selectedLog.message} (Tenant: ${selectedLog.tenantId})`;
                  navigator.clipboard.writeText(line);
                  toast.success('Single log entry copied');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Entry</span>
              </button>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
