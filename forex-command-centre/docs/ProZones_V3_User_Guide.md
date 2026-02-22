# ProZones V3 — Complete User Guide (v3.4.1)

## What Is ProZones?

ProZones automatically identifies Support and Resistance zones where price has historically reacted multiple times. Unlike simple lines, it creates price ranges representing institutional order clusters and tracks every interaction — touches, rejections, and breaks — scoring each zone by structural importance.

**Your UTCC system tells you WHEN to trade. ProZones tells you WHERE you are relative to structure.** Together, they prevent the most common retail mistake: taking a technically valid signal at a terrible location.

---

## What Changed: V2 → V3

### V2 (Original)
- Detected and drew S/R zones with touch counting
- Showed zone labels with T/R (touches/rejections) on the chart
- No location context — you had to visually estimate distance to nearest zone
- Touch counting was broken — counted every bar inside a zone as a "touch" and summed counts when zones merged, producing fantasy numbers like 1171/417

### V3.0.0 — Proximity Panel
- Added the Proximity Panel (bottom-left table) showing nearest resistance above and support below
- Distance measured in ATR multiples — universally comparable across all pairs
- Strength classification: STRONG, MODERATE, WEAK based on touches and rejections
- Location Verdict — instant answer: AT SUPPORT, AT RESISTANCE, MID-RANGE, etc.

### V3.1.0 — Touch Cooldown (Interest Tracking)
- Added cooldown between counted touches in the interest tracking loop
- Prevented the "every bar inside zone = new touch" inflation
- Only partially fixed — pivot expansion path still bypassed cooldown

### V3.2.0 — Pivot Cooldown + Merge Fix
- Pivot cooldown — same cooldown gate now applied when new pivots overlap existing zones
- Merge fix — when zones merge, takes the HIGHER touch/rejection count (math.max) instead of summing them
- Eliminated the two main sources of count inflation

### V3.3.0 — Broken Zone Freeze
- All three touch/rejection counting paths freeze the moment a zone breaks
- A zone's structural importance is proven BEFORE it breaks, not after
- Post-break price interaction no longer inflates T/R numbers
- Result: broken zone counts reflect genuine pre-break structural history

### V3.4.0 — Broken Zone Role Flip
- Verdict logic now understands that broken zones flip roles
- Broken support below price → treated as resistance in verdict calculation
- Broken resistance above price → treated as support in verdict calculation
- Eliminates false "AT SUPPORT" readings when price is actually sitting on broken support acting as resistance

### V3.4.1 — Direction-Neutral Labels
- Removed long-biased language ("BUYING INTO RESISTANCE")
- All verdicts now state location facts without assuming trade direction
- Designed for FCC integration where UTCC provides direction context

---

## The Proximity Panel — Your Pre-Trade Location Check

The panel shows four rows:

| Row | What It Shows |
|-----|---------------|
| Header | PROXIMITY / Dist (ATR) / Strength / T/R |
| Resistance | Nearest zone ABOVE current price |
| Support | Nearest zone BELOW current price |
| Verdict | Direction-neutral location assessment |

### Distance (ATR)
How far price is from the zone, measured in ATR(14) multiples. This is pair-agnostic — 0.5 ATR means the same thing on EURUSD as it does on GBPJPY.

- **0** = price is AT or INSIDE the zone
- **< 0.5** = danger zone (red) — you are very close to structure
- **0.5 – 1.0** = warning zone (amber) — approaching structure
- **> 1.0** = clear space (neutral)

### Strength Classification
Based on your settings for minimum touches and rejections:

| Strength | Criteria (default) | What It Means |
|----------|-------------------|---------------|
| STRONG | 4+ touches AND 2+ rejections | Institutional-grade level. Price has been here multiple times and been pushed away. Respect this zone. |
| MODERATE | 3+ touches | Meaningful level with structural history. Worth noting. |
| WEAK | Below moderate thresholds | Minor level. Less reliable, can be broken more easily. |

### T / R Column
Touches / Rejections — accurate as of v3.3.0+.

- **Touches** = how many times price structurally interacted with this zone (minimum cooldown between counts, frozen at break)
- **Rejections** = how many times price entered the zone and then closed outside it (frozen at break)

### Zone Tags
The panel labels zones by their current state:

| Tag | Meaning |
|-----|---------|
| RESISTANCE | Normal resistance zone above price |
| SUPPORT | Normal support zone below price |
| BROKEN RES | Resistance that price broke through — now acts as potential support |
| BROKEN SUP | Support that price broke through — now acts as potential resistance |

