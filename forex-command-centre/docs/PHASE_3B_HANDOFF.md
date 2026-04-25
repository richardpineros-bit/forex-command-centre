# FCC-SRL v2.0.0 Frontend — Phase 3b Handoff (Filter Chips + Intelligence Hub)

**Status:** Phase 1 + 2 + 3a complete on `main`.
- Alert Server v2.17.0 (commit `5e89f1a`)
- armed-panel v1.15.0 + dashboard.css (commit `afeb000`)
- CHANGELOG updated (this commit)

**This session deferred:** Filter chips, hidden counter, Intelligence Hub tabs.

---

## 1. KICKOFF PROMPT (paste into new chat)

```
Continuing FCC-SRL v2.0.0 frontend work. Previous session shipped:
- Alert Server v2.17.0 (computeQualityTag engine + /state v2.0.0 fields)
- armed-panel v1.15.0 (quality badge, sweep badge, magnet list,
  session/ADX line, secondary sort by quality tag within tier groups)
- dashboard.css additions for all of the above

This session: Phase 3b -- filter chips + hidden counter on the armed
panel, plus Phase 3c -- Intelligence Hub tabs.

Full spec is in forex-command-centre/docs/PHASE_3B_HANDOFF.md in the
repo. Please clone the repo, read the spec end-to-end, then confirm
scope and build order before writing any code.

Key rules still in effect:
- Ask before starting any task
- Clone repo via bash (never web_fetch)
- Blunt, direct, institutional framing
- Australian/UK spelling
- All file edits via Python byte-level ops with corruption checks
- Version bumps on any content change
- Update CHANGELOG.md after deployment
- Token injection pattern: set -> push -> clear (never persist)

First check: by Monday, /state on a few armed pairs should show
populated qualityTag / qualityReason / sweepRisk / magnets fields.
Run `curl -s https://api.pineros.club/state | jq '.pairs[0:3] | .[] |
{pair, qualityTag, qualityReason, sweepRisk, magnetsTotal,
magnetsDirectional, activeSession, adxBias, adxValue}'` and confirm
real data is flowing before building UI on top of it.
```

---

## 2. PHASE 3B SCOPE — FILTER CHIPS + HIDDEN COUNTER

**Target file:** `forex-command-centre/src/js/armed-panel.js` (v1.15.0 -> v1.16.0)

### Build order

1. **Persistence layer** — localStorage key `armed-quality-filters`
   - Default: `{hideContested: true, hideCaution: false, onlyPriority: false}`
   - Loader: returns defaults if missing or JSON parse fails
   - Saver: serialises after each toggle
   - **Hide CONTESTED defaults ON** -- this is the institutional protection
     against Rianpi's stated failure pattern (entering setups that look
     good but get repeatedly swept). Visible counter chip ensures it's
     never silent.

2. **Filter chips render** — at top of armed panel, above the section
   header. Three chips:
   - `Hide CONTESTED` (default active)
   - `Hide CAUTION` (default inactive)
   - `Only PRIORITY` (default inactive — power user mode)
   - CSS classes already shipped in v1.15.0 (`.armed-filter-bar`,
     `.armed-filter-chip`, `.armed-filter-chip.active`).
   - Click toggles state, persists, re-renders.

3. **Hidden counter chip** — ALWAYS VISIBLE when filter is hiding pairs
   - Format: `{n} CONTESTED hidden` and/or `{n} CAUTION hidden`
   - CSS class `.hidden-counter-chip` already shipped.
   - Click reveals hidden pairs temporarily (one-render override) -- DO
     NOT make this dismissible. Institutional transparency requirement:
     trader must always know what's being hidden.
   - Logic precedence: `Only PRIORITY` overrides both Hide flags.

4. **Filter application** — inside `renderArmedState()`, after the existing
   `_dismissedPairs` filter step. Apply quality tag filters BEFORE the
   tier/sort logic so tier counts reflect filtered pairs.

### Filter logic matrix

```
if filters.onlyPriority:
    keep ONLY pairs where qualityTag === 'PRIORITY'
else:
    if filters.hideContested: drop pairs where qualityTag === 'CONTESTED'
    if filters.hideCaution:   drop pairs where qualityTag === 'CAUTION'
```

Pairs with `qualityTag: null` (no v2.0.0 enrichment yet) are NEVER
filtered out — only pairs with explicit tags. Backward compat
non-negotiable.

### Hidden counter logic

After filter step, count what was dropped:
```
hiddenContested = (filters.hideContested || filters.onlyPriority)
                  ? pairsBefore.filter(p => p.qualityTag === 'CONTESTED').length
                  : 0
hiddenCaution   = (filters.hideCaution || filters.onlyPriority)
                  ? pairsBefore.filter(p => p.qualityTag === 'CAUTION').length
                  : 0
