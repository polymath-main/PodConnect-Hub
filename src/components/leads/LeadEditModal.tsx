import React, { useState } from 'react';
import { X, Save, Building2, Mail, Users, Tag, MapPin, Globe, FileText } from 'lucide-react';
import { StagedLead, Lead } from '../../types';
import { api } from '../../lib/api';

interface LeadEditModalProps {
  lead: StagedLead | Lead;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLead: Partial<StagedLead | Lead>) => Promise<void>;
}

export const LeadEditModal: React.FC<LeadEditModalProps> = ({
  lead,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const [formData, setFormData] = useState({
    showName: lead.showName || '',
    hostName: lead.hostName || '',
    email: lead.email || '',
    emailType: (lead.emailType || 'direct') as 'direct' | 'mailto' | 'inferred',
    emailConfidence: Math.round((lead.emailConfidence ?? 1.0) * 100),
    platform: lead.platform || 'Podcast',
    showUrl: lead.showUrl || '',
    subscribers: lead.subscribers || 0,
    niche: lead.niche || '',
    tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
    location: lead.location || '',
    notes: lead.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainCheckResult, setDomainCheckResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  const handleValidateDomain = async () => {
    if (!formData.email || !formData.email.includes('@')) {
      setDomainCheckResult({ valid: false, message: 'Please enter a valid email address with @' });
      return;
    }
    const domain = formData.email.split('@')[1]?.toLowerCase().trim();
    if (!domain || !domain.includes('.')) {
      setDomainCheckResult({ valid: false, message: 'Email domain has invalid format' });
      return;
    }

    setCheckingDomain(true);
    setDomainCheckResult(null);

    // Call server on-demand email discovery/domain check endpoint
    try {
      const data = await api.request<any>('/api/leads/discover-emails', {
        method: 'POST',
        body: JSON.stringify({ url: `https://${domain}`, hostName: formData.hostName }),
      });
      if (data && data.discovery) {
        const found = data.discovery.candidates?.find((c: any) => c.email.endsWith(`@${domain}`));
        if (found && found.domain_valid) {
          setDomainCheckResult({ valid: true, message: `Domain ${domain} is legitimate (${found.validation_reason})` });
        } else if (found && !found.domain_valid) {
          setDomainCheckResult({ valid: false, message: `Warning: ${found.validation_reason}` });
        } else {
          setDomainCheckResult({ valid: true, message: `Domain syntax valid (${domain})` });
        }
      } else {
        setDomainCheckResult({ valid: true, message: `Domain syntax valid (${domain})` });
      }
    } catch {
      setDomainCheckResult({ valid: true, message: `Domain syntax check passed (${domain})` });
    } finally {
      setCheckingDomain(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parsedTags = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSave({
        ...formData,
        tags: parsedTags,
        subscribers: Number(formData.subscribers),
        emailType: formData.emailType,
        emailConfidence: Math.max(0.1, Math.min(1.0, formData.emailConfidence / 100)),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">Edit Lead & Opportunity Details</h3>
              <p className="text-xs text-slate-400">
                Update show information, contact details, tags, and location before importing or pitching
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Show / Channel Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.showName}
                onChange={(e) => setFormData({ ...formData, showName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Host / Creator Name
              </label>
              <input
                type="text"
                value={formData.hostName}
                onChange={(e) => setFormData({ ...formData, hostName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Contact Email
                </label>
                {formData.email && (
                  <button
                    type="button"
                    onClick={handleValidateDomain}
                    disabled={checkingDomain}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline"
                  >
                    {checkingDomain ? 'Validating...' : 'Verify Domain'}
                  </button>
                )}
              </div>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setDomainCheckResult(null);
                }}
                placeholder="contact@show.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
              {domainCheckResult && (
                <p className={`text-[11px] mt-1 ${domainCheckResult.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {domainCheckResult.valid ? '✓ ' : '⚠ '} {domainCheckResult.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discovery Type & Confidence
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={formData.emailType}
                  onChange={(e) => setFormData({ ...formData, emailType: e.target.value as any })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="direct">Direct Verified</option>
                  <option value="mailto">Mailto Link</option>
                  <option value="inferred">Inferred Business</option>
                </select>
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={formData.emailConfidence}
                    onChange={(e) => setFormData({ ...formData, emailConfidence: Number(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-indigo-400 font-semibold w-9 text-right">
                    {formData.emailConfidence}%
                  </span>
                </div>
              </div>
            </div>


            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Subscribers / Listeners
              </label>
              <input
                type="number"
                min="0"
                value={formData.subscribers}
                onChange={(e) => setFormData({ ...formData, subscribers: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Platform</label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              >
                <option value="Podcast">Podcast (Apple/Spotify)</option>
                <option value="YouTube">YouTube Channel</option>
                <option value="Substack">Substack / Newsletter</option>
                <option value="LinkedIn">LinkedIn Creator</option>
                <option value="Media Outlet">Media Outlet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Target Niche</label>
              <input
                type="text"
                value={formData.niche}
                onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                placeholder="e.g. B2B SaaS, Web3, HealthTech"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" /> Show URL / Channel Link
            </label>
            <input
              type="url"
              value={formData.showUrl}
              onChange={(e) => setFormData({ ...formData, showUrl: e.target.value })}
              placeholder="https://..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> Categorization Tags (Comma Separated)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="SaaS, Founder, Tech, High-Engagement, US-Based"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Tags allow instant filtering in the Central Lead Bank for cross-client campaigns.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" /> Location / Region
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. San Francisco, CA or Global"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Internal Notes / Pain Points
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Key topic, host preferences, recent episode notes"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Lead Details
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
