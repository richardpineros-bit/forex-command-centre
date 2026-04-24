# FCC-SRL v2.0.0 — Liquidity Magnet Extension: Implementation Guide

**Scope:** Upgrade FCC-SRL from v1.0.0 to v2.0.0 and patch alert server to v2.13.0.
**Breaking change:** Webhook payload adds new fields. Alert server MUST be patched before Pine upgrade takes full effect (or all new fields are silently dropped).
**Estimated deploy time:** 15-20 minutes.

---

## What you get

1. **Session H/L tracking** — Tokyo, London, NY session highs/lows as S/R magnets
2. **ADX directional bias** — diPlus/diMinus with configurable threshold determines trade direction
3. **Liquidity magnet counting** — counts all S/R levels within 2.0 ATR of price (configurable)
4. **Sweep risk tier** — LOW / MEDIUM / HIGH drives armed pair tier downgrade
5. **Extended payload** — magnets[] array with type/price/distance/direction per magnet

### Tier downgrade logic (institutional default)

| Sweep Risk | Directional Magnets | Tier Impact |
|------------|---------------------|-------------|
| LOW        | 0-1                 | No change — PRIME can stay PRIME |
| MEDIUM     | 2                   | PRIME/STANDARD → DEGRADED |
| HIGH       | 3+                  | Forced DEGRADED regardless of grade |

---

## Files in this release

| File | Purpose | Deploy target |
|------|---------|---------------|
| `fcc-sr-location_v2.0.0.pine` | New Pine Script | TradingView |
| `patch_alert_server_v2.0.0.py` | Node.js patcher | Unraid SSH |
| `IMPLEMENTATION_GUIDE_v2.0.0.md` | This document | Reference |

---

## PHASE 1 — Deploy alert server patch FIRST

**Why first:** Pine payload changes are backward-compatible at the wire level (extra JSON fields are ignored), but you want the server ready to parse them before the Pine script starts sending. Otherwise new fields are dropped until you deploy the server.

### Step 1.1 — Copy files onto Unraid

```bash
# SSH into Unraid
ssh root@your-unraid

# Copy the Pine file and patcher into the repo clone
cd /mnt/user/appdata
# Place fcc-sr-location_v2.0.0.pine in utcc-indicators/
# Place patch_alert_server_v2.0.0.py anywhere (e.g. /tmp/)
```

### Step 1.2 — Run the patcher

```bash
cd /mnt/user/appdata
python3 /tmp/patch_alert_server_v2.0.0.py
```

**Expected output:**
```
======================================================================
FCC Alert Server Patcher v2.0.0
======================================================================
Target: /mnt/user/appdata/forex-alert-server/index.js
Size:   XXX,XXX chars

Pre-flight check — verifying all fragments exist:
  [OK] Webhook handler — accept new fields
  [OK] enrichArmedPair — sweep risk tiering
  [OK] appendLocHistory — persist new data
  [OK] Version banner — bump to 2.13.0

Backup created: /mnt/user/appdata/forex-alert-server/index.js.backup-pre-v2.0.0

Applying patches:
  [APPLIED] Webhook handler — accept new fields
  [APPLIED] enrichArmedPair — sweep risk tiering
  [APPLIED] appendLocHistory — persist new data
  [APPLIED] Version banner — bump to 2.13.0

SUCCESS. Next steps:
  1. cp forex-alert-server/index.js /mnt/user/appdata/trading-state/index.js
  2. docker restart trading-state
  3. docker logs -f trading-state  (verify startup)
```

**If you see "ABORT: Cannot apply patches cleanly":**
- The server is not at v2.12.0 baseline, OR
- Patches have already been applied (check version banner: `grep 2.13.0 index.js`)
- Do NOT proceed. Contact me with the exact missing/ambiguous list.

### Step 1.3 — Deploy to live container

```bash
cp /mnt/user/appdata/forex-alert-server/index.js \
   /mnt/user/appdata/trading-state/index.js
docker restart trading-state
docker logs --tail=30 trading-state
```

**Expected log line:**
```
[FCC Alert Server] v2.13.0 - FCC-SRL v2.0.0 integration: liquidity magnets...
```

### Step 1.4 — Smoke test (optional but recommended)

Send a test webhook to verify the server accepts new fields:

```bash
curl -X POST https://api.pineros.club/webhook/location \
  -H "Content-Type: application/json" \
  -d '{
    "pair":"TEST",
    "asset_class":"FX",
    "direction":"LONG",
    "grade":"PRIME",
    "zone":"D.SwingL",
    "zone_dist_atr":"0.12",
    "cloud_pos":"AT_LOWER_EDGE",
    "cloud_dist_atr":"0.08",
    "breakout":"NONE",
    "supp_name":"D.SwingL",
    "supp_dist_atr":"0.12",
    "res_name":"PDH",
    "res_dist_atr":"1.4",
    "active_session":"LONDON",
    "sess_hi":"1.0845",
    "sess_lo":"1.0820",
    "adx_bias":"LONG",
    "adx_value":"24.5",
    "magnets_total":4,
    "magnets_directional":2,
    "sweep_risk":"MEDIUM",
    "magnets":[{"type":"PDH","price":"1.0870","dist_atr":"0.8","dir":"AHEAD"}]
  }'
```

**Expected response:** `{"ok":true,"pair":"TEST","grade":"PRIME"}`

**Verify persisted:**
```bash
cat /mnt/user/appdata/nginx/www/data/location.json | python3 -m json.tool | head -40
```
Should show TEST pair with all new fields.

**Clean up test data:**
```bash
# Edit location.json to remove the TEST entry, or let TTL expire naturally
```

