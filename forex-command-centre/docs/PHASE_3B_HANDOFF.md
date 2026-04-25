# FCC-SRL v2.0.0 Frontend — Remaining Work Handoff

**Last updated:** 2026-04-25 (Saturday) after Phase 1 + 2 + 3a deploy.

---

## Current state on `main`

| Component                | Version  | Commit    | Status |
|--------------------------|----------|-----------|--------|
| Alert Server             | v2.17.0  | `5e89f1a` | Deployed |
| `dashboard.css`          | additive | `afeb000` | Deployed |
| `armed-panel.js`         | v1.15.0  | `afeb000` | Deployed |
| `CHANGELOG.md`           | updated  | `4ec3046` | — |

### What's running

- `computeQualityTag(weekCount, sweepRisk)` server engine (PRIORITY / STANDARD+ / STANDARD / CAUTION / CONTESTED)
- `enrichArmedPair()` writes qualityTag + adxValue onto state
- `/state` exposes all v2.0.0 fields + qualityTag/qualityReason
- Armed panel renders quality badge, sweep badge, magnet list, session/ADX line
- Sort: tier group → quality tag order → enrichedScore desc

### Saturday verification result

All 21 armed pairs render with v2.0.0 fields = `null`. Pine doesn't fire over the weekend. UI suppresses badges/lists when source data null. Schema confirmed correct. Real data starts Monday post-Tokyo open.

---

## REMAINING WORK

### Phase 3b — Armed panel filters (small, 1 session)

**Target:** `armed-panel.js` v1.15.0 → v1.16.0

#### Build order

1. **Persistence** — `localStorage` key `armed-quality-filters`, default `{hideContested: true, hideCaution: false, onlyPriority: false}`. Decide ON-vs-OFF default with Rianpi before building.

2. **Filter chips** — three at top of armed panel:
   - `Hide CONTESTED`
   - `Hide CAUTION`
   - `Only PRIORITY` (overrides both Hide flags when active)
   - CSS already shipped: `.armed-filter-bar`, `.armed-filter-chip`, `.armed-filter-chip.active`

3. **Hidden counter chip** — ALWAYS VISIBLE when filter hides pairs:
   - Format: `{n} CONTESTED hidden` and/or `{n} CAUTION hidden`
   - CSS: `.hidden-counter-chip` shipped
   - Click reveals temporarily (one render cycle)
   - **NOT dismissible** — institutional transparency requirement

4. **Filter application** — inside `renderArmedState()` after `_dismissedPairs` filter, before tier/sort logic so tier counts reflect filtered pairs.

#### Filter logic

```
if filters.onlyPriority:
    keep ONLY pairs where qualityTag === 'PRIORITY'
else:
    if filters.hideContested: drop pairs where qualityTag === 'CONTESTED'
    if filters.hideCaution:   drop pairs where qualityTag === 'CAUTION'
```

**Pairs with `qualityTag: null` are NEVER filtered.** Backward compat is non-negotiable.

#### Hidden counter logic

```
hiddenContested = (filters.hideContested || filters.onlyPriority)
                  ? pairsBefore.filter(p => p.qualityTag === 'CONTESTED').length
                  : 0
hiddenCaution   = (filters.hideCaution || filters.onlyPriority)
                  ? pairsBefore.filter(p => p.qualityTag === 'CAUTION').length
                  : 0
```

Render chip(s) only when count > 0.

---

### Phase 3c — Intelligence Hub calibration tabs (large, dedicated session)

**Target:** `arm-history-dashboard.html` (currently unversioned 2265 lines)

Add version banner: `<!-- arm-history-dashboard.html v1.0.0 -->`. Then bump v1.0.0 → v1.1.0.

#### NEW TAB: Sweep Risk Calibration

Source: `loc-history.json`. Three sections:
1. **Grade distribution chart** — bar chart LOW/MED/HIGH counts over 7d/30d/90d. Target overlay: 60% LOW / 30% MED / 10% HIGH.
2. **Per-asset-class breakdown** — table of asset class × sweep risk distribution. Highlight deviations.
3. **Auto-calibration tips** — text suggestions like "Your MED/HIGH ratio is X% — consider tightening `magnetThreshAtr` from 2.0 to Y".

#### NEW TAB: Frequency × Sweep Matrix

2D heatmap: weekly signal count (Y: 1, 2, 3+) × sweep risk (X: LOW, MED, HIGH). Each cell shows count. Win rate cell value comes later (Phase 3d, depends on journal outcome logging).

#### Enhance existing Location Calibration tab

- Add `sweep_risk` column to grade distribution table
- Cross-tab filter: "show only pairs where sweep_risk = HIGH"
- Sparkline per pair showing 7-day sweep risk trend

#### Server endpoints — verify before extending

Check existing in `forex-alert-server/index.js`: `/loc-history`, `/bias-history`, `/location-history`. Add aggregation params (`?range=7d&groupby=asset_class`) only if rolling stats not already available. Server bump only if extended.

