# Israel import tax — the numbers every skill shares

Consolidated so `fetch-listing`, `cart-vat-nudge`, `find-under-75` and
`free-shipping-only` state the same thing. **Verify at runtime** — these figures have
been politically live and have changed before. If a check contradicts this file,
trust the check and fix this file.

Last reviewed: 2026-09-01.

## Bands

| Goods value (USD, ex-shipping) | Treatment |
|---|---|
| ≤ $75 | **Exempt** — no VAT, no purchase tax |
| $75 – $500 | ~18% VAT on the **CIF** value (goods + shipping + insurance) |
| > $500 | VAT + purchase tax, customs duty possible (out of scope here) |

VAT rate: **18%** (since January 2025). Every skill takes a `vat_rate` override.

## The two traps

**1. FOB for the threshold, CIF for the charge.** The $75 de-minimis is assessed on
the *goods* value, excluding shipping. But once VAT applies, it is charged on goods
+ shipping + insurance. So a $74 item with $6 shipping is exempt; a $76 item with $6
shipping is taxed on $82. Always report the two figures separately — conflating them
is the single most common error in this domain.

**2. It is a cliff, not a ramp.** VAT applies to the *whole* order value, not the
excess above $75.

```
goods $74  →  pay ~$74
goods $76  →  pay ~$76 + 18% = ~$89.7
```

$2 more of goods costs ~$16 more. This is the entire reason `cart-vat-nudge` and
`find-under-75` exist.

## Working headroom

Because the cliff is expensive and the inputs drift, skills that *hunt* for
under-threshold items work to a tighter line than $75:

- **Item price ceiling $70** — ~7% buffer against FX movement between reading the
  price and the parcel being assessed.
- **Landed (item + shipping) ceiling $75** — the hard stop.

An item at $72 with free shipping is *legally* fine and *operationally* risky: the
ILS→USD rate moving 4% between checkout and assessment puts it over. Report anything
in the $70–$75 band as a flagged pass, not a clean one.

## FX

Convert with a live rate — **frankfurter.app** (ECB), 24h cache, `USD_ILS` env var as
an override. If the rate is unreachable and no override is set, **stop**. Do not
guess a rate; every number downstream depends on it. Always print the rate and its
source date alongside any USD figure derived from an ILS price.

## Caveats to pass through to the user

- **AliExpress may collect Israeli VAT at checkout** on some orders rather than
  leaving it to be assessed on import. When it does, the checkout total already
  includes it and adding your own VAT estimate double-counts. Check the checkout
  tax line before quoting a landed figure as final.
- **Splitting an order to stay under the line is legitimate**, but repeated
  same-day parcels to one address can be consolidated by customs and assessed
  together. Flag it as a tactic that usually works, never as a guarantee.
- **Choice items ship consolidated.** Items in one Choice parcel are likely assessed
  together, so "split them across two orders" may not produce two consignments.
- **Promo prices expire.** A cart sitting just under $75 on promotional pricing goes
  over when the promo lapses. Assess on what the user will actually pay, and flag
  the exposure.
- Handling/clearance fees charged by the carrier are separate from tax and are not
  modelled by any skill here.


## The computed de-minimis position  (added 2026-09-04)

`skills/open-checkout/scripts/read-confirm-page.js` returns a `deMinimis` object so
skills stop re-deriving this arithmetic. It carries **two** percentages on purpose:

| Field | Meaning |
|---|---|
| `goodsPct` | `goods / 75` — **decides exemption.** Customs tests goods value ex-shipping |
| `landedPct` | `(goods + shipping) / 75` — the operational ceiling `find-under-75` enforces |
| `headroomUsd` | `75 - goods`; how much more can be added before VAT applies |
| `band` | `GREEN` <80%, `AMBER` 80–99.9%, `RED` >=100% — banded on `goodsPct` |
| `exempt` | `goods < 75` |
| `taxableBaseIfCrossed` | goods + shipping; what VAT would be charged on |

The two diverge exactly where it matters. A $74 item with $6 shipping is **exempt**
at `goodsPct` 98.7%, while its `landedPct` is 106.7%. Reporting only the landed
figure would call an exempt order taxable; reporting only the goods figure hides that
it costs $80 to land. Report both, and never band on `landedPct`.

`band` is the same vocabulary `cart-vat-nudge` already uses, so its output can be fed
straight in.

If the session renders ILS the object returns `convertible: false` and no percentage —
the $75 threshold is USD-denominated and the script will not invent a rate.
