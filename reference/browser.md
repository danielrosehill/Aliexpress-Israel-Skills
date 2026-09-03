# Driving AliExpress in a browser

Shared by every skill in this plugin that touches the site. Read once per session;
individual SKILL.md files link here rather than repeating it.

## Route order — Chrome first, headless last

AliExpress is aggressive about anti-bot heuristics. Ranked by how likely a route is
to complete without a challenge:

| # | Route | Tools | Use for |
|---|-------|-------|---------|
| 1 | **Claude-in-Chrome** — the user's own visible Chrome, real profile | `mcp__claude-in-chrome__*` | **Default for everything interactive.** Already signed in, real fingerprint, real Israeli residential IP, cookies persist between runs. |
| 2 | Gateway Playwright — headed browser on residenceserver | `mcp__gateway__playwright__*` | Unattended / scheduled runs where no user Chrome is open. Still egresses from the home Israeli residential IP. |
| 3 | Headless / scraper libraries | Puppeteer, `aliexpress-product-scraper`, Apify actors | Batch work only, and only when 1 and 2 are unavailable. Expect challenges and stale prices. |
| 4 | Plain fetch (`WebFetch`, `geo-egress__fetch_*`) | — | Will not work for search results, listings, reviews or cart. All are JS-rendered. Do not start here. |

**Why Chrome is first and not just "a visible browser":** three things this plugin
needs only exist in the user's own profile — a signed-in session (`export-cart`
cannot work without it), an established locale handshake so the ILS/Hebrew cookies
are already written, and a browsing history that makes the session look ordinary.
A fresh Playwright profile has none of those and gets challenged sooner.

**Do not silently fall back.** If Chrome is unavailable or the user asks for an
unattended run, say which route you took in the output header. A price read through
route 3 is not the same evidence as a price read through route 1.

### Loading the Chrome tools

They are deferred. Load the set you need in **one** `ToolSearch` call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__tabs_create_mcp
```

Add `file_upload` for `search-by-image`, `find` for chip location, `get_page_text`
for review bodies. Call `tabs_context_mcp` first — the user may already have an
AliExpress tab open, in which case ask before navigating it away.

### Tool mapping between routes

| Action | Claude-in-Chrome | Gateway Playwright |
|---|---|---|
| Open a URL | `navigate` | `browser_navigate` |
| Run JS in page | `javascript_tool` | `browser_evaluate` |
| Read structure | `read_page` | `browser_snapshot` |
| Click | `computer` / `find` | `browser_click` |
| Upload a file | `file_upload` | `browser_file_upload` |
| Wait for render | poll via `javascript_tool` | `browser_wait_for` |

The JS snippets in the skill files are written to run unchanged under either
`javascript_tool` or `browser_evaluate`.

## Locale handshake (ILS + Hebrew + ship-to IL)

Everything price- or shipping-related depends on this. Verify it before reading any
number; do not report USD prices from a session that was supposed to be ILS.

The site state lives in the `aep_usuc_f` cookie on `.aliexpress.com`:

```
c_tp=ILS   b_locale=iw_IL   x_locale=iw_IL   intl_locale=iw_IL   region=IL
```

It is `SameSite=None`, HttpOnly — **not readable or writable from JS**.

**⚠️ Navigating to `he.aliexpress.com` does not establish it.** Verified 2026-09-01:
a signed-in profile set to EN/USD served `lang="en"` and `US $` prices on the `he.`
host, with the switcher reading `EN/USD`. The account preference beats the hostname.
Use the on-page country/currency picker to change it, and **always verify what
actually rendered** rather than assuming the host did the work.

Verification without cookie access — read what the page actually rendered:

```js
({
  currencyGlyph: document.body.innerText.match(/[₪]|US ?\$/)?.[0] ?? null,
  htmlLang: document.documentElement.lang,
  dir: document.documentElement.dir,          // 'rtl' when iw_IL took
})
```

If the glyph is `US $` rather than `₪`, the handshake did not take — which is the
**default outcome** on an EN/USD account, not an edge case. Use the on-page
currency/ship-to picker, re-verify, and **stop and report** if it still fails rather
than converting silently. The picker is reachable via
`[aria-label*="country, region or language"]`.

`he.` is the canonical Israel-Hebrew host. The site honours the cookie on any host,
but use `he.aliexpress.com` so the entry point matches the session.

## Standing rules

- **Never trigger `alert` / `confirm` / `prompt`.** A modal dialog blocks the
  extension and kills the session. Dismiss the site's own consent/region modal via
  its close button.
- **Never anchor on hashed class names** (`il_v`, `ip_iq`, `ie_a6`, `-y2023`). They
  rotate per build. Anchor on `aria-label`, role, or a `[class*="prefix--"]`
  substring. See `selectors.md`.
- **Wait for re-render after any filter toggle** — AliExpress re-fetches the result
  set. Poll for the container to mutate rather than using a fixed sleep.
- **Wait for initial hydration too.** Search results build in stages over ~10s. Read
  too early and you get a fraction of the cards and *none* of the filter chips —
  which looks exactly like rotated selectors. Poll until the card count stops rising.
  See the gate in `selectors.md`.
- **A captcha or risk challenge is a stop, not a retry loop.** Report it and hand
  back to the user; retrying from the same session makes it worse.
- **Read by default; write only where the skill says so.** See the ladder below.

## Write actions — the escalation ladder

Until v1.6.0 this plugin was entirely read-only. It no longer is, so the rule is now
graduated by consequence rather than blanket. A skill may only act at the tier its
own SKILL.md claims.

| Tier | What it does | Skills | Rule |
|---|---|---|---|
| **1 — read** | Reads pages, reviews, cart, prices | everything else | No gate. Default. |
| **2 — reversible write** | Mutates state the user can undo in one click, no money | `add-to-cart` | Act on a clear instruction. Verify the effect, not the click. |
| **3 — money** | Places a real order | `buy-now` | Two-stage gate: present terms, end the turn, require an exact confirmation phrase bound to the total. |

`open-checkout` is tier 1 despite its name: it reads the confirmation page and stops.

Rules that hold across tiers 2 and 3:

- **Verify the effect, never the click.** A success toast, a cart badge and an HTTP
  200 are all proxy signals that have been observed to lie here. Re-read the thing
  that was supposed to change — `add-to-cart` diffs the cart, `buy-now` re-reads the
  total and, on an unreadable outcome, the orders page.
- **One click, no blind retry.** Idempotency is not available: a second add is a
  second unit, a second placement is a second order. If the outcome is unknown, go
  and read the state; do not repeat the action.
- **Authorization is per action, and does not accumulate.** Approval to add does not
  approve checkout; approval for one order does not approve the next.
- **Never touch a payment credential, an OTP or a 3-D Secure step.** Hand back.
- **A challenge mid-write is a stop.** Do not re-run the flow from the top — the first
  attempt may already have taken effect.
