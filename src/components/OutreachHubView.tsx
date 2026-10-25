import React, { useState, useEffect } from 'react';
import {
  Send,
  FileText,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Sparkles,
  ExternalLink,
  Edit3,
  Clock,
  ListFilter,
  CheckSquare,
  Square,
  ArrowLeft,
  Check,
  CalendarCheck2,
} from 'lucide-react';
import { Client, Lead, PitchDraft } from '../types';
import { sendGmailPitch, createGmailDraft, createOutreachStrategyDoc } from '../lib/workspace';
import { getAccessToken } from '../lib/firebase';
import { api } from '../lib/api';
import { useToast } from './ui/Toast';

interface OutreachHubViewProps {
  clients: Client[];
  activeClientId: string;
  onSelectClient: (id: string) => void;
  activePitchLead: Lead | null;
  onClosePitchModal: () => void;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onClientUpdated: (client: Client) => void;
}

type GmailSyncStatus = 'synced' | 'syncing' | 'failed' | 'unauthenticated';

export const OutreachHubView: React.FC<OutreachHubViewProps> = ({
  clients,
  activeClientId,
  onSelectClient,
  activePitchLead,
  onClosePitchModal,
  onRequestConfirmation,
  isAuthenticated,
  onSignIn,
  onClientUpdated,
}) => {
  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0];

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // Real-time Gmail sync status
  const [gmailSyncStatus, setGmailSyncStatus] = useState<GmailSyncStatus>('unauthenticated');
  const [gmailLastSynced, setGmailLastSynced] = useState<Date | null>(null);
  const [gmailUserEmail, setGmailUserEmail] = useState<string | null>(null);

  // Outreach Mode: interactive, batch, docs
  const [dispatchMode, setDispatchMode] = useState<'interactive' | 'batch' | 'docs'>('interactive');

  // Single Pitch State
  const [currentLeadForPitch, setCurrentLeadForPitch] = useState<Lead | null>(activePitchLead);
  const [pitchDraft, setPitchDraft] = useState<PitchDraft | null>(null);
  const [isGeneratingPitch, setIsGeneratingPitch] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [bookingToast, setBookingToast] = useState<{ showName: string; milestoneTitle: string } | null>(null);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [mobilePitchViewActive, setMobilePitchViewActive] = useState<boolean>(false);

  // Batch Queue State
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [batchLogs, setBatchLogs] = useState<string[]>([]);
  const { toast } = useToast();

  // Docs Export State
  const [isExportingDocs, setIsExportingDocs] = useState(false);
  const [exportedDocResult, setExportedDocResult] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (activePitchLead) {
      setCurrentLeadForPitch(activePitchLead);
      generatePitchForLead(activePitchLead);
      setMobilePitchViewActive(true);
    }
  }, [activePitchLead]);

  useEffect(() => {
    if (activeClient) {
      loadLeads(activeClient.id);
    } else {
      loadLeads();
    }
  }, [activeClientId]);

  // Check real-time Gmail sync status when authenticated or on mount
  useEffect(() => {
    checkGmailSyncStatus();
  }, [isAuthenticated]);

  const checkGmailSyncStatus = async () => {
    if (!isAuthenticated) {
      setGmailSyncStatus('unauthenticated');
      return;
    }

    setGmailSyncStatus('syncing');
    try {
      const token = await getAccessToken();
      if (!token) {
        setGmailSyncStatus('unauthenticated');
        return;
      }

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setGmailSyncStatus('synced');
        setGmailLastSynced(new Date());
        setGmailUserEmail(data.emailAddress || null);
      } else {
        setGmailSyncStatus('failed');
      }
    } catch (err) {
      console.error('Gmail sync check error:', err);
      setGmailSyncStatus('failed');
    }
  };

  const loadLeads = async (clientId?: string) => {
    setIsLoadingLeads(true);
    try {
      const data = await api.getLeads({ clientId });
      if (Array.isArray(data.leads)) {
        setLeads(data.leads);
      }
    } catch (err: any) {
      console.error('Failed to load leads for outreach:', err);
      toast.error(err.message || 'Failed to load leads');
    } finally {
      setIsLoadingLeads(false);
    }
  };

  /**
   * Status change handler with automated milestone updating when a booking is confirmed
   */
  const handleUpdateLeadStatus = async (lead: Lead, newStatus: string) => {
    try {
      await api.updateLeadStatus(lead.id, newStatus);

      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus as any } : l))
      );

      if (currentLeadForPitch?.id === lead.id) {
        setCurrentLeadForPitch((prev) => (prev ? { ...prev, status: newStatus as any } : null));
      }

      if (activeClient) {
        let newStage = activeClient.stage;
        let newBookedPlacements = activeClient.bookedPlacements || 0;

        if (newStatus === 'Sent' || newStatus === 'Dispatched' || newStatus === 'Contacted') {
          if (activeClient.stage === 'Lead Sourcing' || activeClient.stage === 'Onboarding') {
            newStage = 'Outreach Active';
          }
        } else if (newStatus === 'Booked' || newStatus === 'Converted') {
          newBookedPlacements = (activeClient.bookedPlacements || 0) + 1;
          const target = activeClient.targetPlacements || 4;
          if (newBookedPlacements >= target) {
            newStage = 'Completed';
          } else {
            newStage = 'Interview Scheduled';
          }
        }

        // Automated Milestone Update if outreach results in a successful booking
        const updatedMilestones = [...(activeClient.milestones || [])];
        if (newStatus === 'Booked' && updatedMilestones.length > 0) {
          const milestoneIndex = updatedMilestones.findIndex(
            (m) =>
              m.title.toLowerCase().includes('publish') ||
              m.title.toLowerCase().includes('interview') ||
              m.title.toLowerCase().includes('placement') ||
              m.dayOffset === 60
          );
          const targetIndex = milestoneIndex !== -1 ? milestoneIndex : 1;
          if (updatedMilestones[targetIndex]) {
            updatedMilestones[targetIndex] = {
              ...updatedMilestones[targetIndex],
              completed: true,
            };
            setBookingToast({
              showName: lead.showName,
              milestoneTitle: updatedMilestones[targetIndex].title,
            });
          }
        }

        if (
          newStage !== activeClient.stage ||
          newBookedPlacements !== activeClient.bookedPlacements ||
          newStatus === 'Booked'
        ) {
          const stageHistory = activeClient.stageHistory || [];
          if (newStage !== activeClient.stage && newStage) {
            stageHistory.push({
              fromStage: activeClient.stage || 'Onboarding',
              toStage: newStage,
              timestamp: new Date().toISOString(),
              note: `Automated sync: Lead "${lead.showName}" marked as ${newStatus}`,
            });
          }

          const updatedClient: Client = {
            ...activeClient,
            stage: newStage,
            bookedPlacements: newBookedPlacements,
            milestones: updatedMilestones,
            stageHistory,
          };

          onClientUpdated(updatedClient);
        }
      }
    } catch (err) {
      console.error('Failed to update lead status:', err);
    }
  };

  const generatePitchForLead = async (lead: Lead) => {
    setIsGeneratingPitch(true);
    setSendSuccessMessage(null);

    try {
      const json = await api.generatePitch({
        clientName: activeClient?.name || 'Client',
        niche: activeClient?.niche || lead.niche,
        messagePillars: activeClient?.messagePillars || ['Key industry insights and lessons'],
        credibilityAssets: activeClient?.credibilityAssets || ['Track record of scaling and impact'],
        showName: lead.showName,
        hostName: lead.hostName,
      });

      if (!json || !json.pitch) throw new Error(json?.error || 'Pitch generation failed');

      setPitchDraft({
        leadId: lead.id,
        showName: lead.showName,
        hostName: lead.hostName,
        recipientEmail: lead.email || '',
        subject: json.pitch.subject,
        body: json.pitch.body,
        talkingPoints: json.pitch.talkingPoints || [],
      });
      handleUpdateLeadStatus(lead, 'Pitch Drafted');
      toast.success(`Generated pitch draft for ${lead.showName}`);
    } catch (err: any) {
      const msg = `Error generating pitch: ${err.message}`;
      setOutreachError(msg);
      toast.error(msg);
    } finally {
      setIsGeneratingPitch(false);
    }
  };

  const handleSendSinglePitch = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    if (!pitchDraft) return;

    if (!pitchDraft.recipientEmail) {
      setOutreachError('Please provide a recipient email address for this host.');
      toast.warning('Please provide a recipient email address for this host.');
      return;
    }

    onRequestConfirmation({
      title: `Send Guest Pitch to ${pitchDraft.showName}`,
      description: `Dispatch personalized guest interview pitch via Gmail API directly to host:`,
      affectedItems: [
        `Recipient: ${pitchDraft.recipientEmail}`,
        `Host Name: ${pitchDraft.hostName || 'Host'}`,
        `Subject: ${pitchDraft.subject}`,
      ],
      onConfirm: async () => {
        setIsSendingEmail(true);
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error('OAuth access token unavailable. Please sign in again.');

          await api.dispatchPitch(pitchDraft.leadId, {
            accessToken,
            subject: pitchDraft.subject,
            body: pitchDraft.body,
          });

          const currentLead = leads.find((l) => l.id === pitchDraft.leadId);
          if (currentLead) {
            await handleUpdateLeadStatus(currentLead, 'Dispatched');
          }
          const successMsg = `Pitch email dispatched successfully via Gmail relay!`;
          setSendSuccessMessage(successMsg);
          toast.success(successMsg);
          checkGmailSyncStatus();
        } catch (err: any) {
          const errText = `Gmail dispatch failed: ${err.message}`;
          setOutreachError(errText);
          toast.error(errText);
        } finally {
          setIsSendingEmail(false);
        }
      },
    });
  };

  const handleSaveDraft = async () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }
    if (!pitchDraft) return;

    try {
      await createGmailDraft(pitchDraft.recipientEmail || '', pitchDraft.subject, pitchDraft.body);
      const currentLead = leads.find((l) => l.id === pitchDraft.leadId);
      if (currentLead) {
        await handleUpdateLeadStatus(currentLead, 'Pitch Drafted');
      }
      setSendSuccessMessage(`Draft saved in your Gmail account!`);
      checkGmailSyncStatus();
    } catch (err: any) {
      alert(`Failed to save Gmail draft: ${err.message}`);
    }
  };

  const handleSelectAllLeads = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartBatchQueue = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    const selectedLeads = leads.filter((l) => selectedLeadIds.includes(l.id));
    if (selectedLeads.length === 0) {
      alert('Please select at least one lead for batch queue dispatch.');
      return;
    }

    onRequestConfirmation({
      title: `Start Batch Queue Outreach (${selectedLeads.length} Shows)`,
      description: `PodConnect Hub AI will sequentially compose and dispatch personalized pitches to selected podcast hosts via Gmail API:`,
      affectedItems: selectedLeads.map(
        (l) => `[${l.platform}] ${l.showName} -> ${l.email || 'Host Contact'}`
      ),
      onConfirm: async () => {
        setIsBatchRunning(true);
        setBatchLogs([]);
        setBatchProgress({ current: 0, total: selectedLeads.length });

        for (let i = 0; i < selectedLeads.length; i++) {
          const target = selectedLeads[i];
          setBatchProgress({ current: i + 1, total: selectedLeads.length });

          try {
            const json = await api.generatePitch({
              clientName: activeClient?.name || 'Client',
              niche: activeClient?.niche || target.niche,
              messagePillars: activeClient?.messagePillars || [],
              credibilityAssets: activeClient?.credibilityAssets || [],
              showName: target.showName,
              hostName: target.hostName,
            });
            const pitch = json.pitch;

            if (target.email) {
              const accessToken = await getAccessToken();
              if (accessToken) {
                await api.dispatchPitch(target.id, {
                  accessToken,
                  subject: pitch.subject,
                  body: pitch.body,
                });
                await handleUpdateLeadStatus(target, 'Dispatched');
                setBatchLogs((prev) => [
                  ...prev,
                  `✓ [DISPATCHED] ${target.showName} (${target.email})`,
                ]);
              } else {
                throw new Error('OAuth access token unavailable');
              }
            } else {
              await createGmailDraft('contact@' + target.showName.toLowerCase().replace(/[^a-z]/g, '') + '.com', pitch.subject, pitch.body);
              await handleUpdateLeadStatus(target, 'Pitch Drafted');
              setBatchLogs((prev) => [
                ...prev,
                `📝 [DRAFTED] ${target.showName} (Saved as draft — missing public email)`,
              ]);
            }

            await new Promise((r) => setTimeout(r, 1500));
          } catch (err: any) {
            setBatchLogs((prev) => [
              ...prev,
              `⚠️ [FAILED] ${target.showName}: ${err.message}`,
            ]);
          }
        }

        setIsBatchRunning(false);
        checkGmailSyncStatus();
      },
    });
  };

  const handleExportToGoogleDocs = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    if (!activeClient) {
      setOutreachError('Please select an active client first.');
      return;
    }

    const targetLeads =
      selectedLeadIds.length > 0
        ? leads.filter((l) => selectedLeadIds.includes(l.id))
        : leads;

    if (targetLeads.length === 0) {
      setOutreachError('No leads available to export into Outreach Strategy doc.');
      return;
    }

    onRequestConfirmation({
      title: `Export Outreach Strategy Doc for ${activeClient.name}`,
      description: `Compile ${targetLeads.length} tailored podcast pitches into Google Doc "Outreach_Strategy_${activeClient.name.replace(/\s+/g, '_')}":`,
      affectedItems: targetLeads.map((l) => `Pitch template for: ${l.showName} (${l.hostName})`),
      onConfirm: async () => {
        setIsExportingDocs(true);
        setExportedDocResult(null);

        try {
          const generatedPitches = [];
          for (const l of targetLeads.slice(0, 10)) {
            const json = await api.generatePitch({
              clientName: activeClient.name,
              niche: activeClient.niche,
              messagePillars: activeClient.messagePillars,
              credibilityAssets: activeClient.credibilityAssets,
              showName: l.showName,
              hostName: l.hostName,
            });
            if (json && json.pitch) {
              generatedPitches.push({
                showName: l.showName,
                hostName: l.hostName,
                recipientEmail: l.email,
                subject: json.pitch.subject,
                body: json.pitch.body,
              });
            }
          }

          const docRes = await createOutreachStrategyDoc(activeClient.name, activeClient, generatedPitches);

          const updatedClient: Client = {
            ...activeClient,
            docs: {
              ...activeClient.docs,
              outreachStrategyDocUrl: docRes.documentUrl,
              outreachStrategyDocTitle: docRes.title,
            },
          };
          onClientUpdated(updatedClient);
          setExportedDocResult({ url: docRes.documentUrl, title: docRes.title });
        } catch (err: any) {
          setOutreachError(`Google Docs export failed: ${err.message}`);
        } finally {
          setIsExportingDocs(false);
        }
      },
    });
  };

  const formatLastSynced = () => {
    if (!gmailLastSynced) return 'Never';
    const seconds = Math.floor((new Date().getTime() - gmailLastSynced.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner with Real-Time Gmail Sync Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Outreach & Pitch Dispatch Hub</h1>
            <span className="text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
              Gmail + Gemini + Docs
            </span>
          </div>

          {/* REAL-TIME GMAIL SYNC STATUS INDICATOR */}
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              {gmailSyncStatus === 'synced' && (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                  <span className="font-medium">Gmail Synced</span>
                </div>
              )}
              {gmailSyncStatus === 'syncing' && (
                <div className="flex items-center gap-1.5 text-indigo-400">
                  <RotateCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="font-medium">Syncing Gmail...</span>
                </div>
              )}
              {gmailSyncStatus === 'failed' && (
                <div className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                  <span className="font-medium">Sync Failed (Token expired)</span>
                </div>
              )}
              {gmailSyncStatus === 'unauthenticated' && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                  <span>Gmail Disconnected</span>
                </div>
              )}

              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono text-[11px]">
                Last Synced: {formatLastSynced()}
              </span>

              {gmailUserEmail && (
                <>
                  <span className="text-slate-600 hidden sm:inline">·</span>
                  <span className="text-slate-400 font-mono text-[11px] hidden sm:inline truncate max-w-[180px]">
                    {gmailUserEmail}
                  </span>
                </>
              )}
            </div>

            <button
              onClick={checkGmailSyncStatus}
              title="Refresh real-time Gmail connection status"
              className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${gmailSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3-Mode Selector Controls (Segmented buttons with horizontal scroll on mobile) */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto self-stretch sm:self-auto">
          <button
            onClick={() => setDispatchMode('interactive')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[34px] ${
              dispatchMode === 'interactive'
                ? 'bg-slate-800 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Interactive Pitch
          </button>
          <button
            onClick={() => setDispatchMode('batch')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[34px] ${
              dispatchMode === 'batch'
                ? 'bg-slate-800 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Batch Queue
          </button>
          <button
            onClick={() => setDispatchMode('docs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[34px] ${
              dispatchMode === 'docs'
                ? 'bg-slate-800 text-white font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3. Google Docs Export
          </button>
        </div>
      </div>

      {/* Booking Confirmed & Milestone Update Banner */}
      {bookingToast && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <CalendarCheck2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">
                Booking Confirmed for {bookingToast.showName}!
              </p>
              <p className="text-slate-300 mt-0.5">
                Client milestone <span className="text-emerald-300 font-semibold font-mono">"{bookingToast.milestoneTitle}"</span> was automatically marked as Completed (Published) in your Master Database and Calendar.
              </p>
            </div>
          </div>
          <button
            onClick={() => setBookingToast(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Outreach Error Banner */}
      {outreachError && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-rose-400">Notice:</span>
            <span>{outreachError}</span>
          </div>
          <button
            onClick={() => setOutreachError(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Mode View */}
      {dispatchMode === 'interactive' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Leads Selection List (Hidden on mobile when editing pitch) */}
          <div
            className={`lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3 ${
              mobilePitchViewActive ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Show to Pitch ({leads.length})
              </span>
              <button
                onClick={() => loadLeads(activeClient?.id)}
                disabled={isLoadingLeads}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer min-h-[32px]"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingLeads ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {leads.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No leads available. Run the scraper first.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                {leads.map((l) => {
                  const isSelected = currentLeadForPitch?.id === l.id;
                  return (
                    <div
                      key={l.id}
                      onClick={() => {
                        setCurrentLeadForPitch(l);
                        generatePitchForLead(l);
                        setMobilePitchViewActive(true);
                      }}
                      className={`p-3.5 rounded-lg border transition-colors cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                          : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs truncate max-w-[200px]">{l.showName}</span>
                        <span className="text-[10px] font-mono text-indigo-400 tabular-nums">
                          {l.score?.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="truncate">Host: {l.hostName || 'Show Host'}</span>
                        <span className="text-[10px] text-slate-500">{l.platform}</span>
                      </div>

                      {/* SIMPLE OUTREACH STATUS TOGGLE (Sent, Responded, Booked) */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-slate-500 uppercase font-medium">Status:</span>
                        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[10px]">
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Sent')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Sent' || l.status === 'Dispatched'
                                ? 'bg-sky-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Sent
                          </button>
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Responded')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Responded'
                                ? 'bg-amber-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Responded
                          </button>
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Booked')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Booked'
                                ? 'bg-emerald-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Booked
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Interactive Pitch Inspector / Editor */}
          <div
            className={`lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 ${
              !mobilePitchViewActive ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Mobile Back Button to list */}
            {mobilePitchViewActive && (
              <button
                onClick={() => setMobilePitchViewActive(false)}
                className="lg:hidden flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mb-1 cursor-pointer min-h-[36px]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Shows List</span>
              </button>
            )}

            <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Interactive Pitch Preview & Dispatch</h2>
                <p className="text-[11px] text-slate-400 truncate max-w-xs">
                  Target Show: {currentLeadForPitch ? currentLeadForPitch.showName : 'None selected'}
                </p>
              </div>

              {currentLeadForPitch && (
                <div className="flex items-center gap-2">
                  {/* Status Toggle on active pitch inspector */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                    <button
                      onClick={() => handleUpdateLeadStatus(currentLeadForPitch, 'Sent')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer text-xs ${
                        currentLeadForPitch.status === 'Sent' || currentLeadForPitch.status === 'Dispatched'
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Sent
                    </button>
                    <button
                      onClick={() => handleUpdateLeadStatus(currentLeadForPitch, 'Responded')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer text-xs ${
                        currentLeadForPitch.status === 'Responded'
                          ? 'bg-amber-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Responded
                    </button>
                    <button
                      onClick={() => handleUpdateLeadStatus(currentLeadForPitch, 'Booked')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer text-xs ${
                        currentLeadForPitch.status === 'Booked'
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Booked
                    </button>
                  </div>

                  <button
                    onClick={() => generatePitchForLead(currentLeadForPitch)}
                    disabled={isGeneratingPitch}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-950/40 border border-indigo-800/80 rounded-lg transition-colors cursor-pointer min-h-[34px]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>
                </div>
              )}
            </div>

            {sendSuccessMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{sendSuccessMessage}</span>
              </div>
            )}

            {!pitchDraft ? (
              <div className="h-96 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-lg">
                <Mail className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">
                  Select any podcast show from the list to preview an AI-crafted guest pitch.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Host Contact Email</label>
                  <input
                    type="email"
                    value={pitchDraft.recipientEmail}
                    onChange={(e) => setPitchDraft({ ...pitchDraft, recipientEmail: e.target.value })}
                    placeholder="host@podcast.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Subject Line</label>
                  <input
                    type="text"
                    value={pitchDraft.subject}
                    onChange={(e) => setPitchDraft({ ...pitchDraft, subject: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Email Body</label>
                  <textarea
                    value={pitchDraft.body}
                    onChange={(e) => setPitchDraft({ ...pitchDraft, body: e.target.value })}
                    rows={8}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                  />
                </div>

                {pitchDraft.talkingPoints?.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase">
                      Conversation Angles Included:
                    </span>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {pitchDraft.talkingPoints.map((pt, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={handleSaveDraft}
                    className="px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer min-h-[40px] text-center"
                  >
                    Save as Gmail Draft
                  </button>
                  <button
                    onClick={handleSendSinglePitch}
                    disabled={isSendingEmail || !pitchDraft.recipientEmail}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-md shadow-indigo-950/40 min-h-[40px]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingEmail ? 'Sending...' : 'Send via Gmail API'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 2: Automated Batch Queue Dispatch */}
      {dispatchMode === 'batch' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-white">Automated Multi-Lead Queue Dispatch</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select target shows to queue automated, personalized pitch emails with courtesy throttle rate limits.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={handleSelectAllLeads}
                className="px-3 py-2 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[38px]"
              >
                {selectedLeadIds.length === leads.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleStartBatchQueue}
                disabled={isBatchRunning || selectedLeadIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer min-h-[38px]"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {isBatchRunning
                    ? `Dispatching (${batchProgress.current}/${batchProgress.total})...`
                    : `Start Queue (${selectedLeadIds.length} Selected)`}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 w-10">Select</th>
                  <th className="py-2.5 px-3">Show Name</th>
                  <th className="py-2.5 px-3">Host</th>
                  <th className="py-2.5 px-3">Contact Email</th>
                  <th className="py-2.5 px-3">Outreach Status</th>
                  <th className="py-2.5 px-3 text-right">Quick Status Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {leads.map((l) => {
                  const isChecked = selectedLeadIds.includes(l.id);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => toggleSelectLead(l.id)}
                      className="hover:bg-slate-800/30 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelectLead(l.id)}
                          className="text-slate-400 hover:text-indigo-400 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">{l.showName}</td>
                      <td className="py-3 px-3 text-slate-300">{l.hostName}</td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {l.email ? (
                          <span className="text-emerald-400">{l.email}</span>
                        ) : (
                          <span className="text-slate-600 italic">Saved as draft</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-medium ${
                            l.status === 'Booked'
                              ? 'text-emerald-400'
                              : l.status === 'Sent' || l.status === 'Dispatched'
                              ? 'text-sky-400'
                              : l.status === 'Responded'
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[10px]">
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Sent')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Sent' || l.status === 'Dispatched'
                                ? 'bg-sky-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Sent
                          </button>
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Responded')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Responded'
                                ? 'bg-amber-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Responded
                          </button>
                          <button
                            onClick={() => handleUpdateLeadStatus(l, 'Booked')}
                            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                              l.status === 'Booked'
                                ? 'bg-emerald-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Booked
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {batchLogs.length > 0 && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-300 space-y-1.5 max-h-48 overflow-y-auto">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-2">
                Batch Dispatch Activity Log
              </span>
              {batchLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODE 3: Export to Google Docs */}
      {dispatchMode === 'docs' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-white">Export to Dedicated Google Doc</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Compile tailored outreach pitches into Google Doc named{' '}
                <span className="text-indigo-400 font-mono">
                  Outreach_Strategy_{activeClient?.name?.replace(/\s+/g, '_') || 'Client'}
                </span>
                .
              </p>
            </div>

            <button
              onClick={handleExportToGoogleDocs}
              disabled={isExportingDocs || leads.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer min-h-[40px]"
            >
              <FileText className="w-4 h-4" />
              <span>
                {isExportingDocs
                  ? 'Compiling & Creating Google Doc...'
                  : `Export ${selectedLeadIds.length > 0 ? selectedLeadIds.length : leads.length} Pitches to Docs`}
              </span>
            </button>
          </div>

          {exportedDocResult && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Successfully generated <span className="font-semibold">{exportedDocResult.title}</span> in Google Docs!
                </span>
              </div>
              <a
                href={exportedDocResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-indigo-300 hover:text-white font-medium cursor-pointer self-start sm:self-auto min-h-[32px]"
              >
                <span>Open Google Doc</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <div className="p-4 sm:p-5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Included In Generated Document:
            </h3>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  Executive client messaging pillars and credibility assets extracted during onboarding.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  Individual host angle analysis with custom 3-point provocative conversation hooks.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  Ready-to-send copy formatted for agency review and client sign-off.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
