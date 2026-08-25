import { describe, it, expect } from 'vitest';
import {
  checkLogoFile,
  isSafeImageDataUrl,
  isLegacyStorageKey,
  isAcceptableLogoValue,
  dataUrlByteLength,
  fitWithin,
  LOGO_MIME_TYPES,
  LOGO_MAX_DIMENSION,
  MAX_LOGO_FILE_BYTES,
  MAX_LOGO_FILE_MB,
  MAX_LOGO_DATA_URL_CHARS,
} from '@/lib/logo';

/**
 * Company logo storage.
 *
 * Logos are prepared in the browser and stored inline as data URLs, so there is
 * no bucket, no credentials and no CORS rule between a user and their logo.
 * These cover the validation and sizing rules; the canvas re-encoding itself
 * needs a browser and is exercised by using the app.
 */

const file = (name: string, type: string, size: number) => ({ name, type, size });

/** A minimal valid base64 payload for shape assertions. */
const b64 = 'iVBORw0KGgoAAAANSUhEUg==';

describe('accepted formats', () => {
  it('accepts PNG, JPEG and WebP', () => {
    for (const type of LOGO_MIME_TYPES) {
      expect(checkLogoFile(file('logo', type, 50_000)).ok).toBe(true);
    }
  });

  it('accepts a .jpg carrying the image/jpeg type', () => {
    // JPG and JPEG are the same type; only the extension differs.
    expect(checkLogoFile(file('logo.jpg', 'image/jpeg', 10_000)).ok).toBe(true);
    expect(checkLogoFile(file('logo.jpeg', 'image/jpeg', 10_000)).ok).toBe(true);
  });

  it('refuses SVG', () => {
    // An SVG is a document: it can carry script and is rendered both in the page
    // and in the generated invoice.
    const result = checkLogoFile(file('logo.svg', 'image/svg+xml', 4_000));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('PNG, JPG, JPEG or WebP');
  });

  it('refuses other images and non-images alike', () => {
    for (const type of ['image/gif', 'image/bmp', 'application/pdf', 'text/html', '']) {
      expect(checkLogoFile(file('x', type, 1_000)).ok).toBe(false);
    }
  });

  it('tolerates a content type carrying parameters', () => {
    expect(checkLogoFile(file('logo.png', 'image/png; charset=binary', 1_000)).ok).toBe(true);
  });
});

describe('size limits', () => {
  it('refuses an empty file', () => {
    const result = checkLogoFile(file('logo.png', 'image/png', 0));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/empty/i);
  });

  it('refuses a file over the limit and names the limit', () => {
    const result = checkLogoFile(file('logo.png', 'image/png', MAX_LOGO_FILE_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`${MAX_LOGO_FILE_MB} MB`);
  });

  it('accepts a file exactly at the limit', () => {
    expect(checkLogoFile(file('logo.png', 'image/png', MAX_LOGO_FILE_BYTES)).ok).toBe(true);
  });
});

describe('data URL safety', () => {
  it('accepts the three raster formats', () => {
    for (const type of ['png', 'jpeg', 'webp']) {
      expect(isSafeImageDataUrl(`data:image/${type};base64,${b64}`)).toBe(true);
    }
  });

  it('refuses an SVG data URL', () => {
    expect(isSafeImageDataUrl(`data:image/svg+xml;base64,${b64}`)).toBe(false);
  });

  it('refuses a data URL that is not an image', () => {
    expect(isSafeImageDataUrl(`data:text/html;base64,${b64}`)).toBe(false);
    expect(isSafeImageDataUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeImageDataUrl(`data:application/javascript;base64,${b64}`)).toBe(false);
  });

  it('refuses a non-base64 payload', () => {
    expect(isSafeImageDataUrl('data:image/png,<svg onload=alert(1)>')).toBe(false);
    expect(isSafeImageDataUrl('data:image/png;utf8,hello')).toBe(false);
  });

  it('refuses an external URL masquerading as a logo', () => {
    expect(isSafeImageDataUrl('https://evil.example.com/logo.png')).toBe(false);
    expect(isSafeImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageDataUrl('')).toBe(false);
  });

  it('refuses a data URL beyond the storage ceiling', () => {
    const huge = `data:image/png;base64,${'A'.repeat(MAX_LOGO_DATA_URL_CHARS)}`;
    expect(isSafeImageDataUrl(huge)).toBe(false);
  });
});

