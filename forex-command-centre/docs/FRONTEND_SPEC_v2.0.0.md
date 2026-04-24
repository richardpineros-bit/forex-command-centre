# FCC-SRL v2.0.0 — Frontend Integration Handoff

**Status:** v2.0.0 Pine Script + Alert Server v2.13.0 committed to `main` (commit `d7c14b7`).
**Next session:** Frontend integration — armed card badges, quality tag engine, Intelligence Hub tabs.
**Prerequisites:** v2.0.0 deployed to production and collecting live data (ideally 3-5 days).

---

## 1. KICKOFF PROMPT (paste this into new chat)

```
Continuing FCC-SRL v2.0.0 work. Previous session committed the Pine Script 
(fcc-sr-location_v2.0.0.pine) and Alert Server patcher (v2.13.0) to main — 
commit d7c14b7. Server now captures liquidity magnets, sweep risk tier, 
session H/L, and ADX bias on every armed pair via enrichArmedPair().

This session: build the frontend integration so the data becomes visible and 
actionable in the FCC UI.

Full spec is in forex-command-centre/docs/FRONTEND_SPEC_v2.0.0.md in the repo. 
Please clone the repo, read the spec end-to-end, then confirm scope and 
build order before writing any code.

Key rules still in effect:
- Ask before starting any task
- Clone repo via bash (never web_fetch)
- Blunt, direct, institutional framing
- Australian/UK spelling
- All file edits via Python byte-level ops with corruption checks
- Version bumps on any content change
- Update CHANGELOG.md after deployment
- Token injection pattern: set -> push -> clear (never persist)
```

---

## 2. FULL FRONTEND SCOPE

### Part A — Armed card enhancements (`armed-panel.js`)

**A1. Sweep Risk badge** — renders next to existing tier badge
- `LOW` — subtle green dot (no text), minimal visual weight
- `MEDIUM` — amber badge "SWEEP: MED"
- `HIGH` — red badge "SWEEP: HIGH" with warning icon (HTML entity `&#x26A0;`)
- Hover tooltip: `"{magnets_directional} magnets ahead, {total - directional} behind"`

**A2. Magnet list expansion panel** — per-card, collapsed by default
- Click chevron to expand
- Lists `magnets[]` array sorted by distance ascending (Pine already sorts, preserve order)
- Row format: `{type} @ {price} ({dist_atr} ATR {dir})`
- Color coding: AHEAD = amber text, BEHIND = neutral grey
- Examples:
  - `PDH @ 1.0870 (0.8 ATR AHEAD)` — amber
  - `Round @ 1.0900 (1.4 ATR AHEAD)` — amber
  - `W.SwingL @ 1.0750 (1.2 ATR BEHIND)` — grey
- Max 6 rows (matches `magnetMaxShown` Pine cap)

**A3. Quality tag — the institutional killer feature**
- Prominent badge at top-right of armed card
- Overrides/supplements existing tier display (tier still visible, quality tag is headline)
- Badge styles:
  - `PRIORITY` — gold background, white text
  - `STANDARD+` — blue background
  - `STANDARD` — grey background (neutral)
  - `CAUTION` — amber background with `&#x26A0;` icon
  - `CONTESTED` — red background with strikethrough effect

**A4. Session context line** — small footer text on armed card
- Format: `Active: {active_session} | ADX bias: {adx_bias} ({adx_value})`
- Example: `Active: LONDON | ADX bias: LONG (24.5)`
- Greyed/hidden if `active_session == NONE` or `adx_bias == NONE`

### Part B — Armed panel filters/sort (`armed-panel.js`)

**B1. Default sort order:**
```
PRIORITY → STANDARD+ → STANDARD → CAUTION → CONTESTED
```
Within same quality tag, sort by score descending.

**B2. Filter chips at top of panel:**
- `Hide CONTESTED` — **default ON** (institutional protection against bad-trade pattern)
- `Hide CAUTION` — default OFF
- `Only PRIORITY` — default OFF (power user mode)

