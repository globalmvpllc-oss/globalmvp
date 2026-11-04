/**
 * Points the Avc KolayStok bot at this site's webhook, with the secret token.
 *
 *   npx tsx --require dotenv/config scripts/telegram-set-webhook.ts https://corpcontrol.net
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment
 * and prints only Telegram's yes/no — never the values.
 */
async function main() {
  const base = (process.argv[2] ?? '').replace(/\/+$/, '');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!/^https:\/\//.test(base)) throw new Error('Give the site address, e.g. https://corpcontrol.net');
  if (!token || !secret) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set.');
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${base}/api/webhooks/telegram`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(body?.ok ? `Webhook set: ${base}/api/webhooks/telegram` : `Telegram refused: ${body?.description ?? res.status}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
