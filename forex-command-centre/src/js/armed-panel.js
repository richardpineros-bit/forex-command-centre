// armed-panel.js - Extracted from index.html Phase 2
(function() {
    // Configuration
    const STATE_URL = 'https://api.pineros.club/state';
    const REFRESH_INTERVAL = 30000; // 30 seconds

    // ── Armed panel instrument filter (settings-driven) ─────────────────────
    // Reads excluded instruments from localStorage (set in Settings tab)
    // Default: bonds excluded, all indices shown (user can trade them)

    function getExcludedPairs() {
        try {
            var stored = localStorage.getItem('fcc_armed_exclude');
            if (stored !== null) return JSON.parse(stored);
        } catch(e) {}
        return getDefaultExclusions();
    }

    function getDefaultExclusions() {
        // Bonds excluded by default only
        return [
            'USB02YUSD','USB05YUSD','USB10YUSD','USB30YUSD',
            'UK10YGBP','DE10YEUR','JP10YJPY',
        ];
    }

    function isExcluded(pairName) {
        if (!pairName) return false;
        var p = pairName.toUpperCase().replace('/','');
        return getExcludedPairs().indexOf(p) !== -1;
    }

    function toggleContextFilter() {
        if (window._lastArmedData) renderState(window._lastArmedData);
    }

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

    // Bias confluence colour helper
    function biasColour(confluence) {
        if (!confluence || confluence === 'NEUTRAL') return 'var(--text-muted)';
        if (confluence === 'ALIGNED')    return 'var(--color-pass)';
        if (confluence === 'CONFLICTING') return 'var(--color-fail)';
        return 'var(--text-muted)';
    }

    // ATR behaviour colour helper
    function atrColour(behaviour) {
        if (!behaviour) return 'var(--text-muted)';
        var b = behaviour.toUpperCase();
        if (b === 'TREND') return 'var(--color-pass)';
        if (b === 'EXHAUSTED') return 'var(--color-fail)';
        if (b === 'SPIKE') return '#f97316';
        if (b === 'EXPANDING_FAST') return '#eab308';
        if (b === 'EXPANDING_SLOW') return '#86efac';
        if (b === 'CONTRACTING') return 'var(--text-muted)';
        return 'var(--text-secondary)';
    }

    // Build TradingView URLs for a pair
    function tvWebUrl(pair) {
        var sym = (pair || '').replace('/', '').toUpperCase();
        return 'https://www.tradingview.com/chart/?symbol=OANDA:' + sym + '&interval=240';
    }
    function tvNativeUrl(pair) {
        var sym = (pair || '').replace('/', '').toUpperCase();
        return 'tradingview://chart?symbol=OANDA:' + sym + '&interval=240';
    }
    // Try native app, fallback to web
    function openTV(pair) {
        var native = tvNativeUrl(pair);
        var web = tvWebUrl(pair);
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.src = native;
        setTimeout(function() {
            document.body.removeChild(iframe);
        }, 500);
        setTimeout(function() {
            window.open(web, '_blank');
        }, 600);
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

    // Build the bias sub-row for a pair
    function buildBiasRow(p) {
        var pair = (p.pair || '').toUpperCase().replace('/', '');
        var dir  = (p.direction || '').toLowerCase();

        if (!window.NewsBiasEngine || !window.NewsBiasEngine.hasData()) {
            return '<div class="armed-bias-row awaiting">&#x23F3; News bias: awaiting data</div>';
        }

        var verdict = window.NewsBiasEngine.getVerdict(pair, dir);
        if (!verdict) {
            return '<div class="armed-bias-row awaiting">&#x23F3; News bias: no data for ' + pair + '</div>';
        }

        var base  = verdict.base_bias  || {};
        var quote = verdict.quote_bias || {};
        // Don't show "insufficient data" — always show the verdict, even if NEUTRAL

        // Index pairs need explicit base/quote — can't use simple substring split
        var INDEX_CCY = {
            'AU200AUD':['AUD','USD'],'CN50USD':['CNY','USD'],'HK33HKD':['HKD','USD'],
            'JP225YJPY':['JPY','USD'],'JP225USD':['JPY','USD'],
            'US30USD':['USD','USD'],'US2000USD':['USD','USD'],'SPX500USD':['USD','USD'],
            'NAS100USD':['USD','USD'],'UK100GBP':['GBP','USD'],
            'FR40EUR':['EUR','USD'],'EU50EUR':['EUR','USD'],'DE30EUR':['EUR','USD'],
        };
        var baseCcy   = INDEX_CCY[pair] ? INDEX_CCY[pair][0] : pair.substring(0, 3);
        var quoteCcy  = INDEX_CCY[pair] ? INDEX_CCY[pair][1] : pair.substring(3, 6);
        var baseBias  = base.bias  || 'NEUTRAL';
        var quoteBias = quote.bias || 'NEUTRAL';
        var baseArrow  = baseBias  === 'BULLISH' ? '\u25b2' : baseBias  === 'BEARISH' ? '\u25bc' : '\u25b6';
        var quoteArrow = quoteBias === 'BULLISH' ? '\u25b2' : quoteBias === 'BEARISH' ? '\u25bc' : '\u25b6';

        var conf = verdict.confluence;
        var confLabel, confColour;
        if (!dir || verdict.direction === 'NEUTRAL') {
            confLabel  = 'NEUTRAL';
            confColour = 'var(--text-muted)';
        } else {
            confLabel  = conf;
            confColour = biasColour(conf);
        }

        var netStr = (verdict.net_score >= 0 ? '+' : '') + (verdict.net_score || 0).toFixed(1);

        return '<div class="armed-bias-row">' +
            '<span class="armed-bias-ccy">' + baseCcy + ' ' + baseArrow + ' ' + baseBias + '</span>' +
            '<span class="armed-bias-sep">|</span>' +
            '<span class="armed-bias-ccy">' + quoteCcy + ' ' + quoteArrow + ' ' + quoteBias + '</span>' +
            '<span class="armed-bias-sep">|</span>' +
            '<span class="armed-bias-net" style="color:' + confColour + ';font-weight:700">' +
                'Net: ' + netStr + ' ' + confLabel +
            '</span>' +
        '</div>';
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

        var atrBehav = (p.volBehaviour || '').toUpperCase();
        var atrPct = p.volLevel ? Math.round(Number(p.volLevel)) : null;

        // Derive actionable label from ATR percentile — matches UTCC Pine Script exactly
        // <30: IDEAL (expansion likely), 30-59: NORMAL, 60-79: ELEVATED (reduce size 50%), >=80: EXHAUSTED (pass/exit only)
        var atrLabel, atrLabelColour;
        if (atrPct === null) {
            atrLabel = null;
        } else if (atrPct >= 80) {
            atrLabel = 'EXHAUSTED';
            atrLabelColour = 'var(--color-fail)';
        } else if (atrPct >= 60) {
            atrLabel = 'ELEVATED';
            atrLabelColour = '#eab308';
        } else if (atrPct >= 30) {
            atrLabel = 'NORMAL';
            atrLabelColour = 'var(--color-pass)';
        } else {
            atrLabel = 'IDEAL';
            atrLabelColour = '#86efac';
        }

        var atrHtml;
        if (atrLabel) {
            var pctStr = atrPct !== null ? atrPct + '%ile' : '';
            atrHtml = '<span style="color:' + atrLabelColour + ';font-size:0.7rem;font-weight:700;display:block;line-height:1.2">' + atrLabel + '</span>' +
                      (pctStr ? '<span style="color:var(--text-muted);font-size:0.6rem;display:block;line-height:1.1">' + pctStr + '</span>' : '');
        } else if (atrBehav) {
            atrHtml = '<span style="color:' + atrColour(atrBehav) + ';font-size:0.7rem;font-weight:700">' + atrBehav.replace('_', ' ') + '</span>';
        } else {
            atrHtml = '<span style="color:var(--text-muted)">&#x2014;</span>';
        }


        // Structural extension display
        var structRaw = (p.structExt || p.struct_ext || '').toUpperCase();
        var structHtml;
        if (structRaw === 'FRESH') {
            structHtml = '<span style="color:#4ade80;font-size:0.7rem;font-weight:700">FRESH</span>';
        } else if (structRaw === 'DEVELOPING') {
            structHtml = '<span style="color:#eab308;font-size:0.7rem;font-weight:700">DEV</span>';
        } else if (structRaw === 'EXTENDED') {
            structHtml = '<span style="color:var(--color-fail);font-size:0.7rem;font-weight:700">EXT</span>';
        } else {
            structHtml = '<span style="color:var(--text-muted)">&#x2014;</span>';
        }
        var tvOnClick = 'openTV(\'' + (p.pair || '') + '\');return false;';

        var biasRowHtml = buildBiasRow(p);
        return '<div class="armed-pair-wrapper">' +
            '<a href="#" class="' + rowClass + ' armed-row-link" onclick="' + tvOnClick + '" title="Open ' + (p.pair || '') + ' on TradingView 4H">' +
                '<span class="armed-emoji">' + emoji + '</span>' +
                '<span class="armed-pair-name">' + (p.pair || '') + '</span>' +
                '<span class="armed-primary">' + (p.primary || '\u2014') + '</span>' +
                '<span class="armed-permission ' + permDisp + '">' + permLabel + '</span>' +
                '<span class="armed-maxrisk">' + ((p.maxRisk || '').split('|')[0].trim() || '\u2014') + '</span>' +
                '<span class="armed-score" style="color:' + scoreColour(p.score || 0) + '">' + (p.score || '\u2014') + '</span>' +
                '<span class="armed-atr">' + atrHtml + '</span>' +
                '<span class="armed-struct">' + structHtml + '</span>' +
                '<span class="armed-age">' + statusHtml + '</span>' +
            '</a>' +
            biasRowHtml +
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
            '<span>ATR</span>' +
            '<span>Struct</span>' +
            '<span style="text-align:right">Age</span>' +
            '<span></span>' +
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

        // Update count badge -- active armed only (excludes R-OFFSESSION)
        var activeArmedCount = (data.pairs || []).filter(function(p) { return p.primary !== 'R-OFFSESSION'; }).length;
        countEl.textContent = activeArmedCount;
        countEl.className = 'armed-panel-count' + (activeArmedCount === 0 ? ' zero' : '');

        // PWA Badge API — show armed count on app icon
        if ('setAppBadge' in navigator) {
            if (activeArmedCount > 0) {
                navigator.setAppBadge(activeArmedCount).catch(function() {});
            } else {
                navigator.clearAppBadge().catch(function() {});
            }
        }
        
        // Update refresh time
        refreshEl.textContent = formatTime(new Date());
        
        // Build HTML
        var html = '';

        // --- ARMED INSTRUMENTS section ---
        html += '<div class="armed-section-header">' +
            'Armed Instruments ' +
            '<span class="armed-section-count' + (activeArmedCount > 0 ? ' armed' : '') + '">' + activeArmedCount + '</span>' +
        '</div>';

        // Split armed pairs: R-OFFSESSION goes to watchlist pending section
        var pairs = data.pairs || [];
        window._lastArmedData = data;

        // Apply context filter (bonds/indices hidden by default)
        // Apply exclusion filter from settings
        pairs = pairs.filter(function(p) { return !isExcluded(p.pair); });

        var activePairs = pairs.filter(function(p) { return p.primary !== 'R-OFFSESSION'; });
        var offSessionPairs = pairs.filter(function(p) { return p.primary === 'R-OFFSESSION'; });

        if (activePairs.length > 0) {
            html += buildColHeaders();
            for (var i = 0; i < activePairs.length; i++) {
                html += buildRow(activePairs[i], '&#x1F7E2;');
            }
        } else {
            html += '<div class="armed-empty">No instruments armed</div>';
        }

        // --- WATCHLIST section (candidates + off-session armed) ---
        var candidates = data.candidates || [];
        // Remove candidates already in active armed list
        var armedNames = {};
        for (var k = 0; k < activePairs.length; k++) {
            if (activePairs[k].pair) armedNames[activePairs[k].pair] = true;
        }
        candidates = candidates.filter(function(c) { return !armedNames[c.pair]; });
        var watchlistItems = offSessionPairs.concat(candidates);
        if (watchlistItems.length > 0) {
            html += '<div class="armed-section-header">' +
                'Watchlist ' +
                '<span class="armed-section-count candidate">' + watchlistItems.length + '</span>' +
            '</div>';
            html += buildColHeaders();
            for (var j = 0; j < watchlistItems.length; j++) {
                // Orange circle for off-session armed, yellow for candidates
                var emoji = offSessionPairs.indexOf(watchlistItems[j]) !== -1 ? '&#x1F7E0;' : '&#x1F7E1;';
                html += buildRow(watchlistItems[j], emoji);
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
    window.ArmedPanel = { toggleContextFilter: toggleContextFilter };
    // Expose openTV globally for row onclick handlers
    window.openTV = openTV;
    
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
