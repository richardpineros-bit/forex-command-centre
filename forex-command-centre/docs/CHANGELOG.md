# Forex Command Centre - Changelog

All notable changes to the Forex Command Centre are documented here.
Format follows [Semantic Versioning](https://semver.org/).

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
