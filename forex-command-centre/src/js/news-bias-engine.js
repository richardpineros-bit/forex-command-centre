// news-bias-engine.js — FCC v5.0.0
// Fetches /bias-history/latest, exposes window.NewsBiasEngine
// Polls every 30 min. Graceful fallback if API unreachable.

(function() {
    'use strict';

    var BIAS_API = 'https://api.pineros.club/bias-history/latest';
    var POLL_INTERVAL = 30 * 60 * 1000; // 30 min
    var _cache = null;          // { pair_verdicts, currency_bias, last_updated, fetched_at }
    var _pollTimer = null;

    // -------------------------------------------------------------------------
    // Fetch
    // -------------------------------------------------------------------------
    async function fetchBias() {
        try {
            var resp = await fetch(BIAS_API, { cache: 'no-cache' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            _cache = {
                pair_verdicts:  data.pair_verdicts  || {},
                currency_bias:  data.currency_bias  || {},
                last_updated:   data.last_updated   || null,
                fetched_at:     Date.now()
            };
            console.log('[NewsBiasEngine] Loaded. Pairs:', Object.keys(_cache.pair_verdicts).length,
                '| Currencies:', Object.keys(_cache.currency_bias).length);
        } catch (e) {
            console.warn('[NewsBiasEngine] Fetch failed:', e.message);
            // Keep stale cache if present; if none, leave null (callers handle gracefully)
        }
    }

    function startPolling() {
        fetchBias();
        _pollTimer = setInterval(fetchBias, POLL_INTERVAL);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * getVerdict(pair) — e.g. 'AUDUSD'
     * Returns { direction, net_score, strength, size_modifier, confluence, base_bias, quote_bias }
     * or null if no data.
     * confluence is computed here vs UTCC direction if utccDirection arg provided.
     */
    function getVerdict(pair, utccDirection) {
        if (!_cache || !_cache.pair_verdicts) return null;
        var p = (pair || '').toUpperCase().replace('/', '');
        var v = _cache.pair_verdicts[p];
        if (!v) return null;

        var result = {
            direction:     v.direction    || 'NEUTRAL',
            net_score:     v.net_score    !== undefined ? v.net_score : 0,
            strength:      v.strength     || 'WEAK',
            size_modifier: v.size_modifier !== undefined ? v.size_modifier : 1.0,
            confluence:    'NEUTRAL',
            base_bias:     getBias(p.substring(0, 3)),
            quote_bias:    getBias(p.substring(3, 6))
        };

        // Compute confluence if UTCC direction provided
        if (utccDirection && result.direction !== 'NEUTRAL') {
            var biasLong  = result.direction === 'BULLISH';
            var dir = (utccDirection || '').toLowerCase();
            var utccLong  = dir === 'long' || dir === 'bull' || dir === 'bullish';
            var utccShort = dir === 'short' || dir === 'bear' || dir === 'bearish';
            if ((biasLong && utccLong) || (!biasLong && utccShort)) {
                result.confluence = 'ALIGNED';
            } else if ((biasLong && utccShort) || (!biasLong && utccLong)) {
                result.confluence = 'CONFLICTING';
            }
        }

        return result;
    }

    /**
     * getBias(currency) — e.g. 'AUD'
     * Returns { bias, score, confidence, event_count, events[] }
     * or null if no data.
     */
    function getBias(currency) {
        if (!_cache || !_cache.currency_bias) return null;
        var c = (currency || '').toUpperCase();
        var b = _cache.currency_bias[c];
        if (!b) return null;
        return {
            bias:        b.bias        || 'NEUTRAL',
            score:       b.score       !== undefined ? b.score : 0,
            confidence:  b.confidence  || 'LOW',
            event_count: b.event_count || 0,
            events:      b.events      || []
        };
    }

    /**
     * hasData() — true if cache is populated (even if all NEUTRAL)
     */
    function hasData() {
        return _cache !== null;
    }

    /**
     * isStale() — true if last fetch > 35 min ago
     */
    function isStale() {
        if (!_cache) return true;
        return (Date.now() - _cache.fetched_at) > 35 * 60 * 1000;
    }

    /**
     * refresh() — manual refresh trigger
     */
    function refresh() {
        return fetchBias();
    }

    // -------------------------------------------------------------------------
    // Expose
    // -------------------------------------------------------------------------
    window.NewsBiasEngine = {
        getVerdict:  getVerdict,
        getBias:     getBias,
        hasData:     hasData,
        isStale:     isStale,
        refresh:     refresh,
        _getCache:   function() { return _cache; }
    };

    // Boot
    startPolling();

})();
