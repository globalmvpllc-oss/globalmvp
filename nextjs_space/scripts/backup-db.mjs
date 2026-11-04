#!/usr/bin/env node
/**
 * Full backup of the CorpControl database (public schema: every table the app
 * uses, schema + data) with pg_dump, then a check that the file is complete.
 *
 *   cd C:\Projelerim\corpcontrol\nextjs_space
 *   node scripts\backup-db.mjs
 *
 * - The connection comes from BACKUP_DATABASE_URL, else DIRECT_URL, read from
 *   the environment or from nextjs_space/.env. It is never printed: the parts
 *   are handed to pg_dump through PG* environment variables, so the password
 *   is not on any command line and not in any log.
 * - Refuses the transaction pooler (port 6543): pg_dump needs a session.
 * - Refuses the Fida Horeca project (different product, never touched here).
 * - Writes C:\Projelerim\corpcontrol\yedek\corpcontrol-YYYYMMDD-HHMM.sql plus a
 *   short summary (sizes and row counts only, no data).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repoDir = path.resolve(appDir, '..');
const backupDir = path.join(repoDir, 'yedek');
const FORBIDDEN_PROJECT = 'bptiwxuzscfhuyzpuwip';

// .env is only read when no address was given directly.
if (!process.env.BACKUP_DATABASE_URL) dotenv.config({ path: path.join(appDir, '.env') });

function fail(message) {
  console.error(`\nYEDEK ALINAMADI: ${message}\n`);
  process.exit(1);
}

function findPgDump() {
  const probe = spawnSync('pg_dump', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (probe.status === 0) return { bin: 'pg_dump', version: probe.stdout.trim() };
  const root = 'C:\\Program Files\\PostgreSQL';
  if (existsSync(root)) {
    const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const bin = path.join(root, v, 'bin', 'pg_dump.exe');
      if (existsSync(bin)) {
        const out = spawnSync(bin, ['--version'], { encoding: 'utf8' });
        if (out.status === 0) return { bin, version: out.stdout.trim() };
      }
    }
  }
  return null;
}

const raw = process.env.BACKUP_DATABASE_URL || process.env.DIRECT_URL;
if (!raw) fail('DIRECT_URL bulunamadı (nextjs_space/.env içinde olmalı).');

let url;
try {
  url = new URL(raw);
} catch {
  fail('Bağlantı adresi okunamadı (biçim hatalı). Adres gösterilmiyor.');
}
if (raw.includes(FORBIDDEN_PROJECT)) fail('Bu adres Fida Horeca projesine ait; CorpControl yedeği değil. Durduruldu.');
if (url.port === '6543') fail('Bu adres "transaction pooler" (6543). pg_dump için Supabase > Connect > "Session pooler" (5432) adresi gerekir.');

const pgDump = findPgDump();
if (!pgDump) {
  fail('pg_dump bulunamadı. Kurmak için (yönetici PowerShell):  winget install -e --id PostgreSQL.PostgreSQL.17');
}

// Only non-secret facts are shown: the host family and the first letters of the user.
const user = decodeURIComponent(url.username);
const projectHint = (user.split('.')[1] || url.hostname.split('.')[1] || '').slice(0, 4);
console.log(`pg_dump: ${pgDump.version}`);
console.log(`Sunucu: ${url.hostname.endsWith('supabase.com') || url.hostname.endsWith('supabase.co') ? 'Supabase' : 'diğer'}${projectHint ? ` (proje ${projectHint}…)` : ''}, port ${url.port || '5432'}`);

mkdirSync(backupDir, { recursive: true });
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const outFile = path.join(backupDir, `corpcontrol-${stamp}.sql`);

const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: user,
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
  PGSSLMODE: url.searchParams.get('sslmode') || 'require',
  PGCONNECT_TIMEOUT: '20',
};
delete env.DATABASE_URL;
delete env.DIRECT_URL;
delete env.BACKUP_DATABASE_URL;

console.log('Yedek alınıyor… (birkaç dakika sürebilir)');
const result = spawnSync(
  pgDump.bin,
  ['--format=plain', '--schema=public', '--no-owner', '--no-privileges', '--encoding=UTF8', `--file=${outFile}`],
  { env, encoding: 'utf8' }
);
if (result.status !== 0) {
  // pg_dump errors never contain the password; still, show only the first line.
  const first = String(result.stderr || '').split('\n').find((l) => l.trim()) || 'bilinmeyen hata';
  const hint = /translate host|Network is unreachable|timeout|could not connect/i.test(first)
    ? '\nİpucu: Supabase ücretsiz planda doğrudan bağlantı yalnız IPv6 olabilir. Supabase > Connect > "Session pooler" adresini nextjs_space/.env içine BACKUP_DATABASE_URL adıyla ekleyip tekrar çalıştırın.'
    : '';
  fail(`pg_dump hata verdi: ${first.replace(/password[^\s]*/gi, 'password=***')}${hint}`);
}

// ---- Verify: complete file, tables, rows per table, applied migrations ----
const size = statSync(outFile).size;
const rows = new Map();
const tables = new Set();
const migrations = [];
let current = null;
let migrationCols = null;
let complete = false;

const rl = readline.createInterface({ input: createReadStream(outFile, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (current) {
    if (line === '\\.') {
      current = null;
      continue;
    }
    rows.set(current, (rows.get(current) ?? 0) + 1);
    if (current === '_prisma_migrations' && migrationCols) {
      const cells = line.split('\t');
      migrations.push({
        name: cells[migrationCols.name],
        finished: cells[migrationCols.finished] !== '\\N',
        rolledBack: cells[migrationCols.rolledBack] !== '\\N',
      });
    }
    continue;
  }
  const create = line.match(/^CREATE TABLE public\."?([^"\s(]+)"?/);
  if (create) tables.add(create[1]);
  const copy = line.match(/^COPY public\."?([^"\s(]+)"? \((.*)\) FROM stdin;$/);
  if (copy) {
    current = copy[1];
    rows.set(current, rows.get(current) ?? 0);
    if (current === '_prisma_migrations') {
      const cols = copy[2].split(',').map((c) => c.trim().replace(/"/g, ''));
      migrationCols = {
        name: cols.indexOf('migration_name'),
        finished: cols.indexOf('finished_at'),
        rolledBack: cols.indexOf('rolled_back_at'),
      };
    }
  }
  if (line.includes('PostgreSQL database dump complete')) complete = true;
}

const lines = [];
lines.push(`Yedek: ${outFile}`);
lines.push(`Boyut: ${(size / 1024 / 1024).toFixed(2)} MB (${size} bayt)`);
lines.push(`Dosya tamam mı: ${complete ? 'EVET (pg_dump bitiş işareti var)' : 'HAYIR — dosya eksik olabilir'}`);
lines.push(`Tablo sayısı: ${tables.size}`);
lines.push('Satır sayıları:');
for (const name of [...tables].sort()) lines.push(`  ${name}: ${rows.get(name) ?? 0}`);
if (migrationCols) {
  lines.push('Uygulanmış migration\'lar (_prisma_migrations):');
  for (const m of migrations) lines.push(`  ${m.name}${m.rolledBack ? ' (GERİ ALINMIŞ)' : m.finished ? '' : ' (YARIM)'}`);
} else {
  lines.push('_prisma_migrations tablosu yok: veritabanı migrate yerine "db push" ile kurulmuş olabilir.');
}
const summary = lines.join('\n');
writeFileSync(outFile.replace(/\.sql$/, '.ozet.txt'), summary + '\n', 'utf8');
console.log('\n' + summary + '\n');
if (!complete) process.exit(2);
