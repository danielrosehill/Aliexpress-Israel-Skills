---
name: il-reviews-show
description: Show only Israeli buyers' reviews on an AliExpress product page — stars, variant, photos, text, date — filtered in the user's own Chrome.
---

# Show AliExpress Reviews from Israel

Filter a product page's reviews down to those left by Israeli buyers and return them
structured.

## Why this matters

AliExpress aggregates reviews globally. For an Israel-based buyer only the IL-tagged
reviews are signal — they confirm the product **actually shipped to IL** (not just
"free shipping" theatre), realistic lived delivery times, whether the variant wanted
has been bought locally before, and IL-specific issues (plug type, voltage, manuals,
customs experience) that global reviews miss.

Pairs naturally with `ship-options-il`: the panel tells you what AliExpress
*promises*, IL reviews tell you what actually arrived and when.

## Inputs

- `url` (required) — full AliExpress product URL
- `max_reviews` (optional, default: all)
- `translate_hebrew` (optional, default `false`) — add an English gloss for Hebrew
  bodies

## Browser route and locale

Chrome first — see `$CLAUDE_PLUGIN_ROOT/reference/browser.md`. The IL chip appears
regardless of locale, but timestamps render per `b_locale`, so establish the
handshake first and parse Hebrew dates accordingly.

## Locating and applying the IL filter

Selectors: `$CLAUDE_PLUGIN_ROOT/reference/selectors.md` (review chip section) —
the version-agnostic `[class*="country-flag-"].IL` anchor, the chip count regex, the
`filter--active--` assertion and the "View more" button.

**Pre-flight, in order:**

1. Reviews section exists (`[class*="title--wrap--"]`). If not — listing has no
   reviews at all. Report and stop.
2. IL chip exists in the DOM. If absent — **no reviews from Israel exist for this
   product**. Report `0 IL reviews` and stop. Do not invent or substitute.
3. Chip is not `filter--invalid--`.
4. Read the IL count from the chip text *before* filtering.

Then click the chip wrapper (not the inner flag span) and verify it flipped to
active. Wait for the review list container to mutate. **The reviews header copy
("7 ratings") does not change when filtering** — do not gate on it.

Expand with "View more" until it disappears or `max_reviews` IL reviews are held.

## Per-review extraction

Field table in `reference/selectors.md`. Caveats baked into the parse:

- **Usernames are masked site-wide** (`AliExpress Shopper`). Never present a
  reviewer identity.
- **Empty bodies are normal** — tag `star-only` rather than dropping.
- **Dates render in Hebrew** (`11 בפבר׳ 2026`). Parse defensively; return the raw
  string on failure rather than a wrong date.
- **Variant facets** are `<facet>:<value>[, …]` — preserve as-is, don't normalise.

## Output format

```
Product: <title>                    Route: claude-in-chrome
URL: <url>
IL reviews: <N>   (chip count: <chip_count>)
Average rating (all locales): <X.X>   ← from header, NOT IL-filtered

─────────────────────────────────────
[★★★★★]  variant: <Color:black, Size:M>   date: <YYYY-MM-DD or raw>
helpful: <N>   photos: <count>   thumbs: [<urls>]
review: <body or "(star-only, no text)">
─────────────────────────────────────
```

With `translate_hebrew=true`, append an English gloss under the original.

## Failure modes

- No IL chip → `0 IL reviews`, stop.
- Chip won't activate → wait once more, then report the inability and bail.
- Captcha / risk challenge → report and stop. **Do not retry in a loop.**
- Selectors return nothing → report which selector failed and stop.

## Out of scope

Auto-translation unless asked; ranking or deriving an "IL sentiment score"; filtering
by stars/photos/text-only (separate chips in the same strip).

## Validation checklist

1. URL is a valid AliExpress `/item/<id>.html`.
2. IL chip count read from the DOM **before** filtering.
3. Chip carries `filter--active--` after the click.
4. Extracted count ≤ chip count (with "View more" expansion if needed).
5. Each review has stars, date and variant populated, or explicitly `null`.
