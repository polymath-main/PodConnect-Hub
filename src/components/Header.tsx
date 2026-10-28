import React from 'react';
import { LogOut, User as UserIcon, Menu, X, Plus, Building2, ChevronDown, Cpu } from 'lucide-react';
import { WorkspaceAuthUser, Tenant } from '../types';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  user: WorkspaceAuthUser | null;
  onSignIn: () => void;
  onOperatorSignIn?: () => void;
  onSignOut: () => void;
  isLoggingIn: boolean;
  onQuickAction: () => void;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  activeTenant?: Tenant | null;
  onOpenWorkspaceSwitcher?: () => void;
  onOpenAgentMcp?: () => void;
  onOpenUserSpace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  user,
  onSignIn,
  onOperatorSignIn,
  onSignOut,
  isLoggingIn,
  onQuickAction,
  isMobileMenuOpen,
  onToggleMobileMenu,
  activeTenant,
  onOpenWorkspaceSwitcher,
  onOpenAgentMcp,
  onOpenUserSpace,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full flex items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 py-3 bg-slate-950/85 backdrop-blur-md border-b border-slate-800 min-h-[56px]">
      {/* Zone 1: Mobile Hamburger + Single text element wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          className="lg:hidden p-2 -ml-1 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <button
          onClick={() => onNavigate('database')}
          className="text-base sm:text-lg font-bold tracking-tight text-white hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          PodConnect Hub AI
        </button>

        {/* Tenant / Workspace Switcher Trigger */}
        {activeTenant && (
          <button
            onClick={onOpenWorkspaceSwitcher}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[120px] truncate">{activeTenant.name}</span>
            {activeTenant.currentRole && (
              <span className="px-1 py-0.2 rounded text-[9px] uppercase bg-indigo-500/20 text-indigo-300 font-semibold">
                {activeTenant.currentRole}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        )}

        {/* Agent MCP Gateway Trigger (Visible on mobile & desktop) */}
        {user && onOpenAgentMcp && (
          <button
            onClick={onOpenAgentMcp}
            className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-colors cursor-pointer"
            title="Configure Autonomous Agent MCP Access & Secret Keys"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Agent MCP</span>
            <span className="md:hidden text-[11px]">MCP</span>
          </button>
        )}
      </div>

      {/* Zone 2: 4-5 concise single-line text nav links (Desktop / Tablet landscape) */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => onNavigate('clients')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'clients' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Clients & Staging
        </button>
        <button
          onClick={() => onNavigate('database')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'database' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Master Database
        </button>

        <button
          onClick={() => onNavigate('onboarding')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'onboarding' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Client Onboarding
        </button>
        <button
          onClick={() => onNavigate('scraper')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'scraper' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Lead Sourcing
        </button>
        <button
          onClick={() => onNavigate('outreach')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'outreach' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Outreach Hub
        </button>
        <button
          onClick={() => onNavigate('milestones')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'milestones' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Milestones
        </button>
        <button
          onClick={() => onNavigate('workspace')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
            currentView === 'workspace' ? 'text-indigo-400 font-semibold' : ''
          }`}
        >
          Workspace
        </button>
      </nav>

      {/* Zone 3: 1 primary action or authentication button */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Space Trigger (Accessible on all screen sizes) */}
            <button
              type="button"
              onClick={onOpenUserSpace}
              title="Open User Space: Profile, Tenant & Agent Secret Keys"
              className="flex items-center gap-2 px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 transition-colors cursor-pointer min-h-[36px]"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <span className="font-medium text-slate-200 truncate max-w-[100px] sm:max-w-[120px] md:max-w-[140px] hidden xs:inline">
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 hidden sm:inline" />
            </button>

            <button
              onClick={onSignOut}
              title="Sign out of Google Workspace"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <button
              onClick={onQuickAction}
              className="px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer flex items-center gap-1.5 min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Onboard Client</span>
              <span className="sm:hidden">Onboard</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {onOperatorSignIn && (
              <button
                type="button"
                onClick={onOperatorSignIn}
                disabled={isLoggingIn}
                title="Quick Operator Access without Google OAuth"
                className="px-2.5 sm:px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                Operator Mode
              </button>
            )}

            {/* Official Google Workspace Sign-In Button styled to Google specs */}
            <button
              type="button"
              onClick={onSignIn}
              disabled={isLoggingIn}
              className="flex items-center gap-2 px-3 sm:px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 border border-slate-300 cursor-pointer disabled:opacity-60 min-h-[36px]"
            >
              <svg
                className="w-4 h-4 shrink-0"
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
              <span className="hidden sm:inline">{isLoggingIn ? 'Connecting...' : 'Connect Workspace'}</span>
              <span className="sm:hidden">{isLoggingIn ? '...' : 'Connect'}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
