---
name: find-under-75
description: Hunt AliExpress for items that land in Israel tax-free — item price ≤ $70, free shipping to IL, verified landed cost (item + shipping) under the $75 de-minimis. Search, price ceiling, shipping verification and threshold check in one pass.
---

# Find Under $75 (tax-free landing)

Search for products that will clear Israeli customs **with no VAT**, by holding three
conditions at once:

| Condition | Value | Why this number |
|---|---|---|
| Item price | **≤ $70 USD** | ~7% buffer under the line for FX drift between purchase and assessment |
| Shipping to IL | **free** | verified on the listing, not just the search chip |
| Landed (item + shipping) | **< $75 USD** | the hard stop |

Anything satisfying all three lands with no VAT and no purchase tax. See
`$CLAUDE_PLUGIN_ROOT/reference/israel-tax.md` for the bands and the FX rule.

## The two things that break this

**1. The threshold is per shipment, not per item.** Three $60 items in one order is
$180 of goods and is fully taxable. This skill finds *individually* qualifying items;
it does **not** license buying several. The moment the user wants more than one, run
`cart-vat-nudge` on the basket — that is the skill that owns the running total.
Say this out loud in the output. It is the most expensive misunderstanding available
in this domain.

**2. The de-minimis is on goods value, not landed.** Strictly, a $74 item with $8
paid shipping is still exempt, because shipping is excluded from the assessed value.
The `< $75 landed` rule here is deliberately tighter than the law — it is a buying
rule with a safety margin, not a statement of the regulation. If the user wants the
legally maximal basket, say so and drop to the goods-only test.

## When to use

- "Find me X that won't get taxed", "keep it under the customs limit", "tax-free finds"
- Budget shopping where crossing $75 would wipe out the saving
- Building a list of safe single-item orders
- Sanity-checking one candidate before buying — pass a `url` instead of a `query`

## Inputs

- `query` (required unless `url` given) — free-text product query, Hebrew or English
- `url` (optional) — check one specific listing against the three conditions instead
  of searching
- `item_ceiling_usd` (optional, default `70`) — lower it for a bigger FX buffer
- `landed_ceiling_usd` (optional, default `75`)
- `require_free_shipping` (optional, default `true`) — set `false` to allow paid
  shipping as long as landed stays under the ceiling
- `strict_fx` (optional, default `true`) — when true, flag anything in the
  $70–$75 landed band rather than passing it clean
- `max_results` (optional, default 20)

## Procedure

### 1. Search with the filters pre-applied

Run `search-aliexpress` with `freeshipping=true` and `choice=true` (Choice lanes to
Israel are the reliable free option). Prices come back in **₪** — the locale
handshake is mandatory, per `$CLAUDE_PLUGIN_ROOT/reference/browser.md`. Chrome
first.

AliExpress's own price filter is unreliable across currencies, so do **not** trust a
URL price parameter. Filter client-side on the parsed card price.

### 2. Convert and apply the item ceiling

Get one live FX rate (frankfurter/ECB, 24h cache) and use it for the whole run so
every candidate is compared on the same basis. Print the rate. If it is unavailable
and no `USD_ILS` override is set, **stop** — do not guess.

```
item_usd = price_ils / usd_ils
keep if item_usd <= item_ceiling_usd
```

Ranges (`₪10.00 - ₪25.00`) are the **from** price for the cheapest variant. Test the
low end to shortlist, but the variant the user actually wants may be over — carry the
range forward and re-check at step 3. Never report a range as if it were a price.

### 3. Verify shipping per candidate — the search chip is not enough

The `freeshipping` chip is a seller-set flag. Confirm on the listing itself via
`ship-options-il`, which opens the delivery panel and reads the real options for the
chosen variant and quantity. Two failure modes it catches:

- the chip is set but the free lane does not serve Israel for that variant
- free exists but its window is 45–60 days, which is a different kind of "no"

