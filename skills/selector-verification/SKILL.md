---
name: selector-verification
description: Plugin maintenance — probe the live AliExpress DOM against every selector documented in reference/selectors.md and report which still work. Run when a skill starts returning empty results, or periodically. Not a shopping skill; never invoke it to find or buy anything.
---

# Selector Verification (plugin maintenance)

Every browser skill here depends on selectors that AliExpress rotates without
notice. This skill checks them against the live site and reports which are stale, so
a broken selector is diagnosed in one pass instead of being rediscovered separately
inside each skill.

**This is an admin skill.** It buys nothing, searches for nothing on the user's
behalf and returns no product recommendations. Do not invoke it for shopping.

## When to run

- **A skill returned an empty result that looks wrong** — zero cards on a query that
  obviously has products, zero IL reviews on a popular listing, a filter chip that
  won't go `aria-checked`. Empty is the signature failure of a rotated selector, and
  it is indistinguishable from a legitimately empty result until you probe.
- **Before trusting a `V` in `reference/selectors.md` that hasn't been dated
  recently.** A verification date is evidence about the day it was taken, nothing more.
- **After promoting anything from `U` to `V`** — confirm the promotion on a second page.
- Periodically, as maintenance.

## Fixed test fixtures

Reproducibility matters more than realism here: the same query every time means a
change in the result is a change in the site, not a change in the input.

| Fixture | Value | Why |
|---|---|---|
| Canonical query | **`USB-C cable`** | Enormous result count in every locale, so zero results always means breakage, never a thin category. Cheap, Choice-heavy, always has free-shipping and 4★ listings, so every filter chip has something to act on. |
| Product page | **first Choice card from that search** | Do not hard-code an item id — listings get delisted and you end up probing a 404 and reporting a false failure. Derive it at runtime. |
| Electrical fixture | any charger/cable listing from the same query | Exercises the spec table (plug type / voltage) for `check-il-compatibility`. |
| Reviews fixture | a listing with **≥100 reviews** | An IL chip legitimately absent on a low-review listing is not a selector failure. Only a well-reviewed listing can distinguish the two. |

Search URL:

```
https://he.aliexpress.com/w/wholesale-USB-C-cable.html
```

## Procedure

1. **Chrome, per `$CLAUDE_PLUGIN_ROOT/reference/browser.md`.** Probing through a
   scraper tells you about the scraper, not about what the skills will see.
2. **Record the session state before anything else** — locale, currency, ship-to.
   A probe run in a USD/EN session says nothing about whether the ILS selectors work,
   and reporting it as though it did is the trap this skill exists to avoid.
3. **Run `scripts/probe.js`** via `javascript_tool` on the search results page. Give
   the page 3–5 seconds to hydrate first; probing mid-hydration produces false FAILs,
   which is worse than no data.
4. **Re-run on a product page** derived from the search results. The probe detects
   which page it is on and runs the applicable subset.
5. **Triage every FAIL** before recording it (below).
6. **Update `reference/selectors.md`** — status, date, and the working replacement
   where one was found.

## Triaging a FAIL

A FAIL is a hypothesis, not a finding. Rule out, in order:

1. **Not hydrated** — re-run after a longer wait. The single most common false FAIL.
2. **Wrong page state** — filter rows can require a scroll; review selectors need the
   reviews section in view; the shipping modal only exists once the row is opened.
3. **Legitimately absent** — no IL reviews on this listing, no free-shipping listings
   for this query. Re-test on a fixture where the thing must exist.
4. **Session-dependent** — a control that only renders for certain locales or
   ship-to countries. Note the session it was tested in.
5. **Genuinely rotated** — only now is it a real finding.

Then find what the page *actually* uses. **Never loosen a selector until it matches
something** — `[class*="a"]` matches everything and verifies nothing. Find the stable
anchor (`aria-label`, role, text) and record that.

## Recording results

Update the entry in `reference/selectors.md`:

- **PASS** → `V`, with today's date
- **FAIL, replacement found** → replace the selector, mark `V`, date it, and note in
  one line what the old one was and that it rotated
- **FAIL, no replacement yet** → **demote to `U`** and say so in the skills that
  depend on it. Leaving a known-broken selector marked `V` is worse than having no
  entry, because it stops the next reader from looking.
- **N/A** → leave alone; it wasn't tested

Append the run to the log at the bottom of `reference/selectors.md`: date, session
locale, pass/fail counts, and what changed.

## Output format

```
Selector probe — <date>
Route: claude-in-chrome    Session: <EN/USD | HE/ILS>   ship-to: <country>
Fixture: USB-C cable → <search url>
         product → <item url>

Search page:                         Product page:
  filter-chip:freeshipping   PASS      review:il-chip        PASS
  filter-chip:choice_atm     FAIL ⚠    review:item-box       PASS
  card:link                  PASS      ship:text-anchor      PASS
  card:price-by-class        FAIL ⚠    spec:list             FAIL ⚠

Triage:
  filter-chip:choice_atm — not hydration (re-ran at 8s), not scroll. The whole
    [aria-label^="filterCode:"] row is absent in this layout. ROTATED.
    Replacement: <found selector, or "none found — demoted to U">
  card:price-by-class — price is not inside the <a>. Exposed as aria-label on a
    sibling div. Replacement: [aria-label^="US $"], associate by nearest card container.

reference/selectors.md updated: 2 demoted, 1 replaced, 4 re-dated.
Skills affected: search-aliexpress, free-shipping-only, find-under-75
```

## Out of scope

- Fixing the skills. This reports and updates the reference; changing skill logic is
  a separate, deliberate edit.
- Probing the cart. The cart has no selectors — it is read out of page state. See
  `skills/export-cart/reference.md`.
- Any purchase, cart mutation or account change. Read-only, always.

## Validation checklist

1. Session locale and currency recorded **before** any selector conclusion.
2. Page given time to hydrate; any FAIL re-run at least once before being recorded.
3. Every FAIL triaged against the five causes above, with the conclusion stated.
4. No selector was loosened merely to make it match.
5. `reference/selectors.md` updated with statuses, dates and replacements.
6. Skills depending on a demoted selector are named in the output.
