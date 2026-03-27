// ============================================
// TE BRIEFING MODULE v3.0.0
// Summarises real TE data: FX rates + today's economic actuals as drivers.
// Claude summarises ONLY what the scraped data says -- no invention.
// ============================================

(function() {
    'use strict';

    var API_BASE         = (typeof window.API_BASE !== 'undefined') ? window.API_BASE : 'https://api.pineros.club';
    var REFRESH_INTERVAL = 30 * 60 * 1000;

    window.TEBriefing = {
        init:    init,
        refresh: fetchAndRender
    };

    function init() {
        fetchAndRender();
        setInterval(fetchAndRender, REFRESH_INTERVAL);
    }

    function fetchAndRender() {
        fetch(API_BASE + '/te-snapshot')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                window.TE_SNAPSHOT_DATA = data;
                renderCard(data);
                if (window.DashboardEventWidget && window.DashboardEventWidget.updateEventDisplay) {
                    window.DashboardEventWidget.updateEventDisplay();
                }
            })
            .catch(function(e) {
                renderCard(null, 'TE snapshot unavailable (' + e.message + ')');
            });
    }

    // -- Main card render ---------------------------------------------------

    function renderCard(data, errorMsg) {
        var container = document.getElementById('te-briefing-container');
        if (!container) return;

        if (errorMsg || !data || data.ok === false) {
            var msg = errorMsg || (data && data.error) || 'TE snapshot not available';
            container.innerHTML =
                '<div style="padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-color);' +
                'border-left:3px solid #6c757d;border-radius:var(--radius-sm);font-size:0.78rem;' +
                'color:var(--text-muted);margin-bottom:16px;">&#x1F310; <strong>Macro Briefing</strong> &mdash; ' +
                msg + '</div>';
            return;
        }

        var staleHtml = '';
        if (data.stale) {
            var lastUp = data.last_updated ? new Date(data.last_updated).toLocaleString('en-AU') : 'unknown';
            staleHtml =
                '<div style="padding:6px 12px;background:#fff3cd;border-left:3px solid #ffc107;' +
                'font-size:0.75rem;color:#856404;">&#x26A0; Stale &mdash; ' + lastUp + '</div>';
        }

        var ts = data.last_updated
            ? new Date(data.last_updated).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit'
              })
            : 'unknown';

        var totalCount = (data.summary || {}).total_events  || 0;
        var highCount  = (data.summary || {}).high_impact   || 0;
        var bondCount  = (data.bond_auctions || []).length;
        var cardId     = 'te-summary-text';

        container.innerHTML =
            '<div class="card" style="margin-bottom:16px;">' +
            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span class="card-title">&#x1F310; Macro Briefing</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">TE &bull; ' + ts + '</span>' +
            '</div>' +
            (staleHtml ? '<div style="border-bottom:1px solid var(--border-color);">' + staleHtml + '</div>' : '') +
            '<div class="card-body" style="padding:12px 16px;">' +

            // Summary paragraph — fills async
            '<div id="' + cardId + '" style="font-size:0.85rem;line-height:1.65;color:var(--text-secondary);margin-bottom:12px;min-height:40px;">' +
            '<span style="color:var(--text-muted);font-style:italic;font-size:0.78rem;">&#x23F3; Loading market summary...</span>' +
            '</div>' +

            // FX rate strip
            '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;line-height:1.8;">' +
            buildRateStrip(data.fx_snapshot || {}) +
            '</div>' +

            // Pills
            '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.72rem;">' +
            '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:2px 8px;border-radius:12px;color:var(--text-muted);">' + totalCount + ' G10 events today</span>' +
            (highCount > 0 ? '<span style="background:#f8d7da;border:1px solid #f5c6cb;padding:2px 8px;border-radius:12px;color:#721c24;">&#x26A0; ' + highCount + ' High impact</span>' : '') +
            (bondCount > 0 ? '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:2px 8px;border-radius:12px;color:var(--text-muted);">' + bondCount + ' bond auctions</span>' : '') +
            '</div>' +
            '</div></div>';

        generateSummary(data, cardId);
    }

    // -- FX rate strip ------------------------------------------------------

    function buildRateStrip(fx) {
        var PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF'];
        var parts = [];
        PAIRS.forEach(function(pair) {
            var d = fx[pair];
            if (!d || !d.rate) return;
            var pctColour = d.daily_pct
                ? (d.daily_pct.startsWith('+') ? 'color:#28a745;' : 'color:#dc3545;')
                : '';
            parts.push(
                '<strong>' + pair + '</strong> ' + d.rate +
                (d.daily_pct ? ' <span style="' + pctColour + '">' + d.daily_pct + '</span>' : '')
            );
        });
        return parts.join(' &nbsp;&bull;&nbsp; ');
    }

    // -- Build driver context from today's actuals --------------------------

    function buildDriverContext(data) {
        var events  = data.today_events || [];
        var drivers = [];

        // Events with actuals that fired today
        events.forEach(function(e) {
            if (!e.actual || !e.event) return;
            var line = e.currency + ' | ' + e.event;
            if (e.actual)   line += ' | actual: ' + e.actual;
            if (e.forecast) line += ' | forecast: ' + e.forecast;
            if (e.surprise_dir) {
                line += ' | ' + e.surprise_dir;
                if (e.surprise_pct !== null && e.surprise_pct !== undefined) {
                    var pct = Math.abs(e.surprise_pct);
                    if (pct > 1) line += ' by ' + pct.toFixed(1) + '%';
                }
            }
            drivers.push(line);
        });

        return drivers;
    }

    // -- AI summary from real TE data ---------------------------------------

    function generateSummary(data, targetId) {
        var fx      = data.fx_snapshot || {};
        var PAIRS   = ['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF'];

        // FX context from TE currency page summaries
        var fxContext = [];
        PAIRS.forEach(function(pair) {
            var d = fx[pair];
            if (!d) return;
            if (d.summary) {
                fxContext.push(pair + ': ' + d.summary);
            } else if (d.rate && d.daily_pct) {
                fxContext.push(pair + ': ' + d.rate + ' (' + d.daily_pct + ' today)');
            }
        });

        // Economic driver context from today's actuals
        var drivers = buildDriverContext(data);

        if (fxContext.length === 0 && drivers.length === 0) {
            setCardText(targetId, 'No source data available to summarise.');
            return;
        }

        var prompt =
            'You are writing a pre-session forex market brief for a retail trader.\n' +
            'Use ONLY the data provided below. Do NOT add any information, opinions, or context not in the data.\n' +
            'Write 2-3 sentences maximum in plain everyday English with zero jargon.\n' +
            'Focus on WHAT IS MOVING the currencies and WHY, based on the economic data.\n' +
            'Format: start with the key movers (e.g. "USD weak, GBP strong"), then the economic reasons from the data.\n' +
            'Example style: "USD soft after jobless claims came in higher than expected. GBP gaining after UK inflation expectations beat forecast. JPY steady with no major data today."\n\n';

        if (drivers.length > 0) {
            prompt += 'TODAY\'S ECONOMIC RELEASES (actual vs forecast):\n' + drivers.join('\n') + '\n\n';
        }
        if (fxContext.length > 0) {
            prompt += 'FX RATE CONTEXT (from Trading Economics):\n' + fxContext.join('\n') + '\n';
        }

        fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model:      'claude-sonnet-4-20250514',
                max_tokens: 150,
                messages:   [{ role: 'user', content: prompt }]
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(resp) {
            var text = (resp.content && resp.content[0] && resp.content[0].text)
                ? resp.content[0].text.trim()
                : null;
            setCardText(targetId, text || 'Summary unavailable.');
        })
        .catch(function(e) {
            setCardText(targetId, 'Summary unavailable: ' + e.message);
        });
    }

    function setCardText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { init(); }, 1200);
    });

})();
