---
name: check-il-compatibility
description: Check whether an AliExpress product will actually work — and be importable — in Israel. Plug type (Type H), 230V/50Hz mains, dual-voltage vs 110V-only, wireless bands, and restricted-import categories, read off the listing's own specs.
---

# Will This Actually Work in Israel?

Three things kill an AliExpress purchase for an Israeli buyer: it gets **taxed**, it
**never arrives**, or it **arrives and is unusable**. `find-under-75` and
`cart-vat-nudge` cover the first, `ship-options-il` the second. This skill covers the
third — the item that lands correctly, cheaply and on time, and then cannot be
plugged in.

## When to use

- Any **electrical or electronic** item: appliances, chargers, power tools, lighting,
  heaters, kitchen gear, anything with a plug or a mains adapter
- Anything **wireless** — WiFi gear, remotes, smart-home devices, radios
- Before buying, and specifically **before** running `find-under-75` on a shortlist —
  no point optimising the tax position of something that won't run
- When the user asks "will this work here", "does it come with the right plug",
  "is this 220", "can I even import this"

## Inputs

- `url` (required) — listing URL or item id. Accepts a list.
- `sku` (optional) — the variant. **Plug type is usually a variant, not a listing
  property** — the same item ships US/EU/UK/AU plugs under one listing. Checking the
  listing without checking the variant is the classic miss.

## The Israeli electrical facts

| Property | Israel |
|---|---|
| Mains voltage | **230 V** |
| Frequency | **50 Hz** |
| Socket | **Type H** (SI 32 / IS 16A-1971) — unique to Israel and the Palestinian territories |

**What fits a modern Israeli socket:**

- **Type C** (Europlug, two round 4 mm pins) — **fits.** Israeli sockets have accepted
  round pins since the standard was revised in 1989. This is the common good case:
  most Chinese sellers' "EU plug" option is Type C.
- **Type H** — fits, obviously. Rare on AliExpress; if offered, take it.
- **Type E / F (Schuko)** — **does not fit.** Larger body and side earth clips. "EU
  plug" on a listing sometimes means Schuko rather than Europlug, so check the
  variant image, not just the label.
- **Type A / B (US flat blades)** — does not fit.
- **Type G (UK)** / **Type I (AU/CN)** — does not fit.

**Voltage is the separate question, and the more expensive one to get wrong.** A plug
adapter changes the shape, not the voltage:

- Listed **100–240 V** (dual voltage) → fine on 230 V. Most modern chargers, laptop
  bricks and USB power supplies are.
- Listed **220 V** (Chinese domestic) → fine on 230 V.
- Listed **110 V / 120 V only** → **will not work** on Israeli mains. Needs a step-down
  transformer sized to the load, which for anything with a heating element or a motor
  costs more than the item. Treat as a fail, not a caveat. Plugging it in directly
  destroys it, sometimes loudly.
- **No voltage stated** → unknown, not safe. Ask the seller or treat as a fail on
  anything mains-powered.

**50 Hz** matters for synchronous motors and mains-timed clocks. A 60 Hz-only motor
runs slow or hot on 50 Hz. Rare, but check on motorised goods.

## Method

Chrome first, locale handshake first — `$CLAUDE_PLUGIN_ROOT/reference/browser.md`.
Ship-to must be Israel or the variant list you see may not be the one offered here.

1. **Read the specification table.** Look for `Plug Type`, `Voltage`, `Power`,
   `Frequency`, `Certification`, `Origin`. Extract as text:

   ```js
   [...document.querySelectorAll('[class*="specification"] li, [class*="spec"] li')]
     .map(el => el.innerText.trim()).filter(Boolean);
   ```

   Selectors here are **unverified** — see the `(U)` note in
   `$CLAUDE_PLUGIN_ROOT/reference/selectors.md`. Fall back to a text search of the
   page body for `Plug|Voltage|תקע|מתח|V\b|Hz`.

