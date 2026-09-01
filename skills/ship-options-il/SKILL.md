---
name: ship-options-il
description: Enumerate and evaluate every shipping option a listing offers to Israel — carrier lane, cost, lead time, tracking, tax-at-checkout — and recommend one. The logistics half of a buy decision, which the search skills deliberately leave out.
---

# Shipping Options to Israel

For one listing (or each of a shortlist), open the delivery panel, read **every**
shipping option offered to Israel, and evaluate them against each other rather than
accepting the default the site pre-selects.

## Why this is its own skill

The search skills return a price. The price is the smaller half of the decision for
an Israeli buyer:

- **The collapsed shipping row is not the menu.** AliExpress pre-selects one option —
  usually the cheapest, frequently a 30–60 day lane. A ₪4 upgrade often halves the
  wait. You cannot see that without opening the panel.
- **"Free shipping" says nothing about speed.** Free is routinely the slowest
  carrier. See `free-shipping-only`, which filters on the flag but explicitly does
  not evaluate the lane.
- **Ship-from country dominates lead time.** An IL-warehouse listing arrives in
  days; the identical item from CN takes weeks. The search filter exposes this but
  the cards do not always show it.
- **Choice is consolidated logistics**, which changes both the delivery estimate and
  how customs treats the parcel — Choice items in one order likely clear as one
  consignment. That matters to `cart-vat-nudge`'s split-order advice.
- **Shipping cost feeds the tax calculation.** Once over $75 the VAT is charged on
  CIF, so the shipping figure is not a rounding error — see
  `$CLAUDE_PLUGIN_ROOT/reference/israel-tax.md`.

## When to use

- User asks "how long will this take to get here", "what are my shipping options",
  "is it worth paying for faster", "does this actually ship to Israel"
- Between `search-aliexpress` and a buy decision, on the two or three finalists
- Before `find-under-75`, when the landed figure depends on which lane is chosen
- When a listing shows free shipping and the user wants to know the catch

## Inputs

- `url` (required) — listing URL, or an item id. Accepts a list for shortlist mode.
- `sku` (optional) — variant to price. Shipping can differ per variant (weight
  bands); if omitted, use the default and **say so**.
- `qty` (optional, default 1) — shipping frequently does not scale linearly, and
  some lanes only unlock above a subtotal.
- `priority` (optional, default `balanced`) — `cheapest` | `fastest` | `balanced` |
  `tracked`. Drives the recommendation, not the extraction.

## Browser route

Chrome first. See `$CLAUDE_PLUGIN_ROOT/reference/browser.md` for the route order,
tool mapping and the ILS/Hebrew/ship-to-IL locale handshake — **do the handshake
before reading any figure**, because the whole panel is keyed on ship-to country.

Confirm ship-to is Israel from the rendered page, not from an assumption:

```js
document.body.innerText.match(/ישראל|Israel/)?.[0] ?? 'SHIP-TO NOT CONFIRMED'
```

If ship-to is not Israel, the options listed belong to another country. Stop, fix
the region, re-read.

## Extraction

Selectors for this panel are **not yet validated** — see the `(U)` section of
`$CLAUDE_PLUGIN_ROOT/reference/selectors.md`. Work text-first, and promote what you
find into that file with a date.

### 1. Open the panel

The collapsed row shows one option. Find and click the shipping row to expand the
full list:

```js
// Text anchor — most durable. Returns the clickable shipping row.
const row = [...document.querySelectorAll('div,button,a')]
  .filter(el => /^(משלוח|Shipping|אספקה|Delivery)/i.test(el.textContent.trim()))
  .sort((a, b) => a.textContent.length - b.textContent.length)[0];
```

Click it with `computer`/`browser_click` on the element's box rather than a
synthetic `.click()` where possible — the panel is sometimes gated on a real
pointer event. A modal (`[class*="comet-v2-modal"]`) or an inline expansion appears.

### 2. Read every option

Each option row carries some subset of: carrier/lane name, cost (or "חינם" / "Free"),
estimated delivery window, and a tracking indicator. Extract as text and parse:

```js
[...document.querySelectorAll('[class*="comet-v2-modal"] [class*="item"], [class*="dynamic-shipping"] [class*="line"]')]
  .map(el => el.innerText.trim())
  .filter(Boolean);
```