---

## PHASE 2 — Deploy Pine Script v2.0.0

### Step 2.1 — Open TradingView

1. Open Pine Editor
2. Open the existing `FCC S/R Location Zones` script
3. **Save As** → `FCC S/R Location Zones v2.0` (so v1.0 is preserved)
4. Paste the contents of `fcc-sr-location_v2.0.0.pine`
5. **Save** and **Add to chart** on one test pair (EURUSD recommended)

### Step 2.2 — Verify compilation

Pine script should compile without errors. Check the status bar for any red errors.

### Step 2.3 — Verify visuals

Chart should still show all existing zones (PDH/PDL, swings, round numbers, cloud). **Session H/L are NOT drawn by default** — `showSessLvls` input is off to avoid clutter. Toggle on to verify session H/L detection is working correctly.

### Step 2.4 — Verify webhook payload

Open TradingView **alert** configured for this pair. Wait for next confirmed bar close (or 4H boundary). Then on Unraid:

```bash
docker logs --tail=10 trading-state | grep Location
```

**Expected:**
```
[Location] EURUSD | LONG | PRIME | zone=D.SwingL | cloud=AT_LOWER_EDGE | brk=NONE
[Enrich] EURUSD | grade:PRIME | locPts:25 | enriched:XX | structExt:FRESH | sweepRisk:LOW | mags:1/2
```

The second line (`[Enrich]`) with `sweepRisk:` and `mags:` fields confirms v2.0.0 is fully wired.

### Step 2.5 — Roll out to remaining pairs

Once verified on one pair, replace on all active pairs. Each pair needs its own alert configured against the v2.0 script.

---

## PHASE 3 — Frontend integration (next session)

The armed panel and intelligence hub will need updates to display the new fields. This is **not in scope for this deployment** — the data is captured server-side and available via `/state` and `/location-history`, but won't be visible in the UI until frontend work is done.

Planned for next session:
- Sweep Risk badge on armed cards (LOW = green, MEDIUM = amber, HIGH = red)
- Magnet list expandable section on armed cards
- Intelligence Hub: new "Sweep Risk Calibration" tab for historical analysis
- Sweep risk filter on armed panel (toggle to hide HIGH sweep pairs)

---

## ROLLBACK PROCEDURES

### If Phase 1 alert server broke something:

```bash
# Restore backup
cp /mnt/user/appdata/forex-alert-server/index.js.backup-pre-v2.0.0 \
   /mnt/user/appdata/forex-alert-server/index.js

# Deploy to live
cp /mnt/user/appdata/forex-alert-server/index.js \
   /mnt/user/appdata/trading-state/index.js

docker restart trading-state
```

### If Phase 2 Pine Script has issues:

Switch the alert in TradingView back to the v1.0 script. Alert server continues to work — it accepts both v1.0 (missing new fields) and v2.0 payloads gracefully.

---

## DEPLOY CHECKLIST SUMMARY

```
[ ] Phase 1.1: Files copied to Unraid
[ ] Phase 1.2: Patcher ran successfully (4 patches applied)
[ ] Phase 1.3: Alert server live container restarted
[ ] Phase 1.4: Smoke test webhook returned ok
[ ] Phase 2.1: Pine v2.0.0 saved as new script in TradingView
[ ] Phase 2.2: Pine v2.0.0 compiled without errors
[ ] Phase 2.3: Visuals rendering correctly on test pair
[ ] Phase 2.4: Webhook log shows sweepRisk and mags fields
[ ] Phase 2.5: Rolled out to all active pairs
[ ] Git commit:
    cd /mnt/user/appdata && git add -A
    git commit -m "FCC-SRL v2.0.0: liquidity magnets + sweep risk tiering"
    # Token injection + push + clear token pattern here
[ ] CHANGELOG.md updated in forex-command-centre/docs/
```

---

## CALIBRATION — POST-DEPLOY

Once v2.0.0 is running, `/location-history` accumulates sweep_risk and magnet data for every bar close. Use the Intelligence Hub (or raw JSON) to tune:

- **`magnetThreshAtr`** (default 2.0): too low = few magnets detected; too high = everything is a magnet
- **`sweepMedMax` / `sweepLowMax`**: adjust the count thresholds per asset class if needed
- **`adxThresh`** (default 20): if ADX regularly below 20 on your pairs, drop to 18

Target: within 2 weeks of live data, you should see sweep risk distribution roughly 60% LOW / 30% MEDIUM / 10% HIGH. If you're getting 80%+ LOW, thresholds are too loose.

---

## INSTITUTIONAL NOTES

**Why this architecture works:**

1. **Separation of concerns preserved** — FCC-SRL still grades location; it now ALSO counts magnets. Magnets don't override the grade, they tier-downgrade it. Two independent signals combined at the tier layer, not confused at the scoring layer.

2. **Fail-closed defaults** — If ADX is weak (below threshold), bias falls back to EMA stack. If session detection fails (e.g. holiday), magnet count just excludes that session H/L. No silent failures.

3. **Backward-compatible wire format** — Server v2.13.0 accepts v1.0 payloads (new fields default to safe LOW/0/NONE). You can revert either side independently.

4. **Audit trail intact** — Every bar close appended to location-history with all new fields. Calibration work can analyse historical decisions without replay.

**What this does NOT do:**

- Does not block trades — it only downgrades tier. Final decision stays with UTCC + trader.
- Does not automate stop-entry order placement — that's Phase 4 work (frontend).
- Does not adjust TP automatically — that's Phase 4 work (stop-entry helper).
- Does not replace your judgment on rejection candles — Phase 5 work.

---

**End of implementation guide.**
