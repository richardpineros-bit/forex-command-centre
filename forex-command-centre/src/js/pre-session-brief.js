// ============================================
// PRE-SESSION BRIEF MODULE v2.0.0
// Single combined card: Session Brief + Macro Briefing
// Template-based summary — no API call, instant, reliable.
// Bond auctions removed — live in CRITICAL Events card instead.
// ============================================

(function() {
    'use strict';

    var API_BASE         = 'https://api.pineros.club';
    var REFRESH_INTERVAL = 15 * 60 * 1000;

    window.PreSessionBrief = { init: init, refresh: renderCard };
    window.TEBriefing      = { init: init, refresh: renderCard }; // satisfy te-briefing refs

    // ── Session detection (AEST = UTC+10) ─────────────────────────────────
    function getCurrentSession() {
        var h = new Date().getUTCHours();
        if (h >= 23 || h < 7)  return { name: 'Tokyo',    emoji: '&#x1F1EF;&#x1F1F5;', pairs: ['USDJPY','AUDJPY','AUDUSD','NZDJPY','NZDUSD'] };
        if (h >= 7  && h < 16) return { name: 'London',   emoji: '&#x1F1EC;&#x1F1E7;', pairs: ['EURUSD','GBPUSD','EURGBP','GBPJPY','USDCHF'] };
        if (h >= 12 && h < 21) return { name: 'New York', emoji: '&#x1F1FA;&#x1F1F8;', pairs: ['EURUSD','GBPUSD','USDCAD','USDCHF','USDJPY'] };
        return null;
    }

    // ── Init ──────────────────────────────────────────────────────────────
    function init() {
        fetchAndRender();
        setInterval(fetchAndRender, REFRESH_INTERVAL);
    }

    function fetchAndRender() {
        // Fetch bias + TE snapshot in parallel
        var biasP = fetch(API_BASE + '/bias-history/latest').then(function(r) { return r.json(); }).catch(function() { return null; });
        var teP   = fetch(API_BASE + '/te-snapshot').then(function(r) { return r.json(); }).catch(function() { return null; });

        Promise.all([biasP, teP]).then(function(results) {
            var bias = results[0];
            var te   = results[1];
            window.TE_SNAPSHOT_DATA = te;
            // Notify event widget (picks up bond auctions)
            if (window.DashboardEventWidget && window.DashboardEventWidget.updateEventDisplay) {
                window.DashboardEventWidget.updateEventDisplay();
            }
            renderCard(bias, te);
        });
    }

    // ── Main render ───────────────────────────────────────────────────────
    function renderCard(bias, te) {
        var container = document.getElementById('pre-session-brief-container');
        if (!container) return;

        var session  = getCurrentSession();
        var ts       = new Date().toLocaleString('en-AU', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        var teTs     = (te && te.last_updated)
            ? new Date(te.last_updated).toLocaleString('en-AU', { hour:'2-digit', minute:'2-digit' })
            : null;

        // Header title
        var title = session
            ? session.emoji + ' ' + session.name + ' Session Brief'
            : '&#x1F310; Market Brief';

        // Stale warning
        var staleHtml = (te && te.stale)
            ? '<div style="padding:5px 14px;background:#fff3cd;border-bottom:1px solid var(--border-color);font-size:0.72rem;color:#856404;">&#x26A0; TE data stale &mdash; scraper may not have run</div>'
            : '';

        // Template summary paragraph
        var summary = buildSummary(bias, te, session);

        // FX strip
        var fxStrip = te ? buildRateStrip(te.fx_snapshot || {}) : '';

        // Bias chips
        var biasHtml = buildBiasChips(bias);

        // Upcoming events chips
        var eventsHtml = buildEventsChips(te);

        // Session pairs
        var pairsHtml = session ? buildPairsChips(bias, session) : '';

        // Pills row
        var totalCount = te && te.summary ? (te.summary.total_events || 0) : 0;
        var pillsHtml =
            '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:2px 8px;border-radius:12px;color:var(--text-muted);font-size:0.72rem;">' +
            totalCount + ' G10 events today</span>' +
            (teTs ? '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:2px 8px;border-radius:12px;color:var(--text-muted);font-size:0.72rem;">TE updated ' + teTs + '</span>' : '');

        container.innerHTML =
            '<div class="card" style="margin-bottom:16px;border-left:3px solid var(--color-info);">' +
            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span class="card-title">' + title + '</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + ts + '</span>' +
            '</div>' +
            staleHtml +
            '<div class="card-body" style="padding:12px 16px;">' +

            // Summary paragraph
            '<p style="font-size:0.85rem;line-height:1.65;color:var(--text-secondary);margin:0 0 12px 0;">' + summary + '</p>' +

            // FX strip
            (fxStrip ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;line-height:1.9;">' + fxStrip + '</div>' : '') +

            // Bias row
            (biasHtml ? '<div style="margin-bottom:10px;">' +
                '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">News Bias</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + biasHtml + '</div></div>' : '') +

            // Upcoming events
            (eventsHtml ? '<div style="margin-bottom:10px;">' +
                '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Upcoming High Impact</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + eventsHtml + '</div></div>' : '') +

            // Session pairs
            (pairsHtml ? '<div style="margin-bottom:10px;">' +
                '<div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Session Pairs</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + pairsHtml + '</div></div>' : '') +

            // Pills
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + pillsHtml + '</div>' +

            '</div></div>';
    }

    // ── Template summary ──────────────────────────────────────────────────
    function buildSummary(bias, te, session) {
        var parts = [];

        // 1. Currency bias direction (from FF bias engine)
        var biasCur = bias && (bias.currency_bias || bias.latest_bias);
        if (biasCur) {
            var bullish = [], bearish = [];
            ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'].forEach(function(c) {
                var d = biasCur[c];
                if (!d) return;
                if (d.bias === 'STRONGLY_BULLISH' || d.bias === 'BULLISH') bullish.push(c);
                if (d.bias === 'STRONGLY_BEARISH' || d.bias === 'BEARISH') bearish.push(c);
            });
            var biasParts = [];
            if (bullish.length) biasParts.push(bullish.join(', ') + ' showing bullish bias');
            if (bearish.length) biasParts.push(bearish.join(', ') + ' showing bearish bias');
            if (biasParts.length) parts.push(biasParts.join('; ') + '.');
        }

        // 2. Economic drivers — today's actuals with surprise
        if (te && te.today_events) {
            var drivers = [];
            te.today_events.forEach(function(e) {
                if (!e.actual || !e.event || !e.currency) return;
                var line = e.currency + ': ' + e.event;
                if (e.surprise_dir && e.surprise_dir !== 'INLINE') {
                    line += ' ' + (e.surprise_dir === 'BEAT' ? 'beat' : 'missed') + ' forecast';
                    if (e.surprise_pct !== null && e.surprise_pct !== undefined && Math.abs(e.surprise_pct) > 0.5) {
                        line += ' by ' + Math.abs(e.surprise_pct).toFixed(1) + '%';
                    }
                } else if (e.actual) {
                    line += ' came in at ' + e.actual;
                }
                drivers.push(line);
            });
            if (drivers.length) {
                // Group by currency for brevity — show max 4 drivers
                parts.push('Today\'s data: ' + drivers.slice(0, 4).join('. ') + '.');
            }
        }

        // 3. FX moves
        if (te && te.fx_snapshot) {
            var movers = [];
            var PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];
            PAIRS.forEach(function(pair) {
                var d = te.fx_snapshot[pair];
                if (!d || !d.daily_pct) return;
                var pct = parseFloat(d.daily_pct);
                if (Math.abs(pct) >= 0.3) {
                    movers.push(pair + ' ' + (pct > 0 ? 'up' : 'down') + ' ' + Math.abs(pct).toFixed(2) + '%');
                }
            });
            if (movers.length) parts.push('Notable moves: ' + movers.join(', ') + '.');
        }

        // 4. Upcoming high-impact
        if (te && te.today_events) {
            var upcoming = te.today_events
                .filter(function(e) { return !e.actual && e.event && e.currency; })
                .slice(0, 2)
                .map(function(e) { return e.currency + ' ' + e.event + (e.time_et ? ' at ' + e.time_et : ''); });
            if (upcoming.length) parts.push('Watch: ' + upcoming.join('; ') + '.');
        }

        // Session pair recommendation
        if (session && bias && (bias.pair_verdicts || bias.latest_verdicts)) {
            var clean = session.pairs.filter(function(pair) {
                var v = (bias.pair_verdicts || bias.latest_verdicts)[pair];
                return v && (v.direction === 'BULLISH' || v.direction === 'BEARISH') && v.strength !== 'WEAK';
            });
            if (clean.length) parts.push('Cleaner pairs this session: ' + clean.join(', ') + '.');
        }

        return parts.length ? parts.join(' ') : 'Awaiting data &mdash; run scrapers and check alert server.';
    }

    // ── FX rate strip ─────────────────────────────────────────────────────
    function buildRateStrip(fx) {
        var PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF'];
        var parts = [];
        PAIRS.forEach(function(pair) {
            var d = fx[pair];
            if (!d || !d.rate) return;
            var col = d.daily_pct
                ? (d.daily_pct.startsWith('+') ? 'color:#28a745;' : 'color:#dc3545;')
                : '';
            parts.push(
                '<strong>' + pair + '</strong> ' + d.rate +
                (d.daily_pct ? ' <span style="' + col + '">' + d.daily_pct + '</span>' : '')
            );
        });
        return parts.join(' &nbsp;&bull;&nbsp; ');
    }

    // ── Bias chips ────────────────────────────────────────────────────────
    function buildBiasChips(bias) {
        var biasCur = bias && (bias.currency_bias || bias.latest_bias);
        if (!biasCur || !Object.keys(biasCur).length) return '';
        var ARROW  = { STRONGLY_BULLISH:'&#x2B06;&#x2B06;', BULLISH:'&#x2B06;', NEUTRAL:'&#x27A1;', BEARISH:'&#x2B07;', STRONGLY_BEARISH:'&#x2B07;&#x2B07;' };
        var COLOUR = { STRONGLY_BULLISH:'#28a745', BULLISH:'#28a745', NEUTRAL:'#6c757d', BEARISH:'#dc3545', STRONGLY_BEARISH:'#dc3545' };
        var CURS = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'];
        return CURS.map(function(cur) {
            var d = biasCur[cur];
            var col = d ? (COLOUR[d.bias] || '#6c757d') : '#6c757d';
            var arr = d ? (ARROW[d.bias]  || '&#x27A1;') : '&#x2014;';
            return '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:var(--bg-tertiary);color:' + col + ';font-weight:600;">' + cur + ' ' + arr + '</span>';
        }).join('');
    }

    // ── Upcoming events chips ─────────────────────────────────────────────
    function buildEventsChips(te) {
        if (!te || !te.today_events) return '';
        // Show upcoming (no actual yet) events only — max 6
        var items = te.today_events
            .filter(function(e) { return !e.actual && e.event && e.currency; })
            .slice(0, 6);
        if (!items.length) return '<span style="font-size:0.72rem;color:var(--text-muted);">&#x2714; None in view</span>';
        return items.map(function(e) {
            return '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:var(--bg-tertiary);border:1px solid var(--border-color);color:var(--text-secondary);">' +
                '<strong>' + e.currency + '</strong> ' + e.event +
                (e.time_et ? ' <span style="color:var(--text-muted);">' + e.time_et + '</span>' : '') +
                '</span>';
        }).join('');
    }

    // ── Session pairs chips ───────────────────────────────────────────────
    function buildPairsChips(bias, session) {
        var verdicts = bias && (bias.pair_verdicts || bias.latest_verdicts);
        if (!verdicts) return '';
        return session.pairs.map(function(pair) {
            var v = verdicts[pair];
            var bg, col, border, suffix = '';
            if (v && (v.direction === 'BULLISH' || v.direction === 'BEARISH') && v.strength !== 'WEAK') {
                bg = '#d4edda'; col = '#155724'; border = '#c3e6cb';
                suffix = ' ' + (v.direction === 'BULLISH' ? '&#x2B06;' : '&#x2B07;');
            } else if (v && v.direction === 'NEUTRAL') {
                bg = '#fff3cd'; col = '#856404'; border = '#ffeeba';
                suffix = ' &#x26A0;';
            } else {
                bg = 'var(--bg-tertiary)'; col = 'var(--text-muted)'; border = 'var(--border-color)';
            }
            return '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:' + bg + ';color:' + col + ';border:1px solid ' + border + ';">' + pair + suffix + '</span>';
        }).join('');
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            try {
                init();
            } catch(e) {
                // Fallback: render error state so card is visible
                var c = document.getElementById('pre-session-brief-container');
                if (c) c.innerHTML = '<div class="card" style="margin-bottom:16px;border-left:3px solid #dc3545;"><div class="card-body" style="padding:12px 16px;font-size:0.85rem;color:#dc3545;">&#x26A0; Session brief error: ' + e.message + '</div></div>';
            }
        }, 800);
    });

})();
