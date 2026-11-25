---
name: prepare-cart
description: Prepare a clean AliExpress cart holding only what the user wants, verify it, and hand over so they place the order themselves on the mobile app or another device. Never clicks Pay now. Use on "prepare my cart", "get the cart ready", "I'll order on my phone", "clean cart", or when an anti-bot check blocks ordering.
---

# Prepare Cart

The cart is tied to the account, so a cart built here appears in the AliExpress mobile app.
Tier 2 (reversible writes, no money): the user places the order. Use this when the user
prefers it, and whenever `buy-now` meets an anti-bot check.

**Why:** on 2026-11-25 `Pay now` in an agent browser hit an anti-bot check on
`mtop.aliexpress.checkout.createorder` ("Request timed out"); the user could not clear it
there either, and ordered from the mobile app with the same cart.

## Inputs

- `items`: listing, SKU and qty for each (from `deep-search`, Choice preferred).
- `clean`: what happens to lines not in `items`.
  - `ask` (default): list them, ask once, act on the answer.
  - `clear`: remove them. Only on the user's instruction or standing preference.
  - `untick`: keep them, unticked. **The app may re-tick or check out "all"**, so say so.

## Procedure

1. **Own tab.** Signed in, currency read, ship-to IL (`add-to-cart` preconditions). Captcha: stop, hand over.
2. **Check for an existing order.** If `Pay now` was ever clicked for these items, read the
   orders list including `To pay`. Found one: stop and report.
3. **Snapshot** the cart (`edit-cart` `snap()`). Save title, itemId, URL, SKU, qty and price of
   every line to `<overlay>/aliexpress-israel-skills/cart-removed/<timestamp>.json`
   (`record-order` overlay rules; never this repo). No saved snapshot, no removals.
4. **Add** what is missing with `add-to-cart`, then diff. A line already present at the right
   SKU is kept; fix its qty with `edit-cart`.
   - **Read qty back after a reload.** A change can look accepted and revert: one 10-pack listing
     showed 2 in the input but stayed at 1, and adding 2 left no line (2026-11-25). Retry once
     at qty 1, then report the shortfall; never report the requested qty.
5. **Clean** per `clean`, one `edit-cart` removal at a time, matching by itemId. Never
   remove a line added after the snapshot, or one whose title matches more than one element.
6. **Verify after a reload:** every wanted line has the right SKU and qty and is ticked;
   nothing else is ticked; with `clear`, nothing else is present.
7. **Read checkout** with `open-checkout` for shipping, shipment groups, tax and total, then
   **leave the confirm page and close the tab**. An open checkout tab can place a duplicate
   if its check is cleared later.
8. **Hand over.** Never click `Pay now`, even if the cart is perfect.

## Output

    Cart ready: place the order in the AliExpress app.
      5 x TZe-251 24mm, Black on White      US $4.00   Choice
      1 x 100 zip bags 10x15cm              US $5.71   Choice
    Total US $25.71, free shipping, Dec 04 - 09, one shipment. Goods $25.71 vs $75: under.
    Removed: <titles and links, or none>     Kept unticked: <titles or none>
    Check on the device: only these lines ticked, same total.

Prices can change before the user checks out. If the app total differs, they should stop and say so.

## After

When the user says it is ordered, run `record-order latest` if they want it logged. Do not
infer from an empty cart that the order succeeded.

## Validation checklist

1. Removed lines were saved before removal and are listed with links.
2. Quantities were read back after a reload.
3. Choice and one-shipment claims come from this session's search and checkout.
4. No `Pay now` click; checkout tab closed.
