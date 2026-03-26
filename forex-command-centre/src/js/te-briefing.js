// ============================================
// TE BRIEFING MODULE v1.0.0
// Trading Economics macro briefing card for FCC dashboard
// Fetches /te-snapshot, renders FX paragraph + stores window.TE_SNAPSHOT_DATA
// Bond auctions are consumed by dashboard-event-widget.js
// Refreshes every 30 minutes (same cadence as news-bias-engine.js)
// ============================================

(function() {
    'use strict';

    var API_BASE = (typeof window.API_BASE !== 'undefined') ? window.API_BASE : 'https://api.pineros.club';
    var REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    window.TEBriefing = {
        init: init,
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
                renderFXCard(data);
                // Notify event widget to re-render (picks up bond auctions)
                if (window.DashboardEventWidget && window.DashboardEventWidget.updateEventDisplay) {
                    window.DashboardEventWidget.updateEventDisplay();
                }
            })
            .catch(function(e) {
                renderFXCard(null, 'TE snapshot unavailable (' + e.message + ')');
            });
    }

    // ── FX Snapshot paragraph card ─────────────────────────────────────────

    function renderFXCard(data, errorMsg) {
        var container = document.getElementById('te-briefing-container');
        if (!container) return;

        // Error state
        if (errorMsg || !data || data.ok === false) {
            var msg = errorMsg || (data && data.error) || 'TE snapshot not available';
            container.innerHTML =
                '<div style="padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-color);' +
                'border-left:3px solid #6c757d;border-radius:var(--radius-sm);font-size:0.78rem;' +
                'color:var(--text-muted);margin-bottom:16px;">&#x1F310; <strong>Macro Briefing</strong> &mdash; ' +
                msg + '</div>';
            return;
        }

        // Staleness banner
        var staleHtml = '';
        if (data.stale) {
            var lastUp = data.last_updated ? new Date(data.last_updated).toLocaleString('en-AU') : 'unknown';
            staleHtml =
                '<div style="padding:6px 12px;background:#fff3cd;border-left:3px solid #ffc107;' +
                'font-size:0.75rem;color:#856404;">&#x26A0; Stale data &mdash; last updated ' + lastUp +
                '. Check scraper cron.</div>';
        }

        // Timestamp
        var ts = data.last_updated
            ? new Date(data.last_updated).toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit'
              })
            : 'unknown';

        // FX snapshot paragraph
        var fxParagraph = buildFXParagraph(data.fx_snapshot || {});

        // High-impact summary counts
        var summary = data.summary || {};
        var highCount = summary.high_impact || 0;
        var totalCount = summary.total_events || 0;

        var html =
            '<div class="card" style="margin-bottom:16px;">' +
            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span class="card-title">&#x1F310; Macro Briefing</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">TE &bull; ' + ts + '</span>' +
            '</div>' +
            (staleHtml ? '<div style="border-bottom:1px solid var(--border-color);">' + staleHtml + '</div>' : '') +
            '<div class="card-body" style="padding:12px 16px;">';

        // FX paragraph
        if (fxParagraph) {
            html +=
                '<p style="font-size:0.82rem;line-height:1.6;color:var(--text-secondary);margin:0 0 10px 0;">' +
                fxParagraph + '</p>';
        }

        // Event count pill row
        html +=
            '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.72rem;">' +
            '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);' +
            'padding:2px 8px;border-radius:12px;color:var(--text-muted);">' +
            totalCount + ' G10 events today</span>';

        if (highCount > 0) {
            html +=
                '<span style="background:#f8d7da;border:1px solid #f5c6cb;' +
                'padding:2px 8px;border-radius:12px;color:#721c24;">' +
                '&#x26A0; ' + highCount + ' High impact</span>';
        }

        var bondCount = (data.bond_auctions || []).length;
        if (bondCount > 0) {
            html +=
                '<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);' +
                'padding:2px 8px;border-radius:12px;color:var(--text-muted);">' +
                bondCount + ' bond auctions</span>';
        }

        html += '</div></div></div>';

        container.innerHTML = html;
    }

    function buildFXParagraph(fx) {
        // 7 pairs in display order
        var PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCAD','USDCHF'];
        var parts = [];

        PAIRS.forEach(function(pair) {
            var d = fx[pair];
            if (!d || !d.rate) return;
            var rate = d.rate;
            var pct = d.daily_pct || null;
            var pctStr = pct ? ' (' + pct + ')' : '';
            parts.push('<strong>' + pair + '</strong> ' + rate + pctStr);
        });

        if (parts.length === 0) return null;
        return parts.join(' &nbsp;&bull;&nbsp; ');
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { init(); }, 1200);
    });

})();
