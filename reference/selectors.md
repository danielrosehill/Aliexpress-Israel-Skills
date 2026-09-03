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

## ⚠️ Read this before concluding any selector is broken

**AliExpress search results hydrate in stages, over ~10 seconds.** A probe run too
early sees a partially-built DOM and reports failures that are not real. Measured
2026-09-01 on the same page, same session, no reload:

| Read at | `a[href*="/item/"]` | `input[type=checkbox]` | `[aria-label^="filterCode:"]` |
|---|---|---|---|
| ~4 s (after scroll loop) | 4 | 0 | 0 |
| fully settled | 13 | 4 | 4 |

Every filter selector in this file "failed" on the early read and passed on the late
one. **Nothing had rotated.** Gate on a sanity condition before trusting a negative:

```js
// wait until the grid stops growing, then probe
const settled = async () => {
  let prev = -1, n = 0;
  for (let i = 0; i < 20; i++) {
    n = document.querySelectorAll('a[href*="/item/"]').length;
    if (n === prev && n >= 10) return n;
    prev = n;
    await new Promise(r => setTimeout(r, 1000));
  }
  return n;
};
```

If the count never reaches 10 on a broad query like `USB-C cable`, the page did not
render — report **inconclusive**, not failure. `skills/selector-verification` bakes
this in.

## ⚠️ The `he.` subdomain does not set the locale

Verified 2026-09-01: loading `https://he.aliexpress.com/w/...` while signed in gave
`document.documentElement.lang === "en"` and a language switcher reading **`EN/USD`**,
with every price rendered as `US $4.26`. The site knew it was the Israel storefront
(switcher label: *"…shopping on AliExpress il"*) yet served English and USD.

**The account/profile preference wins over the hostname.** The claim that visiting
`he.aliexpress.com` writes the ILS cookies is false for an account already set to
EN/USD. Skills must verify the rendered currency and either switch it explicitly via
the on-page picker or report the mismatch — never assume `₪` because of the host.

## Search results page — filter chips  (V)

Host: `https://he.aliexpress.com/w/wholesale-<url-encoded-query>.html`

**Confirmed 2026-09-01** (`USB-C cable`, EN/USD session, after full hydration).
The chips render as a **left sidebar**, not a horizontal chip row. Each is a wrapper
carrying the `aria-label`, containing an `<input type="checkbox">`. Click the
**wrapper**, not the inner input.

| Filter | Selector | Status |
|---|---|---|
| Free shipping | `[aria-label="filterCode:freeshipping"]` | V 2026-09-01 |
| Choice | `[aria-label="filterCode:choice_atm"]` | V 2026-09-01 |
| 4★ & up | `[aria-label="filterCode:4StarRating"]` | V 2026-09-01 |
| Sale / big sale | `[aria-label="filterCode:bigsale"]` | V 2026-09-01 — undocumented until now |
| Premium Quality | `[aria-label="filterCode:PremiumQuality"]` | **U** — absent on this fixture |

`PremiumQuality` returned 0 on `USB-C cable` while the other four returned 1 each.
That is consistent with the chip being category-dependent rather than rotated, but it
is **not proven** — re-test on a category where Premium Quality is offered before
treating its absence as normal. The inner input carries no `aria-label` and no
`name`; the wrapper is the only stable handle.

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
`[aria-label="IL"]` **confirmed present, 2026-09-01** (1 match). Note the sibling
radios in the same sidebar use category ids as their `aria-label` (`10130-4358550`),
so scope to the country group rather than assuming every radio is a country.

```js
document.querySelector('[aria-label="IL"]').click();        // set
document.querySelector('.il_v [aria-checked="true"]')?.getAttribute('aria-label');  // read
```

`.il_v` is a hashed scope and *will* rotate. If the read returns nothing, fall back
to scoping under the "Shipping from" / "נשלח מ" header by text.

## Search results page — product cards  (V)

**`[class*="price"]` is broken — do not use it.** Measured 2026-09-01 on a fully
hydrated page: **0 of 13** cards matched. The price is split across `<span>` leaves
carrying *only* hashed classes (`lz_kw` holds the `US $` glyph, `lz_lp` the digits),
with no `price` substring anywhere in the card. This is the one documented selector
that genuinely rotated.

**Working replacement — parse the card's `innerText`.** 13/13 on the same page, and
currency-agnostic, so it survives an ILS session unchanged:

```js
[...document.querySelectorAll('a[href*="/item/"]')]
  .filter(a => (a.innerText || '').trim())
  .map(a => {
    const text = a.innerText;
    const prices = text.match(/(?:US ?\$|₪)\s?[\d,]+\.?\d*/g) ?? [];
    return {
      id: a.href.match(/item\/(\d+)/)?.[1],
      url: a.href.split('?')[0],
      title: text.split('\n').find(l => l.length > 15) ?? null,
      priceText: prices[0] ?? null,        // live price
      crossedText: prices[1] ?? null,      // struck-through "was", when present
    };
  })
  .filter(c => c.id && c.title);
```

A card's `innerText` reads, in order: title, live price, crossed price, discount %,
rating, sold count. **The first currency match is the payable price** — do not sort
the matches numerically, the crossed price is higher and would win.

