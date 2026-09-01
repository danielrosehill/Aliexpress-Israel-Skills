---
name: search-aliexpress
description: Search AliExpress as an Israel buyer — ILS pricing, Choice-first, with free-shipping / 4★ / ship-from filters, driven in the user's own Chrome.
---

# Search AliExpress (Israel)

Search the site pinned to the Israel channel, Hebrew locale and ILS pricing, apply
listing-page filters, and return the visible product cards.

**Choice is the default focus.** Unless the user says otherwise, apply the Choice
filter (`choice=true`) — Choice listings ship on AliExpress's own consolidated
logistics to Israel (faster, more reliable, often free) and are the recommended
default for IL buyers.

## When to use

User wants to find a product on AliExpress and cares about ILS prices, shipping
availability to Israel, Choice listings, or filtering on free shipping / 4★+ /
ship-from country. Produces a first-pass shortlist to hand to `ship-options-il`
(logistics) or `fetch-listing` (landed cost).

## Inputs

- `query` (required) — free-text product query. Hebrew or English both fine.
- `filters` (optional, composable):
  - `choice: true` — Choice / Brand+ only. **Defaults true**; pass `false` to include
    non-Choice listings.
  - `freeshipping: true` — free shipping only
  - `rating4plus: true` — 4★ and up only
  - `premium: true` — Premium Quality badge only
  - `ship_from: "IL" | "CN" | "TR" | "all"` (default: leave alone)
- `max_results` (optional, default 20)

## Browser route and locale

**Drive the user's own Chrome first** (`mcp__claude-in-chrome__*`) — it is signed in,
carries the locale cookies already, and is challenged far less than a fresh
automation profile. Gateway Playwright is the fallback for unattended runs; headless
is a last resort.

Route order, tool mapping, the ILS/Hebrew/ship-to-IL handshake and its verification
snippet are all in **`$CLAUDE_PLUGIN_ROOT/reference/browser.md`**. Do the handshake
before reading any price. If the currency verification fails, **report it and stop** —
never return USD prices silently as if they were ILS.

## Entry point

```
https://he.aliexpress.com/w/wholesale-<url-encoded-query>.html
```

Use the `he.` subdomain — the site honours the cookie on any host, but `he.` is the
canonical Israel-Hebrew entry point.

## Filters and card extraction

Selectors live in **`$CLAUDE_PLUGIN_ROOT/reference/selectors.md`** — filter chips
(`aria-label="filterCode:…"`, click the wrapper not the input, assert `aria-checked`),
the ship-from radio group, and the defensive product-card query.

Two rules that cost time when ignored: **never anchor on hashed class names**, and
**wait for the results to re-render after every toggle** before reading cards.

Extract per card by **parsing the card's `innerText`**, not by class — the price sits
in hashed-class spans and `[class*="price"]` matches nothing (verified broken
2026-09-01; the working parse is in `reference/selectors.md`). Take `url` (de-duped by
item id — the same item appears in several ad slots), `title`, `priceText` (the
**first** currency match; the second is the crossed-out "was"), and any `Choice` /
`Max Combo` badges.

**Wait for the grid to settle before reading.** Results hydrate in stages over ~10s;
an early read returns a fraction of the cards and none of the filter chips. Poll
until the card count stops rising.

## Output format

```
Query: <query>              Route: claude-in-chrome
Filters: choice=… freeshipping=… rating4plus=… premium=… ship_from=…
Locale verified: c_tp=ILS, b_locale=iw_IL
Results URL: <full URL>
Result count: <N>

1. <title>
   ₪<price>   ship from: <country if visible>   badges: [Choice, Max Combo, …]
   <url>
2. …
```

## Out of scope

- Shipping options / lead times per listing — that's `ship-options-il`.
- Landed cost — that's `fetch-listing`.
- The $75 threshold — `find-under-75` (hunting) or `cart-vat-nudge` (running total).
- Local Israeli retailer comparison. Order placement or tracking.

## Validation checklist

1. Results URL contains `he.aliexpress.com/w/wholesale-`.
2. Locale verified per `reference/browser.md`. **Do not assume the `he.` host gave you
   ILS** — an account set to EN/USD renders `US $` on `he.aliexpress.com` (verified
   2026-09-01). Switch via the on-page picker or report the mismatch.
3. At least one product price string starts with `₪` — or the currency mismatch was
   reported explicitly.
4. Every requested filter's wrapper reads `aria-checked="true"` (including the Choice
   default).
5. Ship-from, if requested, matches the requested ISO-2 code.
6. The browser route actually used is named in the output header.
