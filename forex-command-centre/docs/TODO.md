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
