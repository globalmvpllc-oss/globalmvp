import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** "Connect Telegram" links last 30 minutes and work once. */
export const TELEGRAM_CODE_MINUTES = 30;

/** A start code Telegram accepts (A–Z a–z 0–9 _ -, ≤ 64) and its stored hash. */
export function newTelegramCode(): { code: string; codeHash: string } {
  const code = randomBytes(18).toString('base64url');
  return { code, codeHash: hashTelegramCode(code) };
}

export function hashTelegramCode(code: string): string {
  return createHash('sha256').update(`ks-telegram:${code}`).digest('hex');
}

export function telegramLink(bot: string, code: string): string {
  return `https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(code)}`;
}

/** "/start CODE", "/start@Bot CODE", "/stop" — anything else is ignored. */
export function parseTelegramCommand(text: unknown): { cmd: 'start'; arg: string } | { cmd: 'stop' } | null {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^\/(start|stop)(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/);
  if (!m) return null;
  if (m[1] === 'stop') return { cmd: 'stop' };
  return m[2] ? { cmd: 'start', arg: m[2] } : null;
}

/**
 * Telegram signs nothing; it sends back the secret we gave setWebhook in
 * the X-Telegram-Bot-Api-Secret-Token header. Compared in constant time;
 * no configured secret means every request is refused.
 */
export function isTelegramSecretValid(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
