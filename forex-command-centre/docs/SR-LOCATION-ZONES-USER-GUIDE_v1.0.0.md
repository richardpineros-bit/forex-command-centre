# HTF S/R Location Zones — User Guide v1.0.0

**Indicator:** HTF S/R Location Zones (`sr-location-zones.pine`)  
**Suite:** Forex Command Centre  
**Recommended Chart:** 4H  
**Works on:** 15m, 1H, 4H, Daily

---

## What This Indicator Does

Draws institutional-grade support and resistance zones from six data sources — automatically, without you drawing a single line. Built specifically for traders who cannot stare at charts all day.

Every zone is scored by how many times price has touched it. Labels tell you instantly: what the zone is, how strong it is, and whether multiple sources are stacking at the same level (confluence).

---

## Why These Six Sources

### 1. Weekly Swing Highs/Lows

Weekly structure is where institutional orders live. A weekly swing high was rejected at that price by serious money. It does not forget. These are your strongest reference levels — treat them as walls unless you see a confirmed break with follow-through.

**Colour:** Red/Pink (default)  
**Label prefix:** `W.SwingH` / `W.SwingL`

### 2. Daily Swing Highs/Lows

Daily swings are your medium-term reference. Major daily swing lows in an uptrend are your buy zones. Major daily swing highs in a downtrend are your sell zones. If UTCC fires and price is at a daily swing, that is your level.

**Colour:** Orange (default)  
**Label prefix:** `D.SwingH` / `D.SwingL`

### 3. Previous Day High/Low (PDH/PDL)

The levels every institutional desk marks before the session opens. Price frequently opens, tests PDH or PDL, then reverses. These are short-term decision points — not for swing trades, but critical for entry precision and stop placement.

**Colour:** Cyan (default)  
**Label prefix:** `PDH` / `PDL`

### 4. Previous Week High/Low (PWH/PWL)

Same logic as PDH/PDL but on the weekly scale. Breaking PWH with conviction = strong bullish signal. Rejection at PWH = strong short opportunity. These rarely get tested, so when price reaches them, pay attention.

**Colour:** Purple (default)  
**Label prefix:** `PWH` / `PWL`

### 5. Psychological Round Numbers

Banks cluster limit orders at round numbers. 1.0800, 1.0900, 150.00 — these are not coincidences. The indicator auto-detects the correct increment based on price magnitude. You can override it manually for unusual instruments.

**Colour:** Teal/Green (default)  
**Label prefix:** `RND 1.0800` (shows actual price)

> **Note:** The `Min Touches to Display` setting (default: 1) filters out round numbers that price has never actually visited. A round number with zero touch history is just a theoretical level — not worth drawing.

### 6. Daily 200 EMA Zone

The 200 EMA on the Daily chart is the single most-watched moving average in institutional trading. It separates bull markets from bear markets at the macro level. This zone is wider than the others (configurable) because the EMA is dynamic — price bouncing off "near" the 200 EMA is still a valid reaction.

**Colour:** Gold (default)  
**Label prefix:** `D.200EMA`

---

## Zone Strength System

Every zone is scored by touch count within the configured lookback window.

| Strength | Touches | What It Means |
|----------|---------|---------------|
| **WEAK** | 1 | Level identified but limited history. Valid but lower conviction. |
| **MODERATE** | 2 | Tested twice. Starting to show significance. |
| **STRONG** | 3+ | Repeatedly respected. High conviction zone. |
| **EXHAUSTED** | 4+ (configurable) | Over-tested. May be about to break. Trade with caution — this is not a zone to blindly fade. |

**Box appearance reflects strength:**
- WEAK / MODERATE → thin border, lower opacity
- STRONG → thick border, higher opacity
- EXHAUSTED → grey fill, signals caution

> **Key insight:** An EXHAUSTED zone is not automatically a bad zone — but it signals that the level has been tested so many times that institutional orders there are likely being absorbed or depleted. Monitor for a break rather than a blind reversal.

---

## Confluence — The Most Important Feature

When two or more zones overlap (their boxes intersect), both zones are flagged **CONFLUENCE** and turn red.

**This is your highest-priority signal.** A confluence zone means multiple independent sources of S/R are stacking at the same price. Examples:

- Daily Swing High + Round Number = Wall
- Weekly Swing Low + 200 EMA = Major support
- PDH + Weekly Swing High = Strong sell zone
- Round Number + Daily Swing Low + PDL = High-conviction buy zone

**Label example:** `W.SwingH T:3 [STRONG] [CONFL+RND 1.0900]`

