import React, { useState, useEffect } from 'react';
import {
  Database,
  Search,
  Filter,
  Tag,
  Users,
  Building2,
  Mail,
  ExternalLink,
  Edit2,
  Trash2,
  UserCheck,
  Send,
  Download,
  RefreshCw,
  Sparkles,
  CheckSquare,
  Square,
  Layers,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';
import { Lead, Client } from '../../types';
import { LeadEditModal } from './LeadEditModal';
import { api } from '../../lib/api';
import { useToast } from '../ui/Toast';
import { findOrCreateMasterSheet, syncLeadsToMasterSheet } from '../../lib/workspace';

interface CentralLeadBankViewProps {
  clients: Client[];
  activeClient?: Client | null;
  onSelectClientForCampaign?: (client: Client) => void;
  onOpenPitchModal?: (lead: Lead) => void;
}

export const CentralLeadBankView: React.FC<CentralLeadBankViewProps> = ({
  clients,
  activeClient,
  onSelectClientForCampaign,
  onOpenPitchModal,
}) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNiche, setSelectedNiche] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [targetClientId, setTargetClientId] = useState<string>('');
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const { toast } = useToast();

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const data = await api.getLeads({
        clientId: selectedClientFilter !== 'ALL' ? selectedClientFilter : undefined,
        niche: selectedNiche !== 'ALL' ? selectedNiche : undefined,
        tag: selectedTag || undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: searchQuery || undefined,
      });
      setLeads(data.leads || []);
    } catch (err: any) {
      const msg = err.message || 'Failed to load core lead database';
      setStatusMessage({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [selectedNiche, selectedTag, selectedStatus, selectedClientFilter, searchQuery]);

  // Extract all unique tags across loaded leads
  const allTags = Array.from(
    new Set(
      leads.flatMap((l) => (Array.isArray(l.tags) ? l.tags : []))
    )
  ).filter(Boolean);

  const allNiches = Array.from(new Set(leads.map((l) => l.niche).filter(Boolean)));

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length && leads.length > 0) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((l) => l.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleAssignToClient = async () => {
    if (selectedLeadIds.length === 0) {
      setStatusMessage({ type: 'error', text: 'Select leads to assign.' });
      toast.warning('Select leads to assign.');
      return;
    }
    if (!targetClientId) {
      setStatusMessage({ type: 'error', text: 'Select a target client profile.' });
      toast.warning('Select a target client profile.');
      return;
    }

    try {
      await api.assignLeadsToClient(selectedLeadIds, targetClientId);
      const successText = `Successfully re-assigned ${selectedLeadIds.length} lead(s) to Client ${targetClientId}`;
      setStatusMessage({
        type: 'success',
        text: successText,
      });
      toast.success(successText);
      setSelectedLeadIds([]);
      fetchLeads();
    } catch (err: any) {
      const msg = err.message || 'Failed to re-assign leads to client';
      setStatusMessage({ type: 'error', text: msg });
      toast.error(msg);
    }
  };

  const handleEditSave = async (updatedData: Partial<Lead>) => {
    if (!editingLead) return;
    try {
      await api.updateLead(editingLead.id, updatedData);
      const successText = `Updated ${editingLead.showName}`;
      setStatusMessage({ type: 'success', text: successText });
      toast.success(successText);
      setEditingLead(null);
      fetchLeads();
    } catch (err: any) {
      const msg = err.message || 'Failed to update lead';
      setStatusMessage({ type: 'error', text: msg });
      toast.error(msg);
    }
  };

  const handleDeleteLead = async (id: number) => {
    if (!confirm('Are you sure you want to remove this lead from the core database?')) return;
    try {
      await api.deleteLead(id);
      setStatusMessage({ type: 'success', text: 'Lead deleted from database.' });
      toast.success('Lead deleted from database.');
      fetchLeads();
    } catch (err: any) {
      const msg = err.message || 'Failed to delete lead';
      setStatusMessage({ type: 'error', text: msg });
      toast.error(msg);
    }
  };

  const exportToCSV = (onlySelected = false) => {
    const targetLeads = onlySelected && selectedLeadIds.length > 0
      ? leads.filter((l) => selectedLeadIds.includes(l.id))
      : leads;

    if (targetLeads.length === 0) {
      toast.warning('No leads available to export.');
      return;
    }

    const headers = ['ID', 'Show Name', 'Host Name', 'Platform', 'Email', 'Email Type', 'Confidence', 'Subscribers', 'Niche', 'Tags', 'Client ID', 'Status', 'Location'];
    const rows = targetLeads.map((l) => [
      l.id,
      `"${l.showName?.replace(/"/g, '""') || ''}"`,
      `"${l.hostName?.replace(/"/g, '""') || ''}"`,
      l.platform,
      l.email || '',
      l.emailType || 'direct',
      `${Math.round((l.emailConfidence ?? 1.0) * 100)}%`,
      l.subscribers,
      `"${l.niche || ''}"`,
      `"${(l.tags || []).join(', ')}"`,
      l.clientId || '',
      l.status,
      `"${l.location || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${onlySelected ? 'selected_' : ''}${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${targetLeads.length} lead(s) to CSV`);
  };

  const handleSyncToSheets = async (onlySelected = false) => {
    const targetLeads = onlySelected && selectedLeadIds.length > 0
      ? leads.filter((l) => selectedLeadIds.includes(l.id))
      : leads;

    if (targetLeads.length === 0) {
      toast.warning('No leads available to sync to Google Sheets.');
      return;
    }

    setIsSyncingSheets(true);
    try {
      const { spreadsheetId } = await findOrCreateMasterSheet();
      const res = await syncLeadsToMasterSheet(spreadsheetId, targetLeads);
      toast.success(`Synchronized ${res.count} lead(s) to Google Sheets ('Podcast Leads' tab)!`);
      setStatusMessage({
        type: 'success',
        text: `Successfully synced ${res.count} lead(s) to Master Google Sheet ('Podcast Leads' tab)!`,
      });
    } catch (err: any) {
      const errText = err.message || 'Failed to sync leads to Google Sheets.';
      toast.error(errText);
      setStatusMessage({ type: 'error', text: errText });
    } finally {
      setIsSyncingSheets(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Central Lead Database & Niche Tag Bank</h2>
          </div>
          <p className="text-xs text-slate-400">
            Persistent cross-client lead repository. Sourced, verified, and tagged for multi-channel outreach.
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <button
            onClick={() => handleSyncToSheets(false)}
            disabled={isSyncingSheets || leads.length === 0}
            className="px-4 py-2 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-800/80 flex items-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer"
            title="Sync all leads to 'Podcast Leads' sheet tab"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
            <span>{isSyncingSheets ? 'Syncing...' : 'Sync to Sheets'}</span>
          </button>
          <button
            onClick={() => exportToCSV(false)}
            disabled={leads.length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export CSV ({leads.length})</span>
          </button>
          <button
            onClick={fetchLeads}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Refresh Leads"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="hover:underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Tag Cloud Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Tag className="w-4 h-4 text-indigo-400" />
            <span>Niche & Attribute Tags</span>
          </div>
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="text-[11px] text-indigo-400 hover:underline font-semibold"
            >
              Clear Tag Filter (#{selectedTag})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
              !selectedTag
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Tags
          </button>

          {allTags.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(isActive ? null : tag)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>#{tag}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar & Re-Assign Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search show, host, email..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Niche Filter */}
          <div>
            <select
              value={selectedNiche}
              onChange={(e) => setSelectedNiche(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Niches</option>
              {allNiches.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Lead Statuses</option>
              <option value="Imported">Imported</option>
              <option value="Contacted">Contacted</option>
              <option value="Replied">Replied</option>
              <option value="Converted">Converted</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* Client Filter */}
          <div>
            <select
              value={selectedClientFilter}
              onChange={(e) => setSelectedClientFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Client Accounts</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Select Action Ribbon */}
        {selectedLeadIds.length > 0 && (
          <div className="pt-3 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/20">
            <span className="text-xs font-semibold text-indigo-300">
              Selected <span className="text-white font-bold">{selectedLeadIds.length}</span> lead(s) for pipeline assignment
            </span>

            <div className="flex items-center space-x-2 w-full md:w-auto flex-wrap gap-y-2">
              <button
                onClick={() => exportToCSV(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center space-x-1.5 border border-slate-700 transition-all cursor-pointer"
                title="Download selected leads to CSV"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Export ({selectedLeadIds.length}) CSV</span>
              </button>

              <button
                onClick={() => handleSyncToSheets(true)}
                disabled={isSyncingSheets}
                className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 font-semibold text-xs rounded-xl flex items-center space-x-1.5 border border-emerald-800/80 transition-all disabled:opacity-50 cursor-pointer"
                title="Sync selected leads to Google Sheets tab"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                <span>Sync ({selectedLeadIds.length}) Sheets</span>
              </button>

              <select
                value={targetClientId}
                onChange={(e) => setTargetClientId(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select Target Client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} - {c.name} ({c.niche})
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssignToClient}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Assign to Client</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Leads Table */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 mt-3">Loading core database leads...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Database className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-200">No Leads Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try resetting your filters or run lead sourcing & import staged leads to populate the central database.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-200">
                      {selectedLeadIds.length === leads.length && leads.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 font-semibold">Show / Opportunity</th>
                  <th className="p-4 font-semibold">Host & Contact</th>
                  <th className="p-4 font-semibold">Platform & Reach</th>
                  <th className="p-4 font-semibold">Niche & Tags</th>
                  <th className="p-4 font-semibold">Client Assigned</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {leads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="p-4">
                        <button onClick={() => toggleSelectOne(lead.id)} className="text-slate-400 hover:text-slate-200">
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
                            <div className="text-[11px] text-slate-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {lead.location}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1.5">
                          <div className="font-medium text-slate-200">{lead.hostName || 'Unknown Host'}</div>
                          {lead.email ? (
                            <div className="space-y-1">
                              <div className="text-[11px] text-indigo-300 font-mono flex items-center gap-1">
                                <Mail className="w-3 h-3 text-indigo-400" /> {lead.email}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {lead.emailType === 'inferred' ? (
                                  <span
                                    title="Inferred based on business hostname heuristic"
                                    className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    Inferred {Math.round((lead.emailConfidence ?? 0.8) * 100)}%
                                  </span>
                                ) : lead.emailType === 'mailto' ? (
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                    Mailto {Math.round((lead.emailConfidence ?? 0.92) * 100)}%
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    Direct {Math.round((lead.emailConfidence ?? 1.0) * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">No email</span>
                          )}
                        </div>
                      </td>


                      <td className="p-4">
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {lead.platform}
                          </span>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {lead.subscribers ? lead.subscribers.toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1.5 max-w-xs">
                          <span className="font-semibold text-slate-200 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                            {lead.niche}
                          </span>
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {lead.tags.map((t) => (
                                <span
                                  key={t}
                                  onClick={() => setSelectedTag(t)}
                                  className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded hover:bg-indigo-500/20 cursor-pointer"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="text-xs font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {lead.clientId || 'Unassigned'}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            lead.status === 'Converted' || lead.status === 'Booked'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : lead.status === 'Contacted' || lead.status === 'Sent' || lead.status === 'Dispatched'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                              : lead.status === 'Replied'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {onOpenPitchModal && (
                            <button
                              onClick={() => onOpenPitchModal(lead)}
                              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Generate Pitch"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Lead"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete Lead"
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
