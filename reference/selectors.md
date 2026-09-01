# DOM selector reference

Every selector this plugin depends on, in one place, with its verification status.
Skills link here instead of carrying their own copy.

**Rule that governs all of these:** AliExpress ships hashed, per-build class names
(`il_v`, `ip_iq`, `ie_a6`) and versioned sprite classes (`country-flag-y2023`).
Never anchor on them. Anchor on `aria-label`, on role, or on a `[class*="prefix--"]`
substring where the prefix is a stable BEM-ish module name.

Status key: **V** = verified against the live DOM · **U** = unverified, candidate
anchors only, capture before trusting.

---

## Search results page — filter chips  (V)

Host: `https://he.aliexpress.com/w/wholesale-<url-encoded-query>.html`

Click the wrapper `<span>`, **not** the inner `<input>`. State is reflected on the
wrapper via `aria-checked`.

| Filter | Selector |
|---|---|
| Free shipping | `[aria-label="filterCode:freeshipping"]` |
| Choice | `[aria-label="filterCode:choice_atm"]` |
| 4★ & up | `[aria-label="filterCode:4StarRating"]` |
| Premium Quality | `[aria-label="filterCode:PremiumQuality"]` |

```js
const toggleChip = (code) => {
  const el = document.querySelector(`[aria-label="filterCode:${code}"]`);
  if (!el) return null;
  if (el.getAttribute('aria-checked') !== 'true') el.click();
  return el.getAttribute('aria-checked');
};
```

Assert `aria-checked === 'true'` **after** the re-render. If it is still `false`:
zero-result query, captcha, or unhydrated DOM. Wait once, retry once, then bail with
a clear error — do not report unfiltered results as filtered.

## Search results page — ship-from country  (V)

Single-select radio group. Options on an IL account: `-1` (All) / `IL` / `TR` / `CN`.

```js
document.querySelector('[aria-label="IL"]').click();        // set
document.querySelector('.il_v [aria-checked="true"]')?.getAttribute('aria-label');  // read
```

`.il_v` is a hashed scope and *will* rotate. If the read returns nothing, fall back
to scoping under the "Shipping from" / "נשלח מ" header by text.

## Search results page — product cards  (V)

No stable un-hashed anchor. Query defensively off the item link:

```js
[...document.querySelectorAll('a[href*="/item/"]')]
  .map(a => ({
    url: a.href,
    title: a.querySelector('[class*="title"], h3, [title]')?.getAttribute('title')
        || a.querySelector('[class*="title"], h3')?.textContent?.trim(),
    priceText: a.querySelector('[class*="price"]')?.textContent?.trim(),
  }))
  .filter(c => c.url && c.title);
```

De-dupe by item id (`/item/(\d+)\.html`) — the same listing appears in multiple ad
slots. Price strings vary: `₪12.34`, `₪1,234.56`, ranges `₪10.00 - ₪25.00`. Parse
defensively; never assume a fixed format.

## Product page — review filter chips  (V)

Chip wrappers: `[class*="filter--filterItem--"]`. The Israel chip carries a child
`<span>` whose class list holds *some* `country-flag-*` versioned class **plus** the
bare ISO-2 `IL`.

```js
const ilChip = document.querySelector('[class*="country-flag-"].IL')
                  ?.closest('[class*="filter--filterItem--"]');
const ilCount = parseInt(ilChip?.textContent.match(/\((\d+)\)/)?.[1] ?? '0', 10);
```

- Reviews section present: `[class*="title--wrap--"]`
- Chip disabled: wrapper carries `[class*="filter--invalid--"]`
- Chip active after click: `ilChip.matches('[class*="filter--active--"]')`
- "View more": `[...document.querySelectorAll('[class*="v3--btn--"]')].find(b => /view more|טען עוד|הצג עוד/i.test(b.textContent))`

## Product page — review items  (V)

Each review: `[class*="list--itemBox--"]`.

| Field | Selector (relative to item box) |
|---|---|
| stars (1–5) | `[class*="stars--box--"] .comet-icon-starreviewfilled` → count |
| variant / SKU | `[class*="list--itemSku--"]` |
| body | `[class*="list--itemReview--"]` (may be empty — tag `star-only`) |
| customer photos | `[class*="list--itemThumbnails--"] img` → `src[]` |
| product thumb | `[class*="list--itemPhoto--"] img` → `src` |
| username + date | `[class*="list--itemInfo--"] span`, split on ` \| ` |
| helpful count | `[class*="list--itemHelpText--"]` → `\((\d+)\)` |

Usernames are masked site-wide (`AliExpress Shopper`) — never present a reviewer
identity. Dates render per `b_locale`, so in Hebrew (`11 בפבר׳ 2026`); parse
defensively and return the raw string on failure.

## Product page — delivery / shipping options panel  (U)

**Not yet captured. Do not treat anything below as validated.** `ship-options-il`
carries the capture procedure; run it once and promote the results into this section
with a verification date.

What is known:

- The panel is JS-rendered and gated on the ship-to country in `aep_usuc_f`. Reading
  it with `fetch` returns nothing useful.
- Multiple options are only exposed after opening the shipping row — the collapsed
  row shows one default option, usually the cheapest, not the best.
- Choice listings render a different panel from non-Choice ones.

Candidate anchors to *test*, in preference order:

1. Text anchor on the localized labels — `משלוח` / `Shipping` / `אספקה` — then walk
   to the containing block. Most durable across builds.
2. `[class*="dynamic-shipping"]` — long-standing module prefix on the shipping block.
3. `[class*="comet-v2-modal"]` for the options modal once the row is opened.

Prefer route 1 and verify against the rendered text, not the class.

## Product page — specification table  (U)

**Not yet captured.** Used by `check-il-compatibility` to read plug type, voltage and
frequency. Candidate anchors to test:

```js
[...document.querySelectorAll('[class*="specification"] li, [class*="spec"] li')]
  .map(el => el.innerText.trim()).filter(Boolean);
```

Fall back to a regex sweep of `document.body.innerText` for
`/Plug|Voltage|Frequency|תקע|מתח|\b\d{2,3}\s?V\b|\bHz\b/`. The table is often
collapsed behind a "more" toggle — expand before reading, or you get the first four
rows only. Promote to `V` with a date once verified.

## Product page — variant / SKU grid  (U)

Plug type, size and colour are variants, not listing properties. The grid is
JS-gated: the price and the shipping panel both update on selection, so read them
*after* clicking, never before. Used by `hunt-pricing-anomaly`,
`check-il-compatibility` and `ship-options-il`.

## Cart

The cart is **not** in the DOM at all — it arrives by JSONP script injection and is
read out of page state. See `skills/export-cart/reference.md`; no selectors apply.