This reads: Weekly Swing High, 3 touches, Strong zone, confluent with the round number at 1.0900.

---

## Reading Labels

Every zone label follows this format:

```
SOURCE  T:N  [STRENGTH]  [CONFL+OTHER_SOURCE]
```

**Examples:**

| Label | Meaning |
|-------|---------|
| `PDH T:2 [MOD]` | Previous Day High, touched 2 times, Moderate strength |
| `W.SwingH T:4 [EXHAUSTED]` | Weekly Swing High, 4 touches, Exhausted — caution |
| `D.SwingL T:3 [STRONG] [CONFL+RND 1.0800]` | Daily Swing Low, 3 touches, Strong, confluent with round number |
| `D.200EMA T:1 [WEAK]` | Daily 200 EMA zone, 1 touch, Weak — early level |

---

## Installation

1. Open TradingView
2. Go to Pine Script Editor (bottom panel)
3. Create new script, paste the full indicator code
4. Click **Publish** → **Save to My Scripts** (name it: `HTF S/R Location Zones`)
5. Close editor, click **Indicators**, search for your saved script
6. Add to chart

**Recommended starting setup:**
- Chart: 4H timeframe
- Enable all six sources initially
- Run for 1–2 weeks before changing defaults

---

## Settings Reference

### Swing Structure (Daily & Weekly)

| Setting | Default | Notes |
|---------|---------|-------|
| Show Daily Swings | ON | Recommended always on |
| Daily Pivot Strength | 5 | Higher = fewer, stronger swings confirmed. Increase to 7+ for a cleaner chart. |
| Daily Swing Search Depth | 500 bars | On 4H = ~83 days. Increase to 1000 for older swings (slower). |
| Max Daily Swing Zones (each direction) | 6 | Max 6 highs + 6 lows. Increase if you want more historical context. |
| Show Weekly Swings | ON | Recommended always on |
| Weekly Pivot Strength | 3 | Lower than daily because weekly candles are already filtered. |
| Weekly Swing Search Depth | 500 bars | On 4H = ~12 weeks. Increase for older weekly structure. |
| Max Weekly Swing Zones (each direction) | 4 | 4 weekly highs + 4 weekly lows. Usually sufficient. |

**Pivot Strength explained:** A value of 5 means the swing high must be the highest bar over the 5 bars to its left AND 5 bars to its right on the daily chart — confirming it as a significant local extreme.

### Previous Day / Week Levels

All four (PDH, PDL, PWH, PWL) recommended ON. These update automatically at the start of each new day/week.

### Psychological Round Numbers

| Setting | Default | Notes |
|---------|---------|-------|
| Show Round Numbers | ON | Recommended |
| Custom Increment | 0 (auto) | Auto-detects based on price. Override if needed. |
| Levels Above & Below | 4 | Shows 4 round levels each side of current price. Increase for wider view. |
| Min Touches to Display | 1 | Filters noise. 0 = show all round numbers including untouched. |
| Zone Width (ATR x) | 0.4 | Slightly smaller than swing zones. Round numbers are precise. |

**Common custom increments:**
- Major FX pairs (EURUSD, GBPUSD): leave at 0 (auto → 0.01)
- JPY pairs (USDJPY): leave at 0 (auto → 0.001)
- Gold (XAUUSD): 10.0 or 50.0
- Indices (S&P500): 100.0 or 50.0
- Crypto (BTCUSD): 1000.0

### Daily 200 EMA Zone

| Setting | Default | Notes |
|---------|---------|-------|
| Show EMA Zone | ON | Recommended |
| EMA Zone Width (ATR x) | 0.5 | Wider than swing zones. EMA reactions can be imprecise. Increase to 1.0 if you find price often reacting near but not exactly at the EMA. |

### Zone Appearance

| Setting | Default | Notes |
|---------|---------|-------|
| Zone Half-Width (ATR x) | 0.3 | Total zone height = 0.6 ATR. Wider on volatile instruments (e.g. Gold: try 0.5). |
| Show Labels | ON | Strongly recommended. Labels are your information layer. |
| Label Size | Small | Tiny for very busy charts, Normal for fewer zones. |
| Extend Boxes Right | 20 bars | Gives visual forward space. Increase to 50–100 for more look-ahead. |

### Touch Count & Zone Strength

| Setting | Default | Notes |
|---------|---------|-------|
| Touch Count Lookback | 300 bars | On 4H = ~50 days of touch history. Increase for longer memory. |
| Touch Cooldown | 3 bars | On 4H = 12 hours between counted touches. Prevents one rejection candle counting as 3 touches. |
| Exhausted Threshold | 4 | Zones with 4+ touches get flagged EXHAUSTED. Reduce to 3 for earlier warnings, increase to 5 for stricter classification. |