Then parse each blob for:

| Field | Cue |
|---|---|
| `carrier` | lane name — `AliExpress Standard`, `Choice`, `Cainiao`, a courier brand |
| `cost_ils` | `₪` amount, or free (`חינם` / `Free`) |
| `lead_min` / `lead_max` | day range — `10-30`, `10–30 ימים`, or a delivery date |
| `tracked` | presence of tracking wording; **absence is not proof of untracked** |
| `ship_from` | origin country if the panel states one |

**Do not invent a field the panel did not show.** Emit `null` and mark it unknown.
A guessed lead time on a logistics decision is worse than a blank.

### 3. Capture procedure (run once, then update the reference)

The first time this skill runs against the live site, record what actually worked:
the selector that found the row, the selector that enumerated options, and one raw
`innerText` sample of an option row. Write them into the `(U)` section of
`reference/selectors.md`, change the status to `V`, and date it. That is the whole
point of the section existing.

## Evaluation

Rank the options; do not just relay them.

1. **Normalize** — every option to `{cost_ils, cost_usd, lead_min, lead_max}`. Use
   the shared FX rule (`reference/israel-tax.md`): live frankfurter rate, print the
   rate, stop if unavailable.
2. **Compute the upgrade cost of time** — for each non-cheapest option,
   `₪ per day saved = (cost − cheapest_cost) / (cheapest_lead_mid − this_lead_mid)`.
   This is the number that actually answers "is faster worth it".
3. **Flag the structural facts**, which matter more than small cost deltas:
   - shipping from **IL** → days not weeks; usually worth a premium
   - **Choice** → consolidated, generally faster and more reliably tracked than a
     seller-arranged lane at similar cost
   - a lane with **no tracking** on a parcel worth real money is a risk, not a saving
   - an option whose window **exceeds the buyer-protection period** is a trap — the
     protection can lapse before the parcel lands
4. **Recommend one**, per `priority`, in a sentence with the reason.
5. **Hand the chosen shipping cost onward** to `fetch-listing` / `find-under-75` /
   `cart-vat-nudge` — the landed figure is only meaningful for a *specific* lane.

## Output format

```
Listing: <title>   item <id>
Ship-to: Israel (confirmed on page)   Locale: ILS verified
Variant: <sku or "default (not selected)">   Qty: <n>
Route: claude-in-chrome        FX: 1 USD = ₪<rate> (<source>@<date>)

Shipping options to IL (<N> found):
  carrier                    cost      lead        tracked
  AliExpress Standard        ₪7.49     10–30 d     yes
  Choice consolidated        free      12–18 d     yes
  <lane>                     ₪24.10    5–9 d       yes
                                                   ← unknown fields shown as "?"

Cost of time:
  Choice → <lane>:  ₪24.10 for ~8 days saved  =  ₪3.01/day

Structural notes:
  • ships from CN — no IL-warehouse option on this listing
  • Choice parcel: consolidates with other Choice items in the same order
  • <lane> window (5–9 d) is inside buyer protection; Standard's 30 d upper is not

Recommendation (priority=balanced):
  Choice consolidated — free, tracked, and only ~6 days behind the paid lane.

Landed at this lane: item ₪<x> + ship ₪<y> = ₪<z>  ($<usd>)   VAT band: <…>
Next: `find-under-75` if you are working the de-minimis; `cart-vat-nudge` if buying several.
```

For shortlist mode, emit one block per listing plus a comparison line naming the
best *landed* option across all of them — not the best sticker price.

## Out of scope

- Order tracking after purchase. Different surface entirely, not covered.
- Predicting customs behaviour beyond the documented bands in `israel-tax.md`.
- Local Israeli retailer comparison.
- Changing the selected shipping option in the cart — read-only, per plugin policy.

## Validation checklist

1. Ship-to Israel confirmed **from the rendered page**, not assumed.
2. The panel was **expanded** — a single option reported from a collapsed row is a
   failure of this skill, not a listing with one option. Say which you saw.
3. Every option carries a cost and a lead time, or an explicit `?` for what the page
   did not show. No inferred values.
4. FX rate printed with source and date on any USD figure.
5. A recommendation was made and justified in one sentence.
6. If selectors had to be discovered, `reference/selectors.md` was updated.
