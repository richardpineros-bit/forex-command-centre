#!/usr/bin/env python3
"""
FCC Alert Server Patcher — v2.0.0 Location Magnet Integration
================================================================

Patches /mnt/user/appdata/forex-alert-server/index.js to support the extended
FCC-SRL v2.0.0 webhook payload (sweep_risk, magnets, adx_bias, session H/L).

What this patch does:
  1. Extends /webhook/location handler to accept and store new fields
  2. Extends enrichArmedPair to apply SWEEP RISK tier downgrade
  3. Extends appendLocHistory to persist new fields for calibration

Safety:
  - Creates .backup file before editing
  - Verifies all expected old-text fragments exist BEFORE writing
  - Aborts cleanly if any fragment is missing (likely wrong version)
  - Prints a summary of changes applied

Usage:
  python3 patch_alert_server_v2.0.0.py

  Then run the deploy sequence:
    cp forex-alert-server/index.js /mnt/user/appdata/trading-state/index.js
    docker restart trading-state
"""

import shutil
import sys
import os

TARGET = '/mnt/user/appdata/forex-alert-server/index.js'

# ============================================================================
# PATCH 1: Extend /webhook/location handler to accept new fields
# ============================================================================
PATCH_1_OLD = """                data.pairs[payload.pair] = {
                    pair:           payload.pair,
                    direction:      payload.direction      || 'NEUTRAL',
                    grade:          payload.grade,
                    zone:           payload.zone           || 'NONE',
                    zone_dist_atr:  payload.zone_dist_atr  || 'na',
                    cloud_pos:      payload.cloud_pos      || 'CLEAR',
                    cloud_dist_atr: payload.cloud_dist_atr || 'na',
                    breakout:       payload.breakout       || 'NONE',
                    supp_name:      payload.supp_name      || 'NONE',
                    supp_dist_atr:  payload.supp_dist_atr  || 'na',
                    res_name:       payload.res_name       || 'NONE',
                    res_dist_atr:   payload.res_dist_atr   || 'na',
                    timestamp:      now.toISOString()
                };"""

PATCH_1_NEW = """                data.pairs[payload.pair] = {
                    pair:           payload.pair,
                    direction:      payload.direction      || 'NEUTRAL',
                    grade:          payload.grade,
                    zone:           payload.zone           || 'NONE',
                    zone_dist_atr:  payload.zone_dist_atr  || 'na',
                    cloud_pos:      payload.cloud_pos      || 'CLEAR',
                    cloud_dist_atr: payload.cloud_dist_atr || 'na',
                    breakout:       payload.breakout       || 'NONE',
                    supp_name:      payload.supp_name      || 'NONE',
                    supp_dist_atr:  payload.supp_dist_atr  || 'na',
                    res_name:       payload.res_name       || 'NONE',
                    res_dist_atr:   payload.res_dist_atr   || 'na',
                    // v2.0.0 — Liquidity Magnets + Session H/L + ADX bias
                    active_session:      payload.active_session      || 'NONE',
                    sess_hi:             payload.sess_hi             || 'na',
                    sess_lo:             payload.sess_lo             || 'na',
                    adx_bias:            payload.adx_bias            || 'NONE',
                    adx_value:           payload.adx_value           || 'na',
                    magnets_total:       payload.magnets_total       || 0,
                    magnets_directional: payload.magnets_directional || 0,
                    sweep_risk:          payload.sweep_risk          || 'LOW',
                    magnets:             Array.isArray(payload.magnets) ? payload.magnets : [],
                    timestamp:      now.toISOString()
                };"""

# ============================================================================
# PATCH 2: Extend enrichArmedPair with sweep risk tier downgrade
# ============================================================================
PATCH_2_OLD = """        var baseScore = state.pairs[pair].score || 0;
        var locPts    = gradeToLocPts(loc.grade);

        state.pairs[pair].locScore      = locPts;
        state.pairs[pair].enrichedScore = Math.min(100, baseScore + locPts);
        state.pairs[pair].locGrade      = loc.grade;
        state.pairs[pair].locTimestamp  = loc.timestamp;
        state.pairs[pair].structExt     = gradeToStructExt(loc.grade);

        saveState(state);
        console.log('[Enrich] ' + pair + ' | grade:' + loc.grade + ' | locPts:' + locPts + ' | enriched:' + state.pairs[pair].enrichedScore + ' | structExt:' + state.pairs[pair].structExt);
        return true;"""