`[aria-label^="US $"]` also matched 13/13 and is a viable alternate, but it hard-codes
the currency and would need a second pattern under ILS. Prefer the `innerText` parse.

Title via `[class*="title"], h3, [title]` **still works** — 13/13, V 2026-09-01.

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

## Product page — CTA row: add to cart / buy now  (U)

**Not yet captured. Everything below is a candidate anchor.** Used by `add-to-cart`
and `buy-now`. Both skills verify their *effect* (cart diff, order id) rather than
trusting that a click landed, which is what makes shipping them on `U` selectors
acceptable — but promote this section with a date once probed.

The row holds **two** buttons and they do very different things. Locating "a button
in the CTA row" is not enough; match the label.

| Action | English label | Hebrew label | Effect |
|---|---|---|---|
| Add to cart | `Add to Cart`, `Add to cart` | `הוסף לסל`, `הוספה לסל` | tier 2, reversible |
| Buy now | `Buy Now`, `Buy now` | `קנה עכשיו` | **skips the cart**, jumps to the confirm page |

Discovery by text, scoped to real buttons:

```js
const findCta = (kind) => {
  const pat = kind === 'cart'
    ? /add to cart|הוס[פף] ?ל?סל|הוספה לסל/i
    : /buy now|קנה עכשיו/i;
  return [...document.querySelectorAll('button, [role="button"], a[class*="button"]')]
    .find(b => pat.test((b.innerText || b.getAttribute('aria-label') || '').trim()));
};
```

Traps to expect when this is probed:

- **Choice listings lay the row out differently** from non-Choice ones.
- The button may render **disabled until every SKU axis is chosen**, and a disabled
  click is a silent no-op — assert `!el.disabled && el.getAttribute('aria-disabled')
  !== 'true'` before clicking.
- Sticky/duplicate CTA bars: a floating bar can appear on scroll, so the same label
  may match **twice**. Take the first visible match (`offsetParent !== null`), and if
  two visible matches exist, prefer the one inside the main product block.
- The qty input is a plain `input` near the row; set `value` and dispatch `input` +
  `change`, then **read it back** — it clamps to the per-order ceiling silently.
- An "out of stock" / "ships to another country" state replaces the row entirely
  rather than disabling it. A missing CTA is more likely this than a rotated selector.

## Cart page — checkout CTA  (U)

Host: `https://www.aliexpress.com/p/shoppingcart/index.html`. Used by
`open-checkout`.

```js
[...document.querySelectorAll('button, [role="button"], a')]
  .find(b => /checkout|לתשלום|המשך לתשלום|בצע הזמנה/i.test((b.innerText||'').trim()));
```

- The CTA acts on **ticked lines only**. Read the selection state with `export-cart`
  *before* clicking; the confirm page no longer shows what was excluded.
- The button label often carries the count (`Checkout (3)`) — useful as a
  cross-check against `export-cart`'s selected count, so match on a substring.
- With nothing ticked the CTA is disabled, not absent.

## Order confirmation page  (U)

Host: `https://www.aliexpress.com/p/trade/confirm.html`. Used by `open-checkout`
(read) and `buy-now` (read, then one click).

**Read the whole page's text and parse by label rather than hunting for per-field
selectors.** The layout is heavily A/B tested and label-anchored parsing has a much
better chance of surviving a build than any class will:

```js
// settle gate — the total arrives after the item rows
const totalText = () => (document.body.innerText
  .match(/(?:Total|סה"?כ|סכום לתשלום)[^\n]*?((?:US ?\$|₪)\s?[\d,]+\.?\d*)/i) || [])[1] ?? null;
```

Poll `totalText()` until two consecutive reads a second apart agree, then read the
rest. **Reading on first paint yields a total missing shipping and tax** that looks
like a plausible total — the most dangerous failure mode on this page.

Labels to parse for: total / `סה"כ`, shipping / `משלוח`, tax or VAT / `מע"מ`,
discount or coupon / `הנחה` `קופון`, and the place-order CTA:

```js
[...document.querySelectorAll('button, [role="button"]')]
  .find(b => /place order|submit order|בצע הזמנה|שלח הזמנה/i.test((b.innerText||'').trim()));
```

`buy-now` clicks that **once** and never retries on an ambiguous outcome — the orders
list at `https://www.aliexpress.com/p/order/index.html` is the authority on whether an
order exists.

## Cart

The cart is **not** in the DOM at all — it arrives by JSONP script injection and is
read out of page state. See `skills/export-cart/reference.md`; no selectors apply.


---

## Verification log

| Date | Fixture | Session | Result |
|---|---|---|---|
| 2026-09-01 | `USB-C cable` search, `he.aliexpress.com` | EN/USD, signed in, Chrome | 5 confirmed V · 1 genuine break (card price → replaced with innerText parse) · 1 inconclusive (`PremiumQuality`) · locale premise disproved · staged-hydration gate added. Product page (delivery panel, spec table, review chips) **not yet probed** — still `U`. |
| — | write paths (product CTA row, cart checkout CTA, confirm page) | — | **Not probed.** Added `U` alongside `add-to-cart` / `open-checkout` / `buy-now` in v1.6.0. These skills verify their effect (cart diff, order id) instead of trusting the selector, so a rotation degrades to a clean failure rather than a wrong action — but the section should be promoted to `V` on the next live run. |
