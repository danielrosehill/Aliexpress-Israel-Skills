---
name: search-by-image
description: Reverse-image search on AliExpress — upload a product photo to AliExpress's own visual search (camera icon) via the browser and return IL-context product cards. For items that are hard to name (industrial parts, fittings, odd shapes) where keyword search fails.
---

# Search by Image (reverse-image search)

Some products can't be found by words — you have a photo (or a competitor's listing
image) but no reliable name, and keyword search returns the wrong category entirely
(e.g. searching "shelf bin / parts organizer" surfaces jewelry organizers, not the
industrial louvre pick-bin you actually want). AliExpress's **own visual search** is
excellent at these. This skill drives it: upload the image → read the IL-context
result cards.

## When to use

- You have an **image** of the product (photo, screenshot, or a saved listing image)
  and keyword search isn't surfacing it.
- The item is a hard-to-name commodity (industrial bins, brackets, fittings, an odd
  shape) — the complement to `search-by-synonyms` (which attacks the naming problem
  from the words side; this attacks it from the picture side).

## Why the browser, not an API

The **official AliExpress Open Platform API (affiliate / dropshipping) does not cleanly
expose consumer reverse-image search.** AliExpress's *site* visual search is the
reliable route, and this plugin already drives the site in a visible browser, so it's
the natural home.

- **Primary (this skill):** browser-driven visual search on `he.aliexpress.com`.
- **Fallback (no browser / batch):** third-party image-search APIs —
  Apify `freecamp008/search-by-image-aliexpress`, `omkarcloud/aliexpress-scraper` —
  take an image URL and return matches as JSON. They cost/limit per call and are
  outside the IL locale, so treat their prices as indicative and re-check landed cost
  via `fetch-listing`.

## Inputs

- `image` (required) — local file path to the product photo, **or** an image URL.
- `filters` (optional) — same as `search-aliexpress` (`choice` default true,
  `freeshipping`, `rating4plus`, `ship_from`); applied on the results page after the
  visual search returns.
- `defining_spec` (optional but recommended) — the one attribute that separates the
  target from look-alikes (usually a **dimension**). Visual search returns
  *visually*-similar items across the whole size range, so filter on this.
- `max_results` (optional, default 20).

## Method (browser, local + visible)

Follow `search-aliexpress` for the **locale handshake** (ILS + Hebrew cookies,
visible browser, persistent profile) — do that first so results come back in ₪.

1. **Open the entry point.** Navigate to `https://he.aliexpress.com/`. The visual
   search lives behind the **camera icon inside the main search bar**. Anchor on role
   / `aria-label` (icon class names rotate — never hard-code them); the control is an
   image-search / camera button adjacent to the search input. Clicking it reveals a
   drag-drop zone with a hidden `<input type="file">`.
2. **Upload the image.** Use Playwright's file-upload (`browser_file_upload`) to hand
   the local `image` path to that file input. If given a URL instead of a local path,
   download it to a temp file first, then upload. On success the page navigates to the
   image-search results (URL contains `image-search` / an uploaded-image token).
3. **Wait + read cards.** Wait for results to render, then read product cards with the
   same defensive query as `search-aliexpress`
   (`a[href*="/item/"]` → url / title / price / badges), de-duped by item id.
4. **Apply filters + spec.** Apply any requested chips (Choice default). Drop cards
   that fail `defining_spec` — this is essential for visual search, which happily
   returns the 30×20 version of a 60×40 product.
5. **Hand off.** Shortlist → `fetch-listing` (landed cost) → `hunt-pricing-anomaly`
   (per-SKU / ₪-per-litre) on any multi-size listing.

### Selector discovery (do once, record if it changes)

The camera/image-search control and the file input are the only image-specific
elements. Validate them on a live visible browser the first time (as with the other
skills' selectors), preferring `aria-label` / role anchors. If the in-search-bar
camera isn't present for the account, the image-search results page can also be
reached directly and the file input targeted there.

## Output format

```
Image: <path or url>   Defining spec: <e.g. No.3 pick bin ≈ 24×14.5×13 cm>
Visual-search results URL: <url>
Locale verified: c_tp=ILS
Result count: <N>   (passing defining spec: <K>)

1. <title>   ₪<price>   badges:[Choice]   <url>
2. …

Dropped-on-spec: <count>
Next: fetch-listing on the top picks; compare landed vs. local before buying.
```

## Composition

- Pairs with `search-by-synonyms`: **image search finds the product family; synonyms +
  the spec filter refine and widen it.** Run whichever the input gives you (photo vs.
  words), then cross-check.
- Feeds `fetch-listing` and `hunt-pricing-anomaly`.

## Validation checklist

1. The uploaded image produced an AliExpress **image-search** results page (URL /
   heading confirms visual search, not a keyword query).
2. Locale/currency verified (prices in ₪).
3. `defining_spec` applied and the dropped count reported (visual search without a
   spec filter is almost always too broad).
4. At least the top picks were handed to `fetch-listing` for landed cost.
