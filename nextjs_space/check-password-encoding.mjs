/**
 * SUPABASE ŞİFRE KODLAMA TANI ARACI
 *
 * GÜVENLİK: Bu script şifrenizi ASLA yazdırmaz.
 * Sadece uzunluk, karakter KATEGORİLERİ ve kodlama meta verisi gösterir.
 * Çıktısını bana veya herhangi bir yere güvenle yapıştırabilirsiniz.
 *
 * Çalıştırma:  node check-password-encoding.mjs
 * (nextjs_space klasöründen, .env dosyasının yanından)
 */

import fs from "node:fs";
import path from "node:path";

const CANDIDATE_DIRS = [process.cwd(), path.join(process.cwd(), "prisma"), path.join(process.cwd(), "..")];

function findEnvFiles() {
  const found = [];
  for (const dir of CANDIDATE_DIRS) {
    for (const name of [".env", ".env.local", ".env.development", ".env.production"]) {
      const p = path.join(dir, name);
      try {
        if (fs.statSync(p).isFile()) found.push(p);
      } catch {}
    }
  }
  return [...new Set(found)];
}

function describeChars(s) {
  const cats = new Set();
  let nonAscii = 0;
  const needsEncoding = new Set();
  // Characters that change meaning inside a URL userinfo section
  const RESERVED = new Set(["@", "/", "?", "#", "[", "]", ":", "%", " ", "\\", "&", "=", "+", '"', "'", "<", ">"]);
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c > 127) { cats.add("NON-ASCII"); nonAscii++; continue; }
    if (/[a-z]/.test(ch)) cats.add("lowercase");
    else if (/[A-Z]/.test(ch)) cats.add("uppercase");
    else if (/[0-9]/.test(ch)) cats.add("digit");
    else {
      cats.add("symbol");
      if (RESERVED.has(ch)) needsEncoding.add(ch);
    }
    if (ch === " ") cats.add("SPACE");
    if (ch === "\t") cats.add("TAB");
  }
  return { cats: [...cats], nonAscii, needsEncoding: [...needsEncoding] };
}

function rawPasswordFrom(line) {
  // Extract the value after '=' , strip surrounding quotes
  const eq = line.indexOf("=");
  if (eq === -1) return null;
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  // userinfo is between "://" and the LAST "@" before the host
  const schemeEnd = v.indexOf("://");
  if (schemeEnd === -1) return null;
  const afterScheme = v.slice(schemeEnd + 3);
  const atIdx = afterScheme.lastIndexOf("@");
  if (atIdx === -1) return null;
  const userinfo = afterScheme.slice(0, atIdx);
  const colon = userinfo.indexOf(":");
  if (colon === -1) return null;
  return { user: userinfo.slice(0, colon), rawPwd: userinfo.slice(colon + 1), rest: afterScheme.slice(atIdx + 1) };
}

console.log("=".repeat(72));
console.log("SUPABASE ŞİFRE KODLAMA TANISI  (şifre ASLA yazdırılmaz)");
console.log("=".repeat(72));

const envFiles = findEnvFiles();
console.log(`\n[1] Bulunan .env dosyaları: ${envFiles.length}`);
for (const f of envFiles) {
  const buf = fs.readFileSync(f);
  let enc = "UTF-8 (BOM yok)";
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) enc = "UTF-8 with BOM  <-- SORUN OLABİLİR";
  else if (buf[0] === 0xff && buf[1] === 0xfe) enc = "UTF-16 LE  <-- SORUN";
  else if (buf[0] === 0xfe && buf[1] === 0xff) enc = "UTF-16 BE  <-- SORUN";
  console.log(`    ${f}`);
  console.log(`      kodlama: ${enc}`);
}
if (envFiles.length > 1) {
  console.log("    !! BİRDEN FAZLA .env VAR — hangisinin yüklendiği belirsiz olabilir.");
}

for (const f of envFiles) {
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  console.log(`\n[2] ${path.basename(f)} içindeki bağlantı değişkenleri:`);

  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = lines.find((l) => l.trimStart().startsWith(key + "="));
    if (!line) { console.log(`    ${key}: TANIMLI DEĞİL`); continue; }

    const hasCR = /\r/.test(line);
    const parsed = rawPasswordFrom(line);
    console.log(`\n    --- ${key} ---`);
    if (hasCR) console.log("      satır sonunda CR var (Windows) — normal");
    if (!parsed) { console.log("      AYRIŞTIRILAMADI (format bozuk olabilir)"); continue; }

    const { user, rawPwd, rest } = parsed;
    console.log(`      kullanıcı        : ${user}`);
    console.log(`      host:port/db     : ${rest}`);
    console.log(`      RAW şifre uzunl. : ${rawPwd.length}   (dosyada yazılı hâli)`);

    let decoded = null, decodeError = null;
    try { decoded = decodeURIComponent(rawPwd); } catch (e) { decodeError = e.message; }

    if (decodeError) {
      console.log(`      DECODE HATASI    : ${decodeError}  <-- KRİTİK`);
    } else {
      console.log(`      DECODE uzunluğu  : ${decoded.length}   (sunucuya gidecek hâli)`);
      if (decoded.length !== rawPwd.length) {
        console.log("      !!! RAW ile DECODE uzunlukları FARKLI — şifre yolda değişiyor.");
      }
    }

    const info = describeChars(decodeError ? rawPwd : decoded);
    console.log(`      karakter türleri : ${info.cats.join(", ") || "(yok)"}`);
    if (info.nonAscii > 0) {
      console.log(`      !!! ASCII DIŞI ${info.nonAscii} karakter (ör. ş,ğ,ı,ö,ü,ç) <-- KRİTİK`);
    }
    if (info.needsEncoding.length > 0) {
      console.log(`      !!! URL'de kodlanması GEREKEN karakterler var: ${info.needsEncoding.map((c) => (c === " " ? "<space>" : c)).join(" ")}`);
    }
    if (/^\s|\s$/.test(decodeError ? rawPwd : decoded)) {
      console.log("      !!! Şifrenin başında/sonunda BOŞLUK var <-- KRİTİK");
    }

    // What Node's URL parser (what pg and Prisma both use) actually extracts
    try {
      const u = new URL(line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""));
      console.log(`      new URL() şifre uzunluğu : ${u.password.length}  (ham, decode edilmemiş)`);
      console.log(`      new URL() decode sonrası : ${decodeURIComponent(u.password).length}`);
    } catch (e) {
      console.log(`      new URL() AYRIŞTIRAMADI: ${e.message}  <-- KRİTİK`);
    }
  }
}

console.log("\n" + "=".repeat(72));
console.log("NE ARIYORUZ:");
console.log("  - RAW ve DECODE uzunlukları AYNI olmalı");
console.log("  - ASCII dışı karakter OLMAMALI");
console.log("  - Kodlanması gereken karakter OLMAMALI");
console.log("  - Uzunluk, Supabase'de belirlediğiniz şifrenin uzunluğuyla AYNI olmalı");
console.log("=".repeat(72));
