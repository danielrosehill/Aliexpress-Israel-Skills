---
name: update-userscripts
description: Check whether the AliExpress userscripts installed in the user's Tampermonkey are behind their published versions, and if so update them by driving Chrome, then verify the new version is the one running. Use for "update my userscripts", "is the combo script up to date", "check for userscript updates".
---

# Update the AliExpress userscripts

Same registry as `install-userscripts`:
`$CLAUDE_PLUGIN_ROOT/reference/userscripts.json`. Same `browser` input (default
`local`).

## Procedure

1. **Published version**, per script with a `source_url`:
   `curl -s "<source_url>?t=$(date +%s)" | grep -m1 '@version'`. The query string
   gets past the raw CDN's ~5-min cache.
2. **Installed version:** open the registry's `test_page`, wait ~4 s, and read
   `document.documentElement.getAttribute(stamp_attr)` for each script.
   - The stamp is present: that is the running version.
   - No stamp, but `page_marker` is present: the script predates its stamp
     (`stamp_since`), so it is older than that version. Treat it as outdated.
   - Neither: the script isn't installed. Report it and offer `install-userscripts`.
     Don't install unasked.
3. **Compare** versions numerically, field by field. If nothing is behind, report it
   and stop.
4. **Update** each outdated script: open its `source_url` in a new tab. Tampermonkey
   shows its install page with **Update** (or **Reinstall** when the versions match)
   and the old → new version.
   - Check the page names the registry script and shows the published version from
     step 1. If either is wrong, stop and report it.
   - Click **Update**: locate it with `find "Update button"` and click it. If Chrome
     won't let the extension page be scripted, ask the user to click it.
   - For `locale-guard`, check the registry `caveat` first. If the user changed
     `WANT`, tell them the edit has to be re-applied after the update.
5. **Verify:** reload `test_page` and re-read the stamp. It must equal the published
   version. A closed install tab or an "updated" toast is not proof.

## Fallback: Tampermonkey's own check

The scripts declare `@updateURL`, so Tampermonkey also polls by itself (daily by
default). To force it from the dashboard: Utilities → **Check for userscript
updates**, or open the script and choose File → Check for updates. Use this if
opening the raw URL doesn't show the install page.

## Output

```
Userscript updates (local Chrome, Tampermonkey BETA)
  no-combo      2.1.0 → 2.2.0  updated ✓ (stamp 2.2.0 on test page)
  locale-guard  1.1.0 = 1.1.0  current
  find-similar  ?              no update channel (private repo); marker present
```

## Releasing a new version (for the agent editing a script)

Bump `@version` in the script's repo, push, then run this skill. A script without a
version bump will never update, because Tampermonkey compares `@version` only.
