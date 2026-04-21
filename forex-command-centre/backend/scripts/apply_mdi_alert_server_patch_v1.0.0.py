#!/usr/bin/env python3
"""
MDI Phase 1 — Alert Server Patch v1.0.0

Applies MDI endpoint additions to forex-alert-server/index.js safely.

CHANGES:
    1. Bump VERSION: 2.14.3 -> 2.15.0
    2. Add CHANGES entry for 2.15.0
    3. Add MACRO_DOMINANCE_FILE + MACRO_DOMINANCE_HIST_FILE constants
    4. Add GET /macro-dominance/latest endpoint
    5. Add GET /macro-dominance/history endpoint

USAGE:
    # Dry run (no changes, just diff preview):
    python3 apply_mdi_alert_server_patch_v1.0.0.py --dry-run

    # Apply to live alert server:
    python3 apply_mdi_alert_server_patch_v1.0.0.py \
        --target /mnt/user/appdata/forex-alert-server/index.js

    # Apply to both source and live (recommended):
    python3 apply_mdi_alert_server_patch_v1.0.0.py --unraid

SAFETY:
    - Creates .backup before writing
    - Validates encoding before + after (counts 0xc3 0x83 mojibake bytes)
    - Aborts on corruption detection, restores backup
    - Idempotent: checks for existing MDI markers before applying

Changelog:
    v1.0.0 - Initial patch for Phase 1 MDI build
"""

import argparse
import os
import shutil
import subprocess
import sys


SOURCE_PATH = "/mnt/user/appdata/forex-alert-server/index.js"
LIVE_PATH   = "/mnt/user/appdata/trading-state/index.js"

NEW_VERSION = "2.15.0"
OLD_VERSION = "2.14.3"

MARKER = b"MACRO_DOMINANCE_FILE"   # idempotency marker


# ---------- Safety helpers ----------

def check_file(path):
    """Return (file_type, mojibake_byte_count)."""
    try:
        result = subprocess.run(
            ["file", path], capture_output=True, text=True, timeout=10
        )
        ftype = result.stdout.strip()
    except Exception:
        ftype = "unknown"

    with open(path, "rb") as f:
        content = f.read()
    mojibake = content.count(b"\xc3\x83")
    return ftype, mojibake, content


def safe_write(path, new_content):
    """Write new_content with backup + corruption check. Returns bool."""
    backup = path + ".backup"
    shutil.copy(path, backup)

    with open(path, "wb") as f:
        f.write(new_content)

    _, corrupt, _ = check_file(path)
    if corrupt > 0:
        print(f"  CORRUPTION DETECTED ({corrupt} mojibake bytes) — restoring backup")
        shutil.copy(backup, path)
        return False

    return True


# ---------- Patch definitions ----------

# Patch 1: Add MDI file constants after OANDA_HIST_FILE line
PATCH_1_FIND = b"const OANDA_HIST_FILE    = process.env.OANDA_HIST_FILE    || '/data/oanda-orderbook-history.json';"

PATCH_1_REPLACE = b"""const OANDA_HIST_FILE    = process.env.OANDA_HIST_FILE    || '/data/oanda-orderbook-history.json';
const MACRO_DOMINANCE_FILE      = process.env.MACRO_DOMINANCE_FILE      || '/data/macro-dominance.json';
const MACRO_DOMINANCE_HIST_FILE = process.env.MACRO_DOMINANCE_HIST_FILE || '/data/macro-dominance-history.json';"""

# Fallback for PATCH_1 if OANDA_HIST_FILE line differs — try OANDA_BOOK_FILE line
PATCH_1_FIND_FALLBACK = b"const OANDA_BOOK_FILE    = process.env.OANDA_BOOK_FILE    || '/data/oanda-orderbook.json';"

PATCH_1_REPLACE_FALLBACK = b"""const OANDA_BOOK_FILE    = process.env.OANDA_BOOK_FILE    || '/data/oanda-orderbook.json';
const MACRO_DOMINANCE_FILE      = process.env.MACRO_DOMINANCE_FILE      || '/data/macro-dominance.json';
const MACRO_DOMINANCE_HIST_FILE = process.env.MACRO_DOMINANCE_HIST_FILE || '/data/macro-dominance-history.json';"""

