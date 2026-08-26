import { describe, it, expect } from 'vitest';

/**
 * Security headers are configuration rather than code, so nothing else in the
 * suite would notice if one were dropped in a future edit of next.config.js.
 *
 * This pins the two decisions that are easiest to undo by accident: that the
 * four pre-existing headers survive alongside the new one, and that fullscreen
 * is deliberately *not* in the Permissions-Policy.
 */

// next.config.js is CommonJS; require keeps this independent of ESM interop.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../../next.config.js');

async function securityHeaders(): Promise<Array<{ key: string; value: string }>> {
  const routes = await nextConfig.headers();
  return routes[0].headers;
}

async function permissionsPolicy(): Promise<string> {
  const header = (await securityHeaders()).find((h) => h.key === 'Permissions-Policy');
  if (!header) throw new Error('Permissions-Policy header is missing');
  return header.value;
}

describe('existing security headers still ship', () => {
  it.each([
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
  ])('%s is present', async (key) => {
    expect((await securityHeaders()).map((h) => h.key)).toContain(key);
  });

  it('keeps HSTS at its configured max-age', async () => {
    const hsts = (await securityHeaders()).find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts?.value).toContain('max-age=63072000');
  });

  it('applies to every path', async () => {
    const routes = await nextConfig.headers();
    expect(routes[0].source).toBe('/:path*');
  });
});

describe('Permissions-Policy', () => {
  it('is sent', async () => {
    expect((await securityHeaders()).map((h) => h.key)).toContain('Permissions-Policy');
  });

  it.each([
    'camera',
    'microphone',
    'geolocation',
    'payment',
    'usb',
    'accelerometer',
    'gyroscope',
    'magnetometer',
  ])('disables %s with an empty allowlist', async (feature) => {
    expect(await permissionsPolicy()).toContain(`${feature}=()`);
  });

  it('does not disable fullscreen', async () => {
    // Nothing uses it today, but the browser's own print preview and chart
    // interactions may, and disabling it buys nothing.
    expect(await permissionsPolicy()).not.toContain('fullscreen');
  });

  it('grants no origin any of the listed features', async () => {
    // An allowlist containing anything at all — 'self', a domain, * — would be
    // a materially different policy from the one intended.
    expect(await permissionsPolicy()).not.toMatch(/=\((?!\))/);
  });
});

describe('CSP remains deliberately absent', () => {
  it('sets neither Content-Security-Policy nor its Report-Only form', async () => {
    // Adding one is its own task: invoice templates use inline <style>, logos
    // are data: URLs and the print flow writes into a new window, so a wrong
    // policy breaks invoicing silently.
    const keys = (await securityHeaders()).map((h) => h.key);
    expect(keys).not.toContain('Content-Security-Policy');
    expect(keys).not.toContain('Content-Security-Policy-Report-Only');
  });
});