### Location Verdicts (v3.4.1 — Direction-Neutral)

| Verdict | Colour | Meaning |
|---------|--------|---------|
| AT RESISTANCE | Red | Price within danger distance of resistance (or broken support acting as resistance) |
| APPROACHING RESISTANCE | Amber | Price within warning distance of resistance |
| AT SUPPORT | Green | Price within danger distance of support (or broken resistance acting as support) |
| APPROACHING SUPPORT | Light Green | Price within warning distance of support |
| MID-RANGE | Grey | Not near any significant structure |

**Broken zone role flip (v3.4.0+):** The verdict automatically accounts for broken zones flipping roles. If you're sitting on a broken support, the verdict correctly shows AT RESISTANCE, not AT SUPPORT.

### How To Read The Verdict With UTCC Direction

ProZones states the location fact. You combine it with your UTCC signal direction:

| UTCC Direction | AT RESISTANCE | AT SUPPORT | MID-RANGE |
|---------------|--------------|------------|-----------|
| LONG | BAD — don't buy here | GOOD — ideal long location | CAUTION — no structural edge |
| SHORT | GOOD — ideal short location | BAD — don't short here | CAUTION — no structural edge |

---

## How To Use ProZones V3 In Your UTCC Workflow

### Step 1: Daily Context (FCC)
Complete your regime assessment, volatility check, and session selection as normal.

### Step 2: UTCC Alert Fires
Pair goes ARMED. Score passes, MTF aligns, volatility ready, news clear.

### Step 3: CHECK PROZONES BEFORE ANYTHING ELSE
Before opening the Pre-Trade tab, before thinking about entry — look at the Proximity Panel.

**Go / No-Go Decision Matrix:**

| UTCC Signal | ProZones Verdict | Decision |
|-------------|-----------------|----------|
| LONG | AT SUPPORT | PROCEED — ideal location |
| LONG | APPROACHING SUPPORT | PROCEED — watching for entry |
| LONG | MID-RANGE | CAUTION — no structural edge, reduced size |
| LONG | APPROACHING RESISTANCE | WAIT — let price pull back to support |
| LONG | AT RESISTANCE | HARD PASS — location kills this trade |
| SHORT | AT RESISTANCE | PROCEED — ideal location |
| SHORT | APPROACHING RESISTANCE | PROCEED — watching for entry |
| SHORT | MID-RANGE | CAUTION — no structural edge, reduced size |
| SHORT | APPROACHING SUPPORT | WAIT — let price pull back to resistance |
| SHORT | AT SUPPORT | HARD PASS — location kills this trade |

### Step 4: Structure-Based Stop and Target
Use the T/R numbers and zone distances to set realistic stops and targets:

- **Stop loss:** Beyond the nearest zone in your direction (not arbitrary pip counts)
- **Take profit:** At or before the nearest opposing zone
- **R:R check:** If the nearest opposing zone is closer than your stop, the trade doesn't offer 1.5:1 — skip it

### Step 5: Strength Informs Conviction
- Trading off a STRONG zone = full position size
- Trading off a MODERATE zone = standard or slightly reduced
- Trading off a WEAK zone = reduced size or skip

---

## Settings Guide

### Core Settings

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Chart Timeframe | 4H | 4H | Match your primary trading timeframe |
| Lookback (bars) | 2000 | 1000 | ~6 months on 4H. Sufficient for structural levels |
| Sensitivity | 75 | 70-80 | Lower = fewer, stronger zones. Higher = more zones detected |
| Touch mode: Wick-based | ON | ON | Wicks show where orders actually sit |

### Display Filter

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Filter Mode | ATR window | **ATR window** | Scales to each pair's volatility automatically. Fixes the "too dense on tight pairs, too sparse on volatile pairs" problem |
| ATR Window × | 4.0 | 4 | Shows zones within 4× ATR of price. Good balance of context vs clutter |
| % Window | 0.04 | — | Only used if Filter Mode = Percent window. Not recommended |

### Memory Caps

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Max zones in memory | 160 | 140 | Plenty for most pairs |
| Max zones drawn | 50 | 40 | More zones drawn = more visual clutter |
| Min touches to display | 3 | **3** | With accurate counting in v3.3.0+, 3 real structural touches is meaningful. Old threshold of 6-8 was for inflated counts |
| Touch cooldown (bars) | 6 | 6-10 | 6 bars on 4H = 24 hours. 10 = 40 hours for stricter counting |

