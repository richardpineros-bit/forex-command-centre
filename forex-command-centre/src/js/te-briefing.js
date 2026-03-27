// ============================================
// TE BRIEFING MODULE v2.0.0
// Fetches /te-snapshot, passes real TE source text to Claude API
// for a plain-English paragraph summary. Claude summarises only
// what the TE pages say -- no external context added.
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
        var bondCount  = ((data.bond_auctions) || []).length;

        var cardId = 'te-summary-text';

        container.innerHTML =
            '<div class="card" style="margin-bottom:16px;">' +
            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span class="card-title">&#x1F310; Macro Briefing</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">TE &bull; ' + ts + '</span>' +
            '</div>' +
            (staleHtml ? '<div style="border-bottom:1px solid var(--border-color);">' + staleHtml + '</div>' : '') +
            '<div class="card-body" style="padding:12px 16px;">' +
            '<div id="' + cardId + '" style="font-size:0.85rem;line-height:1.65;color:var(--text-secondary);margin-bottom:12px;min-height:40px;">' +
            '<span style="color:var(--text-muted);font-style:italic;font-size:0.78rem;">&#x23F3; Generating summary...</span>' +
            '</div>' +
            '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">' + buildRateStrip(data.fx_snapshot || {}) + '</div>' +
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
            var pctColour = '';
            if (d.daily_pct) {
                pctColour = d.daily_pct.startsWith('+') ? 'color:#28a745;' : 'color:#dc3545;';
            }
            parts.push(
                '<strong>' + pair + '</strong> ' + d.rate +
                (d.daily_pct ? ' <span style="' + pctColour + '">' + d.daily_pct + '</span>' : '')
            );
        });
        return parts.join(' &nbsp;&bull;&nbsp; ');
    }

    // -- AI summary from real TE source text --------------------------------

    function generateSummary(data, targetId) {
        var fx    = data.fx_snapshot || {};
        var PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF'];
        var sources = [];

        PAIRS.forEach(function(pair) {
            var d = fx[pair];
            if (!d) return;
            if (d.summary) {
                sources.push(pair + ': ' + d.summary);
            } else if (d.rate && d.daily_pct) {
                sources.push(pair + ': rate ' + d.rate + ', day ' + d.daily_pct);
            }
        });

        if (sources.length === 0) {
            setCardText(targetId, 'No source data available to summarise.');
            return;
        }

        var prompt =
            'You are summarising forex market data sourced directly from Trading Economics. ' +
            'Summarise ONLY what the following source text says. ' +
            'Do NOT add any external context, opinions, news, or information not present in the data. ' +
            'Write ONE short paragraph (2-3 sentences max) in plain everyday English with no jargon. ' +
            'Format like this example: "USD up (safe haven); EUR weak; JPY weak; AUD mixed. ' +
            'Drivers: Middle East tensions, oil near $100, fewer Fed cuts expected." ' +
            'State which currencies are up or down and the reasons given in the source data only.\n\n' +
            'SOURCE DATA FROM TRADING ECONOMICS:\n' + sources.join('\n');

        fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model:      'claude-sonnet-4-20250514',
                max_tokens: 200,
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
