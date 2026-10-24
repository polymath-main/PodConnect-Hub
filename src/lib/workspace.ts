import { getAccessToken } from './firebase';
import { Client, Milestone } from '../types';

/**
 * Base helper for authorized Google Workspace fetch
 */
async function authorizedFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google Workspace access token unavailable. Please sign in with Google first.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Google API error (${response.status}): ${response.statusText}`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Helper to encode email string into base64url RFC 2822 format for Gmail API
 */
function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ==========================================
// 1. GOOGLE DOCS INTEGRATION
// ==========================================

export interface GoogleDocResult {
  documentId: string;
  documentUrl: string;
  title: string;
}

export async function createGoogleDoc(title: string, markdownContent: string): Promise<GoogleDocResult> {
  // Step 1: Create empty document
  const createRes = await authorizedFetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  const documentId = createRes.documentId;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Step 2: Insert text content
  const cleanText = markdownContent.replace(/\r\n/g, '\n');
  if (cleanText) {
    await authorizedFetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: cleanText + '\n',
            },
          },
        ],
      }),
    });
  }

  return { documentId, documentUrl, title };
}

/**
 * Generates Conversation_Export_<ClientName> Google Doc
 */
export async function createConversationExportDoc(
  clientName: string,
  rawTranscript: string,
  extractedDetails: any
): Promise<GoogleDocResult> {
  const title = `Conversation_Export_${clientName.replace(/\s+/g, '_')}`;
  const content = `# PodConnect Hub AI — Client Onboarding & Conversation Archive
Client Name: ${clientName}
Client ID: ${extractedDetails.clientId || 'C001'}
Archived Date: ${new Date().toLocaleDateString()}
Agreement Status: Confirmed & Structured

---
1. EXECUTIVE AGREEMENT SUMMARY
- Target Niche: ${extractedDetails.niche}
- Preferred Platform: ${extractedDetails.platform}
- Selected Package: ${extractedDetails.package}
- Agreed Pricing: ${extractedDetails.pricing}
- Contract Timeline: ${extractedDetails.contractDays || 120} Days

---
2. RAW ONBOARDING CHAT & AGREEMENT TRANSCRIPT
${rawTranscript}

---
Archived automatically by PodConnect Hub AI.
`;
  return createGoogleDoc(title, content);
}

/**
 * Generates Client_Requirements_<ClientName> Google Doc
 */
export async function createClientRequirementsDoc(
  clientName: string,
  client: Partial<Client>
): Promise<GoogleDocResult> {
  const title = `Client_Requirements_${clientName.replace(/\s+/g, '_')}`;
  const content = `# PodConnect Hub AI — Client Requirements & Messaging Profile
Client: ${clientName} (ID: ${client.id || 'C001'})
Target Platforms: ${client.platform || 'Apple Podcasts, YouTube, Spotify'}
Primary Niche: ${client.niche}
Subscriber Minimum Threshold: ${client.minSubscribers || 1000}+

