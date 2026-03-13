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
