import React, { useState } from 'react';
import {
  FileText,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  ExternalLink,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { Client, Milestone } from '../types';
import {
  createConversationExportDoc,
  createClientRequirementsDoc,
  createOutreachStrategyDoc,
  findOrCreateMasterSheet,
  syncClientToMasterSheet,
  scheduleClientMilestonesOnCalendar,
} from '../lib/workspace';
import { api } from '../lib/api';

interface ClientOnboardingViewProps {
  onClientAdded: (client: Client) => void;
  existingClientCount: number;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

export const ClientOnboardingView: React.FC<ClientOnboardingViewProps> = ({
  onClientAdded,
  existingClientCount,
  onRequestConfirmation,
  isAuthenticated,
  onSignIn,
}) => {
  const [transcript, setTranscript] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionProgress, setProvisionProgress] = useState<string[]>([]);
  const [completedClient, setCompletedClient] = useState<Client | null>(null);

  const sampleTranscript = `Client: Alex Morgan (CEO at HyperScale AI)
Agency Contact: PodConnect Operations Lead
Date: October 2026

Transcript:
Alex: "Hey team! We just closed our Series A and we need to book our executive team on top-tier podcasts in the B2B SaaS, Cloud DevOps, and AI Infrastructure space. We want shows with at least 2,500 active subscribers/listeners. Our primary focus is YouTube video podcasts and Apple Podcasts."

Agency: "Awesome Alex! Our 120-Day Growth Accelerator package is built exactly for this. We structure the campaign in four 30-day milestone phases:
- Phase 1 (Days 1-30): Foundation, message pillars, and first 15 tailored pitches launched.
- Phase 2 (Days 31-60): First wave of interviews recorded and published.
- Phase 3 (Days 61-90): Mid-contract performance review & secondary niche expansion.
- Phase 4 (Days 91-120): Final guest placement sprint and placement close.

Pricing is $6,000 total with $3,000 upfront and $3,000 at Day 60."

Alex: "That pricing and timeline works for us. Key message pillars:
1. Why AI agents will replace traditional SaaS dashboards by 2027.
2. How to scale vector databases to 100M+ queries with zero downtime.
3. Lessons learned bootstrapping to $1.2M ARR before raising institutional capital.
Our track record: Scaled to 45k monthly developers, featured on Hacker News #1 twice."

Agency: "Deal confirmed! We are archiving this agreement and provisioning your dedicated requirements and master database records now."`;

  const handleLoadSample = () => {
    setTranscript(sampleTranscript);
  };

  const handleExtract = async () => {
    if (!transcript.trim()) return;
    setIsExtracting(true);
    setExtractedData(null);
    setCompletedClient(null);

    try {
      const nextSeq = existingClientCount + 1;
      const res = await api.request<any>('/api/gemini/extract-transcript', {
        method: 'POST',
        body: JSON.stringify({ transcript, clientSequence: nextSeq }),
      });
      setExtractedData(res.data);
    } catch (err: any) {
      alert(`Extraction failed: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleProvisionWorkspace = () => {
    if (!isAuthenticated) {
      onSignIn();
      return;
    }

    if (!extractedData) return;

    onRequestConfirmation({
      title: `Generate Google Workspace Assets for ${extractedData.name}`,
      description: `PodConnect Hub AI will autonomously execute the following Google Workspace operations for Client ID ${extractedData.clientId}:`,
      affectedItems: [
        `Google Doc: Conversation_Export_${extractedData.name.replace(/\s+/g, '_')}`,
        `Google Doc: Client_Requirements_${extractedData.name.replace(/\s+/g, '_')}`,
        `Google Doc: Outreach_Strategy_${extractedData.name.replace(/\s+/g, '_')}`,
        `Google Sheet: Sync row into Client_Database_PodConnect_Master`,
        `Google Calendar: Schedule ${extractedData.milestones?.length || 4} project milestone deadlines on primary calendar`,
      ],
      onConfirm: async () => {
        executeProvisioning();
      },
    });
  };

  const executeProvisioning = async () => {
    setIsProvisioning(true);
    setProvisionProgress([]);

    const logStep = (msg: string) => {
      setProvisionProgress((prev) => [...prev, msg]);
    };

    try {
      const now = new Date();
      const startDate = now.toISOString().split('T')[0];
      const endDate = new Date(now.getTime() + (extractedData.contractDays || 120) * 86400000)
        .toISOString()
        .split('T')[0];

      logStep(`Creating Google Doc: Conversation_Export_${extractedData.name}...`);
      const convDoc = await createConversationExportDoc(extractedData.name, transcript, extractedData);
      logStep(`Conversation Export Doc created.`);

      logStep(`Creating Google Doc: Client_Requirements_${extractedData.name}...`);
      const reqDoc = await createClientRequirementsDoc(extractedData.name, {
        id: extractedData.clientId,
        name: extractedData.name,
        niche: extractedData.niche,
        platform: extractedData.platform,
        minSubscribers: extractedData.minSubscribers,
        messagePillars: extractedData.messagePillars,
        credibilityAssets: extractedData.credibilityAssets,
        samplePitchAngle: extractedData.samplePitchAngle,
      });
      logStep(`Client Requirements Doc created.`);

      logStep(`Creating Google Doc: Outreach_Strategy_${extractedData.name}...`);
      const outreachDoc = await createOutreachStrategyDoc(
        extractedData.name,
        { id: extractedData.clientId },
        []
      );
      logStep(`Outreach Strategy Doc created.`);

      const milestones: Milestone[] = (extractedData.milestones || []).map((m: any) => {
        const d = new Date(now.getTime() + m.dayOffset * 86400000);
        return {
          title: m.title,
          dayOffset: m.dayOffset,
          dueDate: d.toISOString().split('T')[0],
          completed: false,
        };
      });

      const newClient: Client = {
        id: extractedData.clientId,
        name: extractedData.name,
        platform: extractedData.platform,
        niche: extractedData.niche,
        package: extractedData.package,
        pricing: extractedData.pricing,
        minSubscribers: extractedData.minSubscribers || 1000,
        contractDays: extractedData.contractDays || 120,
        startDate,
        endDate,
        status: 'Active',
        messagePillars: extractedData.messagePillars || [],
        credibilityAssets: extractedData.credibilityAssets || [],
        samplePitchAngle: extractedData.samplePitchAngle,
        milestones,
        docs: {
          conversationExportUrl: convDoc.documentUrl,
          conversationExportTitle: convDoc.title,
          requirementsDocUrl: reqDoc.documentUrl,
          requirementsDocTitle: reqDoc.title,
          outreachStrategyDocUrl: outreachDoc.documentUrl,
          outreachStrategyDocTitle: outreachDoc.title,
        },
        lastSyncedAt: new Date().toISOString(),
      };

      logStep('Scheduling contract milestones directly on Google Calendar...');
      const scheduledMilestones = await scheduleClientMilestonesOnCalendar(newClient);
      newClient.milestones = scheduledMilestones;
      logStep(`Scheduled ${scheduledMilestones.length} milestone deadlines on Google Calendar.`);

      logStep('Updating Master Database (Client_Database_PodConnect_Master) in Google Sheets...');
      try {
        const sheet = await findOrCreateMasterSheet();
        await syncClientToMasterSheet(sheet.spreadsheetId, newClient);
        logStep('Master Google Sheet synchronized with live document hyperlinks.');
      } catch (sheetErr: any) {
        logStep(`Master Sheet sync notice: ${sheetErr.message}`);
      }

      onClientAdded(newClient);
      setCompletedClient(newClient);
    } catch (err: any) {
      console.error('Provisioning error:', err);
      logStep(`Error during provisioning: ${err.message}`);
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Client Onboarding & Archive</h1>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous transcript parsing, requirements extraction, Google Docs archiving, and calendar milestone structuring.
          </p>
        </div>
        <button
          onClick={handleLoadSample}
          className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer self-start min-h-[38px]"
        >
          Load Sample Agreement Transcript
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Transcript Input */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Agreement or Onboarding Chat Log
            </label>
            <span className="text-[11px] font-mono text-slate-400">
              Assigned ID: C{String(existingClientCount + 1).padStart(3, '0')}
            </span>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            placeholder="Paste raw conversation logs, Slack/WhatsApp transcripts, or confirmed agreement notes here..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-base sm:text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
          />

          <button
            onClick={handleExtract}
            disabled={isExtracting || !transcript.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
          >
            {isExtracting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Extracting Requirements (Gemini AI)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Extract Client Scope & Milestones</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Structured Preview & Provisioning */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white tracking-tight">Structured Client Blueprint</h2>
            {extractedData && (
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Parsed Successfully</span>
              </span>
            )}
          </div>

          {!extractedData ? (
            <div className="h-72 sm:h-96 flex flex-col items-center justify-center text-center p-6 sm:p-8 border border-dashed border-slate-800 rounded-lg">
              <FileText className="w-8 h-8 text-slate-600 mb-3" />
              <p className="text-xs text-slate-400 max-w-sm">
                Paste conversation notes on the left and click <span className="text-indigo-400 font-medium">Extract Client Scope</span> to generate client requirements, message pillars, and calendar phases.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary Metadata Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Client Name</span>
                  <span className="font-semibold text-slate-200 truncate block">{extractedData.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Client ID</span>
                  <span className="font-mono text-indigo-400 font-semibold">{extractedData.clientId}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Package</span>
                  <span className="text-slate-200 truncate block">{extractedData.package}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Pricing</span>
                  <span className="font-semibold text-emerald-400">{extractedData.pricing}</span>
                </div>
              </div>

              {/* Niches & Platforms */}
              <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Target Niche:</span>
                  <span className="text-slate-200 font-medium text-right ml-2">{extractedData.niche}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Target Platforms:</span>
                  <span className="text-slate-200 font-medium text-right ml-2">{extractedData.platform}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Subscriber Threshold:</span>
                  <span className="font-mono text-indigo-300 font-medium tabular-nums">
                    {extractedData.minSubscribers?.toLocaleString() || 1000}+ subscribers
                  </span>
                </div>
              </div>

              {/* Message Pillars */}
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">
                  Thought Leadership Message Pillars
                </span>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {extractedData.messagePillars?.map((pillar: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 p-2 bg-slate-950/40 border border-slate-800/80 rounded">
                      <span className="text-indigo-400 font-mono text-[10px] shrink-0 mt-0.5">
                        0{i + 1}.
                      </span>
                      <span>{pillar}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Milestones Preview */}
              <div>
                <span className="text-xs font-semibold text-slate-300 block mb-2">
                  Automated 120-Day Project Milestones
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {extractedData.milestones?.map((m: any, i: number) => (
                    <div key={i} className="p-2 bg-slate-950/40 border border-slate-800/80 rounded flex items-center justify-between">
                      <span className="text-slate-300 truncate pr-2">{m.title}</span>
                      <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
                        Day {m.dayOffset}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button: Generate Workspace Assets */}
              <div className="pt-2 border-t border-slate-800">
                {!completedClient ? (
                  <button
                    onClick={handleProvisionWorkspace}
                    disabled={isProvisioning}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 shadow-lg shadow-emerald-950/30 min-h-[44px]"
                  >
                    {isProvisioning ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Provisioning Google Docs, Sheets & Calendar...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Sync Master Sheet & Provision Workspace</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Workspace Assets Synchronized for {completedClient.name}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {completedClient.docs.requirementsDocUrl && (
                        <a
                          href={completedClient.docs.requirementsDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800 hover:border-slate-700 text-slate-300 min-h-[38px]"
                        >
                          <span className="truncate">{completedClient.docs.requirementsDocTitle}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                        </a>
                      )}
                      {completedClient.docs.conversationExportUrl && (
                        <a
                          href={completedClient.docs.conversationExportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800 hover:border-slate-700 text-slate-300 min-h-[38px]"
                        >
                          <span className="truncate">{completedClient.docs.conversationExportTitle}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Log */}
              {provisionProgress.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
                  {provisionProgress.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
