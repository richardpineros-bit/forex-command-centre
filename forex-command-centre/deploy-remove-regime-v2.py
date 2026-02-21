#!/usr/bin/env python3
"""
FCC v4.0 Deployment Script - Phase 1: Remove Regime Tab (FIXED)
Correctly removes ONLY the regime section (lines 104-378), preserving dashboard.

Usage:
    python3 deploy-remove-regime-v2.py
"""

import shutil
import os
import sys

# ============================================
# CONFIG
# ============================================
BASE = '/mnt/user/appdata/forex-command-centre/src'
INDEX = os.path.join(BASE, 'index.html')
CORE_UI = os.path.join(BASE, 'js', 'core-ui.js')

# ============================================
# SAFETY
# ============================================

def check_corruption(filepath):
    with open(filepath, 'rb') as f:
        content = f.read()
    return content.count(b'\xc3\x83')

def safe_replace(filepath, old_bytes, new_bytes, label=""):
    with open(filepath, 'rb') as f:
        content = f.read()
    
    if old_bytes not in content:
        print(f"  WARNING: Target not found for '{label}' - skipping")
        return False
    
    content = content.replace(old_bytes, new_bytes, 1)
    
    with open(filepath, 'wb') as f:
        f.write(content)
    
    corrupt = check_corruption(filepath)
    if corrupt > 0:
        print(f"  CORRUPTION after '{label}'")
        return False
    
    print(f"  OK: {label}")
    return True

# ============================================
# MAIN
# ============================================

