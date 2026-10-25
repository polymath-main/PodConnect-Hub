import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  FileSpreadsheet,
  FileText,
  Calendar as CalendarIcon,
  Search,
  ExternalLink,
  RotateCw,
  FolderPlus,
  Trash2,
  Folder,
  File,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Client } from '../types';
import {
  DriveFile,
  listDriveFiles,
  createDriveFolder,
  deleteDriveFile,
  CalendarEventItem,
  listUpcomingCalendarEvents,
  readMasterSheetRows,
  findOrCreateMasterSheet,
  MASTER_SHEET_TITLE,
} from '../lib/workspace';

interface WorkspaceHubViewProps {
  clients: Client[];
  activeClientId: string;
  masterSheetUrl?: string;
  isAuthenticated: boolean;
  onSignIn: () => void;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
}

export const WorkspaceHubView: React.FC<WorkspaceHubViewProps> = ({
  clients,
  activeClientId,
  masterSheetUrl,
  isAuthenticated,
  onSignIn,
  onRequestConfirmation,
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'sheets' | 'docs' | 'calendar'>('drive');

  // Google Drive state
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);

  // Google Sheets state
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [currentSpreadsheetUrl, setCurrentSpreadsheetUrl] = useState<string | undefined>(masterSheetUrl);

  // Google Calendar state
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Auto-load tab data on tab switch or authentication
  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'drive') loadDriveFiles();
      else if (activeTab === 'sheets') loadSheetData();
      else if (activeTab === 'docs') loadDocsFiles();
      else if (activeTab === 'calendar') loadCalendarEvents();
    }
  }, [activeTab, isAuthenticated]);

  const loadDriveFiles = async (searchQuery?: string) => {
    if (!isAuthenticated) return;
    setIsLoadingDrive(true);
    setStatusMessage(null);
    try {
      const files = await listDriveFiles(searchQuery !== undefined ? searchQuery : driveSearch);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Failed to load Google Drive files:', err);
      setStatusMessage({ text: `Drive error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const loadDocsFiles = async () => {
    if (!isAuthenticated) return;
    setIsLoadingDrive(true);
    try {
      const files = await listDriveFiles();
      // Filter for Google Docs or documents created by PodConnect
      const docs = files.filter(
        (f) =>
          f.mimeType === 'application/vnd.google-apps.document' ||
          f.name.startsWith('Conversation_Export_') ||
          f.name.startsWith('Client_Requirements_') ||
          f.name.startsWith('Outreach_Strategy_')
      );
      setDriveFiles(docs);
    } catch (err: any) {
      setStatusMessage({ text: `Docs load error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const loadSheetData = async () => {
    if (!isAuthenticated) return;
    setIsLoadingSheet(true);
    setStatusMessage(null);
    try {
      const sheet = await findOrCreateMasterSheet();
      setCurrentSpreadsheetUrl(sheet.spreadsheetUrl);
      const rows = await readMasterSheetRows(sheet.spreadsheetId);
      setSheetRows(rows);
    } catch (err: any) {
      console.error('Failed to load Master Sheet data:', err);
      setStatusMessage({ text: `Sheets error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const loadCalendarEvents = async () => {
    if (!isAuthenticated) return;
    setIsLoadingCalendar(true);
    setStatusMessage(null);
    try {
      const events = await listUpcomingCalendarEvents();
      setCalendarEvents(events);
    } catch (err: any) {
      console.error('Failed to load Calendar events:', err);
      setStatusMessage({ text: `Calendar error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const folderToCreate = newFolderName.trim();

    onRequestConfirmation({
      title: `Create Google Drive Folder`,
      description: `Create a new dedicated client directory in your Google Drive:`,
      affectedItems: [`Folder Name: "${folderToCreate}"`, `Target: Google Drive Root`],
      onConfirm: async () => {
        try {
          await createDriveFolder(folderToCreate);
          setNewFolderName('');
          setShowFolderInput(false);
          setStatusMessage({ text: `Folder "${folderToCreate}" created successfully in Google Drive.`, type: 'success' });
          loadDriveFiles();
        } catch (err: any) {
          setStatusMessage({ text: `Failed to create folder: ${err.message}`, type: 'error' });
        }
      },
    });
  };

  const handleDeleteFile = (file: DriveFile) => {
    onRequestConfirmation({
      title: `Delete File from Google Drive`,
      description: `Are you sure you want to delete this file from Google Drive? This action will remove it permanently:`,
      affectedItems: [`File: ${file.name}`, `File ID: ${file.id}`],
      onConfirm: async () => {
        try {
          await deleteDriveFile(file.id);
          setStatusMessage({ text: `File "${file.name}" removed from Google Drive.`, type: 'success' });
          loadDriveFiles();
        } catch (err: any) {
          setStatusMessage({ text: `Failed to delete file: ${err.message}`, type: 'error' });
        }
      },
    });
  };

  const getMimeIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) return <Folder className="w-4 h-4 text-amber-400" />;
    if (mimeType.includes('spreadsheet')) return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    if (mimeType.includes('document')) return <FileText className="w-4 h-4 text-sky-400" />;
    return <File className="w-4 h-4 text-slate-400" />;
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '—';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '—';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">Google Workspace Hub</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Live Google 1P API
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Seamlessly access Google Drive, Google Sheets, Google Docs, and Google Calendar directly connected to your project.
          </p>
        </div>

        {/* Quick Launch Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>Open Drive</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
          <a
            href="https://docs.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Open Docs</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
          <a
            href={currentSpreadsheetUrl || 'https://sheets.google.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Sheets</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Open Calendar</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </div>
      </div>

      {/* Authentication Gate Prompt if disconnected */}
      {!isAuthenticated && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Connect Google Workspace with User Permission</p>
              <p className="text-xs text-slate-300 mt-0.5">
                Grant permission to explore your Google Drive files, synchronize your Master Client Database in Google Sheets, archive contract briefs in Google Docs, and schedule automated milestones on Google Calendar.
              </p>
            </div>
          </div>
          <button
            onClick={onSignIn}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            Connect Workspace
          </button>
        </div>
      )}

      {/* Notification Banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/60 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Workspace Service Segmented Selector */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
        <button
          onClick={() => setActiveTab('drive')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] ${
            activeTab === 'drive'
              ? 'bg-slate-800 text-white font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <HardDrive className="w-4 h-4 text-amber-400" />
          <span>Google Drive Explorer</span>
        </button>

        <button
          onClick={() => setActiveTab('sheets')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] ${
            activeTab === 'sheets'
              ? 'bg-slate-800 text-white font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Google Sheets Master DB</span>
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] ${
            activeTab === 'docs'
              ? 'bg-slate-800 text-white font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4 text-sky-400" />
          <span>Google Docs Library</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap min-h-[36px] ${
            activeTab === 'calendar'
              ? 'bg-slate-800 text-white font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarIcon className="w-4 h-4 text-indigo-400" />
          <span>Google Calendar Feed</span>
        </button>
      </div>

      {/* TAB 1: GOOGLE DRIVE EXPLORER */}
      {activeTab === 'drive' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={driveSearch}
                  onChange={(e) => setDriveSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadDriveFiles(driveSearch)}
                  placeholder="Search files in Google Drive..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <button
                onClick={() => loadDriveFiles(driveSearch)}
                className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFolderInput(!showFolderInput)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>New Folder</span>
              </button>
              <button
                onClick={() => loadDriveFiles()}
                disabled={isLoadingDrive}
                className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh Drive files"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* New folder input drawer */}
          {showFolderInput && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-3">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g., PodConnect_HyperScale_AI)..."
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
              <button
                onClick={handleCreateFolder}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors cursor-pointer"
              >
                Create in Drive
              </button>
              <button
                onClick={() => setShowFolderInput(false)}
                className="px-2 py-1.5 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Drive Files Table */}
          <div className="overflow-x-auto">
            {isLoadingDrive ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Querying Google Drive files...</span>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {isAuthenticated ? 'No files found in Google Drive.' : 'Sign in to browse your Google Drive files.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Last Modified</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {driveFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        <div className="flex items-center gap-2 max-w-md truncate">
                          {getMimeIcon(file.mimeType)}
                          <span className="truncate">{file.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {file.mimeType.split('.').pop()?.replace('document', 'Google Doc').replace('spreadsheet', 'Google Sheet').replace('folder', 'Folder')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="Delete file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GOOGLE SHEETS MASTER DATABASE */}
      {activeTab === 'sheets' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">{MASTER_SHEET_TITLE}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Live centralized Google Sheet syncing all client IDs, packages, pricing, timeline dates, and document links.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {currentSpreadsheetUrl && (
                <a
                  href={currentSpreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={loadSheetData}
                disabled={isLoadingSheet}
                className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh Google Sheet values"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingSheet ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Sheets Live Data Table */}
          <div className="overflow-x-auto">
            {isLoadingSheet ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Fetching latest rows from Google Sheets API...</span>
              </div>
            ) : sheetRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {isAuthenticated ? 'No rows found in Master Spreadsheet.' : 'Sign in to view Master Google Sheet.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-slate-300 font-semibold text-[11px]">
                    {sheetRows[0]?.map((col, idx) => (
                      <th key={idx} className="py-2.5 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {sheetRows.slice(1).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-850/50 transition-colors font-mono text-[11px]">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 text-slate-300 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GOOGLE DOCS LIBRARY */}
      {activeTab === 'docs' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-white">Archived Google Documents</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Dedicated Google Docs generated for client agreements, scoping requirements, and outreach strategy decks.
              </p>
            </div>
            <button
              onClick={loadDocsFiles}
              disabled={isLoadingDrive}
              className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Refresh Google Docs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {clients.map((c) => (
              <div key={c.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-white">{c.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{c.id}</span>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-850 text-xs">
                  {/* Conversation Doc */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-400 truncate max-w-[150px]">Conversation Export</span>
                    {c.docs.conversationExportUrl ? (
                      <a
                        href={c.docs.conversationExportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-600">Pending</span>
                    )}
                  </div>

                  {/* Requirements Doc */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-400 truncate max-w-[150px]">Requirements Spec</span>
                    {c.docs.requirementsDocUrl ? (
                      <a
                        href={c.docs.requirementsDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-600">Pending</span>
                    )}
                  </div>

                  {/* Outreach Strategy Doc */}
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-400 truncate max-w-[150px]">Outreach Strategy</span>
                    {c.docs.outreachStrategyDocUrl ? (
                      <a
                        href={c.docs.outreachStrategyDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-600">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: GOOGLE CALENDAR FEED */}
      {activeTab === 'calendar' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-white">Google Calendar Feed</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upcoming campaign milestones and events queried directly from your Google Calendar.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <span>Google Calendar</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={loadCalendarEvents}
                disabled={isLoadingCalendar}
                className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh Calendar events"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingCalendar ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {isLoadingCalendar ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Reading Google Calendar events...</span>
              </div>
            ) : calendarEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                {isAuthenticated
                  ? 'No upcoming scheduled events found on Google Calendar.'
                  : 'Sign in to sync your Google Calendar.'}
              </div>
            ) : (
              calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{evt.summary}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {evt.start.date || evt.start.dateTime || 'Scheduled'}
                      </p>
                    </div>
                  </div>
                  {evt.htmlLink && (
                    <a
                      href={evt.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors shrink-0"
                      title="View in Google Calendar"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
