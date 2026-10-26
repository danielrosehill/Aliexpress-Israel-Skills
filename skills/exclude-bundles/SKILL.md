---
name: exclude-bundles
description: Drop AliExpress "Bundle deals" cards from search results — cards that link to a BundleDeals landing page and show the price of the cheapest component, not of the item pictured — and account for every drop. Client-side; AliExpress has no switch for it, and the Choice filter does not remove them.
---

# Exclude bundle deals

## Why

A bundle card looks like an ordinary result: the product photo, the product title, a
price. But the card links to a **bundle landing page**, and the price is whatever
bundle component is cheapest. Live, 2026-10-26, Choice filter on:

| Query | Bundle card | Cheapest real single listing |
|---|---|---|
| `8BitDo Lite 2` | 1005007038269740 at **$25.39** | 1005006729851085 at $39.29 |

On the Hebrew/ILS channel, 3 of 18 SN30 Pro Choice results were bundle cards.
**Choice does not exclude them.** No `filterCode` or URL parameter does either: the
IL search page exposes only `freeshipping`, `choice_atm`, `4StarRating` and the
ship-from radio.

## How a bundle card is recognised (verified 2026-10-26)

Primary signal (locale-independent): the card's link is

```
https://www.aliexpress.com/ssr/300000512/BundleDeals2?productIds=<itemId>:<skuId>
```

instead of `/item/<itemId>.html`.

Secondary signals, for corroboration only:

- Card text `חוסכים בגדול` ("save big") on the HE channel.
- Plain `Free shipping` / `משלוח חינם` where ordinary Choice cards say
  `Free shipping over US $12` / `משלוח חינם בהזמנות מעל ₪42`.
- In the embedded page JSON: `"productDetailUrl":"…/BundleDeals2?productIds=…"`.

`$CLAUDE_PLUGIN_ROOT/scripts/search-cards.js` sets `bundle: true` on these cards.

## Procedure

1. Run the search (`search-aliexpress` rules: build the URL and navigate, don't
   trust a chip click; see the note there) and extract with `search-cards.js`.
2. Drop every card with `bundle: true`. Record `{id, title, card_price, reason:
   "bundle-deal card"}` for each.
3. **Not dropped, flagged:** titles offering a count (`1 or 2 units`, `2pcs`,
   `x2`, `set of`). Those are single listings whose SKUs include multi-packs.
   `true-price` resolves which SKU is the one-item price.
4. If the user wants the bundle's own deal, open its `BundleDeals2` URL and read it
   separately. Never merge it into the one-item comparison.

## Output

Prefix the results with:

```
Bundles excluded: 4 of 60 cards (BundleDeals2 links)
  - 1005007038269740  $25.39  8BitDo Lite 2 Bluetooth Gamepad with Vibration…
  - …
```

Zero is a valid count. Say `Bundles excluded: 0 of N`.

## Not yet seen live

`Max Combo` badges and "Buy N save X" offers. `search-aliexpress` mentions `Max
Combo` as a display badge. If one shows up, record its DOM in
`reference/selectors.md` and add it here.
