## [Armed Panel v1.14.0] - 2026-04-22
### Institutional satellite grid — direction-aware 8-cell heatmap

**Problem statement:**
The armed-panel intelligence strip was a single-line text wall. Everything
had equal visual weight — ZONE, NEWS, IG, OB, MDI, ATR, STRUCT, FREQ all
rendered as inline coloured text separated by pipes. User had to *read*
each satellite to understand alignment; nothing could be absorbed at a
glance. Cross-pair comparison was impossible without eye-scanning each
row individually.

**Solution: institutional cross-pair grid.**
Replace the inline strip with a structured 8-cell grid on every armed
pair card. Each cell is a self-contained heatmap tile with label +
symbol + compact value + colour-coded background.

**Column order (left = most institutional weight):**
ZONE | STRUCT | MDI | OB | NEWS | IG | ATR | FREQ + playbook + chevron

Location and structure first (hardest edges), then flow/positioning
(MDI, OB), then macro context (NEWS, IG as contrarian), then conditions
(ATR, FREQ).

**Cell colour logic (two families):**

Directional cells (NEWS, IG, OB, MDI) flip palette based on LONG/SHORT:
- Green = aligned with trade direction
- Red   = opposed to trade direction
- Amber = neutral
- Grey  = missing / muted

Quality cells (ZONE, STRUCT, ATR, FREQ) use absolute scale:
- Green = ideal / fresh / optimal / healthy frequency
- Amber = acceptable / developing / caution
- Red   = extended / stale / poor / over-signalled
- Grey  = missing

**IG remains contrarian** — crowd AGAINST the trade direction = green
(fade signal), crowd WITH the trade = red (fade risk warning).

**MDI logic:** parses the verdict string (`XXX-strength` / `YYY-weakness`
etc.) against the base/quote currencies of the pair. DOMINANT + aligned
with trade direction → green. DOMINANT + opposed → red. LEANING →
amber. BALANCED → always muted/grey. MDI remains SOFT satellite —
display only, no gate authority. Tooltip preserves the disclaimer.

**Click-to-expand detail:** Every grid row ends with a chevron. Click
reveals the original text strip below with full-label values (SOFT
BULLISH, ALIGNED, etc.) for traders who want the verbose reading.
Tooltip on every cell still gives quick-hover detail without clicking.

**Responsive breakpoints:**
- >=900px desktop: 8 cols in a single row
- 600-899px tablet: 4 cols x 2 rows, playbook wraps to full width
- <600px phone: 2 cols x 4 rows, taller cells, larger text

**Tier grouping preserved:**
PRIME / STANDARD / DEGRADED section headers, sort order, and tier
assignment logic are untouched. DEGRADED tier pairs get reduced opacity
(0.72) and desaturated cells (filter: saturate(0.75)). PRIME tier gets
a subtle green-to-neutral gradient on the grid background.

**Files changed:**
- `src/js/armed-panel.js` v1.13.0 -> v1.14.0
  - New `buildSatelliteGrid(p, rowId)` function (~230 lines) after
    `buildIntelligenceStrip()`
  - New `window.toggleSgridDetail(detailId, btnEl)` global for chevron
    click handler
  - `buildRow()` modified to emit grid + collapsible detail wrapper
    around the legacy strip
- `src/css/dashboard.css` +189 lines
  - `.armed-satellite-grid`, `.sgrid-cell`, `.sgrid-{dir|qual}-{good|ok|bad|muted}`,
    `.sgrid-playbook`, `.sgrid-expand`, `.sgrid-chevron`,
    `.armed-satellite-detail`
  - Responsive breakpoints at 900px and 600px
  - Rule hides legacy `.armed-intelligence-strip` when rendered inline
    as direct child of `.armed-pair-wrapper`; keeps it visible inside
    `.armed-satellite-detail` (click-to-expand)
- `src/index.html` cache-bust v=9 -> v=10 for armed-panel.js and dashboard.css

**No backend changes:** Pure frontend. Alert server, enrichment logic,
tier grouping, score computation, all gates — unchanged.

---

## [OB Source Migration: Oanda -> Myfxbook] - 2026-04-22
### Full replacement of retail order-book sentiment source

**Problem statement:**
Armed-panel OB satellite was showing "OB —" on most pairs. Probe
testing confirmed:

1. Oanda public GraphQL (labs-api.oanda.com) only supports ~12 FX
   majors. INTERNAL_ERROR on anything outside that list.
2. Oanda v20 REST positionBook/orderBook endpoints return 401 for
   Oanda Australia accounts (regional restriction, no workaround).
3. Further investigation uncovered there was no Oanda OB cron scheduled
   at all. customSchedule.cron had no entry. OB data on disk was only
   updating when the scraper was run manually. The "limited coverage"
   symptom masked a second unrelated problem: stale data across the
   whole file.

**Solution: source swap to Myfxbook Community Outlook official public API.**
Not an addition — a replacement. One retail crowd source in, one out.

**Why Myfxbook:**
- Richer data than Oanda or IG: long/short %, position counts,
  volumes, AND average entry prices (enables trapped-crowd analysis
  in Intel Hub — future upside).
- Covers 33/33 UTCC pairs (31 direct + 2 aliases: USOIL->WTICOUSD,
  XBRUSD->BCOUSD).
- Official documented API, no HTML-scraping fragility.
- Free account, stdlib-only client (no pip dependencies).

**Files added:**

myfxbook_sentiment_scraper_v1.0.1.py (NEW, 448 lines):
  - urllib-based client (v1.0.0 used requests and hit a session-token
    URL-encoding bug — see v1.0.1 fix note below).
  - Login -> fetch -> logout per run, session never persisted.
  - Fail-closed on: missing creds, login error, fetch error, invalid
    payload, network/parse errors.
  - Output path preserved as /mnt/user/appdata/trading-state/data/
    oanda-orderbook.json for drop-in compatibility (Option A: keep
    OB label in armed panel, zero frontend changes).
  - Schema preserved + 6 additive bonus fields: long_positions,
    short_positions, long_volume, short_volume, avg_long_price,
    avg_short_price.
  - Output includes "source": "myfxbook" for provenance auditing.
  - Thresholds identical to oanda/ig scrapers: STRONG >=70%,
    SOFT >=60%, <60% = NEUTRAL. Contrarian signal logic unchanged.

myfxbook-config.json.template (NEW):
  - Committed template. Live myfxbook-config.json gitignored at root
    .gitignore (new entry added).

**Files removed:**

- oanda_orderbook_scraper.py (v3.0.0, 239 lines)
- oanda-scraper-config.json.template
- myfxbook_sentiment_scraper_v1.0.0.py (superseded by v1.0.1 before
  reaching production; the session-token bug in v1.0.0 was only
  exposed by a live Myfxbook session that happened to contain '/';
  no working production runs existed to preserve)

**v1.0.0 -> v1.0.1 fix (for the record):**

v1.0.0 used requests.Session().get(url, params={'session': token}).
Myfxbook session tokens can contain URL-reserved characters (observed
case: session starting with '/'). The requests library URL-encoded
the token on the wire, turning '/' into '%2F'. Myfxbook's server
then decoded and compared the decoded value against its stored
session, producing "Invalid session" on the very next call after a
successful login.

Fix: drop requests, use urllib.request directly with f-string URL
construction. The session token is embedded AS-IS, matching the
probe pattern that was proven to work. Stdlib only, no pip deps.

**Deployment completed:**

  1. Probe confirmed 33/33 coverage end-to-end.
  2. v1.0.1 dry-run on Unraid: 33/33 fetched, all 6 bonus fields
     populated, clean login + logout.
  3. v1.0.1 live run: wrote oanda-orderbook.json v1.0.1 source:myfxbook
     33 pairs, history file appended cleanly (68 old Oanda entries
     preserved for continuity).
  4. Alert server endpoint /oanda-book/latest returns v1.0.1 data
     unchanged — no alert-server code changes were needed.
  5. Armed panel hard-refreshed; OB satellites now populate for every
     pair in the UTCC universe, confirmed visually (BTCUSD NEUTRAL,
     NZDCHF STRONG BEARISH with 81L/19S, AUDCHF SOFT BEARISH etc).
  6. User Scripts cron added at 0 */4 * * *:
       /boot/config/plugins/user.scripts/scripts/
         myfxbook_sentiment_scraper/script
     Content: python3 path/to/myfxbook_sentiment_scraper_v1.0.1.py
              --unraid

**Known data-quality note (not blocking, future enhancement):**

Myfxbook exposes extremely thin samples for WTICOUSD and BCOUSD (USOIL
and XBRUSD, single-digit position counts vs 69k for EURUSD). Current
scraper emits STRONG labels on these regardless. Future v1.1.0 should
add a minimum-positions filter that forces NEUTRAL below a threshold
(suggested: 100 total positions). Not filed yet.

---

## [v5.17.1 / MDI Phase 3 path patch] - 2026-04-21
### Fix: matcher calendar path (v1.0.0 -> v1.0.1)

**Issue observed on first production run:**
Matcher cron was firing every minute correctly but every run logged:
  WARNING: calendar file empty or missing at
  /mnt/user/appdata/trading-state/data/calendar.json
Capture phase ran but never found events (zero captured over 30+ runs).

**Root cause investigation uncovered two separate problems:**

1. **Matcher path wrong (this fix)**
   Phase 3 build assumed calendar.json would live in the shared
   trading-state/data directory alongside MDI, IG sentiment, OB data.
   Actual reality: the FF calendar scraper writes to
     /mnt/user/appdata/forex-command-centre/src/calendar.json
   (DEFAULT_OUT constant in forex_calendar_scraper.py). This was a
   pre-existing pattern predating my Phase 3 assumption.

2. **Nginx webroot calendar was 70 days stale (fixed separately)**
   A completely unrelated issue surfaced during investigation:
     /mnt/user/appdata/nginx/www/calendar.json last modified 2026-02-11
   The FF scraper wrote fresh data every 6h to src/calendar.json but
   nothing copied that output into the nginx webroot. The PWA's
   isNewsSafeToTrade() function reads ./calendar.json through nginx,
   meaning the live news gate had been operating on 70-day-old data.
   User's manual news-awareness discipline had been silently
   compensating.

   Fix (applied directly on Unraid, not via git):
     a. One-off: cp src/calendar.json to nginx/www/calendar.json
     b. Permanent: appended cp line to forex-calendar-update User
        Script so every 6h scrape refreshes the webroot copy.

**Changes in this commit (matcher path fix):**

macro_event_matcher_v1.0.1.py (NEW, 793 lines, v1.0.0 retained):
  - CALENDAR_FILE constant changed:
      FROM: /mnt/user/appdata/trading-state/data/calendar.json (missing)
      TO:   /mnt/user/appdata/forex-command-centre/src/calendar.json
  - No other logic changes. All classification, scoring, Oanda
    integration, fail-closed handling preserved intact.

  Unit tests: all 4 classification outcomes still pass (tests do
  not touch the file-read path so path change is a no-op for them;
  path correctness verified by assertion on the constant itself).

**Deployment on Unraid after git pull:**

  1. Verify v1.0.1 lands:
     ls forex-command-centre/backend/scripts/macro_event_matcher_v1.0.1.py
  2. Dry-run test:
     # env vars from trading-state container
     OANDA_API_KEY=$(docker exec trading-state printenv OANDA_API_KEY)
     OANDA_ACCOUNT_ID=$(docker exec trading-state printenv OANDA_ACCOUNT_ID)
     export OANDA_API_KEY OANDA_ACCOUNT_ID
     python3 forex-command-centre/backend/scripts/macro_event_matcher_v1.0.1.py --print
     # Expect: NO "calendar file empty or missing" warning
     # Expect: "Phase 1 (capture): N event(s) eligible" where N may be 0
     unset OANDA_API_KEY OANDA_ACCOUNT_ID
  3. Update User Script to point at v1.0.1:
     /boot/config/plugins/user.scripts/scripts/mdi_event_matcher/script
       ...macro_event_matcher_v1.0.0.py... -> ...macro_event_matcher_v1.0.1.py...
  4. Re-enable the schedule if previously disabled:
     echo "* * * * *" > /boot/config/plugins/user.scripts/scripts/mdi_event_matcher/schedule
     /etc/rc.d/rc.crond restart
  5. Tail the log and wait for the next High-impact event in window:
     tail -f /mnt/user/appdata/trading-state/data/event-matcher-cron.log

**Institutional note:**
v1.0.0 and v1.0.1 both retained in repo per versioning rule. Ops
history is intact: we can see exactly what assumption was wrong in
v1.0.0, why, and how v1.0.1 differs. No silent overwrites.

---

## [v5.17.0 / MDI Phase 3 backend] - 2026-04-21
### Feature: Event matcher + outcome classification (backend of 2)

Turns MDI from display-only theory into an evidence-based signal.
The Intel Hub counter starts accumulating toward its N>=30 unlock.

**Risk Committee principle at stake:**
> "New signals earn their weight through evidence, not assumption."

Without Phase 3, MDI is a permanent curiosity. With Phase 3, in 60-90
days of data collection you can decide whether to promote MDI from
SOFT to MEDIUM authority - or retire it if the edge is not real.

**Changes:**

`macro_event_matcher_v1.0.0.py` (NEW, 777 lines):

  Two-phase pipeline, both run every minute via cron:

  Phase 1 (capture):
    When a High/Critical calendar event is exactly 15min ahead
    (+/- 90sec tolerance), captures a record containing:
      * Event metadata
      * MDI snapshot for every pair affected by the news currency
      * Oanda baseline price for each affected pair
      * Oanda ATR14 on H4 for each affected pair
    Record saved with status: PENDING.

  Phase 2 (outcome):
    For each PENDING event, while T <= now <= T+60min, polls Oanda
    prices and tracks max deviation per pair. At T+4h, records final
    prices and classifies outcome per pair:
      * REACTED_AND_RESUMED - reaction >= 0.5 ATR AND final <= 0.3 ATR
                              (MDI hypothesis held)
      * SUSTAINED_REACTION  - final > 0.5 ATR
                              (news dominated, MDI wrong)
      * MIXED               - reaction >= 0.5 ATR, final 0.3-0.5 ATR
                              (partial absorption)
      * NO_REACTION         - reaction < 0.5 ATR
                              (non-event, excluded from hit rate)
      * INSUFFICIENT_DATA   - missing baseline/atr/final
                              (fail-closed)

  Classification thresholds are pre-committed constants:
    REACTION_THRESHOLD_ATR  = 0.5
    RESUMED_THRESHOLD_ATR   = 0.3
    SUSTAINED_THRESHOLD_ATR = 0.5
  If tuning is needed later, bump to v1.1.0 and re-classify history
  transparently in a new column - do NOT silently overwrite.

  Fail-closed across the board:
    - Missing OANDA_API_KEY / OANDA_ACCOUNT_ID -> exit 0 (do nothing)
    - Missing calendar.json -> capture skipped, outcomes proceed
    - Missing macro-dominance.json -> event captured with null MDI
    - Oanda API error -> pair skipped this run, retry next run
    - Clock drift: events captured >T-10min flagged LATE
    - Missing ATR at finalize time -> INSUFFICIENT_DATA

  Unit tests: 10/10 passing
    find_captureable_events filter + dedupe
    pairs_for_currency coverage
    build_event_id determinism
    All 4 classification outcomes + INSUFFICIENT_DATA edge case
    finalize_event waits correctly for T+4h

`apply_mdi_phase3_alert_server_patch_v1.0.0.py` (NEW, 312 lines):
  Byte-safe idempotent patcher for alert server. Same pattern as
  Phase 1 patcher. Includes mojibake detection, backup/restore,
  and marker-based idempotency check.

`forex-alert-server/index.js v2.15.0 -> v2.16.0`:
  Adds GET /macro-dominance/events endpoint with filters:
    ?status=COMPLETE|PENDING|ERROR
    ?threshold=DOMINANT|LEANING|BALANCED
    ?pair=CADJPY
    ?limit=N  (max 500, default 100)
  Returns events plus a stats block for Intel Hub unlock counter:
    stats.dominant_complete - drives the N/30 progress bar
    stats.complete / pending - total events captured
  Stale at 24h (matcher should run every minute - 24h silence is
  a concerning anomaly worth alerting on).

**Institutional guardrails preserved:**
  - MDI still SOFT authority: matcher does not modify pair score or
    any gate
  - Matcher is separable: can be killed/deleted without affecting
    anything else (scraper + alert server + UI all function without it)
  - Classification is deterministic and pre-committed: can't
    retroactively tune to make MDI look better
  - Three-state outcome (NO_REACTION excluded) prevents false
    validation when the news event was a non-event anyway

**Pending in Phase 3 UI (next commit, separate session):**
  - Intel Hub MDI tab analysis section unlocks at N>=30 dominant events
  - Hit rate breakdown: DOMINANT vs LEANING vs BALANCED
  - Recent events table (visible at all times for transparency)

**Deployment on Unraid (when ready):**
  1. git pull
  2. cp alert-server/index.js -> trading-state/index.js; docker restart
  3. curl localhost:3847/health  (verify v2.16.0)
  4. curl localhost:3847/macro-dominance/events
     (expect {ok:true, entries:[], note:'No events captured yet...'})
  5. Test matcher manually: python3 macro_event_matcher_v1.0.0.py --print
  6. Add cron: * * * * *  (every minute)
  7. Monitor first event captures. Expected cadence: ~5-15
     High-impact events per week during normal calendar.

---

## [v5.16.1 / MDI Phase 2 checkpoint 2] - 2026-04-21
### Feature: MDI news annotation + Intel Hub history tab (surfaces 4-6 of 6)

Second and final commit for MDI Phase 2. Completes the Phase 2 scope
defined in checkpoint 1.

**Changes in this commit:**

`news-impact.js` (+177 lines, 973 -> 1150):
  Added MDI cross-reference helpers. The critical institutional
  property: existing isNewsSafeToTrade() is NOT modified. New functions
  live alongside as pure read helpers.

  - fetchMDISnapshot() + 30-min refresh interval
  - MDI_DISCLAIMER constant: verbatim SOFT-authority text included
    in every annotation return so UI consumers cannot strip it
  - getMacroCrossReference(pair, newsCurrency):
      Pure lookup. Returns annotation object with:
        threshold, gap, verdict, newsLeg, dominantLeg,
        newsOnDominantSide, annotation (Option D phrasing:
        "brief reaction, trend likely resumes"), stale, disclaimer
      Handles 3 scenarios:
        * News on weaker leg + dominance: "brief reaction, trend resumes"
        * News on stronger leg + dominance: "aligns with dominant flow"
        * Balanced: "news will have full impact"
  - getNewsImpactWithMDI(pair, hoursAhead):
      Wraps isNewsSafeToTrade() and decorates the return with a
      .macro field. The .safe field is UNTOUCHED - callers MUST
      use that as the authoritative gate. The .macro field is
      additive display-only context.
  - window.MDI global exposing the helpers + DISCLAIMER

