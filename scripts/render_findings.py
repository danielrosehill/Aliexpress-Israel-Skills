#!/usr/bin/env python3
"""Render an AliExpress findings file into the three forms export-findings promises.

    python3 render_findings.py <findings.json> [--out-dir DIR] [--no-pdf]

Input: the findings JSON described in skills/export-findings/SKILL.md (schema
`aliexpress-findings/1`). Output, next to the input unless --out-dir is given:

    <stem>.brief.json   token-lean table for an agent: {"cols": [...], "rows": [[...]]}
    <stem>.md           human report: verdict first, shortlist table, dropped list
    <stem>.pdf          the same report, typeset with Typst (skipped if typst is missing)

Stdlib only. Typst >= 0.11 for the PDF.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

BRIEF_COLS = [
    "id", "model", "verdict", "true_price", "card_price", "gap_pct",
    "true_sku", "days_min", "days_max", "fast", "choice", "rating", "sold", "url",
]


def brief_row(r: dict) -> list:
    d = r.get("delivery") or {}
    return [
        r.get("id"), r.get("model"), r.get("verdict"), r.get("true_price"),
        r.get("card_price"), r.get("price_gap_pct"), r.get("true_sku"),
        d.get("days_min"), d.get("days_max"), d.get("fast_badge"),
        r.get("choice"), r.get("rating"), r.get("sold"), r.get("url"),
    ]


def money(v, cur: str) -> str:
    if v is None:
        return "—"
    sym = "₪" if cur == "ILS" else "$"
    return f"{sym}{v:,.2f}"


def days(d: dict) -> str:
    lo, hi = d.get("days_min"), d.get("days_max")
    if lo is None:
        return "—"
    return f"{lo}" if lo == hi else f"{lo}–{hi}"


def render_md(f: dict) -> str:
    cur = (f.get("locale") or {}).get("currency", "USD")
    res = f.get("results", [])
    shortlist = [r for r in res if r.get("verdict") == "pass"]
    others = [r for r in res if r.get("verdict") != "pass"]
    c = f.get("counts", {})
    out = [f"# {f.get('title') or 'AliExpress findings: ' + ', '.join(f.get('queries', []))}", ""]
    loc = f.get("locale") or {}
    out += [
        f"Run {f.get('run_at', '?')} · locale {loc.get('language', '?')}/{cur}, ship to {loc.get('ship_to', '?')} · "
        f"route {f.get('route', '?')}",
        "",
        f"Queries: {', '.join(f'`{q}`' for q in f.get('queries', []))}  ",
        f"Rules: {f.get('rules_text', '')}",
        "",
    ]
    if f.get("bottom_line"):
        out += ["## Bottom line", "", f["bottom_line"], ""]
    out += [
        "## Counts", "",
        f"Cards seen {c.get('cards_seen', '?')} · bundles dropped {c.get('bundles_dropped', 0)} · "
        f"off-target dropped {c.get('off_target_dropped', 0)} · listings probed {c.get('listings_probed', '?')} · "
        f"passed {len(shortlist)}",
        "",
    ]

    def table(rows):
        t = ["| Model | True price | Card price | Gap | SKU | Days | Fast | ★ | Sold | Listing |",
             "|---|---|---|---|---|---|---|---|---|---|"]
        for r in rows:
            d = r.get("delivery") or {}
            gap = r.get("price_gap_pct")
            t.append(
                f"| {r.get('model', '')} | **{money(r.get('true_price'), cur)}** | {money(r.get('card_price'), cur)} | "
                f"{'' if gap in (None, 0) else f'{gap:+.1f}%'} | {r.get('true_sku') or ''} | {days(d)} | "
                f"{'yes' if d.get('fast_badge') else ''} | {r.get('rating') or ''} | {r.get('sold') or ''} | "
                f"[{r.get('id')}]({r.get('url')}) |"
            )
        return t

    out += ["## Shortlist", ""]
    out += table(shortlist) if shortlist else ["Nothing passed every rule."]
    out += [""]
    if others:
        out += ["## Probed, not passed", ""] + table(others) + [""]
        out += [f"- `{r.get('id')}`: {r.get('verdict')}: {r.get('notes', '')}" for r in others if r.get("notes")]
        out += [""]
    if f.get("dropped"):
        out += ["## Dropped before probing", ""]
        out += [f"- `{d.get('id')}` {d.get('reason')}: {d.get('title', '')[:90]} ({d.get('card_price', '')})"
                for d in f["dropped"]]
        out += [""]
    if f.get("notes"):
        out += ["## Notes", ""] + [f"- {n}" for n in f["notes"]] + [""]
    out += ["---", "", "*Prices and delivery dates are what the listing showed at probe time for the stated "
            "locale; checkout is authoritative (`open-checkout`).*", ""]
    return "\n".join(out)


def typst_escape(s: str) -> str:
    return "".join("\\" + ch if ch in '\\#$*_`<>@[]"' else ch for ch in str(s))


def render_typst(f: dict) -> str:
    cur = (f.get("locale") or {}).get("currency", "USD")
    res = f.get("results", [])
    shortlist = [r for r in res if r.get("verdict") == "pass"]
    others = [r for r in res if r.get("verdict") != "pass"]
    c = f.get("counts", {})
    loc = f.get("locale") or {}
    e = typst_escape
    L = [
        '#set page(paper: "a4", flipped: true, margin: 1.4cm)',
        '#set text(font: ("IBM Plex Sans", "IBM Plex Sans Hebrew", "Noto Sans Hebrew"), size: 9pt)',
        '#show heading: set text(weight: "semibold")',
        f'= {e(f.get("title") or "AliExpress findings")}',
        f'#text(fill: gray)[Run {e(f.get("run_at", "?"))} · {e(loc.get("language", "?"))}/{e(cur)}, ship to '
        f'{e(loc.get("ship_to", "?"))} · route {e(f.get("route", "?"))}]',
        "",
        f'*Queries:* {e(", ".join(f.get("queries", [])))} \\',
        f'*Rules:* {e(f.get("rules_text", ""))}',
        "",
    ]
    if f.get("bottom_line"):
        L += ["== Bottom line", e(f["bottom_line"]), ""]
    L += [
        f'Cards seen {c.get("cards_seen", "?")} · bundles dropped {c.get("bundles_dropped", 0)} · off-target dropped '
        f'{c.get("off_target_dropped", 0)} · listings probed {c.get("listings_probed", "?")} · passed {len(shortlist)}',
        "",
    ]

    def table(rows):
        hdr = ["Model", "True price", "Card price", "Gap", "SKU", "Days", "Fast", "★", "Sold", "Item"]
        cells = []
        for r in rows:
            d = r.get("delivery") or {}
            gap = r.get("price_gap_pct")
            vals = [r.get("model", ""), money(r.get("true_price"), cur), money(r.get("card_price"), cur),
                    "" if gap in (None, 0) else f"{gap:+.1f}%", r.get("true_sku") or "", days(d),
                    "yes" if d.get("fast_badge") else "", r.get("rating") or "", r.get("sold") or ""]
            cells += [f"[{e(v)}]" for v in vals]
            cells.append(f'[#link("{r.get("url")}")[{e(r.get("id"))}]]')
        return [
            "#table(columns: 10, stroke: 0.4pt + luma(200), inset: 4pt,",
            "  table.header(" + ", ".join(f"[*{e(h)}*]" for h in hdr) + "),",
            "  " + ", ".join(cells),
            ")",
        ]

    L += ["== Shortlist"] + (table(shortlist) if shortlist else ["Nothing passed every rule."]) + [""]
    if others:
        L += ["== Probed, not passed"] + table(others) + [""]
        L += [f"- `{r.get('id')}`: {e(r.get('verdict'))}: {e(r.get('notes', ''))}" for r in others if r.get("notes")]
    if f.get("dropped"):
        L += ["== Dropped before probing"]
        L += [f"- {e(d.get('id'))} {e(d.get('reason'))}: {e(d.get('title', '')[:90])} ({e(d.get('card_price', ''))})"
              for d in f["dropped"]]
    if f.get("notes"):
        L += ["== Notes"] + [f"- {e(n)}" for n in f["notes"]]
    L += ["", "#text(size: 8pt, fill: gray)[Prices and delivery dates as shown at probe time for the stated locale. "
          "Checkout is authoritative.]"]
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("findings", type=Path)
    ap.add_argument("--out-dir", type=Path)
    ap.add_argument("--no-pdf", action="store_true")
    a = ap.parse_args()

    f = json.loads(a.findings.read_text())
    if f.get("schema") != "aliexpress-findings/1":
        print(f"warning: schema is {f.get('schema')!r}, expected 'aliexpress-findings/1'", file=sys.stderr)
    out = a.out_dir or a.findings.parent
    out.mkdir(parents=True, exist_ok=True)
    stem = a.findings.name.removesuffix(".json")

    brief = {
        "schema": "aliexpress-findings-brief/1",
        "queries": f.get("queries"), "run_at": f.get("run_at"),
        "currency": (f.get("locale") or {}).get("currency"),
        "counts": f.get("counts"), "bottom_line": f.get("bottom_line"),
        "cols": BRIEF_COLS, "rows": [brief_row(r) for r in f.get("results", [])],
    }
    written = []
    p = out / f"{stem}.brief.json"
    p.write_text(json.dumps(brief, ensure_ascii=False, separators=(",", ":")) + "\n")
    written.append(p)
    p = out / f"{stem}.md"
    p.write_text(render_md(f))
    written.append(p)

    if not a.no_pdf:
        typst = shutil.which("typst")
        if not typst:
            print("typst not found; PDF skipped", file=sys.stderr)
        else:
            src = out / f".{stem}.typ"
            src.write_text(render_typst(f))
            pdf = out / f"{stem}.pdf"
            r = subprocess.run([typst, "compile", str(src), str(pdf)], capture_output=True, text=True)
            src.unlink(missing_ok=True)
            if r.returncode:
                print(r.stderr, file=sys.stderr)
                return 1
            written.append(pdf)
    print(json.dumps({"written": [str(w) for w in written]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
