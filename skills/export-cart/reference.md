# Cart API reference

Condensed from the reverse-engineering work in the private `Aliexpress-Cart-Analysis`
repo. Verified **2 August 2026** (Chrome 151, `www.aliexpress.com`, IL ship-to,
USD, `en_US`). Read this only if `scripts/extract-cart.js` stops returning items.

## Gateway

```
https://acs.aliexpress.com/h5/<api>/<version>/?<query string>
```

Everything — including the request body — goes in the query string. There is no
POST body.

| API | Ver | Status |
| --- | --- | --- |
| `mtop.aliexpress.trade.cart.render` | 1.0 | Confirmed working — full cart |
| `mtop.aliexpress.trade.cart.count` | 1.0 | Confirmed working — `{"cartNum": N}` |
| `mtop.aliexpress.trade.cart.async` | — | Name only. Mutations. **Not called.** |
| `mtop.aliexpress.trade.cart.add` | — | Name only. **Not called.** |

## Signing

```
sign = md5( token + "&" + t + "&" + appKey + "&" + data )
```

- `token` — the `_m_h5_tk` cookie **up to the first underscore** (32 chars). The
  remainder of that cookie is a 13-digit ms expiry.
- `t` — ms epoch, the same string sent as the `t` parameter.
- `appKey` — `12574478` (constant for the PC cart).
- `data` — the raw JSON string, **before** URL-encoding. Sign the unencoded form,
  then encode for transport.

Confirmed by recomputing a captured request's signature (matched byte-for-byte)
and then issuing a hand-signed request that returned `SUCCESS`.

Set `type` and `dataType` to `originaljson` and omit `callback` to get plain JSON
instead of the JSONP the page itself uses.

## `data` payload for `cart.render`

```json
{
  "_currency": "USD",
  "shipToCountry": "IL",
  "_state": "910000060000000000",
  "_city": "910000060006000000",
  "locale": "en_US",
  "_saasRegion": "aeg",
  "bizParams": "{\"platformType\":\"DESKTOP\",\"pcChoiceNewCart\":1,\"businessKey\":\"\"}"
}
```

`bizParams` is a **JSON string nested inside the JSON**, not an object. `_state`
and `_city` are Alibaba region codes from the `aep_usuc_f` cookie; they affect
shipping estimates and can be omitted.

## Response layout (Ultron 2.0)

`data.data` is a flat map of `nodeKey → component`, not a list of items. Product
nodes currently look like
`app_cart_product_component_group_ahe_product_<cartId>` — but that prefix has
changed at least three times.

**Match structurally instead:**

```js
Object.entries(payload.data).filter(([, v]) => v && v.fields && v.fields.itemView)
```

`fields.itemView` has been present on product nodes across every rename.

Key field positions (the non-obvious ones):

- Quantity is **`fields.quantityView.current`**, not on `itemView`.
- `fields.priceViews` is an **array**; find by `priceType` — `showPrice` (payable
  now) and `crossedPrice` (was). `crossedPrice` is absent when there's no
  discount.
- `itemView.skuId` is a **string**; `cartId` and `itemId` are **numbers**.
- `itemView.sku.skuInfo` is `""` (not null) for products with no variants.
- Totals live in `app_cart_summary_component_summary`, but as display strings
  (`"US $12.22"`) and **for selected items only**. Compute from the item rows
  instead.

## Failure triage

| Symptom | Cause |
| --- | --- |
| `ret[0]` starts `FAIL_SYS_TOKEN` | `_m_h5_tk` missing/stale. A fresh one comes back in `Set-Cookie`; re-sign and retry once. *(Inferred — not observed in testing.)* |
| `ret[0]` starts `FAIL_SYS_TRAFFIC_LIMIT` | Throttled. Back off. |
| Empty item list, page shows items | Node prefix changed, or you filtered on a component name. Filter on `fields.itemView`. |
| No cart request in the network panel | Expected — it's JSONP. Not a fault. |

`ret` is an **array of strings**. Test `ret[0].startswith("SUCCESS")`.
