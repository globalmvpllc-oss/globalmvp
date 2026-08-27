import 'server-only';
import { Resend } from 'resend';

/**
 * Transactional auth emails, via Resend.
 *
 * `server-only`: importing this from a client component is a build error, not an
 * API key in the browser bundle. Each function sends the link and nothing else —
 * never the existing password, never a temporary one. A failure is logged
 * WITHOUT the recipient address, so the server logs are not themselves a list of
 * who asked for a reset.
 *
 * When RESEND_API_KEY is unset the send is skipped silently. The calling route
 * still returns its normal response, so an unconfigured deployment cannot be
 * told apart from a configured one by probing.
 */

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function getFrom(): string {
  return process.env.RESEND_FROM_EMAIL || 'CorpControl <no-reply@corpcontrol.net>';
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error('[reset-email] RESEND_API_KEY is not set; reset email not sent');
    return;
  }
  try {
    await resend.emails.send({
      from: getFrom(),
      to,
      subject: 'Reset your CorpControl password',
      text:
        `We received a request to reset your CorpControl password.\n\n` +
        `Open this link to choose a new one (it expires in one hour):\n${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email — your password stays the same.`,
      html:
        `<p>We received a request to reset your CorpControl password.</p>` +
        `<p><a href="${resetUrl}">Choose a new password</a> — this link expires in one hour.</p>` +
        `<p>If you did not request this, you can ignore this email. Your password stays the same.</p>`,
    });
  } catch (error) {
    console.error('[reset-email] password reset send failed', {
      name: (error as { name?: string })?.name,
    });
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error('[reset-email] RESEND_API_KEY is not set; verification email not sent');
    return;
  }
  try {
    await resend.emails.send({
      from: getFrom(),
      to,
      subject: 'Verify your CorpControl email',
      text:
        `Welcome to CorpControl.\n\n` +
        `Confirm your email address by opening this link (it expires in 24 hours):\n${verifyUrl}\n\n` +
        `If you did not create an account, you can ignore this email.`,
      html:
        `<p>Welcome to CorpControl.</p>` +
        `<p><a href="${verifyUrl}">Verify your email</a> — this link expires in 24 hours.</p>` +
        `<p>If you did not create an account, you can ignore this email.</p>`,
    });
  } catch (error) {
    console.error('[reset-email] verification send failed', {
      name: (error as { name?: string })?.name,
    });
  }
}
