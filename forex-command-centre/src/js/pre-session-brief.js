// ============================================
// PRE-SESSION BRIEF MODULE v1.0.0
// Pinned card at top of dashboard.
// Auto-generates at session boundaries (AEST):
//   Tokyo:  09:00 (UTC 23:00 prev day)
//   London: 17:00 (UTC 07:00)
//   NY:     22:00 (UTC 12:00)
// Shows: current session, pair bias, upcoming
// high-impact events, clean vs conflicted pairs.
// Calls Claude API to generate plain-English brief
// from real FCC data only.
// ============================================

(function() {
    'use strict';

    var API_BASE         = (typeof window.API_BASE !== 'undefined') ? window.API_BASE : 'https://api.pineros.club';
    var REFRESH_INTERVAL = 15 * 60 * 1000; // check every 15 min
    var lastSessionKey   = null;            // track which session we briefed

    window.PreSessionBrief = { init: init };

    // ── Session detection (AEST = UTC+10) ─────────────────────────────────
    // Tokyo:  09:00-17:00 AEST = 23:00-07:00 UTC
    // London: 17:00-02:00 AEST = 07:00-16:00 UTC
    // NY:     22:00-07:00 AEST = 12:00-21:00 UTC

    function getCurrentSession() {
        var utcH = new Date().getUTCHours();
        if (utcH >= 23 || utcH < 7)  return { name: 'Tokyo',  emoji: '&#x1F1EF;&#x1F1F5;', pairs: ['USDJPY','AUDJPY','AUDUSD','NZDJPY','NZDUSD'] };
        if (utcH >= 7  && utcH < 16) return { name: 'London', emoji: '&#x1F1EC;&#x1F1E7;', pairs: ['EURUSD','GBPUSD','EURGBP','GBPJPY','USDCHF'] };
        if (utcH >= 12 && utcH < 21) return { name: 'New York', emoji: '&#x1F1FA;&#x1F1F8;', pairs: ['EURUSD','GBPUSD','USDCAD','USDCHF','USDJPY'] };
        return null;
    }

    function getSessionKey() {
        var s = getCurrentSession();
        if (!s) return null;
        var d = new Date();
        return s.name + '_' + d.toISOString().slice(0, 10);
    }

    // ── Init & polling ────────────────────────────────────────────────────

    function init() {
        renderIfNeeded();
        setInterval(renderIfNeeded, REFRESH_INTERVAL);
    }

    function renderIfNeeded() {
        var key = getSessionKey();
        if (!key) {
            // Off-session — hide card
            var c = document.getElementById('pre-session-brief-container');
            if (c) c.innerHTML = '';
            lastSessionKey = null;
            return;
        }
        // Always render (re-renders each 15 min with fresh data)
        renderBrief();
        lastSessionKey = key;
    }

    // ── Data gathering ────────────────────────────────────────────────────

    function gatherData(callback) {
        var result = {
            session:   getCurrentSession(),
            bias:      null,
            calendar:  null,
            te:        window.TE_SNAPSHOT_DATA || null,
        };

        var pending = 2;
        function done() { if (--pending === 0) callback(result); }

        // Bias data
        fetch(API_BASE + '/bias-history/latest')
            .then(function(r) { return r.json(); })
            .then(function(d) { result.bias = d; done(); })
            .catch(function()  { done(); });

        // Calendar (FF events)
        var cal = window.LIVE_CALENDAR_DATA;
        if (cal && cal.events) {
            result.calendar = cal;
            done();
        } else {
            fetch(API_BASE + '/state')
                .then(function(r) { return r.json(); })
                .then(function() { result.calendar = window.LIVE_CALENDAR_DATA || null; done(); })
                .catch(function() { done(); });
        }
    }

    // ── Render ────────────────────────────────────────────────────────────

    function renderBrief() {
        var container = document.getElementById('pre-session-brief-container');
        if (!container) return;

        var session = getCurrentSession();
        if (!session) { container.innerHTML = ''; return; }

        // Show loading shell immediately
        container.innerHTML = buildShell(session);

        gatherData(function(data) {
            var briefId = 'psb-brief-text';
            populateStatic(data);
            generateBrief(data, briefId);
        });
    }

    function buildShell(session) {
        var now = new Date().toLocaleString('en-AU', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit'
        });
        return (
            '<div class="card" style="margin-bottom:16px;border-left:3px solid var(--color-info);">' +
            '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span class="card-title">' + session.emoji + ' ' + session.name + ' Session Brief</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + now + '</span>' +
            '</div>' +
            '<div class="card-body" style="padding:12px 16px;">' +

            // AI brief paragraph
            '<div id="psb-brief-text" style="font-size:0.85rem;line-height:1.65;color:var(--text-secondary);margin-bottom:12px;min-height:36px;">' +
            '<span style="color:var(--text-muted);font-style:italic;font-size:0.78rem;">&#x23F3; Preparing brief...</span>' +
            '</div>' +

            // Static data rows
            '<div id="psb-bias-row"   style="margin-bottom:8px;"></div>' +
            '<div id="psb-events-row" style="margin-bottom:8px;"></div>' +
            '<div id="psb-pairs-row"  style=""></div>' +

            '</div></div>'
        );
    }

    function populateStatic(data) {
        renderBiasRow(data);
        renderEventsRow(data);
        renderPairsRow(data);
    }

    // ── Bias row ──────────────────────────────────────────────────────────

    function renderBiasRow(data) {
        var el = document.getElementById('psb-bias-row');
        if (!el) return;
        var bias = data.bias && data.bias.currency_bias;
        if (!bias || Object.keys(bias).length === 0) {
            el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">Bias data unavailable</span>';
            return;
        }
        var ARROW = { STRONGLY_BULLISH: '&#x2B06;&#x2B06;', BULLISH: '&#x2B06;', NEUTRAL: '&#x27A1;', BEARISH: '&#x2B07;', STRONGLY_BEARISH: '&#x2B07;&#x2B07;' };
        var COLOUR = { STRONGLY_BULLISH: '#28a745', BULLISH: '#28a745', NEUTRAL: '#6c757d', BEARISH: '#dc3545', STRONGLY_BEARISH: '#dc3545' };
        var CURS = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'];
        var chips = CURS.map(function(cur) {
            var d = bias[cur];
            if (!d) return '<span style="font-size:0.72rem;padding:2px 6px;border-radius:3px;background:var(--bg-tertiary);color:var(--text-muted);">' + cur + ' &#x2014;</span>';
            var col = COLOUR[d.bias] || '#6c757d';
            var arr = ARROW[d.bias]  || '&#x27A1;';
            return '<span style="font-size:0.72rem;padding:2px 6px;border-radius:3px;background:var(--bg-tertiary);color:' + col + ';font-weight:600;">' + cur + ' ' + arr + '</span>';
        }).join(' ');
        el.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;">News Bias</div>' + chips;
    }

    // ── Upcoming events row ───────────────────────────────────────────────

    function renderEventsRow(data) {
        var el = document.getElementById('psb-events-row');
        if (!el) return;
        var events = [];

        // From FF calendar
        if (data.calendar && data.calendar.events) {
            var now = new Date();
            data.calendar.events.forEach(function(e) {
                if (e.impact_level !== 3) return;
                if (!e.datetime_utc) return;
                var t = new Date(e.datetime_utc);
                if (t > now && (t - now) < 12 * 60 * 60 * 1000) {
                    events.push({ currency: e.currency, title: e.title, time: t, forecast: e.forecast });
                }
            });
        }

        // From TE calendar
        if (data.te && data.te.today_events) {
            var now2 = new Date();
            data.te.today_events.forEach(function(e) {
                if (!e.time_et) return;
                events.push({ currency: e.currency, title: e.event, time: null, timeStr: e.time_et, forecast: e.forecast });
            });
        }

        if (events.length === 0) {
            el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">&#x2714; No high-impact events in next 12h</span>';
            return;
        }

        events = events.slice(0, 5);
        var chips = events.map(function(e) {
            var timeStr = e.time ? e.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : (e.timeStr || '');
            return '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:#f8d7da;color:#721c24;border:1px solid #f5c6cb;">' +
                e.currency + ' ' + e.title + (timeStr ? ' ' + timeStr : '') + '</span>';
        }).join(' ');

        el.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;">Upcoming High Impact</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + chips + '</div>';
    }

    // ── Clean vs conflicted pairs ─────────────────────────────────────────

    function renderPairsRow(data) {
        var el = document.getElementById('psb-pairs-row');
        if (!el) return;
        var verdicts = data.bias && data.bias.pair_verdicts;
        var session  = data.session;
        if (!verdicts || !session) { el.innerHTML = ''; return; }

        var clean = [], conflicted = [], neutral = [];
        session.pairs.forEach(function(pair) {
            var v = verdicts[pair];
            if (!v) return;
            if (v.direction === 'BULLISH' || v.direction === 'BEARISH') {
                if (v.strength === 'STRONG' || v.strength === 'MODERATE') clean.push(pair + ' ' + (v.direction === 'BULLISH' ? '&#x2B06;' : '&#x2B07;'));
                else neutral.push(pair);
            } else {
                conflicted.push(pair);
            }
        });

        var html = '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;">Session Pairs</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;">';

        clean.forEach(function(p) {
            html += '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:#d4edda;color:#155724;border:1px solid #c3e6cb;">' + p + '</span>';
        });
        neutral.forEach(function(p) {
            html += '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:var(--bg-tertiary);color:var(--text-muted);border:1px solid var(--border-color);">' + p + '</span>';
        });
        conflicted.forEach(function(p) {
            html += '<span style="font-size:0.72rem;padding:2px 7px;border-radius:3px;background:#fff3cd;color:#856404;border:1px solid #ffeeba);">' + p + ' &#x26A0;</span>';
        });

        html += '</div>';
        el.innerHTML = html;
    }

    // ── AI brief paragraph ────────────────────────────────────────────────

    function generateBrief(data, targetId) {
        var session  = data.session;
        var bias     = data.bias && data.bias.currency_bias;
        var verdicts = data.bias && data.bias.pair_verdicts;
        var lines    = [];

        // Session context
        lines.push('SESSION: ' + session.name);

        // Currency bias
        if (bias) {
            var CURS = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF'];
            var blines = CURS.map(function(c) {
                var d = bias[c];
                return d ? c + ': ' + d.bias + ' (score ' + d.score + ', ' + d.event_count + ' events)' : null;
            }).filter(Boolean);
            if (blines.length) lines.push('CURRENCY BIAS:\n' + blines.join('\n'));
        }

        // Session pair verdicts
        if (verdicts && session.pairs) {
            var vlines = session.pairs.map(function(pair) {
                var v = verdicts[pair];
                return v ? pair + ': ' + v.direction + ' ' + v.strength + ' (net ' + v.net_score + ')' : null;
            }).filter(Boolean);
            if (vlines.length) lines.push('SESSION PAIRS:\n' + vlines.join('\n'));
        }

        // Today's actuals with surprise
        if (data.te && data.te.today_events) {
            var actuals = data.te.today_events
                .filter(function(e) { return e.actual; })
                .map(function(e) {
                    var s = e.currency + ' | ' + e.event + ' | actual: ' + e.actual;
                    if (e.forecast) s += ' vs forecast: ' + e.forecast;
                    if (e.surprise_dir) {
                        s += ' | ' + e.surprise_dir;
                        if (e.surprise_pct) s += ' by ' + Math.abs(e.surprise_pct).toFixed(1) + '%';
                    }
                    return s;
                });
            if (actuals.length) lines.push('ECONOMIC RELEASES TODAY:\n' + actuals.join('\n'));
        }

        // Upcoming high-impact
        if (data.calendar && data.calendar.events) {
            var now = new Date();
            var upcoming = data.calendar.events
                .filter(function(e) {
                    if (e.impact_level !== 3 || !e.datetime_utc) return false;
                    var t = new Date(e.datetime_utc);
                    return t > now && (t - now) < 12 * 60 * 60 * 1000;
                })
                .map(function(e) { return e.currency + ' | ' + e.title + (e.forecast ? ' | forecast: ' + e.forecast : ''); });
            if (upcoming.length) lines.push('UPCOMING HIGH IMPACT (next 12h):\n' + upcoming.join('\n'));
        }

        if (lines.length <= 1) {
            setEl(targetId, 'Awaiting data — check scraper and alert server.');
            return;
        }

        var prompt =
            'You are writing a pre-session brief for a retail forex trader about to start the ' + session.name + ' session.\n' +
            'Use ONLY the data provided below. Do NOT add any information not in the data.\n' +
            'Write 2-3 sentences in plain everyday English. Zero jargon.\n' +
            'Cover: which currencies have bias direction, which session pairs look cleanest, and any key events coming up.\n' +
            'Example style: "USD bias is bullish after strong jobs data. USDJPY and AUDUSD show clear direction. Watch for UK CPI at 9:30am."\n\n' +
            lines.join('\n\n');

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
                : 'Brief unavailable.';
            setEl(targetId, text);
        })
        .catch(function(e) {
            setEl(targetId, 'Brief unavailable: ' + e.message);
        });
    }

    function setEl(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { init(); }, 800);
    });

})();
