import React from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  Search,
  Send,
  Calendar,
  Layers,
  ExternalLink,
  X,
  HardDrive,
  Users,
  ScrollText,
} from 'lucide-react';
import { Client } from '../types';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  clients: Client[];
  activeClientId: string;
  onSelectClient: (clientId: string) => void;
  masterSheetUrl?: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  clients,
  activeClientId,
  onSelectClient,
  masterSheetUrl,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'clients', label: 'Client Management & Staging', icon: Users },
    { id: 'database', label: 'Master Database', icon: FileSpreadsheet },
    { id: 'onboarding', label: 'Client Onboarding', icon: PlusCircle },
    { id: 'scraper', label: 'Lead Sourcing & Scraping', icon: Search },
    { id: 'outreach', label: 'Outreach & Pitch Hub', icon: Send },
    { id: 'milestones', label: 'Calendar Milestones', icon: Calendar },
    { id: 'workspace', label: 'Google Workspace Hub', icon: HardDrive },
    { id: 'logs', label: 'Logs & Audit Console', icon: ScrollText },
  ];


  const handleNavClick = (id: string) => {
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  const handleClientClick = (clientId: string) => {
    onSelectClient(clientId);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      <div className="p-4 space-y-6 overflow-y-auto">
        {/* Mobile Header with Close button */}
        {onCloseMobile && (
          <div className="lg:hidden flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-xs font-semibold text-white">Navigation Menu</span>
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Core Navigation Section */}
        <div>
          <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase block px-3 mb-2">
            Operations
          </span>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer min-h-[40px] ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Active Client Campaign Selector */}
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
              Client Campaigns
            </span>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              {clients.length}
            </span>
          </div>

          {clients.length === 0 ? (
            <div className="px-3 py-4 text-center rounded-lg bg-slate-900/40 border border-slate-800/60">
              <p className="text-xs text-slate-500">No active clients yet.</p>
              <button
                onClick={() => handleNavClick('onboarding')}
                className="mt-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                + Onboard first client
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {clients.map((client) => {
                const isSelected = activeClientId === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleClientClick(client.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer min-h-[42px] ${
                      isSelected
                        ? 'bg-slate-800 text-white font-medium border border-slate-700/60'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-indigo-400 shrink-0">
                          {client.id}
                        </span>
                        <span className="truncate">{client.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {client.niche}
                      </span>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        client.status === 'Cancelled'
                          ? 'bg-rose-500'
                          : client.status === 'Paused'
                          ? 'bg-amber-500'
                          : client.status === 'Active' || client.stage === 'Interview Scheduled' || client.stage === 'Outreach Active'
                          ? 'bg-emerald-500'
                          : 'bg-sky-500'
                      }`}
                    />

                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer quick link to Master Database in Google Sheets */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        {masterSheetUrl ? (
          <a
            href={masterSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors min-h-[40px]"
          >
            <div className="flex items-center gap-2 truncate">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate font-medium">Master Sheet Sync</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </a>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-500">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Master Sheet not created</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop / Tablet Landscape Permanent Sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-950 border-r border-slate-800/80 flex-col shrink-0 h-[calc(100vh-56px)] sticky top-[56px]">
        {sidebarContent}
      </aside>

      {/* Mobile & Tablet Drawer Modal */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 h-full shadow-2xl z-10 flex flex-col">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
