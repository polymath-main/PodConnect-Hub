import React, { useState } from 'react';
import {
  Users,
  Layers,
  Kanban,
  Table as TableIcon,
  PlusCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Ban,
  TrendingUp,
  DollarSign,
  Search,
  Send,
  Zap,
} from 'lucide-react';
import { Client, ClientStage, CancellationDetails } from '../../types';
import { ClientStagingPipeline } from './ClientStagingPipeline';
import { ClientsTableListing } from './ClientsTableListing';
import { ClientDetailDrawer } from './ClientDetailDrawer';
import { ClientCancellationModal } from './ClientCancellationModal';
import { StagingAutomationBanner } from './StagingAutomationBanner';
import {
  findOrCreateMasterSheet,
  updateClientInMasterSheet,
  cancelClientMilestonesOnCalendar,
  createClientRequirementsDoc,
} from '../../lib/workspace';

interface ClientManagementViewProps {
  clients: Client[];
  activeClientId: string;
  onSelectClient: (clientId: string) => void;
  onClientUpdated: (updatedClient: Client) => void;
  onNavigateToOnboarding: () => void;
  onNavigateToScraper: (clientId: string) => void;
  onNavigateToOutreach: (clientId: string) => void;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
  masterSheetUrl?: string;
}

export const ClientManagementView: React.FC<ClientManagementViewProps> = ({
  clients,
  activeClientId,
  onSelectClient,
  onClientUpdated,
  onNavigateToOnboarding,
  onNavigateToScraper,
  onNavigateToOutreach,
  onRequestConfirmation,
  isAuthenticated,
  onSignIn,
  masterSheetUrl,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [selectedDrawerClient, setSelectedDrawerClient] = useState<Client | null>(null);
  const [cancellationTargetClient, setCancellationTargetClient] = useState<Client | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Calculate Metrics
  const totalClients = clients.length;
  const activeInPipeline = clients.filter(
    (c) => c.status !== 'Cancelled' && c.status !== 'Paused' && (c.stage !== 'Completed')
  ).length;
  const completedCount = clients.filter((c) => c.stage === 'Completed' || c.status === 'Completed').length;
  const offPipelineCount = clients.filter(
    (c) => c.status === 'Cancelled' || c.status === 'Paused' || c.stage === 'Cancelled' || c.stage === 'Paused'
  ).length;

  // Handle stage transition
  const handleStageChange = async (client: Client, newStage: ClientStage, note?: string) => {
    const previousStage = client.stage || 'Onboarding';
    const updatedHistory = [
      ...(client.stageHistory || []),
      {
        fromStage: previousStage,
        toStage: newStage,
        timestamp: new Date().toISOString(),
        note: note || `Transitioned to ${newStage}`,
      },
    ];

    let newStatus = client.status;
    if (newStage === 'Cancelled') newStatus = 'Cancelled';
    else if (newStage === 'Paused') newStatus = 'Paused';
    else if (newStage === 'Completed') newStatus = 'Completed';
    else if (client.status === 'Paused' || client.status === 'Cancelled') newStatus = 'Active';

    let updatedDocs = { ...client.docs };

    // Automated action: If moving to Scoping and Requirements Doc missing, generate it if authenticated
    if (newStage === 'Scoping' && !updatedDocs.requirementsDocUrl && isAuthenticated) {
      try {
        const docRes = await createClientRequirementsDoc(client.name, client);
        updatedDocs.requirementsDocUrl = docRes.documentUrl;
        updatedDocs.requirementsDocTitle = docRes.title;
        setFeedbackMessage(`Generated Client_Requirements_${client.name} in Google Docs.`);
      } catch (e) {
        console.warn('Deferred requirements doc auto-generation:', e);
      }
    }

    const updatedClient: Client = {
      ...client,
      stage: newStage,
      status: newStatus,
      stageHistory: updatedHistory,
      docs: updatedDocs,
      lastSyncedAt: new Date().toISOString(),
    };

    onClientUpdated(updatedClient);
    if (selectedDrawerClient && selectedDrawerClient.id === client.id) {
      setSelectedDrawerClient(updatedClient);
    }

    // Sync to Google Sheets in background if authenticated
    if (isAuthenticated) {
      try {
        const sheet = await findOrCreateMasterSheet();
        await updateClientInMasterSheet(sheet.spreadsheetId, updatedClient);
      } catch (err) {
        console.warn('Master sheet update deferred:', err);
      }
    }
  };

  // Handle Order Cancellation confirmation
  const handleConfirmCancellation = async (
    client: Client,
    details: CancellationDetails,
    cleanCalendar: boolean,
    syncSheet: boolean
  ) => {
    setIsProcessingAction(true);
    try {
      let updatedMilestones = client.milestones;

      if (cleanCalendar && isAuthenticated) {
        try {
          updatedMilestones = await cancelClientMilestonesOnCalendar(client, false);
        } catch (calErr) {
          console.warn('Calendar cancellation cleanup warning:', calErr);
        }
      }

      const updatedClient: Client = {
        ...client,
        stage: 'Cancelled',
        status: 'Cancelled',
        cancellationDetails: details,
        milestones: updatedMilestones,
        stageHistory: [
          ...(client.stageHistory || []),
          {
            fromStage: client.stage || 'Onboarding',
            toStage: 'Cancelled',
            timestamp: new Date().toISOString(),
            note: `Order cancelled. Reason: ${details.reason}`,
          },
        ],
        lastSyncedAt: new Date().toISOString(),
      };

      onClientUpdated(updatedClient);

      if (syncSheet && isAuthenticated) {
        try {
          const sheet = await findOrCreateMasterSheet();
          await updateClientInMasterSheet(sheet.spreadsheetId, updatedClient);
        } catch (sheetErr) {
          console.warn('Sheet cancellation status sync warning:', sheetErr);
        }
      }

      setFeedbackMessage(`Order for [${client.id}] ${client.name} successfully cancelled and recorded.`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Toggle Pause/Resume
  const handleTogglePause = async (client: Client) => {
    const isCurrentlyPaused = client.status === 'Paused' || client.stage === 'Paused';
    const nextStage: ClientStage = isCurrentlyPaused ? 'Outreach Active' : 'Paused';
    await handleStageChange(
      client,
      nextStage,
      isCurrentlyPaused ? 'Campaign resumed from pause' : 'Campaign paused upon client request'
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Client Management & Staging</h1>
            <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-md">
              Lifecycle Pipeline
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Track client progression from onboarding and scoping through multi-source sourcing, active outreach, and interview booking.
          </p>
        </div>

        {/* View Switcher and Primary Action */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Kanban / Table Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Pipeline Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Client Directory</span>
            </button>
          </div>

          <button
            onClick={onNavigateToOnboarding}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer min-h-[38px] shadow-sm shadow-indigo-950"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Onboard Client</span>
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer p-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Operational Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Accounts</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono">{totalClients}</div>
          <span className="text-[11px] text-slate-400">Registered agency clients</span>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Active In Pipeline</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-400 font-mono">{activeInPipeline}</div>
          <span className="text-[11px] text-slate-400">In stages 1 through 5</span>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Fulfillment Closed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{completedCount}</div>
          <span className="text-[11px] text-slate-400">Campaign milestones complete</span>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Off-Pipeline / Exits</span>
            <Ban className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-slate-200 font-mono">{offPipelineCount}</div>
          <span className="text-[11px] text-slate-400">Paused or cancelled contracts</span>
        </div>
      </div>

      {/* Staging Automation Rules Banner */}
      <StagingAutomationBanner />

      {/* View Mode Switching: Kanban or Table */}
      {viewMode === 'kanban' ? (
        <ClientStagingPipeline
          clients={clients}
          onSelectClient={(c) => setSelectedDrawerClient(c)}
          onAdvanceStage={(c, next) => handleStageChange(c, next, `Advanced to ${next}`)}
          onRegressStage={(c, prev) => handleStageChange(c, prev, `Regressed to ${prev}`)}
          onOpenCancelModal={(c) => setCancellationTargetClient(c)}
          onTogglePause={(c) => handleTogglePause(c)}
          onNavigateToScraper={onNavigateToScraper}
          onNavigateToOutreach={onNavigateToOutreach}
        />
      ) : (
        <ClientsTableListing
          clients={clients}
          onSelectClient={(c) => setSelectedDrawerClient(c)}
          onStageChange={(c, next) => handleStageChange(c, next, `Stage updated to ${next}`)}
          onOpenCancelModal={(c) => setCancellationTargetClient(c)}
          onTogglePause={(c) => handleTogglePause(c)}
          onNavigateToScraper={onNavigateToScraper}
          onNavigateToOutreach={onNavigateToOutreach}
        />
      )}

      {/* Client Detail & Order Inspector Drawer */}
      <ClientDetailDrawer
        client={selectedDrawerClient}
        isOpen={!!selectedDrawerClient}
        onClose={() => setSelectedDrawerClient(null)}
        onStageChange={handleStageChange}
        onOpenCancelModal={(c) => {
          setSelectedDrawerClient(null);
          setCancellationTargetClient(c);
        }}
        onTogglePause={handleTogglePause}
        onNavigateToScraper={onNavigateToScraper}
        onNavigateToOutreach={onNavigateToOutreach}
      />

      {/* Formal Order Cancellation Modal */}
      <ClientCancellationModal
        client={cancellationTargetClient}
        isOpen={!!cancellationTargetClient}
        onClose={() => setCancellationTargetClient(null)}
        onConfirmCancellation={handleConfirmCancellation}
        onRequestConfirmation={onRequestConfirmation}
      />
    </div>
  );
};
