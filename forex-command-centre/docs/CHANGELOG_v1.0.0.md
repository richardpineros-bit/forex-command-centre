# Forex Command Centre - Changelog

All notable changes to the Forex Command Centre are documented here.
Format follows [Semantic Versioning](https://semver.org/).

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