def main():
    print("=" * 60)
    print("FCC v4.0 - Remove Regime Tab (FIXED v2)")
    print("=" * 60)
    
    for f in [INDEX, CORE_UI]:
        if not os.path.exists(f):
            print(f"ERROR: Not found: {f}")
            sys.exit(1)
        corrupt = check_corruption(f)
        if corrupt > 0:
            print(f"ERROR: {f} already corrupted ({corrupt} markers). Fix first.")
            sys.exit(1)
    
    print("\n1. Creating backups...")
    shutil.copy(INDEX, INDEX + '.backup-v2')
    shutil.copy(CORE_UI, CORE_UI + '.backup-v2')
    print("  Done (.backup-v2 suffix)")
    
    # ----------------------------------------
    # STEP 2: Rename Context tab to Briefing
    # ----------------------------------------
    print("\n2. Tab renames...")
    safe_replace(
        INDEX,
        b"""<button class="tab-btn" onclick="showTab('daily-context')">Context</button>""",
        b"""<button class="tab-btn" onclick="showTab('daily-context')">Briefing</button>""",
        "Context -> Briefing"
    )
    
    # ----------------------------------------
    # STEP 3: Remove Regime tab button
    # ----------------------------------------
    safe_replace(
        INDEX,
        b"""                <button class="tab-btn" onclick="showTab('regime')">Regime</button>\n""",
        b"",
        "Remove Regime button"
    )
    
    # ----------------------------------------
    # STEP 4: Rename Playbook -> Game Plan
    # ----------------------------------------
    safe_replace(
        INDEX,
        b"""<button class="tab-btn" onclick="showTab('playbook')">Playbook</button>""",
        b"""<button class="tab-btn" onclick="showTab('playbook')">Game Plan</button>""",
        "Playbook -> Game Plan"
    )
    
    # ----------------------------------------
    # STEP 5: Remove ONLY the regime section
    # (from <section id="tab-regime"> to its closing </section>)
    # Dashboard starts AFTER this.
    # ----------------------------------------
    print("\n3. Removing regime section (preserving dashboard)...")
    
    with open(INDEX, 'rb') as f:
        content = f.read()
    
    # Find start: <section id="tab-regime"
    start_marker = b'        <section id="tab-regime" class="tab-content">'
    start_pos = content.find(start_marker)
    if start_pos == -1:
        print("  ERROR: Could not find regime section start")
        sys.exit(1)
    
    # Find end: the next <section id="tab-dashboard"
    end_marker = b'        <section id="tab-dashboard" class="tab-content active">'
    end_pos = content.find(end_marker, start_pos)
    if end_pos == -1:
        print("  ERROR: Could not find dashboard section start")
        sys.exit(1)
    
    removed_bytes = end_pos - start_pos
    content = content[:start_pos] + content[end_pos:]
    
    with open(INDEX, 'wb') as f:
        f.write(content)
    
    corrupt = check_corruption(INDEX)
    if corrupt > 0:
        print(f"  CORRUPTION detected! Restoring backup...")
        shutil.copy(INDEX + '.backup-v2', INDEX)
        sys.exit(1)
    
    print(f"  OK: Removed regime section ({removed_bytes} bytes). Dashboard preserved.")
    
    # ----------------------------------------
    # STEP 6: Update core-ui.js gating
    # ----------------------------------------
    print("\n4. Updating core-ui.js gating...")
    
    old_gating = b"""    // Gate Pre-Trade access through Playbook
    if (tabId === 'validation') {
        // First check regime access
        if (window.RegimeModule) {
            const regimeAccess = window.RegimeModule.checkPreTradeAccess();
            if (!regimeAccess.allowed) {
                alert(regimeAccess.reason);
                showTab('regime');
                return;
            }
        }
        
        // Then check playbook access
        if (window.PlaybookModule) {
            const playbookAccess = window.PlaybookModule.canAccessPreTrade();
            if (!playbookAccess.allowed) {
                // Show gate banner
                const banner = document.getElementById('pretrade-gate-banner');
                if (banner) {
                    banner.style.display = 'flex';
                    const msgEl = banner.querySelector('.gate-message');
                    if (msgEl) msgEl.textContent = playbookAccess.reason;
                }
                showTab('playbook');
                return;
            } else {
                // Hide gate banner
                const banner = document.getElementById('pretrade-gate-banner');
                if (banner) banner.style.display = 'none';
            }
        }
    }
    
    // Gate Playbook access through Regime
    if (tabId === 'playbook') {
        if (window.DailyContext && !DailyContext.isLocked()) {
            alert('Complete Daily Context first');
            showTab('daily-context');
            return;
        }
        if (window.RegimeModule) {
            const data = window.RegimeModule.loadRegimeData();
            if (!data.dailyContext || !data.dailyContext.locked) {
                alert('Complete Daily Context Regime first');
                showTab('regime');
                return;
            }
        }
    }"""
    
    new_gating = b"""    // v4.0: Gate Pre-Trade through Playbook + Circuit Breaker
    if (tabId === 'validation') {
        if (window.CircuitBreaker) {
            const cbCheck = CircuitBreaker.canTrade();
            if (!cbCheck.allowed) {
                alert(cbCheck.reason);
                return;
            }
            if (CircuitBreaker.isReviewRequired()) {
                const review = CircuitBreaker.getPendingReview();
                alert('Post-session review required: ' + (review ? review.reason : 'Complete review first'));
                return;
            }
        }
        if (window.PlaybookModule) {
            const playbookAccess = window.PlaybookModule.canAccessPreTrade();
            if (!playbookAccess.allowed) {
                const banner = document.getElementById('pretrade-gate-banner');
                if (banner) {
                    banner.style.display = 'flex';
                    const msgEl = banner.querySelector('.gate-message');
                    if (msgEl) msgEl.textContent = playbookAccess.reason;
                }
                showTab('playbook');
                return;
            } else {
                const banner = document.getElementById('pretrade-gate-banner');
                if (banner) banner.style.display = 'none';
            }
        }
    }
    
    // v4.0: Gate Playbook through Daily Context only
    if (tabId === 'playbook') {
        if (window.DailyContext && !DailyContext.isLocked()) {
            alert('Complete your morning briefing first');
            showTab('daily-context');
            return;
        }
    }"""
    
    safe_replace(CORE_UI, old_gating, new_gating, "Update tab gating")
    
    # ----------------------------------------
    # FINAL CHECK
    # ----------------------------------------
    print("\n5. Final checks...")
    for f, name in [(INDEX, 'index.html'), (CORE_UI, 'core-ui.js')]:
        corrupt = check_corruption(f)
        if corrupt > 0:
            print(f"  FAIL: {name} corrupted! Restoring...")
            shutil.copy(f + '.backup-v2', f)
        else:
            orig = os.path.getsize(f + '.backup-v2')
            now = os.path.getsize(f)
            print(f"  CLEAN: {name} ({orig} -> {now}, -{orig-now} bytes)")
    
    print("\n" + "=" * 60)
    print("DONE. Hard refresh (Ctrl+Shift+R) and test.")
    print("If broken: rename .backup-v2 files back.")
    print("=" * 60)

if __name__ == '__main__':
    main()
