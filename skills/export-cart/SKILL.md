---
name: export-cart
description: Read the live AliExpress cart and export it to JSON, CSV and Markdown files — items, SKUs, quantities, per-unit and crossed-out prices, sellers, shipping — ready to feed cart-vat-nudge.
---

# Export AliExpress Cart

Pull the **actual, current** contents of the signed-in AliExpress cart into structured data, instead of retyping line items by hand.

This is the skill that closes the loop: `cart-vat-nudge` computes the $75 de-minimis position but historically had to be fed items manually. `export-cart` produces exactly the shape it wants.

## When to use

- User says "what's in my AliExpress cart", "check my cart against the VAT threshold", "export my cart"
- Before `cart-vat-nudge` on a **real** cart rather than a hypothetical basket
- Price-watching: re-export periodically and diff to catch a Choice price drop or a discount expiring
- Keeping a record: "export my cart to CSV / JSON / markdown", "save what's in my cart" — see [Writing the export to files](#writing-the-export-to-files)

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
5. To keep it: write that JSON to a file and pipe it through `cart_formats.py` — see
   below. Both routes share those renderers, so the files are identical whichever
   route produced the data.

Use this route unless the user explicitly wants unattended polling.

### Route B — signed API client (unattended)

For scheduled runs with no browser open. The user exports their cookie string once; the script signs requests locally.

```bash
export AE_COOKIE='<value of document.cookie from a logged-in aliexpress.com tab>'
python3 "$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts/ali_cart.py" --format json
python3 "$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts/ali_cart.py" --format all   # file bundle
python3 "$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts/ali_cart.py" --count   # cheap poll
```

Requires `requests`. The cookie string must contain `_m_h5_tk`.

**Never write the cookie string into a file inside a repo, and never echo it back to the user.** Read it from the environment only.

## Writing the export to files

`scripts/cart_formats.py` turns either route's bundle into files. It is the **only**
renderer — there is deliberately no second Markdown implementation in the JS, so the
two routes cannot drift.

```bash
S="$CLAUDE_PLUGIN_ROOT/skills/export-cart/scripts"

# Route A: the JSON that extract-cart.js returned, saved to a file first
python3 "$S/cart_formats.py" --in cart.json --format all

# one format, straight to the transcript instead of disk
python3 "$S/cart_formats.py" --in cart.json --format md --stdout

# Route B does it in one step
python3 "$S/ali_cart.py" --format all
```

`--format` takes `all` (the default: JSON + CSV + Markdown), a single `json` / `csv` /
`md`, or a comma-separated subset. Files are named `cart-YYYY-MM-DD.<ext>`; override
with `--stem`. Re-exporting on the same day **overwrites** — pass `--stem` to keep a
series.

### What each format is for

| Format | Shape | Use it for |
|---|---|---|
| `json` | `{exportedAt, source, summary, items}` — every field, nothing lost | feeding `cart-vat-nudge`, diffing two exports for price changes |
| `csv` | one row per cart line, union of all keys as columns | spreadsheets, sorting by price, sharing |
| `md` | totals table, one row per line with links, then per-line detail | reading it, and pasting into a note. This is the human-facing one |

The Markdown report leads with **two** totals — ticked-for-checkout and whole-cart —
because the site's own subtotal counts only the ticked lines, and that single
discrepancy is the most common reason a hand-checked figure disagrees with an export.
It also states the unticked count in words rather than leaving it to be inferred from
the tables.

### Where the files go

Destination is resolved in this order, and the rule that fired is printed:

1. `--out-dir` if given
2. `$CLAUDE_USER_DATA/aliexpress-cart/`
3. the **first user-data root that already exists** — `~/.claude-user-data/`, then
   `${XDG_DATA_HOME:-~/.local/share}/claude-plugins/` — adopted rather than creating a
   second root. On this machine that resolves to
   `~/.local/share/claude-plugins/aliexpress-cart/`
4. `~/.claude-user-data/aliexpress-cart/` as the default when no root exists

Writing anywhere under `~/.claude` is a **hard error**, not a warning: that is Claude
Code's own state directory, and an export is user content that should outlive the tool.

## Inputs

- `currency` (optional) — the cart renders in whatever currency the **account** is set to, not what this skill asks for. Read `items[].currency` from the output rather than assuming. Israeli accounts are commonly USD or ILS.
- `include_invalid` (optional, default `false`) — include sold-out / expired / saved-for-later lines. These carry `valid: false`.
- `format` (optional) — `json` (default for a transcript read), `csv`, `md`, `table`,
  or `all` to write the three-file bundle.
- `out_dir` / `stem` (optional) — only used when writing files.

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
- Read-only by design. This skill never mutates the cart — adding is `add-to-cart`; removing and re-quantifying are unimplemented. See Out of scope.

## Out of scope

- **Modifying the cart.** The sibling endpoints `cart.add` and `cart.async` exist but are not wired up here, on purpose: a bug in an automated cart mutation is expensive and hard to undo. Adding an item is now `add-to-cart`, which drives the UI and verifies itself by diffing this skill's output. Removing lines and re-quantifying are still unimplemented anywhere — tell the user what to click.
- **Checkout / order placement.** Not in this skill. `open-checkout` reads the confirmation page; `buy-now` places an order behind a confirmation gate. Both are separate on purpose.
- **Order history.** Different endpoint, not covered.

## Validation checklist

1. The page was fully loaded and signed in — an empty result on a cart the user says is non-empty means the page hadn't hydrated, not that the cart is empty. Re-check before reporting "empty".
2. `items[].currency` was **read**, not assumed, and is reported to the user.
3. Selected vs unselected is stated explicitly whenever the two totals differ.
4. Recomputed totals were sanity-checked against the on-page Summary panel. They should match "Items total" (gross), "Items discount" (saved) and "Subtotal" (net) for the selected set. A mismatch means the field mapping has drifted — stop and re-verify rather than reporting a wrong number.
5. No cookie or token value was written to disk or echoed into the transcript.
6. When files were written: the destination and the rule that chose it were reported,
   and the user was told the paths rather than just "exported".
