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

## 🟡 Priority 2 — MDI scraper v1.0.3 (quality fixes)

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

## 🟡 Priority 3 — MDI Phase 3 UI analysis section

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

## 🟢 Priority 4 — Calendar path consolidation

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

## 🟢 Priority 5 — Cron / User Script backup & version control

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