### Zone Width Control

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Enable width clamping | ON | ON | Prevents zones from becoming absurdly wide |
| Max half-width ATR× | 0.8 | 0.5-0.6 | Maximum zone half-width as ATR multiple |
| Max half-width % | 0.0025 | **0.002** | **CRITICAL: This is a decimal, NOT a percentage.** 0.002 = 0.2% of price = ~19 pips on AUDCAD. See table below. |
| Max merge span ATR× | 1.5 | **2** | How far apart zones can be and still merge. Lower = fewer merges, more granular |
| Max merge iterations | 3 | 2 | 2 passes is sufficient |

**Half-width % cheat sheet — avoid common mistakes:**

| Value | Actual % | Zone width on a 0.96 pair | Result |
|-------|----------|--------------------------|--------|
| 0.2 | 20% | ~1940 pips | Absurd |
| 0.02 | 2% | ~194 pips | Way too wide |
| 0.015 | 1.5% | ~145 pips | Still too wide |
| **0.002** | **0.2%** | **~19 pips** | **Realistic** |
| 0.003 | 0.3% | ~29 pips | Also acceptable |

### Forex Enhancements

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Snap to round numbers | ON | ON | Zones gravitate to psychological levels (xx00, xx50) |
| Snap strength (pips) | 1.5 | 1 | How aggressively zones snap. 1 = subtle |
| Spread tolerance | 0.5 | 0 | Extra tolerance for spread. 0 for tight-spread pairs |
| Highlight session pivots | ON | ON | Marks zones formed at London/NY/Tokyo opens |
| Apply age decay | ON | ON | Older zones gradually lose score weight |
| Age half-life (bars) | 800 | 800 | ~133 days on 4H |

### Proximity Panel

| Setting | Default | Recommended | Notes |
|---------|---------|-------------|-------|
| Show Proximity Panel | ON | ON | Core feature of v3 |
| Warning distance (ATR) | 1.0 | 1.0 | Amber warning threshold |
| Danger distance (ATR) | 0.5 | 0.5 | Red danger threshold |
| Strong zone: min touches | 4 | 4 | Touches required for STRONG classification |
| Strong zone: min rejections | 2 | 2 | Rejections required for STRONG classification |
| Moderate zone: min touches | 3 | 3 | Touches required for MODERATE classification |
| Alert when within (ATR) | 1.0 | 1.0 | Triggers alert when approaching strong zone |

---

## Reading The Numbers — What's Realistic?

With v3.3.0+ and correct settings, here's what healthy T/R numbers look like:

| T/R Range | Zone Quality | What It Means |
|-----------|-------------|---------------|
| 3-5 / 0-1 | Minor | Recently formed, limited history. Treat as tentative. |
| 6-10 / 2-3 | Solid | Multiple structural interactions. Reliable for entries. |
| 11-20 / 4-8 | Strong | Well-established institutional level. High confidence. |
| 20+ / 8+ | Major | Long-term structural zone. Very significant — expect strong reactions. |
| 50+ / anything | Suspicious | Double check settings. Should be rare with v3.3.0+ fixes. |
| 100+ / anything | BUG | Something is wrong. Should not happen with correct settings. |

---

## Version History Summary

| Version | Key Change |
|---------|-----------|
| v2.x | Original ProZones — zones + labels, no proximity panel |
| v3.0.0 | Added proximity panel with distance, strength, verdicts |
| v3.1.0 | Touch cooldown on interest tracking (partial fix) |
| v3.2.0 | Pivot cooldown + merge uses max instead of sum |
| v3.3.0 | Broken zone freeze — counts stop accumulating at break |
| v3.4.0 | Verdict flips roles for broken zones |
| v3.4.1 | Direction-neutral labels for FCC integration |

---

## Quick Reference Card

**Before every trade, check three things:**

1. **Verdict + Direction** — AT RESISTANCE with a long signal = PASS. AT SUPPORT with a long signal = GO.
2. **Distance** — How many ATR away is the nearest opposing zone? That's your realistic TP ceiling.
3. **Strength** — Is the zone you're trading off STRONG? If WEAK → reduced size or skip.

**The golden rule stays the same: Location matters more than score. ProZones v3 just makes location impossible to ignore.**
