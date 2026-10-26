---
name: update-locale
description: Check the live AliExpress locale against the user's preference at the start of a task, correct drift, or switch temporarily to another language/currency (EN/USD, EN/ILS, HE/USD, HE/ILS) for one task and restore the preference afterwards. Cookie write, verified by what renders.
---

# Update locale (check, correct, or switch for one task)

`set-locale` defines the standing preference (default **EN/USD**, ship to IL).
`update-locale` keeps a working session on it, or leaves it on purpose for one task:

- **check:** run at the start of any shopping task. If the rendered locale isn't the
  preference, correct it and say so in one line.
- **switch:** move to another preset for a reason (e.g. read the HE/ILS price an
  Israeli buyer sees, or Hebrew review text), then **restore** before finishing.

## Inputs

- `mode`: `check` (default) | `switch`
- `preset`: target for `switch` (`EN/USD`, `EN/ILS`, `HE/USD`, `HE/ILS`)
- `preference`: the standing preset. The user's stated one, else `EN/USD`.

## Procedure

Mechanism, cookie keys and the verify snippet are in `../set-locale/SKILL.md`
(route B). In short, in the AliExpress tab:

```js
() => {
  const WANT = { locale: 'en_US', currency: 'USD' };             // from the preset
  const get = n => document.cookie.split('; ').find(c => c.startsWith(n + '='))?.slice(n.length + 1);
  const set = (n, v) => document.cookie = `${n}=${v}; domain=.aliexpress.com; path=/; max-age=31536000; SameSite=None; Secure`;
  set('aep_usuc_f', get('aep_usuc_f').replace(/c_tp=[A-Z]+/, `c_tp=${WANT.currency}`)
                                     .replace(/b_locale=[A-Za-z_]+/, `b_locale=${WANT.locale}`));
  set('xman_us_f', get('xman_us_f').replace(/x_locale=[A-Za-z_]+/, `x_locale=${WANT.locale}`)
                                   .replace(/intl_locale=[A-Za-z_]+/, `intl_locale=${WANT.locale}`));
  location.reload();
}
```

Wait for the reload (the evaluate call may report "execution context destroyed",
which is expected). Then run the verify snippet. Switcher text, `lang` and the
currency glyph must all match.

For `switch`: note the preference first, do the task, then switch back and verify
again. A session left on the wrong locale is the drift `set-locale`'s guard exists to
fix. Don't cause it.

## Output

One line in the calling skill's header:

```
Locale: EN/USD (preference) verified   |   Locale: HE/ILS (switched for this task; restored EN/USD at end)
```

## Notes

- Prices on the same listing differ by locale beyond FX: new-buyer and channel
  promotions follow the site/locale. Compare like with like.
- Delivery promises did not change with the locale on 2026-10-26 (`Nov 02 - 07` in
  both EN and HE on item 1005006458599504). Ship-to (`region`) is what drives them.
