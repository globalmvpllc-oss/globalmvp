/**
 * Company logo handling.
 *
 * Logos no longer go through S3. A presigned upload needs an AWS account, a
 * bucket, an IAM user, a bucket CORS rule and four environment variables — a
 * lot of infrastructure for an image that is a few tens of kilobytes and shown
 * in a sidebar. The browser now shrinks the image and stores it as a data URL
 * in Company.logoUrl, which is a TEXT column and already wide enough.
 *
 * S3 stays in the codebase for attachments and receipts, where real object
 * storage genuinely earns its keep.
 */

/** Formats accepted from the user. SVG is excluded — see isSafeImageDataUrl. */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const LOGO_ACCEPT_ATTRIBUTE = LOGO_MIME_TYPES.join(',');
export const LOGO_FORMATS_LABEL = 'PNG, JPG, JPEG or WebP';

/** Ceiling on what the user may select, before optimisation. */
export const MAX_LOGO_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_LOGO_FILE_MB = MAX_LOGO_FILE_BYTES / (1024 * 1024);

/** Longest edge after optimisation. A sidebar mark needs no more. */
export const LOGO_MAX_DIMENSION = 256;

/**
 * Ceiling on the stored data URL.
 *
 * This value travels in every /api/company response, so it is capped well below
 * what the column could hold. A 256px WebP is normally 10–30 KB; anything near
 * this limit means the source image is pathological.
 */
export const MAX_LOGO_DATA_URL_CHARS = 700_000; // ≈ 500 KB once base64 is decoded

export interface LogoCheck {
  ok: boolean;
  /** Ready to show the user. Null when ok. */
  message: string | null;
}

/** Validates the file the user picked, before any decoding. */
export function checkLogoFile(file: { name: string; type: string; size: number }): LogoCheck {
  const type = file.type.toLowerCase().split(';')[0].trim();

  if (file.size === 0) {
    return { ok: false, message: 'The selected file is empty.' };
  }

  if (file.size > MAX_LOGO_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      message: `Logo file is too large (${mb} MB). Maximum size is ${MAX_LOGO_FILE_MB} MB.`,
    };
  }

  // The declared type is checked here and the bytes are decoded afterwards, so
  // a renamed file fails at the decode step rather than being trusted.
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: `Please select a ${LOGO_FORMATS_LABEL} image.` };
  }

  return { ok: true, message: null };
}

/** Data URL prefixes the server will store. */
const SAFE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Whether a value is an image data URL safe to persist and render.
 *
 * Restricted to the three raster formats. `image/svg+xml` is refused because an
 * SVG is a document: it can carry script and is rendered in the page and in the
 * generated invoice. Anything not matching — `data:text/html`, a bare string, a
 * URL with a charset parameter — is refused too.
 */
export function isSafeImageDataUrl(value: string): boolean {
  if (!value.startsWith('data:')) return false;
  if (value.length > MAX_LOGO_DATA_URL_CHARS) return false;
  return SAFE_DATA_URL_PATTERN.test(value);
}

/**
 * Whether a value is a storage key produced by the old presigned upload flow.
 *
 * Logos saved before this change are still keys under the company's own upload
 * prefix. They keep working; only new uploads become data URLs.
 */
export function isLegacyStorageKey(value: string, companyId: string): boolean {
  return !value.startsWith('data:') && value.includes(`uploads/${companyId}/`);
}

/** Whether a stored logo value is acceptable for this company. */
export function isAcceptableLogoValue(value: string, companyId: string): boolean {
  return isSafeImageDataUrl(value) || isLegacyStorageKey(value, companyId);
}

/** Approximate decoded size of a base64 data URL, for reporting to the user. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return 0;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Target dimensions that fit inside the box while keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number = LOGO_MAX_DIMENSION
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= max && height <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface OptimizedLogo {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  format: 'image/webp' | 'image/png';
}

/**
 * Decodes, shrinks and re-encodes the image in the browser.
 *
 * Decoding is also the real format check: a file renamed to .png fails here
 * rather than being taken on trust. WebP is preferred for size; browsers that
 * cannot encode it silently return a PNG data URL from toDataURL, which is
 * detected by inspecting the prefix rather than by feature-sniffing.
 */
export async function optimizeLogo(file: File): Promise<OptimizedLogo> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode-failed'));
      img.src = objectUrl;
    });

    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    if (width === 0 || height === 0) throw new Error('decode-failed');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('decode-failed');
    context.drawImage(image, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', 0.9);
    let format: OptimizedLogo['format'] = 'image/webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      // The browser ignored the requested type; fall back explicitly.
      dataUrl = canvas.toDataURL('image/png');
      format = 'image/png';
    }

    return { dataUrl, bytes: dataUrlByteLength(dataUrl), width, height, format };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
