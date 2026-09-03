#!/usr/bin/env python3
"""Standalone AliExpress cart client over the MTOP H5 gateway.

Read-only. Signs requests locally; you supply the cookies.

    export AE_COOKIE="$(cat cookies.txt)"     # raw Cookie: header value
    ./aliexpress_cart.py --format table
    ./aliexpress_cart.py --format json -o cart.json
    ./aliexpress_cart.py --format all            # json + csv + md file bundle
    ./aliexpress_cart.py --count

To get the cookie string: on an open, logged-in aliexpress.com tab, run
`document.cookie` in the DevTools console and copy the result. It needs to
include `_m_h5_tk`.

Protocol notes and failure triage in ../reference.md. Verified 2026-08-02.
Canonical source: the Aliexpress-Cart-Analysis repo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from http.cookies import SimpleCookie
from urllib.parse import urlencode

import requests

GATEWAY = "https://acs.aliexpress.com/h5/{api}/{version}/"
APP_KEY = "12574478"  # PC/web app key used by the cart

DEFAULT_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
)


class MtopError(RuntimeError):
    pass


class AliExpressCart:
    def __init__(
        self,
        cookie: str,
        *,
        currency: str = "USD",
        ship_to: str = "IL",
        locale: str = "en_US",
        state: str = "",
        city: str = "",
        user_agent: str = DEFAULT_UA,
    ) -> None:
        self.currency = currency
        self.ship_to = ship_to
        self.locale = locale
        self.state = state
        self.city = city

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Referer": "https://www.aliexpress.com/p/shoppingcart/index.html",
                "Accept": "application/json, text/plain, */*",
            }
        )
        jar = SimpleCookie()
        jar.load(cookie)
        for name, morsel in jar.items():
            self.session.cookies.set(name, morsel.value, domain=".aliexpress.com")

    # -- signing ---------------------------------------------------------

    @property
    def _token(self) -> str:
        """The part of _m_h5_tk before the first underscore."""
        raw = self.session.cookies.get("_m_h5_tk", domain=".aliexpress.com") or ""
        if not raw:
            raise MtopError(
                "_m_h5_tk cookie missing — the cookie string is incomplete or "
                "the session is logged out."
            )
        return raw.split("_")[0]

    @staticmethod
    def _sign(token: str, t: str, data: str) -> str:
        # md5(token & t & appKey & data) — data must be the *unencoded* JSON.
        return hashlib.md5(f"{token}&{t}&{APP_KEY}&{data}".encode()).hexdigest()

    def call(self, api: str, payload: dict, version: str = "1.0") -> dict:
        """Issue a signed MTOP call, retrying once on token expiry."""
        # The payload must be serialised exactly once and signed in that exact
        # form; requests will percent-encode it for transport.
        data = json.dumps(payload, separators=(",", ":"))

        for attempt in (1, 2):
            t = str(int(time.time() * 1000))
            params = {
                "jsv": "2.5.1",
                "appKey": APP_KEY,
                "t": t,
                "sign": self._sign(self._token, t, data),
                "api": api,
                "v": version,
                "timeout": "15000",
                "type": "originaljson",
                "dataType": "originaljson",
                "data": data,
            }
            url = GATEWAY.format(api=api, version=version) + "?" + urlencode(params)
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
            body = resp.json()

            ret = (body.get("ret") or [""])[0]
            if ret.startswith("SUCCESS"):
                return body.get("data", {})

            # Alibaba misspells EXPIRED as EXOIRED in its own API; match loosely.
            # The rejected response carries a fresh _m_h5_tk in Set-Cookie,
            # which the session has already absorbed — so just retry.
            # NOTE: this path is inferred, not observed. See docs/findings.md.
            if "TOKEN" in ret and attempt == 1:
                continue

            raise MtopError(f"{api} failed: {ret}")

        raise MtopError(f"{api} failed after token refresh")

    # -- endpoints -------------------------------------------------------

    def count(self) -> int:
        data = self.call(
            "mtop.aliexpress.trade.cart.count",
            {
                "_currency": self.currency,
                "shipToCountry": self.ship_to,
                "locale": self.locale,
            },
        )
        return int(data.get("cartNum", 0))

    def render(self) -> dict:
        payload = {
            "_currency": self.currency,
            "shipToCountry": self.ship_to,
            "locale": self.locale,
            "_saasRegion": "aeg",
            # bizParams is a JSON *string* nested inside the JSON payload.
            "bizParams": json.dumps(
                {
                    "platformType": "DESKTOP",
                    "pcChoiceNewCart": 1,
                    "businessKey": "",
                },
                separators=(",", ":"),
            ),
        }
        if self.state:
            payload["_state"] = self.state
        if self.city:
            payload["_city"] = self.city
        return self.call("mtop.aliexpress.trade.cart.render", payload)

    def items(self, *, include_invalid: bool = False) -> list[dict]:
        return parse_items(self.render(), include_invalid=include_invalid)


# -- parsing -------------------------------------------------------------


def _price(fields: dict, kind: str) -> dict:
    for pv in fields.get("priceViews") or []:
        if pv.get("priceType") == kind:
            return pv
    return {}


def parse_items(payload: dict, *, include_invalid: bool = False) -> list[dict]:
    """Flatten the Ultron component tree into item records.

    Product nodes are found structurally, by the presence of fields.itemView.
    The component *name* has changed repeatedly across versions and must not be
    matched on. See docs/ultron-protocol.md.
    """
    rows = []
    for node_key, node in (payload.get("data") or {}).items():
        fields = (node or {}).get("fields") or {}
        item = fields.get("itemView")
        if not item:
            continue

        qty_view = fields.get("quantityView") or {}
        shop = fields.get("shopView") or {}
        logi = fields.get("logisticsView") or {}
        sku = item.get("sku") or {}
        show, crossed = _price(fields, "showPrice"), _price(fields, "crossedPrice")

        qty = qty_view.get("current", 1)
        unit = show.get("value", show.get("amount"))
        added = item.get("createTimeStamp")

        rows.append(
            {
                "nodeKey": node_key,
                "cartId": item.get("cartId"),
                "itemId": item.get("itemId"),
                "skuId": item.get("skuId"),
                "title": item.get("title"),
                "skuInfo": sku.get("skuInfo", ""),
                "brand": sku.get("brandName", ""),
                "quantity": qty,
                "maxQuantity": qty_view.get("max"),
                "selected": bool((fields.get("checkbox") or {}).get("selected")),
                "currency": show.get("currency"),
                "unitPrice": unit,
                "crossedPrice": crossed.get("value", crossed.get("amount")),
                "lineTotal": None if unit is None else round(unit * qty, 2),
                "valid": item.get("valid"),
                "status": item.get("status"),
                "storeName": shop.get("name"),
                "sellerId": shop.get("sellerId"),
                "freeShipping": bool(logi.get("freeShipping")),
                "deliveryDays": logi.get("deliveryDays"),
                "addedAt": (
                    time.strftime("%Y-%m-%d", time.gmtime(added / 1000))
                    if added
                    else None
                ),
                "productUrl": f"https://www.aliexpress.com/item/{item.get('itemId')}.html",
            }
        )

    if not include_invalid:
        rows = [r for r in rows if r["valid"]]
    return rows


def summarise(rows: list[dict]) -> dict:
    priced = [r for r in rows if r["lineTotal"] is not None]
    gross = sum((r["crossedPrice"] or r["unitPrice"]) * r["quantity"] for r in priced)
    net = sum(r["lineTotal"] for r in priced)
    return {
        "currency": priced[0]["currency"] if priced else None,
        "items": len(rows),
        "units": sum(r["quantity"] for r in rows),
        "gross": round(gross, 2),
        "net": round(net, 2),
        "saved": round(gross - net, 2),
    }


# -- cli -----------------------------------------------------------------


def _render_table(rows: list[dict]) -> str:
    if not rows:
        return "(cart is empty)"
    lines = []
    for r in rows:
        mark = "x" if r["selected"] else " "
        title = (r["title"] or "")[:58]
        lines.append(
            f"[{mark}] {r['quantity']:>3} x {r['unitPrice']:>8.2f} "
            f"{r['currency']}  {title}"
        )
        if r["skuInfo"]:
            lines.append(f"          {r['skuInfo']}")
        lines.append(f"          {r['storeName']}  ->  {r['productUrl']}")
    s = summarise(rows)
    lines.append("")
    lines.append(
        f"{s['items']} items / {s['units']} units    "
        f"net {s['net']:.2f} {s['currency']}   (saved {s['saved']:.2f})"
    )
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cookie",
        default=os.environ.get("AE_COOKIE", ""),
        help="Cookie header value (default: $AE_COOKIE)",
    )
    ap.add_argument("--currency", default="USD")
    ap.add_argument("--ship-to", default="IL")
    ap.add_argument("--locale", default="en_US")
    ap.add_argument(
        "--format",
        choices=("table", "json", "csv", "md", "all"),
        default="table",
        help="table (stdout) | json | csv | md | all (writes a file bundle)",
    )
    ap.add_argument("--count", action="store_true", help="Print item count only")
    ap.add_argument("--include-invalid", action="store_true")
    ap.add_argument("--raw", action="store_true", help="Dump the whole payload")
    ap.add_argument("-o", "--output", help="Write to file instead of stdout")
    ap.add_argument(
        "--out-dir",
        help="Destination for --format md/all (default: the user-data root rule, "
        "see cart_formats.resolve_out_dir)",
    )
    ap.add_argument("--stem", help="Filename stem for --format md/all")
    args = ap.parse_args()

    if not args.cookie:
        ap.error("no cookie: pass --cookie or set AE_COOKIE")

    cart = AliExpressCart(
        args.cookie,
        currency=args.currency,
        ship_to=args.ship_to,
        locale=args.locale,
    )

    try:
        if args.count:
            print(cart.count())
            return 0

        payload = cart.render()
        if args.raw:
            out = json.dumps(payload, indent=2, ensure_ascii=False)
        else:
            rows = parse_items(payload, include_invalid=args.include_invalid)

            if args.format in ("md", "all"):
                # Shared with Route A (Chrome), so both routes emit byte-identical
                # files from the same renderers.
                from cart_formats import normalise, resolve_out_dir, write_bundle

                bundle = normalise(
                    {
                        "source": "mtop.aliexpress.trade.cart.render (signed)",
                        "items": rows,
                    }
                )
                fmts = ("json", "csv", "md") if args.format == "all" else ("md",)
                out_dir, rule = resolve_out_dir(args.out_dir)
                for path in write_bundle(bundle, fmts, out_dir, args.stem):
                    print(f"wrote {path}", file=sys.stderr)
                print(f"destination: {out_dir}  ({rule})", file=sys.stderr)
                return 0

            if args.format == "json":
                out = json.dumps(
                    {"summary": summarise(rows), "items": rows},
                    indent=2,
                    ensure_ascii=False,
                )
            elif args.format == "csv":
                import csv as csvmod
                import io

                buf = io.StringIO()
                if rows:
                    w = csvmod.DictWriter(buf, fieldnames=list(rows[0]))
                    w.writeheader()
                    w.writerows(rows)
                out = buf.getvalue()
            else:
                out = _render_table(rows)
    except MtopError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
