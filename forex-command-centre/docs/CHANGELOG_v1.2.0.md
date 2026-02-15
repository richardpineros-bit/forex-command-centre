# Forex Command Centre - Changelog

All notable changes to the Forex Command Centre are documented here.
Format follows [Semantic Versioning](https://semver.org/).

---

## Known Infrastructure Notes

- **Alert Server Docker container** (`trading-state`) still mounts from `/mnt/user/appdata/trading-state/` — NOT from `forex-alert-server/`. The `forex-alert-server/` folder in the repo is an unused copy. Do not delete `trading-state/` — it is the live data source.
- Migration to `forex-alert-server/` path requires recreating the Docker container with new mount paths. Low priority — leave until next major infrastructure change.

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
