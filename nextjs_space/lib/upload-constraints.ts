/**
 * Upload rules, shared by the browser and the API.
 *
 * These lived only on the server, so the browser happily uploaded a 20 MB TIFF
 * and the user learned it was rejected only after the round trip. Keeping one
 * definition means the two can't drift apart either.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** Content types accepted for any upload. */
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

/** Content types accepted specifically for a company logo. */
export const LOGO_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/** Extensions each content type is allowed to carry, to catch a renamed file. */
export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'application/pdf': ['pdf'],
};

export const LOGO_ACCEPT_ATTRIBUTE = LOGO_CONTENT_TYPES.join(',');

/** Human-readable list for error messages: "PNG, JPG, JPEG or WebP". */
export const LOGO_FORMATS_LABEL = 'PNG, JPG, JPEG or WebP';

export function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export interface UploadCheckResult {
  ok: boolean;
  /** User-facing reason, already phrased for display. Null when ok. */
  message: string | null;
}

/**
 * Validates a file before it leaves the browser.
 *
 * `allowed` narrows the accepted types — a logo is stricter than a general
 * attachment, since it also has to render in a PDF.
 */
export function checkUpload(
  file: { name: string; type: string; size: number },
  allowed: readonly string[] = ALLOWED_CONTENT_TYPES,
  formatsLabel = 'JPG, JPEG, PNG, WebP, HEIC or PDF'
): UploadCheckResult {
  if (file.size === 0) {
    return { ok: false, message: 'The file is empty.' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      message: `The file is too large (${mb} MB). Maximum size is ${MAX_UPLOAD_MB} MB.`,
    };
  }

  const type = file.type.toLowerCase().split(';')[0].trim();
  if (!allowed.includes(type)) {
    return { ok: false, message: `${formatsLabel} files are supported.` };
  }

  const ext = extensionOf(file.name);
  const permitted = ALLOWED_EXTENSIONS[type];
  if (permitted && ext && !permitted.includes(ext)) {
    return {
      ok: false,
      message: `The file extension .${ext} does not match its type (${type}).`,
    };
  }

  return { ok: true, message: null };
}

/**
 * Turns a failed S3 upload into something a person can act on.
 *
 * The browser PUTs straight to S3, so these statuses come from AWS rather than
 * from our API and would otherwise surface as a bare "Upload failed".
 */
export function describeStorageFailure(status: number): string {
  if (status === 403) return 'The storage service rejected the upload. The upload link may have expired.';
  if (status === 404) return 'The storage location could not be found.';
  if (status === 413) return `The file is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`;
  if (status >= 500) return 'The storage service is unavailable right now. Please try again.';
  return 'The upload could not be completed.';
}
