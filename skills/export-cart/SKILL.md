---
name: export-cart
description: Read the live AliExpress cart into structured JSON/CSV — items, SKUs, quantities, per-unit and crossed-out prices, sellers, shipping — ready to feed cart-vat-nudge.
---

# Export AliExpress Cart

Pull the **actual, current** contents of the signed-in AliExpress cart into structured data, instead of retyping line items by hand.

This is the skill that closes the loop: `cart-vat-nudge` computes the $75 de-minimis position but historically had to be fed items manually. `export-cart` produces exactly the shape it wants.

## When to use

- User says "what's in my AliExpress cart", "check my cart against the VAT threshold", "export my cart"
- Before `cart-vat-nudge` on a **real** cart rather than a hypothetical basket
- Price-watching: re-export periodically and diff to catch a Choice price drop or a discount expiring

For a **single listing** the user hasn't added yet, use `fetch-listing`. For finding candidates, use `search-aliexpress`.

## How the cart is actually loaded (read this before debugging)

The cart is **not** server-rendered and **not** fetched by `fetch`/XHR. It arrives via **JSONP script injection** from one signed endpoint:

```
mtop.aliexpress.trade.cart.render
```

Consequences that will otherwise waste your time:

- Scraping the cart HTML returns nothing — the markup carries no item data.
- A network panel shows no API call for the cart. This is expected, not a failure.
- The parsed payload *is* sitting in page memory, which is why Route A below needs no signing at all.

Full protocol notes, including the signing algorithm and the Ultron response layout, are in the companion repo `Aliexpress-Cart-Analysis` (private). The essentials are reproduced in `reference.md` next to this skill.

## Two routes — prefer A

### Route A — read page state in the user's own Chrome (default)

No signing, no cookie handling, no API call. Requires a loaded cart page in a signed-in browser.

**Chrome is not merely preferred here, it is the natural fit:** the cart only exists for a signed-in session, and the user's own profile already is one. A fresh automation profile has no session at all. See `$CLAUDE_PLUGIN_ROOT/reference/browser.md`.

1. `tabs_context_mcp` first — the user may already have AliExpress open. Don't navigate a tab out from under them.
2. Open `https://www.aliexpress.com/p/shoppingcart/index.html` and let it fully render. The user must already be signed in.
3. Evaluate `scripts/extract-cart.js` in that page — `mcp__claude-in-chrome__javascript_tool`, or `browser_evaluate` under gateway Playwright.
4. It returns `{exportedAt, source, summary, items}`.

Use this route unless the user explicitly wants unattended polling.

### Route B — signed API client (unattended)

For scheduled runs with no browser open. The user exports their cookie string once; the script signs requests locally.

```bash
export AE_COOKIE='<value of document.cookie from a logged-in aliexpress.com tab>'
python3 "$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts/ali_cart.py" --format json
python3 "$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts/ali_cart.py" --count   # cheap poll
```

Requires `requests`. The cookie string must contain `_m_h5_tk`.

**Never write the cookie string into a file inside a repo, and never echo it back to the user.** Read it from the environment only.

## Inputs

- `currency` (optional) — the cart renders in whatever currency the **account** is set to, not what this skill asks for. Read `items[].currency` from the output rather than assuming. Israeli accounts are commonly USD or ILS.
- `include_invalid` (optional, default `false`) — include sold-out / expired / saved-for-later lines. These carry `valid: false`.
- `format` (optional) — `json` (default), `csv`, or `table`.

## Output format

```
AliExpress cart — <N> items, <U> units   (<currency>)

[x]   1 x    10.00  Anti-Slip Tape – Waterproof, Non-Skid Bathroom Floor…
          1PCS/500cm/1mm/100cm
          Shop… Store   free shipping, ~16 days
[ ]   2 x     2.22  Holder Battery Storage Rack For Bosch 18V…
          Total Mart Store   free shipping, ~16 days

gross <G>   net <N>   saved <S>    (<C> selected, <U> unselected)
```

`[x]` = ticked for checkout. **Unticked items are still in the cart but excluded from AliExpress's own subtotal** — say so explicitly, because it is the most common source of "your number doesn't match the site".

Per item the export carries: `cartId`, `itemId`, `skuId`, `title`, `skuInfo`, `quantity`, `maxQuantity`, `selected`, `currency`, `unitPrice`, `crossedPrice`, `lineTotal`, `valid`, `status`, `storeName`, `sellerId`, `freeShipping`, `deliveryDays`, `addedAt`, `productUrl`.

## Handing off to cart-vat-nudge

The output maps straight across:

| `export-cart` | `cart-vat-nudge` |
| --- | --- |
| `title` | `title` |
| `productUrl` | `url` |
| `unitPrice` + `currency` | `unit_price` + `currency` |
| `quantity` | `qty` |

Decide with the user whether to nudge on **selected items only** (matches what they'd actually be charged at checkout) or the **whole cart** (matches what they'd pay if they ticked everything). Default to selected-only, and state which you used.

Prices are **per unit**, not line totals — `cart-vat-nudge` multiplies by `qty` itself, so don't pre-multiply.

## Notes & caveats

- **`unitPrice` is the current promo price**, `crossedPrice` the struck-through "was". AliExpress promo prices expire; a cart exported last week may not check out at the same total.
- **Quantities have a per-seller ceiling** (`maxQuantity`). Suggesting "buy 2 to hit free shipping" fails if `maxQuantity` is 1.
- **Choice items ship consolidated.** For `cart-vat-nudge`'s split-order suggestion this matters: items in one Choice parcel are likely assessed together by customs, so splitting them across orders may not produce two separate consignments.
- **`freeShipping` and `deliveryDays` are the cart's summary, not the menu.** They reflect whichever lane is currently selected, not the options available. To compare lanes on a line, run `ship-options-il` on its `productUrl`.
- The cart reflects **ship-to country** from the account session. An account set to ship elsewhere returns different shipping and availability. Verify `shipToCountry` is `IL` before trusting the delivery estimates.
- This is an **internal, unversioned API**. Field names have already changed several times. Match product nodes on the presence of `fields.itemView`, never on a component name.
- Read-only by design. Adding, removing and re-quantifying items is deliberately **not** implemented — see Out of scope.

## Out of scope

- **Modifying the cart.** The sibling endpoints `cart.add` and `cart.async` exist but are not wired up here, on purpose: a bug in an automated cart mutation is expensive and hard to undo. If the user wants an item added or removed, tell them and let them click it.
- **Checkout / order placement.** Never.
- **Order history.** Different endpoint, not covered.

## Validation checklist

1. The page was fully loaded and signed in — an empty result on a cart the user says is non-empty means the page hadn't hydrated, not that the cart is empty. Re-check before reporting "empty".
2. `items[].currency` was **read**, not assumed, and is reported to the user.
3. Selected vs unselected is stated explicitly whenever the two totals differ.
4. Recomputed totals were sanity-checked against the on-page Summary panel. They should match "Items total" (gross), "Items discount" (saved) and "Subtotal" (net) for the selected set. A mismatch means the field mapping has drifted — stop and re-verify rather than reporting a wrong number.
5. No cookie or token value was written to disk or echoed into the transcript.
