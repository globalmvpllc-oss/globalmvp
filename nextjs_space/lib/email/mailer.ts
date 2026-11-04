import 'server-only';
import { Resend } from 'resend';

/**
 * Sends one email through Resend.
 *
 * Never throws. A failure is logged without the recipient address, so the
 * logs are not a list of customers. When RESEND_API_KEY is unset nothing is
 * sent and the caller is told so ('not_configured').
 */
export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'failed' };

export interface MailAttachment {
  filename: string;
  content: Buffer;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Replies go to the business, not to the no-reply address. */
  replyTo?: string | null;
  /** Shown as the sender name: "Acme Ltd via CorpControl". */
  senderName?: string | null;
  attachments?: MailAttachment[];
  /** Resend idempotency key, so a retried request is not sent twice. */
  idempotencyKey?: string;
  /**
   * A different sender address (e.g. stok@<customer domain>, verified in
   * Resend, or stok@corpcontrol.net). Only ever set by server code.
   */
  fromEmail?: string | null;
}

function fromAddress(senderName?: string | null, fromEmail?: string | null): string {
  const configured = fromEmail
    ? `CorpControl <${fromEmail.replace(/[<>"\r\n\s]/g, '')}>`
    : process.env.RESEND_FROM_EMAIL || 'CorpControl <no-reply@corpcontrol.net>';
  if (!senderName) return configured;
  // Keep the configured address, replace only the display name. Characters
  // that would break the header are dropped from the name.
  const match = configured.match(/<([^>]+)>/);
  const address = match ? match[1] : configured;
  const safeName = senderName.replace(/["<>\r\n]/g, '').slice(0, 80).trim();
  return safeName ? `"${safeName} via CorpControl" <${address}>` : configured;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(input: MailInput): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('[mailer] RESEND_API_KEY is not set; email not sent');
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send(
      {
        from: fromAddress(input.senderName, input.fromEmail),
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo || undefined,
        attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    );
    if (error) {
      console.error('[mailer] send rejected', { name: (error as { name?: string })?.name });
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    console.error('[mailer] send failed', { name: (error as { name?: string })?.name });
    return { ok: false, reason: 'failed' };
  }
}