---

### Out of scope (Phase 3d+, future)

- Trade outcome logging for Frequency × Sweep win-rate cells
- Stop-entry order helper for pre-trade tab
- Rejection candle detector Pine Script
- Mobile responsive deep-tuning for new tabs

---

## CALIBRATION PLAN (post Phase 3c)

Calibration uses TradingView Pine inputs (no redeploy — saves per-chart):

| Input             | Default | Adjust if...                                     |
|-------------------|---------|--------------------------------------------------|
| `magnetThreshAtr` | 2.0     | LOW > 80% → tighten to 1.5; HIGH > 25% → 2.5     |
| `sweepLowMax`     | 1       | If 1 magnet harmless → raise to 2                |
| `sweepMedMax`     | 2       | If MED catching too many → lower to 1            |
| `adxThresh`       | 20      | If ADX < 20 frequently → 18 (FX ranges)          |

Target: LOW 55–65% / MED 25–35% / HIGH 5–15%.

---

## ROLLBACK

| Layer              | Rollback                                                            |
|--------------------|---------------------------------------------------------------------|
| `armed-panel.js`   | Git revert OR `cp` from `armed-panel.js.backup-pre-vX.Y.Z`          |
| Server             | `cp index.js.backup-pre-vX.Y.Z`, `docker restart trading-state`     |
| `dashboard.css`    | Git revert — JS gracefully degrades on missing classes              |
| Filter state       | Browser console: `localStorage.removeItem('armed-quality-filters')` |
| HTML dashboard     | Use existing `.backup2` / `.backup3` files in src/                  |

---

## KICKOFF PROMPT FOR NEXT SESSION

Copy-paste verbatim into the new chat:

```
Continuing FCC-SRL v2.0.0 frontend work. Three commits already on main:

  4ec3046 docs: CHANGELOG entry for v2.17.0/v1.15.0 + Phase 3b handoff spec
  afeb000 FCC-SRL v2.0.0 frontend (Phase 2 + 3a): armed-panel v1.15.0 + dashboard.css
  5e89f1a Alert Server v2.17.0: Quality Tag engine + /state v2.0.0 field exposure

These shipped:
- computeQualityTag() server engine (PRIORITY/STANDARD+/STANDARD/CAUTION/CONTESTED)
- /state response exposes all v2.0.0 fields plus qualityTag/qualityReason
- armed-panel renders quality badge + sweep badge + magnet list + session/ADX line
- Sort within tier groups now secondary-sorts by quality tag

Full handoff spec is in forex-command-centre/docs/PHASE_3B_HANDOFF.md.
Please clone the repo, read the handoff doc end-to-end, then confirm
scope and build order before writing any code.

PRE-FLIGHT (mandatory before any code):

1. Verify quality tags are flowing live with real data. Run:

   curl -s https://api.pineros.club/state | jq '
     [.pairs[] | {qualityTag, sweepRisk}] | group_by(.qualityTag)
     | map({tag: .[0].qualityTag, count: length})'

   If all qualityTag values are still null after Monday Tokyo open,
   diagnose first -- enrichment isn't firing or Pine deploy is broken.
   Don't build UI on a broken contract.

2. Eyeball the live PWA. Are v1.15.0 badges + magnet panel + session
   line visually acceptable, or does density need tuning? UI judgement
   call best made WITH live data.

3. Confirm with me: Hide CONTESTED default ON or OFF? Spec says ON
   (institutional protection). May want OFF for first week of data.

THIS SESSION'S GOAL — pick ONE of:

  (A) Phase 3b only -- filter chips + hidden counter + localStorage on
      armed-panel.js (v1.15.0 -> v1.16.0). ~80 lines, low risk.
  (B) Phase 3c only -- Intelligence Hub calibration tabs on
      arm-history-dashboard.html. ~400-600 lines, dedicated session.
  (C) Both 3b and 3c -- only if context budget allows. Push back if
      unclear.

KEY RULES (still in effect):
- Ask before starting any task
- Clone repo via bash (never web_fetch)
- Blunt, direct, institutional framing
- Australian/UK spelling
- All file edits via Python byte-level ops with corruption checks
- Version bumps on any content change
- Update CHANGELOG.md after every deployment
- Token injection pattern: set -> push -> clear (never persist)
- Pine Script v6 only, traditional if-else for multi-line conditions
- HTML emojis as &#xNNNN; entities, never raw

Start with the pre-flight, then propose scope.
```

---

## Notes for next-session Claude

- User prefers Path B (deploy + verify each phase) over Path A (stack source-only)
- User pushed back on "build everything now" mid-Saturday because Phase 3c without weekend data is building blind — repeat that judgement if pressured
- Same GitHub token reused multiple times last session — always remind to rotate at session end if reused
- `storage-api.php` two-copy problem (live in `nginx/www/api/` vs git in `forex-command-centre/backend/api/`) is a known landmine — diff before pulling, sync both ways

**End of handoff.**
