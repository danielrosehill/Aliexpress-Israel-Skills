# AliExpress Product Page — Review Filters

Page type: product detail (`/item/<id>.html`), reviews section.

The review-filter strip is a flat row of `<div class="filter--filterItem--*">` chips. Each chip is either active or has the modifier class `filter--invalid--*` (visually greyed-out — count is zero so it's non-clickable).

```html
<div data-spm-anchor-id="a2g0o.detail.1000024.i0…">
  <div class="filter--filterItem--AEUeCbl">
    <button …>All ratings <chevron-down/></button>
  </div>
  <div class="filter--filterItem--AEUeCbl filter--invalid--sLs5dBX">
    <comet-icon-photo/> (0)                <!-- with-photos filter -->
  </div>
  <div class="filter--filterItem--AEUeCbl">
    <span class="country-flag-y2023 IL"></span> (1)   <!-- reviews from Israel -->
  </div>
  <div class="filter--filterItem--AEUeCbl filter--invalid--sLs5dBX">
    <comet-icon-message/> (0)              <!-- with-text filter -->
  </div>
</div>
```

## The "Reviews from Israel" chip

```html
<div class="filter--filterItem--AEUeCbl">
  <span class="country-flag-y2023 IL" style="vertical-align: middle;"></span>
  (1)
</div>
```

Anchor strategy:

| Anchor                                    | Stable? | Notes |
|-------------------------------------------|---------|-------|
| `[class*="country-flag-"].IL`             | ✅✅ Best — version-agnostic. Matches `country-flag-y2023 IL` today and any future `country-flag-y2024`/`country-flag-v2`/etc. roll. The `IL` class is the ISO 3166-1 alpha-2 country code and is unlikely to change. |
| `span.country-flag-y2023.IL`              | ⚠️ Works today but will break the day AliExpress rolls a new versioned sprite (e.g. `country-flag-y2024`). Use as a fallback only. |
| `[class*="filter--filterItem--"]:has([class*="country-flag-"].IL)` | ✅ Targets the clickable wrapper. |
| Class hash `filter--filterItem--AEUeCbl` | ❌ Hashed CSS-module suffix — will rotate per build. Always use the `filter--filterItem--` *prefix* with attribute-prefix selectors, not the full class. |

**Why version-agnostic matters**: `country-flag-y2023` is named after the year of the sprite redesign — it's the second time AliExpress has versioned the flag class (no public history of `y2022`, but the `-y2023` suffix telegraphs that another bump is expected). The `IL` class, by contrast, is just the ISO code and has no reason to change. Anchor on the part that's stable.

Robust selector for the clickable chip:
```js
// Primary — version-agnostic
document.querySelector('[class*="country-flag-"].IL')
  ?.closest('[class*="filter--filterItem--"]');

// :has() variant if you need it in a single selector
document.querySelector('[class*="filter--filterItem--"]:has([class*="country-flag-"].IL)');
```

To click (apply the filter):
```js
document.querySelector('[class*="country-flag-"].IL')
  ?.closest('[class*="filter--filterItem--"]')
  ?.click();
```

To read the review count for Israel:
```js
const chip = document.querySelector('[class*="country-flag-"].IL')
  ?.closest('[class*="filter--filterItem--"]');
const m = chip?.textContent.match(/\((\d+)\)/);
const ilCount = m ? parseInt(m[1], 10) : 0;   // → 1 in the captured sample
```

## The "country-flag-y2023" pattern

This appears to be AliExpress's 2023-era flag sprite class. The class list is `country-flag-y2023 <ISO2>`. Other countries are addressable the same way: `[class*="country-flag-"].US`, `[class*="country-flag-"].RU`, etc. — though only the country chip(s) for which there is at least one review will render in the review-filter strip on a given product. **Always use the `[class*="country-flag-"]` prefix-contains form** rather than the literal `country-flag-y2023` class, so the selector survives the next versioned roll of the sprite.

Distinct from the listing-page filter, which uses `.css_flag.css_flag_refine.css_<iso-lower>` (e.g. `css_il`). Two different sprite systems on the same site:

| Surface                  | Flag class pattern                              |
|--------------------------|-------------------------------------------------|
| Listing-page "Ship from" | `.css_flag.css_flag_refine.css_<iso-lower>`     |
| Product-page reviews     | `.country-flag-y2023.<ISO2>` (uppercase)        |

## Other chips in the same strip

| Chip                  | Identifying child                          | State in sample |
|-----------------------|--------------------------------------------|-----------------|
| All ratings (dropdown)| `button` containing `comet-icon-chevrondown` | active          |
| With photos           | `.comet-icon-photo`                        | `(0)` → has `filter--invalid--*` modifier |
| Reviews from `<ISO2>` | `[class*="country-flag-"].<ISO2>`          | `(1)` → active  |
| With text comments    | `.comet-icon-message`                      | `(0)` → has `filter--invalid--*` modifier |

A chip is non-actionable when it carries the `filter--invalid--<hash>` modifier. Detect with `[class*="filter--invalid--"]`.

## Active-state modifier

When a filter chip is *applied*, the wrapper gains an additional `filter--active--<hash>` class:

```html
<div class="filter--filterItem--AEUeCbl filter--active--o28izPu">
  <span class="country-flag-y2023 IL"></span> (1)
</div>
```

Detect: `[class*="filter--active--"]`. Read the active filter:
```js
const active = document.querySelector('[class*="filter--filterItem--"][class*="filter--active--"]');
// Find the flag span (any version), then read the ISO2 from its class list.
const flag = active?.querySelector('[class*="country-flag-"]');
const country = [...(flag?.classList || [])]
  .find(c => /^[A-Z]{2}$/.test(c));   // → "IL"
```

So a single chip can carry up to two state modifiers — `filter--invalid--*` (zero count, non-clickable) **or** `filter--active--*` (currently selected). They are mutually exclusive.

## Reviews pane structure (after sorting on Israel)

The whole reviews block lives in a sibling sequence of three regions: header → filter strip (already documented above) → list of review items → "View more" button.

### Header — overall score, star count, "All from verified purchases"

```html
<div class="title--wrap--4jOWDTu">
  <span class="title--title--MFuMdl3">
    <span>Reviews</span> | <span>5.0</span>           <!-- average rating -->
  </span>
  <div class="stars--box--WrrveRu">…5× comet-icon-starreviewfilled…</div>
  <span class="title--rating--wzOw1ph">7 ratings</span>
  <span class="comet-icon comet-icon-progresscomplete" style="color: rgb(0, 153, 102);">…</span>
  <span class="title--desc--YmbAMtw">All from verified purchases</span>
</div>
```

Anchors:

| Field                       | Selector                                  |
|-----------------------------|-------------------------------------------|
| Average rating              | `[class*="title--title--"] > span:last-child` (parse `parseFloat`) |
| Filled stars (count)        | `[class*="stars--box--"] .comet-icon-starreviewfilled` (`.length`) |
| Ratings count               | `[class*="title--rating--"]` → `\d+` |
| "Verified purchases" badge  | `[class*="title--desc--"]` |

Note the **mismatch**: the header says "7 ratings" but the IL chip shows "(1)". The chip count is per-filter (only 1 review tagged Israel); the header is the all-locales total. After clicking the IL chip, the *list* below filters to that 1 review, but the header copy doesn't change.

### Sort & translate controls

```html
<div class="filter--bottom--12yws12">
  <button class="…filter--sort--Nop3o3J…"><span>Sort by default <chevron-down/></span></button>
  <div class="filter--translate--b1M7Zss">Show original language</div>
</div>
```

| Control       | Selector                                      |
|---------------|-----------------------------------------------|
| Sort dropdown | `[class*="filter--sort--"]` (button)          |
| Translate toggle | `[class*="filter--translate--"]` (div, click target) |

Sort default = "Sort by default"; observed alternative options on AliExpress include "Most relevant" / "Most recent" / "Most helpful" — they unfold from the dropdown but aren't in the static DOM.

### Individual review item

```html
<div class="list--itemBox--je_KNzb">
  <div class="list--itemPhoto--SQWM7vp"><img src="…/144x144.png_960x960.png_.avif"></div>
  <div class="list--itemContent--_RMYb2Q">
    <div class="list--itemContentTop--rXVH5KH">
      <div class="list--itemContentTopLeft--jv7Zzf1">
        <div class="stars--box--WrrveRu">…5× starreviewfilled…</div>
        <div class="list--itemSku--idEQSGC">Color:black</div>      <!-- variant the reviewer purchased -->
        <div class="list--itemReview--d9Z9Z5Z"></div>              <!-- review body (empty here — text-less rating) -->
      </div>
      <div class="list--itemThumbnails--TtUDHhl"></div>             <!-- attached customer photos -->
    </div>
    <div class="list--itemDesc--JcxNPy5">
      <div class="list--itemInfo--VEcgSFh">
        <span>AliExpress Shopper | 11 Feb 2026</span>               <!-- masked username | date -->
      </div>
      <div class="list--itemHelp--rJQPK57">
        <comet-icon-like/> <span class="list--itemHelpText--BfmXmgh">Helpful (0)</span>
        <span class="menu--wrap--jagf7YM">…overflow menu…</span>
      </div>
    </div>
  </div>
</div>
```

Per-review extraction map:

| Field                        | Selector (relative to `[class*="list--itemBox--"]`) |
|------------------------------|-----------------------------------------------------|
| Reviewer thumbnail (product photo) | `[class*="list--itemPhoto--"] img` |
| Star count (1–5)             | `[class*="stars--box--"] .comet-icon-starreviewfilled` (`.length`) |
| SKU / variant purchased      | `[class*="list--itemSku--"]` (e.g. `Color:black`) |
| Review text body             | `[class*="list--itemReview--"]` (empty when reviewer left only a star rating) |
| Customer-photo thumbnails    | `[class*="list--itemThumbnails--"] img` (zero in this sample) |
| Username + date              | `[class*="list--itemInfo--"] span` — split on ` | ` |
| Helpful count                | `[class*="list--itemHelpText--"]` → `\((\d+)\)` |

Important caveats:
- **Username is masked** — AliExpress shows "AliExpress Shopper" for all reviewers in the IL-filtered view (and most other views). Don't expect a real handle.
- **Date format** depends on locale. With `b_locale=en_US` it's `D Mon YYYY`; with `iw_IL` it'll be Hebrew. Parse defensively.
- **Empty review body** is normal — many AliExpress reviews are star-only. Use `textContent.trim().length` to detect.
- The variant string (`Color:black`) is `<facetName>:<value>` — with multiple facets, AliExpress concatenates them with `, ` (e.g. `Color:black, Size:M`).

### "View more" pagination

```html
<button class="…v3--btn--KaygomA…"><span>View more</span></button>
```

Click target: `[class*="v3--btn--"]` filtered to the one whose text is "View more" (locale-dependent — also key on it being the last button after the last review item).

## Stability summary

- Anchor on `country-flag-y2023` + ISO-2 class — both are semantic.
- Anchor on `comet-icon-photo` / `comet-icon-message` / `comet-icon-starreviewfilled` / `comet-icon-like` for icon-only elements (design-system classes).
- For everything else in this pane, use `[class*="<module>--<role>--"]` with the **un-hashed prefix**: `filter--filterItem--`, `filter--active--`, `filter--invalid--`, `filter--sort--`, `filter--translate--`, `title--wrap--`, `title--title--`, `title--rating--`, `title--desc--`, `stars--box--`, `list--itemBox--`, `list--itemPhoto--`, `list--itemSku--`, `list--itemReview--`, `list--itemThumbnails--`, `list--itemInfo--`, `list--itemHelp--`, `list--itemHelpText--`, `v3--btn--`.
- Never anchor on the hashed suffix (`AEUeCbl`, `o28izPu`, `je_KNzb`, `KaygomA`, …); they rotate per build.
