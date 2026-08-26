import 'server-only';
import { Polar } from '@polar-sh/sdk';

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
