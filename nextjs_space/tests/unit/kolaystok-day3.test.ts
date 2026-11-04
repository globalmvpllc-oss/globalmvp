import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { stockOrderEmail, orderLineName } from '@/lib/email/templates';
import { markUnknownSuppliers, type CheckedRow } from '@/lib/stock/excel';
import { groupOrderLines } from '@/lib/stock/rules';
import JSZip from 'jszip';
import { assertSpreadsheetSize, SpreadsheetTooLargeError, XLSX_MAX_UNPACKED_BYTES } from '@/lib/stock/karadag-import';

const root = path.resolve(__dirname, '../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('order email: date, sender, company, reply sentence, size', () => {
  const mail = stockOrderEmail({
    locale: 'tr',
    companyName: 'Karadağ Metal',
    supplierName: 'Argon Ltd',
    date: '5 Kasım 2026',
    senderName: 'Ayşe Yılmaz',
    lines: [
      { code: 'AR040', name: 'Argon Pasta Çemberi', size: 'Ø40', unit: 'adet', quantity: 100 },
      { code: 'AR050', name: 'Argon Pasta Çemberi Ø50', size: 'Ø50', unit: 'adet', quantity: 20 },
    ],
  });

  it('has the date, the manager and the company, and the reply sentence', () => {
    expect(mail.text).toContain('Tarih: 5 Kasım 2026');
    expect(mail.text).toContain('Teslim tarihini ve fiyatı bu maili yanıtlayarak iletebilirsiniz.');
    expect(mail.text).toMatch(/Teşekkürler,\nAyşe Yılmaz\nKaradağ Metal$/);
    expect(mail.html).toContain('Ayşe Yılmaz');
  });

  it('names each line with its size, once', () => {
    expect(mail.text).toContain('AR040  Argon Pasta Çemberi Ø40: 100 adet');
    expect(mail.text).toContain('AR050  Argon Pasta Çemberi Ø50: 20 adet');
    expect(orderLineName({ name: 'Kalıp', size: null })).toBe('Kalıp');
  });

  it('the order draft carries the size to the screen', () => {
    const [group] = groupOrderLines([{ id: 'p', code: 'A', name: 'Çember', size: 'Ø40', unit: 'adet', quantity: 0, minStock: 5, targetStock: 10 }]);
    expect(group.lines[0]).toMatchObject({ size: 'Ø40', quantity: 10 });
    expect(src('app/api/stock/orders/send/route.ts')).toContain('buildOrderEmail(actor.companyId, parsed.data, actor.name)');
  });
});

describe('Excel preview warns about an unknown supplier', () => {
  it('flags only names that match no supplier (Turkish case-insensitive)', () => {
    const rows = [
      { values: { supplier: 'KARADAĞ METAL' }, errors: [] },
      { values: { supplier: 'Karadag Metal' }, errors: [] },
      { values: {}, errors: [] },
    ] as unknown as CheckedRow[];
    expect(markUnknownSuppliers(rows, ['Karadağ Metal'])).toBe(1);
    expect(rows[0].warnings).toBeUndefined();
    expect(rows[1].warnings).toEqual([{ code: 'supplier:unknown', value: 'Karadag Metal' }]);
    expect(src('lib/stock/import.ts')).toContain('markUnknownSuppliers(checked.rows');
  });
});

describe('phone screens', () => {
  it('manager bottom bar has at most five tabs; suppliers and settings live under "Diğer"', () => {
    const shell = src('components/kolaystok/ks-shell.tsx');
    const tabs = shell.slice(shell.indexOf('const tabs'), shell.indexOf('const visible'));
    expect(tabs.match(/href: '/g)).toHaveLength(5);
    expect(tabs).toContain("'ks.nav.more'");
    expect(tabs).not.toContain('/suppliers');
    const more = src('app/kolaystok/app/more/page.tsx');
    expect(more).toContain('/kolaystok/app/suppliers');
    expect(more).toContain('/kolaystok/app/settings');
  });

  it('product names are never cut to one line; size is its own tag', () => {
    for (const file of [
      'app/kolaystok/app/page.tsx',
      'app/kolaystok/app/products/page.tsx',
      'app/kolaystok/app/count/page.tsx',
      'app/kolaystok/app/orders/page.tsx',
      'app/kolaystok/app/movements/page.tsx',
    ]) {
      const s = src(file);
      expect(s, file).toContain('<ProductLabel');
      expect(s, file).not.toMatch(/truncate[^"]*">\{(p|l|m|product)\.(name|productName)\}/);
    }
    const label = src('components/kolaystok/product-label.tsx');
    expect(label).not.toContain('line-clamp');
    expect(label).toContain('font-extrabold');
  });

  it('home: − , number and + sit on their own full-width row', () => {
    expect(src('app/kolaystok/app/page.tsx')).toContain('grid grid-cols-[1fr_1.2fr_1fr] gap-2');
  });
});

describe('security-review fixes', () => {
  it('an Excel file that would unpack past the limit is refused before reading', async () => {
    const big = new JSZip();
    big.file('xl/worksheets/sheet1.xml', 'a'.repeat(XLSX_MAX_UNPACKED_BYTES + 1));
    const loaded = await JSZip.loadAsync(await big.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect(() => assertSpreadsheetSize(loaded)).toThrow(SpreadsheetTooLargeError);
    const small = new JSZip();
    small.file('xl/workbook.xml', '<workbook/>');
    expect(() => assertSpreadsheetSize(small)).not.toThrow();
    expect(src('app/api/stock/import/route.ts')).toContain('instanceof SpreadsheetTooLargeError');
  });
});
