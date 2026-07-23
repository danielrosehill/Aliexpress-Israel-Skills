---
name: search-aliexpress
description: Search AliExpress as an Israel buyer — ILS pricing, Choice-first, with free-shipping / 4★ / ship-from filters, in a local browser.
---

# Search AliExpress (Israel)

Search AliExpress with the site pinned to the Israel channel, Hebrew locale, and ILS pricing, then optionally apply listing-page filters before returning the visible product cards.

**Choice is the default focus.** Unless the user says otherwise, apply the Choice filter (`choice=true`) — Choice listings ship on AliExpress's own consolidated logistics to Israel (faster, more reliable, often free) and are the recommended default for IL buyers.

## When to use

User wants to find a product on AliExpress and cares about:

- ILS prices (not USD)
- Shipping availability to Israel
- Choice listings (default), and/or filtering on free shipping / 4★+ / ship-from country
- A first-pass shortlist they can hand off to `fetch-listing` for landed cost

## Inputs

- `query` (required) — free-text product query. Hebrew or English both fine.
- `filters` (optional, any combo):
  - `choice: true` — Choice / Brand+ products only. **Defaults to true**; pass `choice=false` to include non-Choice listings.
  - `freeshipping: true` — free shipping only
  - `rating4plus: true` — 4★ & up only
  - `premium: true` — Premium Quality badge only
  - `ship_from: "IL" | "CN" | "TR" | "all"` — ship-from country (default: leave alone, i.e. "all")
- `max_results` (optional, default 20) — how many product cards to return.

## Driving the browser (local)

Drive AliExpress in a **local, visible browser** via Playwright (the `playwright` MCP tools). Do not run headless — AliExpress challenges headless contexts far more aggressively. Reuse the persistent profile if one is available so the locale cookies and any login stick between runs.

## Locale & currency setup

The site must render in **ILS + Hebrew** before scraping. Two cookies on `.aliexpress.com` control this (validated against live DOM):

- `aep_usuc_f` — set subkeys `c_tp=ILS` and `b_locale=iw_IL`
- `xman_us_f`  — set subkeys `x_locale=iw_IL` and `intl_locale=iw_IL`

Both are `Secure`, `SameSite=None`, not HttpOnly, writable from JS. `region=IL` and `site=isr` should already be set on an IL account and should not be touched.

If the cookies are not present (fresh browser context), navigate to `https://he.aliexpress.com/` once and let the site write them, then verify `c_tp=ILS` before continuing. If currency still shows `US $` on the results page, fall back to the on-page currency picker.

## Entry point

Search results URL pattern:

```
https://he.aliexpress.com/w/wholesale-<url-encoded-query>.html
```

Use the `he.` subdomain (Hebrew). The site honours the cookies regardless, but the `he.` host is the canonical Israel-Hebrew entry.

## Filter application

All selectors below are validated against live DOM. Class names like `il_v`, `ip_iq`, `ie_a6` rotate per build — **never** anchor on those. Always use `aria-label`.

### Filter-row checkboxes

Click the **wrapper `<span>`**, not the inner `<input>`. State is reflected on the wrapper via `aria-checked`.

| Filter          | Selector                                   |
|-----------------|--------------------------------------------|
| Free shipping   | `[aria-label="filterCode:freeshipping"]`   |
| Choice          | `[aria-label="filterCode:choice_atm"]`     |
| 4★ & up         | `[aria-label="filterCode:4StarRating"]`    |
| Premium Quality | `[aria-label="filterCode:PremiumQuality"]` |

To toggle on:

```js
const el = document.querySelector('[aria-label="filterCode:choice_atm"]');
if (el.getAttribute('aria-checked') !== 'true') el.click();
```

### Ship-from country (radio group)

Single-select. Options on an IL account: `-1` (All) / `IL` / `TR` / `CN`.

```js
document.querySelector('[aria-label="IL"]').click();   // ship from Israel
```

Read current selection:

```js
document.querySelector('.il_v [aria-checked="true"]').getAttribute('aria-label');
```

(`.il_v` is hashed-prefix-stable enough to scope the read; if it rotates, fall back to scoping under the "Shipping from" header by text.)

After toggling any filter, wait for results to re-render (network idle or a short fixed delay) before reading product cards.

## Reading product cards

Product cards on the results page do not have a single un-hashed anchor — class names rotate. Use a defensive query:

```js
[...document.querySelectorAll('a[href*="/item/"]')]
  .map(a => ({
    url: a.href,
    title: a.querySelector('[class*="title"], h3, [title]')?.getAttribute('title')
        || a.querySelector('[class*="title"], h3')?.textContent?.trim(),
    priceText: a.querySelector('[class*="price"]')?.textContent?.trim(),
  }))
  .filter(c => c.url && c.title);
```

Extract:

- `url` — absolute product URL (de-dup by item id; the same item can appear via multiple ad slots)
- `title` — product title in Hebrew (since locale is `iw_IL`)
- `priceText` — raw price string, expected to start with `₪` since currency is ILS
- `badges` — read `Choice` / `Max Combo` badges from the card if present (Max Combo is a per-card badge, not a server-side filter)

Parse the price separately; do not assume a fixed format. Common patterns: `₪12.34`, `₪1,234.56`, range `₪10.00 - ₪25.00`.

## Output format

Return a structured block:

```
Query: <query>
Filters: choice=… freeshipping=… rating4plus=… premium=… ship_from=…
Locale verified: c_tp=ILS, b_locale=iw_IL
Results URL: <full URL>
Result count: <N>

1. <title>
   ₪<price>   ship from: <country if visible on card>   badges: [Choice, Max Combo, …]
   <url>

2. …
```

If currency verification fails (cookies didn't take), report that explicitly and stop — don't return USD prices silently.

## Playwright notes

- Use a **visible** browser. AliExpress is aggressive about anti-bot heuristics and headless contexts get challenged more often.
- Reuse a persistent browser profile if available — the cookies above stick to that profile and you avoid the locale handshake on every run.
- Do **not** trigger any `alert` / `confirm` / `prompt` dialogs. If a cookie / consent / region modal appears on first visit, dismiss it via its own close button.
- Wait for network idle after each filter toggle; AliExpress re-fetches the result set.
- Hebrew RTL: prefer role/name and `aria-label`-anchored selectors over positional ones.

## Out of scope (for this skill)

- Does **not** compute landed cost (item + shipping + VAT/customs) — that's `fetch-listing`.
- Does **not** track a running cart total — that's `cart-vat-nudge`.
- Does **not** compare against local Israeli retailers.
- Does **not** track orders or place orders.

## Validation checklist (before declaring success)

1. Results URL contains `he.aliexpress.com/w/wholesale-`.
2. `aep_usuc_f` cookie has `c_tp=ILS` and `b_locale=iw_IL`.
3. At least one product price string starts with `₪` (or contains `ILS`).
4. Each requested filter's wrapper has `aria-checked="true"` (including Choice by default).
5. Ship-from selection (if requested) matches the requested ISO-2 code.