`arm-history-dashboard.html` (+299 lines, 1879 -> 2178):
  New "Macro Dominance" tab in Intel Hub.

  Banner: SOFT-authority disclaimer (amber, prominent) explicitly
  stating MDI does NOT affect pair score or modify any gate.

  Validation counter: "Hit-rate validation locked. Analysis
  activates at N >= 30 matched news events." Currently shows 0/30.
  Counter will advance as news events are captured alongside MDI
  snapshots (the mechanism for that is Phase 3, not this commit).

  Current Snapshot card:
    - 28-pair sortable table
    - Columns: Pair, Base score, Quote score, Gap (default sort),
      Tier (DOMINANT/LEANING/BALANCED), Verdict text
    - Colour-coded tier column, +/- coloured score cells
    - Fetches /macro-dominance/latest

  Gap Timeline card:
    - Per-pair selector (populated from snapshot)
    - Pure SVG line chart of gap over time, scaled 0-100
    - Horizontal reference lines at 30 (LEANING) and 60 (DOMINANT)
    - Dot markers colour-coded by threshold, with tooltip on hover
    - Legend for threshold colours
    - Fetches /macro-dominance/history?pair=X&limit=200

Institutional guardrails preserved:
  - isNewsSafeToTrade() UNCHANGED (verified by file diff)
  - MDI helpers are pure read operations, no side effects
  - SOFT-authority disclaimer in tab banner, annotation return,
    window.MDI.DISCLAIMER, and inline wherever data is surfaced
  - Fail-closed: missing MDI data -> annotation returns "unavailable"
    rather than a defaulted neutral value
  - Sample-size gate on analysis: 0/30 counter is locked until
    enough matched events accumulate
  - Separable: removing the MDI helpers, the CSS file, or the
    Intel Hub tab leaves the rest of the system functioning
    identically

**Phase 2 complete.** All 6 surfaces delivered across 2 commits.
Next work on MDI = Phase 3 (news-event to MDI-snapshot matcher that
populates the history with actual outcome data, enabling the N >= 30
validation) OR the unified Scraper Health Monitor (deferred item
from earlier).

Known observation flagged for v1.0.3:
  AUD scoring HIKE when RBA has been cutting. Prose parser may be
  catching past-tense 'raised' references in historical commentary.
  Will revisit after a few more scrape cycles to confirm pattern.

---

## [v5.16.0 / MDI Phase 2 checkpoint 1] - 2026-04-21
### Feature: MDI on armed panel + tooltips + CSS (surfaces 1-3 of 3)

First of two commits for MDI Phase 2. Surfaces news-impact annotation and
Intel Hub history tab to follow in checkpoint 2.

**Changes in this commit:**

`tooltip-definitions.js` - 3 new definitions:
  - `mdi` - what the Macro Dominance Index is
  - `mdi-gap` - threshold meaning (60+/30-59/<30)
  - `mdi-absorption` - "brief reaction, trend likely resumes" explanation.
    Explicitly states this does NOT weaken or bypass the news gate.

`css/mdi-module.css` (NEW, 126 lines) - Styling for MDI badge (inherits
from existing .intel-item base), disclaimer box, Intel Hub banner/table.
Reuses existing CSS variables - no new colours introduced. Mobile
responsive breakpoint at 640px.

`index.html` - 1-line CSS link added (mdi-module.css?v=8).

`armed-panel.js v1.12.0 -> v1.13.0`:
  - MDI_URL constant + MACRO_REFRESH_INTERVAL (30min - backend updates every 4h)
  - _macroData / _macroStale cache vars (mirrors IG/OB pattern)
  - fetchMacro() function + initial call + setInterval
  - New row 3.5 in buildIntelligenceStrip() between OB and ATR:
    * DOMINANT (gap >=60): amber badge "JPY-weak dom (g87)"
    * LEANING (gap 30-59): muted blue "lean JPY (g45)"
    * BALANCED (gap <30): grey italic "balanced (g15)"
    * Missing data: row HIDDEN entirely (fail-closed)
    * Stale data: "(stale)" tag appended
  - Tooltip on badge includes full SOFT-authority disclaimer

**Institutional guardrails enforced:**
- MDI does NOT feed the pair confidence score
- MDI does NOT modify any gate (news, regime, circuit breaker)
- Every visible MDI element carries SOFT-authority messaging
- Fail-closed: missing scrape data hides the display entirely, never defaults
- Separable: deleting mdi-module.css or the row 3.5 block removes MDI
  without affecting any other system component

**Pending in checkpoint 2 (next commit):**
- news-impact.js: getMacroCrossReference() annotation function (no gate change)
- arm-history-dashboard.html: new Macro Dominance tab with 28-pair table,
  validation banner (N>=30 counter), timeline chart

---

## [v5.15.2 / MDI Phase 1 patch 2] - 2026-04-21
### Fix: HIKE/CUT/HOLD detection (MDI scraper v1.0.1 -> v1.0.2)

**Issue observed on first v1.0.1 production run:**
Policy rates now parse correctly for all 8/8 G8 currencies (v1.0.1 fix
confirmed working), but `last_change` returned `None` for every
currency -- effectively silencing the policy_stance scoring component
(+/- 20 pts per currency).