**B3. Hidden counter chip** — ALWAYS VISIBLE when filter is hiding pairs
- Format: `{n} CONTESTED hidden` and/or `{n} CAUTION hidden`
- Grey chip, positioned prominently at top of armed panel
- Click to reveal hidden pairs temporarily
- **Not dismissible** — institutional transparency requirement; trader must know what's being hidden

### Part C — Intelligence Hub (`arm-history-dashboard.html`)

**C1. NEW TAB: "Sweep Risk Calibration"**
- Section 1: Grade distribution chart
  - Bar chart: LOW / MEDIUM / HIGH counts over selected time range (7d/30d/90d)
  - Target distribution shown as overlay: 60% LOW / 30% MED / 10% HIGH
- Section 2: Per-asset-class breakdown
  - Table: asset class × sweep risk distribution
  - Highlights if any class deviates significantly from target
- Section 3: Auto-calibration tips
  - "Your MED/HIGH ratio is X% — consider adjusting magnetThreshAtr from 2.0 to Y"
  - "FX class shows 85% LOW — threshold too loose, consider 1.5"

**C2. NEW TAB: "Frequency × Sweep Matrix"**
- 2D heatmap: week signal count (Y: 1, 2, 3+) × sweep risk (X: LOW, MED, HIGH)
- Each cell shows:
  - Count of arms in that quadrant
  - Win rate (once trade outcomes logged against it — phase 2 of this work)
- The killer insight cell: `3+ signals & HIGH sweep` should eventually show high loss rate — proves the CONTESTED concept with data

**C3. Enhance existing "Location Calibration" tab**
- Add `sweep_risk` column to grade distribution table
- New cross-tab filter: "show only pairs where sweep_risk = HIGH"
- Sparkline per pair showing sweep risk trend over last 7 days

### Part D — Server-side (`forex-alert-server/index.js`)

**D1. Quality tag computation** — added to `enrichArmedPair()`:

```javascript
function computeQualityTag(weekCount, sweepRisk) {
    // Institutional matrix — see FRONTEND_SPEC_v2.0.0.md section 3
    if (weekCount >= 3) {
        if (sweepRisk === 'LOW')    return { tag: 'PRIORITY',   reason: 'Persistent structure, clean path' };
        if (sweepRisk === 'MEDIUM') return { tag: 'STANDARD+',  reason: 'Persistent, path contested' };
        if (sweepRisk === 'HIGH')   return { tag: 'CONTESTED',  reason: 'Market hunting this level repeatedly' };
    }
    if (weekCount === 2) {
        if (sweepRisk === 'LOW')    return { tag: 'STANDARD',   reason: 'Pattern forming, clean' };
        if (sweepRisk === 'MEDIUM') return { tag: 'STANDARD',   reason: 'Watch carefully' };
        if (sweepRisk === 'HIGH')   return { tag: 'CONTESTED',  reason: 'Bad pattern emerging' };
    }
    // weekCount === 1 or 0
    if (sweepRisk === 'LOW')        return { tag: 'STANDARD',   reason: 'Fresh, unproven but clean' };
    if (sweepRisk === 'MEDIUM')     return { tag: 'CAUTION',    reason: 'Unproven + path obstructed' };
    if (sweepRisk === 'HIGH')       return { tag: 'CAUTION',    reason: 'Unproven + liquidity cluster ahead' };

    return { tag: 'STANDARD', reason: 'Default' };
}
```

**D2. New fields on `/state` pair object:**
- `qualityTag` — string from computeQualityTag
- `qualityReason` — human-readable reason (used in tooltip)

**D3. Preserve backward compatibility** — if sweep_risk or weekSignalCount missing (e.g., old armed pair before v2.0.0 deploy), qualityTag defaults to 'STANDARD' with reason 'Incomplete data'.

