#!/usr/bin/env python3
"""
MDI Phase 3 - Alert Server Patch v1.0.0

Applies /macro-dominance/events endpoint to forex-alert-server/index.js.

CHANGES:
  1. Bump VERSION: 2.15.0 -> 2.16.0
  2. Add CHANGES entry for 2.16.0
  3. Add MACRO_EVENTS_FILE constant
  4. Add GET /macro-dominance/events endpoint (with filters)

SAFETY:
  - Creates .backup before writing
  - Validates encoding (mojibake byte count before + after)
  - Aborts on corruption, restores backup
  - Idempotent: checks for MARKER before applying

USAGE:
    python3 apply_mdi_phase3_alert_server_patch_v1.0.0.py --target <path> --dry-run
    python3 apply_mdi_phase3_alert_server_patch_v1.0.0.py --target <path>

Changelog:
    v1.0.0 - Initial patch for Phase 3 backend build
"""

import argparse
import os
import shutil
import subprocess
import sys


OLD_VERSION = "2.15.0"
NEW_VERSION = "2.16.0"

MARKER = b"MACRO_EVENTS_FILE"


def check_file(path):
    """Return (file_type, mojibake_byte_count, content)."""
    try:
        r = subprocess.run(["file", path], capture_output=True, text=True, timeout=10)
        ftype = r.stdout.strip()
    except Exception:
        ftype = "unknown"
    with open(path, "rb") as f:
        content = f.read()
    return ftype, content.count(b"\xc3\x83"), content


def safe_write(path, new_content):
    backup = path + ".backup"
    shutil.copy(path, backup)
    with open(path, "wb") as f:
        f.write(new_content)
    _, corrupt, _ = check_file(path)
    if corrupt > 0:
        print(f"  CORRUPTION ({corrupt} bytes) - restoring backup")
        shutil.copy(backup, path)
        return False
    return True


# -- Patch definitions ------------------------------------------------------

# Patch 1: Add MACRO_EVENTS_FILE constant after MACRO_DOMINANCE_HIST_FILE
PATCH_1_FIND = b"const MACRO_DOMINANCE_HIST_FILE = process.env.MACRO_DOMINANCE_HIST_FILE || '/data/macro-dominance-history.json';"
PATCH_1_REPLACE = (
    b"const MACRO_DOMINANCE_HIST_FILE = process.env.MACRO_DOMINANCE_HIST_FILE || '/data/macro-dominance-history.json';\n"
    b"const MACRO_EVENTS_FILE         = process.env.MACRO_EVENTS_FILE         || '/data/macro-dominance-events.json';"
)

# Patch 2: Bump VERSION
PATCH_2_FIND    = b"const VERSION = '" + OLD_VERSION.encode() + b"';"
PATCH_2_REPLACE = b"const VERSION = '" + NEW_VERSION.encode() + b"';"

# Patch 3: Prepend changelog entry
PATCH_3_FIND = b"const CHANGES = [\n    '2.15.0 - MDI Phase 1:"
PATCH_3_REPLACE = (
    b"const CHANGES = [\n"
    b"    '2.16.0 - MDI Phase 3: /macro-dominance/events endpoint. "
    b"Reads macro-dominance-events.json written by macro_event_matcher_v1.0.0.py. "
    b"Returns matched news events with MDI snapshots and ATR-scaled outcome classifications. "
    b"Supports ?status, ?pair, ?threshold, ?limit query filters. "
    b"SOFT authority maintained - display only, no gate modification.',\n"
    b"    '2.15.0 - MDI Phase 1:"
)

# Patch 4: Insert /macro-dominance/events endpoint before the 404 handler
PATCH_4_FIND = b"    // 404\n    res.writeHead(404, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Not found' }));\n});"

