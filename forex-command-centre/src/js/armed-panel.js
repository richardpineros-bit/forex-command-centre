// armed-panel.js v1.15.0 - FCC-SRL v2.0.0 frontend (alongside Alert Server v2.17.0): quality tag badge (PRIORITY/STANDARD+/STANDARD/CAUTION/CONTESTED) inline next to pair name; sweep risk badge (LOW dot / MED amber / HIGH red); liquidity magnet list expansion panel (collapsed by default, click chevron to expand, sorted by distance ASC, AHEAD=amber BEHIND=muted); session+ADX bias footer line (Active: SESSION | ADX bias: LONG/SHORT (val), hidden if NONE); sort within each tier (PRIME/STANDARD/DEGRADED) groups by quality tag order PRIORITY-first then by enrichedScore desc. Tier grouping unchanged (independent dimension). Backward compat: missing v2.0.0 fields render as no-op (no badge, no line, no list). | v1.14.0 - Institutional satellite grid: replaces inline intelligence strip with a structured 8-cell heatmap (ZONE|STRUCT|MDI|OB|NEWS|IG|ATR|FREQ) + playbook. Direction-aware cells (NEWS/IG/OB/MDI flip colour by LONG/SHORT alignment); quality cells (ZONE/STRUCT/ATR/FREQ) use absolute scale. Symbol + compact value per cell, tooltip with full reading. Click-to-expand chevron reveals the legacy text strip as detail. Responsive: 8 cols >=900px, 4 cols tablet, 2 cols phone. Tier grouping untouched - degraded tier gets muted opacity only. | v1.13.0 - MDI (Macro Dominance Index) satellite added to intelligence strip (row 3.5, between OB and ATR). SOFT authority - display only, does NOT affect pair score or any gate. Threshold-based colouring (DOMINANT/LEANING/BALANCED). Tooltip includes full SOFT-authority disclaimer. Fail-closed: missing data hides the row entirely, stale data shows '(stale)' tag. Fetch interval 30min (backend updates every 4h). | v1.12.0 - Freq label /wk; VALIDATE button overflow fix (grid 9col->8col, last col auto) | v1.11.0 - Entry Monitor zone badge (item 0 in intelligence strip, server-side data) | v1.10.0 - Watchlist Pin: watch button on armed cards; watched pairs pinned to top; ghost cards survive BLOCKED 8h from snapshot; armed-watchlist.json storage | v1.9.0 - Signal frequency badge in intelligence strip: weekSignalCount drives 1st/2x/4x/6x+ badge with colour tiers (grey/blue/amber/gold) | v1.8.0 - ltfBreak display row on TR cards (1H HIGHER LOW / 1H LOWER HIGH); remove legacy struct_ext snake_case fallback (structExt only); remove volBehaviour/atrBehav dead fallback path | v1.7.0 - Layout redesign: direction+conf in header row; intelligence strip consolidates news/IG/OB/ATR/struct; Oanda order book integrated as 4th satellite; score thresholds updated (HIGH>=3, MED>=1) | v1.6.0 - Score enrichment: show enrichedScore (base+locPts) when available; qualityTier uses locGrade directly; OPPOSED/FALSE_BREAK force DEGRADED; sort by enrichedScore | v1.5.3 - Await loadDismissed() before first fetchArmedState() to fix dismiss race on refresh; v1.5.2 - Expose isExcluded on window.ArmedPanel for QAB filter parity; v1.5.1 - Fix reconcile: only auto-restore pairs with armedAt; dismiss/restore trigger QAB refresh; v1.5.0 - Bugfixes: data-pair for clearExpired, armedAt for dismiss reconcile, getDismissedPairs exposed; v1.4.0 - Ultimate UTCC: TF_ARMED (blue) / TR_ARMED (orange) cards; position size; playbook in verdict row; 3 satellites retained
(function() {
    // Configuration
    const STATE_URL      = 'https://api.pineros.club/state';
    const SENTIMENT_URL  = 'https://api.pineros.club/ig-sentiment/latest';
    const ORDERBOOK_URL  = 'https://api.pineros.club/oanda-book/latest';
    const LOCATION_URL   = 'https://api.pineros.club/location';
    const MACRO_URL      = 'https://api.pineros.club/macro-dominance/latest';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    const MACRO_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min - data updates every 4h
    const API_URL        = '/api/storage-api.php';

    // Sentiment cache
    var _sentimentData  = null;
    var _sentimentStale = true;
    var _locationData   = {};   // keyed by pair name

    // Oanda order book cache
    var _orderBookData  = null;
    var _orderBookStale = true;

    // MDI (Macro Dominance Index) cache - SOFT satellite, display only
    var _macroData  = null;     // { pairs: { CADJPY: {...} }, currencies: {...} }
    var _macroStale = true;

    // Dismissed pairs state (server-side, permanent until new ARMED re-arms the pair)
    // Structure: { pair: { dismissedAt: ISO string } }
    var _dismissedPairs    = {};   // keyed by pair name
    var _dismissedExpanded = false;

    // Watchlist state
    // Structure: { pair: { watchedAt, expiresAt, snapshotScore, snapshotDirection, snapshotPlaybook, snapshotEntryZone } }
    var _watchedPairs      = {};
    var WATCH_TTL_MS       = 8 * 60 * 60 * 1000; // 8 hours
    var _watchlistLoaded   = false; // guard: do not prune before initial load completes


    async function fetchSentiment() {
        try {
            var r = await fetch(SENTIMENT_URL, { cache: 'no-cache' });
            if (!r.ok) return;
            var d = await r.json();
            if (d && d.sentiment) {
                _sentimentData  = d.sentiment;
                _sentimentStale = d.stale || false;
            }
        } catch(e) {}
    }
    fetchSentiment();

    async function fetchOrderBook() {
        try {
            var r = await fetch(ORDERBOOK_URL, { cache: 'no-cache' });
            if (!r.ok) return;
            var d = await r.json();
            if (d && d.order_book) {
                _orderBookData  = d.order_book;
                _orderBookStale = d.stale || false;
            }
        } catch(e) {}
    }
    fetchOrderBook();

    // MDI (Macro Dominance Index) - SOFT satellite, display only.
    // Data updates every 4h on the backend (scraper cron), so we only poll
    // every 30min. No need to fetch on every armed-panel refresh (30s).
    async function fetchMacro() {
        try {
            var r = await fetch(MACRO_URL, { cache: 'no-cache' });
            if (!r.ok) return;
            var d = await r.json();
            if (d && d.ok && d.pairs) {
                _macroData  = d;
                _macroStale = d.stale || false;
            }
        } catch(e) {}
    }
    fetchMacro();

    async function fetchLocation() {
        try {
            var r = await fetch(LOCATION_URL, { cache: 'no-cache' });
            if (!r.ok) return;
            var d = await r.json();
            if (d && d.pairs) {
                _locationData = {};
                d.pairs.forEach(function(entry) {
                    if (entry.pair) _locationData[entry.pair] = entry;
                });
            }
        } catch(e) {}
    }
    fetchLocation();

    // Dismiss storage helpers
    function getTodayAEST() {
        var now = new Date(Date.now() + 10 * 60 * 60 * 1000);
        return now.toISOString().slice(0, 10);
    }

    async function loadDismissed() {
        try {
            var r = await fetch(API_URL + '?file=armed-dismissed');
            if (!r.ok) return;
            var result = await r.json();
            if (result.success && result.data) {
                var d = result.data;
                // v1.3.0: permanent map { pair: { dismissedAt } }
                // Migrate legacy format { date, pairs[] } transparently
                if (d.pairs && typeof d.pairs === 'object' && !Array.isArray(d.pairs)) {
                    _dismissedPairs = d.pairs;
                } else {
                    // Legacy or empty — start clean
                    _dismissedPairs = {};
                    saveDismissed();
                }
            }
        } catch(e) {}
    }

    async function saveDismissed() {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: 'armed-dismissed',
                    data: { pairs: _dismissedPairs }
                })
            });
        } catch(e) {}
    }

    // Watchlist helpers
    async function loadWatchlist() {
        try {
            var r = await fetch(API_URL + '?file=armed-watchlist');
            if (!r.ok) return;
            var result = await r.json();
            if (result.success && result.data && result.data.pairs
                    && typeof result.data.pairs === 'object'
                    && !Array.isArray(result.data.pairs)) {
                _watchedPairs = result.data.pairs;
            } else {
                _watchedPairs = {}; // reset if server returned [] (PHP empty-object bug)
            }
        } catch(e) {}
        _watchlistLoaded = true;
    }

    async function saveWatchlist() {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: 'armed-watchlist', data: { pairs: Array.isArray(_watchedPairs) ? {} : _watchedPairs } })
            });
        } catch(e) {}
    }

    function isWatchExpired(rec) {
        return rec && rec.expiresAt && Date.now() > new Date(rec.expiresAt).getTime();
    }

    function buildGhostWatchCard(pair) {
        var rec = _watchedPairs[pair];
        if (!rec) return '';
        var msLeft    = new Date(rec.expiresAt).getTime() - Date.now();
        var hLeft     = Math.max(0, Math.floor(msLeft / 3600000));
        var mLeft     = Math.max(0, Math.floor((msLeft % 3600000) / 60000));
        var countdown = hLeft + 'h ' + mLeft + 'm';
        var dir       = (rec.snapshotDirection || '').toUpperCase();
        var dirColour = dir === 'LONG' ? '#4ade80' : dir === 'SHORT' ? '#f87171' : 'var(--text-muted)';
        var uAction   = 'event.stopPropagation();unwatchArmedPair(\'' + pair + '\');return false;';
        return (
            '<div class="armed-pair-wrapper" style="border-left:3px solid #f59e0b;opacity:0.85">' +
            '<button class="armed-watch-btn" onclick="' + uAction + '" title="Remove from watchlist"' +
            ' style="color:#fbbf24;background:none;border:none;cursor:pointer;font-size:1rem;padding:4px 6px">&#x2605;</button>' +
            '<div class="armed-pair-row" style="background:rgba(245,158,11,0.04);display:flex;align-items:center;' +
            'gap:8px;padding:6px 8px;flex-wrap:wrap">' +
                '<span class="armed-emoji">&#x1F7E0;</span>' +
                '<span class="armed-pair-name" style="font-weight:700">' + pair + '</span>' +
                '<span style="color:#f59e0b;font-size:0.72rem;font-weight:700;padding:2px 6px;' +
                'border:1px solid #f59e0b55;border-radius:3px">DISARMED</span>' +
                '<span style="color:' + dirColour + ';font-size:0.72rem;font-weight:600">' + dir + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.7rem">Snap: ' + (rec.snapshotScore || '--') + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.65rem">' + (rec.snapshotPlaybook || '').replace(/_/g,' ') + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.63rem;margin-left:auto">Expires ' + countdown + '</span>' +
            '</div>' +
            '</div>'
        );
    }


    // Auto-restore: if a pair was dismissed but a newer ARMED has since arrived, clear the dismiss
    function reconcileDismissed(armedPairs) {
        var changed = false;
        armedPairs.forEach(function(p) {
            var rec = _dismissedPairs[p.pair];
            if (rec && p.armedAt) {
                // v1.5.1: Only auto-restore if the pair has a stable armedAt field (set by
                // server v2.10.1+). Without armedAt, timestamp updates every candle close
                // and would defeat the dismiss immediately. Pairs lacking armedAt stay
                // dismissed until naturally BLOCKED and re-armed with the new server.
                var armedAt     = new Date(p.armedAt).getTime();
                var dismissedAt = new Date(rec.dismissedAt).getTime();
                if (armedAt > dismissedAt) {
                    delete _dismissedPairs[p.pair];
                    changed = true;
                    console.log('[ArmedPanel] Auto-restored ' + p.pair + ' — new ARMED since dismiss');
                }
            }
            // No armedAt = pre-v2.10.1 pair; keep dismissed, do not auto-restore
        });
        if (changed) saveDismissed();
    }

    // Armed panel instrument filter
    function getExcludedPairs() {
        try {
            var stored = localStorage.getItem('fcc_armed_exclude');
            if (stored !== null) return JSON.parse(stored);
        } catch(e) {}
        return getDefaultExclusions();
    }

    function getDefaultExclusions() {
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
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
    }

    const countEl   = document.getElementById('armed-count');
    const listEl    = document.getElementById('armed-list');
    const refreshEl = document.getElementById('armed-refresh');
    
    if (!countEl || !listEl || !refreshEl) {
        console.warn('Armed Panel: Elements not found');
        return;
    }

    // Quality Tier - returns 'PRIME' | 'STANDARD' | 'DEGRADED'
    // v1.6.0: uses locGrade from FCC-SRL enrichment (server-side).
    // OPPOSED/FALSE_BREAK -> DEGRADED (hard veto, score irrelevant).
    // PRIME/AT_ZONE/BREAKOUT_RETEST -> eligible for PRIME tier.
    // Falls back to structExt when locGrade not yet available.
    function qualityTier(p) {
        var atrPct = p.volLevel ? Math.round(Number(p.volLevel)) : null;
        var atrLabel = null;
        if (atrPct !== null) {
            if (atrPct >= 80)      atrLabel = 'EXHAUSTED';
            else if (atrPct >= 60) atrLabel = 'ELEVATED';
            else if (atrPct >= 30) atrLabel = 'NORMAL';
            else                   atrLabel = 'IDEAL';
        }

        // v1.6.0: location grade from server-side enrichment (FCC-SRL)
        var locGrade = (p.locGrade || '').toUpperCase();

        // Hard veto: at wrong-side S/R - price is at the wrong location.
        // A score of 92 at resistance is still a bad trade. No override.
        if (locGrade === 'OPPOSED' || locGrade === 'FALSE_BREAK') {
            return 'DEGRADED';
        }

        // Derive structRaw from locGrade when available; fall back to legacy field
        var locFresh = locGrade === 'PRIME' || locGrade === 'AT_ZONE' || locGrade === 'BREAKOUT_RETEST';
        var structRaw = locGrade
            ? (locFresh ? 'FRESH' : 'EXTENDED')
            : (p.structExt || '').toUpperCase();

        var biasConf = null;
        if (window.NewsBiasEngine && window.NewsBiasEngine.hasData()) {
            var verdict = window.NewsBiasEngine.getVerdict(
                (p.pair || '').toUpperCase().replace('/', ''),
                (p.direction || '').toLowerCase()
            );
            if (verdict) biasConf = verdict.confluence;
        }

        var crowdAligned = false;
        if (_sentimentData) {
            var sym = (p.pair || '').toUpperCase().replace('/', '');
            var s   = _sentimentData[sym];
            if (s && (s.strength || 'NEUTRAL') !== 'NEUTRAL') {
                var dir = (p.direction || '').toUpperCase();
                var cd  = (s.crowd_direction || '').toUpperCase();
                crowdAligned = (dir === 'LONG' && cd === 'LONG') ||
                               (dir === 'SHORT' && cd === 'SHORT');
            }
        }

        if (structRaw === 'EXTENDED' || atrLabel === 'EXHAUSTED' ||
            biasConf === 'CONFLICTING' || crowdAligned) {
            return 'DEGRADED';
        }

        if (structRaw === 'FRESH' &&
            (atrLabel === 'IDEAL' || atrLabel === 'NORMAL') &&
            biasConf !== 'CONFLICTING' && !crowdAligned) {
            return 'PRIME';
        }

        return 'STANDARD';
    }

    // ====================================================================
    // v1.15.0 -- FCC-SRL v2.0.0 helpers (quality tag, sweep, magnets, session/ADX)
    // ====================================================================

    // Sort order for quality tag (lower = higher priority)
    function qualityTagOrder(tag) {
        var map = { 'PRIORITY': 0, 'STANDARD+': 1, 'STANDARD': 2, 'CAUTION': 3, 'CONTESTED': 4 };
        return (tag && map[tag] !== undefined) ? map[tag] : 2; // null/unknown -> STANDARD slot
    }

    // Renders the quality tag badge. Returns '' when tag is null/missing (graceful fallback).
    function buildQualityBadge(p) {
        var tag = p && p.qualityTag;
        if (!tag) return '';
        var cls;
        if      (tag === 'PRIORITY')  cls = 'quality-badge-priority';
        else if (tag === 'STANDARD+') cls = 'quality-badge-standard-plus';
        else if (tag === 'STANDARD')  cls = 'quality-badge-standard';
        else if (tag === 'CAUTION')   cls = 'quality-badge-caution';
        else if (tag === 'CONTESTED') cls = 'quality-badge-contested';
        else return '';
        var icon  = (tag === 'CAUTION' || tag === 'CONTESTED') ? '&#x26A0; ' : '';
        var label = (tag === 'STANDARD+') ? 'STD+' : tag;
        var reason = (p.qualityReason || '').replace(/"/g, '&quot;');
        var title  = tag + (reason ? ' \u2014 ' + reason : '');
        return '<span class="quality-badge ' + cls + '" title="' + title + '">' + icon + label + '</span>';
    }

    // Renders the sweep risk badge. LOW=tiny green dot, MED=amber pill, HIGH=red pill with warn icon.
    // Returns '' when sweepRisk is null/missing.
    function buildSweepBadge(p) {
        var s = p && p.sweepRisk;
        if (!s) return '';
        var dirCount = (typeof p.magnetsDirectional === 'number') ? p.magnetsDirectional : 0;
        var totCount = (typeof p.magnetsTotal       === 'number') ? p.magnetsTotal       : 0;
        var behind   = Math.max(0, totCount - dirCount);
        var tip      = dirCount + ' magnets ahead, ' + behind + ' behind';
        if (s === 'LOW') {
            return '<span class="sweep-badge sweep-badge-low" title="Sweep risk LOW \u2014 ' + tip + '"></span>';
        }
        if (s === 'MEDIUM') {
            return '<span class="sweep-badge sweep-badge-medium" title="Sweep risk MEDIUM \u2014 ' + tip + '">SWEEP: MED</span>';
        }
        if (s === 'HIGH') {
            return '<span class="sweep-badge sweep-badge-high" title="Sweep risk HIGH \u2014 ' + tip + '">&#x26A0; SWEEP: HIGH</span>';
        }
        return '';
    }

    // Renders the magnet list toggle button + collapsed list. Returns '' when no magnets.
    // List is sorted by distance ASC (Pine pre-sorts; we preserve order).
    function buildMagnetList(p, listId) {
        var arr = Array.isArray(p && p.magnets) ? p.magnets : [];
        if (arr.length === 0) return '';
        var rows  = '';
        var shown = Math.min(arr.length, 6); // Pine cap matches magnetMaxShown
        for (var i = 0; i < shown; i++) {
            var m       = arr[i] || {};
            var type    = (m.type || m.name || 'LVL').toString();
            var price   = (m.price !== undefined && m.price !== null) ? Number(m.price).toFixed(5).replace(/0+$/, '').replace(/\.$/, '') : '\u2014';
            var distRaw = (m.dist_atr !== undefined && m.dist_atr !== null) ? m.dist_atr : (m.distAtr !== undefined ? m.distAtr : null);
            var dist    = (distRaw !== null) ? Number(distRaw).toFixed(1) + ' ATR' : '?';
            var dirRaw  = (m.dir || m.direction || '').toString().toUpperCase();
            var dirCls  = (dirRaw === 'AHEAD') ? 'magnet-row-ahead' : 'magnet-row-behind';
            var dirLbl  = (dirRaw === 'AHEAD') ? 'AHEAD' : 'BEHIND';
            rows +=
                '<div class="magnet-row ' + dirCls + '">' +
                    '<span class="magnet-row-type">' + type + '</span>' +
                    '<span class="magnet-row-price">@ ' + price + '</span>' +
                    '<span class="magnet-row-dist">' + dist + ' ' + dirLbl + '</span>' +
                '</div>';
        }
        var moreNote = (arr.length > shown)
            ? '<div class="magnet-list-empty">+' + (arr.length - shown) + ' more not shown</div>'
            : '';
        var label = arr.length + ' liquidity magnet' + (arr.length === 1 ? '' : 's');
        return (
            '<button type="button" class="magnet-toggle" onclick="toggleMagnetList(\'' + listId + '\', this);return false;" title="Show liquidity magnets within FCC-SRL threshold">' +
                '<span class="chev">\u25b6</span> ' + label +
            '</button>' +
            '<div id="' + listId + '" class="magnet-list" style="display:none">' +
                '<div class="magnet-list-header">Magnets (sorted by distance)</div>' +
                rows +
                moreNote +
            '</div>'
        );
    }

    // Renders the session/ADX bias footer line. Returns '' when both fields missing/NONE.
    function buildSessionAdxLine(p) {
        var sess  = (p && p.activeSession && p.activeSession !== 'NONE') ? p.activeSession : null;
        var bias  = (p && p.adxBias       && p.adxBias       !== 'NONE') ? p.adxBias       : null;
        var adxV  = (p && typeof p.adxValue === 'number') ? p.adxValue.toFixed(1) : null;
        if (!sess && !bias) return '';
        var parts = [];
        if (sess) parts.push('Active: <strong>' + sess + '</strong>');
        if (bias) {
            var biasCls = bias === 'LONG' ? 'adx-long' : (bias === 'SHORT' ? 'adx-short' : '');
            parts.push('ADX bias: <strong class="' + biasCls + '">' + bias + '</strong>' + (adxV ? ' (' + adxV + ')' : ''));
        }
        return '<div class="session-adx-line">' + parts.join(' \u2502 ') + '</div>';
    }

    function scoreColour(score) {
        if (score >= 85) return 'var(--color-pass)';
        if (score >= 75) return 'var(--color-info)';
        if (score >= 65) return 'var(--color-warning)';
        return 'var(--text-muted)';
    }

    function biasColour(confluence) {
        if (!confluence || confluence === 'NEUTRAL') return 'var(--text-muted)';
        if (confluence === 'ALIGNED')     return 'var(--color-pass)';
        if (confluence === 'CONFLICTING') return 'var(--color-fail)';
        return 'var(--text-muted)';
    }

    function alertTypeBadge(p) {
        var t = (p.alertType || 'TF_ARMED').toUpperCase();
        if (t === 'TR_ARMED') {
            return '<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#7c2d12;color:#fb923c;font-size:0.6rem;font-weight:800;letter-spacing:0.05em;vertical-align:middle">TR</span>';
        }
        return '<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#1e3a5f;color:#60a5fa;font-size:0.6rem;font-weight:800;letter-spacing:0.05em;vertical-align:middle">TF</span>';
    }

    function alertTypeAccent(p) {
        var t = (p.alertType || 'TF_ARMED').toUpperCase();
        return t === 'TR_ARMED' ? '#f97316' : '#3b82f6';
    }

    function positionSizeLabel(p) {
        if (p.positionSize) return p.positionSize;
        var t = (p.alertType || 'TF_ARMED').toUpperCase();
        return t === 'TR_ARMED' ? '0.75R' : '1.5R';
    }

    function tvWebUrl(pair) {
        var sym = (pair || '').replace('/', '').toUpperCase();
        return 'https://www.tradingview.com/chart/?symbol=OANDA:' + sym + '&interval=240';
    }
    function tvNativeUrl(pair) {
        var sym = (pair || '').replace('/', '').toUpperCase();
        return 'tradingview://chart?symbol=OANDA:' + sym + '&interval=240';
    }
    function openTV(pair) {
        var native = tvNativeUrl(pair);
        var web    = tvWebUrl(pair);
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.src = native;
        setTimeout(function() { document.body.removeChild(iframe); }, 500);
        setTimeout(function() { window.open(web, '_blank'); }, 600);
    }

    function permClass(perm) {
        if (!perm) return 'permission-legacy';
        var p = perm.toUpperCase();
        if (p === 'FULL') return 'permission-full';
        if (p === 'CONDITIONAL') return 'permission-conditional';
        return 'permission-legacy';
    }

    function permDisplayClass(perm) {
        if (!perm) return '';
        var p = perm.toUpperCase();
        if (p === 'FULL') return 'full';
        if (p === 'CONDITIONAL') return 'conditional';
        if (p === 'STAND_DOWN') return 'stand-down';
        return '';
    }

    function calculateTTLState(p) {
        var now       = new Date();
        var timestamp = p.timestamp ? new Date(p.timestamp) : now;
        var ageMs     = now - timestamp;
        var ageHours  = ageMs / (1000 * 60 * 60);
        
        var ttlState      = 'watching';
        var fomoBlocked   = false;
        var fomoCountdown = '';
        
        if (ageHours > 48)     ttlState = 'stale';
        else if (ageHours > 24) ttlState = 'extended';
        
        if (ageHours < 1) {
            fomoBlocked = true;
            var remainingMins = Math.ceil((1 - ageHours) * 60);
            var rH = Math.floor(remainingMins / 60);
            var rM = remainingMins % 60;
            fomoCountdown = rH > 0 ? '~' + rH + 'h ' + rM + 'm' : '~' + rM + 'm';
        }
        
        return { ttlState: ttlState, fomoBlocked: fomoBlocked,
                 fomoCountdown: fomoCountdown, ageHours: ageHours };
    }

    function computeVerdictScore(p) {
        var dir = (p.direction || '').toUpperCase();
        if (!dir || (dir !== 'LONG' && dir !== 'SHORT')) {
            return { dir: '', arrow: '', dirColour: 'var(--text-muted)', score: -99, confLabel: 'NO DIR', confColour: 'var(--text-muted)' };
        }
        var score = 0;

        // 1. News bias
        if (window.NewsBiasEngine && window.NewsBiasEngine.hasData()) {
            var bv = window.NewsBiasEngine.getVerdict(
                (p.pair || '').toUpperCase().replace('/', ''),
                dir.toLowerCase()
            );
            if (bv) {
                if (bv.confluence === 'ALIGNED')     score += 1;
                if (bv.confluence === 'CONFLICTING') score -= 1;
            }
        }

        // 2. IG Sentiment (contrarian)
        if (_sentimentData) {
            var sym = (p.pair || '').toUpperCase().replace('/', '');
            var s   = _sentimentData[sym];
            if (s && (s.strength || 'NEUTRAL') !== 'NEUTRAL') {
                var cd      = (s.crowd_direction || '').toUpperCase();
                var contra  = (dir === 'LONG'  && cd === 'SHORT') || (dir === 'SHORT' && cd === 'LONG');
                var aligned = (dir === 'LONG'  && cd === 'LONG')  || (dir === 'SHORT' && cd === 'SHORT');
                if (contra)  score += 1;
                if (aligned) score -= 1;
            }
        }

        // 3. Structure
        var st = (p.structExt || '').toUpperCase();
        if (st === 'FRESH')    score += 1;
        if (st === 'EXTENDED') score -= 1;

        // 4. Oanda Order Book (4th satellite — contrarian_signal = expected price direction)
        if (_orderBookData) {
            var obSym = (p.pair || '').toUpperCase().replace('/', '');
            var ob    = _orderBookData[obSym];
            if (ob && ob.contrarian_signal && (ob.strength || 'NEUTRAL') !== 'NEUTRAL') {
                var obSig  = ob.contrarian_signal;
                var obConf = (dir === 'LONG'  && obSig === 'BULLISH') || (dir === 'SHORT' && obSig === 'BEARISH');
                var obOppo = (dir === 'LONG'  && obSig === 'BEARISH') || (dir === 'SHORT' && obSig === 'BULLISH');
                if (obConf) score += 1;
                if (obOppo) score -= 1;
            }
        }

        // 4 inputs max. HIGH>=3, MED>=1, LOW<=0
        var confLabel, confColour;
        if (score >= 3)      { confLabel = 'HIGH CONF'; confColour = '#15803d'; }
        else if (score >= 1) { confLabel = 'MED CONF';  confColour = '#92400e'; }
        else                 { confLabel = 'LOW CONF';  confColour = '#b91c1c'; }

        var arrow     = dir === 'LONG' ? '\u25b2' : '\u25bc';
        var dirColour = dir === 'LONG' ? '#16a34a' : '#b91c1c';
        return { dir: dir, arrow: arrow, dirColour: dirColour, score: score, confLabel: confLabel, confColour: confColour };
    }

    function buildIntelligenceStrip(p) {
        var dir   = (p.direction || '').toUpperCase();
        var pair  = (p.pair || '').toUpperCase().replace('/', '');
        var parts = [];

        // 0. Entry Zone badge (server-side Entry Monitor)
        if (p.entryZoneActive) {
            var zg  = (p.entryZoneGrade || 'ZONE').toUpperCase();
            var zc  = zg === 'HOT' ? '#4ade80' : zg === 'OPTIMAL' ? '#86efac' : '#fbbf24';
            var zdStr = p.entryZoneDist ? ' ' + p.entryZoneDist + 'R' : '';
            parts.push('<span class="intel-item" style="background:rgba(74,222,128,0.07);border:1px solid ' + zc + '44;border-radius:3px;padding:1px 6px" title="Price in ' + zg + ' entry zone">'
                + '<span class="intel-label" style="color:' + zc + '">ZONE</span>'
                + '<span style="color:' + zc + ';font-weight:700">' + zg + zdStr + '</span></span>');
        }

        // 1. News bias
        if (window.NewsBiasEngine && window.NewsBiasEngine.hasData()) {
            var bv = window.NewsBiasEngine.getVerdict(pair, dir.toLowerCase());
            if (bv) {
                var netStr = (bv.net_score >= 0 ? '+' : '') + (bv.net_score || 0).toFixed(1);
                var conf   = bv.confluence || 'NEUTRAL';
                var colour = biasColour(conf);
                parts.push('<span class="intel-item"><span class="intel-label">News</span><span style="color:' + colour + ';font-weight:700">' + netStr + ' ' + conf + '</span></span>');
            } else {
                parts.push('<span class="intel-item intel-muted"><span class="intel-label">News</span>\u2014</span>');
            }
        } else {
            parts.push('<span class="intel-item intel-muted"><span class="intel-label">News</span>awaiting</span>');
        }

        // 2. IG Sentiment
        if (_sentimentData && _sentimentData[pair]) {
            var s        = _sentimentData[pair];
            var signal   = s.contrarian_signal || 'NEUTRAL';
            var strength = s.strength || 'NEUTRAL';
            var longPct  = s.long_pct  || 0;
            var shortPct = s.short_pct || 0;
            var cd       = (s.crowd_direction || '').toUpperCase();
            var contra   = (dir === 'LONG' && cd === 'SHORT') || (dir === 'SHORT' && cd === 'LONG');
            var aligned  = (dir === 'LONG' && cd === 'LONG')  || (dir === 'SHORT' && cd === 'SHORT');
            var igColour;
            if (strength === 'NEUTRAL')  igColour = 'var(--text-muted)';
            else if (contra)             igColour = 'var(--color-pass)';
            else if (aligned)            igColour = 'var(--color-fail)';
            else                         igColour = 'var(--text-secondary)';
            var igLabel   = strength === 'NEUTRAL' ? 'NEUTRAL' : strength + ' ' + signal;
            var crowdWarn = (aligned && strength !== 'NEUTRAL') ? ' <span style="color:var(--color-warning)">&#x26A0;</span>' : '';
            var staleTag  = _sentimentStale ? '<span style="color:var(--text-muted);font-size:0.6rem"> (stale)</span>' : '';
            parts.push('<span class="intel-item"><span class="intel-label">IG</span><span style="color:var(--text-muted);font-size:0.62rem">' + Math.round(longPct) + 'L/' + Math.round(shortPct) + 'S</span> <span style="color:' + igColour + ';font-weight:700">' + igLabel + '</span>' + crowdWarn + staleTag + '</span>');
        } else {
            parts.push('<span class="intel-item intel-muted"><span class="intel-label">IG</span>' + (_sentimentData ? '\u2014' : 'loading') + '</span>');
        }

        // 3. Oanda Order Book
        if (_orderBookData) {
            var ob = _orderBookData[pair];
            if (ob && (ob.strength || 'NEUTRAL') !== 'NEUTRAL') {
                var obSig    = ob.contrarian_signal;
                var obStr    = ob.strength;
                var obConf   = (dir === 'LONG' && obSig === 'BULLISH') || (dir === 'SHORT' && obSig === 'BEARISH');
                var obOppo   = (dir === 'LONG' && obSig === 'BEARISH') || (dir === 'SHORT' && obSig === 'BULLISH');
                var obColour = obConf ? 'var(--color-pass)' : obOppo ? 'var(--color-fail)' : 'var(--text-secondary)';
                var obLabel  = obStr + ' ' + obSig;
                var obPcts   = (ob.long_pct != null && ob.short_pct != null)
                    ? '<span style="color:var(--text-muted);font-size:0.62rem">' + Math.round(ob.long_pct) + 'L/' + Math.round(ob.short_pct) + 'S</span> '
                    : '';
                var obStale  = _orderBookStale ? '<span style="color:var(--text-muted);font-size:0.6rem"> (stale)</span>' : '';
                parts.push('<span class="intel-item"><span class="intel-label">OB</span>' + obPcts + '<span style="color:' + obColour + ';font-weight:700">' + obLabel + '</span>' + obStale + '</span>');
            } else if (ob) {
                parts.push('<span class="intel-item intel-muted"><span class="intel-label">OB</span>NEUTRAL</span>');
            } else {
                parts.push('<span class="intel-item intel-muted"><span class="intel-label">OB</span>\u2014</span>');
            }
        } else {
            parts.push('<span class="intel-item intel-muted"><span class="intel-label">OB</span>loading</span>');
        }

        // 3.5 MDI (Macro Dominance Index) - SOFT satellite, display only.
        // Does NOT affect pair score or any gate. Shows which macro leg is
        // dominant and whether news on the weaker leg is likely to cause
        // only a brief reaction before the trend resumes.
        if (_macroData && _macroData.pairs) {
            var mdi = _macroData.pairs[pair];
            if (mdi) {
                var threshold = mdi.threshold || 'BALANCED';
                var gap       = mdi.gap != null ? Math.round(mdi.gap) : 0;
                var staleTag  = _macroStale ? '<span class="intel-mdi-stale"> (stale)</span>' : '';
                var tipText;
                var mdiClass;
                var mdiText;

                if (threshold === 'DOMINANT') {
                    // e.g. "JPY-weakness dominant" -> "JPY-weak dom"
                    var verdictShort = (mdi.verdict || '').replace('weakness', 'weak').replace('strength', 'strong').replace(' dominant', ' dom');
                    mdiClass = 'intel-mdi-dominant';
                    mdiText  = verdictShort + ' (g' + gap + ')';
                    tipText  = 'MDI: ' + (mdi.verdict || '') + '. Gap ' + gap + '. Brief reaction, trend likely resumes on news. SOFT satellite - display only, no gate authority.';
                } else if (threshold === 'LEANING') {
                    var verdictLean = (mdi.verdict || '').replace(' dominant', '').replace('leaning ', '');
                    mdiClass = 'intel-mdi-leaning';
                    mdiText  = 'lean ' + verdictLean + ' (g' + gap + ')';
                    tipText  = 'MDI: ' + (mdi.verdict || '') + '. Gap ' + gap + '. Partial lean, news impact partially muted. SOFT satellite - display only.';
                } else {
                    mdiClass = 'intel-mdi-balanced';
                    mdiText  = 'balanced (g' + gap + ')';
                    tipText  = 'MDI: balanced - both legs equally weighted. Gap ' + gap + '. News will have full impact. SOFT satellite - display only.';
                }

                parts.push('<span class="intel-item" title="' + tipText + '"><span class="intel-label">MDI</span><span class="' + mdiClass + '">' + mdiText + '</span>' + staleTag + '</span>');
            }
            // Missing data for this pair -> row hidden (fail-closed, no silent defaults)
        } else if (_macroData === null) {
            parts.push('<span class="intel-item intel-muted"><span class="intel-label">MDI</span>loading</span>');
        }
        // If _macroData is set but has no pairs, also hidden (fail-closed)

        // 4. ATR
        var atrPct = p.volLevel ? Math.round(Number(p.volLevel)) : null;
        if (atrPct !== null) {
            var atrLbl, atrC;
            if (atrPct >= 80)      { atrLbl = 'EXHAUSTED'; atrC = 'var(--color-fail)'; }
            else if (atrPct >= 60) { atrLbl = 'ELEVATED';  atrC = '#eab308'; }
            else if (atrPct >= 30) { atrLbl = 'NORMAL';    atrC = 'var(--color-pass)'; }
            else                   { atrLbl = 'IDEAL';     atrC = '#86efac'; }
            parts.push('<span class="intel-item"><span class="intel-label">ATR</span><span style="color:' + atrC + ';font-weight:700">' + atrLbl + '</span><span style="color:var(--text-muted);font-size:0.62rem"> ' + atrPct + '%ile</span></span>');
        }

        // 5. Structure
        var structRaw = (p.structExt || '').toUpperCase();
        var stC, stL;
        if      (structRaw === 'FRESH')      { stC = '#4ade80';              stL = 'FRESH'; }
        else if (structRaw === 'DEVELOPING') { stC = '#eab308';              stL = 'DEV'; }
        else if (structRaw === 'EXTENDED')   { stC = 'var(--color-fail)';    stL = 'EXT'; }
        if (stL) {
            parts.push('<span class="intel-item"><span class="intel-label">Struct</span><span style="color:' + stC + ';font-weight:700">' + stL + '</span></span>');
        }

        // 6. LTF break confirmation (TR cards only)
        var isTR = (p.alertType || '').toUpperCase() === 'TR_ARMED';
        if (isTR) {
            var ltf = (p.ltfBreak || '').toUpperCase().replace(/_/g, ' ');
            var ltfHtml = ltf
                ? '<span style="color:#a78bfa;font-weight:700">' + ltf + '</span>'
                : '<span style="color:var(--text-muted)">LTF \u2014</span>';
            parts.push('<span class="intel-item"><span class="intel-label">1H</span>' + ltfHtml + '</span>');
        }

        // 7. Signal frequency badge (from arm-history via /state)
        var wkCount = p.weekSignalCount;
        if (wkCount !== null && wkCount !== undefined) {
            var freqLbl, freqColour;
            if (wkCount === 0 || wkCount === 1) {
                freqLbl    = '1st';
                freqColour = 'var(--text-muted)';
            } else if (wkCount <= 3) {
                freqLbl    = wkCount + '/wk';
                freqColour = '#60a5fa';
            } else if (wkCount <= 5) {
                freqLbl    = wkCount + '/wk';
                freqColour = '#f59e0b';
            } else {
                freqLbl    = wkCount + '/wk';
                freqColour = '#fbbf24';
            }
            var freqTitle = (p.twoWeekSignalCount || 0) + ' signals in past 14 days';
            parts.push('<span class="intel-item" title="' + freqTitle + '"><span style="color:' + freqColour + ';font-weight:600;font-size:0.7rem">freq per wk = ' + (wkCount === 0 ? '0' : wkCount === 1 ? '1 (1st)' : String(wkCount)) + '</span></span>');
        }

        // Playbook label (right-aligned)
        var playbookLabel = (p.playbook || '').toUpperCase().replace(/_/g, ' ');
        var playbookHtml  = playbookLabel ? '<span class="intel-playbook">' + playbookLabel + '</span>' : '';

        return '<div class="armed-intelligence-strip">' +
            parts.join('<span class="intel-sep">|</span>') +
            playbookHtml +
        '</div>';
    }

    /**
     * Build institutional satellite grid - direction-aware heatmap.
     * 8 cells: ZONE | STRUCT | MDI | OB | NEWS | IG | ATR | FREQ + playbook
     * Directional cells (NEWS, IG, OB, MDI) flip colour by trade direction.
     * Quality cells (ZONE, STRUCT, ATR, FREQ) use absolute scale.
     * Each cell: symbol (check/tilde/cross) + compact value, tooltip with full reading.
     * Returns HTML string. Rendering/responsive behaviour controlled by CSS.
     */
    function buildSatelliteGrid(p, rowId) {
        var dir  = (p.direction || '').toUpperCase();
        var pair = (p.pair || '').toUpperCase().replace('/', '');
        var cells = [];

        // Cell helper. state: 'good' | 'ok' | 'bad' | 'muted'. type: 'dir' | 'qual'.
        function cell(label, value, state, tooltip, type) {
            var symbol;
            if      (state === 'good') symbol = '\u2713';
            else if (state === 'bad')  symbol = '\u2717';
            else if (state === 'ok')   symbol = '\u223C';
            else                       symbol = '\u2014';
            var cls = 'sgrid-cell sgrid-' + type + '-' + state;
            var tip = tooltip ? ' title="' + String(tooltip).replace(/"/g, '&quot;') + '"' : '';
            return '<div class="' + cls + '"' + tip + '>' +
                '<div class="sgrid-label">' + label + '</div>' +
                '<div class="sgrid-value"><span class="sgrid-sym">' + symbol + '</span> ' + (value || '\u2014') + '</div>' +
            '</div>';
        }

        // 1. ZONE (quality)
        if (p.entryZoneActive) {
            var zg   = (p.entryZoneGrade || '').toUpperCase();
            var zStr = p.entryZoneDist ? p.entryZoneDist + 'R' : zg;
            var zState, zTip;
            if (zg === 'HOT') {
                zState = 'good';
                zTip = 'HOT zone ' + (p.entryZoneDist || '') + 'R - optimal entry, closest to edge';
            } else if (zg === 'OPTIMAL') {
                zState = 'good';
                zTip = 'OPTIMAL zone ' + (p.entryZoneDist || '') + 'R - good entry';
            } else if (zg === 'ACCEPTABLE') {
                zState = 'ok';
                zTip = 'ACCEPTABLE zone ' + (p.entryZoneDist || '') + 'R - marginal entry';
            } else if (zg === 'EXTENDED') {
                zState = 'bad';
                zTip = 'EXTENDED ' + (p.entryZoneDist || '') + 'R - price too far from edge, do not chase';
            } else {
                zState = 'muted';
                zTip = 'Zone: ' + zg;
            }
            cells.push(cell('ZONE', zg === 'EXTENDED' ? 'EXT ' + zStr : zStr, zState, zTip, 'qual'));
        } else {
            cells.push(cell('ZONE', '-', 'muted', 'No entry zone data', 'qual'));
        }

        // 2. STRUCT (quality)
        var structRaw = (p.structExt || '').toUpperCase();
        if (structRaw === 'FRESH') {
            cells.push(cell('STRUCT', 'FRESH', 'good', 'Structure fresh - recent break, clean entry window', 'qual'));
        } else if (structRaw === 'DEVELOPING') {
            cells.push(cell('STRUCT', 'DEV', 'ok', 'Structure developing - move underway but not yet extended', 'qual'));
        } else if (structRaw === 'EXTENDED') {
            cells.push(cell('STRUCT', 'EXT', 'bad', 'Structure extended - move mature, chasing risk, poor R:R', 'qual'));
        } else {
            cells.push(cell('STRUCT', '-', 'muted', 'No structure data', 'qual'));
        }

        // 3. MDI (directional - macro dominance relative to trade direction)
        // Institutional logic: MDI verdict contains base/quote leg descriptors.
        // For LONG XXXYYY: favoured if XXX-strength dominant or YYY-weakness dominant.
        // For SHORT XXXYYY: favoured if XXX-weakness or YYY-strength dominant.
        if (_macroData && _macroData.pairs && _macroData.pairs[pair]) {
            var mdi       = _macroData.pairs[pair];
            var threshold = mdi.threshold || 'BALANCED';
            var gap       = mdi.gap != null ? Math.round(mdi.gap) : 0;
            var verdict   = mdi.verdict || '';
            var mdiStale  = _macroStale ? ' (stale)' : '';
            var mdiState, mdiVal, mdiTip;

            if (threshold === 'BALANCED') {
                mdiState = 'muted';
                mdiVal   = 'BAL g' + gap;
                mdiTip   = 'MDI balanced (gap ' + gap + ') - news will have full impact. SOFT satellite.';
            } else {
                var base  = pair.substring(0, 3);
                var quote = pair.substring(3, 6);
                var favoursLong  = verdict.indexOf(base + '-strength') >= 0 || verdict.indexOf(quote + '-weakness') >= 0;
                var favoursShort = verdict.indexOf(base + '-weakness') >= 0 || verdict.indexOf(quote + '-strength') >= 0;
                var aligned      = (dir === 'LONG' && favoursLong)  || (dir === 'SHORT' && favoursShort);
                var opposed      = (dir === 'LONG' && favoursShort) || (dir === 'SHORT' && favoursLong);

                if (threshold === 'DOMINANT') {
                    if      (aligned) mdiState = 'good';
                    else if (opposed) mdiState = 'bad';
                    else              mdiState = 'ok';
                    mdiVal = 'DOM g' + gap;
                } else { // LEANING
                    if      (aligned) mdiState = 'ok';
                    else if (opposed) mdiState = 'bad';
                    else              mdiState = 'ok';
                    mdiVal = 'LEAN g' + gap;
                }
                mdiTip = 'MDI: ' + verdict + ' (gap ' + gap + '). ' +
                    (aligned ? 'Macro backdrop favours ' + dir + '.' : opposed ? 'Macro backdrop opposes ' + dir + '.' : 'Macro neutral to ' + dir + '.') +
                    ' SOFT satellite - display only.';
            }
            cells.push(cell('MDI', mdiVal + mdiStale, mdiState, mdiTip, 'dir'));
        } else {
            cells.push(cell('MDI', '-', 'muted', 'No MDI data', 'dir'));
        }

        // 4. OB (directional - Oanda order book confirmation)
        if (_orderBookData && _orderBookData[pair]) {
            var ob = _orderBookData[pair];
            if (ob.strength && ob.strength !== 'NEUTRAL') {
                var obSig  = ob.contrarian_signal;
                var obConf = (dir === 'LONG' && obSig === 'BULLISH') || (dir === 'SHORT' && obSig === 'BEARISH');
                var obOppo = (dir === 'LONG' && obSig === 'BEARISH') || (dir === 'SHORT' && obSig === 'BULLISH');
                var obState = obConf ? 'good' : obOppo ? 'bad' : 'ok';
                var obVal   = (ob.long_pct != null && ob.short_pct != null)
                    ? Math.round(ob.long_pct) + '/' + Math.round(ob.short_pct)
                    : ob.strength;
                var obStale = _orderBookStale ? ' (stale)' : '';
                var obTip   = 'OB ' + ob.strength + ' ' + obSig + ' - ' +
                    (obConf ? 'aligned with ' + dir : obOppo ? 'opposed to ' + dir : 'neutral');
                cells.push(cell('OB', obVal + obStale, obState, obTip, 'dir'));
            } else {
                cells.push(cell('OB', 'NEUTRAL', 'ok', 'Order book neutral - no directional bias', 'dir'));
            }
        } else {
            cells.push(cell('OB', '-', 'muted', 'No order book data', 'dir'));
        }

        // 5. NEWS (directional - news bias relative to trade direction)
        if (window.NewsBiasEngine && window.NewsBiasEngine.hasData()) {
            var bv = window.NewsBiasEngine.getVerdict(pair, dir.toLowerCase());
            if (bv) {
                var net    = Number(bv.net_score || 0);
                var netStr = (net >= 0 ? '+' : '') + net.toFixed(1);
                var conf   = (bv.confluence || 'NEUTRAL').toUpperCase();
                var nState;
                if      (conf.indexOf('ALIGN') >= 0)    nState = 'good';
                else if (conf.indexOf('CONFLICT') >= 0) nState = 'bad';
                else if (conf === 'NEUTRAL')            nState = 'ok';
                else                                    nState = 'ok';
                var nTip = 'News bias ' + netStr + ' ' + conf + ' for ' + dir;
                cells.push(cell('NEWS', netStr, nState, nTip, 'dir'));
            } else {
                cells.push(cell('NEWS', '-', 'muted', 'No news verdict for this pair', 'dir'));
            }
        } else {
            cells.push(cell('NEWS', '-', 'muted', 'News engine not loaded', 'dir'));
        }

        // 6. IG (directional, CONTRARIAN - crowd against trade = good signal)
        if (_sentimentData && _sentimentData[pair]) {
            var s        = _sentimentData[pair];
            var strength = s.strength || 'NEUTRAL';
            var cd       = (s.crowd_direction || '').toUpperCase();
            var contra   = (dir === 'LONG' && cd === 'SHORT') || (dir === 'SHORT' && cd === 'LONG');
            var aligned  = (dir === 'LONG' && cd === 'LONG')  || (dir === 'SHORT' && cd === 'SHORT');
            var iState;
            if      (strength === 'NEUTRAL') iState = 'ok';
            else if (contra)                 iState = 'good';
            else if (aligned)                iState = 'bad';
            else                             iState = 'ok';
            var iVal   = Math.round(s.long_pct || 0) + '/' + Math.round(s.short_pct || 0);
            var iStale = _sentimentStale ? ' (stale)' : '';
            var iTip   = 'IG ' + iVal + ' ' + strength + ' ' + (s.contrarian_signal || '') + ' - ' +
                (contra ? 'crowd fading ' + dir + ' (contrarian edge)' :
                 aligned ? 'crowd with ' + dir + ' (warning: fade risk)' :
                 'crowd neutral');
            cells.push(cell('IG', iVal + iStale, iState, iTip, 'dir'));
        } else {
            cells.push(cell('IG', '-', 'muted', 'No IG sentiment data', 'dir'));
        }

        // 7. ATR (quality - volatility percentile)
        var atrPct = p.volLevel ? Math.round(Number(p.volLevel)) : null;
        if (atrPct !== null) {
            var aState, aLabel;
            if      (atrPct >= 80) { aState = 'bad';  aLabel = 'EXHAUST'; }
            else if (atrPct >= 60) { aState = 'ok';   aLabel = 'ELEVATED'; }
            else if (atrPct >= 30) { aState = 'good'; aLabel = 'NORMAL'; }
            else                   { aState = 'good'; aLabel = 'IDEAL'; }
            cells.push(cell('ATR', atrPct + '%ile', aState, 'ATR ' + aLabel + ' - ' + atrPct + ' percentile', 'qual'));
        } else {
            cells.push(cell('ATR', '-', 'muted', 'No ATR data', 'qual'));
        }

        // 8. FREQ (quality - signal frequency, freshness hygiene)
        var wkCount = p.weekSignalCount;
        if (wkCount !== null && wkCount !== undefined) {
            var fState, fLabel;
            if      (wkCount <= 1) { fState = 'good'; fLabel = '1st'; }
            else if (wkCount <= 3) { fState = 'good'; fLabel = wkCount + '/wk'; }
            else if (wkCount <= 5) { fState = 'ok';   fLabel = wkCount + '/wk'; }
            else                   { fState = 'bad';  fLabel = wkCount + '/wk'; }
            var twoWk = p.twoWeekSignalCount || 0;
            var fTip  = fLabel + ' signals this week (' + twoWk + ' in past 14 days) - ' +
                (wkCount <= 3 ? 'fresh, uncluttered' :
                 wkCount <= 5 ? 'getting noisy, check invalidations' :
                 'over-signalled, likely chop');
            cells.push(cell('FREQ', fLabel, fState, fTip, 'qual'));
        } else {
            cells.push(cell('FREQ', '-', 'muted', 'No frequency data', 'qual'));
        }

        // Playbook label on the right
        var playbookLabel = (p.playbook || '').toUpperCase().replace(/_/g, ' ');
        var playbookHtml  = playbookLabel
            ? '<div class="sgrid-playbook" title="Playbook: ' + playbookLabel + '">' + playbookLabel + '</div>'
            : '';

        // Expand chevron (toggles the legacy intelligence strip as detail view)
        var detailId = 'sgrid-detail-' + (rowId || Math.random().toString(36).slice(2, 8));
        var chevronHtml = '<div class="sgrid-expand" onclick="event.stopPropagation();toggleSgridDetail(\'' + detailId + '\', this);return false;" title="Show/hide full-label detail">' +
            '<span class="sgrid-chevron">\u25BE</span></div>';

        return '<div class="armed-satellite-grid" data-detail-id="' + detailId + '">' +
            cells.join('') +
            playbookHtml +
            chevronHtml +
        '</div>';
    }

    // Global toggle for satellite grid detail expansion (legacy strip view).
    if (!window.toggleSgridDetail) {
        window.toggleSgridDetail = function(detailId, btnEl) {
            var el = document.getElementById(detailId);
            if (!el) return;
            var isOpen = el.style.display === 'block';
            el.style.display = isOpen ? 'none' : 'block';
            if (btnEl) {
                var chev = btnEl.querySelector('.sgrid-chevron');
                if (chev) chev.textContent = isOpen ? '\u25BE' : '\u25B4';
            }
        };
    }


    function buildLocationRow(p) {
        var loc = _locationData[p.pair || ''];

        if (!loc || loc.grade === 'NO_DATA' || loc.grade === 'STALE') {
            return '<div class="armed-location-row awaiting">&#x23F3; Location: awaiting data</div>';
        }

        var grade     = loc.grade          || 'WAIT';
        var zone      = loc.zone           || 'NONE';
        var cloudPos  = loc.cloud_pos      || 'CLEAR';
        var suppName  = loc.supp_name      || 'NONE';
        var resName   = loc.res_name       || 'NONE';
        var suppDist  = loc.supp_dist_atr  || 'na';
        var resDist   = loc.res_dist_atr   || 'na';
        var cloudDist = loc.cloud_dist_atr || 'na';

        var gradeMap = {
            'PRIME':           ['&#x2605; PRIME',         'loc-prime',    'At S/R zone + cloud edge — optimal entry'],
            'AT_ZONE':         ['AT ZONE',                'loc-at-zone',  'At S/R zone, direction correct'],
            'AT_CLOUD':        ['AT CLOUD',               'loc-at-cloud', 'At EMA cloud edge, no S/R nearby'],
            'IN_CLOUD':        ['IN CLOUD',               'loc-in-cloud', 'Inside EMA cloud — wait for edge'],
            'WAIT':            ['WAIT',                   'loc-wait',     'Mid-range — no nearby level'],
            'OPPOSED':         ['\u2716 OPPOSED',        'loc-opposed',  'At wrong-side S/R — do not enter'],
            'NO_DIRECTION':    ['NO DIR',                 'loc-wait',     'EMA stack mixed — no clear direction'],
            'BREAKOUT_RETEST': ['\u21A9 BRK RETEST',    'loc-brk-good', 'Retesting broken level from correct side'],
            'BREAKOUT_EXT':    ['\u26A0 BRK EXT',       'loc-brk-ext',  'Break confirmed — retest window expired'],
            'FALSE_BREAK':     ['\u2716 FALSE BREAK',   'loc-opposed',  'Reversed back inside zone — stand down']
        };

        var cfg      = gradeMap[grade] || ['?', 'loc-wait', grade];
        var badgeLbl = cfg[0];
        var badgeCls = cfg[1];
        var desc     = cfg[2];

        var zoneInfo = zone !== 'NONE' ? ' \u2192 ' + zone : '';

        var proxParts = [];
        if (suppName !== 'NONE' && suppDist !== 'na') proxParts.push('Supp: ' + suppName + ' ' + suppDist + 'atr');
        if (resName  !== 'NONE' && resDist  !== 'na') proxParts.push('Res: '  + resName  + ' ' + resDist  + 'atr');
        if (cloudDist !== 'na'  && cloudPos !== 'CLEAR') proxParts.push('Cloud: ' + cloudDist + 'atr');

        var proxHtml = proxParts.length > 0
            ? '<span class="loc-prox">' + proxParts.join(' \u00b7 ') + '</span>'
            : '';

        return '<div class="armed-location-row">' +
            '<span class="loc-badge ' + badgeCls + '">' + badgeLbl + '</span>' +
            '<span class="loc-desc">' + desc + zoneInfo + '</span>' +
            proxHtml +
        '</div>';
    }

    function buildTierHeader(tier, count) {
        var label, cls, icon;
        if (tier === 'PRIME') {
            label = 'PRIME SETUPS'; icon = '&#x2B50;'; cls = 'tier-prime';
        } else if (tier === 'STANDARD') {
            label = 'STANDARD'; icon = '&#x25CF;'; cls = 'tier-standard';
        } else {
            label = 'DEGRADED &#x2014; review before trading'; icon = '&#x26A0;'; cls = 'tier-degraded';
        }
        return '<div class="armed-tier-header ' + cls + '">' +
            '<span class="tier-icon">' + icon + '</span>' +
            '<span class="tier-label">' + label + '</span>' +
            '<span class="tier-count">' + count + '</span>' +
        '</div>';
    }

    // tier param: 'prime' | 'standard' | 'degraded' | '' (watchlist - no dismiss btn)
    function buildRow(p, emoji, tier) {
        var permCls   = permClass(p.permission);
        var permDisp  = permDisplayClass(p.permission);
        var permLabel = p.permission || '\u2014';
        if (permLabel === 'CONDITIONAL') permLabel = 'COND';

        var ttl      = calculateTTLState(p);
        var rowClass = 'armed-pair-row ' + permCls;
        if (ttl.fomoBlocked)           rowClass += ' fomo-blocked';
        if (ttl.ttlState === 'stale')  rowClass += ' ttl-stale';

        var statusHtml = '';
        if (ttl.fomoBlocked) {
            statusHtml = '<span class="armed-fomo-gate" title="FOMO Gate: 1-hour forced analysis pause (' + ttl.fomoCountdown + ')">' + ttl.fomoCountdown + '</span>';
        } else if (ttl.ttlState === 'watching') {
            statusHtml = '<span class="armed-ttl-status armed-ttl-fresh" title="Armed less than 24 hours ago">READY</span>';
        } else if (ttl.ttlState === 'extended') {
            statusHtml = '<span class="armed-ttl-status armed-ttl-ageing" title="Armed 24\u201348 hours \u2014 confirm still valid">EXTENDED</span>';
        } else {
            statusHtml = '<span class="armed-ttl-status armed-ttl-expired" title="Armed over 48 hours \u2014 review required">STALE</span>';
        }

        var tvOnClick = 'openTV(\'' + (p.pair || '') + '\');return false;';

        var dismissBtn = '';
        var watchBtn   = '';
        if (tier) {
            var isWatchingBtn = !!_watchedPairs[p.pair];
            var wAction = isWatchingBtn
                ? 'event.stopPropagation();unwatchArmedPair(\'' + (p.pair||'') + '\');return false;'
                : 'event.stopPropagation();watchArmedPair(\'' + (p.pair||'') + '\');return false;';
            var wIcon   = isWatchingBtn ? '&#x2605;' : '&#x2606;';
            var wTip    = isWatchingBtn ? 'Remove from watchlist' : 'Watch \u2014 pin while hunting entry';
            var wColour = isWatchingBtn ? '#fbbf24' : 'var(--text-muted)';
            watchBtn = '<button class="armed-watch-btn" onclick="' + wAction + '" title="' + wTip + '"' +
                ' style="color:' + wColour + ';background:none;border:none;cursor:pointer;font-size:1rem;padding:4px 4px">'+wIcon+'</button>';
        }
        if (tier) {
            var hasOpenTrade = (window._armedOpenTrades || {})[p.pair || ''];
            if (hasOpenTrade) {
                dismissBtn = '<button class="armed-dismiss-btn" disabled title="Cannot dismiss \u2014 open trade active" style="opacity:0.35;cursor:not-allowed">&#x2716;</button>';
            } else {
                var dOnClick = 'event.stopPropagation();dismissArmedPair(\'' + (p.pair || '') + '\');return false;';
                dismissBtn = '<button class="armed-dismiss-btn" onclick="' + dOnClick + '" title="Dismiss \u2014 restores on next ARMED alert">&#x2716;</button>';
            }
        }

        var isWatching = !!_watchedPairs[p.pair];
        var wrapperCls = 'armed-pair-wrapper' + (tier ? ' ' + tier : '');
        var wrapperStyle = isWatching ? ' style="border-left:3px solid #fbbf24"' : '';

        // Direction + confidence badge (satellite-weighted verdict)
        var verdict = computeVerdictScore(p);
        var dirBadgeHtml;
        if (verdict.dir) {
            dirBadgeHtml =
                '<span class="armed-dir-group">' +
                    '<span class="armed-dir-arrow" style="color:' + verdict.dirColour + '">' + verdict.arrow + ' ' + verdict.dir + '</span>' +
                    '<span class="armed-conf-pill" style="background:' + verdict.confColour + '22;color:' + verdict.confColour + ';border:1px solid ' + verdict.confColour + '55">' + verdict.confLabel + '</span>' +
                '</span>';
        } else {
            dirBadgeHtml = '<span class="armed-dir-group"><span class="armed-dir-nodir">\u21c4 NO DIR</span></span>';
        }

        var locationRowHtml  = buildLocationRow(p);
        var rowDetailId      = 'sgrid-' + (p.pair || 'x') + '-' + Math.random().toString(36).slice(2, 8);
        var satelliteGridHtml = buildSatelliteGrid(p, rowDetailId);
        var intelligenceHtml = buildIntelligenceStrip(p);
        var detailWrappedHtml = '<div id="' + rowDetailId + '" class="armed-satellite-detail" style="display:none">' + intelligenceHtml + '</div>';

        // v1.15.0 -- FCC-SRL v2.0.0 visual elements
        var qualityBadgeHtml  = buildQualityBadge(p);
        var sweepBadgeHtml    = buildSweepBadge(p);
        var magnetListId      = 'magnets-' + (p.pair || 'x') + '-' + Math.random().toString(36).slice(2, 8);
        var magnetListHtml    = buildMagnetList(p, magnetListId);
        var sessionAdxHtml    = buildSessionAdxLine(p);
        var srlFooterHtml     = (magnetListHtml || sessionAdxHtml)
            ? '<div class="armed-srl-footer" style="padding:4px 10px 6px 10px">' + magnetListHtml + sessionAdxHtml + '</div>'
            : '';

        return '<div class="' + wrapperCls + '"' + wrapperStyle + '>' +
            dismissBtn +
            watchBtn +
            '<a href="#" class="' + rowClass + ' armed-row-link" data-pair="' + (p.pair || '') + '" onclick="' + tvOnClick + '" title="Open ' + (p.pair || '') + ' on TradingView 4H">' +
                '<span class="armed-emoji">' + emoji + '</span>' +
                '<span class="armed-pair-name">' + alertTypeBadge(p) + ' ' + (p.pair || '') + ' ' + qualityBadgeHtml + ' ' + sweepBadgeHtml + '</span>' +
                dirBadgeHtml +
                '<span class="armed-primary">' + (p.primary || '\u2014') + '</span>' +
                '<span class="armed-permission ' + permDisp + '">' + permLabel + '</span>' +
                '<span class="armed-maxrisk">' + positionSizeLabel(p) + '</span>' +
                (function() {
                    var baseS   = p.score || 0;
                    var enrichS = (p.enrichedScore !== null && p.enrichedScore !== undefined) ? p.enrichedScore : baseS;
                    var locPts  = (p.locScore !== null && p.locScore !== undefined) ? p.locScore : null;
                    var tip     = locPts !== null ? baseS + ' + ' + locPts + ' (loc) = ' + enrichS : String(enrichS);
                    return '<span class="armed-score" style="color:' + scoreColour(enrichS) + '" title="' + tip + '">' + enrichS + '</span>';
                })() +
                '<span class="armed-age">' + statusHtml + '</span>' +
            '</a>' +
            locationRowHtml +
            satelliteGridHtml +
            detailWrappedHtml +
            srlFooterHtml +
        '</div>';
    }

        function buildDismissedSection(dismissedItems) {
        var count     = dismissedItems.length;
        var display   = _dismissedExpanded ? 'block' : 'none';
        var arrow     = _dismissedExpanded ? '\u25b2' : '\u25bc';
        var toggleTxt = arrow + ' ' + count + ' dismissed \u2014 ' + (_dismissedExpanded ? 'hide' : 'show');

        var html = '<div class="armed-dismissed-toggle" onclick="toggleArmedDismissed()">' +
            '<span id="armed-dismissed-label">' + toggleTxt + '</span>' +
        '</div>';

        html += '<div id="armed-dismissed-body" class="armed-dismissed-body" style="display:' + display + '">';
        for (var i = 0; i < dismissedItems.length; i++) {
            var p = dismissedItems[i];
            var rOnClick = 'event.stopPropagation();restoreArmedPair(\'' + (p.pair || '') + '\');return false;';
            html += '<div class="armed-pair-wrapper dismissed">' +
                '<div class="armed-dismissed-row">' +
                    '<span class="armed-pair-name">' + (p.pair || '') + '</span>' +
                    '<span style="color:var(--text-muted);font-size:0.75rem">' + (p.primary || '') + '</span>' +
                    '<span style="color:var(--text-muted);font-size:0.7rem">Dismissed ' + ((_dismissedPairs[p.pair] && _dismissedPairs[p.pair].dismissedAt) ? new Date(_dismissedPairs[p.pair].dismissedAt).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'}) : '') + '</span>' +
                    '<button class="armed-restore-btn" onclick="' + rOnClick + '">Restore</button>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    function buildColHeaders() {
        return '<div class="armed-col-headers">' +
            '<span></span>' +
            '<span>Pair</span>' +
            '<span>Regime</span>' +
            '<span>Perm</span>' +
            '<span>Size</span>' +
            '<span>Sc</span>' +
            '<span>ATR</span>' +
            '<span>Struct</span>' +
            '<span style="text-align:right">Age</span>' +
            '<span></span>' +
        '</div>';
    }
    
    async function fetchArmedState() {
        try {
            const response = await fetch(STATE_URL, { method: 'GET', cache: 'no-cache' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            // Fetch open Oanda trades to protect dismiss button
            try {
                var openTrades = await window.BrokerManager.getOpenTrades();
                window._armedOpenTrades = {};
                (openTrades || []).forEach(function(t) {
                    var inst = (t.instrument || '').replace('_', '');
                    window._armedOpenTrades[inst] = true;
                });
            } catch(e) {
                window._armedOpenTrades = window._armedOpenTrades || {};
            }
            renderArmedState(data);
        } catch (e) {
            renderArmedError(e.message);
        }
    }
    
    function renderArmedState(data) {
        window._lastArmedData = data;

        var rawPairs = (data.pairs || []).filter(function(p) { return !isExcluded(p.pair); });

        var allActivePairs  = rawPairs.filter(function(p) { return p.primary !== 'R-OFFSESSION'; });
        var offSessionPairs = rawPairs.filter(function(p) { return p.primary === 'R-OFFSESSION'; });

        // Reconcile dismissed: auto-restore if new ARMED arrived since dismiss
        reconcileDismissed(allActivePairs);

        // Prune expired watches (only after loadWatchlist has completed)
        if (_watchlistLoaded) {
            var watchChanged = false;
            Object.keys(_watchedPairs).forEach(function(pair) {
                if (isWatchExpired(_watchedPairs[pair])) {
                    delete _watchedPairs[pair];
                    watchChanged = true;
                    console.log('[ArmedPanel] Watch expired and removed: ' + pair);
                }
            });
            if (watchChanged) saveWatchlist();
        }

        // Ghost pairs: in _watchedPairs but no longer in the armed state (BLOCKED)
        var armedPairNames = allActivePairs.map(function(p) { return p.pair; });
        var ghostWatches   = Object.keys(_watchedPairs).filter(function(pair) {
            return armedPairNames.indexOf(pair) === -1;
        });

        // Separate dismissed from active
        var dismissedItems = allActivePairs.filter(function(p) { return !!_dismissedPairs[p.pair]; });
        var activePairs    = allActivePairs.filter(function(p) { return !_dismissedPairs[p.pair]; });

        var activeArmedCount = allActivePairs.length;
        countEl.textContent  = activeArmedCount;
        countEl.className    = 'armed-panel-count' + (activeArmedCount === 0 ? ' zero' : '');

        if ('setAppBadge' in navigator) {
            if (activeArmedCount > 0) navigator.setAppBadge(activeArmedCount).catch(function() {});
            else                      navigator.clearAppBadge().catch(function() {});
        }
        
        refreshEl.textContent = formatTime(new Date());
        
        var html = '';

        // Armed Instruments header
        // Compute directional summary for fleet view
        var longCount  = activePairs.filter(function(p) { return (p.direction || '').toUpperCase() === 'LONG';  }).length;
        var shortCount = activePairs.filter(function(p) { return (p.direction || '').toUpperCase() === 'SHORT'; }).length;
        var summaryHtml = '';
        if (activePairs.length > 0) {
            summaryHtml = '<span style="font-size:0.65rem;font-weight:600;margin-left:8px;color:var(--text-muted)">' +
                (longCount  > 0 ? '<span style="color:#4ade80">\u25b2' + longCount  + ' L</span> ' : '') +
                (shortCount > 0 ? '<span style="color:#f87171">\u25bc' + shortCount + ' S</span>'  : '') +
                '</span>';
        }

        html += '<div class="armed-section-header">' +
            'Armed Instruments ' +
            '<span class="armed-section-count' + (activeArmedCount > 0 ? ' armed' : '') + '">' + activeArmedCount + '</span>' +
            summaryHtml +
        '</div>';

        // Watched pairs section (ghost cards for BLOCKED pairs still within 8h watch)
        if (ghostWatches.length > 0) {
            html += '<div class="armed-section-header" style="color:#fbbf24;border-bottom:1px solid #fbbf2433">' +
                '&#x2605; Watching ' +
                '<span class="armed-section-count" style="background:#fbbf2422;color:#fbbf24">' + ghostWatches.length + '</span>' +
                '<span style="font-size:0.65rem;color:var(--text-muted);margin-left:8px;font-weight:400">Setup disarmed \u2014 ghost expires in 8h</span>' +
            '</div>';
            for (var wgi = 0; wgi < ghostWatches.length; wgi++) {
                html += buildGhostWatchCard(ghostWatches[wgi]);
            }
        }

        if (activePairs.length > 0) {
            // Compute quality tier
            activePairs.forEach(function(p) { p._tier = qualityTier(p); });

            // Sort: PRIME first, then STANDARD, then DEGRADED.
            // v1.15.0 -- within tier, secondary sort by quality tag order
            // (PRIORITY -> STANDARD+ -> STANDARD -> CAUTION -> CONTESTED), then enrichedScore desc.
            activePairs.sort(function(a, b) {
                var order = { 'PRIME': 0, 'STANDARD': 1, 'DEGRADED': 2 };
                var ta = order[a._tier] !== undefined ? order[a._tier] : 1;
                var tb = order[b._tier] !== undefined ? order[b._tier] : 1;
                if (ta !== tb) return ta - tb;
                var qa = qualityTagOrder(a.qualityTag);
                var qb = qualityTagOrder(b.qualityTag);
                if (qa !== qb) return qa - qb;
                var sa = (a.enrichedScore !== null && a.enrichedScore !== undefined) ? a.enrichedScore : (a.score || 0);
                var sb = (b.enrichedScore !== null && b.enrichedScore !== undefined) ? b.enrichedScore : (b.score || 0);
                return sb - sa;
            });

            var primeGroup    = activePairs.filter(function(p) { return p._tier === 'PRIME'; });
            var standardGroup = activePairs.filter(function(p) { return p._tier === 'STANDARD'; });
            var degradedGroup = activePairs.filter(function(p) { return p._tier === 'DEGRADED'; });

            html += buildColHeaders();

            if (primeGroup.length > 0) {
                html += buildTierHeader('PRIME', primeGroup.length);
                for (var i = 0; i < primeGroup.length; i++) {
                    html += buildRow(primeGroup[i], '&#x1F7E2;', 'prime');
                }
            }
            if (standardGroup.length > 0) {
                html += buildTierHeader('STANDARD', standardGroup.length);
                for (var j = 0; j < standardGroup.length; j++) {
                    html += buildRow(standardGroup[j], '&#x1F7E2;', 'standard');
                }
            }
            if (degradedGroup.length > 0) {
                html += buildTierHeader('DEGRADED', degradedGroup.length);
                for (var k = 0; k < degradedGroup.length; k++) {
                    html += buildRow(degradedGroup[k], '&#x1F7E2;', 'degraded');
                }
            }
        } else if (allActivePairs.length === 0) {
            html += '<div class="armed-empty">No instruments armed</div>';
        } else {
            html += '<div class="armed-empty" style="font-style:italic">All pairs dismissed \u2014 see below</div>';
        }

        // Dismissed section
        if (dismissedItems.length > 0) {
            html += buildDismissedSection(dismissedItems);
        }

        // Off-session pairs (watchlist)
        if (offSessionPairs.length > 0) {
            html += '<div class="armed-section-header">' +
                'Off-Session ' +
                '<span class="armed-section-count candidate">' + offSessionPairs.length + '</span>' +
            '</div>';
            html += buildColHeaders();
            for (var n = 0; n < offSessionPairs.length; n++) {
                html += buildRow(offSessionPairs[n], '&#x1F7E0;', '');
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
    
    // v1.5.3: await loadDismissed() before first fetchArmedState() to prevent
    // race condition where state renders before dismissed pairs are loaded
    (async function() {
        await loadDismissed();
        await loadWatchlist();
        fetchArmedState();
        setInterval(fetchArmedState, REFRESH_INTERVAL);
        setInterval(fetchLocation, 5 * 60 * 1000);
        setInterval(fetchMacro, MACRO_REFRESH_INTERVAL);
    })();
    
    // Global API
    window.refreshArmedPanel = fetchArmedState;
    window.ArmedPanel = {
        toggleContextFilter: toggleContextFilter,
        getDismissedPairs:   function() { return _dismissedPairs; },
        getWatchedPairs:     function() { return _watchedPairs; },
        isExcluded: isExcluded
    };
    window.openTV = openTV;

    window.watchArmedPair = function(pairName) {
        var pairs = (window._lastArmedData && window._lastArmedData.pairs) || [];
        var p = null;
        for (var i = 0; i < pairs.length; i++) { if (pairs[i].pair === pairName) { p = pairs[i]; break; } }
        var now = new Date();
        _watchedPairs[pairName] = {
            watchedAt:         now.toISOString(),
            expiresAt:         new Date(now.getTime() + WATCH_TTL_MS).toISOString(),
            snapshotScore:     p ? (p.enrichedScore !== null && p.enrichedScore !== undefined ? p.enrichedScore : (p.score || 0)) : 0,
            snapshotDirection: p ? (p.direction || '') : '',
            snapshotPlaybook:  p ? (p.playbook  || '') : '',
            snapshotEntryZone: p ? (p.entryZone || '') : ''
        };
        saveWatchlist();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
        if (typeof showToast === 'function') showToast(pairName + ' added to watchlist (8h)', 'success');
    };

    window.unwatchArmedPair = function(pairName) {
        delete _watchedPairs[pairName];
        saveWatchlist();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
        if (typeof showToast === 'function') showToast(pairName + ' removed from watchlist', 'info');
    };

    window.dismissArmedPair = function(pairName) {
        _dismissedPairs[pairName] = { dismissedAt: new Date().toISOString() };
        saveDismissed();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
        if (window.refreshQuickAccessBar) window.refreshQuickAccessBar();
    };

    window.restoreArmedPair = function(pairName) {
        delete _dismissedPairs[pairName];
        saveDismissed();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
        if (window.refreshQuickAccessBar) window.refreshQuickAccessBar();
    };

    window.toggleArmedDismissed = function() {
        _dismissedExpanded = !_dismissedExpanded;
        var body  = document.getElementById('armed-dismissed-body');
        var label = document.getElementById('armed-dismissed-label');
        if (body)  body.style.display = _dismissedExpanded ? 'block' : 'none';
        if (label) {
            var count = Object.keys(_dismissedPairs).length;
            var arrow = _dismissedExpanded ? '\u25b2' : '\u25bc';
            label.textContent = arrow + ' ' + count + ' dismissed \u2014 ' +
                                (_dismissedExpanded ? 'hide' : 'show');
        }
    };

    // v1.15.0 -- magnet list expand/collapse toggle
    window.toggleMagnetList = function(listId, btn) {
        var el = document.getElementById(listId);
        if (!el) return;
        var isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        if (btn && btn.classList) {
            if (isOpen) btn.classList.remove('open');
            else        btn.classList.add('open');
        }
    };

    function updateClearExpiredButton() {
        var btn = document.getElementById('btn-clear-expired');
        if (!btn) return;
        var expired = document.querySelectorAll('#armed-list .armed-ttl-expired');
        btn.style.display = expired.length > 0 ? 'inline-block' : 'none';
    }
    
    var _clearBtnObserver = new MutationObserver(updateClearExpiredButton);
    if (listEl) {
        _clearBtnObserver.observe(listEl, { childList: true, subtree: true });
    }
})();

// Clear expired armed instruments
async function clearExpiredArmed() {
    var expiredPairs = [];
    document.querySelectorAll('#armed-list .armed-ttl-expired').forEach(function(el) {
        var row = el.closest('.armed-pair-row');
        if (row && row.dataset && row.dataset.pair) {
            expiredPairs.push(row.dataset.pair);
        }
    });
    
    if (expiredPairs.length === 0) {
        if (typeof showToast === 'function') showToast('No expired instruments to clear', 'info');
        return;
    }
    
    var stateUrl = 'https://api.pineros.club';
    var cleared  = 0;
    
    for (var i = 0; i < expiredPairs.length; i++) {
        try {
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
    
    if (typeof window.refreshArmedPanel === 'function') {
        setTimeout(window.refreshArmedPanel, 500);
    }
}
