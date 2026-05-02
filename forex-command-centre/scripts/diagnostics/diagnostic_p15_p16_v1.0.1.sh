#!/bin/bash
# Diagnostic for TODO P15 (STRUCT EXT epidemic) + P16 (LOW CONF dominance)
# Run on Unraid box. Prints six tables. Paste full output back to chat.
#
# Requires: curl, jq

# NOTE: removed set -e (v1.0.0 silently aborted on curl failure)
# Errors are now reported explicitly per-step.

API="${API:-http://localhost:3001}"   # host-mapped port; container internal is 3847
DAYS=7

echo "=================================================================="
echo "FCC Diagnostic: STRUCT EXT + LOW CONF investigation"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Window: last ${DAYS} days"
echo "=================================================================="
echo ""

# Pull last 5000 events (covers ~7 days easily)
RAW=$(curl -s --max-time 10 "${API}/location-history?limit=5000")
CURL_RC=$?

if [ $CURL_RC -ne 0 ]; then
    echo "ERROR: curl failed (rc=$CURL_RC) hitting ${API}/location-history"
    echo "Try: docker ps --filter name=trading-state --format '{{.Ports}}'"
    echo "Override: API=http://localhost:PORT ./diagnostic_p15_p16_v1.0.1.sh"
    exit 1
fi

if [ -z "$RAW" ] || [ "$(echo "$RAW" | jq -r 'type' 2>/dev/null)" != "object" ]; then
    echo "ERROR: Empty or non-JSON response from ${API}/location-history"
    echo "First 200 chars of response:"
    echo "$RAW" | head -c 200
    echo ""
    exit 1
fi

