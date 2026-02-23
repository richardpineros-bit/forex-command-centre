// armed-panel.js - Extracted from index.html Phase 2
(function() {
    // Configuration
    const STATE_URL = 'https://api.pineros.club/state';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    
    // Elements
    const countEl = document.getElementById('armed-count');
    const listEl = document.getElementById('armed-list');
    const refreshEl = document.getElementById('armed-refresh');
    
    if (!countEl || !listEl || !refreshEl) {
        console.warn('Armed Panel: Elements not found');
        return;
    }

    // Score colour helper
    function scoreColour(score) {
        if (score >= 85) return 'var(--color-pass)';
        if (score >= 75) return 'var(--color-info)';
        if (score >= 65) return 'var(--color-warning)';
        return 'var(--text-muted)';
    }

    // Permission CSS class
    function permClass(perm) {
        if (!perm) return 'permission-legacy';
        var p = perm.toUpperCase();
        if (p === 'FULL') return 'permission-full';
        if (p === 'CONDITIONAL') return 'permission-conditional';
        return 'permission-legacy';
    }

    // Permission display class
    function permDisplayClass(perm) {
        if (!perm) return '';
        var p = perm.toUpperCase();
        if (p === 'FULL') return 'full';
        if (p === 'CONDITIONAL') return 'conditional';
        if (p === 'STAND_DOWN') return 'stand-down';
        return '';
    }

    // === PHASE 5: TTL & FOMO State Calculation ===
    function calculateTTLState(p) {
        var now = new Date();
        var timestamp = p.timestamp ? new Date(p.timestamp) : now;
        var ageMs = now - timestamp;
        var ageHours = ageMs / (1000 * 60 * 60);
        
        var ttlState = 'fresh';
        var fomoBlocked = false;
        var fomoCountdown = '';
        
        // TTL: 24h threshold
        if (ageHours > 24) {
            ttlState = 'expired';
        } else if (ageHours > 8) {
            ttlState = 'ageing';
        }
        
        // FOMO gate: < 1 hour (forced analysis pause)
        if (ageHours < 1) {
            fomoBlocked = true;
            var remainingMins = Math.ceil((1 - ageHours) * 60);
            var rH = Math.floor(remainingMins / 60);
            var rM = remainingMins % 60;
            fomoCountdown = rH > 0 ? '~' + rH + 'h ' + rM + 'm' : '~' + rM + 'm';
        }
        
        return {
            ttlState: ttlState,
            fomoBlocked: fomoBlocked,
            fomoCountdown: fomoCountdown,
            ageHours: ageHours
        };
    }

    // Build a pair row (used for both armed and candidates) - PHASE 5 ENHANCED
    function buildRow(p, emoji) {
        var permCls = permClass(p.permission);
        var permDisp = permDisplayClass(p.permission);
        var permLabel = p.permission || '\u2014';
        if (permLabel === 'CONDITIONAL') permLabel = 'COND';

        var ttl = calculateTTLState(p);
        var rowClass = 'armed-pair-row ' + permCls;
        if (ttl.fomoBlocked) rowClass += ' fomo-blocked';
        if (ttl.ttlState === 'expired') rowClass += ' ttl-expired';
        
        var statusHtml = '';
        if (ttl.fomoBlocked) {
            statusHtml = '<span class="armed-fomo-gate" title="FOMO Gate: 1-hour forced analysis pause (' + ttl.fomoCountdown + ')">' + ttl.fomoCountdown + '</span>';
        } else if (ttl.ttlState === 'fresh') {
            statusHtml = '<span class="armed-ttl-status armed-ttl-fresh" title="Armed less than 8 hours ago">READY</span>';
        } else if (ttl.ttlState === 'ageing') {
            statusHtml = '<span class="armed-ttl-status armed-ttl-ageing" title="Armed 8 to 24 hours ago">AGEING</span>';
        } else {
            statusHtml = '<span class="armed-ttl-status armed-ttl-expired" title="TTL expired, auto-removed">EXPIRED</span>';
        }

        return '<div class="' + rowClass + '">' +
            '<span class="armed-emoji">' + emoji + '</span>' +
            '<span class="armed-pair-name">' + (p.pair || '') + '</span>' +
            '<span class="armed-primary">' + (p.primary || '\u2014') + '</span>' +
            '<span class="armed-permission ' + permDisp + '">' + permLabel + '</span>' +
            '<span class="armed-maxrisk">' + (p.maxRisk || '\u2014') + '</span>' +
            '<span class="armed-score" style="color:' + scoreColour(p.score || 0) + '">' + (p.score || '\u2014') + '</span>' +
            '<span class="armed-age">' + statusHtml + '</span>' +
        '</div>';
    }


    // Column headers row
    function buildColHeaders() {
        return '<div class="armed-col-headers">' +
            '<span></span>' +
            '<span>Pair</span>' +
            '<span>Regime</span>' +
            '<span>Perm</span>' +
            '<span>Risk</span>' +
            '<span>Sc</span>' +
            '<span style="text-align:right">Age</span>' +
        '</div>';
    }
    
    // Fetch and render state
    async function fetchArmedState() {
        try {
            const response = await fetch(STATE_URL, { 
                method: 'GET',
                cache: 'no-cache'
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            renderArmedState(data);
        } catch (e) {
            renderArmedError(e.message);
        }
    }
    
    function renderArmedState(data) {
        var armedCount = data.count || 0;
        var candidateCount = data.candidateCount || 0;
        var totalCount = armedCount + candidateCount;

        // Update count badge (shows armed count only)
        countEl.textContent = armedCount;
        countEl.className = 'armed-panel-count' + (armedCount === 0 ? ' zero' : '');
        
        // Update refresh time
        refreshEl.textContent = formatTime(new Date());
        
        // Build HTML
        var html = '';

        // --- ARMED INSTRUMENTS section ---
        html += '<div class="armed-section-header">' +
            'Armed Instruments ' +
            '<span class="armed-section-count' + (armedCount > 0 ? ' armed' : '') + '">' + armedCount + '</span>' +
        '</div>';

        if (armedCount > 0) {
            html += buildColHeaders();
            var pairs = data.pairs || [];
            for (var i = 0; i < pairs.length; i++) {
                // Green circle for armed: &#x1F7E2;
                html += buildRow(pairs[i], '&#x1F7E2;');
            }
        } else {
            html += '<div class="armed-empty">No instruments armed</div>';
        }

        // --- WATCHLIST section (candidates) ---
        var candidates = data.candidates || [];
        // v4.1.2: Remove candidates that are already in armed list
        var armedNames = {};
        var pairs = data.pairs || [];
        for (var k = 0; k < pairs.length; k++) {
            if (pairs[k].pair) armedNames[pairs[k].pair] = true;
        }
        candidates = candidates.filter(function(c) { return !armedNames[c.pair]; });
        if (candidates.length > 0) {
            html += '<div class="armed-section-header">' +
                'Watchlist ' +
                '<span class="armed-section-count candidate">' + candidates.length + '</span>' +
            '</div>';
            html += buildColHeaders();
            for (var j = 0; j < candidates.length; j++) {
                // Yellow circle for candidate: &#x1F7E1;
                html += buildRow(candidates[j], '&#x1F7E1;');
            }
        }

        listEl.innerHTML = html;
    }
    
    function renderArmedError(msg) {
        listEl.innerHTML = '<div class="armed-error">Cannot connect: ' + msg + '</div>';
        refreshEl.textContent = 'Error';
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Initial fetch
    fetchArmedState();
    
    // Auto-refresh
    setInterval(fetchArmedState, REFRESH_INTERVAL);
    
    // Expose manual refresh globally
    window.refreshArmedPanel = fetchArmedState;
    
    // Show/hide Clear Expired button after each render
    function updateClearExpiredButton() {
        var btn = document.getElementById('btn-clear-expired');
        if (!btn) return;
        var expired = document.querySelectorAll('#armed-list .armed-ttl-expired');
        btn.style.display = expired.length > 0 ? 'inline-block' : 'none';
    }
    
    // Observe armed list changes to update button visibility
    var _clearBtnObserver = new MutationObserver(updateClearExpiredButton);
    if (listEl) {
        _clearBtnObserver.observe(listEl, { childList: true, subtree: true });
    }
})();

// Clear expired armed instruments by sending BLOCKED to server
async function clearExpiredArmed() {
    var expiredRows = document.querySelectorAll('#armed-list .ttl-expired');
    // Also get pair names from rows with armed-ttl-expired status
    var expiredPairs = [];
    document.querySelectorAll('#armed-list .armed-ttl-expired').forEach(function(el) {
        var row = el.closest('.armed-pair-row');
        if (row) {
            var pairEl = row.querySelector('.armed-pair-name');
            if (pairEl) expiredPairs.push(pairEl.textContent.trim());
        }
    });
    
    if (expiredPairs.length === 0) {
        if (typeof showToast === 'function') showToast('No expired instruments to clear', 'info');
        return;
    }
    
    var stateUrl = 'https://api.pineros.club';
    var cleared = 0;
    
    for (var i = 0; i < expiredPairs.length; i++) {
        try {
            // Server expects pipe-delimited text: TYPE|PAIR|REASON
            await fetch(stateUrl + '/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: 'BLOCKED|' + expiredPairs[i] + '|MANUAL_CLEAR'
            });
            cleared++;
        } catch (e) {
            console.error('Failed to clear ' + expiredPairs[i] + ':', e);
        }
    }
    
    if (typeof showToast === 'function') {
        showToast('Cleared ' + cleared + '/' + expiredPairs.length + ' expired instruments', 'success');
    }
    
    // Refresh the panel
    if (typeof window.refreshArmedPanel === 'function') {
        setTimeout(window.refreshArmedPanel, 500);
    }
}
