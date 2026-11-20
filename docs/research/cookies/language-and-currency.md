# AliExpress: Language & Currency Cookie Mapping

Captured by diffing two cookie exports from `aliexpress.com` for the same logged-in IL account:
- **Before**: default state (USD, English)
- **After**: manually switched to ILS + Hebrew via the site's currency/language picker

Only two cookies change. Everything else (auth, tracking, session) is identical.

## The two cookies that change

### 1. `aep_usuc_f` (domain `.aliexpress.com`)

URL-encoded query string. Carries site/region/province/city/currency/locale.

| Subkey       | USD + EN              | ILS + Hebrew          | Meaning                          |
|--------------|-----------------------|-----------------------|----------------------------------|
| `c_tp`       | `USD`                 | `ILS`                 | **Currency** (ISO 4217)          |
| `b_locale`   | `en_US`               | `iw_IL`               | **Display locale / language**    |
| `site`       | `isr`                 | `isr`                 | Site channel (Israel) — unchanged |
| `region`     | `IL`                  | `IL`                  | Ship-to region — unchanged       |
| `province`   | `910000060000000000`  | `910000060000000000`  | unchanged                        |
| `city`       | `910000060006000000`  | `910000060006000000`  | unchanged                        |
| `isfm`/`isfb`/`isb` | `y`            | `y`                   | unchanged                        |

Note: `iw` is the legacy ISO 639-1 code for Hebrew (Java/ICU style); AliExpress uses it instead of the modern `he`.

### 2. `xman_us_f` (domain `.aliexpress.com`)

URL-encoded query string. Mirrors the locale into a separate user-flags cookie.

| Subkey         | USD + EN  | ILS + Hebrew | Meaning                |
|----------------|-----------|--------------|------------------------|
| `x_locale`     | `en_US`   | `iw_IL`      | UI locale              |
| `intl_locale`  | `en_US`   | `iw_IL`      | International locale   |

All other subkeys (`x_user`, `x_lid`, `aeuCID`, affiliate fields, `acs_rt`, etc.) are unchanged.

## What does NOT carry the preference

These are unchanged across the switch and are *not* where lang/currency live:
- `xman_t`, `xman_us_t`, `xman_f` — opaque/encrypted user tokens
- `aep_history`, `traffic_se_co`, `cna`, `_ga*`, `_fbp`, `_uet*` — analytics/history
- `acs_usuc_t`, `JSESSIONID`, `XSRF-TOKEN`, `c_csrf` — session/CSRF
- `tfstk`, `isg`, `_baxia_sec_cookie_` — anti-bot/risk

## Minimum cookies to force ILS + Hebrew

To pin currency and language for a scraper/automation against an already-authenticated session, set:

```
aep_usuc_f: ...&c_tp=ILS&...&b_locale=iw_IL&...
xman_us_f:  ...&x_locale=iw_IL&...&intl_locale=iw_IL&...
```

Both live on `.aliexpress.com`, `Secure`, `SameSite=None`. `xman_us_f` is not HttpOnly; `aep_usuc_f` is not HttpOnly either — both are writable from JS, and AliExpress's own currency/language picker mutates them client-side before reloading.

## Locale code reference (observed/likely)

| Display     | `b_locale` / `x_locale` | `c_tp` |
|-------------|-------------------------|--------|
| English (US)| `en_US`                 | `USD`  |
| Hebrew (IL) | `iw_IL`                 | `ILS`  |
| Russian     | `ru_RU` (typical)       | —      |
| Arabic      | `ar_MA` (typical)       | —      |

Currency and language are independent — you can have `b_locale=en_US` with `c_tp=ILS` if the user only switches currency.
