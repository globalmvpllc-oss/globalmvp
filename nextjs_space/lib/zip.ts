/**
 * A minimal ZIP writer.
 *
 * Stored entries only — no compression. PDFs are already compressed, so
 * deflating them again costs CPU and saves almost nothing; storing keeps this
 * small enough to be worth writing rather than adding a dependency for.
 *
 * Pure and synchronous, so the archive can be built in the browser and unit
 * tested without a filesystem.
 */

/** CRC-32, required by the ZIP format for every entry. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Name inside the archive, including the extension. */
  name: string;
  data: Uint8Array;
}

/**
 * Makes a file name safe to put in an archive.
 *
 * Path separators, drive letters and traversal segments are removed rather than
 * escaped: an entry called `../../etc/passwd` should become a flat, harmless
 * name, not something an extractor might follow.
 */
export function safeEntryName(name: string, fallback: string): string {
  const flattened = String(name ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/[\x00-\x1f<>:"|?*]/g, '')
    .trim();
  return flattened === '' ? fallback : flattened.slice(0, 120);
}

/** Ensures no two entries share a name, since ZIP tolerates but extractors do not. */
export function dedupeEntryNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0
      ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
      : `${name} (${count})`;
  });
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

/**
 * Builds a ZIP archive from the given entries.
 *
 * Uses the classic (non-zip64) layout, which every extractor understands and
 * which is ample for a batch of invoices.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const names = dedupeEntryNames(entries.map((entry) => entry.name));

  const prepared = entries.map((entry, index) => ({
    nameBytes: encoder.encode(names[index]),
    data: entry.data,
    crc: crc32(entry.data),
  }));

  const localSize = prepared.reduce(
    (total, entry) => total + 30 + entry.nameBytes.length + entry.data.length,
    0
  );
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0);

  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);

  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);

    writeUint32(view, offset, 0x04034b50); // local file header
    writeUint16(view, offset + 4, 20); // version needed
    writeUint16(view, offset + 6, 0x0800); // UTF-8 names
    writeUint16(view, offset + 8, 0); // stored, no compression
    writeUint16(view, offset + 10, 0); // time
    writeUint16(view, offset + 12, 0); // date
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.data.length);
    writeUint32(view, offset + 22, entry.data.length);
    writeUint16(view, offset + 26, entry.nameBytes.length);
    writeUint16(view, offset + 28, 0); // extra field length
    offset += 30;

    output.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
    output.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralStart = offset;

  prepared.forEach((entry, index) => {
    writeUint32(view, offset, 0x02014b50); // central directory header
    writeUint16(view, offset + 4, 20); // version made by
    writeUint16(view, offset + 6, 20); // version needed
    writeUint16(view, offset + 8, 0x0800);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0);
    writeUint16(view, offset + 14, 0);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.data.length);
    writeUint32(view, offset + 24, entry.data.length);
    writeUint16(view, offset + 28, entry.nameBytes.length);
    writeUint16(view, offset + 30, 0);
    writeUint16(view, offset + 32, 0);
    writeUint16(view, offset + 34, 0);
    writeUint16(view, offset + 36, 0);
    writeUint32(view, offset + 38, 0);
    writeUint32(view, offset + 42, offsets[index]);
    offset += 46;

    output.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  });

  writeUint32(view, offset, 0x06054b50); // end of central directory
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, prepared.length);
  writeUint16(view, offset + 10, prepared.length);
  writeUint32(view, offset + 12, centralSize);
  writeUint32(view, offset + 16, centralStart);
  writeUint16(view, offset + 20, 0); // comment length

  return output;
}

/**
 * Name for the archive, e.g. `globalmvp-invoices-2026-08.zip`.
 *
 * The month comes from the caller rather than being read here, so the value is
 * deterministic and testable.
 */
export function archiveName(prefix: string, date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `globalmvp-${prefix}-${year}-${month}.zip`;
}
