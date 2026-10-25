import React, { useState } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  MoreVertical,
  Calendar,
  FileText,
  ExternalLink,
  Ban,
  PauseCircle,
  PlayCircle,
  Search as SearchIcon,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { Client, ClientStage } from '../../types';

interface ClientsTableListingProps {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onStageChange: (client: Client, newStage: ClientStage) => void;
  onOpenCancelModal: (client: Client) => void;
  onTogglePause: (client: Client) => void;
  onNavigateToScraper: (clientId: string) => void;
  onNavigateToOutreach: (clientId: string) => void;
}

const ALL_STAGES: ClientStage[] = [
  'Onboarding',
  'Scoping',
  'Lead Sourcing',
  'Outreach Active',
  'Interview Scheduled',
  'Completed',
  'Paused',
  'Cancelled',
];

export const ClientsTableListing: React.FC<ClientsTableListingProps> = ({
  clients,
  onSelectClient,
  onStageChange,
  onOpenCancelModal,
  onTogglePause,
  onNavigateToScraper,
  onNavigateToOutreach,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'id' | 'startDate' | 'pricing'>('id');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const filteredClients = clients
    .filter((c) => {
      const currentStage = (c.status === 'Cancelled' ? 'Cancelled' : c.status === 'Paused' ? 'Paused' : (c.stage || 'Onboarding')).toLowerCase();
      const matchesStage = stageFilter === 'all' || currentStage === stageFilter.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.niche.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.package.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStage && matchesSearch;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        comparison = a.id.localeCompare(b.id);
      } else if (sortField === 'startDate') {
        comparison = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else if (sortField === 'pricing') {
        comparison = a.pricing.localeCompare(b.pricing);
      }
      return sortAsc ? comparison : -comparison;
    });

  const toggleSort = (field: 'id' | 'startDate' | 'pricing') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getStageBadgeColor = (stage: ClientStage) => {
    switch (stage) {
      case 'Onboarding':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'Scoping':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'Lead Sourcing':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Outreach Active':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Interview Scheduled':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Completed':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Paused':
        return 'bg-amber-950/40 text-amber-300 border-amber-800/60';
      case 'Cancelled':
        return 'bg-rose-950/40 text-rose-400 border-rose-800/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by client ID, name, or niche..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[40px]"
          />
        </div>

        {/* Stage Filter Segmented Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto text-xs">
          {['all', 'onboarding', 'scoping', 'lead sourcing', 'outreach active', 'interview scheduled', 'completed', 'paused', 'cancelled'].map((stg) => (
            <button
              key={stg}
              onClick={() => setStageFilter(stg)}
              className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer capitalize whitespace-nowrap min-h-[34px] ${
                stageFilter === stg
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {stg}
            </button>
          ))}
        </div>
      </div>

      {/* Main Records Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {filteredClients.length === 0 ? (
          <div className="p-8 sm:p-12 text-center space-y-3">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No client records found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm || stageFilter !== 'all'
                ? 'Try adjusting your search query or stage filter.'
                : 'No clients are currently registered in this view.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="md:hidden divide-y divide-slate-800/80">
              {filteredClients.map((client) => {
                const currentStage: ClientStage = client.status === 'Cancelled' ? 'Cancelled' : client.status === 'Paused' ? 'Paused' : (client.stage || 'Onboarding');
                return (
                  <div
                    key={client.id}
                    onClick={() => onSelectClient(client)}
                    className="p-4 space-y-3 hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-400">{client.id}</span>
                        <span className="font-semibold text-sm text-white">{client.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStageBadgeColor(currentStage)}`}>
                        {currentStage}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400">
                      <span className="text-slate-500">Niche:</span> {client.niche}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Pricing</span>
                        <span className="text-emerald-400 font-semibold">{client.pricing}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Timeline</span>
                        <span className="text-slate-300">{client.contractDays || 120} Days</span>
                      </div>
                    </div>

                    {/* Quick Action Buttons on Mobile */}
                    <div className="flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectClient(client)}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded cursor-pointer"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => onNavigateToScraper(client.id)}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-sky-300 rounded cursor-pointer"
                      >
                        Scraper
                      </button>
                      <button
                        onClick={() => onNavigateToOutreach(client.id)}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded cursor-pointer"
                      >
                        Outreach
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('id')}>
                      <div className="flex items-center gap-1">
                        <span>Client ID</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Client / Brand</th>
                    <th className="py-3 px-4">Target Niche</th>
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('pricing')}>
                      <div className="flex items-center gap-1">
                        <span>Pricing & Package</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Stage & Status</th>
                    <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => toggleSort('startDate')}>
                      <div className="flex items-center gap-1">
                        <span>Timeline Dates</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Workspace Assets</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredClients.map((client) => {
                    const currentStage: ClientStage = client.status === 'Cancelled' ? 'Cancelled' : client.status === 'Paused' ? 'Paused' : (client.stage || 'Onboarding');
                    const isCancelled = client.status === 'Cancelled' || currentStage === 'Cancelled';
                    const isPaused = client.status === 'Paused' || currentStage === 'Paused';

                    return (
                      <tr
                        key={client.id}
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                        onClick={() => onSelectClient(client)}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-indigo-400">
                          {client.id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{client.name}</div>
                          <div className="text-[11px] text-slate-500">{client.platform}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-300 max-w-[170px] truncate">{client.niche}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            $\ge$ {(client.minSubscribers || 1000).toLocaleString()} subs
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-emerald-400 font-semibold font-mono tabular-nums">{client.pricing}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{client.package}</div>
                        </td>
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <select
                              value={currentStage}
                              onChange={(e) => onStageChange(client, e.target.value as ClientStage)}
                              className={`bg-slate-950 border rounded px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer ${getStageBadgeColor(currentStage)}`}
                            >
                              {ALL_STAGES.map((stg) => (
                                <option key={stg} value={stg} className="bg-slate-900 text-slate-200">
                                  {stg}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 tabular-nums">
                          <div>{client.startDate}</div>
                          <div className="text-slate-500">to {client.endDate}</div>
                        </td>
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-0.5 text-[11px]">
                            {client.docs.requirementsDocUrl && (
                              <a
                                href={client.docs.requirementsDocUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 truncate max-w-[140px]"
                              >
                                <FileText className="w-3 h-3 shrink-0" />
                                <span className="truncate">Requirements</span>
                              </a>
                            )}
                            {client.docs.conversationExportUrl && (
                              <a
                                href={client.docs.conversationExportUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 truncate max-w-[140px]"
                              >
                                <FileText className="w-3 h-3 shrink-0" />
                                <span className="truncate">Transcript</span>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onSelectClient(client)}
                              title="View Order Details & Deliverables"
                              className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded text-xs transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => onNavigateToScraper(client.id)}
                              title="Open Lead Scraper"
                              className="p-1.5 text-sky-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            >
                              <SearchIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onNavigateToOutreach(client.id)}
                              title="Open Outreach Hub"
                              className="p-1.5 text-indigo-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                            {!isCancelled && (
                              <button
                                onClick={() => onOpenCancelModal(client)}
                                title="Process Order Cancellation"
                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