### Part E — PHP storage (`storage-api.php`)

**No whitelist changes needed.** Quality tag is server-computed read-only state, not user-saved preferences.

### Part F — CSS (`dashboard.css`)

New badge styles (use existing FCC colour variables):
```css
.quality-badge-priority  { background: var(--gold);   color: #fff; }
.quality-badge-standard-plus { background: var(--blue); color: #fff; }
.quality-badge-standard  { background: var(--grey);   color: var(--text); }
.quality-badge-caution   { background: var(--amber);  color: #000; }
.quality-badge-contested { background: var(--red);    color: #fff; text-decoration: line-through; }
.sweep-badge-low    { /* small green dot, no text */ }
.sweep-badge-medium { background: var(--amber);  color: #000; }
.sweep-badge-high   { background: var(--red);    color: #fff; }
.magnet-row-ahead   { color: var(--amber); }
.magnet-row-behind  { color: var(--text-muted); }
.hidden-counter-chip { background: var(--grey-light); border: 1px solid var(--border); }
```

---

## 3. QUALITY TAG MATRIX (AUTHORITATIVE)

Revised to match realistic forex UTCC frequency (3+ signals/week = rare, not 5+).

| Signals/week | Sweep Risk | Quality Tag  | Reason                                  |
|--------------|------------|--------------|-----------------------------------------|
| 3+           | LOW        | PRIORITY     | Persistent structure, clean path        |
| 3+           | MEDIUM     | STANDARD+    | Persistent, path contested              |
| 3+           | HIGH       | CONTESTED    | Market hunting this level repeatedly    |
| 2            | LOW        | STANDARD     | Pattern forming, clean                  |
| 2            | MEDIUM     | STANDARD     | Watch carefully                         |
| 2            | HIGH       | CONTESTED    | Bad pattern emerging                    |
| 1            | LOW        | STANDARD     | Fresh, unproven but clean               |
| 1            | MEDIUM     | CAUTION      | Unproven + path obstructed              |
| 1            | HIGH       | CAUTION      | Unproven + liquidity cluster ahead      |

**Sort order (default):** PRIORITY → STANDARD+ → STANDARD → CAUTION → CONTESTED

---

## 4. FILE CHANGE INVENTORY

| File                           | Change size | Risk | Files version bump  |
|--------------------------------|-------------|------|---------------------|
| `armed-panel.js`               | Medium      | Low  | MINOR (new features)|
| `arm-history-dashboard.html`   | Large       | Low  | MINOR (new tabs)    |
| `forex-alert-server/index.js`  | Small       | Low  | v2.14.0 (patch via Python) |
| `dashboard.css`                | Small       | Zero | PATCH (style adds)  |
| `docs/CHANGELOG.md`            | Append only | Zero | —                   |

---

## 5. DEPLOYMENT CHECKLIST (for frontend session)

```
[ ] Clone repo fresh at start of session
[ ] Read this spec end-to-end before writing any code
[ ] Confirm scope with Rianpi (especially quality tag matrix)
[ ] Build order:
    1. Server: computeQualityTag() in index.js (quick win)
    2. armed-panel.js: sweep badge + quality tag + magnet list
    3. armed-panel.js: filters + hidden counter
    4. dashboard.css: badge styles
    5. arm-history-dashboard.html: new tabs
[ ] Test locally — verify state.pairs contains qualityTag
[ ] Copy to live (nginx/www/js/, trading-state/index.js)
[ ] Hard refresh PWA to verify
[ ] Git commit + push with clear tokenless remote
[ ] Update CHANGELOG.md with v2.14.0 server + UI entry
```

---

## 6. CALIBRATION PLAN (POST-DEPLOY)

v2.0.0 Pine Script inputs are the calibration levers:

