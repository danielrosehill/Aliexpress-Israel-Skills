---
name: set-locale
description: Set the AliExpress language / currency / ship-to preference that every other skill reads in — default EN/USD shipping to Israel, with EN/ILS, HE/USD and HE/ILS supported — verify what actually rendered, and optionally install a locale-guard userscript that undoes the site's periodic drift back to Hebrew/ILS.
---

# Set locale (standing preference)

Sets the locale the user wants to **stay** on. For a one-off switch inside a task
(and back again) use `update-locale`.

## Presets

| Preset | Language | Currency | `b_locale` / `x_locale` | `c_tp` | Notes |
|---|---|---|---|---|---|
| **EN/USD** | English | USD | `en_US` | `USD` | **Default.** The $75 de-minimis is in USD, so no FX step to check it. |
| EN/ILS | English | ILS | `en_US` | `ILS` | |
| HE/USD | Hebrew | USD | `iw_IL` | `USD` | |
| HE/ILS | Hebrew | ILS | `iw_IL` | `ILS` | The IL channel's own default; what the site drifts back to. |

Ship-to is `region=IL` in all four. Other countries are out of scope for this plugin.

If the user has stated a preference, use it. Otherwise use EN/USD.

## Inputs

- `preset` (optional): one of the four above. Default `EN/USD`.
- `install_guard` (optional, default: offer it): install the locale guard (below).

## Two ways the locale gets set (both verified 2026-10-26)

**A. The on-page picker: what a person does. Use this for `set-locale`.**

1. Click the header switcher: `[aria-label*="country, region or language"]` (class
   prefix `ship-to--menuItem`; text reads e.g. `EN/USD`). Use `element.click()`.
2. The popover `[class*="es--wrap--"]` holds three comboboxes, in order: **Ship to**
   (251 options), **Language** (`English`, `עברית`, …), **Currency** (`USD ( US Dollar )`,
   `ILS ( Israeli Shekel )`, …). Each is `[role=combobox]` with a sibling
   `[role=listbox]` of `[role=option]` (`.select--item--…`); `aria-selected="true"`
   marks the current one.
3. Open a combobox, click the option whose `textContent` matches, repeat, then click
   `[class*="es--saveBtn--"]` (`Save`). **The page reloads.** Re-read after the reload,
   not before.

Whether Save writes an account-level preference on AliExpress's side or only the
cookies below is **not established**. Clicking Save with unchanged values reloaded the
page and changed nothing (2026-10-26). Selecting a different option through the
comboboxes has not been walked end to end yet. If it fails, fall back to B.

**B. Cookie write: fast and scriptable. `update-locale` and the guard use this.**

The locale lives in two `.aliexpress.com` cookies that page JS **can** read and write.
`reference/browser.md` previously said HttpOnly. That is wrong, and was corrected
2026-10-26.

```
aep_usuc_f = …&site=isr&c_tp=<USD|ILS>&…&region=IL&b_locale=<en_US|iw_IL>&…
xman_us_f  = …&x_locale=<en_US|iw_IL>&…&intl_locale=<en_US|iw_IL>
```

Replace only those keys (keep `x_alimid`, `site` and the rest), write each back with
`domain=.aliexpress.com; path=/; max-age=31536000; SameSite=None; Secure`, then
`location.reload()`. Measured 2026-10-26, signed in: EN/USD → HE/ILS rendered
`lang="iw"`, `₪` and switcher `IW/ILS`. Back to EN/USD rendered `lang="en"`, `US $`
and `EN/USD`.

## Verify (always)

Read what rendered, not what you set:

```js
({
  switcher: document.querySelector('[class*="ship-to--menuItem"]')?.textContent.trim(), // "EN/USD"
  lang: document.documentElement.lang,                                                   // "en" | "iw"
  glyph: document.body.innerText.match(/₪|US ?\$/)?.[0],                                 // "US $" | "₪"
  cookie: document.cookie.match(/aep_usuc_f=[^;]+/)?.[0],
})
```

All three must agree with the preset. If they don't after one retry, stop and report.
Do not read prices in a locale the user didn't ask for.

## The drift, and the guard

AliExpress periodically puts an Israeli account back to Hebrew/ILS. The `he.` host and
the `?gatewayAdapt=glo2isr` redirect are the likely trigger (the cause is not
established). The user then has to reset it by hand.

**`$CLAUDE_PLUGIN_ROOT/scripts/locale-guard.user.js`** is a Tampermonkey/Violentmonkey
userscript. It runs at `document-start` on `*.aliexpress.com`, compares the cookies to
`WANT` (set it to the preset), rewrites them when they drift, and reloads, at most
once per 30 s per tab, so it can't loop.

To install: open the userscript manager's dashboard → new script → paste the file →
edit `WANT` → save. Installing an extension script is the user's call. Offer it and
explain it in one line. Agents driving a separate automation profile can instead
run the `update-locale` check at the start of each task.

If the console logs `[locale-guard] drift persists after a reload`, the site is
overriding the cookies server-side. Record it in `docs/admin/development-notes.md`.
Once that happens, the picker (route A) is the only fix.

## Output

```
Locale set: EN/USD, ship to IL    method: picker | cookie
Verified: switcher=EN/USD lang=en glyph=US $
Guard: installed | offered | declined
```
