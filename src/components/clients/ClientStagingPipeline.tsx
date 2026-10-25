import React, { useState } from 'react';
import {
  Layers,
  ArrowRight,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MoreVertical,
  ExternalLink,
  Ban,
  PauseCircle,
  PlayCircle,
  Search,
  Send,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { Client, ClientStage } from '../../types';

interface ClientStagingPipelineProps {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onAdvanceStage: (client: Client, nextStage: ClientStage) => void;
  onRegressStage: (client: Client, prevStage: ClientStage) => void;
  onOpenCancelModal: (client: Client) => void;
  onTogglePause: (client: Client) => void;
  onNavigateToScraper: (clientId: string) => void;
  onNavigateToOutreach: (clientId: string) => void;
}

const PIPELINE_COLUMNS: { id: ClientStage; label: string; description: string; color: string }[] = [
  { id: 'Onboarding', label: '1. Onboarding', description: 'Transcript parsed & agreement locked', color: 'border-sky-500/40 text-sky-400' },
  { id: 'Scoping', label: '2. Scoping & Strategy', description: 'Requirements doc & message pillars', color: 'border-indigo-500/40 text-indigo-400' },
  { id: 'Lead Sourcing', label: '3. Lead Sourcing', description: 'Multi-source scraping & 1k+ filtering', color: 'border-blue-500/40 text-blue-400' },
  { id: 'Outreach Active', label: '4. Outreach Active', description: 'Personalized pitches & Gmail sequences', color: 'border-amber-500/40 text-amber-400' },
  { id: 'Interview Scheduled', label: '5. Interview Booked', description: 'Confirmed placement on calendar', color: 'border-emerald-500/40 text-emerald-400' },
  { id: 'Completed', label: '6. Completed', description: 'Contract fulfilled & audience delivered', color: 'border-purple-500/40 text-purple-400' },
];

export const ClientStagingPipeline: React.FC<ClientStagingPipelineProps> = ({
  clients,
  onSelectClient,
  onAdvanceStage,
  onRegressStage,
  onOpenCancelModal,
  onTogglePause,
  onNavigateToScraper,
  onNavigateToOutreach,
}) => {
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Group clients by stage
  const getClientsForStage = (stage: ClientStage) => {
    return clients.filter((c) => {
      // If client is marked Cancelled in status, it belongs in Cancelled
      if (c.status === 'Cancelled') return stage === 'Cancelled';
      if (c.status === 'Paused') return stage === 'Paused';

      // Normal stage matching
      const currentStage = c.stage || 'Onboarding';
      return currentStage === stage;
    });
  };

  const pausedClients = clients.filter((c) => c.status === 'Paused' || c.stage === 'Paused');
  const cancelledClients = clients.filter((c) => c.status === 'Cancelled' || c.stage === 'Cancelled');

  return (
    <div className="space-y-6">
      {/* Kanban Board Container (Horizontal Scroll on smaller displays) */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1240px]">
          {PIPELINE_COLUMNS.map((col, idx) => {
            const stageClients = getClientsForStage(col.id);
            const nextStage = idx < PIPELINE_COLUMNS.length - 1 ? PIPELINE_COLUMNS[idx + 1].id : null;
            const prevStage = idx > 0 ? PIPELINE_COLUMNS[idx - 1].id : null;

            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col bg-slate-950/70 border border-slate-800/90 rounded-xl overflow-hidden min-h-[520px]"
              >
                {/* Column Header */}
                <div className={`p-3.5 border-b border-slate-800 bg-slate-900/60 ${col.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white">{col.label}</span>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {stageClients.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{col.description}</p>
                </div>

                {/* Cards List */}
                <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto">
                  {stageClients.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-800/80 rounded-lg">
                      <Layers className="w-5 h-5 text-slate-700 mb-1" />
                      <span className="text-[11px] text-slate-500">No active clients in stage</span>
                    </div>
                  ) : (
                    stageClients.map((client) => {
                      // Calculate days progress
                      const start = new Date(client.startDate).getTime();
                      const end = new Date(client.endDate).getTime();
                      const now = Date.now();
                      const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
                      const daysElapsed = Math.max(0, Math.round((now - start) / (1000 * 60 * 60 * 24)));
                      const progressPct = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDays) * 100)));

                      const nextPendingMilestone = client.milestones?.find((m) => !m.completed);

                      return (
                        <div
                          key={client.id}
                          className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800/90 hover:border-slate-700 rounded-xl p-3 space-y-3 transition-all shadow-sm group"
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                  {client.id}
                                </span>
                                <h4 className="font-semibold text-xs text-white truncate">{client.name}</h4>
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                                {client.niche}
                              </span>
                            </div>

                            <button
                              onClick={() => onSelectClient(client)}
                              title="Inspect Client Order & Process"
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Pricing & Target */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] p-2 bg-slate-950/60 rounded-lg border border-slate-800/60">
                            <div>
                              <span className="text-slate-500 block">Pricing</span>
                              <span className="font-mono text-emerald-400 font-semibold truncate block">
                                {client.pricing}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Audience Floor</span>
                              <span className="font-mono text-indigo-300 truncate block">
                                $\ge$ {(client.minSubscribers || 1000).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Progress Strip */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                              <span>Timeline</span>
                              <span>{progressPct}% ({daysElapsed}d)</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Next Milestone */}
                          {nextPendingMilestone && (
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-950/40 px-2 py-1 rounded border border-slate-800/40 truncate">
                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="truncate">{nextPendingMilestone.title}</span>
                            </div>
                          )}

                          {/* Quick Stage Progression Buttons */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                            <div className="flex items-center gap-1">
                              {prevStage && (
                                <button
                                  onClick={() => onRegressStage(client, prevStage)}
                                  title={`Move back to ${prevStage}`}
                                  className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 cursor-pointer"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => onTogglePause(client)}
                                title="Pause Campaign"
                                className="p-1 text-slate-500 hover:text-amber-300 rounded hover:bg-slate-800 cursor-pointer"
                              >
                                <PauseCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onOpenCancelModal(client)}
                                title="Cancel Order"
                                className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {nextStage ? (
                              <button
                                onClick={() => onAdvanceStage(client, nextStage)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                <span>Advance</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Fulfilled</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Section for Paused & Cancelled Orders */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/50 hover:bg-slate-900 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500" />
            <span>Off-Pipeline Orders (Paused: {pausedClients.length}, Cancelled: {cancelledClients.length})</span>
          </div>
          <span className="text-[11px] text-indigo-400">{showArchived ? 'Hide' : 'Show Details'}</span>
        </button>

        {showArchived && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800">
            {/* Paused Column */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
                Paused Campaigns ({pausedClients.length})
              </span>
              {pausedClients.length === 0 ? (
                <p className="text-xs text-slate-500">No campaigns currently on hold.</p>
              ) : (
                pausedClients.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-900/80 border border-amber-900/40 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">[{c.id}] {c.name}</div>
                      <div className="text-[11px] text-slate-400">{c.niche}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onTogglePause(c)}
                        className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/50 border border-amber-800 rounded hover:text-white cursor-pointer"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => onSelectClient(c)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cancelled Column */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                Cancelled Contracts ({cancelledClients.length})
              </span>
              {cancelledClients.length === 0 ? (
                <p className="text-xs text-slate-500">No cancelled contracts on record.</p>
              ) : (
                cancelledClients.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-900/80 border border-rose-900/40 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div className="truncate pr-2">
                      <div className="font-semibold text-white truncate">[{c.id}] {c.name}</div>
                      <div className="text-[11px] text-rose-300/80 truncate">
                        Reason: {c.cancellationDetails?.reason || 'Cancelled'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-slate-500">
                        {c.cancellationDetails?.cancelledAt ? new Date(c.cancellationDetails.cancelledAt).toLocaleDateString() : ''}
                      </span>
                      <button
                        onClick={() => onSelectClient(c)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
