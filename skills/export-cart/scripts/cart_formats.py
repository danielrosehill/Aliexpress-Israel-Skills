#!/usr/bin/env python3
"""Render an AliExpress cart export to JSON / CSV / Markdown files.

Takes the bundle produced by either route of the `export-cart` skill and writes
it to disk in one or all formats:

    # Route A (Chrome): paste aeCart.json() into a file, or pipe it
    python3 cart_formats.py --in cart.json --format all
    pbpaste | python3 cart_formats.py --in - --format md --stdout

    # Route B (signed API) calls in here directly via ali_cart.py --format all

Input shape (both routes produce it):

    {"exportedAt": "...", "source": "...", "summary": {...}, "items": [...]}

`summary` may be absent — it is recomputed from `items` either way, because the
site's own summary panel covers *selected* items only.

Destination follows the user-data root rule: explicit --out-dir → $CLAUDE_USER_DATA
→ first existing root on disk → default. Nothing is ever written under ~/.claude.
"""

from __future__ import annotations

import argparse
import csv as csvmod
import io
import json
import os
import sys
import time
from pathlib import Path

SUBDIR = "aliexpress-cart"

# Ordered: explicit override, env, then adopt whichever root already exists
# rather than creating a second one. See references in the skill file.
CANDIDATE_ROOTS = (
    Path.home() / ".claude-user-data",
    Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share")
    / "claude-plugins",
)


class ExportError(RuntimeError):
    pass


# -- destination ---------------------------------------------------------


def resolve_out_dir(explicit: str | None = None) -> tuple[Path, str]:
    """Return (directory, which rule fired). Creates nothing."""
    if explicit:
        target, rule = Path(explicit).expanduser(), "explicit --out-dir"
    elif os.environ.get("CLAUDE_USER_DATA"):
        target = Path(os.environ["CLAUDE_USER_DATA"]).expanduser() / SUBDIR
        rule = "$CLAUDE_USER_DATA"
    else:
        existing = next((r for r in CANDIDATE_ROOTS if r.is_dir()), None)
        if existing:
            target, rule = existing / SUBDIR, f"adopted existing root {existing}"
        else:
            target, rule = CANDIDATE_ROOTS[0] / SUBDIR, "default (no root existed)"

    resolved = target.expanduser().resolve()
    claude_state = (Path.home() / ".claude").resolve()
    if resolved == claude_state or claude_state in resolved.parents:
        raise ExportError(
            f"refusing to write user content under {claude_state} — that is Claude "
            "Code's own state. Pass --out-dir, or set $CLAUDE_USER_DATA."
        )
    return resolved, rule


# -- normalise -----------------------------------------------------------


def summarise(rows: list[dict]) -> dict:
    """Recompute totals over *all* rows, and again over the selected subset.

    The site's Summary panel totals selected items only, which is the usual
    reason a hand-checked figure disagrees with an export.
    """

    def _tot(subset: list[dict]) -> dict:
        priced = [r for r in subset if r.get("lineTotal") is not None]
        gross = sum(
            (r.get("crossedPrice") or r.get("unitPrice") or 0) * r.get("quantity", 1)
            for r in priced
        )
        net = sum(r["lineTotal"] for r in priced)
        return {
            "items": len(subset),
            "units": sum(r.get("quantity", 1) for r in subset),
            "gross": round(gross, 2),
            "net": round(net, 2),
            "saved": round(gross - net, 2),
        }

    currencies = sorted({r.get("currency") for r in rows if r.get("currency")})
    selected = [r for r in rows if r.get("selected")]
    return {
        "currency": currencies[0] if len(currencies) == 1 else None,
        "currenciesSeen": currencies,
        "all": _tot(rows),
        "selected": _tot(selected),
        "unselected": len(rows) - len(selected),
    }


