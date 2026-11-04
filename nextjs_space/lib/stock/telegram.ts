import 'server-only';

/**
 * The one KolayStok Telegram bot, shared by every company.
 * The token is read from the environment and never logged.
 */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

export function telegramBotUsername(): string | null {
  const name = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return name || null;
}

/** Sends a plain-text message. Returns false (never throws) on any failure. */
export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    console.error('[telegram] send failed');
    return false;
  }
}
