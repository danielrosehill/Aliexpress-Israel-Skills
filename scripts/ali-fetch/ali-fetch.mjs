#!/usr/bin/env node
// Fetch an AliExpress listing as JSON via sudheer-ranga/aliexpress-product-scraper.
// Requires Node >= 24. Use `nvm use 24` before running.
//
// Usage:
//   node scripts/ali-fetch.mjs <productId|url> [outDir]
//
// Writes JSON to <outDir>/listing-<id>.json (default outDir: outputs/).

import scrape from 'aliexpress-product-scraper';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const arg = process.argv[2];
const outDir = process.argv[3] ?? 'outputs';

if (!arg) {
  console.error('usage: ali-fetch.mjs <productId|url> [outDir]');
  process.exit(1);
}

const idMatch = arg.match(/(\d{10,})/);
if (!idMatch) {
  console.error('could not extract product id from:', arg);
  process.exit(1);
}
const id = idMatch[1];

const data = await scrape(id, {
  reviewsCount: 20,
  puppeteerOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});
await mkdir(outDir, { recursive: true });
const outPath = join(outDir, `listing-${id}.json`);
await writeFile(outPath, JSON.stringify(data, null, 2));
console.log(`wrote ${outPath}`);
const fmtPrice = (p) => {
  if (p == null) return '(none)';
  if (typeof p !== 'object') return String(p);
  const min = p.min?.formatedAmount ?? p.min?.value;
  const max = p.max?.formatedAmount ?? p.max?.value;
  if (min != null && max != null) return min === max ? `${min}` : `${min} – ${max}`;
  return p.formatted ?? p.formatedAmount ?? p.value ?? JSON.stringify(p);
};
const numericPrice = (p) => p?.min?.value ?? p?.value ?? null;

// Live USD/ILS via frankfurter.app (ECB, no key). Cached 24h to outputs/.fx-cache.json.
async function getUsdIls() {
  if (process.env.USD_ILS) return { rate: Number(process.env.USD_ILS), source: 'env' };
  const cachePath = join(outDir, '.fx-cache.json');
  try {
    const cached = JSON.parse(await (await import('node:fs/promises')).readFile(cachePath, 'utf8'));
    if (Date.now() - cached.fetchedAt < 24 * 3600 * 1000) return { rate: cached.rate, source: `cache@${cached.date}` };
  } catch {}
  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=ILS');
  const j = await res.json();
  const rate = j.rates?.ILS;
  if (!rate) throw new Error('frankfurter: no ILS rate in response');
  await writeFile(cachePath, JSON.stringify({ rate, date: j.date, fetchedAt: Date.now() }, null, 2));
  return { rate, source: `frankfurter@${j.date}` };
}

// Israel personal-import VAT: 0–$75 exempt; $75–$500 → 18% VAT on (item + shipping).
// Above $500 customs/duty kicks in (out of scope here). Whether to include the
// VAT band in landed-cost comparisons is a user choice — surface both.
const ilLandedCost = (itemILS, shipILS, usdIls) => {
  const subtotalILS = (itemILS ?? 0) + (shipILS ?? 0);
  const itemUSD = (itemILS ?? 0) / usdIls;
  let vat = 0, band = 'under-$75 (no VAT)';
  if (itemUSD > 500) band = 'over-$500 (customs/duty applies — out of scope)';
  else if (itemUSD > 75) { vat = subtotalILS * 0.18; band = '$75–$500: 18% VAT applies'; }
  return { subtotalILS, vat, withVat: subtotalILS + vat, band, itemUSD };
};
const ilShip = (data.shipping ?? []).find(s => s.shippingInfo?.toCode === 'IL') ?? data.shipping?.[0];
const si = ilShip?.shippingInfo ?? {};
const di = ilShip?.deliveryInfo ?? {};
const fx = await getUsdIls();
const itemILS = numericPrice(data.salePrice ?? data.price);
const shipILS = si.displayCurrency === 'ILS' ? si.displayAmount : null;
const lc = (itemILS != null) ? ilLandedCost(itemILS, shipILS, fx.rate) : null;
console.log(`  title: ${data.title ?? '(none)'}`);
console.log(`  price: ${fmtPrice(data.salePrice ?? data.price)}`);
console.log(`  orders: ${data.orders ?? 0}   rating: ${data.ratings?.averageStar ?? '(none)'} (${data.ratings?.totalStartCount ?? 0})`);
console.log(`  ship: ${si.from ?? '?'} → ${si.to ?? '?'}   fee: ${si.fees ?? '(unknown)'}   lead: ${di.min ?? '?'}–${di.max ?? '?'} days`);
console.log(`  store: ${data.storeInfo?.name ?? '(none)'}   topRated: ${data.storeInfo?.isTopRated ?? false}`);
if (lc) {
  console.log(`  fx: 1 USD = ₪${fx.rate.toFixed(4)} (${fx.source})`);
  console.log(`  landed (item+ship): ₪${lc.subtotalILS.toFixed(2)}   incl. VAT: ₪${lc.withVat.toFixed(2)}   band: ${lc.band}`);
}