def normalise(bundle: dict) -> dict:
    """Accept either route's output; always return a full bundle."""
    if isinstance(bundle, list):
        bundle = {"items": bundle}
    rows = bundle.get("items")
    if rows is None:
        raise ExportError("input has no 'items' key — is this a cart export?")
    if not isinstance(rows, list):
        raise ExportError("'items' is not a list")
    return {
        "exportedAt": bundle.get("exportedAt")
        or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": bundle.get("source", "unknown"),
        "summary": summarise(rows),
        "items": rows,
    }


# -- renderers -----------------------------------------------------------


def render_json(bundle: dict) -> str:
    return json.dumps(bundle, indent=2, ensure_ascii=False) + "\n"


def render_csv(bundle: dict) -> str:
    rows = bundle["items"]
    if not rows:
        return ""
    # Union of keys, first row's order first, so a row missing a field doesn't
    # silently drop the column for every other row.
    cols = list(rows[0])
    for r in rows:
        cols += [k for k in r if k not in cols]
    buf = io.StringIO()
    w = csvmod.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def _money(v, cur: str | None) -> str:
    if v is None:
        return "—"
    glyph = {"ILS": "₪", "USD": "$"}.get(cur or "", "")
    return f"{glyph}{v:,.2f}" if glyph else f"{v:,.2f} {cur or ''}".strip()


def render_markdown(bundle: dict) -> str:
    rows, s = bundle["items"], bundle["summary"]
    cur = s["currency"]
    out: list[str] = []
    a(out, f"# AliExpress cart — {bundle['exportedAt'][:10]}")
    a(out, "")
    a(out, f"Exported `{bundle['exportedAt']}` from `{bundle['source']}`.")
    a(out, "")

    if len(s["currenciesSeen"]) > 1:
        a(out, f"> ⚠️ Mixed currencies in one cart: {', '.join(s['currenciesSeen'])}. ")
        a(out, "> Totals below are **not** meaningful — check the account currency.")
        a(out, "")

    sel, alls = s["selected"], s["all"]
    a(out, "## Totals")
    a(out, "")
    a(out, "| | Items | Units | Net | Gross | Saved |")
    a(out, "|---|---:|---:|---:|---:|---:|")
    for label, t in (("Ticked for checkout", sel), ("Whole cart", alls)):
        a(
            out,
            f"| {label} | {t['items']} | {t['units']} | {_money(t['net'], cur)} "
            f"| {_money(t['gross'], cur)} | {_money(t['saved'], cur)} |",
        )
    a(out, "")
    if s["unselected"]:
        a(
            out,
            f"**{s['unselected']} line(s) are unticked** — still in the cart, but "
            "excluded from AliExpress's own subtotal. The *ticked* row is the one "
            "that matches the site.",
        )
        a(out, "")
    a(
        out,
        "Assess the $75 Israeli de-minimis on **goods value** (net, ex-shipping) — "
        "run `cart-vat-nudge` on this file for the band, the cliff penalty and the "
        "FX rate. Prices are per unit and promo prices expire.",
    )
    a(out, "")

    a(out, "## Lines")
    a(out, "")
    if not rows:
        a(out, "_Cart is empty._")
    else:
        a(out, "| ✓ | Qty | Unit | Line | Item | Variant | Store |")
        a(out, "|:-:|---:|---:|---:|---|---|---|")
        for r in rows:
            tick = "x" if r.get("selected") else " "
            esc = lambda v: str(v).replace("|", "\\|")
            title = esc(r.get("title") or "")
            link = (
                f"[{title[:70]}]({r['productUrl']})" if r.get("productUrl") else title[:70]
            )
            a(
                out,
                f"| {tick} | {r.get('quantity', 1)} "
                f"| {_money(r.get('unitPrice'), r.get('currency') or cur)} "
                f"| {_money(r.get('lineTotal'), r.get('currency') or cur)} "
                f"| {link} | {esc(r.get('skuInfo') or '—')} "
                f"| {r.get('storeName') or '—'} |",
            )
        a(out, "")

        a(out, "## Line detail")
        a(out, "")
        for r in rows:
            a(out, f"### {(r.get('title') or 'untitled')[:90]}")
            a(out, "")
            ship = (
                f"free, ~{r.get('deliveryDays')} days"
                if r.get("freeShipping")
                else f"paid lane, ~{r.get('deliveryDays')} days"
            )
            for label, value in (
                ("item / sku", f"`{r.get('itemId')}` / `{r.get('skuId')}`"),
                ("variant", r.get("skuInfo") or "—"),
                ("quantity", f"{r.get('quantity', 1)} (max {r.get('maxQuantity') or '?'})"),
                ("unit / line", f"{_money(r.get('unitPrice'), r.get('currency') or cur)}"
                                f" / {_money(r.get('lineTotal'), r.get('currency') or cur)}"),
                ("was", _money(r.get("crossedPrice"), r.get("currency") or cur)),
                ("ticked", "yes" if r.get("selected") else "**no**"),
                ("store", r.get("storeName") or "—"),
                ("shipping", ship),
                ("added", r.get("addedAt") or "—"),
                ("status", r.get("status") or ("valid" if r.get("valid") else "invalid")),
                ("url", r.get("productUrl") or "—"),
            ):
                a(out, f"- **{label}:** {value}")
            a(out, "")

    return "\n".join(out).rstrip("\n") + "\n"


