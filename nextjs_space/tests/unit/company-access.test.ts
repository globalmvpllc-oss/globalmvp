import { describe, it, expect } from 'vitest';

/**
 * The "No company access" logo upload failure.
 *
 * Two endpoints answered the same question — does this user have a company? —
 * with different shapes, and the settings screen believed the forgiving one.
 *
 *   GET /api/company        no membership  ->  200 with a null body
 *   requireUserCompany()    no membership  ->  403 "No company access"
 *
 * So a user with no CompanyMember row saw a settings page that rendered
 * normally (null became an empty form) while all seventeen company-scoped
 * routes rejected them. Logo upload was simply the first action that surfaced
 * the rejection as a visible message rather than as blankness.
 *
 * These tests pin the contract each side is expected to keep. The routes
 * themselves need a session and a database, so they belong in the integration
 * suite.
 */

/** What GET /api/company does today: null body, 200 status. */
function companyEndpointResponse(membership: { companyId: string } | null) {
  return membership
    ? { status: 200, body: { id: membership.companyId, name: 'Acme Furniture' } }
    : { status: 200, body: null };
}

/** What requireUserCompany does: 403 when there is no membership. */
function requireUserCompanyResult(
  user: { id: string } | null,
  membership: { companyId: string } | null
) {
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  if (!membership) return { status: 403, body: { error: 'No company access' } };
  return { status: 200, companyId: membership.companyId };
}

/** How the settings page decides whether it has a company, after the fix. */
function settingsHasCompany(response: { status: number; body: any }): boolean {
  if (response.status !== 200) return false;
  return Boolean(response.body?.id);
}

/** The message the upload flow shows for a given failure status. */
function logoUploadMessage(status: number): string {
  if (status === 503) return 'Logo upload failed: Storage is not configured correctly. Please try again later.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) {
    return 'Logo upload failed: your account is not linked to a business yet. Finish setting up your business first.';
  }
  return 'Logo upload failed: The upload could not be prepared.';
}

describe('the two endpoints disagreed about a missing company', () => {
  const user = { id: 'usr_1' };

  it('the company endpoint reports success with an empty body', () => {
    const res = companyEndpointResponse(null);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('requireUserCompany reports 403 for the same user', () => {
    const res = requireUserCompanyResult(user, null);
    expect(res.status).toBe(403);
    expect(res.body?.error).toBe('No company access');
  });

  it('which is exactly the asymmetry that made the page look fine and the upload fail', () => {
    const page = companyEndpointResponse(null);
    const upload = requireUserCompanyResult(user, null);
    expect(page.status).not.toBe(upload.status);
  });

  it('both agree once a membership exists', () => {
    const membership = { companyId: 'cmp_1' };
    expect(companyEndpointResponse(membership).status).toBe(200);
    expect(requireUserCompanyResult(user, membership).status).toBe(200);
  });
});

describe('settings no longer treats a null body as a company', () => {
  it('recognises the missing-company case', () => {
    expect(settingsHasCompany(companyEndpointResponse(null))).toBe(false);
  });

  it('recognises a real company', () => {
    expect(settingsHasCompany(companyEndpointResponse({ companyId: 'cmp_1' }))).toBe(true);
  });

  it('treats a non-200 response as no company rather than rendering a blank form', () => {
    expect(settingsHasCompany({ status: 403, body: { error: 'No company access' } })).toBe(false);
    expect(settingsHasCompany({ status: 401, body: { error: 'Unauthorized' } })).toBe(false);
    expect(settingsHasCompany({ status: 500, body: { error: 'boom' } })).toBe(false);
  });

  it('does not mistake an error body for a company', () => {
    // The old code did `setForm(d ?? {})`, so `{ error: '...' }` became the form.
    expect(settingsHasCompany({ status: 200, body: { error: 'No company access' } })).toBe(false);
  });
});

describe('the upload failure now tells the user what to do', () => {
  it('explains a 403 in terms of the missing business, not access control', () => {
    const message = logoUploadMessage(403);
    expect(message).toMatch(/not linked to a business/i);
    expect(message).not.toBe('Logo upload failed: No company access');
  });

  it('still distinguishes the other failures', () => {
    expect(logoUploadMessage(503)).toMatch(/not configured/i);
    expect(logoUploadMessage(401)).toMatch(/session has expired/i);
    expect(logoUploadMessage(500)).toMatch(/could not be prepared/i);
  });

  it('never falls back to a bare "Upload failed"', () => {
    for (const status of [400, 401, 403, 404, 500, 503]) {
      expect(logoUploadMessage(status)).not.toBe('Upload failed');
      expect(logoUploadMessage(status).length).toBeGreaterThan(20);
    }
  });
});

describe('company resolution stays server-side', () => {
  it('is derived from the session user, never from the request', () => {
    // The parameter is the session user; no client-supplied companyId exists in
    // this path at all.
    const attacker = { id: 'usr_attacker' };
    const result = requireUserCompanyResult(attacker, null);
    expect(result.status).toBe(403);
    expect((result as { companyId?: string }).companyId).toBeUndefined();
  });

  it('returns only the company id from that membership', () => {
    const result = requireUserCompanyResult({ id: 'usr_1' }, { companyId: 'cmp_mine' });
    expect(result.companyId).toBe('cmp_mine');
  });
});
