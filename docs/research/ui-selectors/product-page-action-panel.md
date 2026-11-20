# AliExpress Product Page — Right-Side Action Panel

Page type: product detail (`/item/<id>.html`), right-hand action column under the price/variants — Sold By, Certified Original badge, shipping/pickup, returns, security, quantity, Buy now/Add to cart.

Container: `[class*="action--container--"]` → `[class*="action--wrap--"]`. All Train-Case-then-hash classes (`action--container--Bv1OwjX`, `store-detail--wrap--IhR4e1j`, `choice-mind--wrap--ai_fJ6V`, `shipping--item--F04J6q9`, …) are CSS-module hashes — anchor on the un-hashed prefix with `[class*="…--"]`.

## 1. "Certified Original" (Brand+ marker)

```html
<a class="choice-mind--wrap--ai_fJ6V" href="https://www.aliexpress.com/ssr/300002748/T4TarnaZzw?…&businessCode=guide&…">
  <div class="choice-mind--mask--LpLLC79" style="background-image: url(...png_.avif)"></div>
  <div class="choice-mind--box--fJKH05M">
    <img src="…png">
    <span style="color: rgb(3, 124, 255);">Certified Original</span>
    <div class="choice-mind--arrow--jWwMhx9">…</div>
  </div>
</a>
```

The link points into AliExpress's "Choice" / brand-authentication SSR landing (path `/ssr/300002748/<token>` with `businessCode=guide`). The module name `choice-mind` is the stable identifier — it's the same Choice/brand programme as the `filterCode:choice_atm` listing-page filter, surfaced here as a per-product trust badge.

Detection (presence = product is Certified Original / Brand+):
```js
!!document.querySelector('[class*="choice-mind--wrap--"]')
```

Read the badge label (defensive against locale / future copy changes):
```js
document.querySelector('[class*="choice-mind--box--"] span')?.textContent.trim();
// → "Certified Original"
```

Read the trust-page link:
```js
document.querySelector('[class*="choice-mind--wrap--"]')?.href;
```

## 2. Shipping / Pick-up / Delivery block

Three stacked rows, each `[class*="shipping--item--"]`:

| Row | Distinguishing content                       |
|-----|----------------------------------------------|
| 1   | Free pick-up + delivery estimate (the dynamic block — see below) |
| 2   | "Free returns within 90 days"                |
| 3   | "Security & Privacy"                         |

The first row contains the only un-hashed, semantic markup on the panel — the `dynamic-shipping` block. **This is the most reliable anchor on the entire panel.**

```html
<div class="shipping--item--F04J6q9">
  <img class="shipping--icon--vAVr7jZ" src="…">
  <div class="shipping--content--ulA3urO">
    <div class="dynamic-shipping">
      <div class="dynamic-shipping-line dynamic-shipping-titleLayout">
        <span><strong>Free pick-up over US $12.00</strong></span>
      </div>
      <div class="dynamic-shipping-line dynamic-shipping-contentLayout">
        <span>Delivery:</span>
        <span><strong>May 07 - 25</strong></span>
      </div>
    </div>
  </div>
</div>
```

### 2a. Free pick-up minimum

Anchor: `.dynamic-shipping .dynamic-shipping-titleLayout` (un-hashed; semantic).

```js
const title = document.querySelector('.dynamic-shipping-titleLayout')?.textContent.trim();
// → "Free pick-up over US $12.00"
```

Parse the threshold:
```js
const m = title?.match(/([A-Z]{2,3}|US\s*\$|₪|€|£)\s*\$?\s*([\d.,]+)/);
// m[1] → currency token, m[2] → numeric threshold
```

Notes:
- The currency is whatever the user has set via `aep_usuc_f.c_tp` — `US $` for USD, `₪` (or `ILS`) for ILS, etc. Don't assume USD.
- Copy is locale-dependent: in Hebrew (`b_locale=iw_IL`) the wording will differ; key on the `dynamic-shipping-titleLayout` *position*, not the English string.
- The `<strong>` markup wraps the human-readable threshold, so `el.querySelector('strong')?.textContent` is a tighter pick.

### 2b. Delivery estimate

Anchor: `.dynamic-shipping .dynamic-shipping-contentLayout`.

```js
const content = document.querySelector('.dynamic-shipping-contentLayout');
// First <span> = label ("Delivery:"), second <span><strong> = date range
const range = content?.querySelectorAll('span strong')[0]?.textContent.trim();
// → "May 07 - 25"
```

Parse to a date range:
```js
// "May 07 - 25"  → start "May 07", end "May 25" (current year, with year-rollover heuristic if end < start)
// "Apr 28 - May 12" → cross-month form
```
Year is implicit (current year, with rollover heuristic when the end date precedes the start). Locale formatting changes with `b_locale`.

### 2c. Detecting variants of the dynamic-shipping block

The `dynamic-shipping-titleLayout` line on this product is "Free pick-up over US $12.00". Other observed variants on AliExpress: free shipping, paid shipping with a fee, "Free shipping over $X", country-specific notes. Always read the title text rather than assuming pickup vs ship-to-door.

## 3. Sold By / store

```html
<a class="store-detail--wrap--IhR4e1j" href="//www.aliexpress.com/store/1103339322" target="_blank" rel="nofollow">
  <div class="store-detail--title--qt8UBeq">Sold By</div>
  <div class="store-detail--storeNameWrap--Z45gRHH">
    <span class="store-detail--storeName--Lk2FVZ4">Shop1103304760 Store</span>
    <span>(Trader)</span>
    …
  </div>
</a>
```

Anchors:
- Store URL & ID: `[class*="store-detail--wrap--"]` → `href` ends with `/store/<storeId>`.
- Store name: `[class*="store-detail--storeName--"]`.
- Trader / vendor type: the second `<span>` inside `[class*="store-detail--storeNameWrap--"]` — `(Trader)` here. Other observed values: `(Top Brand)`, `(Mall)`, `(Premium Shipping)`. Worth recording — it's a coarse trust signal.

## 4. Quantity & availability

```html
<input type="text" class="comet-v2-input-number-input" value="1">
…
<div class="quantity--info--jnoo_pD"><div><span>471 available</span></div></div>
```

Anchor:
- Quantity input: `input.comet-v2-input-number-input` (design-system class).
- "N available": `[class*="quantity--info--"]` → first `<span>`. Parse `\d+` from text.

## Stability summary (this panel)

| Anchor                                            | Stable? |
|---------------------------------------------------|---------|
| `[class*="action--container--"]`                  | ✅ (CSS-module prefix) |
| `[class*="choice-mind--wrap--"]`                  | ✅ |
| `.dynamic-shipping`, `.dynamic-shipping-titleLayout`, `.dynamic-shipping-contentLayout` | ✅✅ — un-hashed, **most reliable** |
| `[class*="shipping--item--"]`                     | ✅ |
| `[class*="store-detail--wrap--"]`                 | ✅ |
| `comet-v2-*` design-system classes                | ✅ |
| Hashed suffixes (`Bv1OwjX`, `ai_fJ6V`, `F04J6q9`, …) | ❌ rotate per build |
| Inline `style="color: rgb(3, 124, 255)"` (the brand blue) | ⚠️ visually stable but cosmetic — don't anchor on it |
