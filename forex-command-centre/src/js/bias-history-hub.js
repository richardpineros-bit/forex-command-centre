/**
 * bias-history-hub.js — FCC Intelligence Hub
 * Displays bias history, event log, and currency timeline from /bias-history endpoint.
 * v1.0.0
 */

(function() {
    'use strict';

    var BIAS_HISTORY_URL = 'https://api.pineros.club/bias-history';
    var CURRENCIES = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'];
    var _data = null;
    var _filtered = { currency: '', result: '' };

    // ── Bootstrap ───────────────────────────────────────────────────────────
    function init() {
        var tab = document.getElementById('tab-intel');
        if (!tab) return;
        renderShell();
        loadData();
    }

    function loadData() {
        setLoading(true);
        fetch(BIAS_HISTORY_URL)
            .then(function(r) { return r.json(); })
            .then(function(d) {
                _data = d;
                renderAll();
                setLoading(false);
            })
            .catch(function(e) {
                console.error('[BiasHub] fetch failed:', e);
                setLoading(false);
                showError();
            });
    }

    // ── Shell layout ────────────────────────────────────────────────────────
    function renderShell() {
        var tab = document.getElementById('tab-intel');
        tab.innerHTML = [
            '<div class="intel-hub">',

            // Header
            '<div class="intel-header">',
            '<div class="intel-header-title">',
            '<span>&#x1F9E0;</span>',
            '<span>Pairs Intelligence Hub</span>',
            '</div>',
            '<button class="intel-refresh-btn" onclick="BiasHub.refresh()" title="Refresh data">&#x1F504; Refresh</button>',
            '</div>',

            // Loading / error placeholder
            '<div id="intel-status"></div>',

            // Section 1: Current Bias
            '<div class="intel-section" id="intel-section-bias">',
            '<div class="intel-section-header" onclick="BiasHub.toggleSection(\'bias\')">',
            '<span class="intel-section-icon">&#x1F4CA;</span>',
            '<span class="intel-section-title">Current Currency Bias</span>',
            '<span class="intel-section-toggle" id="intel-toggle-bias">&#x25BC;</span>',
            '</div>',
            '<div class="intel-section-body" id="intel-body-bias">',
            '<div id="intel-bias-content"><div class="intel-loading">Loading...</div></div>',
            '</div>',
            '</div>',

            // Section 2: Bias Timeline
            '<div class="intel-section" id="intel-section-timeline">',
            '<div class="intel-section-header" onclick="BiasHub.toggleSection(\'timeline\')">',
            '<span class="intel-section-icon">&#x1F4C5;</span>',
            '<span class="intel-section-title">Weekly Bias Timeline</span>',
            '<span class="intel-section-toggle" id="intel-toggle-timeline">&#x25BC;</span>',
            '</div>',
            '<div class="intel-section-body" id="intel-body-timeline">',
            '<div id="intel-timeline-content"><div class="intel-loading">Loading...</div></div>',
            '</div>',
            '</div>',

            // Section 3: Event Log
            '<div class="intel-section" id="intel-section-events">',
            '<div class="intel-section-header" onclick="BiasHub.toggleSection(\'events\')">',
            '<span class="intel-section-icon">&#x1F4F0;</span>',
            '<span class="intel-section-title">Economic Event Log</span>',
            '<span class="intel-section-toggle" id="intel-toggle-events">&#x25BC;</span>',
            '</div>',
            '<div class="intel-section-body" id="intel-body-events">',
            '<div class="intel-event-filters">',
            '<select class="form-select intel-filter-select" id="intel-filter-currency" onchange="BiasHub.filterEvents()">',
            '<option value="">All Currencies</option>',
            CURRENCIES.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join(''),
            '</select>',
            '<select class="form-select intel-filter-select" id="intel-filter-result" onchange="BiasHub.filterEvents()">',
            '<option value="">All Results</option>',
            '<option value="BEAT">BEAT</option>',
            '<option value="MISS">MISS</option>',
            '<option value="INLINE">INLINE</option>',
            '</select>',
            '<select class="form-select intel-filter-select" id="intel-filter-impact" onchange="BiasHub.filterEvents()">',
            '<option value="">All Impact</option>',
            '<option value="High">High Only</option>',
            '<option value="Medium">Medium+</option>',
            '</select>',
            '<span class="intel-event-count" id="intel-event-count"></span>',
            '</div>',
            '<div id="intel-events-content"><div class="intel-loading">Loading...</div></div>',
            '</div>',
            '</div>',

            '</div>' // .intel-hub
        ].join('');
    }

    // ── Render all sections ─────────────────────────────────────────────────
    function renderAll() {
        if (!_data) return;
        renderCurrentBias();
        renderTimeline();
        renderEventLog();
    }

    // ── Section 1: Current Bias ─────────────────────────────────────────────
    function renderCurrentBias() {
        var container = document.getElementById('intel-bias-content');
        if (!container) return;

        var lb = _data.latest_bias || {};
        var lastUpdated = _data.last_updated ? new Date(_data.last_updated).toLocaleString() : 'Unknown';

        if (Object.keys(lb).length === 0) {
            container.innerHTML = '<div class="intel-empty">No bias data yet — scraper needs more event results.</div>';
            return;
        }

        var html = ['<div class="intel-bias-meta">Last updated: ' + lastUpdated + '</div>'];
        html.push('<div class="intel-bias-grid">');

        CURRENCIES.forEach(function(cur) {
            var d = lb[cur];
            if (!d) {
                html.push(biasCard(cur, null));
            } else {
                html.push(biasCard(cur, d));
            }
        });

        html.push('</div>');
        container.innerHTML = html.join('');
    }

    function biasCard(currency, d) {
        if (!d) {
            return [
                '<div class="intel-bias-card intel-bias-neutral">',
                '<div class="intel-bias-currency">' + currency + '</div>',
                '<div class="intel-bias-label">NEUTRAL</div>',
                '<div class="intel-bias-score">No data</div>',
                '</div>'
            ].join('');
        }
        var cls = biasCls(d.bias);
        var arrow = biasArrow(d.bias);
        var barWidth = Math.min(100, Math.abs(d.score) / 6 * 100);
        return [
            '<div class="intel-bias-card ' + cls + '">',
            '<div class="intel-bias-currency">' + currency + '</div>',
            '<div class="intel-bias-label">' + arrow + ' ' + d.bias.replace('STRONGLY_','') + '</div>',
            '<div class="intel-bias-bar-wrap"><div class="intel-bias-bar" style="width:' + barWidth + '%"></div></div>',
            '<div class="intel-bias-meta-row">',
            '<span>Score: ' + (d.score > 0 ? '+' : '') + d.score + '</span>',
            '<span>' + d.confidence + '</span>',
            '<span>' + d.event_count + ' events</span>',
            '</div>',
            '</div>'
        ].join('');
    }

    function biasCls(bias) {
        if (!bias) return 'intel-bias-neutral';
        if (bias.indexOf('BULLISH') >= 0) return 'intel-bias-bull';
        if (bias.indexOf('BEARISH') >= 0) return 'intel-bias-bear';
        return 'intel-bias-neutral';
    }

    function biasArrow(bias) {
        if (!bias) return '\u25CF';
        if (bias.indexOf('STRONGLY_BULLISH') >= 0) return '\u25B2\u25B2';
        if (bias.indexOf('BULLISH') >= 0) return '\u25B2';
        if (bias.indexOf('STRONGLY_BEARISH') >= 0) return '\u25BC\u25BC';
        if (bias.indexOf('BEARISH') >= 0) return '\u25BC';
        return '\u25CF';
    }

    // ── Section 2: Timeline ─────────────────────────────────────────────────
    function renderTimeline() {
        var container = document.getElementById('intel-timeline-content');
        if (!container) return;

        var runs = (_data.runs || []).slice().reverse(); // newest first
        if (runs.length === 0) {
            container.innerHTML = '<div class="intel-empty">No runs yet.</div>';
            return;
        }

        // Build week labels
        var weekLabels = runs.map(function(r) {
            var d = new Date(r.timestamp);
            return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
        });

        var html = ['<div class="intel-timeline-wrap"><table class="intel-timeline-table">'];
        html.push('<thead><tr><th class="intel-tl-cur">Currency</th>');
        weekLabels.forEach(function(lbl, i) {
            var run = runs[i];
            var suffix = run.backfill ? ' <span class="intel-tl-backfill">BF</span>' : '';
            html.push('<th>' + lbl + suffix + '</th>');
        });
        html.push('</tr></thead><tbody>');

        CURRENCIES.forEach(function(cur) {
            html.push('<tr><td class="intel-tl-cur">' + cur + '</td>');
            runs.forEach(function(run) {
                var cb = (run.currency_bias || {})[cur];
                if (!cb) {
                    html.push('<td class="intel-tl-cell intel-tl-none">—</td>');
                } else {
                    var cls = biasCls(cb.bias);
                    var arrow = biasArrow(cb.bias);
                    var score = (cb.score > 0 ? '+' : '') + cb.score;
                    html.push('<td class="intel-tl-cell ' + cls + '" title="' + cb.bias + ' (' + score + ')">' + arrow + '<br><small>' + score + '</small></td>');
                }
            });
            html.push('</tr>');
        });

        html.push('</tbody></table></div>');
        container.innerHTML = html.join('');
    }

    // ── Section 3: Event Log ────────────────────────────────────────────────
    function renderEventLog() {
        _filtered.currency = (document.getElementById('intel-filter-currency') || {}).value || '';
        _filtered.result   = (document.getElementById('intel-filter-result')   || {}).value || '';
        _filtered.impact   = (document.getElementById('intel-filter-impact')   || {}).value || '';

        var container = document.getElementById('intel-events-content');
        var countEl   = document.getElementById('intel-event-count');
        if (!container) return;

        // Collect all events across all runs, dedupe by id
        var seen = {};
        var events = [];
        (_data.runs || []).forEach(function(run) {
            (run.event_results || []).forEach(function(e) {
                if (!seen[e.id]) {
                    seen[e.id] = true;
                    events.push(e);
                }
            });
        });

        // Sort newest first
        events.sort(function(a, b) {
            return (b.datetime_utc || '').localeCompare(a.datetime_utc || '');
        });

        // Filter
        var filtered = events.filter(function(e) {
            if (_filtered.currency && e.currency !== _filtered.currency) return false;
            if (_filtered.result   && e.result   !== _filtered.result)   return false;
            if (_filtered.impact === 'High'   && e.impact !== 'High')    return false;
            if (_filtered.impact === 'Medium' && e.impact === 'Low')     return false;
            return true;
        });

        if (countEl) countEl.textContent = filtered.length + ' events';

        if (filtered.length === 0) {
            container.innerHTML = '<div class="intel-empty">No events match the current filters.</div>';
            return;
        }

        var html = ['<div class="intel-event-table-wrap"><table class="intel-event-table">'];
        html.push('<thead><tr>');
        html.push('<th>Date</th><th>Time UTC</th><th>Currency</th><th>Impact</th><th>Event</th><th>Actual</th><th>Forecast</th><th>Result</th>');
        html.push('</tr></thead><tbody>');

        filtered.forEach(function(e) {
            var dt  = e.datetime_utc ? e.datetime_utc.substring(0,10) : '—';
            var tm  = e.datetime_utc ? e.datetime_utc.substring(11,16) : '—';
            var resCls = resultCls(e.result);
            var impCls = impactCls(e.impact);
            html.push('<tr>');
            html.push('<td class="intel-ev-date">' + dt + '</td>');
            html.push('<td class="intel-ev-time">' + tm + '</td>');
            html.push('<td class="intel-ev-cur">' + e.currency + '</td>');
            html.push('<td><span class="intel-impact ' + impCls + '">' + (e.impact || '—') + '</span></td>');
            html.push('<td class="intel-ev-title">' + (e.title || '—') + '</td>');
            html.push('<td class="intel-ev-actual">' + (e.actual || '—') + '</td>');
            html.push('<td class="intel-ev-forecast">' + (e.forecast || '—') + '</td>');
            html.push('<td><span class="intel-result ' + resCls + '">' + (e.result || '—') + '</span></td>');
            html.push('</tr>');
        });

        html.push('</tbody></table></div>');
        container.innerHTML = html.join('');
    }

    function resultCls(r) {
        if (r === 'BEAT')   return 'intel-result-beat';
        if (r === 'MISS')   return 'intel-result-miss';
        if (r === 'INLINE') return 'intel-result-inline';
        return '';
    }

    function impactCls(i) {
        if (i === 'High')   return 'intel-impact-high';
        if (i === 'Medium') return 'intel-impact-med';
        return 'intel-impact-low';
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function setLoading(on) {
        var el = document.getElementById('intel-status');
        if (!el) return;
        el.innerHTML = on ? '<div class="intel-loading intel-loading-full">&#x1F504; Loading intelligence data...</div>' : '';
    }

    function showError() {
        var el = document.getElementById('intel-status');
        if (el) el.innerHTML = '<div class="intel-error">&#x26A0; Failed to load bias history. Check API connection.</div>';
    }

    // ── Public API ───────────────────────────────────────────────────────────
    window.BiasHub = {
        init: init,
        refresh: function() { loadData(); },
        filterEvents: renderEventLog,
        toggleSection: function(name) {
            var body   = document.getElementById('intel-body-' + name);
            var toggle = document.getElementById('intel-toggle-' + name);
            if (!body) return;
            var isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : '';
            if (toggle) toggle.innerHTML = isOpen ? '&#x25B6;' : '&#x25BC;';
        }
    };

    // Auto-init when Intel tab is first shown
    document.addEventListener('DOMContentLoaded', function() {
        // Hook into showTab
        var origShowTab = window.showTab;
        if (origShowTab) {
            window.showTab = function(tab) {
                origShowTab(tab);
                if (tab === 'intel' && !_data) {
                    init();
                }
            };
        }
        var origMobile = window.mobileShowTab;
        if (origMobile) {
            window.mobileShowTab = function(tab) {
                origMobile(tab);
                if (tab === 'intel' && !_data) {
                    init();
                }
            };
        }
    });

})();
