#!/usr/bin/env node
// AliExpress Affiliate API client. Same output shape as fetch-listing's ali-fetch.mjs.
//
// Usage:
//   node ali-api.mjs detail <productId>            — fetch one or more product details
//   node ali-api.mjs search <query> [page_size]    — search the affiliate catalogue
//
// Reads credentials from:
//   ${CLAUDE_USER_DATA:-~/.claude-user-data}/aliexpress-israel-skills/config.json
//
// Required schema:
//   { "aliexpress_affiliate": { "app_key": "...", "app_secret": "...",
//     "gateway": "https://api-sg.aliexpress.com/sync",
//     "sdk_version": "iop-sdk-python-20220609" } }

import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PLUGIN = 'aliexpress-israel-skills';
const dataDir = process.env.CLAUDE_USER_DATA ?? join(homedir(), '.claude-user-data');
const configPath = join(dataDir, PLUGIN, 'config.json');

let cfg;
try {
  cfg = JSON.parse(await readFile(configPath, 'utf8'));
} catch (e) {
  console.error(`config not found at ${configPath}`);
  console.error('write {"aliexpress_affiliate": {"app_key": "...", "app_secret": "...", "gateway": "https://api-sg.aliexpress.com/sync", "sdk_version": "iop-sdk-python-20220609"}}');
  process.exit(1);
}
const { app_key, app_secret, gateway, sdk_version } = cfg.aliexpress_affiliate ?? {};
if (!app_key || !app_secret || !gateway) {
  console.error('config missing aliexpress_affiliate.{app_key, app_secret, gateway}');
  process.exit(1);
}

// Mirrors iop-sdk-python sign(): sorted keys, concat "k1v1k2v2...",
// optional api prefix when api contains "/", HMAC-SHA256, hex().upper().
function sign(secret, api, params) {
  const keys = Object.keys(params).sort();
  let str = keys.map(k => `${k}${params[k]}`).join('');
  if (api.includes('/')) str = api + str;
  return createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}

async function call(method, biz = {}) {
  const sys = {
    app_key,
    sign_method: 'sha256',
    timestamp: String(Math.floor(Date.now() / 1000)) + '000',
    partner_id: sdk_version ?? 'iop-sdk-node',
    method,
    simplify: 'false',
    format: 'json',
  };
  const all = { ...sys, ...biz };
  all.sign = sign(app_secret, method, all);
  const res = await fetch(gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(all),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

async function getUsdIls() {
  if (process.env.USD_ILS) return { rate: Number(process.env.USD_ILS), source: 'env' };
  const cachePath = join(dataDir, PLUGIN, 'fx-cache.json');
  try {
    const c = JSON.parse(await readFile(cachePath, 'utf8'));
    if (Date.now() - c.fetchedAt < 24 * 3600 * 1000) return { rate: c.rate, source: `cache@${c.date}` };
  } catch {}
  const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=ILS');
  const j = await r.json();
  const rate = j.rates?.ILS;
  if (!rate) throw new Error('frankfurter: no ILS rate');
  await mkdir(join(dataDir, PLUGIN), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ rate, date: j.date, fetchedAt: Date.now() }));
  return { rate, source: `frankfurter@${j.date}` };
}

// Strip the affiliate-tracking goo and return a plain product URL.
const cleanUrl = (id) => `https://www.aliexpress.com/item/${id}.html`;

// VAT bands for IL personal imports. Returns subtotal (item+ship), VAT, total, and band.
function ilLandedCost(itemUSD, shipILS, fx) {
  const itemILS = itemUSD * fx;
  const subtotalILS = itemILS + (shipILS ?? 0);
  let vat = 0, band = 'under-$75 (no VAT)';
  if (itemUSD > 500) band = 'over-$500 (customs/duty applies — out of scope)';
  else if (itemUSD > 75) { vat = subtotalILS * 0.18; band = '$75–$500: 18% VAT applies'; }
  return { itemILS, subtotalILS, vat, withVat: subtotalILS + vat, band };
}

