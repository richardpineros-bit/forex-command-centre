# Forex Command Centre — TODO

Tracked deferred work. If it's not in this file, it doesn't exist. Nothing
lives only in chat history.

Each item has: **priority**, **scope**, **trigger** (what would make us start
this), and **dependencies**.

---

## 🔴 Priority 1 — Scraper Health Monitoring (unified)

**Trigger:** Before any new scraper is added. Before MDI Phase 3 UI analysis
section is built.

**Scope:**
- Unified `/health/scrapers` endpoint on alert server covering all 5 scrapers:
  - `forex_calendar_scraper` (FF)
  - `te_scraper` (Trading Economics)
  - `ig_sentiment_scraper`
  - `oanda_orderbook_scraper`
  - `macro_dominance_scraper`
- Per-scraper staleness thresholds (different scrapers have different cadences)
- Push notification on degradation (reuse existing webpush infrastructure)
- Dashboard widget in Intel Hub showing fleet status at a glance

**Why this is priority 1:** During MDI Phase 3 build we discovered the nginx
webroot `calendar.json` had been stale for 70 days while the scraper ran
fine. The file silently stopped being copied into webroot and nobody knew.
User's manual news discipline compensated but the automated gate was dead.
This exact failure mode could hit any of the 5 scrapers. We have zero
telemetry right now.

**Also fold into this work:** a light "silent corruption detection" layer
(Tier 3 from earlier discussion) — sanity checks that flag suspicious
values (e.g., yield moving >100bp in 4h, policy rate changing mid-cycle).

**Dependencies:** None. Can start immediately.

---

## 🟡 Priority 2 — Cron consolidation (clean up duplicate / orphan entries)

**Trigger:** Dedicated session. Do not bundle with other work - touching
cron risks silent breakage of all scrapers if we get it wrong. Needs
full attention.

**State discovered 2026-04-21 (during MDI project sign-off audit):**

Two separate cron systems are both active on Unraid:

1. **`/var/spool/cron/crontabs/root`** (live system crontab) contains:
   - System boilerplate (hourly/daily/weekly/monthly run-parts)
   - `0 */6 * * *  forex_calendar_scraper.py --unraid`  (orphan, bare)
   - `0 */4 * * *  oanda_orderbook_scraper.py --unraid >> /tmp/oanda-book.log`

2. **`/boot/config/plugins/user.scripts/customSchedule.cron`** contains:
   - `0 */6 * * *  forex-calendar-update/script`  (wrapper: FF --all-sites + sleep 120 + TE + cp to webroot)
   - `0 */4 * * *  ig_sentiment_scraper/script`
   - `* * * * *     mdi_event_matcher/script`
   - `0 */4 * * *  mdi-scraper/script`

**The mess:**

a. **FF scraper runs TWICE every 6h** - once bare from crontab root (no
   `--all-sites`, no TE, no webroot copy), and once via User Scripts
   wrapper (which does everything properly). They race for ~2 minutes.
   Wrapper wins because of its `sleep 120`, overwriting the bare run's
   partial output. Wasteful but accidentally functional.

b. **`oanda_orderbook_scraper.py` has NO User Script equivalent.** It's
   the only scraper scheduled purely via the live root crontab. If that
   crontab gets regenerated on reboot from a go-file or `/etc/cron.d/*`
   (source not yet identified), OB scraper could silently die.

c. **Orphan script `/usr/local/bin/update-forex-calendar.sh`** exists
   but is not scheduled anywhere active. Its content is BROKEN anyway:
   calls `forex_calendar_scraper.py` with NO args (no `--unraid`, no
   output path config) and copies calendar in the wrong direction
   (data/ -> src/). If ever re-enabled it would produce garbage.

d. **No `/etc/crontab` file exists on this Unraid.** Root crontab gets
   populated at boot from an unknown source - need to identify before
   making persistent changes, or edits will revert.

**Proposed cleanup (for dedicated session only):**

Step 1 (safe): Remove duplicate FF entry from live root crontab.
  crontab -l | grep -v "forex_calendar_scraper.py" | crontab -
  /etc/rc.d/rc.crond restart
  After: confirm only ONE FF run at next :00 mark.

Step 2 (medium): Convert OB scraper to User Script pattern.
  Create /boot/config/plugins/user.scripts/scripts/oanda-orderbook-scraper/
    name = "oanda-orderbook-scraper"
    schedule = "0 */4 * * *"
    script = bash wrapper with log redirect
  Backup in docs/cron-backup/
  Remove OB line from root crontab.
  Verify User Scripts plugin picks it up + OB still runs every 4h.

Step 3 (safe): Delete orphan update-forex-calendar.sh.
  rm /usr/local/bin/update-forex-calendar.sh
  Also inspect /var/spool/cron/crontab.* temp files for any lingering
  references and clear them.

