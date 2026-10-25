import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ClientManagementView } from './components/clients/ClientManagementView';
import { MasterDatabaseView } from './components/MasterDatabaseView';
import { ClientOnboardingView } from './components/ClientOnboardingView';
import { ScraperConsoleView } from './components/ScraperConsoleView';
import { OutreachHubView } from './components/OutreachHubView';
import { CalendarMilestonesView } from './components/CalendarMilestonesView';
import { WorkspaceHubView } from './components/WorkspaceHubView';
import { ConfirmationModal } from './components/ConfirmationModal';
import { WorkspaceSwitcherModal } from './components/tenants/WorkspaceSwitcherModal';
import { Client, Lead, WorkspaceAuthUser, Tenant } from './types';
import { initAuth, googleSignIn, logout, fetchClientsFromFirestore, saveClientToFirestore } from './lib/firebase';
import { findOrCreateMasterSheet } from './lib/workspace';
import { api } from './lib/api';
import { FileSpreadsheet, Search, Send, Calendar, PlusCircle, Users } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('clients');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Multi-Tenant Workspace State
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState<boolean>(false);

  // Initial client record to ensure immediate operational populated state
  const [clients, setClients] = useState<Client[]>([
    {
      id: 'C001',
      name: 'HyperScale AI',
      platform: 'YouTube & Apple Podcasts',
      niche: 'B2B SaaS, Cloud DevOps, AI Infrastructure',
      package: '120-Day Growth Accelerator',
      pricing: '$6,000 Total ($3,000 Upfront / $3,000 M2)',
      minSubscribers: 2500,
      contractDays: 120,
      startDate: '2026-10-24',
      endDate: '2027-02-21',
      stage: 'Lead Sourcing',
      status: 'Active',
      orderNumber: 'ORD-2026-C001',
      targetPlacements: 10,
      bookedPlacements: 1,
      stageHistory: [
        {
          fromStage: 'Onboarding',
          toStage: 'Scoping',
          timestamp: '2026-10-24T08:00:00.000Z',
          note: 'Agreement parsed, deliverables approved by operations lead.',
        },
        {
          fromStage: 'Scoping',
          toStage: 'Lead Sourcing',
          timestamp: '2026-10-24T09:00:00.000Z',
          note: 'Requirements document generated; keyword dorks initialized.',
        },
      ],

      messagePillars: [
        'Why AI agents will replace traditional SaaS dashboards by 2027',
        'How to scale vector databases to 100M+ queries with zero downtime',
        'Lessons learned bootstrapping to $1.2M ARR before institutional capital',
      ],
      credibilityAssets: [
        'Scaled developer platform to 45k monthly active engineers',
        'Ranked #1 on Hacker News twice with 800+ upvotes',
      ],
      samplePitchAngle: 'High-leverage engineering and founder insights on AI agents replacing traditional web dashboards.',
      milestones: [
        {
          title: 'Kickoff, Messaging Profile & First 15 Pitches',
          dayOffset: 30,
          dueDate: '2026-11-23',
          completed: true,
        },
        {
          title: 'First Wave of Recorded Interviews Published',
          dayOffset: 60,
          dueDate: '2026-12-23',
          completed: false,
        },
        {
          title: 'Mid-Contract Performance Review & Niche Expansion',
          dayOffset: 90,
          dueDate: '2027-01-22',
          completed: false,
        },
        {
          title: 'Final Placement Close & Audience Asset Wrap-up',
          dayOffset: 120,
          dueDate: '2027-02-21',
          completed: false,
        },
      ],
      docs: {
        requirementsDocTitle: 'Client_Requirements_HyperScale_AI',
        conversationExportTitle: 'Conversation_Export_HyperScale_AI',
        outreachStrategyDocTitle: 'Outreach_Strategy_HyperScale_AI',
      },
      lastSyncedAt: new Date().toISOString(),
    },
  ]);

  const [activeClientId, setActiveClientId] = useState<string>('C001');
  const [activePitchLead, setActivePitchLead] = useState<Lead | null>(null);

  // Authentication State
  const [authUser, setAuthUser] = useState<WorkspaceAuthUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [masterSheetUrl, setMasterSheetUrl] = useState<string | undefined>(undefined);

  // Confirmation Modal State (Mandatory for mutating Google Workspace actions)
  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
    isLoading: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    affectedItems: [],
    onConfirm: () => {},
    isLoading: false,
  });

  const loadTenants = async () => {
    try {
      const res = await api.getTenants();
      if (res.success && res.tenants.length > 0) {
        setTenants(res.tenants);
        const current = res.tenants.find((t) => t.id === res.activeTenantId) || res.tenants[0];
        setActiveTenant(current);
        api.setTenantId(current.id);
      }
    } catch (err) {
      console.warn('Failed to load workspaces:', err);
    }
  };

  // Initialize Firebase Auth & Workspaces listener on app load
  useEffect(() => {
    loadTenants();
    const unsubscribe = initAuth(
      async (user, _token) => {
        setAuthUser({
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          uid: user.uid,
        });

        if (user) {
          api.setUserContext(user.uid, user.email || '');
          loadTenants();
        }

        // Sync with Cloud Firestore
        try {
          const cloudClients = await fetchClientsFromFirestore(user.uid);
          if (cloudClients.length > 0) {
            setClients(cloudClients);
          } else {
            // Seed initial client to Firestore for user
            await saveClientToFirestore(clients[0], user.uid);
          }
        } catch (e) {
          console.warn('Firestore client load deferred:', e);
        }
      },
      () => {
        setAuthUser(null);
        api.setUserContext('operator_system', 'operator@podconnect.agency');
        loadTenants();
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (!result) {
        // User closed the popup window or canceled; return cleanly without error
        return;
      }

      setAuthUser({
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
        uid: result.user.uid,
      });

      try {
        const cloudClients = await fetchClientsFromFirestore(result.user.uid);
        if (cloudClients.length > 0) {
          setClients(cloudClients);
        } else {
          await saveClientToFirestore(clients[0], result.user.uid);
        }
      } catch (e) {
        console.warn('Firestore initial sync error:', e);
      }

      try {
        const sheet = await findOrCreateMasterSheet();
        setMasterSheetUrl(sheet.spreadsheetUrl);
      } catch (e) {
        console.warn('Master sheet discovery deferred:', e);
      }
    } catch (err: any) {
      if (
        err?.code !== 'auth/popup-closed-by-user' &&
        err?.code !== 'auth/cancelled-popup-request' &&
        !err?.message?.includes('popup-closed-by-user') &&
        !err?.message?.includes('cancelled-popup-request')
      ) {
        setAuthError(err?.message || 'Google Workspace sign-in failed. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setAuthUser(null);
  };

  const handleRequestConfirmation = (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => {
    setConfirmationState({
      isOpen: true,
      title: options.title,
      description: options.description,
      affectedItems: options.affectedItems,
      onConfirm: async () => {
        setConfirmationState((prev) => ({ ...prev, isLoading: true }));
        try {
          await options.onConfirm();
        } finally {
          setConfirmationState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        }
      },
      isLoading: false,
    });
  };

  const handleClientAdded = (newClient: Client) => {
    setClients((prev) => [newClient, ...prev]);
    setActiveClientId(newClient.id);
    setCurrentView('database');

    if (authUser) {
      saveClientToFirestore(newClient, authUser.uid).catch((err) =>
        console.error('Failed to sync new client to Firestore:', err)
      );
    }
  };

  const handleClientUpdated = (updatedClient: Client) => {
    setClients((prev) =>
      prev.map((c) => (c.id === updatedClient.id ? updatedClient : c))
    );

    if (authUser) {
      saveClientToFirestore(updatedClient, authUser.uid).catch((err) =>
        console.error('Failed to sync updated client to Firestore:', err)
      );
    }
  };

  const handleOpenPitchModal = (lead: Lead) => {
    setActivePitchLead(lead);
    setCurrentView('outreach');
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-600 selection:text-white pb-14 lg:pb-0">
      {/* Top Bar Contract (Wordmark, Nav Links, Primary Action) */}
      <Header
        currentView={currentView}
        onNavigate={setCurrentView}
        user={authUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isLoggingIn={isLoggingIn}
        onQuickAction={() => setCurrentView('onboarding')}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        activeTenant={activeTenant}
        onOpenWorkspaceSwitcher={() => setIsWorkspaceModalOpen(true)}
      />

      {authError && (
        <div className="bg-rose-950/70 border-b border-rose-800 px-4 py-2 text-xs text-rose-200 flex items-center justify-between z-30">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-rose-400">Authentication notice:</span>
            <span>{authError}</span>
          </div>
          <button
            onClick={() => setAuthError(null)}
            className="text-rose-400 hover:text-white px-2 py-0.5 rounded hover:bg-rose-900/50 cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Responsive Workspace Sidebar & Mobile Drawer */}
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          clients={clients}
          activeClientId={activeClientId}
          onSelectClient={setActiveClientId}
          masterSheetUrl={masterSheetUrl}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#090D16]">
          {currentView === 'clients' && (
            <ClientManagementView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={(id) => {
                setActiveClientId(id);
              }}
              onClientUpdated={handleClientUpdated}
              onNavigateToOnboarding={() => setCurrentView('onboarding')}
              onNavigateToScraper={(id) => {
                setActiveClientId(id);
                setCurrentView('scraper');
              }}
              onNavigateToOutreach={(id) => {
                setActiveClientId(id);
                setCurrentView('outreach');
              }}
              onRequestConfirmation={handleRequestConfirmation}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
              masterSheetUrl={masterSheetUrl}
            />
          )}

          {currentView === 'database' && (
            <MasterDatabaseView
              clients={clients}
              masterSheetUrl={masterSheetUrl}
              onSelectClient={(id) => {
                setActiveClientId(id);
                setCurrentView('clients');
              }}
              onNavigateToOnboarding={() => setCurrentView('onboarding')}
              onNavigateToPipeline={() => setCurrentView('clients')}
              onRequestConfirmation={handleRequestConfirmation}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
            />
          )}


          {currentView === 'onboarding' && (
            <ClientOnboardingView
              onClientAdded={handleClientAdded}
              existingClientCount={clients.length}
              onRequestConfirmation={handleRequestConfirmation}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
            />
          )}

          {currentView === 'scraper' && (
            <ScraperConsoleView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={setActiveClientId}
              onOpenPitchModal={handleOpenPitchModal}
            />
          )}

          {currentView === 'outreach' && (
            <OutreachHubView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={setActiveClientId}
              activePitchLead={activePitchLead}
              onClosePitchModal={() => setActivePitchLead(null)}
              onRequestConfirmation={handleRequestConfirmation}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
              onClientUpdated={handleClientUpdated}
            />
          )}

          {currentView === 'milestones' && (
            <CalendarMilestonesView
              clients={clients}
              activeClientId={activeClientId}
              onSelectClient={setActiveClientId}
              onClientUpdated={handleClientUpdated}
              onRequestConfirmation={handleRequestConfirmation}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
            />
          )}

          {currentView === 'workspace' && (
            <WorkspaceHubView
              clients={clients}
              activeClientId={activeClientId}
              masterSheetUrl={masterSheetUrl}
              isAuthenticated={!!authUser}
              onSignIn={handleSignIn}
              onRequestConfirmation={handleRequestConfirmation}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar for Quick Ergonomic Navigation (Height <= 54px, < 10% mobile viewport) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-around px-2 py-1.5 h-14">
        {[
          { id: 'clients', label: 'Clients', icon: Users },
          { id: 'database', label: 'Database', icon: FileSpreadsheet },
          { id: 'onboarding', label: 'Onboard', icon: PlusCircle },
          { id: 'scraper', label: 'Scrape', icon: Search },
          { id: 'outreach', label: 'Outreach', icon: Send },
          { id: 'milestones', label: 'Milestones', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = currentView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentView(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors cursor-pointer min-w-[48px] min-h-[44px] ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>


      {/* Mandatory User Confirmation Modal for Workspace Mutations */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        description={confirmationState.description}
        affectedItems={confirmationState.affectedItems}
        onConfirm={confirmationState.onConfirm}
        onCancel={() =>
          setConfirmationState((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
        isLoading={confirmationState.isLoading}
      />

      {/* Multi-Tenant Workspace & Team Switcher Modal */}
      <WorkspaceSwitcherModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        activeTenant={activeTenant}
        onSelectTenant={(t) => {
          setActiveTenant(t);
          api.setTenantId(t.id);
        }}
        tenants={tenants}
        onTenantsUpdated={loadTenants}
      />
    </div>
  );
}
