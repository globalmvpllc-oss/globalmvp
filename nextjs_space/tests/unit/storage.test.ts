import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const calls: any[] = [];
vi.mock('@vercel/blob', () => ({
  put: async (pathname: string, _body: unknown, options: any) => {
    calls.push({ op: 'put', pathname, options });
    return { url: `https://abc.public.blob.vercel-storage.com/${pathname}-x1`, pathname };
  },
  get: async () => null,
  del: async (target: string, options: any) => { calls.push({ op: 'del', target, options }); },
}));

import {
  environmentPrefix,
  safeSegment,
  stockPath,
  isPublicBlobUrl,
  putPublicFile,
  putPrivateFile,
  publicToken,
  privateToken,
  isStorageNotConfigured,
  StorageNotConfiguredError,
} from '@/lib/storage';

const saved = { ...process.env };
beforeEach(() => {
  calls.length = 0;
  process.env.BLOB_READ_WRITE_TOKEN = 'public-test-token';
  delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  delete process.env.VERCEL_ENV;
});
afterEach(() => { process.env = { ...saved }; });

describe('paths stay inside the company folder', () => {
  it('strips separators and dots from segments', () => {
    expect(safeSegment('../../etc/passwd')).not.toContain('/');
    expect(safeSegment('..')).not.toMatch(/^\./);
    expect(safeSegment('')).toBe('_');
  });

  it('builds a company-scoped KolayStok path', () => {
    expect(stockPath('cmp_1', 'urun', 'PZ001.webp')).toBe('kolaystok/cmp_1/urun/PZ001.webp');
    expect(stockPath('cmp_1', '../cmp_2/x')).toBe('kolaystok/cmp_1/__cmp_2_x');
  });

  it('a hostile company id cannot escape its folder', () => {
    const path = stockPath('../other', 'a.xlsx');
    expect(path.split('/')).toHaveLength(3);
    expect(path.startsWith('kolaystok/')).toBe(true);
  });
});

describe('preview files never mix with production files', () => {
  it('prefixes preview deployments only', () => {
    expect(environmentPrefix({ VERCEL_ENV: 'preview' })).toBe('preview/');
    expect(environmentPrefix({ VERCEL_ENV: 'production' })).toBe('');
    expect(environmentPrefix({})).toBe('');
  });
});

describe('public and private stores are kept apart', () => {
  it('product photos go to the public store with an unguessable suffix', async () => {
    const url = await putPublicFile('kolaystok/c/urun/a.webp', Buffer.from('x'), 'image/webp');
    expect(calls[0].options.access).toBe('public');
    expect(calls[0].options.addRandomSuffix).toBe(true);
    expect(calls[0].options.token).toBe('public-test-token');
    expect(isPublicBlobUrl(url)).toBe(true);
  });

  it('a private write without a private store fails, never falling back to public', async () => {
    await expect(putPrivateFile('kolaystok/c/yedek.xlsx', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageNotConfiguredError);
    expect(calls).toHaveLength(0);
  });

  it('a private write uses the private token and private access', async () => {
    process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = 'private-test-token';
    const key = await putPrivateFile('kolaystok/c/yedek.xlsx', Buffer.from('x'), 'text/plain');
    expect(key).toBe('kolaystok/c/yedek.xlsx');
    expect(calls[0].options.access).toBe('private');
    expect(calls[0].options.token).toBe('private-test-token');
  });

  it('names the missing variable', () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try { publicToken(); } catch (e) { expect(isStorageNotConfigured(e)).toBe(true); expect((e as Error).message).toContain('BLOB_READ_WRITE_TOKEN'); }
    try { privateToken(); } catch (e) { expect((e as Error).message).toContain('BLOB_PRIVATE_READ_WRITE_TOKEN'); }
    expect(isStorageNotConfigured(new Error('x'))).toBe(false);
  });
});

describe('only Vercel Blob public addresses are redirected to', () => {
  it('accepts the public Blob host over https', () => {
    expect(isPublicBlobUrl('https://abc.public.blob.vercel-storage.com/kolaystok/c/urun/a.webp')).toBe(true);
  });
  it('refuses other hosts, plain http, look-alikes and empty values', () => {
    expect(isPublicBlobUrl('https://evil.example.com/a.webp')).toBe(false);
    expect(isPublicBlobUrl('http://abc.public.blob.vercel-storage.com/a.webp')).toBe(false);
    expect(isPublicBlobUrl('https://public.blob.vercel-storage.com.evil.net/a')).toBe(false);
    expect(isPublicBlobUrl('kolaystok/c/urun/a.webp')).toBe(false);
    expect(isPublicBlobUrl(null)).toBe(false);
  });
});