```

Render chip(s) only when count > 0. Click handler temporarily disables
the matching filter for ONE render cycle, then restores.

### Version bump

`armed-panel.js v1.15.0 -> v1.16.0` (MINOR — new feature, additive).

---

## 3. PHASE 3C SCOPE — INTELLIGENCE HUB TABS

**Target file:** `forex-command-centre/src/arm-history-dashboard.html` (currently 2265 lines)

### NEW TAB: "Sweep Risk Calibration"

Source data: `loc-history.json` (every FCC-SRL push appended; already
captures `sweep_risk` field per event).

Three sections:
1. **Grade distribution chart** — bar chart of LOW/MEDIUM/HIGH counts
   over selected time range (7d / 30d / 90d toggle). Target distribution
   shown as overlay reference: 60% LOW / 30% MED / 10% HIGH.
2. **Per-asset-class breakdown** — table: asset class (FX / Metals /
   Energy / Indices / Bonds / Crypto) x sweep risk distribution.
   Highlight rows where the class deviates significantly from target.
3. **Auto-calibration tips** — text suggestions:
   - "Your MED/HIGH ratio is X% — consider adjusting magnetThreshAtr
     from 2.0 to Y"
   - "FX class shows 85% LOW — threshold may be too loose, consider
     1.5"

### NEW TAB: "Frequency x Sweep Matrix"

2D heatmap: weekly signal count (Y-axis: 1, 2, 3+) x sweep risk
(X-axis: LOW, MED, HIGH). Each cell shows count of arms in that
quadrant. Win rate cell value comes later (depends on journal outcome
logging — Phase 3d).

The killer insight cell: `3+ signals & HIGH sweep` should eventually
show high loss rate -- proves the CONTESTED concept with data.

### Enhance existing "Location Calibration" tab

- Add `sweep_risk` column to grade distribution table.
- New cross-tab filter: "show only pairs where sweep_risk = HIGH".
- Sparkline per pair showing sweep risk trend over last 7 days.

### Server endpoints (may already exist; verify first)

- `/loc-history?range=7d|30d|90d` — paginated event list
- `/bias-history` — already exists for ADX
- `/location-history` — already exists per memory

Server-side aggregation queries may need to be added if rolling stats
aren't already exposed. Check `forex-alert-server/index.js` first; only
extend if necessary.

### Version bump

`arm-history-dashboard.html` is unversioned (no banner). Add a version
comment at the top this session: `<!-- arm-history-dashboard.html
v1.0.0 -->`. Subsequent bumps follow.

---

## 4. PRE-FLIGHT FOR NEXT SESSION

Before writing ANY code, the next session must:

1. **Confirm v2.17.0 + v1.15.0 are working in the wild** with real data:
   ```bash
   curl -s https://api.pineros.club/state | jq '
     [.pairs[] | {qualityTag, sweepRisk}] | group_by(.qualityTag)
     | map({tag: .[0].qualityTag, count: length})'
   ```
   If all qualityTag values are still null -- something's wrong with the
   weekend Pine deploy or enrichment isn't firing. Diagnose first.

2. **Ask Rianpi how Phase 3a feels visually** before adding complexity.
   The badges + magnet panel + session line could be too dense, or fine.
   This is a UI judgement call best made with live data.

3. **Confirm the Hide CONTESTED default ON** is still the institutional
   call. There's an argument for default OFF on first deploy (so trader
   sees the new tag in action) and switching to ON after a week of data.

---

## 5. FILE CHANGE INVENTORY (Phase 3b + 3c)

| File                            | Phase | Risk | Version bump        |
|---------------------------------|-------|------|---------------------|
| `armed-panel.js`                | 3b    | Low  | v1.16.0 (MINOR)     |
| `arm-history-dashboard.html`    | 3c    | Med  | v1.0.0 -> v1.1.0    |
| `forex-alert-server/index.js`   | 3c    | Low  | only if endpoints   |
|                                 |       |      | need extending      |
| `dashboard.css`                 | 3b/3c | Zero | none (CSS shipped)  |

---

## 6. ROLLBACK

All Phase 3b/3c changes will be additive. If anything breaks:
- JS files: `cp` from `forex-command-centre/src/js/backup/` if you
  preserve a backup, OR git revert.
- Server: `cp index.js.backup-pre-vX.Y.Z` back, `docker restart
  trading-state`.
- Filter state corruption: `localStorage.removeItem('armed-quality-filters')`
  in browser console.

---

## 7. BUDGET ESTIMATE FOR NEXT SESSION

- Phase 3b (filter chips + hidden counter): ~80 lines of edits.
  Comfortable in one session.
- Phase 3c (Intelligence Hub tabs): ~400-600 lines of edits across HTML
  and possibly server. Likely needs its own dedicated session.

Recommended split: Phase 3b in one session (also good time to do any
visual tuning Rianpi requests on Phase 3a), Phase 3c in a separate
session.

---

**End of handoff spec.**