// Drop affiliate-specific fields the user doesn't care about.
function normalizeProduct(p) {
  return {
    product_id: p.product_id,
    title: p.product_title,
    url: cleanUrl(p.product_id),
    price_usd: p.target_sale_price ? Number(p.target_sale_price) : null,
    original_price_usd: p.target_original_price ? Number(p.target_original_price) : null,
    discount: p.discount,
    rating: p.evaluate_rate,
    image: p.product_main_image_url,
    video: p.product_video_url,
    shop: { name: p.shop_name, id: p.shop_id, url: p.shop_url },
    category: p.first_level_category_name,
  };
}

const [, , cmd, ...rest] = process.argv;

if (cmd === 'detail') {
  const ids = rest[0];
  if (!ids) { console.error('usage: ali-api.mjs detail <productId>[,<productId>...]'); process.exit(1); }
  const r = await call('aliexpress.affiliate.productdetail.get', {
    product_ids: ids,
    target_currency: 'USD',
    target_language: 'EN',
    country: 'IL',
  });
  if (r.status !== 200) { console.error('http', r.status); console.error(JSON.stringify(r.json, null, 2)); process.exit(2); }
  const result = r.json.aliexpress_affiliate_productdetail_get_response?.resp_result?.result;
  const products = result?.products?.product ?? [];
  if (!products.length) {
    console.log(`no products found for ${ids} (not in affiliate catalogue, or invalid id)`);
    process.exit(0);
  }
  const fx = await getUsdIls();
  for (const raw of products) {
    const p = normalizeProduct(raw);
    const lc = (p.price_usd != null) ? ilLandedCost(p.price_usd, null, fx.rate) : null;
    console.log(`\n${p.product_id} — ${p.title}`);
    console.log(`  url: ${p.url}`);
    console.log(`  price: $${p.price_usd}${p.original_price_usd && p.original_price_usd !== p.price_usd ? ` (was $${p.original_price_usd}, ${p.discount} off)` : ''}`);
    console.log(`  rating: ${p.rating ?? '(none)'}`);
    console.log(`  shop: ${p.shop.name} (${p.shop.url})`);
    if (lc) {
      console.log(`  fx: 1 USD = ₪${fx.rate.toFixed(4)} (${fx.source})`);
      console.log(`  item in ILS: ₪${lc.itemILS.toFixed(2)}   incl. VAT: ₪${lc.withVat.toFixed(2)}   band: ${lc.band}`);
      console.log(`  (note: shipping fee is not exposed by the affiliate API; landed cost = item only)`);
    }
  }
} else if (cmd === 'search') {
  const keywords = rest[0];
  const pageSize = rest[1] ?? '10';
  if (!keywords) { console.error('usage: ali-api.mjs search <query> [page_size]'); process.exit(1); }
  const r = await call('aliexpress.affiliate.product.query', {
    keywords,
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'IL',
    page_no: '1',
    page_size: pageSize,
    sort: 'SALE_PRICE_ASC',
  });
  if (r.status !== 200) { console.error('http', r.status); console.error(JSON.stringify(r.json, null, 2)); process.exit(2); }
  const result = r.json.aliexpress_affiliate_product_query_response?.resp_result?.result;
  const products = result?.products?.product ?? [];
  console.log(`query: "${keywords}"   results: ${products.length}/${result?.total_record_count ?? 0}`);
  for (const raw of products) {
    const p = normalizeProduct(raw);
    console.log(`\n  ${p.product_id} — ${p.title}`);
    console.log(`    $${p.price_usd}${p.original_price_usd && p.original_price_usd !== p.price_usd ? ` (was $${p.original_price_usd})` : ''}   ${p.rating ?? ''}`);
    console.log(`    ${p.url}`);
  }
} else {
  console.error('usage:');
  console.error('  ali-api.mjs detail <productId>');
  console.error('  ali-api.mjs search <query> [page_size]');
  process.exit(1);
}
