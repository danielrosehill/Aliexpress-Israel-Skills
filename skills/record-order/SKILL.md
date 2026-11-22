---
name: record-order
description: Record a placed AliExpress order in the user's purchase log - read the order from the Orders list and its Details page (read-only) and upsert one JSON line per order_ref into orders.jsonl in the user-data overlay, never into the plugin repo. Input is an order/ref number or "latest". Called automatically as the last step of buy-now.
---

# Record Order

Writes a placed order into the user's purchase log. Tier 1 on the ladder in
`$CLAUDE_PLUGIN_ROOT/reference/browser.md`: it only **reads** the site. It never clicks
Pay now, Cancel, Confirm received or anything else that changes an order.

## Inputs

- `order` (required) — a 16-digit order/ref number, or `latest` (the first order on the
  Orders list).

## Where the log lives (never in the plugin repo)

This plugin is public; order data is personal. The log is written to the user-data
overlay, resolved in this order:

1. `orders_log` in `<overlay>/aliexpress-israel-skills/config.json` (path may point at a
   private repo; `~` is expanded)
2. `$CLAUDE_USER_DATA/aliexpress-israel-skills/orders.jsonl`
3. `~/.claude-user-data/aliexpress-israel-skills/orders.jsonl`

`<overlay>` is `$CLAUDE_USER_DATA` if set, else `~/.claude-user-data`. Create the
directory if missing. Print which rule fired. Refuse any path inside this plugin's
repo or under `~/.claude` (Claude Code's own state).

## Procedure

1. Load Chrome tools per `reference/browser.md`; open **your own new tab** (never reuse
   the user's tabs) and close it at the end.
2. Navigate to `https://www.aliexpress.com/p/order/index.html`, wait ~5 s for
   hydration. Each order is a `.order-item`; read status
   (`.order-item-header-status-text`), `Ref. Number: <16 digits>` and `Total:`.
   For `latest` take the first item; otherwise find the item whose text contains the ref.
   If the ref is not in the first page of results, check the `To pay` / `Processing`
   tabs, then report not found. Do not guess.
3. Open `https://www.aliexpress.com/p/order/detail.html?orderId=<ref>`, wait ~6 s, read
   `document.body.innerText`: `Order placed on`, `Paid on`, `Payment method`, store,
   per-item title / SKU line / `US $x` + `x<qty>`, Subtotal, Total, and the ship-to
   block (record the **city only**; never the name, phone or street).
   The list view sometimes shows no item titles (images only); on 2026-11-23 it did
   show title, SKU line, unit price and total. Use the Details page as the source for
   items whenever the list lacks them.
4. Build one JSON object:
   `order_ref, placed_date (YYYY-MM-DD), recorded_at (ISO with offset), status, store,
   items [{title, sku, qty, unit_price}], total, currency, payment_card_last4,
   ship_to_city, notes`.
   - `payment_card_last4`: only if the page shows it. The detail page usually says just
     "Credit/Debit card"; then use `null`, or the digits the user gave in chat (say so
     in `notes`). Never read card data from a payment iframe.
   - Status is the order's current text ("To pay", "Verifying your payment",
     "Processing", ...). Detail page wins over the list when they differ.
5. **Upsert by `order_ref`**: read the file, replace the line with the same ref (keep
   its other fields if the new read lacks them), else append. Write atomically (temp
   file + rename). One JSON object per line, UTF-8, no pretty printing.
6. Report the exact line written and the log path.

## Hard stops

- Never write order data into the plugin repo or commit the log.
- Never record the customs ID, phone number, street address or recipient name.
- Never click anything that changes an order.

## Validation checklist

1. The ref in the log matches the one on the Details page.
2. Running it twice leaves one line for that ref.
3. The file is outside the plugin repo.
