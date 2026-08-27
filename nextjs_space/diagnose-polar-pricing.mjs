/**
 * diagnose-polar-pricing.mjs - says why the plan cards have no prices.
 *
 *     cd C:\Projelerim\global-mvp\nextjs_space
 *     node diagnose-polar-pricing.mjs
 *
 * Read-only: it fetches from Polar and prints what it finds. Nothing is
 * created, changed or charged, and no secret is printed - tokens are shown
 * only as a length and a last-four.
 */

import { readFileSync, existsSync } from 'node:fs';

// .env is not loaded automatically outside Next, so read it here.
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] === undefined) {
        process.env[key] = rawValue.replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

const mask = (value) =>
  !value ? '(not set)' : `set, ${value.length} chars, ends "${value.slice(-4)}"`;

const VARS = [
  'POLAR_PRO_PRICE_MONTHLY',
  'POLAR_PRO_PRICE_YEARLY',
  'POLAR_BUSINESS_PRICE_MONTHLY',
  'POLAR_BUSINESS_PRICE_YEARLY',
];

console.log('Configuration');
console.log('  POLAR_ACCESS_TOKEN  :', mask(process.env.POLAR_ACCESS_TOKEN));
console.log('  POLAR_WEBHOOK_SECRET:', mask(process.env.POLAR_WEBHOOK_SECRET));
console.log('  POLAR_SERVER        :', process.env.POLAR_SERVER || '(not set - defaults to sandbox)');
for (const name of VARS) {
  console.log(`  ${name.padEnd(20)}:`, process.env[name] ? process.env[name] : '(not set)');
}
console.log('');

if (!process.env.POLAR_ACCESS_TOKEN) {
  console.log('DIAGNOSIS: POLAR_ACCESS_TOKEN is not set.');
  console.log('  The pricing fetch gives up before calling Polar, so the cards have no');
  console.log('  figures. Set it in .env and restart the dev server.');
  process.exit(0);
}

const server = process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';
const base = server === 'production' ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
console.log(`Talking to Polar (${server}): ${base}`);
console.log('');

async function api(path) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}` },
  });
  return { status: response.status, body: await response.text() };
}

// 1. Can we authenticate and see any products at all?
const list = await api('/v1/products/?limit=100');
if (list.status === 401 || list.status === 403) {
  console.log('DIAGNOSIS: Polar rejected the token (HTTP %d).', list.status);
  console.log('  Either the token is wrong, or it belongs to the other environment.');
  console.log('  A sandbox token cannot read production products, and vice versa.');
  console.log('  Check POLAR_SERVER against where the token was created.');
  process.exit(0);
}
if (list.status >= 400) {
  console.log('Products list failed: HTTP %d', list.status);
  console.log(list.body.slice(0, 300));
  process.exit(0);
}

let products = [];
try {
  products = JSON.parse(list.body).items ?? [];
} catch {
  console.log('Could not parse the products response.');
  process.exit(0);
}

console.log(`Products visible to this token: ${products.length}`);
for (const product of products) {
  const prices = (product.prices ?? [])
    .map((price) =>
      price.amountType === 'fixed'
        ? `${(price.priceAmount / 100).toFixed(2)} ${String(price.priceCurrency).toUpperCase()} [price id ${price.id}]`
        : `${price.amountType} [price id ${price.id}]`
    )
    .join(', ');
  console.log(`  product ${product.id}  "${product.name}"${product.isArchived ? ' (ARCHIVED)' : ''}`);
  console.log(`     recurring: ${product.recurringInterval ?? 'one-off'}   prices: ${prices || 'none'}`);
}
console.log('');

// 2. Check each configured id the way the application uses it.
const productIds = new Set(products.map((product) => product.id));
const priceIdToProduct = new Map();
for (const product of products) {
  for (const price of product.prices ?? []) priceIdToProduct.set(price.id, product);
}

let verdict = 'ok';
console.log('Configured ids');
for (const name of VARS) {
  const value = process.env[name];
  if (!value) {
    console.log(`  ${name}: NOT SET -> this plan/interval shows no price and cannot be bought`);
    verdict = 'missing';
    continue;
  }
  if (productIds.has(value)) {
    console.log(`  ${name}: OK - this is a product id`);
    continue;
  }
  if (priceIdToProduct.has(value)) {
    const product = priceIdToProduct.get(value);
    console.log(`  ${name}: WRONG KIND - this is a PRICE id.`);
    console.log(`     The application expects the PRODUCT id: ${product.id}  ("${product.name}")`);
    verdict = 'price-id';
    continue;
  }
  console.log(`  ${name}: NOT FOUND in this environment`);
  console.log('     Either the id belongs to the other environment, or it was archived.');
  verdict = 'not-found';
}

console.log('');
console.log('DIAGNOSIS');
if (verdict === 'ok') {
  console.log('  Every configured id resolves to a product here. If the cards still show no');
  console.log('  price, restart the dev server so it picks up .env, and check the terminal');
  console.log('  for "[billing:pricing] could not read product".');
} else if (verdict === 'price-id') {
  console.log('  The variables hold Polar PRICE ids, but the application uses them as');
  console.log('  PRODUCT ids - both for reading the price and for creating the checkout.');
  console.log('  Replace them with the product ids listed above and restart. This also');
  console.log('  explains a checkout that fails: it sends products: [<id>].');
  console.log('');
  console.log('  The variable names are misleading and that is my fault; the values they');
  console.log('  need have always been product ids.');
} else if (verdict === 'missing') {
  console.log('  At least one id is unset. A plan with no id shows no price and its upgrade');
  console.log('  button cannot start a checkout.');
} else {
  console.log('  At least one id does not exist in this Polar environment. The usual cause');
  console.log('  is a sandbox id with POLAR_SERVER=production, or the reverse.');
}
