---
name: fast-delivery-il
description: Keep only AliExpress listings that promise fast delivery to Israel — read per listing (and per SKU) from the delivery row and the "Fast delivery" badge, converted to days from today, and tested against a day limit (default 9). AliExpress has no server-side delivery-time filter on the Israel channel, so this is a skill, not a chip.
---

# Fast delivery to Israel

## What AliExpress actually exposes (verified 2026-10-26)

- **No search filter.** The IL search page defines only `freeshipping`,
  `choice_atm`, `4StarRating` and ship-from. No delivery-time switch exists, so this
  can't be server-side.
- **Search cards show no delivery days**, Choice or not. Choice cards say only
  `Free shipping over US $12` (HE: `משלוח חינם בהזמנות מעל ₪42`).
- **The listing page does:** a delivery row in `.dynamic-shipping`
  (`Delivery: Nov 02 - 07`, HE `מסירה: נובמבר 02 - 07`) and, on qualifying listings,
  a **`Fast delivery`** badge (HE `אספקה מהירה`) in the commitment block, alongside
  `₪4.00 coupon code if delayed`.
- The row is **per SKU**. Colours on the same listing can differ (seen: `Nov 02 - 07`
  vs `Nov 02 - 09` across listings). Read it with the SKU you'd buy selected.

**Don't use Choice as a proxy for speed.** Non-Choice listings sometimes carry the
same Fast-delivery lane, and only the listing row decides. On 2026-10-26, every
Choice SN30 Pro / Lite 2 listing checked (11) carried the badge,
with windows of 7–12 days (`Nov 02 - 07`) or 7–14 days (`Nov 02 - 09`) from today.
Re-checked 2026-10-26 18:24 UTC on 1005007345086449: still `Fast delivery`, `Delivery:
Nov 03 - 08`, so the lane had not been retired. Its absence from search cards is normal.

## Inputs

- `items`: listing ids (usually the search survivors, after `exclude-bundles`).
- `max_days` (default **9**).
- `bound`: which end of the window must be within `max_days`:
  - `start` (default): the window opens within `max_days` **and** the Fast-delivery
    badge is shown. This is "the fast lane" in AliExpress's own terms.
  - `end` (strict): the **latest** date is within `max_days`, so arrival is
    promised by then.
- `require_badge` (default true with `start`, false with `end`).

## Procedure

1. Locale check (`update-locale` `mode=check`). Ship-to must be IL. The language
   doesn't matter: the probe reads both EN and HE.
2. Per item run `$CLAUDE_PLUGIN_ROOT/scripts/listing-probe.js` (the same probe
   `true-price` uses, so run them together and probe once). Per SKU it returns
   `delivery`, `days_min`, `days_max` (from the browser's today) and `fast`.
3. Use the delivery of the SKU being bought (`true-price`'s `true_sku`), or else the
   best available SKU.
4. Verdict per listing:
   - `pass`: meets `bound`/`max_days` (and badge, if required)
   - `slow`: has a date window that fails it
   - `no-date`: no delivery row (the listing may not ship to IL, or the page failed
     to load). Report it, never pass it.
5. Record `delivery = {text, days_min, days_max, fast_badge, source: "listing"}`.
   `source` becomes `ship-options-il` when the full options modal was read instead.

## Output

```
Fast delivery ≤9 d (bound=start, badge required): 7 of 11 pass
  pass  1005007345086449  Nov 02 - 07  7–12 d  Fast   SN30 Pro-GB
  slow  1005010150728724  Nov 02 - 09  7–14 d  Fast   (fails bound=end only)
  …
```

Always print the rule in the header. "Fast" means nothing without the number and
the bound.

## Not covered

- The **full shipping-options modal** (other carriers, paid faster lanes): still
  uncaptured. That's `ship-options-il`. A listing failing here may have a paid fast
  lane in the modal.
- Delivery to a specific address or postcode. The promise shown is the region-level
  estimate for IL.
