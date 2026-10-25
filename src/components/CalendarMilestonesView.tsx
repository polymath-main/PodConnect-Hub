import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Client, Milestone } from '../types';
import { scheduleClientMilestonesOnCalendar } from '../lib/workspace';

interface CalendarMilestonesViewProps {
  clients: Client[];
  activeClientId: string;
  onSelectClient: (id: string) => void;
  onClientUpdated: (client: Client) => void;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

export const CalendarMilestonesView: React.FC<CalendarMilestonesViewProps> = ({
  clients,
  activeClientId,
  onSelectClient,
  onClientUpdated,
  onRequestConfirmation,
  isAuthenticated,
  onSignIn,
}) => {
  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0];
  const [isScheduling, setIsScheduling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggleMilestone = (idx: number) => {
    if (!activeClient) return;
    const updatedMilestones = [...activeClient.milestones];
    updatedMilestones[idx].completed = !updatedMilestones[idx].completed;
    onClientUpdated({
      ...activeClient,
      milestones: updatedMilestones,
    });
  };

  const handleScheduleToGoogleCalendar = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    if (!activeClient || !activeClient.milestones || activeClient.milestones.length === 0) {
      setFeedback('No milestones configured for this client.');
      return;
    }

    onRequestConfirmation({
      title: `Schedule Milestones on Google Calendar for ${activeClient.name}`,
      description: `PodConnect Hub AI will autonomously publish all contract phases to your primary Google Calendar:`,
      affectedItems: activeClient.milestones.map(
        (m) => `Day ${m.dayOffset}: ${m.title} (Due: ${m.dueDate})`
      ),
      onConfirm: async () => {
        setIsScheduling(true);
        setFeedback(null);
        try {
          const updated = await scheduleClientMilestonesOnCalendar(activeClient);
          onClientUpdated({
            ...activeClient,
            milestones: updated,
          });
          setFeedback(
            `Successfully scheduled ${updated.length} project milestones directly to Google Calendar!`
          );
        } catch (err: any) {
          setFeedback(`Calendar scheduling failed: ${err.message}`);
        } finally {
          setIsScheduling(false);
        }
      },
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Calendar Milestone & Timeline Automation</h1>
            <span className="text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
              Google Calendar API
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated 120-day contract timeline structuring, 30-day review cycles, and direct Google Calendar synchronization.
          </p>
        </div>

        {clients.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap self-start sm:self-auto">
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

            <button
              onClick={handleScheduleToGoogleCalendar}
              disabled={isScheduling || !activeClient}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>{isScheduling ? 'Scheduling...' : 'Sync to Calendar'}</span>
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer p-1">
            Dismiss
          </button>
        </div>
      )}

      {!activeClient ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 sm:p-12 text-center">
          <CalendarIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No active client selected. Onboard a client to view milestones.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Client Timeline Summary Card (Responsive 2-col on mobile, 4-col on md+) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Client & Package</span>
              <span className="font-semibold text-white truncate block">{activeClient.name}</span>
              <span className="text-[11px] text-slate-400 truncate block">{activeClient.package}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Contract Period</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {activeClient.contractDays || 120} Days
              </span>
              <span className="text-[11px] text-slate-400 block font-mono">
                {activeClient.startDate} → {activeClient.endDate}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Completed Milestones</span>
              <span className="font-semibold text-emerald-400 font-mono tabular-nums">
                {activeClient.milestones.filter((m) => m.completed).length} / {activeClient.milestones.length}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase">Calendar Integration</span>
              <span className="font-medium text-slate-200 flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeClient.milestones.some((m) => m.calendarEventId)
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="truncate">
                  {activeClient.milestones.some((m) => m.calendarEventId)
                    ? 'Synced to Calendar'
                    : 'Pending Sync'}
                </span>
              </span>
            </div>
          </div>

          {/* Timeline Phase Cards (1-col on mobile, 2-col on md+) */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Project Phases & Milestone Deliverables
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeClient.milestones.map((milestone, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-colors ${
                    milestone.completed
                      ? 'bg-slate-900/40 border-emerald-500/30'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => handleToggleMilestone(idx)}
                        className="cursor-pointer text-slate-400 hover:text-emerald-400 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center -ml-1"
                      >
                        <CheckCircle2
                          className={`w-5 h-5 ${
                            milestone.completed ? 'text-emerald-400' : 'text-slate-600'
                          }`}
                        />
                      </button>
                      <div>
                        <h3
                          className={`text-xs font-semibold ${
                            milestone.completed ? 'text-slate-400 line-through' : 'text-white'
                          }`}
                        >
                          {milestone.title}
                        </h3>
                        <span className="text-[10px] font-mono text-indigo-400">
                          Phase Checkpoint: Day {milestone.dayOffset}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono text-slate-300 tabular-nums block">
                        {milestone.dueDate}
                      </span>
                      <span className="text-[10px] text-slate-500">Scheduled Date</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    {milestone.calendarLink ? (
                      <a
                        href={milestone.calendarLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 min-h-[30px]"
                      >
                        <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>View on Google Calendar</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Unlinked event</span>
                    )}

                    <span
                      className={`text-[10px] font-medium ${
                        milestone.completed ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {milestone.completed ? 'Completed' : 'In Progress'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
