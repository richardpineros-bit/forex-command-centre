# FCC v4.0 Plain English Rebuild - Handover

## What Was Done (Chat 1 - 2026-02-21)

### Workflow Audit
Full audit of Daily Context → Regime → Playbook → Pre-Trade flow. Found:
- Regime declared TWICE with incompatible options
- Volatility assessed THREE different ways
- News checked THREE places
- 10-Point Validation Panel: 5 auto-detectable, 3 repeats, only 2 genuine manual inputs
- Dead code from old 5-criteria system in pre-trade.js
- ~30+ inputs across 3 tabs before selecting a pair

### Daily Context v4.0.0 (DEPLOYED)
Complete rewrite of `src/js/daily-context.js`:
- 6 numbered questions in plain English (was technical form fields)
- Conversational labels, technical terms in small text for learning
- News status merged in (was separate in 10-point panel)
- Session selection merged in (was 3 separate regime forms per session)
- Chart hints showing what to look for
- Permission auto-calculates live as questions answered
- Same public API: isLocked(), getPermission(), canAccess(), getData(), getState()
- Added `getState()` alias for PlaybookModule compatibility

### Regime Tab REMOVED (DEPLOYED)
- Entire tab-regime section removed from index.html (~275 lines)
- Tab button removed from nav bar
- core-ui.js gating updated to bypass RegimeModule, uses DailyContext + CircuitBreaker directly

### Tab Renames (DEPLOYED)
- "Context" → "Briefing"
- "Playbook" → "Game Plan"

### CSS Added (DEPLOYED)
- New question-based layout styles appended to `src/css/regime.css`
- Covers: .dc-question, .dc-question-number, .dc-help, .dc-field-hint, .dc-sessions-row, .dc-permission-box, responsive breakpoints

### Files Changed on Unraid + GitHub
1. `src/js/daily-context.js` — replaced with v4.0.0
2. `src/css/regime.css` — new CSS appended at bottom
3. `src/index.html` — regime section removed, tab renames
4. `src/js/core-ui.js` — gating logic updated
5. `docs/CHANGELOG_v1.2.0.md` — v4.0.0 entry added

---

## What Was Done (Chat 2 - 2026-02-21)

### Game Plan Tab v4.1.0 (READY TO DEPLOY)
Plain English rewrite of `src/js/playbook-module.js`:
- Playbook names: Ride the Trend, Deep Dip Buy, Range Break, Watch Only, Stand Down
- All descriptions, execution steps, invalidation rules rewritten conversationally
- Execution models: "Set a Limit Order", "Wait for Break + Retest", "Market Order on Signal"
- Section headers: "What's Your Plan?", "How Will You Enter?", "Not Available Right Now"
- Leakage warnings and regime matrix notes all plain English
- Dashboard briefing card updated to "Active Plan" language

### Pre-Trade Tab v4.1.0 (READY TO DEPLOY)
Three changes:
1. **Dead code removed from pre-trade.js** (229 lines)
   - updateCriteria(), checkCriterion1-5(), old updateValidationVerdict(), calculateRR(), calculateValidationPosition()
   - File: 489 → 260 lines
   - daily-scan.js: dead call replaced with updateInstitutionalChecklist()

2. **Plain English rewrite of 7-check labels in index.html**
   - "UTCC Armed State" → "Is UTCC Armed?"
   - "1H EMAs Stacked Same Direction" → "Are the 1H Moving Averages Lined Up?"
   - "Price Acceptance/Rejection at EMA" → "Did Price React at the Moving Average?"
   - "Price Failed to Do Opposite" → "Did Price Try the Other Way and Fail?"
   - "Alert Fired > 1 Candle Ago" → "Are You Chasing?"
   - "1H RSI Favourable" → "Is Momentum On Your Side?"
   - "No Stop Loss in Last 48h" → "Have You Lost on This Pair Recently?"
   - HARD → "MUST PASS", SOFT → "SIZING"
   - All tooltips, sanity warnings, gate text, verdict messages rewritten
   - Section headers: "Where Are You Getting In?", "How Will You Enter?", "Where Is Your Stop?"

3. **2 auto-detected checks added to institutional-checklist.js**
   - Auto Check A: "Does the Market Agree With Your Briefing?" (regime match — compares DailyContext with UTCC alert data)
   - Auto Check B: "Are You Doubling Up on Correlated Pairs?" (correlation check — scans open trades)
   - HTML section added after Check 7 with "Auto-Detected" header
   - Both fire automatically when pair is selected

### Files Changed (READY FOR DEPLOY)
1. `src/js/playbook-module.js` — v1.2.0 plain English rewrite
2. `src/js/pre-trade.js` — dead code removed (489 → 260 lines)
3. `src/js/institutional-checklist.js` — auto-checks added, verdict messages rewritten
4. `src/js/daily-scan.js` — dead updateCriteria() call fixed
5. `src/index.html` — checklist labels, auto-check HTML, section headers rewritten
6. `docs/CHANGELOG_v1.2.0.md` — v4.1.0 entry added

---

## What's Next (Chat 3)

### 1. End-to-End Pressure Test
- Full workflow: Briefing → Game Plan → Pre-Trade → Structure → Execute
- Verify all gates work (locked briefing → unlocks game plan → unlocks pre-trade)
- Test auto-detected checks with real data
- Test mobile responsiveness of new labels

### 2. Remaining Plain English Candidates
- Stop Loss / Exit Plan section labels (lower priority — already decent)
- Journal tab labels (lower priority)
- Settings tab cleanup

### 3. Long-Term: Remove regime-module.js
- 1382 lines, fully bypassed by DailyContext
- Needs audit of all consumers first (circuit-breaker-integration.js still hooks in)
- Low priority until all v4 changes stable

---

## Key Architecture Notes

### Public API Contract (DO NOT BREAK)
```
DailyContext.isLocked() → boolean
DailyContext.getPermission() → 'FULL' | 'CONDITIONAL' | 'STAND_DOWN' | null
DailyContext.canAccess(tabId) → {allowed: bool, reason: string}
DailyContext.getData() → full data object
DailyContext.getState() → alias for getData()
DailyContext.calculatePermission(regime, volatility, newsStatus) → string
```

### Who Calls DailyContext
- core-ui.js → canAccess(), isLocked(), getPermission()
- playbook-module.js → getState() (alias for getData())
- Various render calls in core-ui.js

### RegimeModule Still Exists But Bypassed
- regime-module.js still loaded (1382 lines)
- DailyContext syncs to it via syncWithRegimeModule() for backward compat
- circuit-breaker-integration.js hooks into RegimeModule.checkPreTradeAccess
- PlaybookModule tries DailyContext first, falls back to RegimeModule
- Long-term: remove regime-module.js entirely once all consumers migrated

### PlaybookModule Reads Regime From
1. DailyContext.getState().regime (primary)
2. RegimeModule.loadRegimeData().dailyContext.marketState (fallback)

### Data Stored
- localStorage key: `fcc_daily_context`
- Also synced to: `ftcc_regime` (RegimeModule compat)
- Server-side: via ServerStorage.save('daily-context', data)

---

## Repo
https://github.com/richardpineros-bit/forex-command-centre

## Current Tab Bar
Dashboard | Briefing | Game Plan | Pre-Trade | Journal | Performance | Reference | Settings

## Workflow
Briefing (6 questions) → Game Plan (pick playbook) → Pre-Trade (per-trade validation) → Execute