# Patch 2: Bump VERSION
PATCH_2_FIND = b"const VERSION = '" + OLD_VERSION.encode() + b"';"
PATCH_2_REPLACE = b"const VERSION = '" + NEW_VERSION.encode() + b"';"

# Patch 3: Add changelog entry at top of CHANGES array
PATCH_3_FIND = b"const CHANGES = [\n    '2.14.3 - Push audit log:"
PATCH_3_REPLACE = (
    b"const CHANGES = [\n"
    b"    '2.15.0 - MDI Phase 1: /macro-dominance/latest and /macro-dominance/history endpoints. "
    b"Reads macro-dominance.json written by macro_dominance_scraper_v1.0.0.py (every 4h). "
    b"SOFT gate authority -- display only. Scores G8 currencies and 28 cross pairs.',\n"
    b"    '2.14.3 - Push audit log:"
)

# Patch 4: Insert MDI endpoints before the 404 handler
PATCH_4_FIND = b"    // 404\n    res.writeHead(404, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Not found' }));\n});"

PATCH_4_REPLACE = b"""    // ========================================================================
    // MACRO DOMINANCE INDEX (MDI) ENDPOINTS (v2.15.0)
    // ========================================================================

    // GET /macro-dominance/latest - Return MDI currency & pair scores
    // Reads macro-dominance.json written by macro_dominance_scraper_v1.0.0.py (every 4h)
    // SOFT gate authority: display only, does not modify news gate
    if (req.method === 'GET' && req.url === '/macro-dominance/latest') {
        var STALE_HOURS_MDI = 8;
        try {
            if (!fs.existsSync(MACRO_DOMINANCE_FILE)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: false,
                    error: 'macro-dominance.json not found. Run macro_dominance_scraper_v1.0.0.py --unraid first.',
                    last_updated: null,
                    stale: true
                }));
                return;
            }
            var mdiRaw  = fs.readFileSync(MACRO_DOMINANCE_FILE, 'utf8');
            var mdiData = JSON.parse(mdiRaw);
            var isStale = true;
            if (mdiData.last_updated) {
                var ageMsMDI = Date.now() - new Date(mdiData.last_updated).getTime();
                isStale = ageMsMDI > (STALE_HOURS_MDI * 60 * 60 * 1000);
            }
            mdiData.stale = isStale;
            mdiData.ok = true;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mdiData));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'macro-dominance read error: ' + e.message, stale: true }));
        }
        return;
    }

    // GET /macro-dominance/history - Return historical MDI snapshots for edge discovery
    // Optional query: ?pair=CADJPY&limit=50
    if (req.method === 'GET' && req.url.startsWith('/macro-dominance/history')) {
        try {
            if (!fs.existsSync(MACRO_DOMINANCE_HIST_FILE)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, entries: [], total: 0 }));
                return;
            }
            var histRaw  = fs.readFileSync(MACRO_DOMINANCE_HIST_FILE, 'utf8');
            var histData = JSON.parse(histRaw);
            var entries  = (histData && Array.isArray(histData.entries)) ? histData.entries : [];

            // Parse optional query params
            var urlParts = req.url.split('?');
            var pairFilter = null;
            var limit = 100;
            if (urlParts.length > 1) {
                var params = urlParts[1].split('&');
                for (var i = 0; i < params.length; i++) {
                    var kv = params[i].split('=');
                    if (kv[0] === 'pair' && kv[1]) pairFilter = decodeURIComponent(kv[1]).toUpperCase();
                    if (kv[0] === 'limit' && kv[1]) {
                        var n = parseInt(kv[1], 10);
                        if (!isNaN(n) && n > 0 && n <= 500) limit = n;
                    }
                }
            }

            var filtered = entries;
            if (pairFilter) {
                filtered = entries.filter(function(e) {
                    return e.pairs && e.pairs[pairFilter];
                }).map(function(e) {
                    return {
                        timestamp: e.timestamp,
                        pair: pairFilter,
                        data: e.pairs[pairFilter]
                    };
                });
            }

            // Take most recent `limit` entries
            var sliced = filtered.slice(-limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                entries: sliced,
                total: filtered.length,
                returned: sliced.length,
                filter: pairFilter ? { pair: pairFilter } : null
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'macro-dominance/history read error: ' + e.message }));
        }
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});"""