PATCH_2_NEW = """        var baseScore = state.pairs[pair].score || 0;
        var locPts    = gradeToLocPts(loc.grade);

        // v2.0.0 — Sweep risk tier downgrade
        // HIGH sweep risk forces EXTENDED (DEGRADED tier) regardless of grade
        // MEDIUM sweep risk downgrades FRESH -> EXTENDED (one tier)
        // LOW sweep risk has no effect
        var rawStructExt = gradeToStructExt(loc.grade);
        var sweepRisk    = loc.sweep_risk || 'LOW';
        var finalStructExt = rawStructExt;
        if (sweepRisk === 'HIGH') {
            finalStructExt = 'EXTENDED';
        } else if (sweepRisk === 'MEDIUM' && rawStructExt === 'FRESH') {
            finalStructExt = 'EXTENDED';
        }

        state.pairs[pair].locScore           = locPts;
        state.pairs[pair].enrichedScore      = Math.min(100, baseScore + locPts);
        state.pairs[pair].locGrade           = loc.grade;
        state.pairs[pair].locTimestamp       = loc.timestamp;
        state.pairs[pair].structExt          = finalStructExt;
        // v2.0.0 — expose magnet data on armed card
        state.pairs[pair].sweepRisk          = sweepRisk;
        state.pairs[pair].magnetsTotal       = loc.magnets_total       || 0;
        state.pairs[pair].magnetsDirectional = loc.magnets_directional || 0;
        state.pairs[pair].activeSession      = loc.active_session      || 'NONE';
        state.pairs[pair].adxBias            = loc.adx_bias            || 'NONE';
        state.pairs[pair].magnets            = Array.isArray(loc.magnets) ? loc.magnets : [];

        saveState(state);
        console.log('[Enrich] ' + pair + ' | grade:' + loc.grade + ' | locPts:' + locPts + ' | enriched:' + state.pairs[pair].enrichedScore + ' | structExt:' + finalStructExt + ' | sweepRisk:' + sweepRisk + ' | mags:' + (loc.magnets_directional || 0) + '/' + (loc.magnets_total || 0));
        return true;"""

# ============================================================================
# PATCH 3: Extend appendLocHistory to persist new fields
# ============================================================================
PATCH_3_OLD = """        var event = {
            timestamp:      new Date().toISOString(),
            pair:           payload.pair            || '',
            asset_class:    payload.asset_class      || 'FX',
            direction:      payload.direction        || 'NEUTRAL',
            grade:          payload.grade            || 'WAIT',
            zone:           payload.zone             || 'NONE',
            zone_dist_atr:  parseFloat(payload.zone_dist_atr)  || null,
            cloud_pos:      payload.cloud_pos        || 'CLEAR',
            cloud_dist_atr: parseFloat(payload.cloud_dist_atr) || null,
            breakout:       payload.breakout         || 'NONE',
            supp_name:      payload.supp_name        || 'NONE',
            supp_dist_atr:  parseFloat(payload.supp_dist_atr)  || null,
            res_name:       payload.res_name         || 'NONE',
            res_dist_atr:   parseFloat(payload.res_dist_atr)   || null
        };"""

PATCH_3_NEW = """        var event = {
            timestamp:      new Date().toISOString(),
            pair:           payload.pair            || '',
            asset_class:    payload.asset_class      || 'FX',
            direction:      payload.direction        || 'NEUTRAL',
            grade:          payload.grade            || 'WAIT',
            zone:           payload.zone             || 'NONE',
            zone_dist_atr:  parseFloat(payload.zone_dist_atr)  || null,
            cloud_pos:      payload.cloud_pos        || 'CLEAR',
            cloud_dist_atr: parseFloat(payload.cloud_dist_atr) || null,
            breakout:       payload.breakout         || 'NONE',
            supp_name:      payload.supp_name        || 'NONE',
            supp_dist_atr:  parseFloat(payload.supp_dist_atr)  || null,
            res_name:       payload.res_name         || 'NONE',
            res_dist_atr:   parseFloat(payload.res_dist_atr)   || null,
            // v2.0.0 — Liquidity Magnets + Session H/L + ADX for calibration
            active_session:      payload.active_session      || 'NONE',
            sess_hi:             parseFloat(payload.sess_hi) || null,
            sess_lo:             parseFloat(payload.sess_lo) || null,
            adx_bias:            payload.adx_bias            || 'NONE',
            adx_value:           parseFloat(payload.adx_value) || null,
            magnets_total:       parseInt(payload.magnets_total)       || 0,
            magnets_directional: parseInt(payload.magnets_directional) || 0,
            sweep_risk:          payload.sweep_risk          || 'LOW',
            magnets:             Array.isArray(payload.magnets) ? payload.magnets : []
        };"""

