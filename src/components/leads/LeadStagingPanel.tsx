import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Tag,
  Mail,
  Users,
  Building2,
  Sparkles,
} from 'lucide-react';
import { StagedLead, Client } from '../../types';
import { LeadEditModal } from './LeadEditModal';

interface LeadStagingPanelProps {
  stagedLeads: StagedLead[];
  activeClient?: Client | null;
  onRefresh: () => void;
  onImportSuccess: (importedCount: number) => void;
}

export const LeadStagingPanel: React.FC<LeadStagingPanelProps> = ({
  stagedLeads,
  activeClient,
  onRefresh,
  onImportSuccess,
}) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingLead, setEditingLead] = useState<StagedLead | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterNiche, setFilterNiche] = useState<string>('ALL');
  const [importing, setImporting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter leads based on active client or local query
  const filteredLeads = stagedLeads.filter((lead) => {
    const matchesClient = !activeClient || lead.clientId === activeClient.id || activeClient.id === 'ALL';
    const matchesSearch =
      !searchQuery ||
      lead.showName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.hostName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.tags && lead.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));
    const matchesNiche = filterNiche === 'ALL' || lead.niche.toLowerCase() === filterNiche.toLowerCase();

    return matchesClient && matchesSearch && matchesNiche;
  });

  const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.includes(l.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleEditSave = async (updatedData: Partial<StagedLead>) => {
    if (!editingLead) return;
    try {
      const res = await fetch(`/api/staged-leads/${editingLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error('Failed to update staged lead');
      setActionMessage({ type: 'success', text: `Updated ${editingLead.showName}` });
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteOne = async (id: number) => {
    try {
      const res = await fetch(`/api/staged-leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to discard lead');
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleBulkDiscard = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to discard ${selectedIds.length} staged lead(s)?`)) return;

    try {
      for (const id of selectedIds) {
        await fetch(`/api/staged-leads/${id}`, { method: 'DELETE' });
      }
      setSelectedIds([]);
      setActionMessage({ type: 'success', text: `Discarded ${selectedIds.length} staged lead(s)` });
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleImportSelected = async () => {
    const idsToImport = selectedIds.length > 0 ? selectedIds : filteredLeads.map((l) => l.id);
    if (idsToImport.length === 0) {
      setActionMessage({ type: 'error', text: 'No staged leads selected for import.' });
      return;
    }

    setImporting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/staged-leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToImport }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import staged leads');

      setActionMessage({
        type: 'success',
        text: `Approved and imported ${data.importedCount} lead(s) into core database.`,
      });
      setSelectedIds([]);
      onRefresh();
      onImportSuccess(data.importedCount);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const uniqueNiches = Array.from(new Set(stagedLeads.map((l) => l.niche).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Operational Status Summary Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                🟢 Operational Status
              </h4>
              <p className="text-xs text-emerald-200/90 mt-1">
                Scraper and staging engine active. Data validation pre-check passing.
              </p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                ⚠️ Action Required
              </h4>
              <p className="text-xs text-amber-200/90 mt-1">
                {stagedLeads.length > 0
                  ? `Review ${stagedLeads.length} staged lead(s) before approving database import.`
                  : 'No staged leads waiting. Run lead sourcing scraper to generate new leads.'}
              </p>
            </div>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start space-x-3">
            <BarChart3 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                📊 Pipeline Status
              </h4>
              <p className="text-xs text-indigo-200/90 mt-1">
                Staged: <span className="font-bold text-slate-100">{stagedLeads.length}</span> |
                Selected: <span className="font-bold text-emerald-400">{selectedIds.length}</span> |
                Active Client: <span className="font-bold text-slate-100">{activeClient?.name || 'All Clients'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Control Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        {/* Left: Selection controls */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={toggleSelectAll}
            className="flex items-center space-x-2 text-xs font-semibold px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
          >
            {allSelected ? <CheckSquare className="w-4 h-4 text-indigo-400" /> : <Square className="w-4 h-4 text-slate-400" />}
            <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDiscard}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            title="Refresh Staging List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Search & Niche Filter */}
        <div className="flex items-center space-x-3 w-full md:w-auto flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter staged leads..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={filterNiche}
            onChange={(e) => setFilterNiche(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Niches</option>
            {uniqueNiches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Approval Gate Action */}
        <div className="w-full md:w-auto flex justify-end">
          <button
            onClick={handleImportSelected}
            disabled={importing || filteredLeads.length === 0}
            className="w-full md:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 disabled:opacity-50 transition-all"
          >
            {importing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Importing to Core DB...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  Approve & Import {selectedIds.length > 0 ? `Selected (${selectedIds.length})` : 'All Filtered'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Staged Leads Data Table */}
      {filteredLeads.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">No Staged Leads in Queue</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Run a lead sourcing query in the Scraper Console or select a different client niche filter to populate the pre-import staging area.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAll} className="block text-slate-400 hover:text-slate-200">
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 font-semibold">Show / Opportunity</th>
                  <th className="p-4 font-semibold">Host / Email</th>
                  <th className="p-4 font-semibold">Platform & Reach</th>
                  <th className="p-4 font-semibold">Niche & Tags</th>
                  <th className="p-4 font-semibold">Client Assigned</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredLeads.map((lead) => {
                  const isSelected = selectedIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="p-4">
                        <button
                          onClick={() => toggleSelectOne(lead.id)}
                          className="block text-slate-400 hover:text-slate-200"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-100 flex items-center gap-1.5">
                            <span>{lead.showName}</span>
                            {lead.showUrl && (
                              <a
                                href={lead.showUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-400 hover:text-indigo-300"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {lead.location && (
                            <span className="text-[11px] text-slate-400 block">{lead.location}</span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="font-medium text-slate-200">{lead.hostName || 'Host Unknown'}</div>
                          {lead.email ? (
                            <div className="text-[11px] text-indigo-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {lead.email}
                            </div>
                          ) : (
                            <span className="text-[11px] text-amber-400/80">No email found</span>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {lead.platform}
                          </span>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {lead.subscribers ? lead.subscribers.toLocaleString() : 'N/A'} subscribers
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1.5 max-w-xs">
                          <span className="font-semibold text-slate-200 bg-slate-800/80 px-2 py-0.5 rounded text-[11px]">
                            {lead.niche}
                          </span>
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {lead.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-md border border-slate-800">
                          {lead.clientId || 'Unassigned'}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setEditingLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Lead Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteOne(lead.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Discard Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lead Edit Modal */}
      {editingLead && (
        <LeadEditModal
          lead={editingLead}
          isOpen={!!editingLead}
          onClose={() => setEditingLead(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
};