---
1. CORE THOUGHT LEADERSHIP MESSAGE PILLARS
${(client.messagePillars || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

---
2. CREDIBILITY ASSETS & TRACK RECORD
${(client.credibilityAssets || []).map((c, i) => `• ${c}`).join('\n')}

---
3. SAMPLE PITCH ANGLE
${client.samplePitchAngle || 'High-value founder and growth operator insights for niche audiences.'}

---
Generated automatically by PodConnect Hub AI.
`;
  return createGoogleDoc(title, content);
}

/**
 * Generates Outreach_Strategy_<ClientName> Google Doc
 */
export async function createOutreachStrategyDoc(
  clientName: string,
  client: Partial<Client>,
  pitches: any[]
): Promise<GoogleDocResult> {
  const title = `Outreach_Strategy_${clientName.replace(/\s+/g, '_')}`;
  const pitchSections = pitches
    .map(
      (p, i) => `### Lead #${i + 1}: ${p.showName} (Host: ${p.hostName || 'Host'})
Recipient Email: ${p.recipientEmail || 'Contact show directly'}
Subject: ${p.subject}

${p.body}
`
    )
    .join('\n---\n');

  const content = `# PodConnect Hub AI — Dedicated Outreach Strategy & Pitches
Client: ${clientName} (ID: ${client.id || 'C001'})
Strategy Formulated: ${new Date().toLocaleDateString()}
Total Target Leads: ${pitches.length}

---
${pitchSections || 'No pitches exported yet.'}

---
Generated by PodConnect Hub AI.
`;
  return createGoogleDoc(title, content);
}

// ==========================================
// 2. GOOGLE SHEETS MASTER DATABASE
// ==========================================

export const MASTER_SHEET_TITLE = 'Client_Database_PodConnect_Master';

export interface MasterSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

export async function findOrCreateMasterSheet(): Promise<MasterSheetResult> {
  // Search Drive for existing sheet
  const query = encodeURIComponent(`name = '${MASTER_SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
  const searchRes = await authorizedFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`);

  if (searchRes.files && searchRes.files.length > 0) {
    const existing = searchRes.files[0];
    return {
      spreadsheetId: existing.id,
      spreadsheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
    };
  }

  // Create new spreadsheet
  const createRes = await authorizedFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: MASTER_SHEET_TITLE },
      sheets: [
        {
          properties: {
            title: 'Master Clients',
            gridProperties: { frozenRowCount: 1 },
          },
        },
      ],
    }),
  });

  const spreadsheetId = createRes.spreadsheetId;
  const spreadsheetUrl = createRes.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write header row
  const headers = [
    'Client ID',
    'Client Name',
    'Platform',
    'Niche',
    'Package',
    'Pricing',
    'Start Date',
    'End Date',
    'Status',
    'Requirements Doc',
    'Conversation Doc',
    'Outreach Doc',
    'Last Synchronized',
  ];

  await authorizedFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Master%20Clients!A1:M1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({
      range: 'Master Clients!A1:M1',
      majorDimension: 'ROWS',
      values: [headers],
    }),
  });

  return { spreadsheetId, spreadsheetUrl };
}

export async function syncClientToMasterSheet(
  spreadsheetId: string,
  client: Client
): Promise<{ updatedRange: string }> {
  // Build row values with Google Sheets HYPERLINK formula
  const reqLink = client.docs.requirementsDocUrl
    ? `=HYPERLINK("${client.docs.requirementsDocUrl}", "Requirements Doc")`
    : 'Pending';
  const convLink = client.docs.conversationExportUrl
    ? `=HYPERLINK("${client.docs.conversationExportUrl}", "Conversation Doc")`
    : 'Pending';
  const outLink = client.docs.outreachStrategyDocUrl
    ? `=HYPERLINK("${client.docs.outreachStrategyDocUrl}", "Outreach Doc")`
    : 'Pending';

  const row = [
    client.id,
    client.name,
    client.platform,
    client.niche,
    client.package,
    client.pricing,
    client.startDate,
    client.endDate,
    client.status,
    reqLink,
    convLink,
    outLink,
    new Date().toLocaleString(),
  ];

  // Append row
  const appendRes = await authorizedFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Master%20Clients!A:M:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  return { updatedRange: appendRes.updates?.updatedRange || 'Master Clients!A:M' };
}

// ==========================================
// 3. GOOGLE CALENDAR MILESTONE AUTOMATION
// ==========================================

export async function scheduleClientMilestonesOnCalendar(
  client: Client
): Promise<Milestone[]> {
  const updatedMilestones: Milestone[] = [];

  for (const m of client.milestones) {
    // Construct all-day event
    const eventPayload = {
      summary: `[${client.id}] ${client.name} — ${m.title}`,
      description: `PodConnect Hub Project Milestone\nClient: ${client.name}\nNiche: ${client.niche}\nPackage: ${client.package}\nTimeline Phase: Day ${m.dayOffset}`,
      start: {
        date: m.dueDate,
      },
      end: {
        date: m.dueDate,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 1440 }, // 1 day before
          { method: 'email', minutes: 2880 }, // 2 days before
        ],
      },
    };

    try {
      const eventRes = await authorizedFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        body: JSON.stringify(eventPayload),
      });

      updatedMilestones.push({
        ...m,
        calendarEventId: eventRes.id,
        calendarLink: eventRes.htmlLink,
      });
    } catch (err) {
      console.error(`Failed to schedule milestone "${m.title}":`, err);
      updatedMilestones.push(m);
    }
  }

  return updatedMilestones;
}

// ==========================================
// 4. GMAIL API DISPATCH & DRAFTS
// ==========================================

export async function sendGmailPitch(
  to: string,
  subject: string,
  body: string
): Promise<{ messageId: string; threadId: string }> {
  const rfcEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  const raw = encodeBase64Url(rfcEmail);

  const res = await authorizedFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });

  return { messageId: res.id, threadId: res.threadId };
}

export async function createGmailDraft(
  to: string,
  subject: string,
  body: string
): Promise<{ draftId: string }> {
  const rfcEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  const raw = encodeBase64Url(rfcEmail);

  const res = await authorizedFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    body: JSON.stringify({
      message: { raw },
    }),
  });

  return { draftId: res.id };
}
