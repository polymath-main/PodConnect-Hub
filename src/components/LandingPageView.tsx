import React from 'react';
import {
  Sparkles,
  Search,
  Radio,
  Send,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  ArrowRight,
  Database,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Globe,
  Terminal,
} from 'lucide-react';

interface LandingPageViewProps {
  onSignIn: () => void;
  onOperatorSignIn?: () => void;
  isLoggingIn: boolean;
  authError?: string | null;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onSignIn,
  onOperatorSignIn,
  isLoggingIn,
  authError,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] overflow-hidden pointer-events-none -z-10 opacity-30">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-indigo-600/30 rounded-full blur-[140px]" />
        <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[140px]" />
      </div>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center space-y-8">
        {/* Release / Protocol Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-indigo-300 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="font-semibold">PodConnect v2.0</span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">Gemini 2.5 Flash Grounding + Agent MCP Gateway</span>
        </div>

        {/* Main Headline */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]">
            Autonomous Podcast Guesting & Placement at Agency Scale
          </h1>
          <p className="text-base sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Discover verified shows with Google Search Grounding, automate pre-import staging review, synthesize bespoke pitch sequences, and let autonomous AI agents operate your pipeline.
          </p>
        </div>

        {/* Auth Error Banner if present */}
        {authError && (
          <div className="max-w-md mx-auto p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {authError}
          </div>
        )}

        {/* Primary CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          {/* Official Google Workspace Sign-In CTA */}
          <button
            type="button"
            onClick={onSignIn}
            disabled={isLoggingIn}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold rounded-xl shadow-xl hover:shadow-indigo-500/10 transition-all cursor-pointer disabled:opacity-60 min-h-[48px]"
          >
            <svg
              className="w-5 h-5 shrink-0"
              viewBox="0 0 48 48"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.48-2.99-.48-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google Workspace'}</span>
          </button>

          {/* Quick Operator Demo */}
          {onOperatorSignIn && (
            <button
              type="button"
              onClick={onOperatorSignIn}
              disabled={isLoggingIn}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-sm font-semibold rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer min-h-[48px]"
            >
              <span>Try Interactive Demo</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </button>
          )}
        </div>

        {/* Trust Badges */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Owner-Scoped Firebase Firestore
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            Zero Server-Side Token Storage
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-sky-400" />
            Standard JSON-RPC 2.0 MCP Gateway
          </span>
        </div>
      </div>

      {/* Feature Capabilities Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-400">Engine Core</h2>
          <p className="text-2xl font-bold text-white">Full-Funnel Thought-Leadership Outreach</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Card 1: Grounded Show Discovery */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Google Search Grounding</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scrapes and grounds podcast data live from Google Search using Gemini 2.5 Flash. Discovers active hosts, verified contact channels, and enforces subscriber floors (≥1k subs).
            </p>
          </div>

          {/* Card 2: Pre-Import Staging Review */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Pre-Import Staging Review</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              AI-discovered shows land in a staging isolation chamber. Review, edit, or bulk-approve high-scoring leads (≥8.0/10) before they enter your permanent CRM database.
            </p>
          </div>

          {/* Card 3: 4-Touchpoint Outreach Sequences */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Bespoke Pitch Sequences</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generates tailored 4-touchpoint cadences (Initial Pitch, FU1 Case Study, FU2 Quick Check, Breakup) personalized to each client&apos;s unique message pillars.
            </p>
          </div>

          {/* Card 4: Autonomous Agent MCP Server */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Autonomous Agent Gateway</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every authenticated user receives a personal Agent Secret Key (<code className="text-indigo-300">pca_live_...</code>). Antigravity, OpenCode, Claude, and Cursor can operate your workspace via MCP.
            </p>
          </div>

          {/* Card 5: Google Workspace Integration */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Google Workspace Sync</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generates executive Google Docs for agreements, messaging profiles, and outreach strategy, while synchronizing live milestones to Google Calendar and Master Sheets.
            </p>
          </div>

          {/* Card 6: Multi-Tenant Architecture */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Tenant Isolation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Switch between sovereign agency workspaces. Built-in role-based access control (RBAC), seat limits, and daily job quotas protect resources across client teams.
            </p>
          </div>
        </div>
      </div>

      {/* Agent & MCP Code Snippet Showcase */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Universal Agent MCP Protocol Integration</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              JSON-RPC 2.0
            </span>
          </div>

          <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 p-4 rounded-xl overflow-x-auto leading-relaxed border border-slate-800/60">
{`# 1. Sign in to obtain your user-scoped Agent Secret Key: pca_live_xxx
# 2. Add to ~/.gemini/config/mcp_config.json:
{
  "mcpServers": {
    "podconnect-hub": {
      "command": "python3",
      "args": ["\${workspaceFolder}/mcp/podconnect_mcp.py"],
      "env": {
        "PODCONNECT_URL": "https://<your-project>.vercel.app",
        "AGENT_SECRET_KEY": "pca_live_your_personal_key"
      }
    }
  }
}
# 3. Your AI agent can now search leads, stage shows, and draft pitches!`}
          </pre>
        </div>
      </div>

      {/* Bottom CTA Banner */}
      <div className="border-t border-slate-800/80 bg-slate-900/40 py-12 mt-auto">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <h3 className="text-xl sm:text-2xl font-bold text-white">
            Ready to Automate Your Podcast Placement Pipeline?
          </h3>
          <p className="text-xs sm:text-sm text-slate-400">
            Connect your Google Workspace or launch in operator mode to start discovering shows in seconds.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onSignIn}
              disabled={isLoggingIn}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Get Started with Google Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
