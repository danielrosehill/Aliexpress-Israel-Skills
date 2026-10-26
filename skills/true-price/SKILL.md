---
name: true-price
description: Find what an AliExpress listing really costs for the thing the user wants. Opens the listing, clicks through every SKU, and reports the price of the matching SKU next to the search-card price — exposing cards whose price is hooked to the cheapest variant (a cable, a case, a spare part) or to a bundle. Also reads each SKU's delivery promise. Read-only.
---

# True price

## The gotcha this exists for

A search card shows **one** price for a listing that may have many SKUs. That price
is usually the **cheapest SKU**, not the variant in the photo or the title. A
controller listing whose cheapest variant is a thumbstick cap shows the cap's price
on the card. A "1 or 2 units" listing shows the one-unit price, and so on. Bundle cards
(see `exclude-bundles`) are the same trick at listing level. Sorting or filtering
on card prices compares the wrong numbers.

So: **never report a card price as what something costs.** Resolve it.

## Inputs

- `items`: listing ids or URLs (typically the survivors of a search).
- `target`: what the user actually wants, in words (`SN30 Pro controller`,
  `Lite 2 controller`, `1 unit`). Used to pick the matching SKU.
- `card_prices` (optional): `{id: price}` from the search, to compute the gap.
- `exclude_terms` (optional): extra words marking a SKU as *not* the target.

## Procedure

1. Locale check first (`update-locale` `mode=check`).
2. Per item: navigate to `https://www.aliexpress.com/item/<id>.html`, then run
   **`$CLAUDE_PLUGIN_ROOT/scripts/listing-probe.js`** as the evaluate function. It
   waits for the shipping block, clicks every enabled tile in every `[data-sku-row]`
   (`[data-sku-col]`, stable attributes) and returns per SKU: `name`, `price`,
   `orig`, `delivery`, `days_min`, `days_max`, `fast`, `stock`, plus listing
   `store`, `rating`, `reviews`, `sold`, `choice`.
   - `{error: "captcha"}` → stop and ask the user to solve it in the browser. Never
     try to get past it automatically. A signed-in profile is challenged far less.
   - Many items → run the sweep in a subagent writing JSONL, so the probe source and
     raw results don't sit in the main context.
3. Classify each SKU against `target`:
   - **match**: the SKU name fits the target, or is a plain colour/edition of it.
   - **accessory**: the name says case, bag, cable, cap, grip, skin, sticker, stand,
     holder, charger, adapter, receiver, dock, or is otherwise not the target.
   - **multi**: 2pcs, x2, set, pack, "2 units".
   - **unavailable**: `disabled: true`.
   If a name is ambiguous (a bare `Android`, `Type-C`), look at its tile image alt
   or price relative to the others. Never guess silently: mark `needs-human` and say why.
4. `true_price` = lowest-priced **match** SKU. Keep the price range across match SKUs
   and name the SKU (`true_sku`).
5. `price_gap_pct` = (true_price − card_price) / card_price × 100. Flag
   **ANCHORED** when ≥ 10%: the card price belonged to a cheaper non-target SKU or a
   promo the user won't get.
6. Note one-time prices: new-buyer deals ("New shoppers save…") show on cards and
   don't apply to an established account.

Delivery per SKU comes from the same probe. If the matching SKUs differ in delivery,
report the one for `true_sku`. `fast-delivery-il` uses this.

## Output (per item)

```
1005007345086449  8Bitdo Wireless SN30 Pro Gamepad…   ★4.9 (653)  5,000+ sold  Choice
  card $38.39 → true $38.19 (SN30 Pro-GB; Gray $38.39)   gap −1%
  delivery Nov 02 - 07 (7–12 d)  Fast delivery   stock 64
  SKUs: SN30 Pro-GB $38.19 · SN30 Pro-Gray $38.39 · Android (unavailable)
```

For several items, hand the records to `export-findings` rather than printing them
all.

## Validation

- Every reported true price names its SKU.
- Every SKU the probe saw is classified. None silently dropped.
- Currency glyph on the listing matches the session locale.
