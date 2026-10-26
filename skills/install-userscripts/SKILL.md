---
name: install-userscripts
description: Install the AliExpress userscripts (Hide Combo Deals, and optionally the locale guard and Find Similar) into the user's Tampermonkey in Chrome, then prove each one is running on a live AliExpress page. Use for "install the AliExpress userscripts", "set up the bundle-deals script", "is the combo script installed".
---

# Install the AliExpress userscripts

The scripts, their install URLs and how to detect each one are in
`$CLAUDE_PLUGIN_ROOT/reference/userscripts.json`. Read it, don't hard-code. Keeping
them current afterwards is `update-userscripts`.

## Inputs

- `scripts`: ids from the registry. Default: every entry with `default: true`
  (today only `no-combo`). Offer `locale-guard` in one line (see `set-locale`).
- `browser`: `local` (default): the user's own Chrome via Claude in Chrome, which
  is where their Tampermonkey lives. `agent`: the personal agent browser
  (`browser-personal__*`), which got Tampermonkey through Chrome Sync but keeps its
  own separate script list.

## Procedure

1. **Manager present?** Open `chrome://extensions` in a new tab and look for
   Tampermonkey (stable `dhdgffkkebhmkfjojejmpbldmpobfkfo`, or BETA
   `gcalenpjmijncebpfijmoaglllgpjagf`, which the user's Chrome Default profile has as
   of 2026-10-26) or Violentmonkey. If there is none, link
   https://www.tampermonkey.net/ and stop. Installing an extension is the user's call.
2. **Already installed?** Open the registry's `test_page` and read, per script,
   `document.documentElement.getAttribute(stamp_attr)` and whether `page_marker` is
   present. Wait ~4 s first, because cards hydrate in stages. A stamp means the script
   is installed. Hand anything already installed to `update-userscripts` instead.
3. **Install** each missing script that has a `source_url`: open the URL in a new
   tab. Tampermonkey intercepts `.user.js` and shows its install page with the name,
   version and `@match` list.
   - Check the page shows the registry `name` and the `@version` you expect
     (`curl -s <source_url> | grep -m1 @version`).
   - Then click **Install**: locate it with `find "Install button"` and click it. If
     the extension page can't be scripted (Chrome blocks extensions from scripting
     other extensions' pages), ask the user to click Install and wait for them.
   - `source_url: null` (find-similar, private repo): tell the user and stop for that
     script. The manual path is Dashboard → `+` → paste the file from a local clone of
     `repo` → Save.
4. **Prove it:** reload `test_page` and re-read the stamp (or the marker for
   unstamped scripts). For `no-combo`, also check that `#no-combo-badge` reads
   `Hide bundle deals (N hidden)` when the search has bundle cards. "Installed"
   means the stamp is on the live page; the install page closing is not proof.

## Output

```
Userscripts (local Chrome, Tampermonkey BETA)
  no-combo      2.2.0  installed ✓ (stamp on test page; badge: 5 hidden)
  locale-guard  —      offered, not installed
  find-similar  —      skipped: private repo, no install URL
```

## Notes

- Agent-browser runs also wake whatever extensions Chrome Sync put in that profile.
  That is how the 1Password pings of 2026-10-26 happened, now blocked by policy. See
  Agent-Browsers-Plugin `browser-status`.
- raw.githubusercontent.com caches for ~5 min, so a version pushed minutes ago can
  still install the old copy. Re-check the stamp.
