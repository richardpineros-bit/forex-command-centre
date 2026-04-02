// armed-panel.js v1.2.0 - Directional verdict badges per card + fleet summary
(function() {
    // Configuration
    const STATE_URL      = 'https://api.pineros.club/state';
    const SENTIMENT_URL  = 'https://api.pineros.club/ig-sentiment/latest';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    const API_URL        = '/api/storage-api.php';

    // Sentiment cache
    var _sentimentData  = null;
    var _sentimentStale = true;

    // Dismissed pairs state (server-side, session-scoped per calendar date AEST)
    var _dismissedPairs    = new Set();
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
                var today = getTodayAEST();
                if (d.date === today && Array.isArray(d.pairs)) {
                    _dismissedPairs = new Set(d.pairs);
                } else {
                    _dismissedPairs = new Set();
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
                    data: { date: getTodayAEST(), pairs: Array.from(_dismissedPairs) }
                })
            });
        } catch(e) {}
    }

    loadDismissed();

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
    function qualityTier(p) {
        var atrPct = p.volLevel ? Math.round(Number(p.volLevel)) : null;
        var atrLabel = null;
        if (atrPct !== null) {
            if (atrPct >= 80)      atrLabel = 'EXHAUSTED';
            else if (atrPct >= 60) atrLabel = 'ELEVATED';
            else if (atrPct >= 30) atrLabel = 'NORMAL';
            else                   atrLabel = 'IDEAL';
        }

        var structRaw = (p.structExt || p.struct_ext || '').toUpperCase();

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
        
        var ttlState      = 'fresh';
        var fomoBlocked   = false;
        var fomoCountdown = '';
        
        if (ageHours > 24)     ttlState = 'expired';
        else if (ageHours > 8) ttlState = 'ageing';
        
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

    function buildSentimentRow(p) {
        var pair = (p.pair || '').toUpperCase().replace('/', '');
        if (!_sentimentData || !_sentimentData[pair]) return '';
        var s        = _sentimentData[pair];
        var longPct  = s.long_pct;
        var shortPct = s.short_pct;
        var label    = s.label || 'NEUTRAL';
        var signal   = s.contrarian_signal || 'NEUTRAL';
        var strength = s.strength || 'NEUTRAL';

        var dir      = (p.direction || '').toUpperCase();
        var crowdDir = (s.crowd_direction || '').toUpperCase();
        var crowdAligned = (dir === 'LONG' && crowdDir === 'LONG') ||
                           (dir === 'SHORT' && crowdDir === 'SHORT');
        var crowdContra  = (dir === 'LONG' && crowdDir === 'SHORT') ||
                           (dir === 'SHORT' && crowdDir === 'LONG');

        var sigColour;
        if (signal === 'NEUTRAL') {
            sigColour = 'var(--text-muted)';
        } else if (crowdAligned && strength !== 'NEUTRAL') {
            sigColour = 'var(--color-fail)';
        } else if (crowdContra && strength !== 'NEUTRAL') {
            sigColour = 'var(--color-pass)';
        } else {
            sigColour = signal === 'BULLISH' ? 'var(--color-pass)' :
                        signal === 'BEARISH' ? 'var(--color-fail)' : 'var(--text-muted)';
        }

        var warningHtml = '';
        if (crowdAligned && strength !== 'NEUTRAL') {
            warningHtml = '<span style="color:var(--color-warning);font-size:0.65rem;font-weight:700;margin-left:6px">&#x26A0; CROWD WITH YOU</span>';
        }
        var staleHtml = _sentimentStale ?
            '<span style="color:var(--text-muted);font-size:0.6rem;margin-left:4px">(stale)</span>' : '';

        return '<div class="armed-bias-row" style="color:var(--text-secondary)">' +
            '<span style="color:var(--text-muted);font-size:0.7rem">IG Sentiment:</span>' +
            '<span style="margin-left:6px;font-size:0.7rem">' +
                '<span style="color:#4ade80">' + longPct + '% L</span>' +
                '<span style="color:var(--text-muted)"> / </span>' +
                '<span style="color:#f87171">' + shortPct + '% S</span>' +
            '</span>' +
            '<span style="margin-left:6px;font-size:0.7rem;font-weight:700;color:' + sigColour + '">' + label + '</span>' +
            warningHtml + staleHtml +
        '</div>';
    }

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


    function buildDirectionalVerdict(p) {
        var dir = (p.direction || '').toUpperCase();
        if (!dir || (dir !== 'LONG' && dir !== 'SHORT')) {
            return '<div class="armed-verdict-row"><span class="armed-verdict-badge neutral">' +
                '\u21c4 NO DIR</span></div>';
        }

        var score = 0;

        // 1. Bias confluence
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

        // 2. Sentiment (contrarian logic)
        if (_sentimentData) {
            var sym = (p.pair || '').toUpperCase().replace('/', '');
            var s   = _sentimentData[sym];
            if (s && (s.strength || 'NEUTRAL') !== 'NEUTRAL') {
                var cd = (s.crowd_direction || '').toUpperCase();
                var contra = (dir === 'LONG'  && cd === 'SHORT') ||
                             (dir === 'SHORT' && cd === 'LONG');
                var aligned = (dir === 'LONG'  && cd === 'LONG') ||
                              (dir === 'SHORT' && cd === 'SHORT');
                if (contra)  score += 1;
                if (aligned) score -= 1;
            }
        }

        // 3. Structure
        var st = (p.structExt || p.struct_ext || '').toUpperCase();
        if (st === 'FRESH')    score += 1;
        if (st === 'EXTENDED') score -= 1;

        var confLabel, confColour;
        if (score >= 2)      { confLabel = 'HIGH CONF'; confColour = '#4ade80'; }
        else if (score >= 0) { confLabel = 'MED CONF';  confColour = '#eab308'; }
        else                 { confLabel = 'LOW CONF';  confColour = '#f87171'; }

        var arrow   = dir === 'LONG' ? '\u25b2' : '\u25bc';
        var dirColour = dir === 'LONG' ? '#4ade80' : '#f87171';

        return '<div class="armed-verdict-row" style="' +
            'display:flex;align-items:center;gap:6px;padding:3px 10px 4px 32px;' +
            'border-left:2px solid ' + dirColour + ';margin:0 0 0 0;background:rgba(0,0,0,0.15)">' +
            '<span style="color:' + dirColour + ';font-weight:800;font-size:0.75rem;letter-spacing:0.03em">' +
                arrow + ' ' + dir +
            '</span>' +
            '<span style="color:' + confColour + ';font-size:0.65rem;font-weight:700;letter-spacing:0.04em">' +
                confLabel +
            '</span>' +
        '</div>';
    }

    function buildTierHeader(tier, count) {
        var label, cls;
        if (tier === 'PRIME') {
            label = '&#x2B50; PRIME';
            cls   = 'tier-prime';
        } else if (tier === 'STANDARD') {
            label = 'STANDARD';
            cls   = 'tier-standard';
        } else {
            label = '&#x26A0; DEGRADED';
            cls   = 'tier-degraded';
        }
        return '<div class="armed-tier-header ' + cls + '">' +
            label + '<span class="tier-count">' + count + '</span>' +
        '</div>';
    }

    // tier param: 'prime' | 'standard' | 'degraded' | '' (watchlist - no dismiss btn)
    function buildRow(p, emoji, tier) {
        var permCls   = permClass(p.permission);
        var permDisp  = permDisplayClass(p.permission);
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
        var atrPct   = p.volLevel ? Math.round(Number(p.volLevel)) : null;

        var atrLabel, atrLabelColour;
        if (atrPct === null) {
            atrLabel = null;
        } else if (atrPct >= 80) {
            atrLabel = 'EXHAUSTED'; atrLabelColour = 'var(--color-fail)';
        } else if (atrPct >= 60) {
            atrLabel = 'ELEVATED';  atrLabelColour = '#eab308';
        } else if (atrPct >= 30) {
            atrLabel = 'NORMAL';    atrLabelColour = 'var(--color-pass)';
        } else {
            atrLabel = 'IDEAL';     atrLabelColour = '#86efac';
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

        // Dismiss button - only for active armed pairs (tier param truthy)
        var dismissBtn = '';
        if (tier) {
            var dOnClick = 'event.stopPropagation();dismissArmedPair(\'' + (p.pair || '') + '\');return false;';
            dismissBtn = '<button class="armed-dismiss-btn" onclick="' + dOnClick + '" title="Dismiss this session">&#x2716;</button>';
        }

        var wrapperCls = 'armed-pair-wrapper' + (tier ? ' ' + tier : '');

        var biasRowHtml      = buildBiasRow(p);
        var sentimentRowHtml = buildSentimentRow(p);
        var verdictRowHtml   = buildDirectionalVerdict(p);

        return '<div class="' + wrapperCls + '">' +
            dismissBtn +
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
            verdictRowHtml +
            biasRowHtml +
            sentimentRowHtml +
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
            '<span>Risk</span>' +
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

        // Separate dismissed from active
        var dismissedItems = allActivePairs.filter(function(p) { return _dismissedPairs.has(p.pair); });
        var activePairs    = allActivePairs.filter(function(p) { return !_dismissedPairs.has(p.pair); });

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
                return (b.score || 0) - (a.score || 0);
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

        // Watchlist (candidates + off-session)
        var candidates = data.candidates || [];
        var armedNames = {};
        for (var m = 0; m < allActivePairs.length; m++) {
            if (allActivePairs[m].pair) armedNames[allActivePairs[m].pair] = true;
        }
        candidates = candidates.filter(function(c) { return !armedNames[c.pair]; });
        var watchlistItems = offSessionPairs.concat(candidates);

        if (watchlistItems.length > 0) {
            html += '<div class="armed-section-header">' +
                'Watchlist ' +
                '<span class="armed-section-count candidate">' + watchlistItems.length + '</span>' +
            '</div>';
            html += buildColHeaders();
            for (var n = 0; n < watchlistItems.length; n++) {
                var wEmoji = offSessionPairs.indexOf(watchlistItems[n]) !== -1 ? '&#x1F7E0;' : '&#x1F7E1;';
                html += buildRow(watchlistItems[n], wEmoji, '');
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
    
    fetchArmedState();
    setInterval(fetchArmedState, REFRESH_INTERVAL);
    
    // Global API
    window.refreshArmedPanel = fetchArmedState;
    window.ArmedPanel = { toggleContextFilter: toggleContextFilter };
    window.openTV = openTV;

    window.dismissArmedPair = function(pairName) {
        _dismissedPairs.add(pairName);
        saveDismissed();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
    };

    window.restoreArmedPair = function(pairName) {
        _dismissedPairs.delete(pairName);
        saveDismissed();
        if (window._lastArmedData) renderArmedState(window._lastArmedData);
    };

    window.toggleArmedDismissed = function() {
        _dismissedExpanded = !_dismissedExpanded;
        var body  = document.getElementById('armed-dismissed-body');
        var label = document.getElementById('armed-dismissed-label');
        if (body)  body.style.display = _dismissedExpanded ? 'block' : 'none';
        if (label) {
            var count = _dismissedPairs.size;
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
