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
  Layers,
  Zap,
  BarChart2,
  DoorOpen,
  Copy,
} from 'lucide-react';
import { Client, Lead, PitchDraft, OutreachSequence, SequenceTouchpoint, SequenceStep, PipelineStage } from '../types';
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

  // Single Pitch & Multi-Touch Sequence Studio State
  const [currentLeadForPitch, setCurrentLeadForPitch] = useState<Lead | null>(activePitchLead);
  const [currentSequence, setCurrentSequence] = useState<OutreachSequence | null>(null);
  const [activeTouchpoint, setActiveTouchpoint] = useState<SequenceStep>('initial');
  const [isGeneratingSequence, setIsGeneratingSequence] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState<string>('ALL');

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
      selectLeadForPitch(activePitchLead);
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

  const getStageBadgeLabel = (stage?: string): string => {
    switch (stage) {
      case 'drafted': return 'Drafted';
      case 'initial_sent': return 'Pitch Sent';
      case 'fu1_due': return '⚡ FU 1 Due';
      case 'fu1_sent': return 'FU 1 Sent';
      case 'fu2_due': return '📊 FU 2 Due';
      case 'fu2_sent': return 'FU 2 Sent';
      case 'breakup_due': return '🚪 Breakup Due';
      case 'breakup_sent': return 'Breakup Sent';
      case 'responded':
      case 'Replied':
      case 'Responded': return 'Responded';
      case 'booked':
      case 'Booked': return 'Booked';
      case 'Dispatched':
      case 'Sent': return 'Pitch Sent';
      default: return stage || 'Drafted';
    }
  };

  const getStageBadgeClass = (stage?: string): string => {
    switch (stage) {
      case 'drafted': return 'bg-slate-800 text-slate-300 border border-slate-700';
      case 'initial_sent':
      case 'Dispatched':
      case 'Sent': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'fu1_due': return 'bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold';
      case 'fu1_sent': return 'bg-blue-500/10 text-blue-300 border border-blue-500/20';
      case 'fu2_due': return 'bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold';
      case 'fu2_sent': return 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
      case 'breakup_due': return 'bg-rose-500/10 text-rose-300 border border-rose-500/30 font-bold';
      case 'breakup_sent': return 'bg-purple-500/10 text-purple-300 border border-purple-500/20';
      case 'responded':
      case 'Replied':
      case 'Responded': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'booked':
      case 'Booked': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      default: return 'bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  const selectLeadForPitch = async (lead: Lead) => {
    setCurrentLeadForPitch(lead);
    setMobilePitchViewActive(true);
    setSendSuccessMessage(null);
    setOutreachError(null);
    setActiveTouchpoint('initial');

    try {
      const res = await api.getLeadSequence(lead.id);
      if (res.success && res.sequence) {
        setCurrentSequence(res.sequence);
        setPitchDraft({
          leadId: lead.id,
          showName: lead.showName,
          hostName: lead.hostName,
          recipientEmail: lead.email || '',
          subject: res.sequence.initial.subject,
          body: res.sequence.initial.body,
          talkingPoints: res.sequence.initial.talkingPoints || [],
        });
      } else {
        await generateFullSequenceForLead(lead);
      }
    } catch {
      await generateFullSequenceForLead(lead);
    }
  };

  const generateFullSequenceForLead = async (lead: Lead) => {
    setIsGeneratingSequence(true);
    setIsGeneratingPitch(true);
    setSendSuccessMessage(null);

    try {
      const res = await api.generateOutreachSequence({
        clientName: activeClient?.name || 'Client',
        niche: activeClient?.niche || lead.niche,
        messagePillars: activeClient?.messagePillars || ['Key industry insights and lessons'],
        credibilityAssets: activeClient?.credibilityAssets || ['Track record of scaling and impact'],
        showName: lead.showName,
        hostName: lead.hostName,
      });

      if (!res.success || !res.sequence) {
        throw new Error('Failed to generate outreach sequence');
      }

      const seqData: OutreachSequence = {
        leadId: lead.id,
        clientId: activeClient?.id || lead.clientId,
        initial: res.sequence.initial,
        followUp1: res.sequence.followUp1,
        followUp2: res.sequence.followUp2,
        breakup: res.sequence.breakup,
        pipelineStage: lead.pipelineStage || 'drafted',
      };

      const saved = await api.saveLeadSequence(lead.id, seqData);
      setCurrentSequence(saved.sequence);

      setPitchDraft({
        leadId: lead.id,
        showName: lead.showName,
        hostName: lead.hostName,
        recipientEmail: lead.email || '',
        subject: res.sequence.initial.subject,
        body: res.sequence.initial.body,
        talkingPoints: res.sequence.initial.talkingPoints || [],
      });

      handleUpdateLeadStatus(lead, 'Pitch Drafted');
      toast.success(`Generated 4-touchpoint cadence for ${lead.showName}`);
    } catch (err: any) {
      toast.error(`Error generating sequence: ${err.message}`);
    } finally {
      setIsGeneratingSequence(false);
      setIsGeneratingPitch(false);
    }
  };

  const generatePitchForLead = async (lead: Lead) => {
    await generateFullSequenceForLead(lead);
  };

  const handleUpdateActiveStep = (field: 'subject' | 'body', value: string) => {
    if (!currentSequence) return;
    const key =
      activeTouchpoint === 'initial'
        ? 'initial'
        : activeTouchpoint === 'follow_up_1'
        ? 'followUp1'
        : activeTouchpoint === 'follow_up_2'
        ? 'followUp2'
        : 'breakup';

    const updated = {
      ...currentSequence,
      [key]: {
        ...currentSequence[key],
        [field]: value,
      },
    };
    setCurrentSequence(updated);

    if (activeTouchpoint === 'initial' && pitchDraft) {
      setPitchDraft({
        ...pitchDraft,
        [field]: value,
      });
    }
  };

  const handleInsertVariable = (variable: string) => {
    if (!currentSequence) return;
    const key =
      activeTouchpoint === 'initial'
        ? 'initial'
        : activeTouchpoint === 'follow_up_1'
        ? 'followUp1'
        : activeTouchpoint === 'follow_up_2'
        ? 'followUp2'
        : 'breakup';

    const currentBody = currentSequence[key].body || '';
    handleUpdateActiveStep('body', currentBody + (currentBody ? ' ' : '') + variable);
  };

  const handleSaveSequenceDraft = async () => {
    if (!currentLeadForPitch || !currentSequence) return;
    try {
      const res = await api.saveLeadSequence(currentLeadForPitch.id, currentSequence);
      if (res.sequence) {
        setCurrentSequence(res.sequence);
      }
      toast.success('Outreach sequence saved successfully');
    } catch (err: any) {
      toast.error(`Failed to save sequence: ${err.message}`);
    }
  };

  const handleDispatchActiveTouchpoint = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }
    if (!currentLeadForPitch || !currentSequence) return;
    if (!currentLeadForPitch.email) {
      setOutreachError('Please provide a recipient email address for this host.');
      toast.warning('Please provide a recipient email address for this host.');
      return;
    }

    const key =
      activeTouchpoint === 'initial'
        ? 'initial'
        : activeTouchpoint === 'follow_up_1'
        ? 'followUp1'
        : activeTouchpoint === 'follow_up_2'
        ? 'followUp2'
        : 'breakup';

    const activeStep = currentSequence[key];
    const stepLabel =
      activeTouchpoint === 'initial'
        ? 'Initial Pitch (Day 0)'
        : activeTouchpoint === 'follow_up_1'
        ? 'Follow-Up 1: Value Bump (Day 3)'
        : activeTouchpoint === 'follow_up_2'
        ? 'Follow-Up 2: Proof Point (Day 7)'
        : 'Final Breakup Email (Day 14)';

    const threadNotice =
      activeTouchpoint !== 'initial' && currentSequence.threadId
        ? `Preserving Gmail thread (${currentSequence.threadId})`
        : 'Starting fresh conversation';

    onRequestConfirmation({
      title: `Send ${stepLabel} to ${currentLeadForPitch.showName}`,
      description: `Dispatch email via Gmail API directly to host:`,
      affectedItems: [
        `Recipient: ${currentLeadForPitch.email}`,
        `Host Name: ${currentLeadForPitch.hostName || 'Host'}`,
        `Subject: ${activeStep.subject}`,
        `Threading: ${threadNotice}`,
      ],
      onConfirm: async () => {
        setIsSendingEmail(true);
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error('OAuth access token unavailable. Please sign in again.');

          await api.dispatchTouchpoint(currentLeadForPitch.id, {
            accessToken,
            touchpoint: activeTouchpoint,
            customSubject: activeStep.subject,
            customBody: activeStep.body,
          });

          const successMsg = `${stepLabel} dispatched successfully via Gmail relay!`;
          setSendSuccessMessage(successMsg);
          toast.success(successMsg);

          const refreshed = await api.getLeadSequence(currentLeadForPitch.id);
          if (refreshed.sequence) {
            setCurrentSequence(refreshed.sequence);
          }
          loadLeads(activeClient?.id);
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

  const handleSendSinglePitch = () => {
    handleDispatchActiveTouchpoint();
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

  const filteredLeads = leads.filter((l) => {
    if (pipelineFilter === 'ALL') return true;
    const currentStage =
      l.pipelineStage ||
      (l.status === 'Dispatched' || l.status === 'Sent'
        ? 'initial_sent'
        : l.status === 'Booked'
        ? 'booked'
        : l.status === 'Responded' || l.status === 'Replied'
        ? 'responded'
        : 'drafted');
    return currentStage === pipelineFilter;
  });

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
          {/* Left Column: Leads Selection List with Pipeline Filter */}
          <div
            className={`lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3 ${
              mobilePitchViewActive ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Show to Pitch ({filteredLeads.length})
              </span>
              <button
                onClick={() => loadLeads(activeClient?.id)}
                disabled={isLoadingLeads}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer min-h-[32px]"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingLeads ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Pipeline Stage Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px]">
              {['ALL', 'drafted', 'initial_sent', 'fu1_due', 'fu2_due', 'breakup_due', 'responded', 'booked'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPipelineFilter(st)}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer shrink-0 font-medium ${
                    pipelineFilter === st
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                  }`}
                >
                  {st === 'ALL' ? 'All Leads' : getStageBadgeLabel(st)}
                </button>
              ))}
            </div>

            {filteredLeads.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {leads.length === 0 ? 'No leads available. Run the scraper first.' : 'No leads matching this pipeline filter.'}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                {filteredLeads.map((l) => {
                  const isSelected = currentLeadForPitch?.id === l.id;
                  const currentStage = l.pipelineStage || (
                    l.status === 'Dispatched' || l.status === 'Sent' ? 'initial_sent' :
                    l.status === 'Booked' ? 'booked' :
                    l.status === 'Responded' || l.status === 'Replied' ? 'responded' : 'drafted'
                  );

                  return (
                    <div
                      key={l.id}
                      onClick={() => selectLeadForPitch(l)}
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

                      {/* Pipeline Stage Badge & Status Controls */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${getStageBadgeClass(currentStage)}`}>
                            {getStageBadgeLabel(currentStage)}
                          </span>
                        </div>
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

          {/* Right Column: Multi-Touch Sequence Studio & Pipeline Inspector */}
          <div
            className={`lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 ${
              !mobilePitchViewActive ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Mobile Back Button */}
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
                <h2 className="text-sm font-semibold text-white">Multi-Touch Sequence Studio & Cadence</h2>
                <p className="text-[11px] text-slate-400 truncate max-w-xs">
                  Target Show: {currentLeadForPitch ? currentLeadForPitch.showName : 'None selected'}
                </p>
              </div>

              {currentLeadForPitch && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generateFullSequenceForLead(currentLeadForPitch)}
                    disabled={isGeneratingSequence}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-950/40 border border-indigo-800/80 rounded-lg transition-colors cursor-pointer min-h-[34px]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isGeneratingSequence ? 'Generating...' : 'Regenerate Cadence'}</span>
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

            {!currentLeadForPitch ? (
              <div className="h-96 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-lg">
                <Mail className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">
                  Select any podcast show from the list to preview and edit its 4-touchpoint guest outreach sequence.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cadence Stage & Threading Telemetry Bar */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs overflow-x-auto gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-slate-400">Cadence Stage:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStageBadgeClass(currentSequence?.pipelineStage || currentLeadForPitch?.pipelineStage)}`}>
                      {getStageBadgeLabel(currentSequence?.pipelineStage || currentLeadForPitch?.pipelineStage)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 shrink-0">
                    {currentSequence?.threadId && (
                      <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                        Thread: {currentSequence.threadId.slice(0, 8)}...
                      </span>
                    )}
                    {currentSequence?.fu1DueAt && (
                      <span className="flex items-center gap-1 text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        <Clock className="w-3 h-3" />
                        FU 1 Due: {new Date(currentSequence.fu1DueAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Touchpoint Multi-Touch Sequence Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTouchpoint('initial')}
                    className={`flex flex-col items-center justify-center p-2 rounded-md transition-all cursor-pointer ${
                      activeTouchpoint === 'initial'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span className="text-xs font-semibold">🎯 1. Initial Pitch</span>
                    <span className="text-[10px] opacity-75">Day 0 (Hook & Topics)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTouchpoint('follow_up_1')}
                    className={`flex flex-col items-center justify-center p-2 rounded-md transition-all cursor-pointer ${
                      activeTouchpoint === 'follow_up_1'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span className="text-xs font-semibold">⚡ 2. Follow-Up 1</span>
                    <span className="text-[10px] opacity-75">Day +3 (Value Bump)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTouchpoint('follow_up_2')}
                    className={`flex flex-col items-center justify-center p-2 rounded-md transition-all cursor-pointer ${
                      activeTouchpoint === 'follow_up_2'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span className="text-xs font-semibold">📊 3. Follow-Up 2</span>
                    <span className="text-[10px] opacity-75">Day +7 (Proof Point)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTouchpoint('breakup')}
                    className={`flex flex-col items-center justify-center p-2 rounded-md transition-all cursor-pointer ${
                      activeTouchpoint === 'breakup'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span className="text-xs font-semibold">🚪 4. Breakup</span>
                    <span className="text-[10px] opacity-75">Day +14 (Close Loop)</span>
                  </button>
                </div>

                {/* Host Contact Email Input */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Host Contact Email</label>
                  <input
                    type="email"
                    value={currentLeadForPitch.email || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      currentLeadForPitch.email = val;
                      if (pitchDraft) setPitchDraft({ ...pitchDraft, recipientEmail: val });
                    }}
                    placeholder="host@podcast.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>

                {/* Subject Line Input with Thread Notice */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">
                      Subject Line ({activeTouchpoint === 'initial' ? 'Initial Pitch' : activeTouchpoint === 'follow_up_1' ? 'Follow-Up 1' : activeTouchpoint === 'follow_up_2' ? 'Follow-Up 2' : 'Breakup Email'})
                    </label>
                    {activeTouchpoint !== 'initial' && currentSequence?.threadId && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                        Threaded in Gmail
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={
                      activeTouchpoint === 'initial'
                        ? currentSequence?.initial?.subject || pitchDraft?.subject || ''
                        : activeTouchpoint === 'follow_up_1'
                        ? currentSequence?.followUp1?.subject || `Re: ${currentSequence?.initial?.subject || ''}`
                        : activeTouchpoint === 'follow_up_2'
                        ? currentSequence?.followUp2?.subject || `Re: ${currentSequence?.initial?.subject || ''}`
                        : currentSequence?.breakup?.subject || `Re: ${currentSequence?.initial?.subject || ''}`
                    }
                    onChange={(e) => handleUpdateActiveStep('subject', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[40px]"
                  />
                </div>

                {/* Dynamic Personalization Variables Toolbar */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-[11px]">
                  <span className="text-slate-400 text-xs font-medium">Quick Personalization Tokens:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{hostName}}')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 border border-slate-700 cursor-pointer text-[10px]"
                    >
                      + {`{{hostName}}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{showName}}')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 border border-slate-700 cursor-pointer text-[10px]"
                    >
                      + {`{{showName}}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{clientName}}')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 border border-slate-700 cursor-pointer text-[10px]"
                    >
                      + {`{{clientName}}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{{niche}}')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 hover:bg-slate-700 border border-slate-700 cursor-pointer text-[10px]"
                    >
                      + {`{{niche}}`}
                    </button>
                  </div>
                </div>

                {/* Email Body Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">
                      Email Body ({activeTouchpoint === 'initial' ? 'Initial Pitch' : activeTouchpoint === 'follow_up_1' ? 'Follow-Up 1' : activeTouchpoint === 'follow_up_2' ? 'Follow-Up 2' : 'Breakup Email'})
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {(activeTouchpoint === 'initial'
                        ? currentSequence?.initial?.body || pitchDraft?.body || ''
                        : activeTouchpoint === 'follow_up_1'
                        ? currentSequence?.followUp1?.body || ''
                        : activeTouchpoint === 'follow_up_2'
                        ? currentSequence?.followUp2?.body || ''
                        : currentSequence?.breakup?.body || ''
                      ).split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    value={
                      activeTouchpoint === 'initial'
                        ? currentSequence?.initial?.body || pitchDraft?.body || ''
                        : activeTouchpoint === 'follow_up_1'
                        ? currentSequence?.followUp1?.body || ''
                        : activeTouchpoint === 'follow_up_2'
                        ? currentSequence?.followUp2?.body || ''
                        : currentSequence?.breakup?.body || ''
                    }
                    onChange={(e) => handleUpdateActiveStep('body', e.target.value)}
                    rows={8}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                  />
                </div>

                {/* Conversation Angles for Initial Pitch */}
                {activeTouchpoint === 'initial' && (currentSequence?.initial?.talkingPoints || pitchDraft?.talkingPoints || []).length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">
                      Conversation Angles Included:
                    </span>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {(currentSequence?.initial?.talkingPoints || pitchDraft?.talkingPoints || []).map((pt, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bottom Action Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleSaveSequenceDraft}
                    className="px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer min-h-[40px] text-center"
                  >
                    Save Sequence Draft
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDispatchActiveTouchpoint}
                      disabled={isSendingEmail || !currentLeadForPitch.email}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-md shadow-indigo-950/40 min-h-[40px]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSendingEmail
                          ? 'Sending...'
                          : `Send ${activeTouchpoint === 'initial' ? 'Initial Pitch' : activeTouchpoint === 'follow_up_1' ? 'Follow-Up 1' : activeTouchpoint === 'follow_up_2' ? 'Follow-Up 2' : 'Breakup'} via Gmail`}
                      </span>
                    </button>
                  </div>
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