Step 4 (investigate): Find where root crontab is regenerated at boot.
  Candidates: /boot/config/go, /etc/cron.d/*, systemd timer units.
  Without fixing this, Step 1-3 changes revert on reboot.

**Dependencies:** None, but requires patience and careful testing.
Do NOT bundle with code changes - cron changes need their own
verification window.

**Risk if deferred indefinitely:**
  - Minor: wasted compute (duplicate FF scraper run)
  - Medium: OB scraper could silently stop after a reboot
  - Medium: accumulating entropy makes future debugging harder

---

## 🔴 Priority 3 — Authority Promotion Framework (SOFT → MEDIUM decision path)

**Trigger:** When MDI has N≥30 DOMINANT-flagged COMPLETE events captured
AND the hit-rate analysis shows meaningful separation between tiers
(e.g., DOMINANT REACTED_AND_RESUMED % is materially higher than BALANCED).

**Why this is a priority:** MDI exists to eventually answer the question
"should this signal have authority to modify gates?" Without a written
framework for how promotion happens, we're at risk of either:
  (a) Casually promoting based on gut feeling and a chart that looks good
      (exactly the kind of spec drift the Risk Committee warns against), OR
  (b) Never promoting because no process exists, making MDI a permanent
      display-only curiosity regardless of how good the data is.

Either failure mode is bad. A framework forces the decision to be
deliberate and evidence-based.

**Scope:**
- Document the tiers explicitly:
    SOFT     - display only (current MDI state)
    MEDIUM   - can adjust risk sizing / add warnings, CANNOT block trades
    STRONG   - can block trades (gate authority)
- Per-tier promotion criteria (proposed starting point):
    * Minimum sample size (N≥30 for MEDIUM, N≥100 for STRONG)
    * Statistical test: hit rate significantly above baseline
      (e.g., DOMINANT tier's REACTED_AND_RESUMED % > BALANCED tier's
      by >15% with p<0.05)
    * Out-of-sample validation (at least 30 days of new data after
      initial promotion criteria are met, to guard against overfitting)
    * No single-tier dominance in dataset (e.g., can't promote if 80%
      of captured events were the same currency/event type)
- Demotion criteria (if promoted signal later underperforms):
    * Rolling 30-day hit rate drops below promotion threshold
    * Automatic demotion back to SOFT, logged with reason
- Audit trail requirements:
    * Every promotion decision recorded in a file (who, when, based
      on what data snapshot, what criteria met)
    * Cannot be modified retroactively
- Explicit ban on:
    * Retroactive threshold tuning to hit promotion criteria
    * Mid-session overrides of authority level
    * Promotion without documented criteria being met

**Dependencies:**
- Priority 6 (Phase 3 UI analysis section) must be built first (it's
  the mechanism that shows whether criteria are met)
- Priority 1 (Scraper Health) should be in place (can't trust data that
  might be silently broken)

**Risk of no framework:** Every satellite built from here on will face
the same promotion question. Without a template, we'll either invent
it ad-hoc each time (silent drift) or never confront it at all.

---

## 🟡 Priority 4 — News Bias ↔ MDI coupling decision

**Trigger:** After Priority 3 (Authority Promotion Framework) is defined.
Do not touch coupling until the promotion framework exists, because
coupling decisions are a form of promotion.

**Context:** The FCC has two satellites that measure overlapping but
different things:
- **News Bias** (ForexFactory scraper): cumulative fundamentals direction
  over weeks, based on actual vs forecast prints
- **MDI** (this project): current macro dominance based on yields +
  policy + momentum

These two signals MIGHT reinforce each other in useful ways:
- A CAD News Bias BEARISH that aligns with CAD being the weak leg in MDI
  is double-confirmation of CAD-weakness
- A CAD News Bias BULLISH that contradicts CAD being MDI-weak raises a
  question worth surfacing

**Scope of the decision:**
- Is the coupling worth building? Or does it introduce too much
  spec drift risk?
- If built: where does the coupling live? (Alert server? Frontend?
  Neither - just visual co-display?)
- Can the coupling be one-way (News Bias informs MDI interpretation)
  rather than bidirectional?
- Does coupling count as authority promotion for either signal?
  (Almost certainly yes - if MDI display changes based on News Bias
  input, MDI has effectively granted News Bias authority.)

**Proposed default decision (for discussion):** Keep them separate.
Show both signals side-by-side in the Intel Hub. Let the trader
mentally combine them. Avoid coupling in code.

**Why defer:** During MDI Phase 3 build, the user asked about this
specifically and I recommended deferring to avoid coupling risk.
That recommendation needs to be either formalised (built into a
written design doc) or revisited. It's currently just a verbal
decision from chat.

**Dependencies:**
- Priority 3 (Authority Promotion Framework)
- Priority 1 (Scraper Health) - must trust both scrapers' outputs
  before coupling anything

---

## 🟡 Priority 5 — MDI scraper v1.0.3 (quality fixes)

**Trigger:** After ~1 week of MDI scraper runs confirms the AUD HIKE
pattern is persistent (not a one-off).

**Scope:**

1. **AUD HIKE false positive.** RBA has been on hold/cutting but v1.0.2
   consistently flags AUD as HIKE. Prose parser in `parse_policy_page()`
   likely matching past-tense "raised" in historical context commentary
   rather than current-meeting action. Fix: tighten pattern to require
   proximity to "this/current meeting" phrasing or specifically scope to
   the first summary paragraph rather than full page.

2. **"Full news impact" wording.** The BALANCED-state text on MDI badges
   reads as if MDI is predicting price direction, which it isn't. Rewrite
   to something like *"no macro override — news effect not dampened"* or
   similar. Keep it terse enough to fit the intel-item badge.

**Dependencies:** None. Small patch, 30 min work.

**Note on data preservation:** Per versioning rule, v1.0.2 stays in repo
alongside v1.0.3. Do not silently rewrite history.

---

## 🟡 Priority 6 — MDI Phase 3 UI analysis section

**Trigger:** `stats.dominant_complete` ≥ 30 in `/macro-dominance/events`
response. Until then the counter in the Intel Hub MDI tab should keep
showing `N/30`.

**Estimated arrival:** 60–90 days from 2026-04-21 (assuming ~5-10 High
events/week with non-zero dominant-flagged pairs).

**Scope:**
- Unlock the currently-locked analysis section in `arm-history-dashboard.html`
  once N ≥ 30
- Display hit rate breakdown:
  - REACTED_AND_RESUMED %  |  SUSTAINED_REACTION %  |  NO_REACTION %
  - Per threshold tier (DOMINANT / LEANING / BALANCED) comparison
  - The key comparison: is DOMINANT's REACTED_AND_RESUMED rate meaningfully
    higher than BALANCED's? If yes, signal has edge. If no, retire.
- Recent events table — visible at all times (not gated on N ≥ 30) for
  transparency during the validation window

**Dependencies:**
- Priority 1 (Scraper Health) — must be in place before we rely on Phase 3
  data being trustworthy
- `calendar.json` staleness issue — resolved 2026-04-21
- MDI event matcher path bug — resolved 2026-04-21 (v1.0.1)

**Post-unlock decision gate:** If hit rate data justifies promotion, the
SOFT → MEDIUM authority upgrade is a separate planning exercise. Do NOT
bundle promotion with unlock.

---

## 🟡 Priority 7 — ATR threshold tuning mechanism (for event matcher)

**Trigger:** When MDI Phase 3 UI analysis (Priority 6) shows hit rates
that suggest the current ATR thresholds may not be optimal, OR when
data shows per-asset-class variability (e.g., JPY crosses need
different thresholds than metals).

**Current state (v1.0.0 hardcoded):**
In `macro_event_matcher_v1.0.1.py`:
```
REACTION_THRESHOLD_ATR   = 0.5   # min reaction to count as "something happened"
RESUMED_THRESHOLD_ATR    = 0.3   # max final deviation to count as "resumed"
SUSTAINED_THRESHOLD_ATR  = 0.5   # final deviation beyond = sustained reaction
```

These are pre-committed constants specifically to prevent the
"retroactively tune to make MDI look better" failure mode.

**Scope:**
- Decide on a tuning mechanism that preserves audit integrity:
    Option A: Config file (JSON) — simple but can be edited silently.
    Option B: Code constants + version bump — v1.0.1 → v1.1.0 requires
      a commit, preserves history, re-classifies transparently in a
      NEW outcome column (never overwrite).
    Option C: Per-asset-class profiles — FX, Metals, Crypto, Indices
      each get their own triplet. Matches the pattern ProZones uses.

**The non-negotiable constraint:** Any tuning mechanism MUST preserve
the original outcome classification alongside the new one. Never
silently re-classify history. The audit trail is the whole point.

**Proposed default:** Option B (version bump). Simplest, most rigorous,
matches versioning rules already in place.

**Dependencies:**
- Priority 6 (Phase 3 UI) — need data to know if tuning is warranted

**Risk if deferred indefinitely:** None. The v1.0.0 thresholds might
turn out to be fine. Only build this if data says otherwise.

---

## 🟡 Priority 8 — Oanda API rate limit monitoring

**Trigger:** If the event matcher cron log shows repeated Oanda HTTP
429 (rate limit) errors, OR during a high-volume news event (e.g., NFP
+ FOMC in the same day) when many pairs could be simultaneously in
outcome-tracking windows.

**Context flagged during Phase 3 build:**
The matcher calls Oanda every minute for each pair with a pending
event. Usually that's 0-3 pairs. But a big calendar day could have
10+ pairs with pending outcomes being polled for 4 hours each
= ~2,400 calls/day. Oanda's documented limit is 120 requests/sec, so
we're orders of magnitude below, but:

- This assumes the matcher is the ONLY consumer of Oanda REST. Actually
  the Entry Monitor in the alert server also calls Oanda for ATR
  refresh, and the trade capture module pulls pricing.
- If all three compete during a news spike, we could hit burst limits
  even while staying under the hourly rate.

**Scope:**
- Centralise Oanda rate-limit awareness (single token-bucket tracker
  shared across all Oanda-calling code)
- Log every Oanda call with timestamp + caller + endpoint for audit
- Alert (push notification) if HTTP 429 count exceeds threshold in
  any rolling 5-minute window
- Fallback behaviour for each caller:
    * Entry Monitor: skip this refresh cycle, retry next
    * Event matcher: skip this pair this minute, retry next
    * Trade capture: block trade submission (CRITICAL — we do not
      want to place an order during rate-limit degradation)

**Dependencies:**
- Priority 1 (Scraper Health) — natural home for this monitoring

**Risk if deferred:** Low under normal conditions. High during news
spikes, when worst-case timing is exactly when Oanda calls matter most.

---

## 🟡 Priority 9 — Tier 3 silent corruption detection (for all scrapers)

**Trigger:** Fold into Priority 1 (Scraper Health) build. Do NOT build
separately — it's cheaper to add sanity checks once while building
the health monitor than to retrofit later.

**Context flagged during Phase 1 build:**
Staleness + fetch errors are easy to detect (Tier 1 monitoring).
Silent corruption is harder:
- Parse succeeds but returns garbage (e.g., regex matches wrong
  paragraph, outputs USD policy rate as 0.50% when real value is 3.75%)
- Scraper produces valid JSON but one currency's yield is missing
  while every other field looks correct
- Legitimate extreme value (bond crisis) looks identical to a parse
  bug from monitoring's perspective

**Scope:**
- Sanity checks on scraped values:
    * Policy rate change >1% since last run → flag (CBs don't move
      that fast between meetings — this is either a real surprise
      worth seeing OR a parse bug)
    * Yield change >100bp in 4h → flag (bond crisis OR parse error)
    * Currency score magnitude >80 → flag (extreme readings deserve
      human review)
    * Sentiment/IG percentages outside [0,100] → flag (impossible value)
- Flags surface in Intel Hub as "anomaly review required" list
- NOT hard blocks on scraper output — this is about *visibility*,
  not rejection
- Scraper still writes its output, but the flagged values are
  highlighted in the UI until manually dismissed
- Dismissal is logged with timestamp + user choice (accept as real vs
  reject as garbage)

**Dependencies:**
- Priority 1 (Scraper Health Monitor) — this is a sub-feature of it

**Why it's a priority:** Silent corruption is the single most dangerous
data quality failure. It doesn't trigger alerts (data looks present),
doesn't fail fast (scraper exits 0), and only shows up when you make
a bad decision based on bad data. Anomaly flags are the cheap insurance.

---

## 🟢 Priority 10 — Calendar path consolidation

**Trigger:** Low-risk cleanup session. Not urgent.

**Scope:** Remove 4 stale `calendar.json` copies that serve no purpose:
- `/mnt/user/appdata/forex-command-centre/backend/src/calendar.json` (Mar 10)
- `/mnt/user/appdata/forex-command-centre/config/calendar.json` (Jan 10)
- `/mnt/user/appdata/nginx/www-backup-20260212_152919/calendar.json`

The live source of truth is:
- **Scraper writes to:** `/mnt/user/appdata/forex-command-centre/src/calendar.json`
- **Scraper backs up to:** `/mnt/user/appdata/forex-command-centre/data/calendar.json`
- **User Script copies to:** `/mnt/user/appdata/nginx/www/calendar.json` (webroot)
- **MDI matcher reads:** `/mnt/user/appdata/forex-command-centre/src/calendar.json`

Longer-term question: consolidate *all* scraper outputs to
`/mnt/user/appdata/trading-state/data/` so every scraper uses the same
pattern. Currently only the FF/TE scrapers are the odd ones out. Consider
as part of Priority 1 work.

**Dependencies:** None.

---

## 🟢 Priority 11 — Cron / User Script backup & version control

**Trigger:** Next time we touch any User Script.

**Scope:** The Unraid User Scripts directory
`/boot/config/plugins/user.scripts/scripts/` contains critical cron
configuration for:
- `mdi-scraper`
- `mdi_event_matcher`
- `forex-calendar-update`
- `ig_sentiment_scraper`

None of these are under version control. If Unraid rebuilds or the
`/boot/config` partition fails, the cron schedules and script bodies
are lost. Partial backup now exists in `docs/cron-backup/` (added
2026-04-21). Future: either symlink the User Scripts into the repo
so edits are captured automatically, or add a cron job that rsyncs
them nightly.

**Dependencies:** None.

---

## 🟡 Priority 12 — Intel Hub OB Tier 2: trapped-crowd analysis

**Trigger:** When Tier 1 (live in Intel Hub OB tab from 2026-04-22, commit
`df5ef1e`) has been observed for a few weeks and the raw bonus fields
(position counts, volumes, average entry prices) are confirming their
value. Or sooner if an armed setup suggests trapped-crowd context would
have materially changed the trade decision.

**What Tier 2 adds (on top of the already-shipped Tier 1):**
- **Status column** in Latest Snapshot: `TRAPPED SHORT` / `TRAPPED LONG` /
  `IN PROFIT` / `MIXED`
- Colour-coded — trapped side = contrarian confirmation (stronger signal
  than crowd % alone), profitable side = caution (crowd has momentum)
- Computed client-side in `arm-history-dashboard.html` from the three
  data points per pair: `avg_long_price`, `avg_short_price`, and
  **current market price** (new dependency — see below)

**Required new dependency: current price per pair**
Myfxbook exposes avg entry prices but not live market price. Three
options were scoped; recommended path is **Option C**:

- **Option A (rejected):** Oanda `/v3/pricing` called directly from
  browser JS. Requires exposing Oanda API key in the frontend —
  security issue. Hard no.
- **Option B (future upgrade):** New `/pricing/latest?pairs=...`
  endpoint on the alert server, proxies Oanda. Most robust long-term
  but adds backend work + new deploy step.
- **Option C (recommended):** Scraper bumps from `v1.0.1` to `v1.1.0`
  (MINOR — new feature). After Myfxbook fetch, pull current prices
  from Oanda `/v3/pricing` for all 33 pairs using existing
  `oanda-proxy.php` pattern. Add `"current_prices": {pair: price, ...}`
  block to the output JSON. Price is up to 4h stale (refreshes with
  cron), which is fine for "is the crowd trapped?" — trapped crowds
  do not un-trap in minutes. Smallest change, lowest risk.

**Scope (assuming Option C):**

1. `myfxbook_sentiment_scraper_v1.0.1.py` → `v1.1.0`:
   - New `fetch_current_prices()` function using Oanda REST credentials
     from existing `oanda-proxy` config pattern
   - Call after Myfxbook outlook fetch, before writing output
   - Add `"current_prices": {PAIR: midPrice, ...}` to output JSON
   - Graceful failure: if Oanda call fails or times out, scraper still
     writes sentiment data without prices (fail-open on non-critical
     enrichment data — the sentiment signal itself is the primary value)
   - History file entries also carry `current_prices` for back-testing
     trapped-crowd → price-move correlation later
2. `arm-history-dashboard.html`:
   - Read `current_prices` from the fetched JSON
   - Compute per-pair trapped status using tolerance window (e.g. price
     must be >0.1 ATR away from avg to count as trapped/profit)
   - New **Status** column in Latest Snapshot table, positioned after
     Signal, before Positions L/S
   - Colour coding consistent with existing contrarian convention
     (trapped = amber/orange; profit = muted; mixed = grey)
3. No change to alert server, armed panel, or any live trading gate.

**Known gotchas to handle on implementation:**
- Define "trapped" precisely — proposed rule:
  - SHORT side trapped if: current price > avg_short_price + tolerance
  - LONG side trapped if: current price < avg_long_price - tolerance
  - Tolerance = max(0.1% of price, something asset-class-appropriate)
- Handle zero/missing avg prices (the THIN_SAMPLE pairs — WTICOUSD /
  BCOUSD often have one side at 0). Thin-sample pairs should display
  `—` for Status, not a computed trapped flag.
- Decimal precision for price comparison — avg prices come in as
  floats, small rounding error could flip the flag in borderline
  cases. Use a minimum tolerance band to absorb that.

**Known limitations of Option C approach:**
- 4-hour staleness means Status reflects the crowd at the last cron
  run, not right now. Acceptable for Intel Hub (historical view) but
  not suitable for live armed-panel integration (which would need
  Option B).
- If Tier 2 data proves genuinely useful, a follow-up Tier 2.5 could
  migrate to Option B and expose trapped status in the armed panel OB
  satellite — but that is a separate scoping exercise.

**Dependencies:**
- Tier 1 (Priority 11+ in historical sense — already shipped
  `df5ef1e` on 2026-04-22) — done
- Oanda account REST access — already proven (works in
  `oanda-proxy.php`, `/v3/pricing` confirmed working on AU account)
- Priority 1 (Scraper Health) — soft dependency. Ideally Tier 2 ships
  after the health monitoring catches a Myfxbook failure mode before
  we start layering more on top of that scraper.

**Estimated effort:** 30–45 min implementation + testing. Genuinely
small change if scoped as Option C.

---

## 🟡 Priority 13 — UTCC v3.1.0 disarm webhook (close the stale-armed gap)

**Trigger:** First time a setup invalidates intra-bar after the v3.0.0
deploy and you notice an armed card lingering on the dashboard with
no notification that it should be cleared.

**Scope:**
- `ultimate-utcc.pine` v3.1.0: add edge-triggered DISARM webhook firing
  on the rising edge of `tfDisarmCode != "" or trDisarmCode != ""`.
  Same JSON envelope pattern as ARMED but `"type":"BLOCKED"` with
  `"disarm_code"` field carrying the existing internal codes
  (`TF-DISARM-PERM`, `TF-DISARM-MTF`, `TF-DISARM-EXTENDED`,
  `TF-DISARM-SCORE`, `TR-DISARM-PERM`, `TR-DISARM-BREAK`,
  `TR-DISARM-STRUCT`).
- Alert server already has `pushBlocked()` handler waiting for these
  payloads — no server-side changes required.
- Frontend: disarm push notification will surface automatically via
  existing webpush plumbing.

**Why this is needed:**
v3.0.0 edge-triggered firing solved the 4H latency on arming, but
introduced a stale-state risk: a pair that silently invalidates
intra-bar (e.g. MTF alignment breaks, structure damage, score collapses
through `disarmDrop` hysteresis) currently has no event broadcasting
that fact. The internal disarm codes are computed but never escape the
indicator. Bar-close repeat-fires used to mask this — every 4H the
pair would either re-affirm or quietly disappear. With v3.0.0 there
is no re-affirmation, so a stale armed card may sit on the dashboard
until something else triggers cleanup.

**Why this is P2 not P1:**
Manual review on the dashboard catches stale setups. The trader
doesn't blindly enter on a stale card. But the institutional principle
is "every state transition produces an event" — silent invalidation
violates that. This closes the gap.

**Dependencies:**
- v3.0.0 stack must be deployed first and observed for 1-2 weeks to
  characterise how often setups silently invalidate intra-bar.
- If stale-armed cards are not actually a problem in practice, this
  may drop to P3 or get closed without action.

**Estimated effort:** ~20 min Pine edit + commit + deploy.

---

## 🟢 Priority 14 — Weekly frequency week-boundary fix (AEST alignment)

**Trigger:** After v3.0.0 has run for 2+ weeks, if `weekSignalCount`
values still feel "way off" on Monday/Tuesday cards.

**Scope:**
- `getPairSignalCounts()` in `forex-alert-server/index.js`: change
  `weekStart` calculation from "Monday 00:00 UTC" to "Monday 00:00
  user-timezone" (AEST = UTC+10/+11 with DST handling).
- Decide: hard-code AEST or read timezone from a config setting?
- Hard-coded AEST is simpler but locks the server to one operator.
  Config setting is cleaner but introduces a new whitelist entry in
  `storage-api.php` and a settings UI element.
- Recommended: hard-code AEST as a constant `WEEK_START_OFFSET_HOURS`
  with a comment explaining why. Single-operator system, no need for
  multi-timezone abstraction.

**Why this matters:**
Currently `weekStart = Monday 00:00 UTC` = ~10am Monday AEST. Anything
armed Monday morning AEST (Sunday night UTC) counts to *last* week.
Anything armed Sunday night AEST (Sunday afternoon UTC) is *this*
week. Confusing for the trader who reads cards in AEST.

**Why this is P3 not earlier:**
Pure display/accuracy issue — doesn't affect trade decisions. Wait
until the v3.0.0 dedup correction settles to see if this is still
the dominant felt-error in frequency counts.

**Dependencies:**
- v3.0.0 deployed and 2+ weeks of arm-history data accumulated.
- User confirms boundary issue is the residual frequency complaint
  (not some other dedup or counting issue).

**Estimated effort:** ~15 min if hard-coded AEST; ~1 hr if config-driven.

---

## 🔴 Priority 15 — Investigate STRUCT EXT epidemic across all armed pairs

**Trigger:** Observed 2026-04-27 — every armed pair (21+) showing
`STRUCT ✗ EXT` cell. Either every single pair has genuinely aged
out of structure (unlikely) or the derivation is mis-calibrated.

**Scope:**
- `gradeToStructExt()` in `forex-alert-server/index.js` returns FRESH only
  for `PRIME / AT_ZONE / BREAKOUT_RETEST` location grades. Everything else
  (OPPOSED, WAIT, BREAKOUT_EXT, NO_DIRECTION, IN_CLOUD, AT_CLOUD, FALSE_BREAK)
  becomes EXTENDED.
- That is 3 FRESH grades vs 7 EXTENDED grades. Distribution asymmetry alone
  guarantees most pairs land EXTENDED most of the time.
- Audit `loc-history.json` to confirm grade distribution across last 7
  days. Expect dominant grades to be OPPOSED/WAIT/BREAKOUT_EXT — these
  are the "default" states most of the time.
- Decide: is FRESH supposed to be rare (current behaviour, by design) or
  is the FCC-SRL Pine threshold for PRIME/AT_ZONE too tight, denying valid
  in-zone classifications?
- Cross-reference: when XAUUSD card showed `★ PRIME` on 2026-04-27,
  STRUCT cell still showed EXT — may indicate `gradeToStructExt` is
  not picking up the live location grade correctly.

**Why this matters:**
Current display tells the trader "every pair is structurally extended,
do not trade." If that's not literally true, the cell is providing
disinformation. If it IS true, the watchlist is wrong (too many pairs
arming at bad locations).

**Possible outcomes:**
1. Genuine market state — leave alone, accept "extended" is normal
   default and focus only on the rare FRESH cards
2. FCC-SRL Pine threshold needs widening so PRIME/AT_ZONE fire more often
3. `gradeToStructExt` map needs adjusting (e.g. AT_CLOUD or IN_CLOUD
   should also count as FRESH)

**Dependencies:**
- 5+ trading days of `loc-history.json` data
- Visual verification of price location vs structure on 5 sample cards

**Estimated effort:** 30-60 min diagnostic; fix size depends on outcome.

---

## 🔴 Priority 16 — Investigate LOW CONF dominance across armed pairs

**Trigger:** Observed 2026-04-27 — most armed pairs showing
"LOW CONF" badge next to direction (LONG/SHORT). Almost no MED CONF
or HIGH CONF pairs visible.

**Scope:**
- Confirm what drives the CONF label — likely `tier` or `score` field
  in the UTCC alert payload. Trace the rendering logic in
  `armed-panel.js` to find the source field and threshold.
- Pull 5+ days of UTCC alert payloads from `utcc-alerts.json` and
  histogram the `tier` and `score` distributions.
- v3.0.0 stack landed 2026-04-26. Compare distributions before and
  after — has the new edge-triggered cadence shifted what gets
  classified as STRONG/PERFECT/EXCELLENT vs TRADE-READY?
- If thresholds need adjustment: input parameters in
  `ultimate-utcc.pine` (tierStrong/tierPerfect/tierExcellent score
  cutoffs).

**Why this matters:**
If LOW CONF is the new normal post-v3.0.0, the badge has lost
discriminating value — every card looks the same. Trader can no
longer use it to triage which alerts deserve attention.

**Possible outcomes:**
1. v3.0.0 edge-trigger correctly catches the moment quality drops below
   STRONG — LOW CONF dominance reflects current market regime, not a
   bug. Wait it out.
2. Score thresholds were calibrated for the old polling cadence and
   need lowering to match v3.0.0 behaviour.
3. The conf classification is correctly placed, but the satellite
   panel needs a visual filter to hide LOW CONF pairs by default.

**Dependencies:**
- 5+ days of post-v3.0.0 `utcc-alerts.json` data
- Score histogram analysis (can run in next session)

**Estimated effort:** 45 min diagnostic; threshold tweak ~10 min if
that's the answer.

---

## 🟡 Priority 17 — Phase 3b: armed panel filter chips + hidden counter

**Trigger:** After Priority 15 + 16 are diagnosed and quality tag data
has stabilised (5+ days of post-Pine-v3.0.0 enrichment).

**Scope:**
Full spec in `forex-command-centre/docs/PHASE_3B_HANDOFF.md`.

Three chips at top of armed panel:
- `Hide CONTESTED` (default ON — institutional protection)
- `Hide CAUTION` (default OFF)
- `Only PRIORITY` (default OFF, overrides hide flags when active)

Hidden counter chip always visible when filter is hiding pairs.
Format: `{n} CONTESTED hidden`. Click reveals temporarily.
Persistence: localStorage key `armed-quality-filters`.

**Why this matters:**
Today every armed card is visible regardless of quality tag. Once
quality data is reliable, the trader needs a way to default-hide
CONTESTED pairs (the institutional CONTESTED-is-likely-loss
hypothesis) while keeping a counter visible to maintain transparency.

**Why this is P2 not P1:**
Filter chips are pointless until quality tag distribution is
representative. Today's data is too sparse and CAUTION-dominated
to make hide/show decisions meaningful.

**Dependencies:**
- Quality tag data validated across ~150-200 enrichment events
- Decision: Hide CONTESTED default ON or OFF for first week?
- CSS classes already shipped in v1.15.0. Pure JS wiring.

**Estimated effort:** ~80 lines of edits, single session, low risk.

---

## 🟡 Priority 18 — Phase 3c: Intelligence Hub calibration tabs

**Trigger:** ~5 trading days of `loc-history.json` data (~300+ enrichment
events) accumulated post-FCC-SRL v2.0.0 deploy.

**Scope:**
Full spec in `forex-command-centre/docs/PHASE_3B_HANDOFF.md`.

Add to `forex-command-centre/src/arm-history-dashboard.html` (currently
unversioned 2265 lines). Add version banner first, then bump to v1.1.0.

NEW TAB — **Sweep Risk Calibration:**
- Grade distribution chart (LOW/MED/HIGH counts over 7d/30d/90d)
- Per-asset-class breakdown table
- Auto-calibration tips ("Your MED/HIGH ratio is X% — tighten
  magnetThreshAtr from 2.0 to Y")

NEW TAB — **Frequency × Sweep Matrix:**
- 2D heatmap: weekly signal count (Y: 1, 2, 3+) × sweep risk
  (X: LOW, MED, HIGH)
- Each cell shows count of arms in that quadrant
- Win-rate cell value deferred to Phase 3d (depends on journal
  outcome logging)

ENHANCE existing **Location Calibration tab:**
- Add `sweep_risk` column to grade distribution table
- New cross-tab filter: "show only pairs where sweep_risk = HIGH"
- Sparkline per pair showing 7-day sweep risk trend

**Why this matters:**
Without calibration tabs, the threshold inputs in FCC-SRL Pine have
no feedback loop. Operator has to eyeball "did sweep risk feel
right" without aggregate distribution data. Calibration tabs make
the feedback loop visible and the auto-tips make it actionable.

**Why this is P2 not P1:**
Building calibration UI without calibration data renders empty
charts. Need ~300+ events accumulated first.

**Dependencies:**
- Priority 15 (structExt) and 16 (LOW CONF) diagnostics ideally
  resolved first — if either uncovers a calibration issue at the
  Pine layer, threshold tweaks may need to happen before Phase 3c
  measures distributions
- 5+ trading days of post-FCC-SRL-v2.0.0 enrichment data
- Verify existing endpoints `/loc-history`, `/bias-history`,
  `/location-history` provide rolling window aggregates; extend
  server only if necessary

**Calibration plan post-build:**

| Pine input        | Default | Adjust if...                                  |
|-------------------|---------|-----------------------------------------------|
| `magnetThreshAtr` | 2.0     | LOW > 80% → 1.5; HIGH > 25% → 2.5            |
| `sweepLowMax`     | 1       | If 1 magnet harmless → raise to 2          |
| `sweepMedMax`     | 2       | If MED catching too many → lower to 1      |
| `adxThresh`       | 20      | If ADX < 20 frequently → 18 (FX ranges)    |

Target distribution: LOW 55-65% / MED 25-35% / HIGH 5-15%.

**Estimated effort:** ~400-600 lines across HTML + possibly server.
Dedicated session.

---

## 🟢 Priority 19 — ZONE cell v1.16.1 deploy verification (one-shot)

**Trigger:** Immediately after deploying commit `5adf719` to live
`/mnt/user/appdata/nginx/www/`.

**Scope:**
Single visual verification on any armed pair card. ZONE cell should
show two lines:
- Top: `ARMED: HOT` (or OPTIMAL/ACCEPTABLE/EXTENDED depending on alert)
  in small muted text
- Bottom: live state (em-dash if Entry Monitor inactive, or grade if active)

If cell still shows three lines or em-dash on top, v1.16.1 didn't
deploy or browser cache is stale.

**Why this is in TODO at all:**
Just a checkbox so the bug fix is acknowledged as verified. Will be
moved to Closed audit trail after first confirmation.

**Estimated effort:** 30 seconds.

---

## Closed — for audit trail

### 2026-04-21 — Stale calendar.json in nginx webroot
- **Discovered during:** MDI Phase 3 deployment
- **Symptom:** FCC's `isNewsSafeToTrade()` gate reading 70-day-old data
- **Root cause:** FF scraper wrote to `src/calendar.json` but nothing
  copied to nginx webroot
- **Fix:**
  - One-off: `cp src/calendar.json nginx/www/calendar.json`
  - Permanent: appended `cp` line to `forex-calendar-update` User Script
- **Prevention:** handled by Priority 1 (Scraper Health Monitoring)

### 2026-04-21 — MDI matcher calendar path wrong
- **Discovered during:** MDI Phase 3 first production runs
- **Symptom:** Matcher logged "calendar file empty or missing" every minute
- **Root cause:** v1.0.0 assumed calendar lives at
  `trading-state/data/calendar.json`; actual path is
  `forex-command-centre/src/calendar.json`
- **Fix:** v1.0.1 patches the CALENDAR_FILE constant

---

## How to use this file

- Anything deferred gets added here IMMEDIATELY when deferred, not "when
  convenient"
- When work starts, move item to a "In Progress" section (create as needed)
- When work completes, move to "Closed" with date + summary
- Never delete closed items — they're the audit trail for why decisions
  were made

Per Risk Committee principle: *silent spec drift is the enemy*. If it's
not written down, it's drift.