2. **Enumerate plug variants.** Read the variant selector for plug options
   (`US / EU / UK / AU / IL`) and note which is default — the default is frequently
   US, and it is what ships if the user doesn't change it.

3. **Check the images.** Where the spec table is silent, the plug is usually visible
   in a variant thumbnail, and the rating plate is often photographed. Use
   `read_page` on the image block.

4. **Check IL reviews.** `il-reviews-show` is the ground truth — an Israeli buyer
   saying "the plug fit" outranks any spec table. Zero IL reviews on an electrical
   item is itself a finding.

5. **Never infer from price or category.** If the listing doesn't say, the answer is
   `unknown`, and unknown on mains voltage is a fail.

## Restricted and awkward imports

Beyond electrics, some categories are restricted, need a permit, or are routinely
held. **Rules change — verify at runtime rather than trusting this list**, and treat
it as "flag for the user to check", never as a clearance decision:

- Drones / UAVs — permit territory
- Radio transmitters, signal jammers, boosters, CB gear — Ministry of Communications
- Laser pointers above low power classes
- E-cigarettes / vaping products
- Medications, supplements, medical devices
- Seeds, plants, soil, animal products
- Knives and anything weapon-adjacent
- Baby and child equipment (car seats especially) subject to Israeli standards

For consumer **personal import** in ordinary quantities, formal Israeli standards
certification (תקן ישראלי / SI mark) generally isn't demanded at the border the way it
is for commercial import — but the goods still aren't certified, which matters for
insurance and for anything hard-wired. Say this plainly; don't overstate the risk and
don't wave it away.

## Output format

```
Product: <title>                          item <id>
Route: claude-in-chrome                   ship-to: Israel (confirmed)

VERDICT: ✅ works in Israel  |  ⚠️ works with a caveat  |  ❌ will not work  |  ❓ unknown

Electrical:
  voltage:    100–240 V        ✅ dual voltage, fine on 230 V
  frequency:  50/60 Hz         ✅
  plug:       EU (Type C)      ✅ fits Israeli Type H socket
              ↳ variant "EU" must be selected — listing default is US (Type A) ❌
  wattage:    65 W

Category flags:
  • none — ordinary consumer electronics

Evidence:
  spec table: "Plug Type: EU / Voltage: 100-240V"
  image: rating plate legible, 100-240V~50/60Hz
  IL reviews: 3, none mention plug problems

⚠ Action: select the **EU** variant before adding to cart. The default US variant
  will arrive with a plug that does not fit and is not adaptable without a step-down
  check — the item is dual-voltage, so a plug adapter alone would suffice, but the
  EU variant is free and simpler.

Next: `ship-options-il` · `find-under-75` · `il-reviews-show`
```

## Verdict rules

| Situation | Verdict |
|---|---|
| Dual voltage + a Type C or H variant available | ✅ |
| Dual voltage, only US/UK/AU plug | ⚠️ — works with a plug adapter; say so and say adapter, not converter |
| 220/230 V, plug fits | ✅ |
| 110 V only | ❌ — needs a transformer; usually not worth it |
| Voltage not stated, mains-powered | ❓ → treat as ❌ for buying purposes |
| Restricted category | ⚠️ regardless of the electrics — flag for the user to check |

## Out of scope

- Ruling on legality of an import. This flags categories to check; it is not customs
  advice and must not be presented as clearance.
- Electrical safety certification of a specific unit.
- Anything non-electrical without a category flag — most of AliExpress needs no check.

## Validation checklist

1. Voltage and plug read from the **listing's own text or images**, never inferred.
2. **Variant-level** plug options enumerated, and the default variant named — a
   listing-level "EU plug" claim is not enough.
3. Unknowns reported as `❓`, never resolved by assumption.
4. Verdict matches the rules table.
5. Where the verdict is ⚠️ or ❌, the concrete action is stated (select variant X /
   buy an adapter / don't buy).
6. Any restricted-category flag is framed as "verify", not as a decision.
