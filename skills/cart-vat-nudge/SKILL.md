---
name: cart-vat-nudge
description: Track a running AliExpress cart total in USD and nudge as it nears or crosses Israel's $75 VAT-free de-minimis, where ~18% VAT begins.
---

# Cart VAT Nudge (Israel $75 de-minimis)

Keep a running total of an AliExpress cart in USD and warn the user as it approaches — and especially as it crosses — Israel's **$75 VAT-free de-minimis**. Below the line the order is exempt from VAT and purchase tax; above it, VAT (~18% as of 2025) applies, and because VAT is charged on the **whole** order value (not just the excess), crossing $75 by a little costs a lot.

## Why this exists

Israeli import de-minimis (verify at runtime — it has changed before):

| Goods value (USD, ex-shipping) | Tax                                                  |
|--------------------------------|------------------------------------------------------|
| ≤ $75                          | **Exempt** — no VAT, no purchase tax                 |
| $75 – $500                     | ~18% VAT on the CIF value (goods + shipping + ins.)  |
| > $500                         | VAT + purchase tax, possible customs duty            |

The $75 boundary is a **cliff, not a ramp**. A $74 order lands at ~$74; a $76 order lands at ~$76 × 1.18 ≈ **$89.7**. So the marginal $2 item can add ~$16 of tax to the whole basket. That is the moment worth catching.

## Inputs

- `cart` (required) — a list of line items the user is considering. Either hand-assembled, or taken straight from `export-cart`'s `items[]` (see the mapping in that skill). Each item:
  - `title` (string)
  - `url` (optional — AliExpress item URL)
  - `unit_price` (number) with `currency` (`ILS` or `USD`; default `ILS` since the site is pinned to ILS)
  - `qty` (integer, default 1)
- `include_shipping` (optional, default `false`) — whether to add shipping into the value tested against the threshold. **The de-minimis is assessed on goods value (FOB), so default is false**; but VAT, once it applies, is charged on CIF (goods + shipping). Report both.
- `usd_ils` (optional) — override FX rate. Otherwise fetch live (frankfurter.app / ECB, 24h cache) as `fetch-listing` does.
- `vat_rate` (optional, default `0.18`).

## Procedure

1. **Get the FX rate.** Convert every ILS line to USD. If FX is unreachable and no `usd_ils` override is given, stop and say so — do not guess the rate.
2. **Sum goods value** in USD: `Σ unit_price_usd × qty`. Call this `goods_usd`.
3. **Classify** against $75 (and $500):
   - `goods_usd ≤ 60` → **GREEN** — comfortably under; no action.
   - `60 < goods_usd ≤ 75` → **AMBER** — approaching the line. Report headroom (`$75 − goods_usd`) so the user knows how much room is left before VAT kicks in.
   - `goods_usd > 75` → **RED / cliff** — VAT now applies to the whole order. Compute the penalty and offer the split option (below).
   - `goods_usd > 500` → **RED+** — purchase tax / duty band; flag separately.
4. **Compute the landed cost** in each state:
   - Under $75: `landed = goods_usd (+ shipping if any)`, VAT = 0.
   - Over $75: `vat = (goods_usd + shipping_usd) × vat_rate`; `landed = goods_usd + shipping_usd + vat`.
5. **On RED, quantify the cliff and suggest a fix:**
   - Show how far over the line the cart is (`goods_usd − 75`) and the VAT it triggers.
   - If trimming one or two low-value items would bring it back to ≤ $75, name them and show the saving.
   - If the user wants everything, suggest **splitting into two separate orders/parcels** each ≤ $75 (each stays exempt) — note this only works if they genuinely ship as separate consignments; consolidated Choice parcels may be assessed together.

## Output format

```
Cart VAT check (Israel $75 de-minimis)
FX: 1 USD = ₪<rate>  (<source>@<date>)

Items: <N>   goods value: $<goods_usd>  (₪<goods_ils>)
Status: <GREEN | AMBER | RED>

<one-line verdict, e.g.:>
AMBER — $6.20 of headroom before VAT. One more ~$6 item tips the whole cart into ~18% VAT.

Landed estimate:
  goods:     $<goods_usd>
  shipping:  $<shipping_usd or n/a>
  VAT (18%): $<vat or 0.00>
  --------------------------------
  landed:    $<landed_usd>   (₪<landed_ils>)

<If RED, append the cliff + split suggestion.>
```

## Notes & caveats

- **Verify the threshold at runtime.** $75 (VAT) and $500 (duty) are the long-standing figures, but Israel has floated changes; confirm before treating a number as authoritative.
- **VAT rate** is ~18% since 2025 — pass `vat_rate` to override if it changes.
- The de-minimis is on **goods value**, but assessed VAT is on **CIF** (goods + shipping + insurance). Keep the two separate in the output so the user isn't misled.
- This skill does not read the cart itself — it works off line items handed to it. To act on the **real** cart rather than a hypothetical basket, run `export-cart` first and feed its `items[]` straight in (`unitPrice`→`unit_price`, `quantity`→`qty`, `productUrl`→`url`). Prices from `export-cart` are per-unit, so don't pre-multiply.
- When the items came from `export-cart`, decide whether to assess **selected items only** (what checkout would actually charge) or the whole cart, and **say which you used**. Defaulting to selected-only matches the site's own subtotal.
- `export-cart` reports `crossedPrice` alongside the live price. Assess the threshold on what the user will actually pay (`unitPrice`) — but if the cart is sitting just under $75 on promo pricing, flag that an expiring promo could push it over.
- Splitting orders to stay under de-minimis is a legitimate consumer choice, but repeated same-day split parcels to one address can be consolidated by customs — flag this rather than promising it always works.

## Validation checklist

1. Every ILS line was converted with a finite FX rate (or the skill stopped for lack of one).
2. `goods_usd` excludes shipping unless `include_shipping=true`.
3. Status is one of GREEN / AMBER / RED and matches the numeric band.
4. When RED, the output includes both the VAT amount and at least one mitigation (trim items or split order).
5. Both USD and ILS are shown for the final landed figure.
