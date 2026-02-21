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

## What's Next (Chat 2)

### 1. Game Plan Tab (Quick)
- Plain English labels on playbook descriptions
- Rename playbook cards to conversational language
- File: `src/js/playbook-module.js` (1004 lines)

### 2. Pre-Trade Tab (Bigger Job)
- Plain English rewrite of 7-check Institutional Checklist labels
- Merge 2 useful checks from removed 10-point panel:
  - R-Code match (UTCC regime code matches your declared regime)
  - Correlation check (not doubling up on correlated pairs)
- Remove dead code from old 5-criteria system (checkCriterion1-5, references to val-trend-score, val-mtf, val-volatility, val-entry-zone, val-news)
- Structure analysis + R:R section labels rewritten
- Files: `src/js/pre-trade.js` (489 lines), `src/js/institutional-checklist.js` (510 lines)

### 3. After Both Done
- Push to GitHub
- Update CHANGELOG
- End-to-end pressure test of full flow

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
