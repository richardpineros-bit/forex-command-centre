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

## ✅ Priority 5 — MDI scraper v1.0.3 (quality fixes) — CLOSED 2026-04-30

**Status:** Code work was completed in commit `45efa3a` ("MDI scraper
v1.0.3: fix AUD HIKE false positive + BALANCED wording") and cron-backup
was updated in `80a3fe7` to call v1.0.3. The TODO entry was never moved
to Closed when the fix landed -- caught during 2026-04-30 cleanup pass.

**Fix shipped (per v1.0.3 source comments):**
- AUD HIKE false positive: new `extract_summary_window()` helper anchors
  on "last recorded at" phrase to scope HIKE/CUT/HOLD detection to the
  current-meeting summary block (~600 chars forward / 400 back), avoiding
  past-tense "raised" matches in historical context prose. Fail-closed:
  if anchor absent, last_change stays None.
- HOLD priority bug fix: v1.0.2 had broken priority logic claiming
  "HOLD > HIKE/CUT" but actually firing HIKE first. Rewritten so HOLD
  always wins when present (HOLD language is current-meeting-specific).
- BALANCED verdict wording: "balanced - full news impact" (sounded like
  a price-direction prediction) rewritten to "balanced - no macro
  override" -- accurate to MDI's actual role as a news gate dampener.

**Verification still required by operator:**
1. Confirm cron is calling v1.0.3 on Unraid:
   `crontab -l | grep mdi` should reference v1.0.3 (or the User Script
   wrapper that calls v1.0.3).
2. Observe next AUD policy reading on the MDI page in Intel Hub: should
   reflect actual RBA stance (currently on hold/cutting), not HIKE.

**Original entry retained for audit trail:**

~~Trigger: After ~1 week of MDI scraper runs confirms the AUD HIKE
pattern is persistent (not a one-off).~~

~~Scope:~~

~~1. AUD HIKE false positive. RBA has been on hold/cutting but v1.0.2
   consistently flags AUD as HIKE. Prose parser in `parse_policy_page()`
   likely matching past-tense "raised" in historical context commentary
   rather than current-meeting action.~~

~~2. "Full news impact" wording. The BALANCED-state text on MDI badges
   reads as if MDI is predicting price direction.~~

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

## ✅ Priority 10 — Calendar path consolidation — CLOSED 2026-04-30

**Shipped:** Disk cleanup done by operator on Unraid. Git tracking
follow-up committed in `959238a` ("P10: remove stale calendar.json
copies (backend/src + config)").

**What was removed:**
- `/mnt/user/appdata/forex-command-centre/backend/src/calendar.json`
  (1,534 lines deleted from git)
- `/mnt/user/appdata/forex-command-centre/config/calendar.json`
  (1,310 lines deleted from git)
- `/mnt/user/appdata/nginx/www-backup-20260212_152919/` (whole dir,
  not git-tracked, disk-only delete)

**Live source of truth confirmed working:**
- Scraper writes to: `/mnt/user/appdata/forex-command-centre/src/calendar.json`
- Scraper backs up to: `/mnt/user/appdata/forex-command-centre/data/calendar.json`
- User Script copies to: `/mnt/user/appdata/nginx/www/calendar.json` (webroot)
- MDI matcher reads: `/mnt/user/appdata/forex-command-centre/src/calendar.json`

**Deferred to P1 (Scraper Health Monitoring):**
Longer-term consolidation of all scraper outputs to
`/mnt/user/appdata/trading-state/data/` (so every scraper uses the
same pattern -- currently only FF/TE scrapers are odd ones out).
Naturally fits within P1 scope.

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

## ✅ Priority 12 — Intel Hub OB Tier 2: trapped-crowd analysis — CLOSED 2026-05-02

**Status:** Shipped via Myfxbook scraper v1.1.0 + `arm-history-dashboard.html`
Status column. Option C (recommended path) implemented as scoped.

**What shipped:**
- `myfxbook_sentiment_scraper_v1.1.0.py` — adds best-effort Oanda
  `/v3/accounts/{ACCOUNT}/pricing` call after Myfxbook logout. Output
  JSON gains top-level `current_prices: {pair: mid, ...}` block.
  History entries also carry `current_prices` for back-testing later.
- Fail-open on enrichment data: missing `OANDA_API_KEY` /
  `OANDA_ACCOUNT_ID` env vars OR Oanda API failure leaves
  `current_prices: {}` with sentiment data intact.
- `pair_to_oanda` mapping with overrides (`WTICOUSD → WTICO_USD`,
  `BCOUSD → BCO_USD`) and explicit skip set (`BTCUSD` — Oanda v20
  standard accounts don't trade BTC; including it would fail the entire
  batch pricing call).
- `arm-history-dashboard.html` Latest Snapshot table — new **Status**
  column between Signal and Positions L/S. Computes per-pair status
  client-side from `latest.current_prices[p]` vs `e.avg_long_price` /
  `e.avg_short_price`:
  - `TRAPPED SHORT` (amber) — price > avg_short + tol only. Bullish bias.
  - `TRAPPED LONG` (amber) — price < avg_long - tol only. Bearish bias.
  - `MIXED` (grey) — both sides trapped. No clear edge.
  - `IN PROFIT` (muted) — both sides comfortable. Crowd has momentum.
  - `—` for thin-sample, missing prices, or missing avg entry data.
- Tolerance: `max(price * 0.001, 0.0001)` — 0.1% with absolute floor.

**Deploy notes (operator):**
- New file path requires User Script schedule update (v1.0.1 → v1.1.0)
- Cron environment must export `OANDA_API_KEY`, `OANDA_ACCOUNT_ID`
- v1.0.1 retained for rollback; remove after 24h of clean v1.1.0 cycles

**Acknowledged limitation:** 4-hour staleness — Status reflects the
crowd at last cron run, not real-time. Acceptable for Intel Hub
historical view; not suitable for live armed-panel integration.
Follow-up Tier 2.5 (Option B — `/pricing/latest` endpoint) only if
this proves valuable.

**No change to:** alert server, armed panel, live trading gates.

---

## (Closed below — original P12 spec retained for audit)

## 🟡 Priority 12 — Intel Hub OB Tier 2: trapped-crowd analysis (original spec)

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

## ✅ Priority 14 — Weekly frequency week-boundary fix (AEST alignment) — CLOSED 2026-04-30

**Shipped:** Alert Server v3.0.1 commit `a15c7fe`.

**What was done:**
- New `getSydneyOffsetMs(date)` helper resolves Sydney offset for any
  date using `Intl.DateTimeFormat` with timeZone `Australia/Sydney`.
  Returns 11h during AEDT (UTC+11), 10h during AEST (UTC+10) -- DST
  handled automatically. AEST fallback if Intl unavailable.
- `getPairSignalCounts()` now shifts `now` into Sydney frame, computes
  Monday 00:00 in the Sydney calendar, then shifts back to true UTC for
  filtering arm-history events.
- Decision: NOT a hard-coded constant (recommended in original TODO).
  Single hard-coded offset would be off by 1 hour for half the year due
  to DST. Intl-based approach is still single-operator (locked to
  Australia/Sydney) but correct year-round. Net same effort.

**Verification done:**
- AEST Monday morning Sydney scenario (Sun 23:00 UTC, Apr 26 2026):
  weekStart = Sun 14:00 UTC = Mon 00:00 Sydney. Pass.
- AEST late Sunday Sydney scenario (Sun 13:00 UTC, Apr 26 2026):
  weekStart = previous Mon 14:00 UTC. Pass.
- AEDT Monday morning Sydney scenario (Sun 22:00 UTC, Feb 8 2026):
  weekStart = Sun 13:00 UTC = Mon 00:00 Sydney AEDT. Pass.

**Original entry retained for audit trail:**

~~Trigger: After v3.0.0 has run for 2+ weeks, if `weekSignalCount`
values still feel "way off" on Monday/Tuesday cards.~~

~~Recommended: hard-code AEST as a constant `WEEK_START_OFFSET_HOURS`.~~
~~(Implemented dynamically via Intl API instead -- handles AEDT correctly.)~~

---

## ✅ Priority 15 — STRUCT EXT epidemic — DIAGNOSED 2026-05-02

**Status:** Diagnostic complete. Action item is Pine recalibration on
TradingView (operator-side, not committable in repo).

**Diagnostic data** (1121 events, 7 days, via
`scripts/diagnostics/diagnostic_p15_p16_v1.0.1.sh`):
- Final structExt: **94.5% EXTENDED / 5.5% FRESH** (epidemic confirmed)
- Grade distribution: PRIME 5.4%, AT_ZONE 16.1%, BREAKOUT_RETEST 11.5%
  (FRESH-eligible total: 32.9% — grade map is fine)
- Sweep risk distribution: HIGH 56.2% / MED 27.9% / LOW 15.9%
  (vs target LOW 55-65% / MED 25-35% / HIGH 5-15%)
- Sweep override impact on FRESH grades: 83% downgraded
  (209 by HIGH, 99 by MEDIUM, 62 preserved by LOW)

**Root cause:** Sweep risk classifier severely mis-calibrated. Default
`sweepLowMax=1` and `sweepMedMax=2` are too tight for FX, where most
pairs have multiple S/R levels within 2 ATR.

**Action — Pine recalibration on TradingView (operator-side):**
- FX / Indices / Bonds: `sweepLowMax` 1 → 2; `sweepMedMax` 2 → 4
- Energy / Crypto: same sweepMax tweaks + `magnetThreshAtr` 2.0 → 1.5
- Keep `magnetThreshAtr` at 2.0 for FX

**What we did NOT change:**
- `gradeToStructExt()` map in alert server is fine — leave alone.
- Per-asset profiles for FCC-SRL deferred to Phase 3c calibration UI.

**Cross-reference:** Closes related concern in P16 — see below.

---

## ✅ Priority 16 — LOW CONF dominance — DIAGNOSED 2026-05-02 (linked to P15)

**Status:** Resolved by P15 diagnosis. Not an independent problem.

**Original hypothesis (incorrect):** LOW CONF driven by `tier`/`score` in
UTCC alert payload.

**Actual mechanics** (per `armed-panel.js` lines 510-575):
CONF label is driven by 4-input satellite alignment score, not UTCC tier:
- News bias ± 1
- IG sentiment (contrarian) ± 1
- **Structure (structExt FRESH=+1, EXTENDED=-1)**
- Oanda order book ± 1
- Thresholds: HIGH ≥ 3, MED ≥ 1, LOW ≤ 0

**Why this links to P15:** With structExt EXTENDED 94.5% of the time,
the structure satellite contributes -1 in 94.5% of cases. HIGH CONF
mathematically requires structExt = FRESH. Ceiling on HIGH CONF
frequency is 5.5% regardless of any other satellite behaviour.

**Conclusion:** Fix sweep_risk calibration (P15 action) and LOW CONF
dominance resolves automatically. No independent action needed.

**TODO P16 wording about tier/score thresholds in `ultimate-utcc.pine`
input parameters is wrong** — those control UTCC arming threshold,
not the CONF badge. Leaving the original entry below for audit trail
but the diagnosis above is the correct one.

~~Original entry retained for audit:~~

~~Trigger: Observed 2026-04-27 — most armed pairs showing
"LOW CONF" badge next to direction (LONG/SHORT). Almost no MED CONF
or HIGH CONF pairs visible. Confirm what drives the CONF label —
likely `tier` or `score` field in the UTCC alert payload.~~

---

## ✅ Priority 17 — Phase 3b: armed panel filter chips + hidden counter — CLOSED 2026-05-02

**Status:** Shipped as `armed-panel.js` v1.18.0.

**What shipped:**
- Three filter chips at top of armed panel (rendered only when at
  least one armed pair has a `qualityTag` — avoids visual noise on
  legacy/empty state):
  - `Hide CONTESTED` (default ON — institutional protection per
    CONTESTED-is-likely-loss hypothesis)
  - `Hide CAUTION` (default OFF)
  - `Only PRIORITY` (default OFF, overrides hide flags when active)
- Hidden counter chip(s) — ALWAYS VISIBLE when filter is hiding pairs.
  Format: `{n} CONTESTED hidden` / `{n} CAUTION hidden` /
  `{n} non-PRIORITY hidden` (when onlyPriority is on).
- One-cycle reveal: clicking the hidden counter chip bypasses the
  filter for exactly one render. Next refresh re-applies.
- Persistence: localStorage key `armed-quality-filters` (synchronous,
  no server round-trip — these are personal display preferences).
- Filter applied inside `renderArmedState()` after `_dismissedPairs`
  filter, before tier/sort logic — tier counts and section headers
  reflect filtered set.
- Backward compat: pairs with `qualityTag = null/undefined` are NEVER
  filtered. Missing data = always shown.
- Keyboard accessibility: Enter / Space on focused chip toggles it.

**Diagnostic context (P15+P16 findings, 2026-05-02):**
With current Pine sweep_risk mis-calibration (HIGH 56% vs target 5-15%),
CONTESTED tag dominates the universe. The hide-by-default behaviour is
essential trader protection until Pine thresholds are recalibrated
(see P15 + P18 calibration plan).

**Code location:**
- New helpers: `loadFilters`, `saveFilters`, `applyQualityFilters`,
  `countHiddenByTag`, `buildFilterBarHtml`, `toggleFilter`,
  `revealHiddenOnce` (lines 151-280 of `armed-panel.js`)
- Filter state: `_qualityFilters`, `_revealOnce`,
  `_pairsBeforeQualityFilter` (lines 37-46)
- Click delegation on `listEl` with keyboard fallback
- CSS classes already shipped in v1.15.0
  (`.armed-filter-bar`, `.armed-filter-chip`, `.hidden-counter-chip`)

---

## ✅ Priority 18 — Phase 3c: Intelligence Hub calibration tabs — CLOSED 2026-05-02

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

| Pine input        | Default | Adjust if...                                                |
|-------------------|---------|-------------------------------------------------------------|
| `magnetThreshAtr` | 2.0     | LOW > 80% → **2.5** (catch more); HIGH > 25% → **1.5** (catch fewer) |
| `sweepLowMax`     | 1       | If 1-2 magnets harmless → raise to 2 (more pairs stay LOW)  |
| `sweepMedMax`     | 2       | If HIGH > 25% → raise to 3 or 4 (require more magnets for HIGH) |
| `adxThresh`       | 20      | If ADX < 20 frequently → 18 (FX ranges)                     |

**Direction note (corrected 2026-05-02 per FCC-SRL v3.0.0 source review):**
`magnetThreshAtr` = ATR distance within which a magnet "counts". Larger
threshold = more magnets in scope = more HIGH classification. Earlier
calibration table direction was inverted; the table above is the
mechanically correct version.

Target distribution: LOW 55-65% / MED 25-35% / HIGH 5-15%.

**Diagnostic finding 2026-05-02 (P15+P16 investigation, 1121 events,
7-day window):**
- Final structExt: 94.5% EXTENDED, 5.5% FRESH (epidemic confirmed)
- Sweep risk distribution: HIGH 56.2% / MED 27.9% / LOW 15.9% (vs target)
- Grade map is fine (32.9% FRESH-eligible from grade alone)
- Sweep risk override kills 83% of FRESH grades
- Per-asset class: ENERGY 2.8% FRESH, CRYPTO 3.3% FRESH (worst)
- Recommended FX/Indices/Bonds tuning: sweepLowMax 1→2, sweepMedMax 2→4
- Recommended Energy/Crypto: magnetThreshAtr 2.0→1.5 + same sweepMax tweaks
- Pine changes are TradingView-side, must be applied on each indicator instance

**Estimated effort:** ~400-600 lines across HTML + possibly server.
Dedicated session.

**CLOSED 2026-05-02 — what shipped:**

`arm-history-dashboard.html`: 2265 → 3037 lines (+772, +34%) across four
chunked commits.

- v1.0.0: version banner baseline (file was previously unversioned)
- v1.0.1: NEW TAB **Sweep Risk Calibration** — grade distribution chart
  (actual vs target 60/30/10), per asset class breakdown with deviation
  flags, severity-coded auto-calibration tips. Range filter 7d/30d/90d/All.
- v1.0.2: NEW TAB **Frequency × Sweep Matrix** — 3×3 cell grid (frequency
  bins × sweep tiers) showing pair allocation by Quality Tag. Client-side
  mirror of server `computeQualityTag()`. Drilldown chip view per tag.
- v1.1.0: **Location Calibration** enhancements — sweep risk filter
  dropdown, LOW/MED/HIGH columns in grade distribution table (HIGH
  highlighted red on quality grades when >25%), per-pair 7-day sweep
  trend sparklines (categorical dots, not lines), Sweep column added to
  raw events table.

Plus calibration enablement layer:

- **FCC-SRL v3.1.1** (Pine): per-asset-class magnet/sweep profiles
  replacing flat globals. Six profile groups (FX/METALS/ENERGY/INDICES/
  CRYPTO/BONDS). Defaults locked to recalibration analysis values.
  Webhook payload extended with `profile`, `profile_magnet_atr`,
  `profile_sweep_low`, `profile_sweep_med`. Chart label shows active
  profile values.
- **Alert Server v3.1.0**: captures profile fields from webhook, stores
  on `data.pairs[pair]` and appends to `location-history` events for
  per-profile analytics.
- Stale `fcc-sr-location.pine` (v1.0.0, no sweep logic) deleted as part
  of cleanup.

**Institutional decision documented in chat:** "Auto Calibration Tips"
section (concrete numeric recommendations) is retail-flavoured. Real
institutional tools show the metric + statistical context and let the
trader decide. Current tips section retained because it's already shipped,
but the pattern won't be carried into UTCC Calibration tab — see new
**Priority 22**.

**Operator deployment status (as of 2026-05-02):**
- Frontend: ready, needs `cp` to nginx webroot + hard refresh
- FCC-SRL Pine: needs paste into TradingView Pine Editor, save / republish
- Alert server: needs `cp` to trading-state + `docker restart`
- Pine recalibration: NOT applied yet (conservative path) — banner in
  new tabs makes pre-recalibration baseline explicit. Once Pine v3.1.1
  is deployed, defaults will apply automatically per asset class.

---

## ✅ Priority 19 — ZONE cell v1.16.1 deploy verification — SUPERSEDED 2026-04-30

**Status:** Superseded by P20 (Option B). v1.16.1 was the dual-tier
display (ARMED line + LIVE line). v1.17.0 reverts to single-line
ARMED-only, so the v1.16.1 visual verification is no longer relevant.

**New post-deploy verification for v1.17.0:**
After deploying commits `a15c7fe` + `10afbf7` to live nginx webroot,
visual check on any armed pair card:
- ZONE cell should show ONE line only: `HOT`, `OPT`, `ACC`, `EXT`,
  or `-` (em-dash for muted/missing).
- Cell border colour conveys state: green = good (HOT/OPT), amber =
  ok (ACC), red = bad (EXT), grey = muted.
- Tooltip on hover shows: "HOT zone at arm time -- optimal entry,
  closest to edge" (or equivalent for other zones).

If the cell still shows two lines (ARMED line + live line), the
deploy didn't land or browser cache is stale. Hard refresh
(Ctrl+Shift+R, or clear cache on Android PWA).

---

## ✅ Priority 20 — Entry Monitor live grade never fires (decision required) — CLOSED 2026-04-30

**Decision:** Option B chosen. Shipped as armed-panel v1.17.0 commit `10afbf7`.

**Institutional reasoning:**
1. **Empirical:** Live line never fires (zero `entryZoneActive: true`
   events across 19+ armed pairs and a full session on 2026-04-27).
   Cell was permanent disinformation.
2. **Architectural:** The arm-time signal IS the institutional signal.
   It captures the moment the system said "this setup is valid here."
   Continuously re-grading an armed pair invites discretionary drift
   ("it's back to OPTIMAL on the live line, I can still enter") --
   exactly the FOMO behaviour the system exists to suppress.
3. **Authority Promotion Framework (P3):** Option A would loosen Entry
   Monitor threshold to make the cell light up. Retroactively tuning
   a threshold to satisfy a UI element is forbidden by P3.
4. **Separation of concerns:** Drift (am I in profit/loss on an open
   trade?) is execution-layer data and belongs elsewhere, not jammed
   into the entry-quality cell. Option C conflates two frameworks.
5. **Audit-grade design:** Confusing UI is worse than no UI.

**What shipped:**
- ZONE cell single-line, shows `ARMED: HOT/OPTIMAL/ACCEPTABLE/EXTENDED`
  from Pine alert payload only.
- State styling: HOT/OPTIMAL=good, ACCEPTABLE=ok, EXTENDED=bad.
- Removed `.sgrid-armed-line`, `.sgrid-live-line`, `.sgrid-value-dual`
  CSS (44 lines).
- Entry Monitor untouched in alert server -- still runs as diagnostic,
  just not surfaced in the satellite grid.

**Out of scope (left intentionally):**
- `buildIntelligenceStrip()` legacy expand-on-click strip still reads
  `entryZoneActive`. Cosmetic only since the badge never shows when
  Entry Monitor never fires. If revisited, separate ticket.

**Original entry retained for audit trail:**

~~Three options were on the table -- A: loosen threshold; B: drop live
line entirely; C: repurpose as drift indicator. Recommendation was
Option B based on empirical evidence + institutional principles.~~

---

## 🟢 Priority 21 — `.gitignore` audit for runtime state files

**Trigger:** Low-risk cleanup session. Not urgent but cheap to do.

**Discovered during:** P10 cleanup session 2026-04-30. `git status` on
Unraid surfaced 8 untracked runtime state files in
`forex-command-centre/data/` and `forex-command-centre/src/` that
look like operator-specific state, not source code:

- `forex-command-centre/data/armed-dismissed.json`
- `forex-command-centre/data/armed-exclude.json`
- `forex-command-centre/data/armed-validation.json`
- `forex-command-centre/data/armed-watchlist.json`
- `forex-command-centre/data/bias-history.json`
- `forex-command-centre/data/bias-history.json.lock`
- `forex-command-centre/data/dashboard-theme.json`
- `forex-command-centre/src/scraper_health.json`

Plus two scratch files in `backend/scripts/`:
- `forex-command-centre/backend/scripts/ig-sentiment-config.json`
- `forex-command-centre/backend/scripts/myfxbook_probe_v1.0.0.py`

**Risk if deferred:** Currently they sit untracked, so they don't
break anything. But a future `git add .` (or any glob-y add) commits
operator-specific runtime state into the public repo by mistake.
Worst case: operator-specific armed-watchlist or theme state gets
pushed to GitHub and lives in history forever.

**Scope:**
1. Audit existing `.gitignore` to see what's already excluded.
2. Add the 8+ files above (or a glob pattern like `data/*.json` if
   verified safe — i.e. nothing in `data/` is meant to be tracked).
3. Decide on the scratch files in `backend/scripts/`:
   - `ig-sentiment-config.json` — runtime config or template? If
     template, should be tracked. If operator-specific, gitignore.
   - `myfxbook_probe_v1.0.0.py` — looks like a one-off probe. Either
     commit it (if useful for posterity) or delete.
4. Verify nothing in the proposed exclusion list is actually meant
   to be source-of-truth tracked (e.g. a config schema).
5. Run `git status` after the change — should be clean.

**Dependencies:** None.

**Estimated effort:** ~10-15 min including audit + verification.

---

## 🟡 Priority 22 — UTCC Calibration Diagnostics tab (institutional shape)

**Trigger:** After FCC-SRL v3.1.1 + Alert Server v3.1.0 deploy verified
clean (Priority 18 follow-up). Don't stack new tabs on top of unverified
foundation.

**Scope:**

New tab in `arm-history-dashboard.html`: **UTCC Calibration**.

Bump `arm-history-dashboard.html` v1.1.0 → v1.2.0 (MINOR — new feature,
same overall purpose).

**Sections (institutional shape — NO pre-baked recommendations):**

1. **Score Distribution** — bar chart of arm-event scores in 5-point
   buckets (75-79, 80-84, 85-89, 90-94, 95+). Compare actual distribution
   to expected. If 70% of arms cluster at 75-79 (the threshold), the
   threshold is at the edge of noise — visible signal for the trader.
   Show with sample size and 30d / 90d / 1y comparison where data
   permits.

2. **Tier Pass-Through Rate** — funnel analysis. What % of TRADE_READY
   arms (score ≥ 75) escalate to STRONG (≥ 80), PERFECT (≥ 85),
   EXCELLENT (≥ 90). Healthy benchmark: 50% / 25% / 10%. Show with
   confidence intervals where sample size permits.

3. **Per-Criterion Failure Map** — factor attribution. Of the 5 UTCC
   criteria, which most often fails? If MTF alignment fails 60% of the
   time, the gate is dominating — possibly too strict for current regime.
   Show as stacked bar (each criterion's pass / fail / N-A breakdown)
   plus 30d trend per criterion.

4. **Per Asset Class breakdown** — same metrics split by asset class
   (FX / METALS / ENERGY / INDICES / CRYPTO / BONDS).

5. **Calibration Diagnostics (replaces 'Auto Calibration Tips' from
   sister Sweep Risk tab pattern):**
   - Each metric shown with **30d / 90d / 1y comparison + statistical
     significance flag** (basic χ² test or proportion-difference test;
     flag at p<0.05). Out of scope: full inferential framework. In
     scope: "30d differs from 90d significantly".
   - Each metric **split by regime** (Expansion / Rotation / Compression
     / Distribution / Transition) where regime data available. Win
     rates and pass-through rates are conditional on regime.
   - **Sample size + thin-sample warnings** (n<50 flagged on every
     section, mirrors Sweep Risk tab pattern).
   - **NO pre-baked recommendations.** Trader reads the data, makes
     their own calibration decision, applies on TradingView.

6. **Phase 3d preview placeholder** — when outcome data ships
   (Priority 23), this section becomes win rate / Sharpe / max DD per
   tier per asset class per regime. Until then, placeholder card
   reading "Awaiting Phase 3d outcome logging — see P23".

**Out of scope for this priority (deferred to P23 then a P22 follow-up):**

- Walk-forward validation widget (need outcome data)
- Calibration audit log (P24)
- Cohort lifecycle tracker (need outcome data + audit log)
- Drawdown contribution per tier (need outcome data)
- Sharpe / Calmar per tier (need outcome data)
- Risk-adjusted metrics generally (need outcome data)

**Why this matters:**

Distribution diagnostics are bread-and-butter quant work — every desk
monitors signal frequency distribution. If the alpha factory produces
70% of trades at threshold edge, that is a calibration problem. Pass-
through rate (tier funnel) is standard institutional reporting. Per-
criterion failure analysis is factor attribution. These sections give
the trader the data to reach their own calibration answer rather than
showing a pre-cooked recommendation.

**Why this is P2 not P1:**

The real edge sits in **win rate per tier per regime** — Section 6
above. Without outcome data (Priority 23), this tab measures distribution
and pass-through only, which is second-order signal. Still worth shipping
as Pass 1, but Pass 2 with outcome data is where it earns its institutional
keep.

**Why no auto-tips:**

Pre-baked recommendations look helpful but they hide the reasoning.
Real institutional tools show the metric, the historical trend, the
sample size, the confidence interval, and let the human (or model
committee) decide. The retail trap is to surface answers; the
institutional discipline is to surface evidence. Risk Engineer principle:
the human is the circuit breaker, and the circuit breaker needs to see
the raw evidence — not the system's interpretation of it.

**Dependencies:**

- P18 (Phase 3c) — CLOSED. P22 builds on the same arm-history-dashboard
  file and reuses the cached `_locHistoryAll` pattern.
- P15 (structExt) — CLOSED. Pre-fix calibration baseline understood.
- 5+ trading days of post-FCC-SRL-v3.1.1 events accumulated, otherwise
  charts will look thin.
- Decision needed: where does regime classification per arm event come
  from? Currently `regime` is computed at arm time and stored in
  `arm-history.json` payload. Verify this is captured before building
  the per-regime section, otherwise that section becomes empty.

**Estimated effort:**

- New tab markup + filter row: ~80 lines
- Five render functions (skip Section 6, leave placeholder): ~300 lines
- Statistical significance helpers (chi-squared / proportion test): ~80
  lines
- Wire into existing arm-history-dashboard infrastructure: minimal
- **Total: ~500 lines, 1 dedicated session**

**Pass 2 (after P23 ships):** add Section 6 (win rate / Sharpe / max DD
per tier per asset class per regime). Estimated +200 lines, 0.5
session.

---

## 🟡 Priority 23 — Phase 3d: trade outcome logging tied to arm events

**Trigger:** After P22 Pass 1 ships, OR earlier if P22 is deferred. The
two priorities are independent in the sense that P22 Pass 1 is useful
without outcomes, but **the institutional edge requires outcomes**.

**Scope:**

End-to-end pipeline that ties closed trades back to the arm event that
triggered them, so per-tier / per-profile / per-regime win rate and
risk-adjusted metrics become computable.

**Components:**

1. **Trade journal → arm-event linkage.** When a trade is logged in
   `trades.json`, capture the originating `armedAt` timestamp + tier +
   qualityTag + asset class + regime + active Pine profile snapshot.
   Either the journal autofill grabs this from `/state` at journal time,
   or the alert server stamps a `trade_id` onto the armed pair when the
   trade fires (preferred — fewer race conditions).

2. **Outcome capture.** When a trade closes (via Oanda fill or manual
   journal close), record:
   - PnL in account currency
   - R-multiple (PnL / risked amount)
   - Duration (arm timestamp to close timestamp)
   - Closure reason (TP / SL / manual close / breakeven exit / time stop)
   - Drawdown peak (max adverse excursion / risked amount)

3. **Aggregation endpoint.** New alert server endpoint
   `/trade-outcomes?range=30d&tier=PRIORITY&asset_class=FX&regime=Expansion`
   returning aggregated metrics per cohort:
   - Sample size (n)
   - Win rate (% wins)
   - Average R-multiple
   - Sharpe (rolling, account-currency PnL)
   - Max drawdown contribution
   - Average time-in-trade

4. **Schema versioning.** Existing `trades.json` schema bumps minor
   version. Migration: pre-Phase-3d trades have null linkage fields.
   They get filtered out of cohort analysis, not retroactively
   reconstructed.

**Why this matters:**

Win rate without arm-event linkage is a black hole. You can see "PRIME
tier won 60% last month" only if every trade was tagged at arm time
with what tier it was in. Currently, the Quality Tag of an armed pair
is computed at arm time but isn't necessarily preserved in the trade
record — different code paths. This priority closes that gap.

**Why no shortcut:**

Could approximate the linkage by joining trades to nearest arm event
by pair + timestamp window. **Don't.** Race conditions (re-arms,
disarms, stop-out-then-re-arm) make timestamp joining unreliable. A
trade fired between two arm events on the same pair within an hour
could be attributed to either. Explicit tagging at arm time is the
only audit-clean path.

**Risk Engineer concerns:**

- **Schema drift between journal and alert server.** If journal autofill
  reads from `/state` and stamps a trade with what's there at that
  moment, but `/state` updates between arm and trade fire, the snapshot
  is stale. Mitigation: alert server stamps the snapshot at arm time,
  not at journal time.
- **Manual journal entries.** If trader fills journal by hand without
  broker autofill, linkage is missing. Mitigation: journal autofill
  becomes recommended path; manual entries get a "linkage incomplete"
  flag and are excluded from cohort analysis with a visible counter
  ("12 trades excluded — manual entries pre-autofill").
- **Pine input changes mid-cohort.** If Pine inputs change while a
  cohort is being measured, that cohort's data straddles two
  calibrations. Hence Priority 24 — input change audit log — should
  ship alongside this so the analysis layer can split cohorts at
  calibration boundaries.

**Dependencies:**

- P22 Pass 1 ideally shipped first (to prove the surface before adding
  data underneath).
- P24 (Pine input audit log) ideally ships in parallel — without it,
  cohort analysis can't honestly compare pre-vs-post calibration eras.
- Existing trade journal infrastructure (`trade-journal.js`,
  `journal-autofill.js`, `trades.json`) needs schema audit before
  changes — likely already has some fields we can repurpose.

**Estimated effort:**

- Server side (trade_id stamping, linkage capture, aggregation
  endpoint): ~200 lines
- Frontend (journal capture, autofill update): ~150 lines
- Schema migration + null-field handling: ~50 lines
- Cohort analysis JS for arm-history-dashboard P22 Pass 2: ~200 lines
- **Total: ~600 lines, 2 dedicated sessions**

**Validation gate before claiming done:**

Run a synthetic test trade through the full pipeline. Confirm:
1. Arm fires → `armedAt` + tier + profile captured
2. Trade fires → `trade_id` linked to arm event
3. Trade closes → outcome captured with R-multiple
4. `/trade-outcomes?tier=X` returns the trade in the right cohort

If any step is silent failure (most likely failure mode), the linkage
is broken and the data is poison.

---

## 🟡 Priority 24 — Pine input change audit log

**Trigger:** Before P22 Pass 2 (cohort analysis with outcome data).
Ideally before P22 Pass 1 too, as cheap insurance.

**Scope:**

Track every Pine input change to the indicators (Ultimate UTCC,
FCC-SRL) so calibration analysis can honestly split cohorts at
calibration boundaries.

**Why this is necessary:**

The current state of the system is that Pine input changes are made
on TradingView (per-chart settings), are not visible to the alert
server, are not logged anywhere, and are only inferable from git
commit history of the Pine source files (which captures DEFAULTS but
not per-chart overrides). When P23 ships and we start measuring "PRIME
tier won 60% over last 60 days", that 60-day window may straddle
calibration changes that materially shifted what "PRIME tier" even
means. Cohort analysis without this is statistically dishonest.

**Approach options (need decision before building):**

**Option (a): Pine writes input snapshot on every alert.** Add to every
TF_ARMED / TR_ARMED / location webhook payload a small block:
`pine_inputs: {tfT:62, trT:70, magnetThreshAtr:1.5, sweepLowMax:2,
sweepMedMax:4, ...}`. Alert server stores in arm-history /
location-history events. Cohort analysis reads from these. Heaviest
implementation but truest source.

**Option (b): Manual log.** New file `pine-input-log.json` on alert
server. Operator (you) appends an entry every time you change a Pine
input on TradingView, via a small frontend form or direct edit. Lighter
implementation but requires discipline. Risk: missed entries silently
break cohort analysis.

**Option (c): Hybrid.** Pine writes snapshot on first alert after
script reload (use `var` flag set on `barstate.isfirst`); subsequent
alerts skip the inputs block. Manual log captures intra-session
changes. Most complex; not recommended unless Option (a) overhead
proves real.

**Recommended:** Option (a). Operator-discipline-dependent solutions
(b, c) fail when operator is busy or distracted, which is exactly when
the system most needs to remain audit-clean. A 200-byte inputs block
on every webhook is cheap.

**Schema:**

Each arm-history / location-history event gains a `pine_inputs` field:

```json
{
  "pine_indicator": "FCC-SRL",
  "pine_version": "v3.1.1",
  "magnetThreshAtr": 1.5,
  "sweepLowMax": 2,
  "sweepMedMax": 4,
  "profile": "ENERGY"
}
```

Plus a parallel `utcc_inputs` block from Ultimate UTCC alerts:

```json
{
  "pine_indicator": "Ultimate UTCC",
  "pine_version": "v2.7.0",
  "tfT": 62,
  "trT": 70,
  "adxThresh": 20,
  "atrFilter": 80
}
```

**Deduplication:** No dedup at write time — every event captures its
inputs. Server-side or analysis-layer dedup if storage becomes an issue
(unlikely; Pine has small input surface, ~200 bytes per event).

**Cohort split logic (consumed by P22 / P23 analysis):**

When user requests `/trade-outcomes?range=60d&tier=PRIORITY`, the
endpoint also returns:
```json
{
  "calibration_eras": [
    {"start": "2026-04-15", "end": "2026-04-30", "magnetThreshAtr": 2.0},
    {"start": "2026-05-01", "end": "2026-05-15", "magnetThreshAtr": 1.5}
  ],
  "trades_per_era": [...],
  "warning": "Calibration changed mid-cohort. Per-era metrics shown."
}
```

UI shows each era as a separate vertical band on the win rate chart.

**Why this is P2 not P1:**

Cheap to add but only valuable once P23 ships. If we ship P22 Pass 1
without P24, the diagnostics tab works on a single calibration era and
this is fine — distribution metrics are time-local. The hazard begins
at P22 Pass 2 (cohort analysis). Ship P24 before then.

**Dependencies:**

- Decide Option (a) vs (b) vs (c) — recommend (a)
- Pine source edit on both Ultimate UTCC and FCC-SRL to inject inputs
  block into payload (~30 lines per indicator)
- Alert server: capture and store the new field (~20 lines)
- No frontend change needed for P24 itself; consumed by P22/P23.

**Estimated effort:** ~80 lines across two Pine files + alert server.
~2 hours of focused work.

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
