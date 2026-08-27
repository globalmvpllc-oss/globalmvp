import 'server-only';
import { Polar } from '@polar-sh/sdk';
import { redactSecrets } from '@/lib/api-error';

/**
 * The Polar client.
 *
 * `server-only` at the top is deliberate: importing this from a client
 * component becomes a build error rather than a token shipped to a browser.
 * POLAR_ACCESS_TOKEN and POLAR_WEBHOOK_SECRET are read here and nowhere near
 * the client bundle.
 */

/** Raised when billing is called before the environment is configured. */
export class BillingNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Billing is not configured: ${missing} is not set`);
    this.name = 'BillingNotConfiguredError';
  }
}

/**
 * Which Polar environment to talk to.
 *
 * Defaults to sandbox. A missing variable should send test traffic to the test
 * environment, never to production billing.
 */
function polarServer(): 'sandbox' | 'production' {
  return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';
}

export function getPolarClient(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new BillingNotConfiguredError('POLAR_ACCESS_TOKEN');

  return new Polar({ accessToken, server: polarServer() });
}

export function getWebhookSecret(): string {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) throw new BillingNotConfiguredError('POLAR_WEBHOOK_SECRET');
  return secret;
}

/**
 * Absolute base URL for redirect targets.
 *
 * Polar needs a URL it can send the browser back to, so a relative path is not
 * an option. NEXTAUTH_URL is already required by the auth setup, which makes it
 * the one origin the deployment is guaranteed to agree on.
 */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) throw new BillingNotConfiguredError('NEXTAUTH_URL');
  return configured.replace(/\/+$/, '');
}

/**
 * A safe one-line summary of a Polar SDK error, for server logs only.
 *
 * The SDK throws errors carrying a `.name`, a `.statusCode` and a `.body` (often
 * a JSON validation payload naming the offending field). None of that holds our
 * access token, but the body is passed through redactSecrets as a belt-and-
 * braces measure before it is logged, and the result is truncated. Never
 * returned to the client — the route still answers with a generic message.
 *
 * The point is diagnosability: a production "Could not start checkout" should
 * leave a precise reason in the server logs (e.g. an invalid customer email, or
 * a product id that belongs to the other Polar environment) rather than a bare
 * stack trace.
 */
export function describePolarError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? 'unknown error');
  const e = error as {
    name?: unknown;
    statusCode?: unknown;
    status?: unknown;
    message?: unknown;
    body?: unknown;
  };
  const name = typeof e.name === 'string' ? e.name : 'Error';
  const status =
    typeof e.statusCode === 'number' ? e.statusCode : typeof e.status === 'number' ? e.status : undefined;

  let body = '';
  if (typeof e.body === 'string') body = e.body;
  else if (e.body != null) {
    try {
      body = JSON.stringify(e.body);
    } catch {
      body = '';
    }
  } else if (typeof e.message === 'string') body = e.message;

  const snippet = redactSecrets(body).replace(/\s+/g, ' ').slice(0, 500);
  return `${name}${status ? ` status=${status}` : ''}${snippet ? ` detail=${snippet}` : ''}`;
}
