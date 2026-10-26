---
name: deep-search
description: The honest AliExpress search. Searches, drops bundle-deal cards, then opens every plausible listing to resolve its true price for the SKU the user actually wants and its real delivery promise to Israel — so the ranking is on what you'd pay and when it arrives, not on card prices hooked to the cheapest variant. Composes search-aliexpress, exclude-bundles, true-price, fast-delivery-il and export-findings.
---

# Deep search

Card prices lie in two common ways. **Bundle cards** show the cheapest bundle
component (`exclude-bundles`). **Ordinary cards** show the cheapest SKU, which may be
an accessory, a different model or a one-time new-buyer price (`true-price`). A
normal search sorted by price ranks those traps first. This skill ranks on the
resolved numbers instead.

## Inputs

- `queries`: one or more (e.g. `8BitDo SN30 Pro`, `8BitDo Lite 2`).
- `target`: what must be bought, in words, plus hard requirements
  (`SN30 Pro, Bluetooth, controller only, 1 unit`).
- `choice` (default **false**): Choice-only search. Off by default because **Choice
  and fast delivery are independent**. Non-Choice listings sometimes carry the
  same ~9-day Fast-delivery lane to Israel, and a Choice-only search hides them.
  Choice is reported per result either way.
- `max_days` (default 9) and `bound` (`start` | `end`, see `fast-delivery-il`).
- `price_ceiling` (optional): skip cards far above it. Keep a margin, since cards can
  understate.
- `max_probe` (default 15): cap on listings opened per query.

## Procedure

1. **Locale:** `update-locale mode=check` (preference default EN/USD, ship to IL).
2. **Search:** per query, build the URL and navigate. Don't click chips: a chip
   click can leave the grid stale (`reference/selectors.md`). Choice is
   `selectedSwitches=filterCode%3Achoice_atm`. `&sortType=price_asc` sorts by price,
   which surfaces the anchored cards to check. Extract with
   `scripts/search-cards.js`.
3. **Drop, with reasons** (each goes to `dropped`):
   - `bundle-deal card` (`exclude-bundles`)
   - `off-target`: the title isn't the target model. Accessories, parts, other
     models, and hard-requirement misses (e.g. `Wired USB` when Bluetooth is
     required). Judge on the title, conservatively. If unsure, keep it for probing.
4. **Probe** the survivors (cheapest first, up to `max_probe`) with
   `scripts/listing-probe.js`. For more than ~3 listings, run the sweep in a
   subagent that appends JSONL to a scratch file, so the main context sees only the
   summary. Stop and hand over on a captcha.
5. **Resolve** per listing: `true-price` (classify SKUs, pick `true_sku`, gap) and
   `fast-delivery-il` (verdict on the `true_sku`'s delivery).
6. **Verdict** per listing: `pass` | `slow` | `anchored` (true price far above card
   and above the best pass) | `off-target` (SKUs show it isn't the target after
   all) | `needs-human` | `unavailable`.
7. **Rank** passes by true price, then delivery `days_max`, then rating × review
   count. Write a one-sentence bottom line with the pick and the runner-up.
8. **Export:** `export-findings` into the working repo's `findings/`.

## Output

The `export-findings` paths plus a short block:

```
Deep search: "8BitDo SN30 Pro bluetooth" · Choice: off · ≤9 d (bound=start) · EN/USD → IL
Cards 60 · bundles 0 · off-target 8 · probed 15 · pass 4 · anchored 3 · slow 6
Best: 1005007345086449 SN30 Pro-GB $38.19, Nov 02–07, Fast, ★4.9 (653), 5,000+ sold
Runner-up: …
Findings: findings/2026-10-26_sn30pro-bt.{md,pdf,brief.json,json}
```

## Notes

- Never infer delivery from Choice status, either way. Many non-Choice listings are
  slow to IL, but some carry the Fast-delivery lane. Only the listing's own delivery
  row decides.
- New-buyer prices (`New shoppers save …` on the card) are excluded from
  `true_price` unless the user is a new buyer.
