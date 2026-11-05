import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * "Şirket bilgileri" in KolayStok settings (5 Nov 2026): the same Company
 * record as CorpControl's settings, editable by the account only, and the
 * quote PDF header — with WebP logos turned into PNG so they actually show.
 */

const state = vi.hoisted(() => ({
  actor: { companyId: 'c1', role: 'manager', kind: 'user', name: 'Sahip', userId: 'u1', staffId: null, email: null } as any,
  company: {} as Record<string, unknown>,
  lastUpdate: null as any,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stock/actor', async () => {
  const { can } = await vi.importActual<typeof import('@/lib/stock/rules')>('@/lib/stock/rules');
  const { NextResponse } = await import('next/server');
  return {
    requireStockActor: async (permission: any) =>
      can(state.actor.role, permission) ? { actor: state.actor, error: null } : { actor: null, error: NextResponse.json({ code: 'STOCK_FORBIDDEN' }, { status: 403 }) },
  };
});
vi.mock('@/lib/db', () => ({
  prisma: {
    company: {
      findUnique: async () => ({ ...state.company }),
      update: async ({ where, data }: any) => {
        state.lastUpdate = { where, data };
        Object.assign(state.company, data);
        return { ...state.company };
      },
    },
  },
}));

import { GET, PUT } from '@/app/api/stock/company/route';
import { pdfReadyLogo } from '@/lib/stock/quotes';

const root = path.resolve(__dirname, '../..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf-8');
const put = (body: unknown) => PUT(new Request('http://x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

beforeEach(() => {
  state.actor = { companyId: 'c1', role: 'manager', kind: 'user', name: 'Sahip', userId: 'u1', staffId: null, email: null };
  state.company = { name: 'Eski Ad', logoUrl: PNG_1PX, address: 'Eski adres', city: null, postalCode: null, phone: '0212', email: 'eski@firma.com', taxOffice: null, taxNumber: null };
  state.lastUpdate = null;
});

describe('company details: same record, account only', () => {
  it('the owner saves the fields onto this company; an empty field clears it; the logo is left alone unless sent', async () => {
    const res = await put({ name: 'Karadağ Metal', address: 'Sakarya OSB', city: 'Sakarya', postalCode: '54000', phone: '', email: 'INFO@KARADAG.COM', taxOffice: 'Adapazarı', taxNumber: '1234567890' });
    expect(res.status).toBe(200);
    expect(state.lastUpdate.where).toEqual({ id: 'c1' });
    expect(state.lastUpdate.data).toEqual({ name: 'Karadağ Metal', address: 'Sakarya OSB', city: 'Sakarya', postalCode: '54000', phone: null, email: 'info@karadag.com', taxOffice: 'Adapazarı', taxNumber: '1234567890' });
    expect(state.company.logoUrl).toBe(PNG_1PX);
  });

  it('a new logo is saved; null removes it; an SVG or a link is refused', async () => {
    expect((await put({ name: 'A', logoUrl: null })).status).toBe(200);
    expect(state.company.logoUrl).toBeNull();
    expect((await put({ name: 'A', logoUrl: PNG_1PX })).status).toBe(200);
    expect(state.company.logoUrl).toBe(PNG_1PX);
    for (const bad of ['data:image/svg+xml;base64,PHN2Zy8+', 'https://evil.example.com/x.png']) {
      const res = await put({ name: 'A', logoUrl: bad });
      expect(res.status, bad).toBe(400);
      expect((await res.json()).field).toBe('logoUrl');
    }
  });

  it('a missing name or a bad email is refused and names the field', async () => {
    const noName = await put({ name: '  ' });
    expect(noName.status).toBe(400);
    expect((await noName.json()).field).toBe('name');
    const badEmail = await put({ name: 'A', email: 'yok' });
    expect((await badEmail.json()).field).toBe('email');
    expect(state.lastUpdate).toBeNull();
  });

  it('a PIN manager can read but not change it; staff and the accountant reach nothing', async () => {
    state.actor = { ...state.actor, kind: 'staff', staffId: 's1', userId: null };
    expect((await GET()).status).toBe(200);
    expect((await (await GET()).json()).canEdit).toBe(false);
    expect((await put({ name: 'X' })).status).toBe(403);
    state.actor = { ...state.actor, role: 'staff' };
    expect((await GET()).status).toBe(403);
    state.actor = { ...state.actor, role: 'viewer', kind: 'user' };
    expect((await put({ name: 'X' })).status).toBe(403);
    expect(state.lastUpdate).toBeNull();
  });

  it('the settings screen shows the section to the account only', () => {
    expect(src('app/kolaystok/app/settings/page.tsx')).toContain('{settings?.canChangeMode && <CompanyInfo />}');
    const section = src('components/kolaystok/company-info.tsx');
    for (const f of ["'name'", "'address'", "'phone'", "'email'", "'taxOffice'", "'taxNumber'"]) expect(section).toContain(f);
    expect(section).toContain('optimizeLogo(file)');
    expect(section).toContain("fetch('/api/stock/company'");
  });
});

describe('the quote PDF shows the logo', () => {
  it('a WebP logo (what browsers save) becomes PNG for the PDF; PNG and JPEG pass through', async () => {
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#0F766E' } }).webp().toBuffer();
    const out = await pdfReadyLogo(`data:image/webp;base64,${webp.toString('base64')}`);
    expect(out?.startsWith('data:image/png;base64,')).toBe(true);
    expect(await pdfReadyLogo(PNG_1PX)).toBe(PNG_1PX);
    expect(await pdfReadyLogo(null)).toBeNull();
    expect(await pdfReadyLogo('data:image/webp;base64,bm90IGFuIGltYWdl')).toBeNull();
  });

  it('the quote PDF uses it', () => {
    expect(src('lib/stock/quotes.ts')).toContain('logoUrl: await pdfReadyLogo(loaded.logoUrl)');
  });
});