PATCH_4_REPLACE = b"""    // ========================================================================
    // MDI PHASE 3 - EVENT MATCHER ENDPOINT (v2.16.0)
    // ========================================================================

    // GET /macro-dominance/events - Return matched news events with outcomes.
    // Reads macro-dominance-events.json written by macro_event_matcher_v1.0.0.py.
    // Query params (all optional):
    //   ?status=COMPLETE|PENDING|ERROR
    //   ?threshold=DOMINANT|LEANING|BALANCED  (filters pairs inside each event)
    //   ?pair=CADJPY  (filters events to those affecting this pair)
    //   ?limit=N  (most recent N events, max 500, default 100)
    // SOFT authority: this endpoint is read-only, display-only.
    if (req.method === 'GET' && req.url.startsWith('/macro-dominance/events')) {
        var STALE_HOURS_EVENTS = 24; // matcher runs every min; 24h quiet = concerning
        try {
            if (!fs.existsSync(MACRO_EVENTS_FILE)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: true,
                    entries: [],
                    total: 0,
                    returned: 0,
                    note: 'No events captured yet. Run macro_event_matcher_v1.0.0.py --unraid via cron.'
                }));
                return;
            }

            var raw  = fs.readFileSync(MACRO_EVENTS_FILE, 'utf8');
            var data = JSON.parse(raw);

            var allEvents = (data && Array.isArray(data.events)) ? data.events : [];
            var lastUpdated = data && data.last_updated ? data.last_updated : null;
            var stale = true;
            if (lastUpdated) {
                var ageMs = Date.now() - new Date(lastUpdated).getTime();
                stale = ageMs > (STALE_HOURS_EVENTS * 60 * 60 * 1000);
            }

            // Parse query filters
            var urlParts = req.url.split('?');
            var statusFilter    = null;
            var thresholdFilter = null;
            var pairFilter      = null;
            var limit = 100;

            if (urlParts.length > 1) {
                var params = urlParts[1].split('&');
                for (var i = 0; i < params.length; i++) {
                    var kv = params[i].split('=');
                    var key = kv[0];
                    var val = kv[1] ? decodeURIComponent(kv[1]) : '';
                    if (key === 'status'    && val) statusFilter    = val.toUpperCase();
                    if (key === 'threshold' && val) thresholdFilter = val.toUpperCase();
                    if (key === 'pair'      && val) pairFilter      = val.toUpperCase();
                    if (key === 'limit' && val) {
                        var n = parseInt(val, 10);
                        if (!isNaN(n) && n > 0 && n <= 500) limit = n;
                    }
                }
            }

            // Apply filters
            var filtered = allEvents;

            if (statusFilter) {
                filtered = filtered.filter(function(e) {
                    return e && e.outcome && e.outcome.status === statusFilter;
                });
            }

            if (pairFilter) {
                filtered = filtered.filter(function(e) {
                    return e && e.pairs && e.pairs[pairFilter];
                });
            }

            if (thresholdFilter) {
                // Filter events where AT LEAST ONE pair matches the threshold.
                // Useful for counting DOMINANT-flagged events toward the 30-event unlock.
                filtered = filtered.filter(function(e) {
                    if (!e || !e.pairs) return false;
                    for (var pk in e.pairs) {
                        if (e.pairs.hasOwnProperty(pk)) {
                            if (e.pairs[pk] && e.pairs[pk].mdi_threshold === thresholdFilter) {
                                return true;
                            }
                        }
                    }
                    return false;
                });
            }

            // Stats for the Intel Hub unlock counter
            var stats = {
                total: allEvents.length,
                complete: 0,
                pending: 0,
                dominant_complete: 0,
                leaning_complete: 0,
                balanced_complete: 0
            };
            for (var j = 0; j < allEvents.length; j++) {
                var ev = allEvents[j];
                if (!ev || !ev.outcome) continue;
                if (ev.outcome.status === 'COMPLETE') {
                    stats.complete++;
                    if (ev.pairs) {
                        var hasDom = false, hasLean = false, hasBal = false;
                        for (var pk2 in ev.pairs) {
                            if (!ev.pairs.hasOwnProperty(pk2)) continue;
                            var t = ev.pairs[pk2] && ev.pairs[pk2].mdi_threshold;
                            if (t === 'DOMINANT') hasDom = true;
                            else if (t === 'LEANING') hasLean = true;
                            else if (t === 'BALANCED') hasBal = true;
                        }
                        if (hasDom) stats.dominant_complete++;
                        if (hasLean) stats.leaning_complete++;
                        if (hasBal) stats.balanced_complete++;
                    }
                } else if (ev.outcome.status === 'PENDING') {
                    stats.pending++;
                }
            }

            // Take most recent N (events are appended in order, so tail is newest)
            var sliced = filtered.slice(-limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                last_updated: lastUpdated,
                stale: stale,
                entries: sliced,
                total: filtered.length,
                returned: sliced.length,
                stats: stats,
                filter: {
                    status: statusFilter,
                    threshold: thresholdFilter,
                    pair: pairFilter,
                    limit: limit
                }
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'events read error: ' + e.message }));
        }
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});"""


PATCHES = [
    ("Add MACRO_EVENTS_FILE constant",        PATCH_1_FIND, PATCH_1_REPLACE),
    ("Bump VERSION to " + NEW_VERSION,        PATCH_2_FIND, PATCH_2_REPLACE),
    ("Prepend changelog entry",               PATCH_3_FIND, PATCH_3_REPLACE),
    ("Insert /macro-dominance/events endpoint", PATCH_4_FIND, PATCH_4_REPLACE),
]


def apply_patches(path, dry_run=False):
    print(f"\n>> Target: {path}")
    if not os.path.exists(path):
        print(f"  ERROR: file not found")
        return False

    ftype, corrupt_before, content = check_file(path)
    print(f"  File: {ftype}")
    print(f"  Mojibake before: {corrupt_before}")
    if corrupt_before > 0:
        print(f"  ABORT: file already corrupted")
        return False

    if MARKER in content:
        print(f"  SKIP: patch already applied ('{MARKER.decode()}' found)")
        return True

    new_content = content
    for name, find, replace in PATCHES:
        if find not in new_content:
            print(f"  [FAIL] {name} - target not found")
            preview = find[:80].decode("utf-8", errors="replace")
            print(f"         looking for: {preview}...")
            return False
        new_content = new_content.replace(find, replace, 1)
        print(f"  [OK] {name}")

    delta = len(new_content) - len(content)
    if dry_run:
        print(f"  DRY RUN: would write {len(new_content)} bytes ({delta:+d} delta)")
        return True

    ok = safe_write(path, new_content)
    if ok:
        _, corrupt_after, _ = check_file(path)
        print(f"  Mojibake after: {corrupt_after}")
        print(f"  WROTE {len(new_content)} bytes ({delta:+d} delta)")
    return ok


def main():
    ap = argparse.ArgumentParser(description="MDI Phase 3 alert-server patch")
    ap.add_argument("--target", required=True, help="Path to forex-alert-server/index.js")
    ap.add_argument("--dry-run", action="store_true", help="Preview only, no writes")
    args = ap.parse_args()

    print("=" * 72)
    print(f"MDI Phase 3 Alert Server Patch v1.0.0  ({OLD_VERSION} -> {NEW_VERSION})")
    print("=" * 72)

    ok = apply_patches(args.target, dry_run=args.dry_run)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