PATCHES = [
    ("Add MDI file constants", PATCH_1_FIND, PATCH_1_REPLACE, PATCH_1_FIND_FALLBACK, PATCH_1_REPLACE_FALLBACK),
    ("Bump VERSION to " + NEW_VERSION, PATCH_2_FIND, PATCH_2_REPLACE, None, None),
    ("Add changelog entry", PATCH_3_FIND, PATCH_3_REPLACE, None, None),
    ("Insert MDI endpoints", PATCH_4_FIND, PATCH_4_REPLACE, None, None),
]


# ---------- Main ----------

def apply_patches(path, dry_run=False):
    """Apply all patches to file at `path`. Returns True on success."""
    print(f"\n>> Target: {path}")

    if not os.path.exists(path):
        print(f"  ERROR: file not found")
        return False

    ftype, corrupt_before, content = check_file(path)
    print(f"  File type: {ftype}")
    print(f"  Mojibake bytes before: {corrupt_before}")
    if corrupt_before > 0:
        print(f"  ABORT: file already corrupted")
        return False

    # Idempotency check
    if MARKER in content:
        print(f"  SKIP: patches already applied (marker '{MARKER.decode()}' found)")
        return True

    new_content = content
    for name, find, replace, find_fb, replace_fb in PATCHES:
        if find in new_content:
            new_content = new_content.replace(find, replace, 1)
            print(f"  [OK] {name}")
        elif find_fb and find_fb in new_content:
            new_content = new_content.replace(find_fb, replace_fb, 1)
            print(f"  [OK] {name} (via fallback)")
        else:
            print(f"  [FAIL] {name} — target string not found")
            print(f"         expected: {find[:80].decode('utf-8', errors='replace')}...")
            return False

    if dry_run:
        print(f"  DRY RUN: would write {len(new_content)} bytes (was {len(content)})")
        print(f"  Delta: +{len(new_content) - len(content)} bytes")
        return True

    ok = safe_write(path, new_content)
    if ok:
        _, corrupt_after, _ = check_file(path)
        print(f"  Mojibake bytes after: {corrupt_after}")
        print(f"  WROTE {len(new_content)} bytes (+{len(new_content) - len(content)} delta)")
    return ok


def main():
    ap = argparse.ArgumentParser(description="MDI alert-server patch v1.0.0")
    ap.add_argument("--target", help="Single file to patch")
    ap.add_argument("--unraid", action="store_true",
                    help="Patch both source and live (source then cp to live)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Preview only, no writes")
    args = ap.parse_args()

    print("=" * 60)
    print(f"MDI Alert Server Patch v1.0.0  (VERSION {OLD_VERSION} -> {NEW_VERSION})")
    print("=" * 60)

    if args.unraid:
        # Patch source first, then copy to live
        ok_src = apply_patches(SOURCE_PATH, dry_run=args.dry_run)
        if not ok_src:
            print("\nSOURCE patch failed. Aborting.")
            return 1
        if args.dry_run:
            print("\nDRY RUN complete. Live file not touched.")
            return 0
        print(f"\n>> Copying patched source -> live")
        shutil.copy(SOURCE_PATH, LIVE_PATH)
        print(f"  cp {SOURCE_PATH} -> {LIVE_PATH}")
        print(f"\nNEXT STEPS:")
        print(f"  1. docker restart trading-state")
        print(f"  2. curl http://localhost:3847/health   (confirm version {NEW_VERSION})")
        print(f"  3. curl http://localhost:3847/macro-dominance/latest")
        return 0

    target = args.target or "./index.js"
    ok = apply_patches(target, dry_run=args.dry_run)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
