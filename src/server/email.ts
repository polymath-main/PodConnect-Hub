export class EmailService {
  // Rate limiter: sliding window, 10 dispatches/min per tenant
  private rateLimiter: Map<string, number[]> = new Map();

  public checkRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute
    const maxDispatches = 10;
    const timestamps = (this.rateLimiter.get(tenantId) || []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= maxDispatches) {
      return false;
    }

    timestamps.push(now);
    this.rateLimiter.set(tenantId, timestamps);
    return true;
  }

  /**
   * Send an email via the Gmail API using the client's OAuth access token.
   * Supports conversation threading via threadId and RFC 2822 In-Reply-To / References.
   */
  public async sendViaGmail(params: {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
    fromName?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const raw = this.encodeEmail(params);

    const payload: { raw: string; threadId?: string } = { raw };
    if (params.threadId) {
      payload.threadId = params.threadId;
    }

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gmail API send failed (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    return {
      messageId: data.id,
      threadId: data.threadId || params.threadId || data.id,
    };
  }

  /**
   * Encode RFC 2822 formatted message into base64url.
   * Injects In-Reply-To and References headers if provided for Gmail conversation threading.
   */
  public encodeEmail(params: {
    to: string;
    subject: string;
    body: string;
    fromName?: string;
    inReplyTo?: string;
    references?: string;
  }): string {
    const utf8Subject = `=?utf-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`;
    const messageParts = [
      `To: ${params.to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
    ];

    if (params.inReplyTo) {
      const formatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`;
      messageParts.push(`In-Reply-To: ${formatted}`);
    }

    if (params.references) {
      const formatted = params.references.startsWith('<') ? params.references : `<${params.references}>`;
      messageParts.push(`References: ${formatted}`);
    } else if (params.inReplyTo) {
      const formatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`;
      messageParts.push(`References: ${formatted}`);
    }

    messageParts.push('', params.body);

    const message = messageParts.join('\r\n');
    return Buffer.from(message, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

export const emailService = new EmailService();