describe('company isolation', () => {
  it('accepts a legacy storage key belonging to this company', () => {
    const key = 'prod/uploads/cmp_mine/abc-logo.png';
    expect(isLegacyStorageKey(key, 'cmp_mine')).toBe(true);
    expect(isAcceptableLogoValue(key, 'cmp_mine')).toBe(true);
  });

  it('refuses another company\u2019s storage key', () => {
    const key = 'prod/uploads/cmp_theirs/abc-logo.png';
    expect(isLegacyStorageKey(key, 'cmp_mine')).toBe(false);
    expect(isAcceptableLogoValue(key, 'cmp_mine')).toBe(false);
  });

  it('refuses a bare path that is not under an upload prefix', () => {
    expect(isAcceptableLogoValue('../../etc/passwd', 'cmp_mine')).toBe(false);
    expect(isAcceptableLogoValue('https://evil.example.com/x.png', 'cmp_mine')).toBe(false);
  });

  it('accepts a data URL regardless of company, since it carries no reference', () => {
    // A data URL is the image itself; there is nothing to point at.
    const inline = `data:image/webp;base64,${b64}`;
    expect(isAcceptableLogoValue(inline, 'cmp_mine')).toBe(true);
    expect(isAcceptableLogoValue(inline, 'cmp_other')).toBe(true);
  });

  it('still refuses an unsafe data URL for any company', () => {
    expect(isAcceptableLogoValue(`data:image/svg+xml;base64,${b64}`, 'cmp_mine')).toBe(false);
  });
});

describe('resizing keeps the aspect ratio', () => {
  it('leaves a small image alone', () => {
    expect(fitWithin(120, 80)).toEqual({ width: 120, height: 80 });
  });

  it('shrinks a wide image to the long edge', () => {
    expect(fitWithin(1024, 512)).toEqual({ width: LOGO_MAX_DIMENSION, height: LOGO_MAX_DIMENSION / 2 });
  });

  it('shrinks a tall image to the long edge', () => {
    expect(fitWithin(512, 1024)).toEqual({ width: LOGO_MAX_DIMENSION / 2, height: LOGO_MAX_DIMENSION });
  });

  it('handles a square image', () => {
    expect(fitWithin(4000, 4000)).toEqual({ width: 256, height: 256 });
  });

  it('never collapses an extreme ratio to zero', () => {
    const result = fitWithin(5000, 3);
    expect(result.width).toBeLessThanOrEqual(LOGO_MAX_DIMENSION);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('returns zero for a degenerate image', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('reported size', () => {
  it('approximates the decoded byte length', () => {
    // 4 base64 characters encode 3 bytes.
    expect(dataUrlByteLength('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlByteLength('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUrlByteLength('data:image/png;base64,AA==')).toBe(1);
  });

  it('returns zero for something that is not a data URL', () => {
    expect(dataUrlByteLength('not a data url')).toBe(0);
  });
});

describe('a company with no logo keeps working', () => {
  it('treats absence as absence rather than as an invalid value', () => {
    // The settings form clears the logo with an empty string, which the API maps
    // to null; neither should be mistaken for a bad value.
    expect(isSafeImageDataUrl('')).toBe(false);
    expect(isAcceptableLogoValue('', 'cmp_mine')).toBe(false);
    // The route only validates when a value is present, so an empty string
    // reaches the update as "clear this" rather than being rejected.
  });
});