Root cause: v1.0.1 searched `html[:8000]` for CB action prose ("left
steady at", "raised the rate"). TE's nav/header boilerplate pushes
the summary H2 past position ~17,000 chars, so the 8K window missed
the prose entirely on every page.

**Fix (v1.0.2):**
Search full HTML for CB action patterns. The patterns ("left ... steady
at", "raised ... rate", "cut ... rate") are specific enough that they
do not false-match on nav/CSS/footer content.

**Unit tests:** 7/7 pass, including new regression test `USD_NOISY`
that simulates the exact v1.0.1 failure mode (20K boilerplate chars
prepended before prose).

**Note on impact:** Between v1.0.0 / v1.0.1 / v1.0.2, MDI has never
shipped degraded data into the system -- fail-closed design meant
missing components scored 0 rather than being defaulted. Policy stance
was silent on all currencies during v1.0.1 but yield level, yield
momentum, and real-rate components were scoring correctly. Effective
signal was ~60% of design target; now full.

**Deployment:** Update cron from v1.0.1 -> v1.0.2 after verifying
clean scrape. v1.0.0 and v1.0.1 retained in repo per versioning rule.

---

## [v5.15.1 / MDI Phase 1 patch] - 2026-04-21
### Fix: policy rate parser (MDI scraper v1.0.0 -> v1.0.1)

**Issue observed on first production run:**
Yields parsed successfully (8/8) but all 8 policy rate scrapes returned
`PARSE_FAIL: no policy rate found`. Root cause: TE interest-rate pages
do not reliably expose the `TEChartsMeta "last"` JSON or the
`data-symbol` table row that the yield pages use. Policy rate is
surfaced as prose in the summary H2 and headline paragraph.

**Fix (v1.0.1):**
Rewrote `parse_policy_page()` with a 5-tier priority cascade:

1. PRIMARY: `"last recorded at X.XX percent"` prose match -- present
   on every TE interest-rate page, robust across all G8 currencies.
   Handles negative rates (Japan historical).
2. Fed-style target ranges: `"3.5%-3.75% target range"` or
   `"target range at 3.5%-3.75%"`. Takes upper bound as effective
   ceiling. Handles both ASCII hyphens and en/em-dashes.
3. Headline H2 patterns: `"steady at X.XX percent"`,
   `"raised to X.XX percent"`, `"interest rate... X.XX percent"`.
4. Legacy TEChartsMeta fallback (rare on policy pages, kept for safety).
5. Legacy data-symbol row fallback.

Also rewrote HIKE/CUT/HOLD detection to use summary prose patterns
with word-gap tolerance for phrases like `"raised the bank rate"`,
`"cut the cash rate"`. HOLD takes precedence over HIKE/CUT when both
match (handles `"left steady after raising last month"` correctly).

**Unit tests:** 6/6 pass against observed TE prose samples (US Fed
range format, BoJ steady, BoE hike, ECB cut, SNB hold, Fed range-only
edge case).

**Deployment:** v1.0.0 and v1.0.1 both retained in repo per versioning
rule. Update cron to call v1.0.1 after verifying it scrapes cleanly.

---

## [v5.15.0 / MDI Phase 1] - 2026-04-21
### Feature: Macro Dominance Index (MDI) -- 4th Satellite

**Scraper + Alert Server v2.15.0:**

Institutional-grade macro dominance scoring. Core principle: "When one leg of a cross is in a strong macro regime, news on the other leg usually gets absorbed."

- `macro_dominance_scraper_v1.0.0.py`: scrapes 10Y bond yields and central bank policy rates from Trading Economics for 8 G8 currencies (USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF). Scores each currency -100 to +100 across 4 factors:
  - Yield level vs peer average (+/- 30 pts)
  - 20-day yield momentum (+/- 25 pts)
  - Real rate vs peer average (+/- 25 pts)
  - Policy stance / last CB change (+/- 20 pts)
- Per-pair scoring for 28 cross pairs: `gap = |base_score - quote_score|`
  - Gap >= 60: DOMINANT (absorption likely)
  - Gap 30-59: LEANING (partial absorption)
  - Gap < 30: BALANCED (full news impact)
- Alert server v2.15.0: adds `GET /macro-dominance/latest` and `GET /macro-dominance/history?pair=X&limit=N` endpoints
- Cron: every 4 hours via Unraid User Scripts
- Historical logging to `macro-dominance-history.json` (last 500 snapshots) for edge-discovery validation

**Design principles (institutional):**
- **SOFT gate authority** -- v1.0.0 is display-only. News gate is NOT modified by MDI. Historical storage enables hit-rate validation before any promotion to MEDIUM authority (v1.x.x review phase after 60-90 days of data).
- **Fail-closed** -- missing scrape data per currency causes that currency to be omitted from scoring rather than default-passed. Silent failures would violate Risk Committee design rules.
- **Separable + inspectable** -- MDI logic runs independent of existing gates. No coupling. Can be disabled without affecting any other system component.

**Phase 1 scope: backend only.** No UI changes. Phase 2 (next release) will add armed panel integration, news impact module cross-reference, and Intelligence Hub history tab.

**Rationale for SOFT over MEDIUM authority:**
Institutional risk engineering follows one rule: new signals earn their weight through evidence, not assumption. MDI is an observed rule of thumb that requires validation. Granting it authority to downgrade proven news gates before statistical hit-rate review would violate "no silent spec drift" and couple two previously-separable risk controls. The Intelligence Hub exists specifically to answer the question: "is this edge real?"

**Known limitation:** `yield_20d_ago` extraction relies on TE's embedded chart series data. If TE changes chart embedding, momentum defaults to 0 (fail-closed). If consistently null after 24h, Phase 1.1 will switch to local history accumulation.

---

## [v5.14.0] - 2026-04-17
### Feature: Server-side Entry Monitor (Problem A)

**Alert Server v2.14.0 / armed-panel.js v1.11.0:**

Architecture: Two autonomous jobs in index.js. No TradingView dependency. Monitors all armed pairs automatically.

- `oandaGet()`: Node.js https wrapper for Oanda REST API v20 with 15s timeout
- `computeEMA()` / `computeATR()`: pure JS EMA and ATR computation (no external libs)
- `refreshPairEMA()`: fetches 60 x H4 candles per pair, computes EMA 9/21/50 + ATR14, stores in `_emaCache`. Triggered on new ARMED event (immediate) and every 4h (full refresh)
- `checkEntryZones()`: fetches live bid/ask for all armed pairs from Oanda pricing endpoint every 5 min. Computes mid-price distance from fastEMA in ATR units. Grades: HOT (0.3 ATR), OPTIMAL (0.5 ATR), ACCEPTABLE (1.0 ATR). Checks correct pullback side. Push notification on zone entry. Clears state on zone exit
- `_emaCache` cleared on BLOCKED -- no stale levels for re-armed pairs
- Entry Monitor init inside `server.listen` callback: 15s delayed first run, then 4h EMA + 5min zone intervals. Disabled silently if env vars absent
- `/state` exposes `entryZoneActive`, `entryZoneGrade`, `entryZoneDist`, `entryZoneTimestamp` per pair
- `GET /entry-zones`: returns all pairs currently in an active entry zone
- armed-panel.js: ZONE badge as item 0 in intelligence strip. Green=HOT, soft green=OPTIMAL, amber=ACCEPTABLE. Shows ATR distance
- Requires Docker env vars: `OANDA_API_KEY` and `OANDA_ACCOUNT_ID` (and optionally `OANDA_ENV=practice`)

---

## [v5.13.0] - 2026-04-17
### Feature: Signal Frequency Badge + Watchlist Pin

**Problem C -- Signal Frequency Badge (Alert Server v2.13.0 / v2.13.1 / armed-panel.js v1.9.0):**
- `getPairSignalCounts()` reads `arm-history.json`, groups events into sessions (6h gap = new session), counts last 7 and 14 days per pair
- `/state` exposes `weekSignalCount` and `twoWeekSignalCount` on every armed pair. Zero extra client API calls
- Intelligence strip item 7: `Freq` badge. Colour tiers: grey (1st), blue (2-3x), amber (4-5x), gold (6x+). Hover shows 14-day count
- Fix v2.13.1: Inflated counts (10x, 20x) caused by 4H re-affirmations counted individually. Fixed by 6h session deduplication

**Problem B -- Watchlist Pin (armed-panel.js v1.10.0 / storage-api.php):**
- Watch button (star) on every active armed card. Snapshots score, direction, playbook, entry zone at moment of decision
- Gold border + filled star on watched cards. Pin survives BLOCKED for 8h
- Ghost cards: BLOCKED pairs within 8h watch window shown in amber WATCHING section above tier groups with snapshot + expiry countdown
- Watches auto-expire after 8h. Unwatch clears immediately
- `armed-watchlist` key added to `storage-api.php` whitelist (both copies). Data in `armed-watchlist.json`

**Problem A -- Entry Monitor:**
- Superseded: TradingView-based approach (Pine Script) abandoned in favour of server-side implementation
- Server-side monitor runs against Oanda API directly -- monitors all armed pairs automatically, no per-pair setup required
- See v5.14.0 for implementation

---

## [v5.12.0] - 2026-04-11
### Fix + Cleanup: ltfBreak display, TR structExt bootstrap, legacy field removal

**Alert Server (index.js v2.12.0):**
- Add `ltfBreak` field: parsed from `ctx.ltf_break` in TR_ARMED payloads — stored on pair state, exposed on `/state`
- Fix Issue 3 (structExt always empty for ultimate-utcc.pine): TR_ARMED alerts where `ctx.structure` is `SUPPORT` or `RESISTANCE` now bootstrap `structExt = 'FRESH'` immediately. The TR gate already confirms price is at S/R, so PRIME tier can fire before FCC-SRL bar close arrives
- Remove `ctx.struct_ext` read from pipe parser (struct_ext is now server-derived from locGrade only — never sent by ultimate-utcc.pine)
- Remove legacy fields from pair state and arm history: `criteria`, `volBehaviour`, `structBars`, `riskMult` — none populated by ultimate-utcc.pine, none consumed by armed-panel.js
- Arm history aggregation cleaned: removed `volBehaviours`, `riskMults`, `criteria4`, `impaired` tallies; replaced `qualityRate`/`impairedRate` with `mtf3Rate`
- Log line updated: now shows `struct` and `ltf` instead of `zone`/`mtf`

**Armed Panel (armed-panel.js v1.8.0):**
- Add `ltfBreak` display row in intelligence strip — TR cards only. Shows `1H HIGHER LOW` or `1H LOWER HIGH` in violet. Falls back to muted dash if field absent
- Remove `p.struct_ext` snake_case fallback everywhere — `p.structExt` (camelCase) only
- Remove `atrBehav`/`volBehaviour` dead fallback path from ATR display (never populated by ultimate-utcc.pine — `atrPct` from `volLevel` is always present)
- Remove dead `atrColour()` helper function (was only called by the removed `atrBehav` path)

---

## [v5.11.0] - 2026-04-09
### Fix: Ultimate UTCC v2.3.0 — TR System + Full Integration Audit

**Pine Script (ultimate-utcc.pine v2.3.0):**
- TR thresholds recalibrated: FX 85→70, Crypto 88→72, Metals 85→70, Energy 83→68, Bonds 78→63, Indices 83→68. Old values assumed ribbon (15pts) would contribute regularly — it almost never does at exhaustion.
- Ribbon removed from TR score entirely (architecturally wrong — trend strength metric used in reversal system). Still defined but contributes 0. Threshold adjusted accordingly.
- Dead `TR-BLOCK-RIBBON` reason code removed from reason logic
- Stale `RIB:` removed from `trBreakdown` display string
- `playbook` added to all 4 alert() JSON payloads (was missing — showed blank on FCC cards)

**Alert Server (index.js v3.0.0):**
- Pure JSON parsing path added for Ultimate UTCC `alert()` payloads. Old parser expected pipe-delimited header and returned null for pure JSON — all Ultimate UTCC alerts were silently dropped.
- `entry_zone` field mapping fixed: was reading `ctx.entry`, Ultimate UTCC sends `ctx.entry_zone`
- `atr_pct` field mapping fixed: was reading `ctx.vol_level`, Ultimate UTCC sends `ctx.atr_pct`
- Playbook extraction now reads `json.playbook` (top-level) in addition to `ctx.playbook`


## [v5.10.0] - 2026-04-08
### Feature: Location Engine - Live Entry Location Grade in Armed Panel

Per-pair location grading fed from TradingView into the FCC armed pair cards.
Solves the core problem: knowing if entry location is right without opening a chart.

**New indicator: `location-engine.pine` (FCC-LOC)**
- Fires webhook every 4H bar close per pair
- Checks EMA cloud proximity (at lower edge for longs, upper for shorts)
- Checks S/R zone proximity: PDH/PDL, PWH/PWL, Daily/Weekly swings, round numbers, D.200EMA
- Grades combined location: PRIME / AT_ZONE / AT_CLOUD / IN_CLOUD / WAIT / OPPOSED
- Detects breakouts and retests: BREAKOUT_RETEST / BREAKOUT_EXT / FALSE_BREAK
- Fully customisable: all proximity thresholds, sources, lookbacks, cloud EMAs, retest window
- Shows grade label on chart for calibration

**Alert server (index.js v2.10.0):**
- `POST /webhook/location` -- receives location payload from FCC-LOC indicator
- `GET /location` -- returns location state for one pair or all pairs
- `location.json` stored in /data/ with 6-hour TTL per pair
- `loadLocation()` / `saveLocation()` / `cleanupExpiredLocation()` functions added

**Armed Panel (armed-panel.js):**
- `fetchLocation()` -- polls /location every 5 minutes
- `buildLocationRow(p)` -- renders location badge row on each armed pair card
- Location row sits between directional verdict and news bias rows
- Grade badges: PRIME (gold), AT ZONE (green), AT CLOUD (blue), WAIT (grey), OPPOSED (red), BRK RETEST (green pulse), BRK EXT (amber), FALSE BREAK (red)
- Shows zone name, cloud distance, nearest supp/res ATR distance

**dashboard.css:**
- `.armed-location-row` -- new row styles
- `.loc-badge`, `.loc-prime`, `.loc-at-zone`, `.loc-at-cloud`, `.loc-in-cloud`
- `.loc-wait`, `.loc-opposed`, `.loc-brk-good`, `.loc-brk-ext`
- `.loc-desc`, `.loc-prox` -- description and proximity text styles

**storage-api.php:**
- `location` key whitelisted

**Also added this session:**
- `sr-location-zones.pine` -- HTF S/R Location Zones standalone indicator (6 sources, touch counting, confluence detection)
- `SR-LOCATION-ZONES-USER-GUIDE_v1.0.0.md` -- comprehensive user guide

## [v5.9.0] - 2026-04-08
### Feature: Ultimate UTCC Integration - TF_ARMED / TR_ARMED

Full integration of Ultimate UTCC alert types across armed panel, alert server, and quick access bar.

**Alert type changes:**
- `TF_ARMED` (Trend-Following) -- blue badge, 1.5R full position size
- `TR_ARMED` (Trend-Reversal) -- orange badge, 0.75R reduced position size
- Legacy `ARMED` type mapped to `TF_ARMED` for backward compatibility
- Old `ARMED` type deprecated -- Ultimate UTCC fires TF_ARMED/TR_ARMED only

**Card changes (armed-panel.js v1.4.0):**
- TF/TR badge displayed next to pair name (blue pill for TF, orange pill for TR)
- Risk column renamed to Size -- shows derived position size (1.5R or 0.75R)
- Verdict row now shows playbook label right-aligned
- Verdict row right border accent matches alert type colour (blue/orange)
- All 3 satellites retained: directional verdict, news bias row, IG sentiment row

**Alert server (index.js v2.9.0):**
- `parseNewAlert()` detects TF_ARMED and TR_ARMED before generic ARMED
- State stores `alertType` (TF_ARMED or TR_ARMED) and `positionSize`
- `GET /state` returns `positionSize` per pair
- Push notification title updated to show alert type

**Quick access bar (quick-access-bar.js v1.1.0):**
- Armed chips show TF/TR badge with type colour
- Chip icon colour matches alert type (blue/orange)
- Fixed raw emoji characters replaced with Unicode escapes

**Files changed:**
- `forex-alert-server/index.js` v2.9.0
- `src/js/armed-panel.js` v1.4.0
- `src/js/quick-access-bar.js` v1.1.0

## [v5.8.0] - 2026-04-03
### Feature: Armed Validation Gate (FOMO Phase 2)

New module `armed-validation-gate.js` -- per-alert mandatory validation checkpoint that fires after the 1-hour FOMO gate expires. Addresses confirmation bias under time pressure: brain is primed to see setups that do not exist once the hour is up. Gate forces honest chart verification before Pre-Trade access.

**Gate logic:**
- Per-instrument, per-alert -- each alert is independent
- Both entry points intercepted: Armed Panel `READY` badge + Quick Access Bar `READY` click
- Modal is blocking -- clicking outside shows error, no dismissal

**Three outcomes:**
- **CONFIRM** (all 3 checks + SL/TP filled) -- `VALID` badge, Pre-Trade unlocks, levels logged
- **NO VALID SETUP** -- `PASSED` badge, no penalty, pair stays tradeable, logged for audit
- **Close (X)** -- failure count increments, warning toast issued

**Failure / cooldown logic:**
- First failure: warning toast only
- Second failure same pair same day: automatic 24h cooldown, persisted server-side
- Cooldowns survive browser refresh and carry across midnight if still active

**Three validation checks (all required):**
1. Price is currently AT the entry zone -- not heading towards it
2. EMA structure confirmed live on chart right now -- not predicted
3. Exact stop loss AND take profit stated before opening entry form

**Files changed:**
- `src/js/armed-validation-gate.js` (new)
- `src/index.html`: script import added after `armed-panel.js`
- `backend/api/storage-api.php`: `armed-validation` added to whitelist

## [v5.7.2] - 2026-04-03
### Fixed: Trade duplication + reappearance after server sync
- `broker-dashboard.js`: `processClosedTrade` now claims `_processedIds` entry BEFORE any `await` - prevents two concurrent calls both passing the dedup gate and creating duplicate journal entries
- `broker-dashboard.js`: `_findLinkedEntry` fuzzy match now also matches `closed_pending_review` status (not just `open`) - prevents duplicate creation when server sync reverts a trade status temporarily
- `server-storage.js`: `pollForChanges` now does a smart merge for `ftcc_trades` instead of blind overwrite - keeps the highest-status version of each trade by ID (open < closed_pending_review < complete), preventing closed/reviewed trades from reverting to open after a sync

## [v5.7.0] - 2026-04-03
### Added: Review Mode + Expandable Journal Rows
- `review-mode.css`: Side-panel overlay styles, expand-row table styles, grade button colours, dirty-dot indicator
- `review-mode.js`: `ReviewMode` IIFE module - nav (prev/next), filter chips (All/Ungraded/Wins/Losses), inline grade selector, notes/lessons textareas, save to localStorage + ServerStorage, `openFromTrade(id)`, `buildExpandHTML(trade)`
- `journal-crud.js`: Expandable rows - each trade row now has a toggle chevron; second `<tr class='trade-expand-row'>` shows context, levels, structured/ext, notes preview, Reviewed stamp, and 'Review Mode' + 'Full Edit' action buttons; `toggleTradeExpand()` function added
- `index.html`: `review-mode.css` imported after `modals.css`; `review-mode.js` imported after `journal-crud.js`

## [v5.5.5] - 2026-04-03
### Fix: Lessons field still blank in Edit for pre-fix reviews

- `journal-crud.js` v2.11.1: `editTrade()` now falls back to `lessonsLearned` if `lessons` is empty — covers all reviews entered before v1.9.2 deployment
- `lessonsLearned`, `executionQuality`, `execQualityRating` added to `protectedFields` so they are never clobbered when saving an edit

## [v5.5.4] - 2026-04-03
### Feature: Trade Classification added to Claude Export

- `performance-analytics.js`: Classification field now included per-trade in Detailed Trade Log
- New **Trade Classification Breakdown (Behavioural Audit)** section in Performance Summary
- Shows win rate and R by classification bucket (Model Win / Model Loss / Execution Error / Permission Violation)
- Self-inflicted loss % callout: execution errors + permission violations as % of all trades
- Surfaces the key coaching question: *"Did I lose because the model failed, or because I failed the model?"*

## [v5.5.3] - 2026-04-03
### Fix: Review queue field mismatches + manually closed trades not surfacing for review

**Bug 1 -- Lessons field blank in Edit after completing a review (`broker-dashboard.js` v1.9.2):**
- Root cause: `submitReview()` saved lessons as `lessonsLearned` but `editTrade()` in journal-crud reads `trade.lessons`
- Fix: `submitReview()` now saves under both `lessons` AND `lessonsLearned` — edit form populates correctly

**Bug 2 -- Execution quality rating captured but invisible in Edit (`broker-dashboard.js` v1.9.2):**
- `executionQuality` (1–5 rating) now also saved as `execQualityRating` alias for future edit form mapping

**Bug 3 -- Manually entered/closed trades never appearing in Review Queue banner (`journal-crud.js` v2.11.0):**
- Root cause: Review queue only surfaces trades with status `closed_pending_review`; manual journal saves used `closed` — queue never picked them up
- Fix: `saveTrade()` and `quickCloseTrade()` now promote status to `closed_pending_review` for any trade closed without review data (`!reviewedAt && !classification && !lessons`)
- Trades that already have review data stay `closed` (no regression)

## [v5.5.2] - 2026-04-03
### Fix: Review queue reappearing + No UTCC badge on armed trades
- `broker-dashboard.js` (v1.9.1): Two bugs in the auto-journal review queue

**Bug 1 -- Reviewed trades kept reappearing as "awaiting review":**
- Root cause: `_updateExistingEntry()` unconditionally set `status = PENDING_REVIEW` on every Oanda sync poll, overwriting the `complete` status set during review
- Fix: Guard added -- `if (trades[idx].status !== STATUS.COMPLETE)` before the status assignment
- Reviewed trades now survive subsequent sync cycles without being reset

**Bug 2 -- "No UTCC" badge on trades that were armed pairs:**
- Root cause: By the time a trade closes, the armed state is cleared from the server -- `alertData` was null at sync time, so `utccArmed`, `trendScore`, `utccTier` were never stored on the journal entry
- Fix 1: When reviewer enters a score during review, `utccArmed = true` is now also set -- badge turns green on save
- Fix 2: UTCC enrichment fields are now individually guarded (not gated behind single `!trendScore` check) -- missing fields get backfilled on later syncs if `alertData` becomes available


## [v5.5.1] - 2026-04-03
### Armed Panel: Directional verdict badges + fleet summary
- `armed-panel.js` (v1.2.0): `buildDirectionalVerdict(p)` added - derives LONG/SHORT verdict from UTCC direction (primary), modulated by bias confluence, IG sentiment contrarian signal, and struct_ext state
- Confidence scoring: ALIGNED/contrarian/FRESH = +1 each; CONFLICTING/crowd-aligned/EXTENDED = -1 each; score >=2 HIGH CONF, >=0 MED CONF, <0 LOW CONF
- Verdict strip rendered between main row and bias row on every Armed and Watchlist card
- Fleet summary added to Armed Instruments section header: up-arrow N L / down-arrow N S directional count at a glance
- Removed `armed-panel_v1.2.0.js` - versioned filenames are for standalone deliverables not live source files; git provides version control

## [Alert Server v2.7.0 / UTCC Universal v3.0.0] - 2026-04-02
### UTCC Universal indicator + BLOCKED push notification

**utcc-indicators/utcc-universal.pine (NEW)**
- Single indicator replacing all 6 category-specific UTCC indicators (forex/crypto/metals/energy/bonds/indices)
- Auto-detects asset class via `syminfo.type` + ticker pattern matching. Priority: CRYPTO > METALS > ENERGY > BONDS > INDICES > FX
- 6 dedicated settings groups with reviewed per-category defaults:
  - FX: ARMED 80, CANDIDATE 85, ATR 80%, QUIET YES, ADX 20
  - CRYPTO: ARMED 85, CANDIDATE 88, ATR 80%, QUIET NO, ADX 25
  - METALS: ARMED 79, CANDIDATE 84, ATR 80%, QUIET YES, ADX 20
  - ENERGY: ARMED 78, CANDIDATE 83, ATR 80%, QUIET NO, ADX 19
  - BONDS: ARMED 72, CANDIDATE 78, ATR 80%, QUIET YES, ADX 18
  - INDICES: ARMED 78, CANDIDATE 83, ATR 80%, QUIET YES, ADX 20
- Runtime selection maps detected class to active thresholds — all downstream code unchanged
- Alert JSON payload uses `detectedClass` (not hardcoded "FX") in `asset_class` field
- Panel: ASSET CLASS row (colour-coded per category) added to Tier 1
- Diagnostics panel shows active ARMED threshold + detected class label

**forex-alert-server/index.js (v2.7.0)**
- `pushBlocked()`: PWA push notification fires on every BLOCKED alert
- Human-readable disarm reason translated from reason codes (EMA flat, MTF misalign, efficiency collapse, regime chaos, etc.)
- `requireInteraction: true` — notification stays on screen until dismissed
- Closes the exit signal gap: ARMED push fires on entry signal, BLOCKED push fires on structural breakdown

## [v5.4.5] - 2026-04-01
### Fix: scans, goals, no-trades returning 400 from storage-api.php
- `storage-api.php`: added `scans`, `goals`, `no-trades` to `$allowedFiles` whitelist
- Three keys were being polled by `server-storage.js` every 30s but not registered — returning 400 on every cycle

## [v5.4.4] - 2026-04-01
### Fix: ReferenceError utccState is not defined in _createNewEntry
- `broker-dashboard.js`: `utccArmed: !!(alertData || utccState)` → `!!(alertData)`
- `utccState` is declared in `processClosedTrade()` but was referenced inside `_createNewEntry()` which is a separate function — out of scope
- Safe fix: by the time `_createNewEntry` is called, any `utccState` data has already been merged into `alertData` upstream
- Was causing auto-journal to fail silently on every trade close

## [v5.4.3] - 2026-03-31
### Pair breakdown — filter to forex, metals, crypto only
- `arm-history-dashboard.html`: `renderPairChips()` now filters tally to pairs where `getAssetClass` returns `forex`, `metals`, or `crypto`
- Indices, bonds, energy excluded — session data is meaningless for exchange-hours instruments (they always fire during their own cash session)

## [v5.4.2] - 2026-03-31
### Fix: Quality rate always 0% — criteria threshold corrected to 4/4
- `forex-alert-server/index.js`: `criteria5` renamed to `criteria4`, threshold changed from `>= 5` to `>= 4`
- `arm-history-dashboard.html`: overview filter `e.criteria >= 5` → `>= 4`, labels `5/5 Quality` → `4/4 Quality`, `5/5 criteria` → `4/4 criteria`
- Root cause: Pine Script `utcc-forex` only has 4 criteria (trend score, MTF, volatility, news safety). ATR is a gate on alert-firing, not counted in `criteriaMet`. Max value of `criteriaMet` is 4 — `>= 5` could never trigger.

## [v5.4.1] - 2026-03-31
### Fix: Session heatmap — Tokyo and London always showing 0
- `arm-history-dashboard.html`: added `'TOKYO':'TOKYO'` and `'LONDON':'LONDON'` to `SESSION_MAP`
- Root cause: alert server pre-normalises session labels to uppercase (`TOKYO`, `LONDON`, `NY`) before storing in arm history tally. Dashboard `SESSION_MAP` only had mixed-case source keys (`'Tokyo'`, `'London'`), so uppercase variants fell through silently. Only `'NY':'NY'` matched because the server value was already `NY`.

## [ProZones v3.6.0] - 2026-03-31
### ProZones indicator — auto-calibration for asset class
- Added `Auto-Calibration` settings group with `Auto-calibrate for asset class` toggle (ON by default)
- Detects asset class at runtime using `syminfo.type` + ticker string matching (Forex / Metals / Energy / Crypto / Indices)
- All critical zone parameters (`effSens`, `effClATRMax`, `effClPctMax`, `effMergeATR`, `effTouchCooldown`, `effWVol`) computed automatically per asset class
- Forex profile preserves proven working values: Sens=85, ATR×=0.8, %=0.0015, Merge=2.5
- Non-forex: `%` cap raised to 0.01 so ATR× governs zone width on high-price assets (Gold, Oil, BTC etc.)
- Crypto: tighter ATR×0.4, narrower merge span 1.2, longer cooldown 10 bars, reduced volume weight 0.5
- Energy: ATR×0.5, Sens 72
- Debug panel header now shows detected class + mode, e.g. `METALS AUTO S:85`
- Disable `autoCalib` to revert to full manual control via existing inputs
- File: `utcc-indicators/multi-touch-zones.pine`

## [v5.4.4] - 2026-03-31
### Execute: optional levels + Oanda backfill + smart auto-link
- **execute-integration.js v1.1.0**: entry/SL/TP fields are now optional
  - Missing levels surface a blue backfill-ack-panel above EXECUTE button
  - Trader must tick: "I confirm entry/SL/TP will be back-filled from Oanda immediately"
  - Hard blocks remain non-negotiable: pair/direction, server permission gate, EXTENDED zone
  - R:R check skipped (not blocked) when levels are absent
- **Smart immediate Oanda link**: after execute, polls open trades every 5s for 30s
  - Open found: captures actual entry, SL, TP, units, direction
  - Closed found (immediate fill+close): captures everything including P&L, duration, R-value
  - Timeout: notifies user to use manual Fetch button
- **Fetch from Oanda button**: added to all pending/open trade cards
  - Smart: checks open trades first, then closed history
  - Calculates R-multiple and updates card on link
  - Shows slippage (pips, signed) when planned entry exists
- **trade-capture.js populateJournalFromTrade() extended**:
  - trade-entry-zone, trade-vol-state, trade-mtf now auto-populated
  - trade-units populated from Oanda
  - trade-slippage auto-calculated (pips, signed)
  - trade-r-display populated for closed trades
  - trade-status set correctly (open/closed)
  - trade-classification mapped from playbook name
  - Backfill note appended to notes when levels were missing at capture
- **index.html**: backfill-ack-panel added above EXECUTE button (hidden by default, JS-controlled)

## [v5.4.3] - 2026-03-30
### IG Client Sentiment Scraper — Satellite 3 fully operational
- ig_sentiment_scraper.py v1.0.1: 45/45 markets fetched (28 forex + indices + metals + energy + crypto)
- Fixed non-forex market IDs via API discovery
- Added 65s rate limit pause every 25 requests (IG API limit)
- index.js v2.7.0: GET /ig-sentiment/latest endpoint with 6h staleness check
- Cron: every 4h via Unraid User Scripts
- Config: /mnt/user/appdata/trading-state/data/ig-sentiment-config.json

## [v5.3.3] - 2026-03-28
### New: Armed Panel Filters in Settings + Index pairs for verdict calculation
- Settings tab: Armed Panel Filters card with Bond/Index instrument checklists
- armed-panel.js: localStorage-driven exclusion filter, bonds excluded by default
- Index pairs added to PAIRS list for verdict calculation

## [v5.3.1] - 2026-03-27
### New: Index snapshots + risk sentiment bias (te_scraper.py v1.2.0)
- **INDEX_PAGES**: 13 instruments mapped to TE stock market slugs — US30USD, US2000USD, SPX500USD, NAS100USD, UK100GBP, JP225YJPY, JP225USD, HK33HKD, FR40EUR, EU50EUR, DE30EUR, CN50USD, AU200AUD
- **INDEX_SENTIMENT**: risk-on/off map — US indices up → AUD/NZD/CAD bullish, JPY/CHF bearish; EU indices → EUR/GBP; Asia indices → AUD/NZD/JPY
- **parse_index_page()**: extracts value + daily % from TE meta description ("fell to X, losing Y%")
- **scrape_index_snapshots()**: scrapes all 13 pages, 2s delay between requests
- **index_snapshot** key added to te-snapshot.json output
- **Bias scoring**: index moves create synthetic Low-impact events fed into calculate_te_currency_bias
- **IMPACT_WEIGHTS["Low"] = 0.3**: indices contribute signal without dominating G10 event data
- **--skip-indices** flag for testing without index scraping

## [v5.3.0] - 2026-03-27
### New: Full commodity + bond bias engine — sister sites fixed
**forex_calendar_scraper.py v3.4.0:**
- **Sister site canary fixed**: `check_feed_canaries()` now site-aware — FF requires `calendar__currency`, sister sites only require `calendar__actual` + `calendar__event-title` + `data-event-id`
- **IMPACT_CSS_MAP expanded**: added `mm/ee/cc` prefixes for MetalsMine/EnergyExch/CryptoCraft
- **TITLE_TO_CURRENCY**: infers commodity proxy currency from event title keywords (gold→XAU, crude→OIL, bitcoin→BTC etc) for sister sites that have no currency column
- **COMMODITY_TO_FX map**: routes commodity BEAT/MISS to G10 currency bias at 0.5x weight — oil up→CAD bullish, gold up→CHF/JPY/USD bullish (risk-off), copper up→AUD/NZD bullish, BTC up→AUD/NZD bullish (risk-on)
- **BOND_TO_CURRENCY map**: maps TE bond auction symbols to G10 currencies — yield up (BEAT) = hawkish = currency bullish at 0.5x weight
- **calculate_currency_bias**: three scoring branches — direct G10 (full weight), bond auction (0.5x), commodity proxy (0.5x)

## [v5.2.7] - 2026-03-27
### New: TE backfill — 4 weeks of TE calendar data into bias-history.json
- **te_scraper.py v1.2.0**: `--backfill` and `--backfill-weeks` flags added; `get_te_past_week_urls()`, `te_week_already_backfilled()`, `backfill_te_week()` helpers; uses same Sunday-anchored week URL pattern as FF (`tradingeconomics.com/calendar?week=mar1.2026`); skips weeks already backfilled; 2s delay between weeks; scores BEAT/MISS from surprise_dir; appends to shared bias-history.json with run_id `backfill_YYYYMMDD_te`
- **forex_calendar_scraper.py v3.3.2**: FF `--backfill` now automatically chains to TE backfill via subprocess after FF weeks complete — one command restores everything

## [v5.2.6] - 2026-03-27
### Fix: File locking on bias-history.json — prevents race condition
- Both `forex_calendar_scraper.py` (v3.3.1) and `te_scraper.py` (v1.1.1) now use `fcntl.flock`
- `load_bias_history`: LOCK_SH (shared read) — blocks concurrent writers; handles empty file gracefully (returns clean default instead of crashing with JSON parse error)
- `save_bias_history`: LOCK_EX (exclusive write) via `.lock` sidecar file — sequential writes guaranteed; never overwrites concurrent reader mid-write
- Run FF scraper first, TE second to restore history after today's overwrite

## [v5.2.5] - 2026-03-27
### New: TE bias scoring feeds into shared bias-history.json
- **te_scraper.py v1.1.0**: full bias engine added — mirrors FF scraper exactly
  - `normalize_te_events_for_bias()` — maps TE schema to FF bias schema: `event`→`title`, `surprise_dir`→`result`, `time_et`→`datetime_utc` (ET+4h=UTC), `impact` defaults to "Medium" (conservative — TE has no star data)
  - `calculate_te_currency_bias()`, `calculate_te_pair_verdicts()` — same scoring logic as FF
  - `append_te_bias_run()` — appends to same `bias-history.json` as FF; run_id suffixed `_te` for identification
  - `bias_path` auto-set: `--unraid` uses `/mnt/user/appdata/trading-state/data/bias-history.json`
  - Skipped if no events have results yet (safe for --print mode)
  - All downstream consumers (armed panel, Intel Hub, News Bias tab) benefit automatically

## [v5.2.4] - 2026-03-27
### Refactor: Bond auctions merged into events stream
- **te_scraper.py v1.0.6**: bond auctions merged into `today_events` list (same structure as calendar events); `is_bond: true` flag for identification; country→currency mapping applied to bonds; `bond_auctions` key removed from snapshot output; `build_snapshot` updated accordingly
- **dashboard-event-widget.js**: removed `buildBondSection()` and separate bond header — bonds now appear inline as regular events via `window.TE_SNAPSHOT_DATA.today_events`
- **pre-session-brief.js**: removed bond count pill (bonds counted in total_events)

## [v5.2.3] - 2026-03-27
### Refactor: Merge cards, template summary, bond auctions to events card
- **pre-session-brief.js v2.0.0**: merged with Macro Briefing into single combined card; template-based summary (no API call — instant, reliable, no CORS); fetches bias + TE in parallel; shows currency bias arrows, upcoming events, session pairs colour-coded
- **te-briefing.js v4.0.0**: stubbed out — all rendering moved to pre-session-brief.js
- **index.html**: removed `#te-briefing-container` div — single `#pre-session-brief-container` handles both
- **Bond auctions**: already in `dashboard-event-widget.js` `buildBondSection()` — appended to CRITICAL Events card via `window.TE_SNAPSHOT_DATA`

## [v5.2.2] - 2026-03-27
### New: Surprise magnitude + Pre-Session Brief + Economic drivers in Macro Briefing

**forex_calendar_scraper.py v3.3.0:**
- `parse_numeric()` — parses value strings with K/M/B/T/% suffixes to float
- `calculate_surprise()` — adds `surprise_abs`, `surprise_pct`, `surprise_dir` to every event dict
- Handles 90%+ of high-impact events cleanly; returns null fields if unparseable (never blocks run)

**te_scraper.py v1.0.5:**
- Same `parse_numeric()` + `calculate_surprise()` added — schema consistent with FF scraper
- surprise fields added to both calendar events and bond auction dicts

**js/te-briefing.js v3.0.0:**
- Claude prompt now includes today's economic actuals with surprise magnitude as economic drivers
- Format: "currency | event | actual vs forecast | BEAT/MISS by X%"
- Claude explains WHY currencies are moving (from real data), not just WHAT prices are doing

**js/pre-session-brief.js v1.0.0 (NEW):**
- Pinned card above Macro Briefing card on Dashboard tab
- Session-aware: Tokyo (09:00 AEST), London (17:00 AEST), NY (22:00 AEST)
- Hidden off-session (no blank card shown)
- Shows: currency bias arrows (8 currencies), upcoming high-impact events (next 12h), session pairs colour-coded (green=clean, amber=conflicted)
- Claude API generates 2-3 sentence plain-English brief from real FCC data only (bias, verdicts, actuals, upcoming events)
- Refreshes every 15 minutes

**index.html:**
- `#pre-session-brief-container` div added above `#te-briefing-container`
- `pre-session-brief.js` script import added

## [v5.2.1] - 2026-03-27
### New: Macro Briefing AI summary from real TE source text
- **te_scraper.py v1.0.4**: `parse_fx_page` now extracts TE's own summary paragraph from `<div id="stats"><h2>` and `<meta name="description">` — stored as `summary` field per pair in `fx_snapshot`; improved rate extraction via TEChartsMeta JS var; daily_pct extracted from meta description "up/down X% from previous session"
- **te-briefing.js v2.0.0**: passes real scraped TE summary text to Claude API; Claude summarises ONLY what TE says — no external context added; plain English 2-3 sentence paragraph rendered in card; rate strip shown below; "Generating summary..." placeholder while API call is in flight

## [v5.2.0] - 2026-03-27
### Fix: te_scraper.py v1.0.3 — correct TE HTML structure
- **Value extraction**: switched to `id="actual"`, `id="previous"`, `id="consensus"` within row scope — TE does not use class names for these cells
- **Time extraction**: reads span inside cells[0] instead of raw cell text
- **Bond filter**: replaced `BOND_SYMBOLS` set (wrong — TE symbol names don't match) with `G10_BOND_COUNTRIES` country list — now captures all G10 bond auctions (US, DE, UK, JP, AU, NZ, CA, CH, FR, IT)
- **Importance**: confirmed TE does not expose importance/stars in scraped HTML — always returns 0 (Unknown), consistent with FF Holiday=0. impact_level field kept for schema consistency.

## [v5.1.9] - 2026-03-27
### New: TE Macro Briefing — dashboard card + Intel Hub tab
**Alert server (index.js v2.6.0):**
- New `GET /te-snapshot` endpoint — serves `te-snapshot.json` with 8h staleness check, fail-closed (404 if file missing)

**FCC Dashboard (index.html):**
- New `#te-briefing-container` div above Next CRITICAL Event widget
- Renders FX snapshot as inline paragraph (pair, rate, daily %) with timestamp
- Event/bond count pills below paragraph
- Stale data warning banner if scraper hasn't run in 8h+

**js/te-briefing.js (new, v1.0.0):**
- Polls `GET /te-snapshot` every 30 minutes (same cadence as news-bias-engine)
- Stores `window.TE_SNAPSHOT_DATA` for consumption by dashboard-event-widget
- Triggers `DashboardEventWidget.updateEventDisplay()` after load (picks up bond auctions)

**js/dashboard-event-widget.js (v2.2.0):**
- Bond auctions from `window.TE_SNAPSHOT_DATA` appended below CRITICAL events list
- New `buildBondSection()` function — symbol, event, time ET, actual/forecast/previous

**arm-history-dashboard.html:**
- New 7th tab: &#x1F310; Macro (lazy loaded, same pattern as News Bias tab)
- FX Snapshot table: all 7 pairs, rate, daily %, status
- G10 Events table: filterable by currency and impact level, 500px scrollable
- Bond Auctions table: symbol, event, time ET, actual/forecast/previous
- `loadTEBriefing()` / `renderTEFX()` / `renderTEEvents()` / `renderTEBonds()` functions added

## [v5.1.8] - 2026-03-27
### Fix: te_scraper.py v1.0.2 — importance scale matches ForexFactory
- `parse_importance` default changed from 1 → 0 (no stars = Holiday/Unknown, matches FF `Holiday=0`)
- Added `impact_level` numeric field to event dicts (mirrors FF's `impact_level`: High=3, Medium=2, Low=1, Holiday=0)

## [v5.1.7] - 2026-03-27
### Fix: te_scraper.py v1.0.1 — cell position and parsing fixes
- **Cell positions**: switched from hardcoded cells[3/4/5] to `cells[-3/-2/-1]` (last-3 approach) — position-independent regardless of date col rowspan variation
- **Field rename**: `date` → `time_et` (cells[0] is time not date)
- **Importance**: fixed star detection — now excludes `glyphicon-star-empty`, checks `data-importance` attr first
- **Bonds canary**: relaxed — removed `calendar-table` requirement (bonds page may not have it)
- **clean_val**: now rejects stray 2-letter uppercase strings (country codes leaking into value cells)

## [v5.1.6] - 2026-03-27
### New: te_scraper.py v1.0.0 — Trading Economics macro briefing layer
- New script: `backend/scripts/te_scraper.py`
- PURPOSE: Complements FF scraper (bias scoring). TE scraper = daily macro context layer.
- Scrapes three TE sources:
  - `tradingeconomics.com/calendar` → G10 economic events (USD/EUR/GBP/JPY/AUD/NZD/CAD/CHF)
  - `tradingeconomics.com/calendar/bonds` → Bond auctions (USB10Y, USB02Y, USB05Y, USB30Y, DE10Y, UK10Y, JP10Y)
  - `tradingeconomics.com/{country}/currency` → FX snapshot for 7 major pairs (rate, daily %)
- Output: `te-snapshot.json` with sections: today_events, bond_auctions, fx_snapshot, health, summary
- OUTPUT PATH (VERIFY ON UNRAID): `/mnt/user/appdata/trading-state/data/te-snapshot.json`
  - The data/ dir is created by FF scraper on first run — confirm it exists before first TE run
- Flags: `--unraid`, `--skip-fx`, `--skip-bonds`, `--print`, `--quiet`
- Cron: same 6h schedule as FF scraper — `0 */6 * * *`
- Canary checks on all three scraped pages; graceful degradation if any section fails
- Polite rate limiting: 2s between FX pages, 2s between sections
- Architecture: two separate scrapers, two separate outputs — TE does NOT replace FF

## [v5.1.5] - 2026-03-26
### forex_calendar_scraper.py v3.2.0 — multi-site scraping
- Added `--all-sites` flag: scrapes forexfactory + metalsmine + energyexch + cryptocraft
- SITE_CONFIGS dict: per-site URL, currency whitelist, canary required flag
- Forex site: canary required (aborts on failure). Sister sites: warn + skip on failure
- Extended PAIRS list: metals (XAUUSD XAGUSD XPTUSD XCUUSD), energy (WTICOUSD BCOUSD NATGASUSD), crypto (BTCUSD ETHUSD BCHUSD LTCUSD MBTCUSD)
- source_site field added to events and event_results for data provenance
- --backfill now supports --all-sites flag (backfills all 4 sites per week)
- 1s delay between sites (rate limiting), 2s between weeks
- Cron update: add --all-sites to existing command

## [v5.1.4] - 2026-03-26
### Fix: heatmap session normalisation
- Session values from Pine Script are inconsistent: NY, Tokyo, Asian, Off-Hours, London, London/EU, Cash Session, US Prime etc.
- `arm-history-dashboard.html`: normalise all session variants to 3 buckets (TOKYO/LONDON/NY) before heatmap render
- `index.js`: same normalisation in tally builder so pair breakdown sessions are consistent
- Mapping: Tokyo/Asian/Off-Hours -> TOKYO | London/London/EU/EU/London -> LONDON | NY/US Session/US Prime/US Pre-NYMEX/NYMEX Prime/Cash Session -> NY

## [v5.1.3] - 2026-03-26
### Fix: arm-history dashboard stats + heatmap, Intel quick access button
- `index.js`: direction case fix in tally — events store lowercase `long`/`short`, tally was checking uppercase `LONG`/`SHORT`. Long bias, 5/5 quality, impaired arms now count correctly
- `arm-history-dashboard.html`: direction case fix in renderStats (same issue)
- `arm-history-dashboard.html`: heatmap session keys fixed — API returns `NY` not `NEW_YORK`
- `index.html`: "&#x1F9E0; Intel" quick access link added to Armed Instruments panel header — opens arm-history-dashboard.html in new tab

## [v5.1.2] - 2026-03-26
### Cleanup: remove Intel Hub tab from main FCC app
- Removed "Intel Hub" tab from desktop and mobile nav
- Removed tab section from index.html
- Removed bias-history-hub.js script import
- Functionality lives in arm-history-dashboard.html News Bias tab instead

## [v5.1.1] - 2026-03-26
### arm-history-dashboard: News Bias tab
- New "News Bias" 6th tab in arm-history-dashboard.html
- Section 1: Current Currency Bias — 8-currency grid with score bars, arrow indicators, confidence
- Section 2: Weekly Bias Timeline — table showing week-by-week direction per currency, BF marker for backfill runs
- Section 3: Economic Event Log — all captured releases from bias-history, filterable by currency/result/impact, 500px scrollable
- Lazy loaded on first tab click — no extra requests on page load
- Matches exact dark/light theme, font, card, and table patterns of existing dashboard

## [v5.1.0] - 2026-03-26
### Intel Hub — Pairs Intelligence Dashboard
- New "Intel Hub" tab (desktop + mobile nav) between Performance and Reference
- `js/bias-history-hub.js` — new module, fetches `/bias-history` on tab open
- Section 1: Current Currency Bias — 8-currency grid with score bars, confidence, event count
- Section 2: Weekly Bias Timeline — table showing week-by-week direction per currency, BF marker for backfill runs
- Section 3: Economic Event Log — all captured releases, filterable by currency/result/impact, sticky headers, 500px scrollable
- All sections collapsible, refresh button
- `css/regime.css` — full Intel Hub styles added
- `index.html` — removed Quick News Bias Lookup panel (replaced by Intel Hub)
- `js/news-impact.js` — removed dead quick-bias functions

## [v5.0.9] - 2026-03-26
### Fix: news-bias-engine.js field name mismatch
- Engine was reading `data.pair_verdicts` and `data.currency_bias`
- API returns `data.latest_verdicts` and `data.latest_bias`
- Two-line fix — news bias now populates correctly in armed panel and pre-trade card

## [v5.0.8] - 2026-03-25
### forex_calendar_scraper.py v3.1.0 — backfill 30 days of history
- Added `--backfill` flag to scrape past 4 weeks (configurable via `--backfill-weeks`)
- Stable `run_id` per week (`backfill_YYYYMMDD`) prevents duplicate runs on re-run
- Rate limiting: 2s delay between FF requests
- Uses end-of-week Friday as `run_time` for correct time-decay scoring on historical data
- Skips weeks with zero actuals (too old or future)
- Canary check warns but does not abort on past weeks
- Run once manually: `python3 forex_calendar_scraper.py --unraid --backfill`

## [v5.0.7] - 2026-03-25
### forex_calendar_scraper.py v3.0.0 — HTML scraping, real actuals
- Switch data source from FF XML feed to FF website HTML scraping
- FF XML feed has no `<actual>` field — actuals only exist on the website
- BEAT/MISS/INLINE now sourced directly from FF CSS classes (`better`/`worse`) — no calculation needed
- Time parsing rewritten: uses `data-day-dateline` Unix timestamp + parsed hours/minutes
  - Timezone-agnostic — works correctly regardless of server location
  - German PMI (7:30pm local) → 08:30 UTC verified correct
  - AUD CPI (11:30am local) → 00:30 UTC verified correct
- `UNRAID_BIAS` path fixed: `/data/bias-history.json` → `/mnt/user/appdata/trading-state/data/bias-history.json`
  - Previous path was Docker-internal — scraper was writing to wrong location on host
- Canary check updated for HTML structure markers instead of XML tags
- Requires: `pip install beautifulsoup4 --break-system-packages`

## [v5.0.6] - 2026-03-24
### Fix: structExt missing from candidates in GET /state
- `forex-alert-server/index.js`: candidate response builder now includes `structExt` and `structBars`
- Field was stored in candidates.json but not returned in /state response
- Armed panel will now show FRESH/DEVELOPING/EXTENDED for candidate pairs

## [v5.0.5] - 2026-03-24
### utcc-crypto: BLOCKED alert type/permission mismatch fix
- Same fix as v5.0.4 (metals + bonds) applied to crypto
- `f_buildJson_context(aType, aPermission)` params added -- stops scope-reading stale `resolvedAlertType`/`finalPermission`
- BLOCKED disarm call now passes `(ALERT_BLOCKED, "STAND_DOWN")` explicitly
- `f_buildAlert` BLOCKED call also hardened: `finalPermission` -> `"STAND_DOWN"`
- Indices and forex confirmed clean (use `f_buildJson` with explicit params, no scope-reading bug)

## [v5.0.4] - 2026-03-24
### utcc-bonds + utcc-metals: BLOCKED alert type/permission mismatch fix
- `f_buildJson_context()` now accepts `(aType, aPermission)` params in both indicators
- Replaces scope-read `resolvedAlertType`/`finalPermission` which were stale at BLOCKED disarm time
- CANDIDATE calls pass: `(resolvedAlertType == BLOCKED ? BLOCKED : CANDIDATE, finalPermission)`
- ARMED calls pass: `(resolvedAlertType, finalPermission)`
- BLOCKED disarm calls pass: `(ALERT_BLOCKED, "STAND_DOWN")` -- no more CANDIDATE JSON on BLOCKED header
- `utcc-bonds.pine`: `D-SESSION-RESET` added to disarm reason codes -- fixes `D-UNKNOWN` on session change disarms

## [v5.0.3] - 2026-03-24
### utcc-energy: isArmedRaw/isArmed governance split (Phase 4 hardening)
- `utcc-energy.pine`: renamed internal `isArmed` -> `isArmedState` inside SESSION LOCK block
- Added `isArmedRaw = isArmedState` after lock block (UTCC state only, no governance)
- Added `isArmed = isArmedRaw and finalPermission != "STAND_DOWN"` governance split after priority resolver
- `armedDirection` now zeroed cleanly via governance line, not catch-all guards
- Invariant guard blocks retained as belt-and-suspenders safety net
- Matches bonds indicator Phase 4 governance hardening pattern exactly

## [v5.0.2] - 2026-03-24
### Post-Event Wait Period Enforcement
- `js/news-gate-module.js` v1.3.0: `scanRecentFiredEvents()` blocks pairs after HIGH/CRITICAL events fire, until post-wait elapses
- Post-wait periods: CRITICAL=60m, HIGH=30m, MEDIUM=15m, LOW=0m (from existing IMPACT_BUFFERS config)
- Covers pair-specific AND cross-pair events (NFP fires = all pairs blocked for 60m)
- Returns worst block (longest remaining wait) if multiple events fired
- Verdict: "CROSS-PAIR POST-EVENT WAIT: NFP (USD) fired 23m ago -- 60m wait, 37m remaining"
- `postEvent: true` flag on verdict object; `minutesRemaining` field for countdown display

## [v5.0.1] - 2026-03-24
### Cross-Pair CRITICAL News Enforcement
- `js/news-gate-module.js` v1.2.0: `scanCrossPairCritical()` blocks ALL pairs within 4h of major USD/EUR/GBP events (NFP, CPI, FOMC, PCE, ECB/BoE rate decisions, GDP, Employment Change)
- `CROSS_PAIR_CRITICAL_CURRENCIES` constant: USD, EUR, GBP
- `CROSS_PAIR_CRITICAL_EVENTS` list: 21 event title fragments
- Cross-pair block skips currencies already in the assessed pair (no double-counting)
- Verdict reason clearly labels source: "CROSS-PAIR CRITICAL: NFP (USD) in 2h 30m -- ALL pairs blocked (4h buffer)"
- `crossPair: true` flag on verdict object for downstream display logic

## [v5.0.0] - 2026-03-24
### News Bias Engine + Canary Alerts
- `js/news-bias-engine.js` (new): polls `/bias-history/latest` every 30 min, exposes `window.NewsBiasEngine.getVerdict(pair)` and `getBias(currency)`, graceful fallback if API unreachable
- `js/armed-panel.js`: bias sub-row per armed pair showing base/quote currency bias, net score, confluence vs UTCC direction (green=ALIGNED, amber=NEUTRAL, red=CONFLICTING)
- `js/pre-trade.js`: `renderBiasCard(pair)` renders news bias card in pre-trade tab; expandable events list; size modifier advisory if CONFLICTING
- `index.html`: bias card HTML injected before gate divider; val-pair onchange calls renderBiasCard; news-bias-engine.js script import added
- `js/news-impact.js`: `checkScraperHealth()` fetches `./scraper_health.json` -- sets red badge + toast if `status: MARKUP_CHANGED`; runs on every calendar status update
- `forex-alert-server/index.js`: `pushScraperError()` push function added; `SCRAPER_ERROR` type handled in `/push/notify` endpoint
- `sw.js`: `SCRAPER_ERROR` notification click routes to `/?tab=daily-context`
- `css/dashboard.css`: `.armed-pair-wrapper`, `.armed-bias-row` styles
- `css/pre-trade.css`: `.bias-ccy-pill`, `.bias-event-row`, `.bias-event-title`, `.bias-event-result` styles

## [v4.9.1] - 2026-03-24

### Added - News Bias Engine (Session 1)

**forex_calendar_scraper.py (v2.0.0):**
- `actual` field now captured from FF XML feed for past events
- `result` field added: BEAT / MISS / INLINE / UNKNOWN (actual vs forecast/previous)
- Bias scoring engine: per-currency score weighted by impact (High x3, Medium x1) and time decay (1.0 -> 0.2 over 7 days)
- `bias-history.json` append on every run (90-day rolling window)
- `currency_bias` and `pair_verdicts` now embedded in `calendar.json` for frontend consumption
- Canary health check: validates XML feed structure before parsing; aborts and writes `scraper_health.json` if markup changed
- `--bias-history` CLI flag for custom output path; `--unraid` flag for Docker volume paths

**forex-alert-server/index.js (v2.6.0):**
- `BIAS_HISTORY_FILE` constant: `/data/bias-history.json`
- `loadBiasHistory()`, `getCurrentPairVerdicts()`, `getCurrentCurrencyBias()` helper functions
- `GET /bias-history` endpoint: full history filterable by `?days=30&pair=AUDUSD&currency=AUD`
- `GET /bias-history/latest` endpoint: lightweight current bias for FCC armed panel
- `news_bias` snapshot baked into every arm event at webhook time: direction, net_score, strength, confluence (ALIGNED/NEUTRAL/CONFLICTING), size_modifier, base/quote bias

**js/news-gate-module.js:**
- Background news poller added: checks armed pairs + open journal trades every 5 minutes
- Fires `NEWS_WARNING` push notification when high-impact news within 2 hours
- Respects existing 15-minute per-pair push cooldown and user notification preferences
- Starts automatically 3 seconds after module init (allows calendar data to load first)

**css/base.css:**
- Added `overflow-x: hidden` to `body` to prevent intermittent desktop layout on Android PWA

## [v2.6.x+1] - 2026-03-22
### Changed (Pine Script -- utcc-energy + utcc-bonds)
- **struct_ext persistence arming (v2.0 state machine)** -- energy and bonds migrated from simple lockedDirection pattern to metals-canonical state machine
- **New inputs**: disarmScoreThreshold, efficiencyThreshold, upgradePersistence (GRP_LOCK v2.0 group)
- **Structural damage detection**: emaCompressed, mtfBroken, efficiencyCollapse -- disarm only fires when BOTH score drop AND structural damage present
- **Persistence gating**: barsAboveThreshold must reach upgradePersistence before arming; prevents premature locks
- **Bonds**: state machine outputs to isArmedRaw; governance split at line ~1094 (isArmedRaw → isArmed) preserved intact
- **Energy**: state machine outputs directly to isArmed (no isArmedRaw split); regimeAllowsArming veto included inline
- **candidateMeetsLong/Short**: lockedDirection → armedDirection on both files
- **playbookShort**: lockedPlaybook → currentPlaybook on both files
- **currentPlaybook**: rewritten to atrState-based logic (CONTINUATION/DEEP PULLBACK/OBSERVATION ONLY/STAND DOWN)
- **Diag table**: Persistence and Structural Damage rows added to both files
- **Removed**: DIRECTION-FLIP / D-SESSION-CONFLICT disarm branches (superseded by structural damage logic)

## [v4.8.2] - 2026-03-17

## [v4.9.0] - 2026-03-21
### Added
- **STRUCT column** in armed instruments panel (between ATR and Age) -- displays FRESH (green), DEVELOPING (amber), EXTENDED (red) from struct_ext payload; advisory only, no gate yet
- **struct_ext label** on each armed pair chip in Quick Access Bar -- same colour coding

## [v2.6.x] - 2026-03-21
### Added (Pine Script -- all 6 UTCC indicators)
- **Structural Extension tracking**: ribbon touch detection (close enters fast/slow EMA band), bars since last touch, cumulative move as ATR multiples
- **structVerdict**: FRESH (<1.0x ATR), DEVELOPING (1.0-2.0x), EXTENDED (>2.0x)
- **Payload fields**: struct_ext (verdict string) and struct_bars (bar count since last ribbon touch)


### PATCH - Regime label audit: full consistency pass across all files

**trading-guide.js:**
- Entire guide rewritten from old 4-regime model (EXPANSION/BALANCED/CONTRACTION/TRANSITION) to correct 6-regime model
- Regime definitions, permission matrix, and playbook quick reference all updated
- Removed non-existent "Range Fade" playbook
- ROTATION, COMPRESSION, DISTRIBUTION, UNCLEAR all now correctly documented

**journal-crud.js:**
- `'balanced'` regime check replaced with `'rotation'` and `'distribution'`

**css/modals.css:**
- Replaced `state-balanced`, `state-contraction` CSS classes with `state-rotation`, `state-compression`, `state-distribution`, `state-unclear`

**css/regime.css:**
- Replaced `regime-state-balanced` with correct 6-regime class set
- Same for `.context-value.regime-*` selectors

**index.html:**
- Tooltip text: "Contraction regime" -> "Compression", "Balanced regime" -> "Rotation"

---

## [v4.8.1] - 2026-03-16

### PATCH - Fix sortable trade history: expose sortTradeHistory on window

**journal-crud.js:**
- `sortTradeHistory()` exposed as `window.sortTradeHistory` so inline `onclick` handlers in index.html can reach it
- Was silently failing due to module scope

**index.html:**
- Sortable `<th>` elements given hover cursor style via inline CSS

---

## [v4.8.0] - 2026-03-16

### MINOR - EMA cloud location gate: Cloud Touch / Clean Pullback / Stretched / Chasing

**pre-trade.js:**
- New EMA location field with 4 states: Cloud Touch, Clean Pullback, Stretched, Chasing
- Chasing = hard-blocked at execution (R:R typically impossible from that distance)
- Stretched = requires manual acknowledgement checkbox before execution proceeds
- Location stored in pre-trade state and visible in checklist summary

**execute-integration.js:**
- Location gate added to `runPreTradeValidation()`: Chasing returns false with clear error message
- Stretched requires checkbox acknowledgement flag before allowing proceed

---

## [v4.7.1] - 2026-03-16

### PATCH - Legacy cleanup: RegimeModule fully removed

**circuit-breaker-integration.js:**
- Removed `hasRegime` dependency check from `waitForDependencies()`
- Deleted `integrateWithRegime()` function (was wrapping dead RegimeModule methods)
- Deleted `hookSessionStart()` function (was polling dead `ftcc_regime` localStorage key)
- Removed both calls from `init()`

**index.html:**
- Removed `<script src="js/regime-module.js"></script>` (line 3124)

**regime-module.js:**
- File deleted from repository (`git rm`)

All other regime-module.js removal work (institutional-checklist.js, playbook-module.js, trade-capture.js, stop-loss-exit.js, daily-context.js) was completed in prior session.

## [v4.7.0] - 2026-03-16

### MAJOR - F2: Server-side permission gate; authoritative canExecuteTrade endpoint

**storage-api.php:**
- New `?action=canExecuteTrade` endpoint — reads circuit-breaker.json and daily-context.json directly from disk
- Checks in order: review required → stand-down active → leakage lockout → no active session → briefing not locked → stale briefing → STAND_DOWN permission
- Fail-closed on everything: missing file = blocked, no session = blocked, STAND_DOWN = blocked
- Browser localStorage has zero input into this decision

**execute-integration.js:**
- `runPreTradeValidation()` converted to async
- Browser-side `CircuitBreaker.canTrade()` call removed — was the multi-device bypass gap
- Button shows "Checking..." while awaiting server response
- Fail-closed: server unreachable = blocked with clear error message

**server-storage.js:**
- Added `fcc_daily_context` → `daily-context` to STORAGE_MAP
- Daily context now auto-polled every 30s alongside circuit-breaker (was manual sync only)

**Infrastructure (manual):**
- Cloudflare Access applied to API endpoints (forex.pineros.club/api/*)

## [v4.6.1] - 2026-03-16

### PATCH - P0 fixes: R:R hard block; sortable trade history headers

**execute-integration.js:**
- R:R < 1.5 converted from warning to hard block — returns false, shows error notification
- Message: "Trade blocked: R:R is X.XX — minimum 1.5:1 required. Rework your levels."

**journal-crud.js:**
- Added `sortTradeHistory()`, `applyTradeSort()`, `updateSortHeaders()` functions
- Sortable columns: Date, Pair, Dir, Grade, R-Multiple, Score, Zone
- Click header to sort, click again to reverse; active column shows ▲/▼, inactive shows ▸
- Default sort: Date descending (newest first)

**index.html:**
- Trade history table headers updated with IDs, onclick handlers, and sort arrow indicators

## [v4.6.12] - 2026-03-14

### AUDIT - Full cross-indicator review: all 6 UTCC indicators verified consistent

**Checked across utcc-forex, metals, indices, energy, bonds, crypto:**
- ATR labels (IDEAL/NORMAL/ELEVATED/EXHAUSTED): identical in all 6
- vol_state / vol_behaviour / vol_level JSON payload fields: consistent
- allCriteriaMet definition (4 criteria): consistent
- strongBullish/Bearish and perfectBullish/Bearish firing conditions: consistent
- STAND_DOWN enforcement blocks arming in all 6 (different code paths, same outcome)

**Intentional differences (by design):**
- Score thresholds differ per asset class (forex 80, metals 76, indices 75, energy 78, bonds 70, crypto 85)
- regimeAllowsArming gate style varies slightly per indicator; outcome is identical

**No bugs found. All 6 indicators are consistent.**

## [v4.6.11] - 2026-03-14

### PATCH - utcc-forex.pine: remove dead criteriaMet == 5 branch

**utcc-forex.pine:**
- criteriaMet max is 4 (comment already said "NOW 4 CRITERIA") but == 5 branch was never removed
- Deleted == 5 block; promoted its Textbook/Strong/Good quality labels into the == 4 (all criteria met) path
- == 3 now handles the one-missing-criteria logic (was == 4)
- == 2 now handles the borderline case (was == 3)
- else handles 1 or fewer (unchanged logic)
- Fixed stale comment: "all 5 criteria" -> "all 4 criteria"

## [v4.6.10] - 2026-03-14

### PATCH - ATR tier labels unified across all panels

**index.html:**
- Reverted v4.6.8 label changes to match armed-panel.js exactly
- LOW ACTIVITY -> IDEAL, ACTIVE -> ELEVATED, OVERSTRETCHED -> EXHAUSTED
- All ATR tiers now consistent: IDEAL / NORMAL / ELEVATED / EXHAUSTED everywhere

## [v4.6.9] - 2026-03-14

### PATCH - Watchlist ATR column showing volBehaviour instead of ATR tier

**forex-alert-server/index.js:**
- Candidates (watchlist) response builder was missing `volLevel` field
- Armed pairs response included `volLevel`; candidates did not -- causing `atrPct` to be null
- `buildRow` fell through to `atrBehav` (TREND/QUIET etc) instead of deriving IDEAL/NORMAL/ACTIVE/OVERSTRETCHED tier
- Fix: added `volLevel: d.volLevel || ''` to candidates response object (line ~831)

## [v4.6.8] - 2026-03-14

### MINOR - FCC audit fixes: plain-English labels, tooltips, verdict pills

**gold-nugget-principles.js:**
- Rewritten principle: 'Convert leakage from informational -> regulatory' -> 'Bad behaviour must have consequences. Logging a rule break without acting on it is pointless.'

**index.html - ATR tier labels:**
- COMPRESSED -> LOW ACTIVITY
- ELEVATED -> ACTIVE
- EXHAUSTED -> OVERSTRETCHED

**index.html - UI label renames:**
- Kill Zone Indicator -> Session Hot Zone (with tooltip)
- Scale-In -> Split Entry (button label + protocol header; with title tooltip)
- Session-Pair Rating label now has tooltip explaining session liquidity fit

**index.html - Verdict pills (pre-trade checklist summary):**
- Armed -> UTCC
- EMAs -> MAs Lined Up
- Failed -> Failed Move
- Lag -> Not Chasing
- RSI -> Momentum
- 48h -> Cooling

**index.html - R:R labels:**
- 'Reward to TP1' -> 'Potential Gain to Target 1'
- 'R:R to TP1' -> 'Reward vs Risk (TP1)'

**index.html - ATR plain English explanation:**
- Added descriptive subtitle under ATR Volatility Check panel explaining what ATR percentile means in plain terms


## [v4.6.7] - 2026-03-14

### PATCH - Journal bug fixes: No UTCC false flag, duplicate entries, history table not refreshing

**No UTCC false flag (broker-dashboard.js):**
- `hasUtcc` was derived solely from `trendScore`, which is null if alert queue expired before trade closed
- Added `utccArmed` boolean field set at journal creation time — true if any alertData or utccState was present
- `_updateExistingEntry` also sets `utccArmed: true` when alert data is found
- `hasUtcc` now checks `utccArmed || trendScore || utccTier || alertId` — UTCC badge shows correctly

**Duplicate journal entries (broker-dashboard.js):**
- Two `broker:tradeclose` listeners were registered: one in `setupEventListeners` (line 246) and one in `AutoJournal.init` (line 738)
- Both fired on every trade close, `_processedIds` Set only prevented duplicates within same session
- Removed redundant backup listener from `AutoJournal.init` — `setupEventListeners` is the sole handler

**Trade history table not refreshing (journal-crud.js):**
- `journal:entry` event was only handled by `server-storage.js` (to trigger a save) — no re-render of the table
- Added `window.addEventListener('journal:entry')` at end of `journal-crud.js` that calls `loadTrades()` with 500ms delay
- History table now updates automatically when auto-journal writes a new entry



### PATCH - Armed panel ATR labels aligned to UTCC Pine Script + FAB base CSS fix + Badge API

**Armed panel ATR labels (armed-panel.js):**
- Labels now match UTCC Pine Script (`atrGuidance`) exactly — 4 tiers:
  - IDEAL (<30%ile) — lime — expansion likely
  - NORMAL (30–59%ile) — green — proceed full size
  - ELEVATED (60–79%ile) — amber — reduce size 50%
  - EXHAUSTED (≥80%ile) — red — pass or exit only
- Percentile shown as subtitle (e.g. `47%ile`) under each label
- Previous labels (IDEAL/LOW/EXHAUSTED with wrong thresholds) removed

**FAB overlap fix (dashboard.css):**
- `.fab-calendar` had no base `position: fixed` — only existed in mobile media queries
- Added full base CSS: position, size, colours, z-index, hover state
- Calendar FAB now correctly stacks above armed FAB on all screen sizes

**Badge API (sw.js + pwa-notifications.js + alert server index.js):**
- Alert server includes `armedCount` in ARMED push payload data
- SW sets `navigator.setAppBadge(armedCount)` on push receive
- Foreground polling: `pwa-notifications.js` polls `/state` every 60s and updates badge
- Badge clears on `visibilitychange` (app focus) and notification click

### Files changed
- `forex-command-centre/src/js/armed-panel.js`
- `forex-command-centre/src/css/dashboard.css`
- `forex-command-centre/src/sw.js`
- `forex-command-centre/src/js/pwa-notifications.js`
- `forex-alert-server/index.js`

---

## [v4.6.5] - 2026-03-11

### MINOR - PWA Badge API + FAB mobile layout fix

**Badge API (armed-panel.js):**
- `navigator.setAppBadge(armedCount)` called after every poll cycle
- Badge shows number of armed instruments on app icon (Android Chrome PWA)
- Clears automatically when armed count returns to 0
- Gracefully skipped on browsers that don't support the Badging API

**FAB mobile layout fix (layout.css):**
- FABs were overlapping at the same bottom position side-by-side
- Fixed: stacked vertically on mobile (<=768px) — calendar above, target below
- Both FABs shrunk to 48px on mobile (was 56px)
- Calendar sits at QAB + 16px + 48px (armed) + 12px from bottom
- Armed sits at QAB (48px) + 16px from bottom
- Fixed in both 768px breakpoint blocks (were duplicated with same bug)

### Files changed
- `forex-command-centre/src/js/armed-panel.js`
- `forex-command-centre/src/css/layout.css`

---

## [v4.6.4] - 2026-03-11

### MINOR - Mobile hamburger menu replaces scrolling tab bar

- Desktop (>768px): tabs unchanged
- Mobile (<=768px): tabs hidden, hamburger button shown in header
- Tap hamburger -> slide-in drawer from right (280px wide, 85vw max)
- Backdrop overlay closes menu on tap outside
- Hamburger animates to X when open
- Drawer items: icon + label, active state highlighted in green
- UTCC Guide button in drawer footer
- Header row stays single-line on mobile (title + quick actions + hamburger)
- Guide button hidden from header on mobile (moved to drawer)
- Theme buttons hidden on mobile (use Settings tab)
- Mobile menu active state stays in sync when showTab called from elsewhere in code

### Files changed
- `forex-command-centre/src/index.html`
- `forex-command-centre/src/css/layout.css`

---

## [v4.6.3] - 2026-03-11

### MINOR - PWA pref-aware push + mobile UI optimisation

**ARMED/FOMO pref fix (alert server + client):**
- sendPushToAll() now accepts a prefKey parameter
- Each push function (pushArmed, pushFomoCleared, pushNewsWarning, pushCircuitBreaker) passes its prefKey
- Server checks per-subscription prefs before sending — skips if disabled
- Client attaches current prefs object when saving/updating subscription
- FCCPushPrefs.save() re-sends subscription to server with updated prefs immediately on toggle change
- Result: disabling ARMED in settings actually stops server from sending that push

**Mobile UI optimisation (layout.css):**
- Tab bar: larger touch targets (36px min-height), thinner gap, accent-coloured scrollbar indicator
- Header: compact padding on mobile, quick action buttons smaller
- Forms: font-size 1rem on inputs/selects (prevents iOS auto-zoom on focus)
- All inputs/selects: 44px min-height (Apple HIG minimum touch target)
- Select/dropdown: larger green chevron (16px), better contrast, green focus ring
- Checkboxes: 20px touch target, larger label font
- Buttons: 44px min-height on mobile
- Grid: single column below 480px always
- Cards: tighter padding below 480px
- Container: tighter horizontal padding on small screens

### Files changed
- `forex-alert-server/index.js`
- `forex-command-centre/src/js/pwa-notifications.js`
- `forex-command-centre/src/css/layout.css`

---

## [v4.6.2] - 2026-03-11

### PATCH - Add mobile-web-app-capable meta tag

- Added `<meta name="mobile-web-app-capable">` alongside existing Apple tag
- Removes deprecation warning in Chrome DevTools

### Files changed
- `forex-command-centre/src/index.html`

---

## [v4.6.1] - 2026-03-11

### PATCH - PWA: News gate + circuit breaker push wiring, settings panel, FCCPushPrefs

**News gate push (news-gate-module.js):**
- Hook into logDecision() — fires NEWS_WARNING push whenever verdict transitions to RED
- 15-minute per-pair cooldown prevents spam on 30-min calendar refresh cycles
- Respects FCCPushPrefs.newsWarning toggle

**Circuit breaker push (circuit-breaker-module.js):**
- Hook at all three daily loss thresholds:
  - -3% RISK CAP: push title 'Risk Cap Applied'
  - -5% STAND-DOWN: push title 'Stand-Down Activated'
  - -10% EMERGENCY: push title 'EMERGENCY STAND-DOWN' (louder vibrate pattern)
- Respects FCCPushPrefs.circuitBreaker toggle

**Alert server (index.js v2.5.0 → patch):**
- pushCircuitBreaker() updated to use level field (EMERGENCY/STANDDOWN/CAP)
- Level-specific titles and vibration patterns
- Unique tags per level to prevent notifications overwriting each other

**Push settings panel (index.html + pwa-notifications.js):**
- New settings card in Settings tab: '&#x1F514; Push Notifications'
- Status badge: Active / Not enabled / Blocked
- Enable button + Test button (sends test push via /push/notify)
- Four toggles: ARMED, FOMO Cleared, News Warning, Circuit Breaker
- FCCPushPrefs global: get(), save(), loadIntoUI(), updateSettingsUI(), requestPermission(), sendTest()
- Settings panel auto-updates when permission state changes

### Files changed
- `forex-command-centre/src/index.html`
- `forex-command-centre/src/js/pwa-notifications.js`
- `forex-command-centre/src/js/news-gate-module.js`
- `forex-command-centre/src/js/circuit-breaker-module.js`
- `forex-alert-server/index.js`

---

## [v4.6.0] - 2026-03-11

### MINOR - PWA Push Notifications: ARMED, FOMO gate cleared, News warning, Circuit breaker

Converted FCC to a Progressive Web App (PWA) with background push notifications.
No separate Android app required — installs directly from Chrome to home screen.

**New files (frontend):**
- `manifest.json` — PWA install config (name, icons, display mode, theme colour)
- `sw.js` — Service worker: push handler, app shell caching, offline resilience
- `icons/icon-192.png` — App icon (192x192)
- `icons/icon-512.png` — App icon (512x512)
- `js/pwa-notifications.js` — Client-side: SW registration, push subscription, permission UI

**Modified files (frontend):**
- `index.html` — Added manifest link, Apple PWA meta tags, pwa-notifications.js import

**Alert server changes (v2.5.0):**
- Added `web-push` npm dependency for VAPID-based push delivery
- VAPID key pair generated and baked into server config
- New subscription storage: `/data/push-subscriptions.json`
- New endpoints: `POST /push/subscribe`, `POST /push/notify`
- ARMED webhook now fires immediate push to all subscribers
- FOMO gate: 1-hour setTimeout fires FOMO Cleared push automatically
- FOMO timer cancelled if pair is BLOCKED before hour elapses
- Dead subscriptions (410/404) auto-cleaned from storage

**Notification types:**
- ARMED — fires immediately on TradingView webhook (requireInteraction: true)
- FOMO_CLEARED — fires exactly 1 hour after ARMED
- NEWS_WARNING — triggered by FCC frontend
- CIRCUIT_BREAKER — triggered by FCC frontend on drawdown threshold

**Install to home screen:** Chrome three-dot menu → Add to home screen

### Files changed
- `forex-command-centre/src/index.html`
- `forex-command-centre/src/sw.js` (new)
- `forex-command-centre/src/manifest.json` (new)
- `forex-command-centre/src/icons/icon-192.png` (new)
- `forex-command-centre/src/icons/icon-512.png` (new)
- `forex-command-centre/src/js/pwa-notifications.js` (new)
- `forex-alert-server/index.js` (v2.4.1 → v2.5.0)
- `forex-alert-server/package.json`

---

## [v4.5.4] - 2026-03-11

### MINOR - All 6 UTCC indicators: vol_behaviour + vol_level in webhook payload

ATR state and percentile level were missing from webhook payloads in all 6 indicators.
FCC armed panel showed -- for ATR column despite data being available in the indicator.

**Changes per indicator:**
- utcc-forex: Added vol_behaviour + vol_level params to f_buildJson signature and all 5 call sites
- utcc-indices: Added vol_behaviour + vol_level to f_buildJson output
- utcc-metals/energy/bonds/crypto: Added f_buildJson_context() function; all alert() calls
  now append JSON context block after the text header

**Result:** Armed panel ATR column now populates for all asset classes on new alerts.
vol_behaviour = atrState (TREND/QUIET/EXPLODE/MIXED), vol_level = atrPercentile (0-100)

### Files changed
- `utcc-indicators/utcc-forex.pine`
- `utcc-indicators/utcc-indices.pine`
- `utcc-indicators/utcc-metals.pine`
- `utcc-indicators/utcc-energy.pine`
- `utcc-indicators/utcc-bonds.pine`
- `utcc-indicators/utcc-crypto.pine`

---

## [v4.5.3] - 2026-03-10

### PATCH - Armed Panel: Clickable rows + native TradingView app link

- Entire armed/watchlist row is now a clickable button - click anywhere to open chart
- Subtle slide-right hover effect for visual feedback
- On mobile: attempts to open TradingView native app first, falls back to web browser after 600ms
- On desktop: opens TradingView web chart directly (OANDA:PAIR, 4H)
- Removed standalone TV icon column - row itself is the link

### Files changed
- `forex-command-centre/src/js/armed-panel.js`
- `forex-command-centre/src/css/dashboard.css`

---

## [v4.5.2] - 2026-03-10

### PATCH - Armed Panel: ATR column + TradingView chart link

**Changes:**
- Added ATR column to Armed Instruments panel showing volBehaviour state (colour-coded)
  and volLevel percentage at time of alert - TREND (green), EXHAUSTED (red), SPIKE (orange),
  EXPANDING_FAST (yellow), EXPANDING_SLOW (light green), CONTRACTING (muted)
- Added TradingView chart link per row - opens OANDA:PAIR on 4H chart in new tab
- Updated grid column template (9 columns) across all responsive breakpoints
- ATR and TV columns hidden on screens below 450px

### Files changed
- `forex-command-centre/src/js/armed-panel.js`
- `forex-command-centre/src/css/dashboard.css`

---

## [v4.5.1] - 2026-03-08

### PATCH - Alert Server Deployment Fix + Data Persistence Bug

**Deployment issue:** Alert server was reading from `/mnt/user/appdata/trading-state/`
(original container mount), not the newer `forex-alert-server/` folder. File had to be
copied to the correct path before `docker restart trading-state` took effect.

**Critical persistence bug fixed:**
All five data files in `forex-alert-server/index.js` were writing to `/app/` inside
the container instead of `/data/` (the mounted volume). This meant arm-history.json,
structure.json, armed.json, utcc-alerts.json, and candidates.json were all lost on
every container restart. Weeks of arm history would have been silently wiped.

### Fixed
- `forex-alert-server/index.js` v2.4.1:
  - `STATE_FILE`: `/app/armed.json` → `/data/armed.json`
  - `UTCC_FILE`: `/app/utcc-alerts.json` → `/data/utcc-alerts.json`
  - `CANDIDATE_FILE`: `/app/candidates.json` → `/data/candidates.json`
  - `STRUCTURE_FILE`: `/app/structure.json` → `/data/structure.json`
  - `ARM_HISTORY_FILE`: `/app/arm-history.json` → `/data/arm-history.json`

### Deployment note
After deploying v2.4.1: copy the new `index.js` to
`/mnt/user/appdata/trading-state/index.js` then `docker restart trading-state`.
Verify with `curl https://api.pineros.club/arm-history`.

---

## [v4.5.1] - 2026-03-08

### PATCH - Alert Server data path fix

**Problem:** `arm-history.json` and `structure.json` were writing to `/app/` inside
the container — wiped on every restart. No arm history would have survived.

**Fix:** Both file paths corrected to `/data/` (the mounted volume at
`/mnt/user/appdata/trading-state/data/`). Data now persists across restarts.

- `forex-alert-server/index.js` v2.4.1
  - `STRUCTURE_FILE` → `/data/structure.json`
  - `ARM_HISTORY_FILE` → `/data/arm-history.json`

Fix applied via `sed` on live server then version bumped in repo to stay in sync.

---

## [v4.5.0] - 2026-03-07

### MINOR - Structure Gate + Arm History Intelligence

Two major additions this session: a hard location veto gate in the Pre-Trade workflow,
and a full pair intelligence dashboard built on expanded arm event data.

---

### Structure Gate (New Feature)

**Problem:** UTCC score 87, all 5 criteria pass — trade taken straight into unmarked
resistance. Location check was entirely discretionary. Zero enforcement.

**Fix:** ProZones now fires dynamic JSON alert payloads to the alert server whenever
price enters the danger zone of a STRONG structure level. Alert server stores the
data per pair with 4h TTL. FCC Pre-Trade tab reads it and renders a hard veto banner
before the institutional checklist runs.

**Gate decisions:**
- LONG + AT RESISTANCE → **BLOCK** (red, execution disabled)
- SHORT + AT SUPPORT   → **BLOCK** (red, execution disabled)
- Approaching strong zone (LONG + wrong direction) → **WARN** (amber)
- MID-RANGE → **WARN** (grey, no structural edge)
- NO_DATA / API error  → **WARN** (amber, fail-closed — never silent pass)

**New files:**
- `forex-command-centre/src/js/structure-gate.js` v1.0.0
  - `window.structureGate.checkPair(pair, direction)` — fetches `/structure?pair=X`
  - Evaluates verdict + direction → renders banner in `#structure-gate-banner`
  - 60-second client-side cache
  - Exposes `window._structureGateResult` for checklist integration
  - Fail-closed: API error → WARN (never silent pass)

**Modified files:**
- `forex-command-centre/src/index.html`
  - Added `<div id="structure-gate-banner">` after news-gate-warning-container
  - Added `<script src="js/structure-gate.js">` import
- `forex-command-centre/src/js/institutional-checklist.js` v2.2.0
  - Structure gate check fires before Check 1 if `window.structureGate` is defined
  - Normalises direction from dropdown value
- `utcc-indicators/multi-touch-zones.pine` v3.5.0
  - Replaced static `alertcondition()` calls with dynamic `alert()` firing on
    `barstate.isconfirmed` when price enters alert range of STRONG zone
  - JSON payload: `{"type":"structure","pair":"...","zone":"...","strength":"STRONG","dist_atr":...,"tr":"...","verdict":"..."}`
  - Zone label accounts for broken zone role-flip (BROKEN_SUP / BROKEN_RES)
  - TradingView alert setup: "Any alert() function call" → `https://api.pineros.club/webhook/structure`

---

### Alert Server v2.2.0 → v2.4.0

**v2.2.0** — Structure Gate backend:
- `POST /webhook/structure` — receives ProZones payload, stores per pair with 4h TTL
- `GET /structure?pair=X` — returns verdict; `NO_DATA` if not found, `EXPIRED` if stale
- `structure.json` state file, cleanup interval

**v2.3.0** — Arm History:
- Every ARMED event now permanently appended to `arm-history.json`
- `appendArmEvent()` captures: pair, direction, score, session, entryZone, volState, permission, timestamp
- `GET /arm-history?days=30&pair=X` — returns events + frequency tally with avgScore, direction counts, session breakdown

**v2.4.0** — Arm History expanded capture (this session):
- `appendArmEvent()` now captures full institutional context per arm event:
  - **Time context (derived):** dayOfWeek, hourUTC, weekNumber, month
  - **Setup quality:** score, criteria count (5/5), MTF alignment (3/3), direction, entryZone
  - **Volatility:** volState, volBehaviour, volLevel percentile
  - **Momentum:** RSI at arm time
  - **Session/regime:** session, primary, playbook
  - **Risk state:** riskState, riskMult, maxRisk, permission
- Tally aggregation expanded: avgRsi, avgRiskMult, peakHourUTC, topPlaybook, topVolState,
  qualityRate (5/5 criteria %), impairedRate (arms where riskMult < 1.0), day-of-week counts

**Modified file:**
- `forex-alert-server/index.js` v2.4.0

---

### Arm History Dashboard v1.0.0 → v1.2.0

**New file:** `forex-command-centre/src/arm-history-dashboard.html`

Full pair intelligence dashboard with five tabs:

1. **Overview** — 6 stat cards (total arms, top pair, avg score, long bias, 5/5 quality %, impaired arms %) + ranked frequency table + session heatmap
2. **Pair Breakdown** — per-pair deep dive: summary stats, playbook distribution, sessions + vol state, direction/risk split
3. **Timing** — day-of-week grid, UTC hour distribution (all pairs), session breakdown
4. **Setup Quality** — playbook distribution, vol state at arm, entry zone quality (HOT/OPTIMAL/ACCEPTABLE/EXTENDED), risk state breakdown (1.0R / 0.75R / 0.5R), direction bias per pair
5. **Raw Events** — last 100 arm events with all captured fields

**v1.1.0:** Expanded tally fields to match v2.4.0 server capture (RSI, risk mult, playbook, vol, day, hour)

**v1.2.0:** Full FCC theme parity
- Replaced custom dark aesthetic with exact FCC CSS variables: `--bg-primary/secondary/tertiary`, `--text-primary/secondary/muted`, `--border-primary`
- Fonts: `JetBrains Mono` (headings/mono) + `Inter` (body) — matches FCC exactly
- Status colours: `--color-pass/fail/warning/info/perfect` — identical to FCC
- `data-theme="dark"` / `data-theme="light"` toggle in header (☽/☀)
- Theme preference saved to localStorage
- Demo mode renders on API unavailable so layout is always visible

---

## [v4.4.5] - 2026-03-02

### PATCH - Gold Nugget Reminder Fixes

**Problem:** Gold Nugget popup never showed after first trigger. Three bugs:

### Fixed

- **gold-nugget-reminder.js v1.2.0:**
  - localStorage date check was broken: checked if ANY value existed (permanent block after first show). Now correctly compares stored date to today's date
  - "Another One" button stacked modals without removing existing one. Now cleans up before creating new modal
  - Changed from once-per-day to max 4 shows per day with 50% probability (was 30%)
  - Tracks show count per day via JSON object in localStorage

- **gold-nugget-principles.js v1.1.0:**
  - Raw emoji characters in formatPrincipleForDisplay replaced with Unicode escapes to prevent UTF-8 encoding corruption

---

## [v4.4.4] - 2026-03-02

### MINOR - Dashboard Event Widget v2.1.0

**Purpose:** Full CRITICAL event visibility with context data for pre-trade news assessment.

### Changed

- **dashboard-event-widget.js v2.1.0:** Complete rewrite
  - Shows ALL CRITICAL events for the week (was: only next single event)
  - Collapsible list: next 3 events visible, expand toggle for rest
  - Each row shows: currency badge, title, day/time AEST, forecast, previous, countdown
  - Click any event to expand: Measures, Usual Effect, threshold notes
  - 49 event reference entries covering all major releases across 8 currencies
  - Colour-coded urgency: red (< 4h), amber (< 24h), grey (> 24h)
  - Update interval reduced from 30min to 15min

---

## [v4.4.3] - 2026-03-02

### PATCH - CRITICAL: News Calendar Pipeline Fix

**Problem:** News Gate Module was fail-OPEN. Stale calendar data (Jan 10) loaded
silently, showed "No CRITICAL events in next 7 days" during NFP week. All pairs
passed news safety with zero protection.

### Root Cause

Three cascading failures:
1. Scraper wrote to non-existent `src/data/` directory (silently failing since Jan)
2. `news-impact.js` found stale Jan file as last fallback path, loaded successfully
3. Dashboard filtered `eventTime > now` on Jan dates = zero matches = false "all clear"

### Fixed

- **forex_calendar_scraper.py:** Path resolution now uses `os.path.abspath(__file__)`
  relative to script location, not CWD. Default output: `<project>/src/calendar.json`.
  Dual-write to `<project>/data/calendar.json` as backup. Safe to run from anywhere.

- **news-impact.js:** `LIVE_CALENDAR_DATA` changed from `let` to `window.` property
  (other modules were checking `window.LIVE_CALENDAR_DATA` which was undefined).
  Path order fixed: `./calendar.json` primary (was last fallback). Staleness detection
  added with 48h threshold. Status indicator shows amber when stale.

- **dashboard-event-widget.js v1.1.0:** Staleness check before display. Stale data
  shows amber warning instead of false "all clear". Calendar offline shows red warning.

- **news-gate-module.js v1.1.0:** Changed from fail-OPEN to fail-CLOSED.
  Missing calendar: `safe: false` (was `safe: true`).
  Stale calendar (>48h): `safe: false` with explicit reason.

- **User Scripts (Unraid):** Scraper cron path updated from old `forex-tools/` to
  `forex-command-centre/backend/scripts/`. Schedule: `0 */6 * * *` (every 6h).

### Security Impact

- **Before:** Stale/missing calendar = trades allowed (fail-open)
- **After:** Stale/missing calendar = all pairs blocked (fail-closed)
- Consistent with Risk Committee: "Fail-closed; missing context = no trade"

---

## [v4.4.2] - 2026-03-01

### PATCH - Gold Nugget Simplification + News Protocol Guide + Bug Fixes

**Purpose:** Simplify institutional principles to plain language, add news day protocol to trading guide, fix remaining widget bugs.

### Changed

- **gold-nugget-principles.js:** Complete rewrite for simplicity
  - Old: Formal institutional language
  - New: Simple, direct, everyday language anyone can understand
  - Example: "If you cannot name the playbook before seeing UTCC, you do not trade" instead of formal jargon
  - All 40+ principles now plain English, actionable, memorable
  - Removed technical jargon, use "do not" instead of "cannot"

- **trading-guide.js:** Added "News Day Protocol" section
  - Step 1: Map Your Week (identify CRITICAL events)
  - Step 2: Run Daily Context + Game Plan
  - Step 3: Pre-Event Day Protocol (3h before, close at breakeven)
  - Step 4: During Event (hands off, no watching)
  - Step 5: Post-Event Assessment (check structure, reassess)
  - Three options: Reduce Size (1%), Skip Pairs, Stand Down
  - Key principle: "Pre-decide everything, execute with no emotion"

### Fixed

- **gold-nugget-principles.js emoji corruption:**
  - Original file had raw emoji characters (⚠️, ⚡, 💡) causing UTF-8 encoding errors
  - Browser would not parse file due to syntax errors
  - Fixed: Converted all emoji to Unicode escape sequences (\u26A0, \u26A1, \u1F4A1)
  - File now loads without errors

### User-Facing Changes

1. **Dashboard:** Event widget correctly shows "No CRITICAL events in next 7 days" when clear
2. **Trading Guide:** New "News Day Protocol" tab accessible from guide button
3. **Gold Nuggets:** All 40+ principles now in simple, direct language
4. **Reminder Modal:** Shows simplified principles that are easy to remember under stress

### Behavior

- Open Trading Guide → Click "News Day Protocol" tab
- See 5-step framework for high-impact news days
- Open dashboard → Reminder shows plain English principle (when 30% fires)
- All principles formatted as "what to do" statements, not warnings

## [v4.4.1] - 2026-03-01

### PATCH - Dashboard Layout Optimization + Calendar Scraper Automation + Bug Fixes

**Purpose:** Fix widget bugs, streamline dashboard, ensure fresh calendar data daily.

### Fixed

- **dashboard-event-widget.js:** Fixed calendar data reference bug
  - Was checking `window.LIVE_CALENDAR_DATA` (undefined)
  - Now correctly references `LIVE_CALENDAR_DATA` in global scope
  - Widget now displays next CRITICAL event instead of "Calendar offline"

- **Calendar data staleness issue:**
  - Scraper was not automated (last run: Jan 10)
  - Two calendar.json files: /data/ (updated) and /src/ (served to browser)
  - Fixed: Browser now serves fresh calendar from /src/
  - Set up cron job: Runs daily at 23:30 (11:30pm)
  - Command: `/usr/local/bin/update-forex-calendar.sh`

### Removed

- **dashboard-decision-widget.js:** Removed from dashboard
  - Functionality: "Your Decision Today" selector
  - Reason: Redundant. Event widget already shows next CRITICAL event
  - User can see affected pairs and skip manually without extra widget

### Changed

- **Dashboard layout (index.html):**
  - Moved `armed-panel` to top of dashboard
  - Now positioned directly below `dashboard-next-event-container`
  - User sees: [Next Event] → [Armed Instruments] → [Discipline Dashboard]
  - Cleaner, more actionable workflow

### Behavior

1. Scraper runs automatically every day at 11:30pm
2. Calendar updates on dashboard without manual intervention
3. Event widget shows next CRITICAL event (RBA, FOMC, etc.) with countdown
4. Armed instruments panel shows which pairs are ARMED (waiting for entry)
5. User can skip affected pairs based on event + armed status

### Technical Details

- Cron job: `30 23 * * * /usr/local/bin/update-forex-calendar.sh`
- Script copies calendar from /data/ to /src/ after scraper updates
- No manual calendar.json management needed anymore
- Widget correctly detects absence of future CRITICAL events: "No CRITICAL events in next 7 days"


All notable changes to the Forex Command Centre are documented here.
Format follows [Semantic Versioning](https://semver.org/).

## [v4.4.0] - 2026-03-01

### MINOR - Gold Nugget Framework + Dashboard Widgets + Daily Reminder System

**Purpose:** Embed institutional mindset through spaced repetition, display next critical news event, and lock in daily decisions.

### Added

- **gold-nugget-principles.js (v1.0.0):** Comprehensive institutional principles framework
  - 40+ principles organized by category: Core Mindset (4), Risk Audit (4), Kill-Switches (4), Behavioural (4), Capital Governors (4), Execution (3), Institutional-Grade (4), Implementation (10), Trading Execution (15)
  - Categories: CRITICAL priority, HIGH priority, MEDIUM priority
  - Utility functions: `getRandomPrinciple()`, `getPrinciplesByCategory()`, `getPrinciplesByCritical()`, `formatPrincipleForDisplay()`
  - Core principles: "UTCC is filter not generator", "Protect capital from trader", "Decision denial over decision support", "Discipline is design problem"
  - Implementation principles: "Policy before code", "Risk controls separable", "Fail-closed always", "No ambiguous rules"
  - Trading principles: "Location > score", "Process > prediction", "Quality > quantity", "Patience is weapon", "Asymmetric setups"

- **gold-nugget-reminder.js (v1.0.0):** Daily spaced repetition modal
  - Triggers on dashboard load with 30% probability (max once per day)
  - Shows random institutional principle in modal with title, category, priority, and detailed explanation
  - Buttons: [Got It] [Another One] [Dismiss]
  - Purpose: Embed 40+ institutional rules through repetition, not willpower
  - localStorage tracking: `ftcc_nugget_reminder_shown_today` ensures once-per-day limit

- **dashboard-event-widget.js (v1.0.0):** Next CRITICAL event display
  - Shows on main dashboard at top
  - Displays: Event title, currency, day/time (AEST), "In Xh Ym" countdown
  - Colour-coded: RED if <4h, YELLOW if <24h, GREY if later
  - Updates every 30 minutes automatically
  - Graceful fallback: "No CRITICAL events in next 7 days" if clear
  - Depends on: LIVE_CALENDAR_DATA from news-impact.js

- **dashboard-decision-widget.js (v1.0.0):** Your Decision Today selector
  - Shows on main dashboard below event widget
  - Four options: Trade Normally (✓ GREEN) / Reduce Size (1%) (⚡ YELLOW) / Skip Affected Pairs (⏸ BLUE) / Stand Down (🛑 RED)
  - User selects once per day; decision persists across session (localStorage)
  - Shows selected decision prominently with timestamp
  - Purpose: Lock in news day prep decision before trading starts
  - Persists to: localStorage key `ftcc_decision_today`

- **core-ui.js (v4.4.0):** Dashboard integration hook
  - Added `GoldNuggetReminder.showReminder()` call in dashboard case of `showTab()` switch
  - Reminder fires 1 second after dashboard tab opens (allows UI to render first)

- **index.html (v4.4.0):** Imports + containers
  - Added 4 module imports: gold-nugget-principles.js, gold-nugget-reminder.js, dashboard-event-widget.js, dashboard-decision-widget.js
  - Added 2 dashboard containers: `dashboard-next-event-container`, `dashboard-decision-container`
  - Container placement: After playbook briefing card, before discipline dashboard card

### Integration Points
1. Dashboard load → GoldNuggetReminder.showReminder() fired automatically
2. Pre-Trade load → DailyRefreshGate.updateFreshnessUI() + NewsGateModule checks (existing)
3. Daily Context save → timestamp added automatically (v4.3.0)
4. Playbook save → timestamp added automatically (v4.3.0)

### Institutional Principles Included (Sample)

**Core Mindset:**
- "UTCC is a filter, not a signal generator; if you can't name the playbook before seeing UTCC, you don't trade"
- "Build a system that protects capital from the trader, not a system that assumes the trader stays rational"
- "Move from decision support → decision denial (hard vetoes, not soft warnings)"

**Risk & Discipline:**
- "The system assumes you'll act irrationally; the system stops you"
- "Risk controls must be independently inspectable; separate risk logic from trading logic (veto layer)"
- "Fail-closed always; if regime/session/context is missing or ambiguous → no trade"
- "Breakeven is neutral; it should not reset loss streaks or failure counters"
- "Revenge behaviour must trigger action (block + risk reduction + mandatory review gate)"

**Trading Execution:**
- "Location matters more than score: never buy into resistance, never short into support"
- "Process over prediction; your job is execution + risk control, not being 'right'"
- "Quality > quantity: 5-10 high-quality trades per week beats 50 marginal setups"
- "Patience is a weapon; wait for your conditions, even if it means fewer trades"
- "If you can't state your edge in one sentence, you don't have one yet"

---

## [v4.3.0] - 2026-03-01

### MINOR - Daily Refresh Gate (Staleness Checker for Briefing + Game Plan)

**Purpose:** Ensure Daily Context and Game Plan are reassessed every trading day, preventing stale conditions from guiding trades.

### Added

- **daily-refresh-gate.js (v1.0.0):** Staleness monitoring system for briefing and game plan
  - Checks if Daily Context was updated today (compares ISO timestamp to current date)
  - Checks if Game Plan was updated today
  - Returns structured verdict for UI: `{ briefingFresh: bool, playbookFresh: bool, briefingTimestamp: string, playbookTimestamp: string }`
  - Renders freshness status on Pre-Trade tab: GREEN checkmark if fresh, YELLOW warning if stale
  - Two buttons per stale item: [Confirm] (updates timestamp without re-entering) and [Refresh]/[Change] (navigates to tab)
  - Audit logging: tracks all freshness checks (last 50 entries to localStorage)
  - Utility functions: `refreshBriefing()`, `confirmBriefing()`, `refreshGamePlan()`, `confirmGamePlan()`, `getAuditLog()`

- **daily-context.js (v4.3.0):** Timestamp tracking on briefing save
  - Added line: `data.timestamp = new Date().toISOString();` in save() function
  - Timestamp added automatically whenever Daily Context is saved
  - No user interaction required; timestamp persists to both localStorage and server storage

- **playbook-module.js (v4.3.0):** Timestamp tracking on game plan save
  - Added line: `state.timestamp = new Date().toISOString();` in saveState() function
  - Timestamp added automatically whenever Game Plan is saved
  - Persists to localStorage, survives page reload

- **institutional-checklist.js (v4.3.0):** Freshness gate integration
  - Added 8 lines: `DailyRefreshGate.updateFreshnessUI()` called when institutional checklist loads
  - Displays freshness status on Pre-Trade tab before 7-check validation
  - Runs asynchronously with 100ms delay (allows DOM to settle first)

- **index.html (v4.3.0):** Containers and import
  - Added 2 containers: `briefing-freshness-container` and `gameplan-freshness-container` in Pre-Trade tab
  - Imported daily-refresh-gate.js after circuit-breaker modules, before news-gate-module.js
  - Containers display YELLOW warning if stale (with "Last updated Xd ago") or GREEN checkmark if fresh

### Behavior

1. **Sunday night:** Run Daily Context + Game Plan → timestamps saved
2. **Monday morning:** Open Pre-Trade tab → freshness check fires automatically
3. **If fresh (today):** GREEN checkmark displayed, proceed normally
4. **If stale (yesterday or earlier):** YELLOW warning displayed with [Confirm] and [Refresh] buttons
   - [Confirm]: Just updates timestamp to today (reasserts same conditions still valid)
   - [Refresh]/[Change]: Navigate to Daily Context or Game Plan tab for reassessment
5. **After confirming/refreshing:** YELLOW warning disappears, GREEN checkmark appears

### Design Rationale

Market regime can shift overnight (Asia session trades while trader sleeps). System forces re-evaluation of:
- Is the regime still what I assessed Sunday night? (EXPANSION → DISTRIBUTION?)
- Is my permission level still correct? (YELLOW → RED due to losses?)
- Is my playbook still the right one? (CONTINUATION → OBSERVATION if vol profile changed?)

Instead of relying on trader memory ("Did I check if conditions changed?"), the system asks explicitly.

---

## [v4.2.0] - 2026-03-01

### MINOR - News Gate Module (Veto Layer for News Events)

### Added
- **news-gate-module.js (v1.0.0):** Standalone veto layer module for news event assessment
  - Wraps existing `isNewsSafeToTrade()` function from news-impact.js
  - Impact tiers: CRITICAL (4h buffer), HIGH (2h buffer), MEDIUM (1h buffer), LOW (30min buffer)
  - Returns structured verdicts: RED (blocked), YELLOW (caution), GREEN (proceed), UNKNOWN (calendar offline)
  - Audit logging: tracks all gate assessments (max 100 entries, persisted to localStorage)
  - Utility functions: `getNextEventForPair()`, `isCalendarLoaded()`, `clearAuditLog()`

- **institutional-checklist.js integration (v2.1.0):**
  - Added `updateNewsGateWarning(pair)` function displays news verdicts before 7-check validation
  - News warning container rendered at top of Pre-Trade tab (after leakage warnings)
  - Colour-coded alerts: RED = stop sign icon + red banner, YELLOW = warning triangle + amber banner
  - Shows event title, currency, time until release, and assessment reason

- **pre-trade.js (v4.2.0):**
  - News gate assessment triggered when pair is selected in validation tab
  - No changes to core pre-trade logic; news assessment is independent veto layer

- **index.html:**
  - Added `news-gate-warning-container` div to Pre-Trade tab (line 405)
  - Imported `news-gate-module.js` after circuit-breaker modules (line 3041)
  - Import order: circuit-breaker → news-gate-module → other modules

### Technical Details
- Module uses IIFE pattern consistent with circuit-breaker-module.js
- Depends on: LIVE_CALENDAR_DATA (from news-impact.js), CRITICAL_EVENTS_BY_PAIR lookup table
- No localStorage parsing errors even if audit log is corrupted
- Handles both 'High' and 'HIGH' impact string formats from calendar data

### Behavior
1. User selects pair in Pre-Trade tab → `updateInstitutionalChecklist()` fires
2. News gate assessment runs via `NewsGateModule.assessTradability(pair, 4)`
3. If GREEN: no warning displayed, proceed with checks
4. If YELLOW: warning banner shown, checks proceed but trader alerted
5. If RED: warning banner with stop icon shown, trader cannot proceed until buffer expires
6. UNKNOWN (calendar offline): warning shown but trading allowed (with recommendation to check manually)

### Audit Trail
- Every assessment logged to localStorage under `ftcc_news_gate_audit`
- Log entry includes: timestamp, pair, verdict, reason, nextEvent details, minutesUntil
- Last 100 assessments retained (older entries discarded)
- Accessible via `NewsGateModule.getAuditLog()` for compliance/debugging

---

## ProZones v3.4.1 - 2026-02-22

### Fixed (v3.2.0)
- Touch counting: pivot expansion path now gated by cooldown (was bypassing cooldown entirely)
- Merge logic: uses math.max instead of summing touch/rejection counts when zones merge

### Fixed (v3.3.0)
- Broken zone freeze: touch and rejection counts freeze at moment of break (all 3 counting paths gated)
- Prevents post-break noise from inflating zone strength numbers

### Added (v3.4.0)
- Broken zone role flip in verdict logic: broken support treated as resistance, broken resistance treated as support
- Verdict now reflects actual market role, not just position relative to price

### Changed (v3.4.1)
- Direction-neutral verdict labels: "BUYING INTO RESISTANCE" → "AT RESISTANCE", "NEAR SUPPORT" → "APPROACHING SUPPORT"
- Prepares for FCC integration where UTCC direction determines if location is good or bad


---

## Known Infrastructure Notes

- **Alert Server Docker container** (`trading-state`) still mounts from `/mnt/user/appdata/trading-state/` — NOT from `forex-alert-server/`. The `forex-alert-server/` folder in the repo is an unused copy. Do not delete `trading-state/` — it is the live data source.
- Migration to `forex-alert-server/` path requires recreating the Docker container with new mount paths. Low priority — leave until next major infrastructure change.

---

## [v4.1.3] - 2026-02-22

### PATCH - Briefing persistence, armed dedup, UI polish

### Fixed
- **daily-context.js:** Briefing now persists across browsers
  - `ServerStorage.save` / `.load` calls were wrong — methods don't exist. Fixed to use `saveToServer` / `loadFromServer`
  - Briefing data was NEVER saving to server (silently failing since v4.0)
  - `init()` now tries server if localStorage is empty (cross-browser restore)
- **armed-panel.js:** Instruments no longer appear in both Armed and Watchlist
  - Client-side dedup filters candidates already present in armed list
  - Candidate count badge now reflects filtered count

### Changed
- **index.html:** "Playbook Selection" header renamed to "Game Plan"
- **playbook-module.js:** "Proceed to Pre-Trade Validation" button renamed to "Go to Pre-Trade Checks"
- **storage-api.php:** Added `daily-context` to allowed files whitelist — was returning 400 Bad Request because the key wasn't registered
- **regime.css:** Added `.dc-session-check` styling — session checkboxes now spaced correctly with inline-flex layout

---

## [v4.1.2] - 2026-02-22

### PATCH - Add all 6 asset classes to pair dropdowns

### Changed
- **index.html (Pre-Trade dropdown):** Added Metals, Energy, Indices, Bonds, Crypto optgroups with all instruments from asset-class.js
- **index.html (Journal dropdown):** Expanded from partial (Gold, Silver, 3 US indices) to full set matching Pre-Trade
- Both dropdowns now consistent: Forex (28 pairs) + Metals (4) + Energy (3) + Indices (12) + Bonds (6) + Crypto (4) = 57 instruments
- Journal filter dropdown already had full set — no change needed

---

## [v4.1.1] - 2026-02-21

### PATCH - Hotfix: Circuit breaker + regime gating for v4.0 flow

### Fixed
- **daily-context.js:** Now calls `CircuitBreaker.startSession()` when Briefing is locked
  - Old Regime tab lock used to trigger this — removing Regime tab broke the chain
  - Without this, all tabs showed "No active session. Complete regime check first."
- **regime-module.js:** `checkPreTradeAccess()` now checks `DailyContext.isLocked()` first
  - Bypasses old session regime requirement when Briefing is locked
  - Fallback messages updated from "Complete regime" to "Lock your Briefing first"
  - `showTab()` wrapper redirect changed from removed 'regime' tab to 'daily-context'
- **circuit-breaker-module.js:** Error message updated to "Lock your Briefing first"
- **index.html:** Header updated from "DAILY CONTEXT / Step 0 — Required Before Trading" to "Daily Briefing / Start here every day"

---

## [v4.1.0] - 2026-02-21

### MINOR - Plain English Rebuild Phase 2 (Game Plan + Pre-Trade)

### Changed
- **playbook-module.js v1.2.0:** Plain English rewrite of all playbook cards
  - Continuation → "Ride the Trend", Deep Pullback → "Deep Dip Buy", Range Breakout → "Range Break", Observation → "Watch Only"
  - All descriptions, execution steps, invalidation rules, and "when applies" rewritten conversationally
  - Execution models renamed: "Set a Limit Order", "Wait for Break + Retest", "Market Order on Signal"
  - Section headers: "What's Your Plan?", "How Will You Enter?", "Not Available Right Now"
  - Leakage warnings rewritten in plain English
  - Regime matrix notes rewritten conversationally
  - Dashboard briefing card updated to "Active Plan" language
- **index.html:** Pre-Trade tab plain English rewrite
  - All 7 checklist labels rewritten as questions: "Is UTCC Armed?", "Are the 1H Moving Averages Lined Up?", etc.
  - HARD badges → "MUST PASS", SOFT → "SIZING"
  - Tooltip explanations rewritten for clarity
  - Gate banner, divider, verdict panel, and sanity warnings all conversational
  - Structure Analysis → "Where Are You Getting In?", Entry Strategy → "How Will You Enter?", Stop Loss → "Where Is Your Stop?"
  - Added Auto-Detected system checks section (Regime Match + Correlation)
- **institutional-checklist.js:** Verdict messages rewritten plain English
  - "ENTRY APPROVED" → "GO - FULL SIZE" / "GO - REDUCED SIZE"
  - "ENTRY BLOCKED" → clearer reason descriptions
  - Gate text updated to match new tone
  - Reset text updated

### Added
- **institutional-checklist.js:** 2 new auto-detected checks merged from removed 10-point panel
  - Auto Check A: "Does the Market Agree With Your Briefing?" (regime match)
  - Auto Check B: "Are You Doubling Up on Correlated Pairs?" (correlation check)
  - Both auto-fire when pair is selected, no manual input needed

### Removed
- **pre-trade.js:** Removed 229 lines of dead 5-criteria system code
  - updateCriteria(), checkCriterion1-5(), old updateValidationVerdict(), calculateRR(), calculateValidationPosition()
  - These referenced element IDs that no longer exist in the HTML
  - File reduced from 489 → 260 lines
- **daily-scan.js:** Replaced dead updateCriteria() call with updateInstitutionalChecklist()

---

## [v4.0.0] - 2026-02-21

### MAJOR - Plain English Workflow Rebuild (Phase 1)

### Added
- **daily-context.js v4.0.0:** Complete plain English rewrite
  - 6 numbered questions replacing technical form fields
  - Conversational labels with technical terms in small text
  - News status merged in (eliminates triple news checking)
  - Session selection merged in (replaces 3 separate regime forms)
  - Chart hints showing what to look for on each question
  - Permission auto-calculates live as questions are answered
- **regime.css:** Additional CSS for question-based layout

### Changed
- **index.html:** Regime tab section removed (~275 lines), tab renamed Context to Briefing, Playbook to Game Plan
- **core-ui.js:** Tab gating updated to bypass RegimeModule, uses DailyContext + CircuitBreaker directly
- **Workflow stepper:** 4 steps (Briefing, Game Plan, Pre-Trade, Execute) instead of 5

### Removed
- Regime tab and all session-specific regime forms
- 10-Point Validation Panel (auto-checks moved to dashboard, manual checks merged into Daily Context)
- Triple volatility assessment (one unified system now)
- Triple news checking (single check in Daily Context)

---

## [v2.12.2] - 2026-02-15

### Added (index.html)
- **Alert Status dropdown** in Section A (Trade Metadata): visible select replacing hidden input
- Options: READY (All 5 criteria), STRONG (4/5 criteria), WATCH (Developing), MANUAL (Discretionary)
- Tooltip with definitions for each alert type

### Added (trading-guide.js v2.2.0)
- **R/K/U Reason Code Reference** in Definitions section: R-EXPANSION, R-COMPRESSION, R-TRANSITION, R-CHAOS, R-OFFSESSION; K-NORMAL, K-REDUCED, K-LOCKED; U-SCORE, U-MTF, U-ATR, U-TREND-WEAK, U-ENTRY-EXTENDED, U-SR-CLOSE, U-NEWS-RISK
- **Authority hierarchy** explanation: most restrictive wins (Regime > Risk > UTCC)
- **Trade Alert Types** in Alerts section: READY/STRONG/WATCH/MANUAL with criteria, actions, and distribution target (80%+ READY)

---

## [v2.12.1] - 2026-02-15

### Added
- **Pre-Trade Simplification (Item 4):** Structure Analysis, Entry Strategy, SL Strategy, Exit Management, Correlation Check, Re-Entry Rules, Final Confirmation, and Execute button all gated behind 7-check checklist verdict
- Gate divider with status pill: locked (pending), blocked (fails), unlocked (approved)
- Smooth slide-in animation when gate opens
- Gate auto-re-locks on checklist reset

### Added (trading-guide.js v2.1.0)
- **UTCC Score Tiers table:** Excellent (90+), Perfect (85+), Strong (80+), Trade Ready (75+), Not Ready (<75)
- **Asset-Specific Thresholds table:** Forex 80, Crypto 85, Indices 75, Bonds 70, Energy 78, Metals 76
- **Regime Definitions table:** Expansion (FULL), Balanced (CONDITIONAL), Contraction (CONDITIONAL), Transition (STAND DOWN)
- **ATR Behaviour States table:** Quiet (<30%), Trend (30-70%), Explode (>70%), Mixed (STAND DOWN)
- **Session Protocols in AEST:** Tokyo 10AM-5PM, London 5PM-1AM, Overlap 5-7PM, NY 11PM-7AM, Off-Hours 1-10AM
- **Drawdown Protocol table:** Normal (<5%), Caution (5-10%), Stop (10-15%), Emergency (>15%)
- **Behavioural Kill-Switches:** Revenge detection, pair cooling, session max, post-session review, no overrides

---

## [v2.12.0] - 2026-02-15

### Added
- **No-Trade Journal (Item 3):** Market review logging system for tracking discipline passes
- Form: session (Tokyo/London/NY/Pre-Market), reason (10 options including Discipline Pass), pairs reviewed, notes
- Log display: last 10 entries with green shield icon, delete per entry
- Weekly no-trade count integrated into Discipline Dashboard subtitle
- Separate localStorage key (ftcc_no_trades)

---

## [v2.11.0] - 2026-02-15

### Added
- **Focus Mode (Item 1):** Dashboard transformed from P&L focus to discipline focus
- **Rules Adherence Engine (Item 2):** 9-checkbox scoring system per trade
- Discipline Dashboard with hero ring showing Rules Adherence %
- 4 discipline stats: Avg Process Score (x/9), Perfect Trades (9/9), Discipline Streak, Weekly Adherence
- Ring colour coding: purple (90%+), green (70%+), yellow (50%+), red (<50%)
- Collapsible P&L section (Item 5): Account data hidden by default, expandable toggle

### Changed
- Account Overview card replaced with Discipline Dashboard
- Weekly Performance P&L replaced with Weekly Adherence %
- Floating P&L in trade summary replaced with Active Risk ($ at risk)
- Section title "Weekly Performance" renamed to "Weekly Discipline"

---

## [v2.10.1] - 2026-02-14

### Fixed
- Trade editing: inline edit buttons (pencil icon) on trade history rows
- Edit mode banner with cancel button
- Section F (Execution & Management) checkboxes: 5 execution + 4 management
- Grade dropdown using consistent A+/A/B+/B/C/DIS scale
- Form scroll-to-top on edit click
- Outcome dropdown: win/loss/breakeven/partial/stop_loss with colour coding

---

## [v2.10.0] - 2026-02-14

### Fixed
- **Bug Fix #1:** Section F checkboxes not saving (ID mismatches between HTML and JS)
- **Bug Fix #2:** editTrade merge logic overwriting broker data with empty form fields
- **Bug Fix #3:** Grade saved as display text instead of raw value
- **Bug Fix #4:** Outcome dropdown missing stop_loss option
- **Bug Fix #5:** Missing visual edit trigger on trade history rows
- **Bug Fix #6:** No edit mode indicator when editing existing trade

### Added
- Protected fields system: broker-sourced fields (pair, direction, entryPrice, etc.) never overwritten by empty form values
- Edit mode banner with trade ID display and cancel button
- Inline edit buttons on each trade history row

---

## [v2.8.2] - 2026-02-12

### Changed
- File structure migration from flat `forex-tools/` to organised `forex-command-centre/` hierarchy
- 18 JS modules organised into category folders: CORE, BROKER, TRADING, RISK, LOGIC, EXECUTION, REFERENCE
- Nginx root updated from `nginx/www/` to `forex-command-centre/src/`
- Alert server migrated from `trading-state/` to `forex-alert-server/`

### Added
- `docs/` folder with ARCHITECTURE.md, DEPENDENCIES.md, DEPLOYMENT.md, CHANGELOG.md
- Google Drive folder structure mirroring server layout
- Formal documentation layer

### No Code Changes
- All 18 JS modules unchanged -- folder reorganisation only

---

## [v2.8.0] - 2026-02-10

### Changed
- Institutional alert format migration for UTCC webhook receiver
- Updated `parseAlert()` in index.js to handle new severity prefix format `[A]/[C]/[B]/[I]`
- Armed Instruments panel redesigned with new column layout (emoji, pair, regime, permission, max risk, score, age)

### Added
- Backward compatibility layer accepting both old and new alert formats
- CANDIDATE state storage (separate from ARMED)
- WATCHLIST section below Armed Instruments for CANDIDATE pairs (yellow styling)
- BLOCKED handling as pair-removal trigger (replaces DISARMED)
- INFO with SESSION_RESET handling (replaces old RESET)
- Permission-based colour coding (FULL = green, CONDITIONAL = amber)

---

## [v2.6.0] - 2026-01 (approx)

### Added
- ATR Behaviour Module implementation across all indicator suites
- Forex indicator suite updated to v2.6.0
- Metals indicator suite updated to v2.6.0

### Changed
- ATR filter separated: trade permission decisions vs risk sizing
- Visual ATR levels system for dynamic stop-loss and take-profit plotting

---

## [v2.3.0] - 2025-12 (approx)

### Added
- Armed State Panel on Dashboard tab
- Real-time display of all currently armed pairs from webhook receiver
- Polling from alerts.pineros.club/state endpoint

### Changed
- Dashboard layout updated to include Armed State Panel between Active Trades and Drawdown Protocol

---

## [v2.1.0] - 2025-11 (approx)

### Added
- forex-alert-server (Node.js) webhook receiver
- TradingView webhook processing at alerts.pineros.club
- armed.json, utcc-alerts.json, candidates.json data files
- 4-hour TTL on alert queue
- Cloudflare tunnel for alerts.pineros.club

---

## [v2.0.0] - 2025-10 (approx)

### Added
- Modular JavaScript architecture (18 separate modules)
- Server-side storage via storage-api.php
- Oanda broker integration via oanda-proxy.php
- Circuit breaker risk management system
- Automated trade capture from broker
- Journal autofill from Oanda trade history
- Session board with pilot-style commitment protocols

### Changed
- Migrated from single monolithic HTML to modular JS structure
- Replaced localStorage-only persistence with server-side JSON files

---

## [v1.x] - 2025 (Earlier Versions)

### Features
- Single-file HTML application
- localStorage-based persistence
- Manual trade journal entry
- Daily scan for 28 forex pairs
- Pre-trade validation checklist
- Performance analytics (win rate, expectancy, equity curve)
- Nextcloud WebDAV backup
- Theme system (dark mode)

---

## Version Numbering

- **MAJOR:** Breaking changes, new architecture, incompatible with prior version
- **MINOR:** New features, meaningful improvements, same overall purpose
- **PATCH:** Bug fixes, typos, formatting, small tweaks

## [v5.3.4] - 2026-03-29
### Fixes + Data integrity improvements

**Armed panel / bias display:**
- Fixed index pair base/quote splitting — CN50USD, HK33HKD, JP225USD now correctly split using explicit INDEX_CURRENCIES map in alert server (was using substring(0,3) giving CN5/OUS etc)
- Fixed TE run wiping forex pair verdicts — TE now merges best FF historical verdicts before writing; only overrides pairs it has actual signal for
- Fixed TE run wiping currency bias — NZD/CHF/CAD now preserved from last FF run with actuals when TE has no signal for those currencies
- Fixed pair verdicts calculated from merged FF+TE bias map — new pairs (NZDCHF, JP225USD etc) now get verdicts even if not in historical FF runs
- Fixed EVENT_REFERENCE export order — moved after const declaration to fix "Cannot access before initialization" error
- Restored event detail panel in session brief card — measures, usual effect, threshold from EVENT_REFERENCE

**Critical events:**
- Integrated CRITICAL events into session brief card — first 3 visible, rest collapsed with ▼ toggle
- Removed standalone CRITICAL events widget (now hidden) — session brief card is single source
- Colour coding preserved: red <4h, amber <24h, grey >24h
- Expandable detail per event: measures, usual effect, threshold

**Data storage:**
- FF event_results now stores surprise_abs, surprise_pct, surprise_dir — enables future surprise magnitude analytics
- Surprise magnitude correlation: NFP miss by 180K vs 2K now distinguishable in historical data

**Service worker:**
- arm-history-dashboard.html now unregisters SW and clears all caches on load — prevents stale page serving
- SW cache bumped to fcc-v5

**Index pairs:**
- INDEX_PAIR_CURRENCIES map added to both scrapers and alert server
- All 13 index instruments in display; 10 scrapeable ones drive bias scoring
- US30/NAS100/US2000 display-only (TE pages require browser fingerprinting)

## v5.5.0 - Armed Panel Quality Tier Sorting + Session Dismiss

### New Features
- **Quality Tier System**: Armed pairs now classified into PRIME / STANDARD / DEGRADED
  - PRIME: FRESH structure + IDEAL/NORMAL ATR + not CONFLICTING bias + no CROWD WITH YOU
  - DEGRADED: any of EXT structure, EXHAUSTED ATR, CONFLICTING bias, CROWD WITH YOU
  - STANDARD: everything else
- **Quality Sort**: Armed panel sorted PRIME first, then STANDARD, then DEGRADED; score descending within each tier
- **Tier Headers**: Visual tier separators with amber (PRIME), muted (STANDARD), red (DEGRADED) styling
- **Session Dismiss**: Hover any armed pair to reveal × dismiss button
  - Dismissed pairs collapse to a muted "N dismissed — show" footer row
  - Click footer to expand/collapse dismissed section
  - "Restore" button per dismissed pair brings it back
- **Server-Side Dismiss Storage**: Dismissals persisted to `armed-dismissed.json` via storage-api.php
  - Available across all devices immediately
  - Auto-clears at AEST date rollover (new trading day = clean slate)

### Files Changed
- `src/js/armed-panel.js` — v1.1.0
- `src/css/dashboard.css` — tier headers, dismiss/restore buttons, dismissed section
- `backend/api/storage-api.php` — added `armed-dismissed` to allowed files whitelist

## [v5.6.0] - 2026-04-03
### Remove CANDIDATE alert type — concept retired

CANDIDATE was a below-threshold alert (score in gap band between ARMED minimum and a secondary threshold).
With the 1-hour FOMO gate already providing analysis time post-ARMED, CANDIDATE generated cognitive overhead
on unqualified setups. Removed entirely. Flow is now: ARMED → FOMO gate → analyse → execute or pass.

**Alert server (`index.js`):**
- Removed `CANDIDATE_FILE` const and `CANDIDATE_TTL_HOURS` config
- Removed `loadCandidates()`, `saveCandidates()`, `cleanupExpiredCandidates()` functions
- Removed candidate build block from `GET /state` response (`candidateCount`, `candidates` fields)
- Removed candidate cleanup from ARMED and BLOCKED webhook handlers
- Removed candidate session clearing from INFO SESSION_RESET handler
- Removed entire CANDIDATE webhook handler block
- Incoming CANDIDATE alerts now hit the `else { not tracked }` branch (backward compat parsing retained)

**Frontend:**
- `armed-panel.js`: Watchlist section rebuilt as Off-Session only; candidate fetch and render removed
- `broker-dashboard.js`: Removed `.concat(data.candidates || [])` from pair lookup
- `tooltip-definitions.js`: Removed `candidate` definition and `CANDIDATE` alias
- `trading-guide.js`: Removed CANDIDATE alert card, state table row, workflow step, asset threshold column, NEVER rule, volume estimate
- `gold-nugget-guide.js`: Removed CANDIDATE alert box, daily loop reference, "When CANDIDATE Hits" step, non-negotiable rule, volume estimate

**Pine Script (manual action required):** Remove the CANDIDATE alert branch from all UTCC indicators in TradingView.

## [UTCC Universal v3.1.0] - 2026-04-03
### Remove CANDIDATE alert type from Pine Script

- Removed all 6 `*_candidateThreshold` input.int declarations (FX/Crypto/Metals/Energy/Bonds/Indices)
- Removed `enableContextCandidate` input.bool
- Removed `candidateThreshold` runtime var and all per-category overrides
- Removed `alertPerfectThreshold` and `scoreGapPassesPerfect` (unused chain)
- Removed `ALERT_CANDIDATE` string constant
- Removed ALERT_CANDIDATE branches from `f_alertEmoji()` and `f_alertPrefix()`
- Removed `wasCandidate_rt`, `wasCandidate_close`, `wasCandidateDir_rt` persistent vars
- Removed CANDIDATE branch from `resolvedAlertType` logic (now resolves to INFO)
- Removed CANDIDATE colour branch from status display
- Removed entire CANDIDATE CONDITION block (candidateMeets*, contextJustCandidate*)
- Removed `perfectBullishCondition` / `perfectBearishCondition` (never used downstream)
- Removed two `alertcondition()` CANDIDATE blocks
- Removed two `alert()` CANDIDATE dispatch blocks (Long/Short)
- Updated comments: header, tooltip, section label, footer threshold table

## [Hotfix] - 2026-04-03
### Fix: trading-state container crash on startup

- `forex-alert-server/index.js`: Removed orphaned `setInterval(cleanupExpiredCandidates, ...)` call
- `cleanupExpiredCandidates` function was deleted in v5.6.0 but the interval registration was missed
- Container was exiting immediately with `ReferenceError: cleanupExpiredCandidates is not defined`