For the top candidates run `ship-options-il` properly. For the long tail, read the
card's shipping line and mark those results **`unverified`** — never present a
card-level reading as a verified landed cost.

### 4. Compute landed and classify

```
landed_usd = item_usd + shipping_usd
```

| Result | Classification |
|---|---|
| `landed < 70` | **CLEAR** — comfortable margin |
| `70 ≤ landed < 75` | **TIGHT** — passes, but flag: an FX move puts it over |
| `landed ≥ 75` | **OVER** — drop, and say by how much |

With `strict_fx=true`, TIGHT items are listed separately from CLEAR ones, not mixed
in. Show what FX move would break a TIGHT item:

```
breaks if USD/ILS moves below <rate_at_which_item_usd_hits_75>
```

### 5. Report, with the per-order warning

Rank by headroom (`75 − landed`) descending, not by price ascending — the goal is
tax-free margin, not the cheapest thing.

## Output format

```
Query: <query>                     Route: claude-in-chrome
Filters: freeshipping=true choice=true    Locale verified: ILS / iw_IL / region=IL
FX: 1 USD = ₪<rate> (frankfurter@<date>)
Ceilings: item ≤ $<70>   landed < $<75>

CLEAR — tax-free with margin (<N>):
  item_usd  ship   landed   headroom  title
  $42.10    free   $42.10   $32.90    <title>            <url>   [verified]
  $61.40    free   $61.40   $13.60    <title>            <url>   [verified]

TIGHT — passes but close (<M>):
  $71.80    free   $71.80   $3.20     <title>            <url>   [verified]
    ↳ breaks if USD/ILS falls below ₪<x> (currently ₪<rate>, ~4% away)

OVER — dropped (<K>):
  $78.20 (+$3.20 over) <title>
  $64.00 + $14.50 ship = $78.50 — free-shipping chip did not hold on this variant

Unverified (card-level shipping only, <J>): <count> — run ship-options-il to confirm

⚠ The $75 exemption is per shipment, not per item. Every line above qualifies
  ON ITS OWN, in an order containing nothing else. Two of them in one order is
  $<sum> of goods and is fully taxable. Run `cart-vat-nudge` before checking out
  with more than one.

Next: `ship-options-il` on anything marked unverified · `il-reviews-show` before buying ·
      `cart-vat-nudge` if this becomes a multi-item order.
```

## Composition

- **Built on** `search-aliexpress` (locale, Choice default, filters) and
  `free-shipping-only` (the chip and its caveats).
- **Uses** `ship-options-il` for real per-listing shipping verification.
- **Hands off to** `cart-vat-nudge` the moment more than one item is in play.
- **Pairs with** `hunt-pricing-anomaly` — a bulk tier is often the thing that pushes
  an otherwise-clear order over the line. Check the tier's total, not the unit price.
- **Contrast with** `fetch-listing`, which computes landed cost for one known URL
  without any threshold hunting.

## Out of scope

- Advising on how to split orders to evade assessment. Splitting is a legitimate
  consumer choice and `cart-vat-nudge` reports it as such, with the caveat that
  same-day parcels to one address can be consolidated by customs. Do not go further
  than that — no undervaluation, no misdeclaration, no gift-labelling suggestions.
- Purchase tax and duty above $500. Out of band.
- Guaranteeing a customs outcome. This is an estimate against published thresholds.

## Validation checklist

1. Locale/currency verified (prices read in ₪) and the route used is named.
2. One FX rate, printed with source and date, applied to every candidate.
3. Item ceiling applied in **USD**, not ₪.
4. Shipping is marked `verified` (via `ship-options-il`) or `unverified` (card-level)
   per line — never blended.
5. CLEAR / TIGHT / OVER assigned per line, with the FX-break rate shown for TIGHT.
6. The per-shipment warning appears in the output whenever more than one item is
   returned.
7. Price ranges were resolved to a real variant price before any pass/fail call.
