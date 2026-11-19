---
name: edit-cart
description: Edit the signed-in AliExpress cart in place - remove a line, change a line's quantity, or tick/untick lines for checkout - and prove each change by diffing the cart. Use on "remove X from my cart", "make it 3", "untick the case", "only check out the board".
---

# Edit AliExpress Cart

Three actions on lines that are **already in the cart**: `remove`, `set-qty`, `select` / `deselect`.
Adding is `add-to-cart`; reading is `export-cart`. This is a **tier 2 (reversible write, no money)**
skill - see the ladder in `$CLAUDE_PLUGIN_ROOT/reference/browser.md`. Never click `Checkout`
(`button.cart-summary-button`) or `Buy now` from here.

One skill, three actions, because they share everything that matters: the same page, the same
line-locating step, the same cart-diff verification. Selectors: `reference/selectors.md` -> "Cart page".

## Rules

- **Locate semantically, act with `element.click()` via `javascript_tool`.** No coordinates, no
  `computer` `ref` clicks (`CLAUDE.md` section 1).
- **Identify a line by `itemId`/`skuId`/title, never by index.** Order is newest-first and shifts on add.
  The DOM has no item id; match the title text (`[class*="cart-product-name"]`) and cross-check the
  `cartId`/`itemId` in page state (below) before and after.
- **Only touch lines the user named.** If the request is ambiguous ("clear the junk"), list candidate
  lines and ask. **Before removing any line the user did not name explicitly, confirm with them.**
  Unticking and quantity changes of unnamed lines: also ask.
- **Verify by cart diff**, not by the click or the modal closing (section 3 below). One click per step; do not retry blind.
- Preconditions as `add-to-cart`: signed in, currency actually read (not assumed), ship-to IL.
- Use your **own** tab. Do not navigate a tab the user or another agent is using.

## Step 0 - open and snapshot

Open `https://www.aliexpress.com/p/shoppingcart/index.html`, wait ~3 s for hydration, then define a
snapshot helper (page state, same source as `export-cart`) and take the **before** snapshot:

```js
window.snap = () => {
  const d = window.__globalCartHaloContainer.state.getData().data;
  return {
    lines: Object.values(d).filter(v => v && v.fields && v.fields.itemView)
      .filter(v => v.fields.itemView.itemId)            // drop the null-itemId ghost left after a remove
      .map(v => ({cartId: v.fields.itemView.cartId, itemId: v.fields.itemView.itemId,
                  skuId: v.fields.itemView.skuId, qty: v.fields.quantityView?.current,
                  selected: !!v.fields.checkbox?.selected})),
    domLines: document.querySelectorAll('.cart-product').length,
    text: document.body.innerText.match(/(Cart \(\d+\)|Checkout \(\d+\)|Subtotal\n[^\n]*)/g),
  };
};
window.lineEl = (needle) => [...document.querySelectorAll('.cart-product')]
  .find(e => e.querySelector('[class*="cart-product-name"]')?.innerText.includes(needle));
```

`lineEl` must resolve to exactly one element; if the title fragment matches several, narrow it
(add the variant text from `[class*="cart-product-sku"]`) or stop and ask.

## Action 1 - set-qty

Two routes, both validated live 2026-11-19. Prefer the stepper for +-1, the input for a target.

```js
const el = lineEl('<title fragment>');
el.querySelector('[aria-label="increase"]').click();      // or "decrease"
// target value instead:
const inp = el.querySelector('input[aria-label="number"]'); inp.focus();
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp,'3');
inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true}));
inp.blur();                                               // blur commits it
```

Wait ~2.5 s, then `snap()`. The input needs the native-setter form: assigning `inp.value = '3'`
directly is swallowed by React. Respect `maxQuantity` (`export-cart` field); the input clamps silently,
so report the **read-back** qty, not the requested one. Quantity 0 is not a remove - use Action 2.

## Action 2 - remove

Two steps; the modal is the only gate and it is not a confirmation of the *right line*, so
the line check happens before step 1.

```js
lineEl('<title fragment>').querySelector('[aria-label="delete product"]').click();   // opens modal
// modal: title "Remove product", body "Remove item from cart?", buttons Remove / Cancel
[...document.querySelectorAll('.comet-v2-modal-wrap .comet-v2-modal-footer button')]
  .find(b => b.innerText.trim() === 'Remove').click();
```

Scope to `.comet-v2-modal-wrap` (one modal = seven `comet-v2-modal*` nodes). Click `Remove` once.
After removal the page state keeps a **ghost node** (same `cartId`, `itemId: null`) and the text
`Cart (N)` is **stale** until reload - the DOM `.cart-product` count and `Checkout (N)` update at
once. So: verify with the filtered `snap()` and, for the final word, reload the cart page and
snapshot again. Removal is undone only by re-adding via `add-to-cart` (new `cartId`, line goes to the top).

## Action 3 - select / deselect

```js
const cb = lineEl('<title fragment>').querySelector('.cart-product-body input.comet-v2-checkbox-input');
if (cb.checked !== wantChecked) cb.click();     // click the INPUT; check .checked first - it toggles
```

Read `cb.checked` first so "select" on an already-ticked line is a no-op rather than an untick.
The `aria-label` is `unselect product` when ticked and cannot tell you the scope (line, seller group,
select-all) - scope by the `.cart-product-body` ancestor. Do not use select-all
(`.cart-header-checkbox-wrap`) or group checkboxes unless the user asked for all lines.
The tick state is **server-side**: it survived a reload (validated 2026-11-19), and it decides
what `Checkout` and `open-checkout` will price. `Checkout (N)` and `Subtotal` follow the ticked
lines; `Cart (N)` does not.

## Verification - diff the cart

Compare the **before** and **after** `snap()` (and `Subtotal` / `Checkout (N)`):

| Action | Must be true after |
|---|---|
| set-qty | same `cartId`, `qty` equals the read-back target; `Subtotal` moved by `delta * unit price` (if ticked) |
| remove | that `cartId` has no entry with an `itemId`; `domLines` is one fewer; other lines unchanged (same `cartId`, qty, selected). Reload and re-check |
| select / deselect | same `cartId`, `selected` flipped; `Checkout (N)` moved by one and `Subtotal` by the line total; other lines unchanged |

Every other line must be **identical** before and after - a diff that touches a line the user did not
name is a failure to report, not to paper over.

## Output format

```
Cart edited - <action> - <title truncated> (item <itemId>, cartId <cartId>)
  before: qty <n>, ticked <yes|no>   after: qty <n>, ticked <yes|no>   (read back, not requested)
  cart now: <N> lines, <M> ticked, selected subtotal <$X>   (currency verified: <read>)
  other lines: unchanged
```

After any change that moves ticked goods value, volunteer the `cart-vat-nudge` position.

## Out of scope

- Adding lines (`add-to-cart`), reading the cart to a file (`export-cart`).
- Changing a line's variant/SKU: not implemented here. Remove and re-add with the right SKU.
- Coupons, checkout, payment (`open-checkout`, `buy-now`).
- Wishlist / "find similar" (`aria-label` `add to wishlist` / `find similar` exist but are untested).

## Validation checklist

1. Own tab; the cart was snapshotted **before** and **after**.
2. The line was matched by title and cross-checked by `itemId`, not by index.
3. Lines the user did not name were left alone, or confirmed first.
4. Quantity was read back; clamps reported.
5. Removal clicked `Remove` once, then verified after a reload (ghost node and stale `Cart (N)` ignored).
6. Tick state read before toggling.
7. Neither `Checkout` nor `Buy now` was clicked.
