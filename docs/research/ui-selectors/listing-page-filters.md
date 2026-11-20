# AliExpress Listing-Page Filter Selectors

Page type: keyword search results, e.g. `https://he.aliexpress.com/w/wholesale-<query>.html`.
All selectors observed live; class names are obfuscated (`ie_*`, `il_*`, `ip_*`, `lw_*`, `jz_*`) and **will rotate** between deploys — prefer the stable `aria-label` / `id` / `for` attributes.

## 1. Filter-row checkboxes (`filterCode:*`)

Each filter is a `<span>` wrapper with `aria-label="filterCode:<code>"` and `aria-checked` reflecting state. Inside it: an `<input type="checkbox" id="filterCode:<code>">` + `<label for="filterCode:<code>">`.

| Filter            | Stable selector                            | `filterCode` value | Notes                              |
|-------------------|--------------------------------------------|--------------------|------------------------------------|
| Free shipping     | `[aria-label="filterCode:freeshipping"]`   | `freeshipping`     | The original target.               |
| Choice            | `[aria-label="filterCode:choice_atm"]`     | `choice_atm`       | This *is* the Choice-delivery toggle on this page — there is no separate "Choice delivery" header. |
| 4★ & up           | `[aria-label="filterCode:4StarRating"]`    | `4StarRating`      |                                    |
| Premium Quality   | `[aria-label="filterCode:PremiumQuality"]` | `PremiumQuality`   |                                    |

To toggle programmatically, click the `<span>` wrapper (not the inner `<input>`); AliExpress wires the click handler at the wrapper level.

```js
document.querySelector('[aria-label="filterCode:freeshipping"]').click();
```

To read state: `el.getAttribute('aria-checked') === 'true'`.

## 2. Shipping from (radio group)

Single-select radio group. Wrapper class observed: `il_im` (header) + `il_v` (options). All classes obfuscated — anchor on `id` and `aria-label` of each radio wrapper.

Header element:
```html
<div class="il_im">
  <div class="il_in">
    <span class="il_an">Shipping from </span>
    <span class="comet-icon comet-icon-arrowup">…</span>   <!-- collapse/expand chevron -->
  </div>
  <div class="il_v"> … radio options … </div>
</div>
```

The options use ISO 3166-1 alpha-2 country codes as the `id` (and `-1` for "All"):

| Option   | Wrapper aria-label | Input `id` | Stable selector                       |
|----------|--------------------|------------|---------------------------------------|
| All      | `-1`               | `-1`       | `[aria-label="-1"]` *or* `input#\\-1` |
| Israel   | `IL`               | `IL`       | `[aria-label="IL"]`                   |
| Turkey   | `TR`               | `TR`       | `[aria-label="TR"]`                   |
| China    | `CN`               | `CN`       | `[aria-label="CN"]`                   |

Each option:
```html
<span class="ip_iq" tabindex="1" aria-label="IL" aria-checked="false">
  <input class="ip_ar" type="radio" id="IL">
  <label for="IL" class="ip_it">
    <div class="ie_ii">
      <span class="css_flag css_flag_refine css_il ie_ij"></span>  <!-- flag icon -->
      <span class="ie_a6">Israel</span>                            <!-- display label -->
    </div>
  </label>
</span>
```

Notes:
- Wrapper `<span class="ip_iq">` carries the `aria-checked` state — read this, not the `<input>`'s `:checked`, as the visual state is driven by ARIA.
- The `id="IL"` etc. are **not unique to a checkbox semantic** — they're the country code, set as the DOM id. Any future `getElementById('IL')` collision is on AliExpress.
- Country list on this page is `IL / TR / CN` only. The user's account is set to ship-to-IL (`region=IL` in `aep_usuc_f`), which likely shapes which "ship from" countries are offered. Other accounts may see additional codes (e.g. `US`, `RU`, `ES`).
- The flag span uses `css_flag_refine css_<lowercase-iso>` (`css_il`, `css_tr`, `css_cn`) — useful as a secondary anchor.

To select Israel:
```js
document.querySelector('[aria-label="IL"]').click();
```

To read current selection:
```js
document.querySelector('.il_v [aria-checked="true"]').getAttribute('aria-label');
// → "-1" | "IL" | "TR" | "CN"
```

## 3. "Max Combo" — NOT a filter

`Max Combo` is a per-product **badge**, not a filter control. Found inside each qualifying product card as `<span class="lw_an">Max Combo</span>`, wrapped by `lw_j9` / `lw_v`. No server-side filter on this page lets you include/exclude combo products — any "exclude max combo" feature has to be implemented client-side by reading the badge on each card.

```js
// list product cards that carry the badge
[...document.querySelectorAll('span.lw_an')]
  .filter(el => el.textContent.trim() === 'Max Combo')
  .map(el => el.closest('a, [class*="card"], [class*="item"]'));
```

## Stability summary

| Anchor                                  | Stable?      |
|-----------------------------------------|--------------|
| `[aria-label="filterCode:<code>"]`      | ✅ Yes       |
| `input[id="filterCode:<code>"]`         | ✅ Yes       |
| `[aria-label="<ISO-2>"]` for ship-from  | ✅ Yes       |
| `input[id="<ISO-2>"]` for ship-from     | ⚠️ Yes, but globally ambiguous (raw country codes as DOM ids) |
| `.css_flag.css_<iso-lower>`             | ✅ Yes (semantic class) |
| Class names like `ie_a6`, `il_v`, `ip_iq`, `lw_an` | ❌ Rotate per build |
| `.comet-icon-*`                         | ✅ Yes (design system) |
