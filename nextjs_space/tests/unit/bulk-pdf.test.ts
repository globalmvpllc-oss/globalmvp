import { describe, it, expect } from 'vitest';
import { crc32, createZip, safeEntryName, dedupeEntryNames, archiveName } from '@/lib/zip';
import { MAX_BULK_PDFS, PDF_OPTIONS } from '@/lib/bulk-pdf';
import { en, tr, type TranslationKey } from '@/lib/i18n';

/**
 * The archive itself, and the rules around building one.
 *
 * A ZIP that an extractor rejects is worse than no bulk download at all, so the
 * structure is checked byte by byte rather than assumed.
 */

const bytes = (text: string) => new TextEncoder().encode(text);

describe('crc32', () => {
  it('matches the known value for a standard input', () => {
    // The canonical check value for "123456789".
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('differs for different content', () => {
    expect(crc32(bytes('invoice-a'))).not.toBe(crc32(bytes('invoice-b')));
  });
});

describe('archive structure', () => {
  const readUint32 = (data: Uint8Array, offset: number) =>
    new DataView(data.buffer, data.byteOffset).getUint32(offset, true);
  const readUint16 = (data: Uint8Array, offset: number) =>
    new DataView(data.buffer, data.byteOffset).getUint16(offset, true);

  it('starts with a local file header', () => {
    const zip = createZip([{ name: 'INV-001.pdf', data: bytes('pdf-a') }]);
    expect(readUint32(zip, 0)).toBe(0x04034b50);
  });

  it('ends with an end-of-central-directory record', () => {
    const zip = createZip([{ name: 'INV-001.pdf', data: bytes('pdf-a') }]);
    expect(readUint32(zip, zip.length - 22)).toBe(0x06054b50);
  });

  it('records the entry count in both places', () => {
    const zip = createZip([
      { name: 'INV-001.pdf', data: bytes('a') },
      { name: 'INV-002.pdf', data: bytes('bb') },
      { name: 'INV-003.pdf', data: bytes('ccc') },
    ]);
    expect(readUint16(zip, zip.length - 22 + 8)).toBe(3);
    expect(readUint16(zip, zip.length - 22 + 10)).toBe(3);
  });

  it('stores rather than compresses, since PDFs are already compressed', () => {
    const zip = createZip([{ name: 'INV-001.pdf', data: bytes('pdf-a') }]);
    expect(readUint16(zip, 8)).toBe(0);
  });

  it('keeps compressed and uncompressed sizes equal when stored', () => {
    const payload = bytes('some pdf bytes');
    const zip = createZip([{ name: 'INV-001.pdf', data: payload }]);
    expect(readUint32(zip, 18)).toBe(payload.length);
    expect(readUint32(zip, 22)).toBe(payload.length);
  });

  it('writes the entry crc into the header', () => {
    const payload = bytes('pdf-a');
    const zip = createZip([{ name: 'INV-001.pdf', data: payload }]);
    expect(readUint32(zip, 14)).toBe(crc32(payload));
  });

  it('marks names as UTF-8', () => {
    const zip = createZip([{ name: 'FATURA-Ç.pdf', data: bytes('a') }]);
    expect(readUint16(zip, 6) & 0x0800).toBe(0x0800);
  });

  it('contains the file content verbatim', () => {
    const zip = createZip([{ name: 'INV-001.pdf', data: bytes('hello-pdf') }]);
    expect(new TextDecoder().decode(zip)).toContain('hello-pdf');
  });

  it('handles an empty archive without producing a malformed file', () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readUint32(zip, 0)).toBe(0x06054b50);
  });
});

describe('entry names', () => {
  it('keeps an ordinary invoice number intact', () => {
    expect(safeEntryName('INV-001.pdf', 'fallback.pdf')).toBe('INV-001.pdf');
  });

  it.each([
    ['../../etc/passwd', '-..-etc-passwd'],
    ['folder/INV-1.pdf', 'folder-INV-1.pdf'],
    ['back\\slash.pdf', 'back-slash.pdf'],
  ])('flattens %s so an extractor cannot follow it', (input, expected) => {
    expect(safeEntryName(input, 'fallback.pdf')).toBe(expected);
  });

  it.each(['', '   ', '...'])('falls back for an unusable name (%s)', (input) => {
    expect(safeEntryName(input, 'fallback.pdf')).toBe('fallback.pdf');
  });

  it('strips characters that break Windows extraction', () => {
    expect(safeEntryName('INV<1>:"?.pdf', 'f.pdf')).toBe('INV1.pdf');
  });

  it('makes duplicate names unique so nothing is silently overwritten', () => {
    expect(dedupeEntryNames(['INV-1.pdf', 'INV-1.pdf', 'INV-1.pdf'])).toEqual([
      'INV-1.pdf',
      'INV-1 (1).pdf',
      'INV-1 (2).pdf',
    ]);
  });

  it('leaves already-unique names alone', () => {
    const names = ['a.pdf', 'b.pdf'];
    expect(dedupeEntryNames(names)).toEqual(names);
  });
});

describe('archive file name', () => {
  it('is prefixed and dated', () => {
    expect(archiveName('invoices', new Date('2026-08-14T00:00:00.000Z'))).toBe(
      'globalmvp-invoices-2026-08.zip'
    );
  });

  it('pads a single-digit month', () => {
    expect(archiveName('invoices', new Date('2026-01-31T23:00:00.000Z'))).toBe(
      'globalmvp-invoices-2026-01.zip'
    );
  });

  it('uses UTC so the name does not shift with the reader’s timezone', () => {
    // 1 September 00:30 UTC is still August for someone at UTC-3, but the
    // archive name must not depend on who is looking at it.
    expect(archiveName('invoices', new Date('2026-09-01T00:30:00.000Z'))).toContain('2026-09');
  });
});

describe('batch rules', () => {
  it('caps how many PDFs one archive may contain', () => {
    expect(MAX_BULK_PDFS).toBeGreaterThan(0);
    expect(MAX_BULK_PDFS).toBeLessThanOrEqual(50);
  });

  it('uses the same page options as the single download', () => {
    // A bulk PDF that differed from the one-at-a-time PDF would be a second
    // format to maintain, and the two would drift.
    expect(PDF_OPTIONS.format).toBe('A4');
    expect(PDF_OPTIONS.margin).toEqual({
      top: '20mm',
      bottom: '20mm',
      left: '15mm',
      right: '15mm',
    });
  });
});

describe('bulk copy', () => {
  const keys = (Object.keys(en) as TranslationKey[]).filter((key) => key.startsWith('bulk.'));

  it('is fully translated', () => {
    expect(keys.length).toBeGreaterThan(8);
    for (const key of keys) {
      expect(tr[key], `missing tr for ${key}`).toBeTruthy();
    }
  });

  it('has the exact wording asked for', () => {
    expect(en['bulk.selectAtLeastOne']).toBe('Please select at least one record.');
    expect(tr['bulk.selectAtLeastOne']).toBe('En az bir kayıt seçin.');
    expect(en['bulk.generating']).toBe('Generating PDFs...');
    expect(tr['bulk.generating']).toBe("PDF'ler oluşturuluyor...");
  });

  it('keeps the placeholders the messages substitute', () => {
    expect(en['bulk.downloaded']).toContain('{count}');
    expect(tr['bulk.downloaded']).toContain('{count}');
    expect(en['bulk.maxPerBatch']).toContain('{max}');
    expect(tr['bulk.maxPerBatch']).toContain('{max}');
  });
});
