import { put, get, del } from '@vercel/blob';

/**
 * File storage on Vercel Blob — the only place the app writes files.
 *
 * Two stores, because a Blob store is either public or private as a whole:
 *
 *   - public  (BLOB_READ_WRITE_TOKEN, store "corpcontrol-dosyalar"):
 *     KolayStok product photos only. Each file gets a random suffix, so the
 *     address cannot be guessed, but anyone holding it can open it.
 *   - private (BLOB_PRIVATE_READ_WRITE_TOKEN): stock backups and any financial
 *     document. Never reachable by address; served only through our own
 *     routes after the sign-in and company checks.
 *
 * A private write with no private store configured throws
 * StorageNotConfiguredError — it never falls back to the public store.
 *
 * Preview deployments share these stores with production, so their files go
 * under "preview/" and cannot overwrite production files.
 */

export class StorageNotConfiguredError extends Error {
  constructor(readonly variable: string) {
    super(`File storage is not configured (${variable} is missing).`);
    this.name = 'StorageNotConfiguredError';
  }
}

export function isStorageNotConfigured(error: unknown): error is StorageNotConfiguredError {
  return error instanceof StorageNotConfiguredError;
}

type Env = Record<string, string | undefined>;

export function publicToken(env: Env = process.env): string {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new StorageNotConfiguredError('BLOB_READ_WRITE_TOKEN');
  return token;
}

export function privateToken(env: Env = process.env): string {
  const token = env.BLOB_PRIVATE_READ_WRITE_TOKEN?.trim();
  if (!token) throw new StorageNotConfiguredError('BLOB_PRIVATE_READ_WRITE_TOKEN');
  return token;
}

/** "preview/" on Vercel preview deployments, nothing elsewhere. */
export function environmentPrefix(env: Env = process.env): string {
  return env.VERCEL_ENV === 'preview' ? 'preview/' : '';
}

/** Path segments are kept to safe characters so one company cannot write into another's folder. */
export function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return cleaned.slice(0, 120) || '_';
}

/** Where a company's KolayStok files live. */
export function stockPath(companyId: string, ...parts: string[]): string {
  return [`${environmentPrefix()}kolaystok`, safeSegment(companyId), ...parts.map(safeSegment)].join('/');
}

/**
 * Writes a public file and returns its address (stored as-is, e.g. in
 * StockProduct.photoKey).
 */
export async function putPublicFile(pathname: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  const result = await put(pathname, Buffer.from(body), {
    access: 'public',
    contentType,
    addRandomSuffix: true,
    token: publicToken(),
  });
  return result.url;
}

/** Writes a private file and returns its pathname (stored as-is, e.g. in StockBackup.s3Key). */
export async function putPrivateFile(pathname: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  const token = privateToken();
  const result = await put(pathname, Buffer.from(body), {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  return result.pathname;
}

/** Reads a private file; null when it does not exist. */
export async function readPrivateFile(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
  const result = await get(pathname, { access: 'private', token: privateToken(), useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size };
}

export async function deletePrivateFile(pathname: string): Promise<void> {
  await del(pathname, { token: privateToken() });
}

export async function deletePublicFile(url: string): Promise<void> {
  await del(url, { token: publicToken() });
}

/** Only addresses on Vercel Blob's public host are ever redirected to. */
export function isPublicBlobUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}
