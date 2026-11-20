---
name: fetch-listing-api
description: Fallback for `fetch-listing` when the no-auth scraper is broken. Calls the official AliExpress Affiliate API (HMAC-SHA256 signed against `api-sg.aliexpress.com/sync`) — counterintuitively returns LESS buyer-relevant data than the scraper (no shipping fees, no reviews, no specs, no lead time) because the API is designed for affiliate-marketing publishers, not buyer-side analysis. Use only when the scraper fails (DOM rotation, anti-bot, rate-limit) or for a quick affiliate-catalogue search without spinning up Puppeteer. Two modes — `detail <productId>` and `search <query>`. Output normalised to drop affiliate-specific fields (commission rates, tracked promotion links). Trigger phrases — "scraper is broken fall back to the api", "use the affiliate api", "scrape failed try the api".
---

# Fetch AliExpress Listing (Official Affiliate API) — Fallback

**Use as a fallback to `fetch-listing`, not a replacement.** Counterintuitive but accurate: the no-auth scraper returns more buyer-relevant data than the official API. Reach for this skill only when the scraper breaks.

## Status: ✅ validated end-to-end

Signing flow validated against a live approved Affiliate app. `search` and `detail` both round-trip successfully. The script ports the exact algorithm from the official Python SDK (`iop-sdk-python-20220609`).

## Why a fallback (not primary)

The AliExpress Affiliate API is built for affiliate-marketing publishers — its job is to drive conversions and track commission, not to support buyer-side analysis. Several fields a buyer cares about are simply not in the response:

| Field                       | `fetch-listing` (scraper) | `fetch-listing-api` (this skill) |
|-----------------------------|---------------------------|----------------------------------|
| Title, price, image         | ✅                        | ✅                                |
| Shipping fee (to IL)        | ✅                        | ❌                                |
| Shipping lead time          | ✅                        | ❌                                |
| Reviews / review snippets   | ✅                        | ❌                                |
| Specs / variants            | ✅                        | ❌                                |
| Top-rated store flag        | ✅                        | ❌ (only `shop_id`)               |
| Affiliate-catalogue only    | ❌                        | ✅ (limitation)                   |

The API also only returns products from sellers who **opted in to the affiliate program** — some publicly visible listings will return `current_record_count: 0`.

## When to actually use this skill

- The Puppeteer-based `fetch-listing` is failing (DOM rotation, anti-bot challenge, persistent rate-limit)
- You need a quick search across the affiliate catalogue without spinning up Puppeteer
- The user explicitly asked for the API path

For everything else, prefer `fetch-listing`.

## API endpoints

| Method                                         | Purpose                                |
|------------------------------------------------|----------------------------------------|
| `aliexpress.affiliate.productdetail.get`       | Detail for one or more product IDs     |
| `aliexpress.affiliate.product.query`           | Search the affiliate catalogue         |

Gateway: `https://api-sg.aliexpress.com/sync`

## Credential storage

Per the canonical plugin-data-storage convention, credentials live at:

```
${CLAUDE_USER_DATA:-$HOME/.claude-user-data}/aliexpress-israel-skills/config.json
```

with `0600` perms. Schema:

```json
{
  "aliexpress_affiliate": {
    "app_key": "...",
    "app_secret": "...",
    "gateway": "https://api-sg.aliexpress.com/sync",
    "sdk_version": "iop-sdk-python-20220609"
  }
}
```

The plugin repo never contains credentials. The skill resolves the path at runtime and refuses to operate if the file is missing or malformed.

## Setup

1. Apply at https://openservice.aliexpress.com/ as **Affiliates (Individual)**.
2. Create an Affiliate API app in the App Console. Once approved (status: online), grab the **App Key** and **App Secret**.
3. Write them to the config path above with `chmod 600`.

The Affiliate detail/query endpoints in this skill **do not require an OAuth access_token** — only the app-level signature.

## Usage

```bash
node scripts/ali-api.mjs detail <productId>[,<productId>...]
node scripts/ali-api.mjs search <query> [page_size]
```

`USD_ILS=<rate>` env var overrides the live FX lookup if needed.

## Output (detail)

```
1005009077622412 — Iron Wood Bedside Table Storage Rack ...
  url: https://www.aliexpress.com/item/1005009077622412.html
  price: $12.18 (was $16.46, 26% off)
  rating: 4.5
  shop: Jiexin Technology Store (https://www.aliexpress.com/store/1104400512)
  fx: 1 USD = ₪2.9798 (frankfurter@2026-04-24)
  item in ILS: ₪36.29   incl. VAT: ₪36.29   band: under-$75 (no VAT)
  (note: shipping fee is not exposed by the affiliate API; landed cost = item only)
```

## Output (search)

```
query: "wooden bedside organizer glasses phone"   results: 5/6
  <productId> — <title>
    $<sale> (was $<original>)   <rating>
    <clean product url>
  ...
```

## Signing algorithm (reference)

Mirrors `iop.base.sign(secret, api, parameters)` from the Python SDK:

1. Sort parameter keys alphabetically.
2. Concatenate `key1value1key2value2...` with no separator.
3. If the API method name contains `/`, prepend the method name to the concat string. (Affiliate methods like `aliexpress.affiliate.productdetail.get` do **not** contain `/`, so no prefix.)
4. `HMAC-SHA256(secret, concat).hexdigest().upper()` → `sign` parameter.

System parameters always included before signing:

- `app_key`
- `sign_method` = `sha256`
- `timestamp` = `str(int(time.time())) + '000'` (Unix seconds × 1000, as a string)
- `partner_id` = SDK version identifier (`iop-sdk-python-20220609`)
- `method` = the API method name
- `simplify` = `false`
- `format` = `json`

## What we drop from the API response

The raw API returns affiliate-specific fields not relevant to purchasing decisions. The script normalises and drops:

- `commission_rate`, `hot_product_commission_rate`
- `promotion_link` (tracked affiliate URL — replaced with the clean product URL)
- `sku_id`
- `app_sale_price`, `app_sale_price_currency`, `target_app_sale_price*`
- `sale_price`, `sale_price_currency` (CNY-denominated, redundant with USD-denominated `target_*`)
- `lastest_volume`, `tax_rate`
- `second_level_category_id`, `first_level_category_id`
- `product_small_image_urls` (kept only `product_main_image_url`)

The full raw response is still available if needed — the normalisation happens only in the printed summary.

## Out of scope

- **Shipping fee to IL** — not exposed by detail/query; use `fetch-listing` for that.
- **Order placement / tracking** — would require the DS (dropshipping) API, which we did not register for.
- **Authenticated user-context calls** — none of the methods used here need OAuth `access_token`.

## Validation checklist

1. `config.json` resolved from canonical path; `app_key` + `app_secret` non-empty.
2. `search` with a generic query returns ≥1 result and HTTP 200.
3. `detail` for a known affiliate-enabled product ID returns `current_record_count` ≥ 1.
4. FX lookup populates `fx-cache.json` in the plugin data dir.
5. Output drops all fields listed in "What we drop" above.