# ============================================================================
# PATCH 4: Update version banner
# ============================================================================
PATCH_4_OLD = """    '2.12.0 - Add ltfBreak field"""

PATCH_4_NEW = """    '2.13.0 - FCC-SRL v2.0.0 integration: liquidity magnets (magnets_total, magnets_directional, magnets[] array), sweep_risk tier (LOW/MEDIUM/HIGH) drives structExt downgrade, session H/L tracking (active_session, sess_hi, sess_lo), ADX directional bias (adx_bias, adx_value). HIGH sweep_risk forces EXTENDED; MEDIUM downgrades FRESH->EXTENDED.',
    '2.12.0 - Add ltfBreak field"""

# ============================================================================
# EXECUTE PATCHES
# ============================================================================

PATCHES = [
    ('Webhook handler — accept new fields',  PATCH_1_OLD, PATCH_1_NEW),
    ('enrichArmedPair — sweep risk tiering', PATCH_2_OLD, PATCH_2_NEW),
    ('appendLocHistory — persist new data',  PATCH_3_OLD, PATCH_3_NEW),
    ('Version banner — bump to 2.13.0',      PATCH_4_OLD, PATCH_4_NEW),
]


def main():
    if not os.path.exists(TARGET):
        print(f"ERROR: {TARGET} not found")
        sys.exit(1)

    # Encoding corruption check
    with open(TARGET, 'rb') as f:
        content = f.read()
    corrupt_count = content.count(b'\xc3\x83')
    if corrupt_count > 0:
        print(f"ERROR: File has {corrupt_count} encoding corruption markers. Aborting.")
        sys.exit(1)

    # Read as text
    with open(TARGET, 'r', encoding='utf-8') as f:
        text = f.read()

    # Verify all old fragments exist BEFORE touching anything
    print("=" * 70)
    print("FCC Alert Server Patcher v2.0.0")
    print("=" * 70)
    print(f"Target: {TARGET}")
    print(f"Size:   {len(text):,} chars")
    print()
    print("Pre-flight check — verifying all fragments exist:")

    missing = []
    for name, old, _ in PATCHES:
        found = text.count(old)
        if found == 0:
            print(f"  [MISSING] {name}")
            missing.append(name)
        elif found > 1:
            print(f"  [AMBIGUOUS {found}x] {name}")
            missing.append(name + " (not unique)")
        else:
            print(f"  [OK] {name}")

    if missing:
        print()
        print("ABORT: Cannot apply patches cleanly.")
        print("Likely cause: alert server is not at v2.12.0 baseline, or already patched.")
        print("Missing/ambiguous:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(1)

    # Backup
    backup = TARGET + '.backup-pre-v2.0.0'
    shutil.copy(TARGET, backup)
    print()
    print(f"Backup created: {backup}")

    # Apply
    print()
    print("Applying patches:")
    for name, old, new in PATCHES:
        text = text.replace(old, new)
        print(f"  [APPLIED] {name}")

    # Write
    with open(TARGET, 'w', encoding='utf-8') as f:
        f.write(text)

    # Verify no corruption introduced
    with open(TARGET, 'rb') as f:
        content = f.read()
    corrupt_count = content.count(b'\xc3\x83')
    if corrupt_count > 0:
        print()
        print(f"CORRUPTION DETECTED after write ({corrupt_count} markers). Restoring backup.")
        shutil.copy(backup, TARGET)
        sys.exit(1)

    print()
    print("=" * 70)
    print("SUCCESS. Next steps:")
    print("=" * 70)
    print("  1. cp forex-alert-server/index.js /mnt/user/appdata/trading-state/index.js")
    print("  2. docker restart trading-state")
    print("  3. docker logs -f trading-state  (verify startup)")
    print("  4. Send test webhook or wait for next FCC-SRL bar close")
    print()
    print(f"Rollback if needed:  cp {backup} {TARGET}")


if __name__ == '__main__':
    main()