# Filter to last DAYS days
CUTOFF=$(date -u -d "${DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
EVENTS=$(echo "$RAW" | jq --arg cutoff "$CUTOFF" '[.events[] | select(.timestamp >= $cutoff)]')
TOTAL=$(echo "$EVENTS" | jq 'length')

echo "Total events in window: $TOTAL"
echo ""

if [ "$TOTAL" -eq 0 ]; then
    echo "No events in window. Aborting."
    exit 1
fi

# ----- Table 1: Grade distribution -----
echo "--- TABLE 1: Grade distribution (FCC-SRL Pine output) ---"
echo "$EVENTS" | jq -r '
    group_by(.grade) | map({grade: .[0].grade, count: length}) |
    sort_by(-.count) |
    (["GRADE", "COUNT", "PCT"] | @tsv),
    (.[] | [.grade, .count, ((.count * 1000 / '"$TOTAL"' | round) / 10 | tostring + "%")] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Table 2: Sweep risk distribution -----
echo "--- TABLE 2: Sweep risk distribution ---"
echo "$EVENTS" | jq -r '
    group_by(.sweep_risk // "LOW") | map({risk: (.[0].sweep_risk // "LOW"), count: length}) |
    sort_by(-.count) |
    (["RISK", "COUNT", "PCT"] | @tsv),
    (.[] | [.risk, .count, ((.count * 1000 / '"$TOTAL"' | round) / 10 | tostring + "%")] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Table 3: Joint grade x sweep_risk -> derived structExt -----
echo "--- TABLE 3: Joint grade x sweep_risk -> derived structExt ---"
echo "(FRESH grades = PRIME, AT_ZONE, BREAKOUT_RETEST. All others = EXTENDED.)"
echo "(Then: HIGH sweep -> EXTENDED. MEDIUM sweep + FRESH -> EXTENDED.)"
echo ""
echo "$EVENTS" | jq -r '
    map({
        grade: .grade,
        sweep: (.sweep_risk // "LOW"),
        rawStruct: (if (.grade == "PRIME" or .grade == "AT_ZONE" or .grade == "BREAKOUT_RETEST") then "FRESH" else "EXTENDED" end)
    }) |
    map(. + {finalStruct: (
        if .sweep == "HIGH" then "EXTENDED"
        elif (.sweep == "MEDIUM" and .rawStruct == "FRESH") then "EXTENDED"
        else .rawStruct end
    )}) |
    group_by([.grade, .sweep]) |
    map({grade: .[0].grade, sweep: .[0].sweep, finalStruct: .[0].finalStruct, count: length}) |
    sort_by(-.count) |
    (["GRADE", "SWEEP", "->FINAL", "COUNT", "PCT"] | @tsv),
    (.[] | [.grade, .sweep, .finalStruct, .count, ((.count * 1000 / '"$TOTAL"' | round) / 10 | tostring + "%")] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Table 4: Final structExt distribution -----
echo "--- TABLE 4: Final structExt (what trader sees in STRUCT cell) ---"
echo "$EVENTS" | jq -r '
    map({
        grade: .grade,
        sweep: (.sweep_risk // "LOW"),
        rawStruct: (if (.grade == "PRIME" or .grade == "AT_ZONE" or .grade == "BREAKOUT_RETEST") then "FRESH" else "EXTENDED" end)
    }) |
    map(. + {finalStruct: (
        if .sweep == "HIGH" then "EXTENDED"
        elif (.sweep == "MEDIUM" and .rawStruct == "FRESH") then "EXTENDED"
        else .rawStruct end
    )}) |
    group_by(.finalStruct) |
    map({finalStruct: .[0].finalStruct, count: length}) |
    sort_by(-.count) |
    (["FINAL", "COUNT", "PCT"] | @tsv),
    (.[] | [.finalStruct, .count, ((.count * 1000 / '"$TOTAL"' | round) / 10 | tostring + "%")] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Table 5: How often did sweep risk override a FRESH grade? -----
echo "--- TABLE 5: Sweep risk override impact on FRESH grades ---"
echo "(How many PRIME/AT_ZONE/BREAKOUT_RETEST events got downgraded by sweep_risk?)"
echo ""
echo "$EVENTS" | jq -r '
    map(select(.grade == "PRIME" or .grade == "AT_ZONE" or .grade == "BREAKOUT_RETEST")) |
    map({sweep: (.sweep_risk // "LOW")}) |
    map(. + {result: (if .sweep == "HIGH" or .sweep == "MEDIUM" then "DOWNGRADED" else "PRESERVED" end)}) |
    group_by([.sweep, .result]) |
    map({sweep: .[0].sweep, result: .[0].result, count: length}) |
    sort_by(-.count) |
    (["SWEEP", "RESULT", "COUNT"] | @tsv),
    (.[] | [.sweep, .result, .count] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Table 6: Per-asset-class breakdown (for calibration tuning) -----
echo "--- TABLE 6: structExt distribution by asset_class ---"
echo "$EVENTS" | jq -r '
    map({
        asset: (.asset_class // "UNKNOWN"),
        grade: .grade,
        sweep: (.sweep_risk // "LOW"),
        rawStruct: (if (.grade == "PRIME" or .grade == "AT_ZONE" or .grade == "BREAKOUT_RETEST") then "FRESH" else "EXTENDED" end)
    }) |
    map(. + {finalStruct: (
        if .sweep == "HIGH" then "EXTENDED"
        elif (.sweep == "MEDIUM" and .rawStruct == "FRESH") then "EXTENDED"
        else .rawStruct end
    )}) |
    group_by([.asset, .finalStruct]) |
    map({asset: .[0].asset, finalStruct: .[0].finalStruct, count: length}) |
    sort_by(.asset, -.count) |
    (["ASSET_CLASS", "FINAL", "COUNT"] | @tsv),
    (.[] | [.asset, .finalStruct, .count] | @tsv)
' | column -t -s $'\t'
echo ""

# ----- Bonus: UTCC alert tier histogram (if utcc-alerts.json present) -----
echo "=================================================================="
echo "P16: UTCC alert tier/score distribution"
echo "=================================================================="

UTCC_RAW=$(curl -s "${API}/utcc/alerts" 2>/dev/null || echo "")
UTCC_FILE="/mnt/user/appdata/trading-state/utcc-alerts.json"

if [ -f "$UTCC_FILE" ]; then
    echo "Source: $UTCC_FILE"
    echo ""
    echo "--- TABLE 7: UTCC score buckets (last ${DAYS} days, all alerts) ---"
    cat "$UTCC_FILE" | jq --arg cutoff "$CUTOFF" '
        [.alerts[]? // .[]? | select(.timestamp >= $cutoff)] |
        map(.score // 0 | tonumber) |
        {
            "lt75": map(select(. < 75)) | length,
            "75-79": map(select(. >= 75 and . < 80)) | length,
            "80-84": map(select(. >= 80 and . < 85)) | length,
            "85-89": map(select(. >= 85 and . < 90)) | length,
            "ge90": map(select(. >= 90)) | length,
            "total": length
        }
    '
    echo ""
    echo "--- TABLE 8: UTCC alert type x tier distribution ---"
    cat "$UTCC_FILE" | jq -r --arg cutoff "$CUTOFF" '
        [.alerts[]? // .[]? | select(.timestamp >= $cutoff)] |
        group_by([.alertType // "?", .tier // "?"]) |
        map({alertType: .[0].alertType, tier: .[0].tier, count: length}) |
        sort_by(-.count) |
        (["ALERT_TYPE", "TIER", "COUNT"] | @tsv),
        (.[] | [.alertType // "?", .tier // "?", .count] | @tsv)
    ' | column -t -s $'\t'
else
    echo "utcc-alerts.json not found at $UTCC_FILE — skip P16 tables"
    echo "Try: find /mnt/user/appdata -name 'utcc-alerts.json' 2>/dev/null"
fi

echo ""
echo "=================================================================="
echo "Done. Paste full output above into chat."
echo "=================================================================="
