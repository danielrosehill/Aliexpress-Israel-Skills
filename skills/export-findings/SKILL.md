---
name: export-findings
description: Write the results of an AliExpress search/evaluation run into the working repo in three forms — a full JSON record, a token-lean brief (cols/rows) for the next agent to load cheaply, and a human report as Markdown and PDF. Use at the end of deep-search, true-price or any multi-listing comparison.
---

# Export findings

A shopping run produces more data than anyone should re-read. This writes it once,
in the shape each reader needs:

| File | Reader | What |
|---|---|---|
| `<stem>.json` | archive, re-rendering | Full record, schema `aliexpress-findings/1` (below). Every SKU, every drop and why. |
| `<stem>.brief.json` | **the next agent** | One compact line: `{"cols":[…],"rows":[[…]]}` plus counts and the bottom line. Load this, not the full file. |
| `<stem>.md` | the user, in the repo | Bottom line, shortlist table (true price, card price, gap, delivery days, fast badge), probed-not-passed, dropped list. |
| `<stem>.pdf` | the user, to share | Same report, typeset (Typst, IBM Plex Sans with Hebrew fallback, A4 landscape). |

## Where

- Default: `findings/` in the **current working repo** (the purchase or project repo
  the run is for). Create it if missing.
- Stem: `YYYY-MM-DD_<short-slug>` (e.g. `2026-10-26_8bitdo-sn30pro-lite2`). Never
  overwrite: add `-2`, `-3` on a same-day re-run.
- Commit the four files with the repo's other changes. `.brief.json` is what a later
  agent should be pointed at, so link it from the repo's README or status section.

## Steps

1. Assemble the full record (schema below) from the run. Write `<stem>.json`.
2. Render the rest:
   ```
   python3 "$CLAUDE_PLUGIN_ROOT/scripts/render_findings.py" findings/<stem>.json
   ```
   Stdlib only. `--no-pdf` skips Typst. It prints `{"written": [...]}`.
3. Open the `.md` once to check it reads right. Report the paths.

## Schema `aliexpress-findings/1`

```jsonc
{
  "schema": "aliexpress-findings/1",
  "title": "8BitDo SN30 Pro / Lite 2: Choice, ≤9-day, no bundles",
  "queries": ["8BitDo SN30 Pro", "8BitDo Lite 2"],
  "run_at": "2026-10-26T10:05:00+02:00",
  "route": "agent browser (Playwright over CDP)",
  "locale": {"language": "EN", "currency": "USD", "ship_to": "IL"},
  "rules": {"choice": true, "exclude_bundles": true, "max_days": 9, "target": "controller, 1 unit"},
  "rules_text": "Choice only; bundle cards dropped; true price = matching SKU; delivery ≤ 9 days",
  "bottom_line": "One sentence a human can act on.",
  "counts": {"cards_seen": 120, "bundles_dropped": 4, "off_target_dropped": 90,
             "listings_probed": 11, "passed": 3},
  "results": [{
    "id": "1005007345086449",
    "url": "https://www.aliexpress.com/item/1005007345086449.html",
    "model": "SN30 Pro",
    "title": "8Bitdo Wireless SN30 Pro Gamepad…",
    "store": null, "choice": true, "rating": "4.9", "reviews": "653", "sold": "5,000+",
    "card_price": 38.39, "true_price": 38.19, "true_sku": "SN30 Pro-GB", "price_gap_pct": -0.5,
    "delivery": {"text": "Nov 02 - 07", "days_min": 7, "days_max": 12, "fast_badge": true,
                 "source": "listing"},
    "verdict": "pass",               // pass | slow | anchored | needs-human | unavailable | off-target
    "notes": "",
    "skus": [{"name": "SN30 Pro-GB", "price": 38.19, "class": "match", "days_max": 12, "fast": true}]
  }],
  "dropped": [{"id": "1005007038269740", "reason": "bundle-deal card",
               "title": "8BitDo Lite 2…", "card_price": "US $25.39"}],
  "notes": ["Free-text caveats worth keeping."]
}
```

Prices are numbers in `locale.currency`. Keep the raw strings in `skus[].price_text` if
you need them. `results` holds every probed listing, passed or not. `dropped` holds
everything rejected before probing.

## For the next agent

Point it at the brief. Its whole job is to make reloading a run cost a few hundred
tokens:

```
findings/2026-10-26_8bitdo-sn30pro-lite2.brief.json
cols: id, model, verdict, true_price, card_price, gap_pct, true_sku, days_min, days_max,
      fast, choice, rating, sold, url
```

Open the full `.json` only when a specific SKU or drop needs checking.
