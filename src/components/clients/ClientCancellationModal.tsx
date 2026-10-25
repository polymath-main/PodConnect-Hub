import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Calendar, FileSpreadsheet, Ban, CheckCircle2 } from 'lucide-react';
import { Client, CancellationDetails } from '../../types';

interface ClientCancellationModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancellation: (client: Client, details: CancellationDetails, cleanCalendar: boolean, syncSheet: boolean) => Promise<void>;
  onRequestConfirmation: (options: {
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }) => void;
}

const CANCELLATION_REASONS = [
  'Client Budget Freeze / Funding Delay',
  'Strategic Pivot / Re-branding',
  'Timeline & Capacity Mismatch',
  'Mutual Agreement / Friendly Exit',
  'Unresponsive / Stalled Communications',
  'Terms & Scope Non-Compliance',
  'Performance Expectation Mismatch',
  'Other Operational Reason',
];

const SETTLEMENT_OPTIONS: Array<CancellationDetails['settlementType']> = [
  'No Settlement Required',
  'Full Refund',
  'Partial Settlement',
  'Retained as Credit',
  'Non-Refundable (Delivered)',
];

export const ClientCancellationModal: React.FC<ClientCancellationModalProps> = ({
  client,
  isOpen,
  onClose,
  onConfirmCancellation,
  onRequestConfirmation,
}) => {
  if (!isOpen || !client) return null;

  const [reason, setReason] = useState<string>(CANCELLATION_REASONS[0]);
  const [settlementType, setSettlementType] = useState<CancellationDetails['settlementType']>('No Settlement Required');
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [cleanCalendar, setCleanCalendar] = useState<boolean>(true);
  const [syncSheet, setSyncSheet] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const details: CancellationDetails = {
      reason,
      cancelledAt: new Date().toISOString(),
      settlementType,
      settlementAmount: settlementAmount ? settlementAmount.trim() : undefined,
      notes: notes.trim() || undefined,
      archiveCalendarEvents: cleanCalendar,
      cancelledBy: 'Agency Operations Lead',
    };

    const affectedItems = [
      `Client: [${client.id}] ${client.name} (${client.package})`,
      `Agreed Pricing: ${client.pricing}`,
      `Cancellation Reason: ${reason}`,
      `Settlement Policy: ${settlementType}${settlementAmount ? ` (${settlementAmount})` : ''}`,
      syncSheet ? `Master Google Sheet row status will be marked 'Cancelled'` : 'Google Sheet status untouched',
      cleanCalendar ? `${client.milestones?.length || 0} Google Calendar milestone events will be archived/flagged` : 'Google Calendar events untouched',
    ];

    onRequestConfirmation({
      title: `Confirm Order Cancellation for ${client.name}`,
      description: 'This is an irreversible operational status change. The campaign will transition to Cancelled in the staging pipeline and all automations will be halted:',
      affectedItems,
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await onConfirmCancellation(client, details, cleanCalendar, syncSheet);
          onClose();
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Process Order Cancellation</h3>
              <p className="text-xs text-slate-400">
                Cancel campaign contract for <span className="text-slate-200 font-medium">[{client.id}] {client.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Order Summary Strip */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg text-slate-300">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Current Stage</span>
              <span className="font-semibold text-amber-400">{client.stage || client.status}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Contract Value</span>
              <span className="font-mono text-emerald-400 font-semibold">{client.pricing}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Active Milestones</span>
              <span className="font-mono text-slate-200">{client.milestones?.length || 0} scheduled</span>
            </div>
          </div>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Cancellation Reason <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer min-h-[38px]"
              required
            >
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Settlement / Financial Resolution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Financial Settlement Policy <span className="text-rose-400">*</span>
              </label>
              <select
                value={settlementType}
                onChange={(e) => setSettlementType(e.target.value as CancellationDetails['settlementType'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer min-h-[38px]"
                required
              >
                {SETTLEMENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Settlement / Refund Amount (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. $1,500 refunded"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 min-h-[38px]"
              />
            </div>
          </div>

          {/* Detailed Internal Notes */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Cancellation Notes & Exit Protocol
            </label>
            <textarea
              rows={3}
              placeholder="Document conversation recap, client feedback, or future re-engagement notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none font-sans"
            />
          </div>

          {/* Operational Automations Checklist */}
          <div className="space-y-2 p-3 bg-slate-950/40 border border-slate-800/60 rounded-lg">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
              Automated Operations Sync
            </span>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanCalendar}
                onChange={(e) => setCleanCalendar(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 focus:ring-offset-0"
              />
              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Flag or archive scheduled Google Calendar milestone deadlines as [CANCELLED]</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={syncSheet}
                onChange={(e) => setSyncSheet(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 focus:ring-offset-0"
              />
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Update Master Google Sheet (Client_Database_PodConnect_Master) row to 'Cancelled'</span>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              Keep Order Active
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shadow-lg shadow-rose-950/50"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Processing...' : 'Proceed to Confirmation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
