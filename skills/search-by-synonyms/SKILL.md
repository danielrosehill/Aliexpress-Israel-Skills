---
name: search-by-synonyms
description: Find products on AliExpress that hide under many names — rotate keyword mutations (synonyms, trade/industrial terms, CN-marketplace names) over search-aliexpress, dedupe, and filter on the one defining spec. For hard-to-name commodity items.
---

# Search by Synonyms (keyword-mutation search)

Some products are cheap and common but **have no single canonical name** — the good,
well-priced listings hide under industrial jargon, trade terms, or literal
translations of the Chinese marketplace name. A plain single-query search misses
them. This skill rotates a **set** of query mutations over `search-aliexpress`,
merges and de-dupes the results, and filters hard on the one spec that actually
defines the product.

## When to use

- The item is a commodity that sellers describe inconsistently (storage/organization
  gear, tools, fittings, adapters, industrial supplies).
- A first plain search returns mostly the *wrong size/variant* of the right idea
  (e.g. you want 60×40 cm and you keep getting 30×20 cm).
- The user says things like "these go by different names" / "I only found the good
  one by accident."

If you already have the exact product name and just want a shortlist, use
`search-aliexpress` directly.

## The method

1. **Build a mutation set** — 4–10 queries spanning the naming axes below. Include
   Hebrew and English; both work on the IL channel.
2. **Run each** through `search-aliexpress` (Choice-first stays the default). Keep
   per-query result counts.
3. **Merge + de-dupe by item id** (the same listing surfaces under several names —
   that overlap is signal, not noise: items appearing under many queries are usually
   the core matches).
4. **Filter on the defining spec** — the one attribute that separates the product
   you want from its look-alikes (usually a **dimension**, sometimes a material or
   capacity). Drop everything that fails it, even if it's cheaper.
5. **Rank and hand off** the survivors to `ship-options-il` (lane and lead time) and
   `fetch-listing` (landed cost).

## Naming axes to rotate

For any given product, generate mutations across these axes:

- **Plain name** — the obvious consumer term.
- **Trade / industrial term** — what a warehouse or supplier calls it.
- **Function framing** — what it's used *for* (sellers title by use-case:
  "for car parts", "for logistics", "for tools").
- **Literal CN-marketplace translation** — often an animal/shape metaphor. These are
  gold because few competitors optimize for the English of them.
- **Material / spec prefix** — `HDPE`, `PP`, `stainless`, `thickened`, `heavy duty`.

### Worked example — the euro storage box

One physical product, all of these names on AliExpress:

| Axis | Queries |
|------|---------|
| Plain | `euro box`, `euro container`, `euro crate`, `ארגז אחסון` |
| Trade / industrial | `industrial tote`, `stackable storage bin`, `logistics turnover box`, `ארגז תעשייתי` |
| Function framing | `auto parts storage box`, `plastic injection storage box` |
| CN-marketplace literal | `turtle box` (乌龟箱 — the ones with an **attached folding lid**, aka ACL) |
| Material / spec | `thickened HDPE turnover box`, `heavy duty plastic crate` |

**Defining spec to filter on:** footprint **60×40 cm** (or 40×30 cm). Reverse-image
search *also* helps jump the naming gap — but it surfaces the **wrong dimensions
first** (30×20, 40×30), so the footprint filter is mandatory either way.

## Reverse-image as a complementary hop

If the user has a photo of the exact item, use `search-by-image` — it drives
AliExpress's own visual search and leaps the naming problem entirely. Then still
apply the spec filter, because visual matches skew to the most-common (often
smaller) variant.

## Output format

```
Product: <what we're hunting>   Defining spec: <e.g. footprint 60×40 cm>
Mutations run (N): euro box · euro container · industrial tote · turtle box · …

Per-query counts:
  "euro box"            → 20   (3 pass spec)
  "turtle box"          → 14   (5 pass spec)
  …

Merged unique items: <M>   Passing defining spec: <K>

Shortlist (spec-passing, deduped, Choice-first):
1. <title>   ₪<price>   footprint <WxD>   badges:[Choice]   <url>
2. …

Dropped-on-spec: <count>  (wrong size/material — list a couple if useful)
Next: `ship-options-il` + `fetch-listing` on the shortlist; `hunt-pricing-anomaly` on multi-size listings.
```

## Composition

- Built **on top of** `search-aliexpress` — inherits the Chrome-first route, the
  locale handshake, the Choice default and all filters. Pass `freeshipping` /
  `ship_from` straight through.
- Feeds `ship-options-il` (lane), `fetch-listing` (landed cost) and
  `hunt-pricing-anomaly` (per-volume / bulk).

## Validation checklist

1. At least 4 distinct mutations were run (not just pluralizations of one word).
2. Results are de-duped by item id across mutations.
3. The defining spec filter was applied and the dropped count is reported (a search
   that keeps everything probably didn't filter).
4. Locale/currency verified per `search-aliexpress` (prices in ₪).
