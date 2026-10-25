import React, { useState } from 'react';
import { Sparkles, CheckCircle2, ChevronRight, Zap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export const StagingAutomationBanner: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const automations = [
    {
      stage: 'Onboarding ➔ Scoping',
      action: 'Autonomous Document Generation',
      details: 'Generates Conversation_Export_<Client> and Client_Requirements_<Client> with message pillars in Google Docs.',
    },
    {
      stage: 'Scoping ➔ Lead Sourcing',
      action: 'Niche Query Parameter Pre-load',
      details: 'Pre-configures search dorks, robots.txt token bucket, and subscriber threshold (≥ 1k subs) in the Scraper Console.',
    },
    {
      stage: 'Lead Sourcing ➔ Outreach',
      action: 'Personalized Pitch Synthesis',
      details: 'Ranks scored leads (≥ 8.0/10) and pre-drafts customized pitch email sequences with verified contact emails.',
    },
    {
      stage: 'Outreach ➔ Interview Scheduled',
      action: 'Calendar Milestone Check-off',
      details: 'Logs confirmed podcast interview booking date and updates Master Google Sheet with live placement status.',
    },
    {
      stage: 'Order Cancellation Flow',
      action: 'Settlement & Calendar Cleanup',
      details: 'Prompts reason and settlement audit, updates Master Sheet to Cancelled, and flags Google Calendar milestones.',
    },
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden text-xs">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Staging Automations Engine</span>
              <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Autonomous
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Stages automatically synchronize Google Docs, Master Sheets, Calendar Milestones, and Scraper parameters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Collapse rules' : 'View automation rules'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-1 border-t border-slate-800/80 bg-slate-950/40 divide-y divide-slate-800/60">
          {automations.map((item, idx) => (
            <div key={idx} className="py-2.5 first:pt-2 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">
                  {item.stage}
                </span>
                <span className="font-medium text-slate-200">{item.action}</span>
              </div>
              <p className="text-[11px] text-slate-400 sm:text-right max-w-md">
                {item.details}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