### Colours

Fully customisable. The defaults are designed for dark theme TradingView.

**Colour hierarchy (strongest to weakest visual impact):**
1. Confluence (red) — always highest priority
2. Weekly Swing (pink/red)
3. Daily Swing (orange)
4. Prev Week (purple)
5. Prev Day (cyan)
6. Round Numbers (teal)
7. 200 EMA (gold)
8. Exhausted (grey) — deliberately muted

---

## How to Use This With UTCC

This indicator solves the location problem. UTCC solves the setup quality problem. Used together:

**Workflow:**

1. UTCC fires an alert — pair is ARMED
2. Open the chart
3. HTF-SR zones are already drawn
4. Answer these questions:

```
Is price IN a zone right now?
   YES → Is it support (LONG) or resistance (SHORT)?
         Does the direction match the UTCC signal?
         Is there confluence?
         
   NO  → Where is the nearest zone?
         Is price moving TOWARD it or AWAY from it?
         Wait for price to reach the zone.
```

**The golden rule: Never enter mid-range. Wait for a zone.**

---

## Trading Decisions by Zone Type

| Scenario | Action |
|----------|--------|
| UTCC LONG signal, price AT strong daily swing low | HIGH CONVICTION — this is your entry |
| UTCC LONG signal, price AT confluence zone (swing low + round number) | VERY HIGH CONVICTION — full position |
| UTCC LONG signal, price mid-range between zones | WAIT — no location edge |
| UTCC LONG signal, price AT daily swing HIGH | DO NOT TRADE — buying into resistance |
| UTCC signal, price at EXHAUSTED zone | CAUTION — reduce size or wait for break/hold confirmation |
| Any signal, price inside 200 EMA zone | CAUTION — EMA can act as S/R both ways, check direction |

---

## Alerts Setup

Three alert conditions available:

| Alert | When Triggers | Use Case |
|-------|---------------|----------|
| Price Enters Any Zone | Bar closes with price touching PDH/PDL/PWH/PWL/EMA | General zone awareness |
| Price Enters Confluence Zone | Price touches zone AND it overlaps with 200 EMA | Highest priority — check immediately |
| Price at Exhausted Zone | Zone is EXHAUSTED and price is touching it | Caution alert — may break |

**To set up alerts:**
1. Right-click the indicator on the chart → Add Alert
2. Select condition → HTF S/R Location Zones → [condition name]
3. Set notification to: Webhook + App notification (same as UTCC setup)

> Swing zone alerts (daily/weekly) are not available via direct alert conditions because they are drawn in `barstate.islast` only. For these, use TradingView's built-in "Price Crosses" alert manually set to key swing levels you identify visually.

---

## Chart Hygiene Tips

**Keep it clean:**
- If the chart looks too busy: reduce `Max Daily Swing Zones` to 3–4, reduce `Max Weekly Swing Zones` to 2–3
- Increase `Daily Pivot Strength` to 7 for cleaner, fewer swing levels
- Increase `Min Touches to Display` for round numbers to 2 — removes untouched levels
- Disable either Daily OR Weekly swings if both are cluttering the same area

**Best practice:**
- Run on 4H chart for analysis
- Drop to 1H for entry precision within the zone
- The zones remain visible on 1H — the same logic applies

---

## Known Limitations

1. **Swing lookback is current-TF dependent.** On 4H, 500 bars = ~83 days of daily swing history. On 1H, the same 500 bars only covers ~21 days. If running on 1H, increase search depth to 1500+ for equivalent daily coverage.

2. **Historical zones only.** Zones are drawn based on historical data. A fresh swing high formed today will not appear until enough bars have passed to confirm it as a pivot (based on pivot strength setting). There is an inherent lag — by design. Unconfirmed swings are not reliable.

3. **Round number alerts limited.** Alert conditions only cover PDH/PDL/PWH/PWL/EMA zones. Round number and swing zone proximity alerts require manual TradingView price alerts.

4. **Performance on very low timeframes.** The indicator is optimised for 4H. On 15m charts with maximum settings, calculation may be slower. Reduce search depths if loading is slow.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2025 | Initial release. All six sources, touch counting, confluence detection, full customisation. |

---

## Support

Part of the Forex Command Centre suite.  
Repo: `github.com/richardpineros-bit/forex-command-centre`  
Indicator folder: `utcc-indicators/`