def a(buf: list[str], line: str) -> None:
    buf.append(line)


RENDERERS = {
    "json": (render_json, "json"),
    "csv": (render_csv, "csv"),
    "md": (render_markdown, "md"),
}
ALL = ("json", "csv", "md")


# -- write ---------------------------------------------------------------


def write_bundle(
    bundle: dict,
    formats: tuple[str, ...],
    out_dir: Path,
    stem: str | None = None,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = stem or f"cart-{bundle['exportedAt'][:10]}"
    written = []
    for fmt in formats:
        render, ext = RENDERERS[fmt]
        path = out_dir / f"{stem}.{ext}"
        path.write_text(render(bundle), encoding="utf-8")
        written.append(path)
    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "-i", "--in", dest="src", default="-", help="bundle JSON file, or - for stdin"
    )
    ap.add_argument(
        "-f",
        "--format",
        default="all",
        help="all (default) | json | csv | md, or a comma-separated subset",
    )
    ap.add_argument("--out-dir", help="destination directory (overrides the root rule)")
    ap.add_argument("--stem", help="filename stem (default cart-YYYY-MM-DD)")
    ap.add_argument(
        "--stdout",
        action="store_true",
        help="print to stdout instead of writing files (single format only)",
    )
    args = ap.parse_args()

    raw = sys.stdin.read() if args.src == "-" else Path(args.src).read_text("utf-8")
    if not raw.strip():
        print("error: empty input", file=sys.stderr)
        return 1

    try:
        bundle = normalise(json.loads(raw))
        formats = (
            ALL
            if args.format == "all"
            else tuple(f.strip() for f in args.format.split(","))
        )
        for f in formats:
            if f not in RENDERERS:
                raise ExportError(f"unknown format {f!r}; choose from all,json,csv,md")

        if args.stdout:
            if len(formats) != 1:
                raise ExportError("--stdout needs exactly one format")
            print(RENDERERS[formats[0]][0](bundle), end="")
            return 0

        out_dir, rule = resolve_out_dir(args.out_dir)
        written = write_bundle(bundle, formats, out_dir, args.stem)
    except (ExportError, json.JSONDecodeError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    s = bundle["summary"]
    print(f"destination: {out_dir}   ({rule})", file=sys.stderr)
    for p in written:
        print(f"wrote {p}", file=sys.stderr)
    print(
        f"{s['all']['items']} lines / {s['all']['units']} units — "
        f"ticked net {_money(s['selected']['net'], s['currency'])}"
        + (
            f", {s['unselected']} unticked line(s) excluded from that figure"
            if s["unselected"]
            else ""
        ),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
