// armed-panel.js v1.7.0 - Layout redesign: direction+conf in header row; intelligence strip consolidates news/IG/OB/ATR/struct; Oanda order book integrated as 4th satellite; score thresholds updated (HIGH>=3, MED>=1) | v1.6.0 - Score enrichment: show enrichedScore (base+locPts) when available; qualityTier uses locGrade directly; OPPOSED/FALSE_BREAK force DEGRADED; sort by enrichedScore | v1.5.3 - Await loadDismissed() before first fetchArmedState() to fix dismiss race on refresh; v1.5.2 - Expose isExcluded on window.ArmedPanel for QAB filter parity; v1.5.1 - Fix reconcile: only auto-restore pairs with armedAt; dismiss/restore trigger QAB refresh; v1.5.0 - Bugfixes: data-pair for clearExpired, armedAt for dismiss reconcile, getDismissedPairs exposed; v1.4.0 - Ultimate UTCC: TF_ARMED (blue) / TR_ARMED (orange) cards; position size; playbook in verdict row; 3 satellites retained
(function() {
    // Configuration
    const STATE_URL      = 'https://api.pineros.club/state';
    const SENTIMENT_URL  = 'https://api.pineros.club/ig-sentiment/latest';
    const ORDERBOOK_URL  = 'https://api.pineros.club/oanda-book/latest';
    const LOCATION_URL   = 'https://api.pineros.club/location';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    const API_URL        = '/api/storage-api.php';

    // Sentiment cache
    var _sentimentData  = null;
    var _sentimentStale = true;
    var _locationData   = {};   // keyed by pair name

    // Oanda order book cache
    var _orderBookData  = null;
    var _orderBookStale = true;

    // Dismissed pairs state (server-side, permanent until new ARMED re-arms the pair)
    // Structure: { pair: { dismissedAt: ISO string } }
    var _dismissedPairs    = {};   // keyed by pair name
    var _dismissedExpanded = false;

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
            : (p.structExt || p.struct_ext || '').toUpperCase();

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

    function atrColour(behaviour) {
        if (!behaviour) return 'var(--text-muted)';
        var b = behaviour.toUpperCase();
        if (b === 'TREND')          return 'var(--color-pass)';
        if (b === 'EXHAUSTED')      return 'var(--color-fail)';
        if (b === 'SPIKE')          return '#f97316';
        if (b === 'EXPANDING_FAST') return '#eab308';
        if (b === 'EXPANDING_SLOW') return '#86efac';
        if (b === 'CONTRACTING')    return 'var(--text-muted)';
        return 'var(--text-secondary)';
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
        var st = (p.structExt || p.struct_ext || '').toUpperCase();
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

        // 4. ATR (moved from header row)
        var atrBehav = (p.volBehaviour || '').toUpperCase();
        var atrPct   = p.volLevel ? Math.round(Number(p.volLevel)) : null;
        if (atrPct !== null) {
            var atrLbl, atrC;
            if (atrPct >= 80)      { atrLbl = 'EXHAUSTED'; atrC = 'var(--color-fail)'; }
            else if (atrPct >= 60) { atrLbl = 'ELEVATED';  atrC = '#eab308'; }
            else if (atrPct >= 30) { atrLbl = 'NORMAL';    atrC = 'var(--color-pass)'; }
            else                   { atrLbl = 'IDEAL';     atrC = '#86efac'; }
            parts.push('<span class="intel-item"><span class="intel-label">ATR</span><span style="color:' + atrC + ';font-weight:700">' + atrLbl + '</span><span style="color:var(--text-muted);font-size:0.62rem"> ' + atrPct + '%ile</span></span>');
        } else if (atrBehav) {
            parts.push('<span class="intel-item"><span class="intel-label">ATR</span><span style="color:' + atrColour(atrBehav) + ';font-weight:700">' + atrBehav.replace('_', ' ') + '</span></span>');
        }

        // 5. Structure (moved from header row)
        var structRaw = (p.structExt || p.struct_ext || '').toUpperCase();
        var stC, stL;
        if      (structRaw === 'FRESH')      { stC = '#4ade80';              stL = 'FRESH'; }
        else if (structRaw === 'DEVELOPING') { stC = '#eab308';              stL = 'DEV'; }
        else if (structRaw === 'EXTENDED')   { stC = 'var(--color-fail)';    stL = 'EXT'; }
        if (stL) {
            parts.push('<span class="intel-item"><span class="intel-label">Struct</span><span style="color:' + stC + ';font-weight:700">' + stL + '</span></span>');
        }

        // Playbook label (right-aligned)
        var playbookLabel = (p.playbook || '').toUpperCase().replace(/_/g, ' ');
        var playbookHtml  = playbookLabel ? '<span class="intel-playbook">' + playbookLabel + '</span>' : '';

        return '<div class="armed-intelligence-strip">' +
            parts.join('<span class="intel-sep">|</span>') +
            playbookHtml +
        '</div>';
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
        if (tier) {
            var hasOpenTrade = (window._armedOpenTrades || {})[p.pair || ''];
            if (hasOpenTrade) {
                dismissBtn = '<button class="armed-dismiss-btn" disabled title="Cannot dismiss \u2014 open trade active" style="opacity:0.35;cursor:not-allowed">&#x2716;</button>';
            } else {
                var dOnClick = 'event.stopPropagation();dismissArmedPair(\'' + (p.pair || '') + '\');return false;';
                dismissBtn = '<button class="armed-dismiss-btn" onclick="' + dOnClick + '" title="Dismiss \u2014 restores on next ARMED alert">&#x2716;</button>';
            }
        }

        var wrapperCls = 'armed-pair-wrapper' + (tier ? ' ' + tier : '');

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
        var intelligenceHtml = buildIntelligenceStrip(p);

        return '<div class="' + wrapperCls + '">' +
            dismissBtn +
            '<a href="#" class="' + rowClass + ' armed-row-link" data-pair="' + (p.pair || '') + '" onclick="' + tvOnClick + '" title="Open ' + (p.pair || '') + ' on TradingView 4H">' +
                '<span class="armed-emoji">' + emoji + '</span>' +
                '<span class="armed-pair-name">' + alertTypeBadge(p) + ' ' + (p.pair || '') + '</span>' +
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
            intelligenceHtml +
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

        if (activePairs.length > 0) {
            // Compute quality tier
            activePairs.forEach(function(p) { p._tier = qualityTier(p); });

            // Sort: PRIME first, then STANDARD, then DEGRADED; score desc within tier
            activePairs.sort(function(a, b) {
                var order = { 'PRIME': 0, 'STANDARD': 1, 'DEGRADED': 2 };
                var ta = order[a._tier] !== undefined ? order[a._tier] : 1;
                var tb = order[b._tier] !== undefined ? order[b._tier] : 1;
                if (ta !== tb) return ta - tb;
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
        fetchArmedState();
        setInterval(fetchArmedState, REFRESH_INTERVAL);
        setInterval(fetchLocation, 5 * 60 * 1000);
    })();
    
    // Global API
    window.refreshArmedPanel = fetchArmedState;
    window.ArmedPanel = {
        toggleContextFilter: toggleContextFilter,
        getDismissedPairs: function() { return _dismissedPairs; },
        isExcluded: isExcluded
    };
    window.openTV = openTV;

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
