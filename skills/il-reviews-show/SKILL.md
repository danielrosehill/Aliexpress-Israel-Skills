---
name: il-reviews-show
description: Show only Israeli buyers' reviews on an AliExpress product page — stars, variant, photos, text, date — filtered via a local browser.
---

# Show AliExpress Reviews from Israel

Filter the reviews on an AliExpress product page down to those left by Israeli buyers and return them in a structured form. Drives the product page in a local visible browser via Playwright.

## Why this matters

AliExpress aggregates reviews globally. For an Israel-based buyer, only the IL-tagged reviews are signal — they confirm:

- The product actually shipped to IL (not just "free shipping" theatre)
- Realistic IL delivery times in lived experience
- Whether the variant the buyer wants has been bought locally before
- IL-specific issues (plug type, voltage, manuals, customs experience) that global reviews miss

## Inputs

- `url` (required) — full AliExpress product URL (`https://he.aliexpress.com/item/<id>.html` or `.aliexpress.com/item/<id>.html`).
- `max_reviews` (optional, default: all) — cap on number of IL reviews to extract.
- `translate_hebrew` (optional, default `false`) — if a review body is in Hebrew, also include an English gloss.

## Locale prerequisite

Site must be in IL/Hebrew/ILS (see `search-aliexpress` for the cookie handshake — `aep_usuc_f.c_tp=ILS`, `b_locale=iw_IL`). The IL chip appears regardless of locale, but timestamps render per `b_locale` and need to be parsed accordingly.

## Locating the IL filter chip

The review-filter strip lives below the reviews header. Each chip is a `<div>` whose class starts with `filter--filterItem--`. The Israel chip carries a child `<span>` whose class list contains *some* `country-flag-*` versioned class **plus** the bare ISO-2 `IL`. As of capture the versioned class is `country-flag-y2023`, but the `-y2023` suffix telegraphs that AliExpress versions this sprite — anchor on the prefix, not the year.

**Robust selector** — version-agnostic, won't break when AliExpress rolls `country-flag-y2024` / `country-flag-v2` / etc.:

```js
const ilChip = document.querySelector('[class*="country-flag-"].IL')
                  ?.closest('[class*="filter--filterItem--"]');
```

Do **not** anchor on the literal `country-flag-y2023` — it will break on the next sprite roll. The `[class*="country-flag-"]` substring + the `IL` ISO class together are the stable pair.

### Pre-flight checks

1. **Reviews section exists**: `[class*="title--wrap--"]` is present. If not, the listing has no reviews at all — report and stop.
2. **IL chip exists**: `[class*="country-flag-"].IL` is in the DOM. If absent, **no reviews from Israel exist for this product** — report `0 IL reviews` and stop. Do not invent any.
3. **IL chip is not invalid**: the wrapper does **not** carry `[class*="filter--invalid--"]`.
4. **Read the IL count** from the chip text, e.g. `(1)`:

   ```js
   const m = ilChip?.textContent.match(/\((\d+)\)/);
   const ilCount = m ? parseInt(m[1], 10) : 0;
   ```

## Applying the filter

Click the chip wrapper (not the inner flag span):

```js
ilChip.click();
```

Then verify the chip flipped to active:

```js
ilChip.matches('[class*="filter--active--"]');   // → true
```

Wait for the review list to re-render (network idle, or wait for the list container to mutate). The reviews header copy ("7 ratings", etc.) does **not** change after filtering — only the list below filters. Don't gate on the header.

## Expanding the list

If a `View more` button is present at the bottom of the review list, click it repeatedly until either it disappears or `max_reviews` IL reviews have been collected.

```js
const btn = [...document.querySelectorAll('[class*="v3--btn--"]')]
  .find(b => /view more|טען עוד|הצג עוד/i.test(b.textContent));
```

## Per-review extraction

Each review is a `[class*="list--itemBox--"]`. Extract:

| Field           | Selector (relative to the item box)                        |
|-----------------|-------------------------------------------------------------|
| stars (1–5)     | `[class*="stars--box--"] .comet-icon-starreviewfilled` → count |
| variant / SKU   | `[class*="list--itemSku--"]` (e.g. `Color:black, Size:M`)   |
| review body     | `[class*="list--itemReview--"]` — may be empty (star-only)  |
| customer photos | `[class*="list--itemThumbnails--"] img` → `src` array       |
| product thumb   | `[class*="list--itemPhoto--"] img` → `src`                  |
| username + date | `[class*="list--itemInfo--"] span` — split on ` | `         |
| helpful count   | `[class*="list--itemHelpText--"]` → `\((\d+)\)`             |

### Caveats baked into the parser

- **Usernames are masked** — AliExpress shows `AliExpress Shopper` (or its locale equivalent) for everyone. Do not present this as the reviewer's identity.
- **Empty review bodies are normal**. Detect with `textContent.trim().length === 0` and tag as `star-only`.
- **Date locale**: with `b_locale=iw_IL`, dates render in Hebrew (e.g. `11 בפבר׳ 2026`). Parse defensively; if parsing fails, return the raw string.
- **Variant facets**: `<facet>:<value>[, <facet>:<value>]…` — preserve as-is, don't try to normalise.

## Output format

```
Product: <title>
URL: <url>
IL reviews: <N>   (chip count: <chip_count>)
Average rating (all locales): <X.X>   ← from header, not IL-filtered

For each IL review:
─────────────────────────────────────
[★★★★★]  variant: <Color:black, Size:M>
date: <YYYY-MM-DD or raw>          helpful: <N>
photos: <count>  thumbs: [<urls>]
review:
  <body or "(star-only — no text)">
─────────────────────────────────────
```

If `translate_hebrew=true` and a review body is Hebrew, append an English gloss block after the original.

## Failure modes

- **No IL chip on the page** → `0 IL reviews`, stop.
- **Chip click doesn't activate** (`filter--active--*` doesn't appear) → wait once more, then report inability to apply filter and bail.
- **Captcha / risk challenge** → report and stop; do not retry in a loop.
- **Page structure changed** (selectors return nothing) → report which selector failed and stop.

## Out of scope

- Does **not** translate reviews automatically unless `translate_hebrew=true` is set.
- Does **not** rank reviews or compute a derived "IL sentiment score" — just returns them.
- Does **not** filter by stars, photos, or text-only — those are separate chips in the same strip.

## Validation checklist

1. URL is a valid AliExpress `/item/<id>.html`.
2. IL chip count was read from the DOM before filtering.
3. After click, the IL chip carries `[class*="filter--active--"]`.
4. Number of extracted reviews ≤ chip count (with "View more" expansion if needed).
5. Each extracted review has a star count, date, and variant fields populated (or explicitly `null` if absent).
