---
name: search-aliexpress
description: Search AliExpress as an Israel buyer — ship-to IL in the user's preferred locale (default EN/USD), Choice-first, with free-shipping / 4★ / ship-from filters, driven in the user's own Chrome. Card prices are indicative; use deep-search for resolved prices and delivery.
---

# Search AliExpress (Israel)

Search with ship-to Israel in the user's preferred locale (`set-locale`: default
EN/USD; EN/ILS, HE/USD, HE/ILS supported), apply listing-page filters, and return the
visible product cards.

**Card prices are not what things cost.** A card shows the listing's cheapest SKU, and
bundle cards show a bundle component. For a ranking on real prices and delivery, use
`deep-search` (or `exclude-bundles` + `true-price` on the results).

**Choice is the default focus.** Unless the user says otherwise, apply the Choice
filter (`choice=true`) — Choice listings ship on AliExpress's own consolidated
logistics to Israel (faster, more reliable, often free) and are the recommended
default for IL buyers.

## When to use

User wants to find a product on AliExpress and cares about prices, shipping
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

Route order, tool mapping, the locale handshake (preference + ship-to IL) and its verification
snippet are all in **`$CLAUDE_PLUGIN_ROOT/reference/browser.md`**. Do the handshake
before reading any price. If the currency verification fails, **report it and stop** —
never return prices in a currency other than the session's verified one, and never
convert silently. Run `update-locale mode=check` first.

## Entry point

Build the full URL and **navigate**. Don't toggle filter chips by clicking: on
2026-10-26 a chip click updated the URL and `aria-checked` but left the grid showing
the unfiltered cards.

```
https://www.aliexpress.com/w/wholesale-<dashed-query>.html?g=y&SearchText=<plus+query>
  &selectedSwitches=filterCode%3Achoice_atm        # Choice (other codes: freeshipping, 4StarRating)
  &shpf_co=IL                                      # ship-from (IL | TR | CN)
  &sortType=price_asc                              # optional
```

An IL account is redirected to `he.aliexpress.com/…?gatewayAdapt=glo2isr`. The
cookies, not the host, decide language and currency.

## Filters and card extraction

Selectors live in **`$CLAUDE_PLUGIN_ROOT/reference/selectors.md`** — filter chips
(`aria-label="filterCode:…"`, click the wrapper not the input, assert `aria-checked`),
the ship-from radio group, and the defensive product-card query.

Two rules that cost time when ignored: **never anchor on hashed class names**, and
**wait for the results to re-render after every toggle** before reading cards.

Extract with **`$CLAUDE_PLUGIN_ROOT/scripts/search-cards.js`** (pass the file as the
evaluate function). It scrolls until hydration stops, reads
`.search-item-card-wrapper-gallery` cards from leaf `textContent` (card `innerText`
came back empty on rendered pages, 2026-10-26), de-dupes by item id, and returns `id`,
`url`, `title`, `card_price` (first currency match; the second is the crossed-out
"was"), `rating`, `sold`, `ad`, `shipping_tag` and **`bundle`** (link goes to
`BundleDeals2`). Choice/Brand+ badges are images, not text, so with the Choice switch
on, every non-bundle card is Choice.

**Wait for the grid to settle before reading.** Results hydrate in stages over ~10s;
an early read returns a fraction of the cards and none of the filter chips. Poll
until the card count stops rising.

## Output format

```
Query: <query>              Route: claude-in-chrome
Filters: choice=… freeshipping=… rating4plus=… premium=… ship_from=…
Locale verified: EN/USD, region=IL (switcher, lang, glyph)
Results URL: <full URL>
Result count: <N>

1. <title>
   <card price, session currency>   bundle: yes/no   badges: […]
   <url>
2. …
```

## Out of scope

- Shipping options / lead times per listing — that's `ship-options-il`.
- Landed cost — that's `fetch-listing`.
- The $75 threshold — `find-under-75` (hunting) or `cart-vat-nudge` (running total).
- Local Israeli retailer comparison. Order placement or tracking.

## Validation checklist

1. Results URL contains `/w/wholesale-` and the requested `selectedSwitches`.
2. Locale verified per `reference/browser.md` and matching the user's preference
   (default EN/USD). The host doesn't decide it.
3. Card prices carry the session's currency glyph (`US $` or `₪`).
4. Every requested filter's wrapper reads `aria-checked="true"` (including the Choice
   default).
5. Ship-from, if requested, matches the requested ISO-2 code.
6. The browser route actually used is named in the output header.
