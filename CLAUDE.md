# Working in this repo

Skills here drive a live, signed-in AliExpress session against a real account with a
real payment method. Two of them mutate state and one spends money, so the rules
below are not style preferences.

## 1. Element references, never coordinates

**Never click, type into, or otherwise target anything by pixel position.** No
`click(1231, 392)`, no "the button below the price", no offset measured off a
screenshot.

Locate semantically, then act on the reference the browser tooling gives back:

1. `find` ("Add to cart button") or `read_page filter=interactive` → element ref
2. act on that ref (`computer` accepts `ref` instead of `coordinate`)
3. assert the *effect*, not that the click was dispatched

The governing write-up is
`~/repos/github/ai-agents-and-prompts/ai-claude-plugins/Claude-Site-Skill-Builder-Plugin/references/durability-doctrine.md`
— read it rather than re-deriving it. It ranks the durable handles and explains why
coordinates are not a handle at all.

**This is not theoretical.** On 2026-09-03, in this repo, a coordinate click read off
a 1425×712 screenshot was replayed when the viewport reported 1568×783. The ~42px
drift is exactly the gap between "Add to cart" and "Buy now" on an AliExpress product
page, so the click opened the order-confirmation page instead of adding to the cart.
The page had not changed at all. On this site the penalty for a brittle handle is
entering a purchase flow by accident.

Screenshots are evidence for a human. They are not a handle for a skill.

## 2. Validate live before it lands in the repo

The development path here is **drive real Chrome, validate against the account, then
commit** — not write from assumption and hope. Concretely:

- Claude-in-Chrome against Daniel's own signed-in profile is the development
  environment, not just the runtime. See `reference/browser.md` for route order.
- A selector is `U` until a live run confirms it, and `V` carries the date it was
  confirmed. Do not ship a `V` you inferred.
- Prove a write skill on the test fixtures in `docs/admin/development-notes.md`
  before pointing it at anything the user cares about.
- Behaviour that only reproduces live — silent no-ops, staged hydration, label
  mismatches — is the whole reason for this path. Record it when you find it.

## 3. Verify the effect, not the signal that stands in for it

On this site the success toast, the cart badge and an HTTP 200 have all been observed
to say "fine" while nothing happened. `add-to-cart` diffs the cart; `buy-now`
re-reads the total and, on an unreadable outcome, reads the orders page. Keep that
shape in anything new.

## 4. Respect the write ladder

`reference/browser.md` defines three tiers: read, reversible write, and money. A skill
acts only at the tier its own SKILL.md claims. Tier 3 (`buy-now`) requires terms
presented, the turn ended, and an exact confirmation phrase carrying the total.
Authorization is per action and never accumulates.

## 5. Where findings go

- DOM facts, with a verification date → `reference/selectors.md`
- Tax and threshold facts → `reference/israel-tax.md`
- Method, fixtures, open defects → `docs/admin/development-notes.md`
- Protocol reverse-engineering → `skills/export-cart/reference.md`

Update the existing file. **No dated work logs, no `SUMMARY.md`, no
`IMPLEMENTATION_NOTES.md`** — a finding that only exists in a session artifact is a
finding the next agent will not read.