| Input             | Default | Adjust if...                                     |
|-------------------|---------|--------------------------------------------------|
| `magnetThreshAtr` | 2.0     | Too many LOW (>80%) = tighten to 1.5             |
|                   |         | Too many HIGH (>25%) = loosen to 2.5             |
| `sweepLowMax`     | 1       | If 1 magnet genuinely harmless, raise to 2       |
| `sweepMedMax`     | 2       | If MED is catching too many = lower to 1         |
| `adxThresh`       | 20      | If ADX frequently < 20 = lower to 18 (FX ranges) |

Calibration happens AFTER frontend is live because the Sweep Risk Calibration tab will show distribution data automatically. Target distribution:

- **LOW: 55-65%** (most arms have clean paths)
- **MEDIUM: 25-35%** (contested path, trader can still decide)
- **HIGH: 5-15%** (genuine sweep zones, should be rare)

If distribution is significantly off target after 5-7 days of data, adjust thresholds directly in TradingView Pine Script settings. No Pine redeploy needed — inputs save per-chart.

---

## 7. PRE-FRONTEND PREP WORK (Rianpi's homework between sessions)

While v2.0.0 collects data over the weekend:

1. **Monday:** Deploy v2.0.0 to production following IMPLEMENTATION_GUIDE_v2.0.0.md
2. **Monday-Wednesday:** Passively observe armed panel logs. Note which pairs get tier-downgraded via HIGH sweep risk.
3. **Monday-Wednesday:** When a pair arms with HIGH sweep risk, informally track whether a sweep actually occurs in the next 4-8 hours. Even 5-10 observations calibrate confidence in the signal.
4. **Decision points to bring to next session:**
   - Is the HIGH sweep classification catching real sweeps or false alarms?
   - Are any legitimate trades being downgraded to DEGRADED incorrectly?
   - Does the frequency of HIGH sweep warrant keeping the MEDIUM=FRESH→EXTENDED downgrade, or should it only apply at HIGH?

---

## 8. PHILOSOPHICAL NOTES

**Why quality tag > raw sweep risk in the UI:**
Showing "HIGH sweep risk" alone tells a trader a level is contested but not what to do. Showing "CONTESTED" with a reason tooltip tells them this specific pattern historically produces sweeps, and the system has tier-downgraded accordingly. Institutional UI = combines signals into a decision, not raw data.

**Why "Hide CONTESTED" default ON:**
Matches Rianpi's stated failure pattern — entering setups that look good but get swept. The system's job is to stop irrational behaviour. Removing CONTESTED pairs from the default view prevents FOMO. Visible counter chip ensures it's never silent.

**Why frequency 3+ threshold (not 5+):**
Real UTCC behaviour on a forex pair produces 0-2 arms per week normally. Requiring 5+ for PRIORITY means PRIORITY would almost never trigger — bad UX. 3+ is the right institutional threshold: rare enough to mean something, common enough to actually happen.

**Why CAUTION for unproven + HIGH sweep (not CONTESTED):**
A single arm in a HIGH sweep zone might be bad timing, not a bad level. Needs more data before graduating to CONTESTED. CONTESTED is reserved for patterns confirmed by repetition (2+ arms all failing).

---

## 9. OUT OF SCOPE FOR FRONTEND SESSION

- Stop-entry order helper (Part 4 of original plan) — belongs in pre-trade tab, separate session
- Rejection candle detector Pine Script (Part 5) — separate session
- Trade outcome logging for frequency × sweep win rate — depends on journal module integration, separate session
- Mobile responsive adjustments for new badges — included in B/A if quick, else separate patch

---

## 10. ROLLBACK

All frontend changes are additive. If anything breaks:
- JS files: `cp` previous version from `forex-command-centre/src/js/backup/`
- Server: `cp index.js.backup-pre-v2.14.0` back, `docker restart trading-state`
- CSS: revert `dashboard.css` — no JS depends on new classes if fall-back styles present

---

**End of handoff spec.**

*Generated during session where Pine v2.0.0 + Server v2.13.0 were committed to main (d7c14b7).*
