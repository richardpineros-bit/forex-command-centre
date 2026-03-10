/**
 * Daily Context Module - Forex Command Centre v4.0.0
 * 
 * PLAIN ENGLISH REBUILD
 * - All labels written in conversational language
 * - Technical terms shown in small text for learning
 * - Sessions merged in (no separate regime tab forms)
 * - News check merged in (no triple-checking)
 * - Same public API contract as v3.x for backward compatibility
 *
 * Principle: "Fail-closed; missing regime/session/context = no trade."
 * Principle: "The system assumes the trader will eventually act irrationally; the system stops them."
 * Principle: "The app IS the teacher. No cheat sheets needed."
 */

window.DailyContext = (function () {
    'use strict';

    // ========================================
    // CONSTANTS
    // ========================================

    var STORAGE_KEY = 'fcc_daily_context';

    var ICONS = {
        lock: '&#x1F512;',
        unlock: '&#x1F513;',
        warning: '&#x26A0;',
        check: '&#x2714;',
        cross: '&#x2716;',
        clock: '&#x23F0;',
        chart: '&#x1F4CA;',
        clipboard: '&#x1F4CB;',
        target: '&#x1F3AF;',
        shield: '&#x1F6E1;',
        stop: '&#x1F6D1;',
        eye: '&#x1F441;',
        pencil: '&#x270F;',
        arrow: '&#x27A1;',
        sun: '&#x2600;',
        cloud: '&#x2601;',
        storm: '&#x26C8;'
    };

    // ----------------------------------------
    // REGIME: Plain English first, technical term in brackets
    // ----------------------------------------
    var REGIMES = {
        expansion: {
            label: 'Trending strongly',
            technical: 'Expansion',
            permission: 'FULL',
            desc: 'Price is moving clearly in one direction. Good momentum, making progress. This is your best condition to trade.',
            hint: 'Look for: higher highs + higher lows (up) or lower highs + lower lows (down) on 4H chart'
        },
        compression: {
            label: 'Stuck in a range',
            technical: 'Compression',
            permission: 'CONDITIONAL',
            desc: 'Price is bouncing between two levels, getting squeezed tighter. A breakout is building but you don\'t know which way yet.',
            hint: 'Look for: price ping-ponging between support and resistance, candles getting smaller'
        },
        distribution: {
            label: 'Trend losing steam',
            technical: 'Distribution',
            permission: 'CONDITIONAL',
            desc: 'The move is getting tired. Big players may be taking profits. Still looks like a trend but the energy is fading.',
            hint: 'Look for: smaller pushes in trend direction, bigger pullbacks, wicks appearing at highs/lows'
        },
        rotation: {
            label: 'Choppy mess, no direction',
            technical: 'Rotation',
            permission: 'CONDITIONAL',
            desc: 'Price is going nowhere. No trend, no clean range. This is the most dangerous condition \u2014 sit on your hands.',
            hint: 'Look for: overlapping candles, no clear highs/lows pattern, random-looking movement'
        },
        transition: {
            label: 'Market is changing behaviour',
            technical: 'Transition',
            permission: 'CONDITIONAL',
            desc: 'The old pattern is ending and something new is forming, but it\'s not clear yet. High uncertainty.',
            hint: 'Look for: trend that was working suddenly stalls, structure shifts, mixed signals across timeframes'
        },
        unclear: {
            label: 'I genuinely can\'t tell',
            technical: 'Unclear \u2192 Stand Down',
            permission: 'STAND_DOWN',
            desc: 'You don\'t know what the market is doing. That\'s OK \u2014 admitting it protects your money. No trading today.',
            hint: 'If you\'ve been staring for 5 minutes and can\'t decide, it\'s Unclear. Lock it and walk away.'
        }
    };

    // ----------------------------------------
    // VOLATILITY: One unified system (replaces 3 separate assessments)
    // ----------------------------------------
    var VOLATILITY_STATES = {
        low: {
            label: 'Quiet \u2014 not much movement',
            technical: 'Low / Compressed',
            desc: 'Candles are small. Not much happening yet. If you have a clear direction, this can be a good time to enter cheaply.'
        },
        normal: {
            label: 'Normal \u2014 healthy movement',
            technical: 'Normal / Stable',
            desc: 'Standard market conditions. Candles are a reasonable size. Good for trading.'
        },
        elevated: {
            label: 'Big moves already happening',
            technical: 'Elevated / Expanding',
            desc: 'The move is already underway. You might be late. If you trade, use smaller position size.'
        },
        spike: {
            label: 'Extreme \u2014 something major is happening',
            technical: 'Spike \u2192 Stand Down',
            desc: 'Unusually large candles, rapid price changes. News event or panic. Do not trade. Wait for it to settle.'
        }
    };

    // ----------------------------------------
    // NEWS STATUS: Merged from 10-point panel (eliminates triple-check)
    // ----------------------------------------
    var NEWS_STATES = {
        clear: {
            label: 'No major news today',
            desc: 'No high-impact events (NFP, CPI, rate decisions) within your trading window.'
        },
        later: {
            label: 'News coming, but not soon',
            desc: 'High-impact event scheduled but more than 2 hours away. Trade normally but close positions before the event.'
        },
        soon: {
            label: 'Major news within 2 hours \u2014 caution',
            desc: 'High-impact event within 2 hours. No new trades. Manage existing positions only.'
        },
        imminent: {
            label: 'Major news imminent \u2014 stand down',
            desc: 'High-impact event about to happen or just happened. Markets will be volatile and unpredictable. No trading.'
        }
    };

    // ----------------------------------------
    // PRIMARY RISK: Simplified labels
    // ----------------------------------------
    var PRIMARY_RISKS = {
        none: {
            label: 'Nothing specific \u2014 normal conditions',
            technical: 'None Identified',
            desc: 'No particular risk flagged. Proceed normally.'
        },
        exhaustion: {
            label: 'The move looks tired \u2014 might reverse',
            technical: 'Exhaustion',
            desc: 'Current trend may be running out of energy. Watch for reversal signals.'
        },
        liquidity_sweep: {
            label: 'Expect stop hunts before the real move',
            technical: 'Liquidity Sweep',
            desc: 'Price will likely fake out above/below obvious levels to trigger stops before moving in the real direction.'
        },
        news_event: {
            label: 'News event could cause sharp moves',
            technical: 'News Event',
            desc: 'Economic data release during your session. Expect sudden reversals or gaps.'
        },
        trend_reversal: {
            label: 'Trend might be reversing',
            technical: 'Trend Reversal',
            desc: 'Signs that the dominant trend is shifting. Higher timeframes showing divergence or structure breaks.'
        },
        range_expansion: {
            label: 'Breaking out of a range \u2014 could be violent',
            technical: 'Range Expansion',
            desc: 'Market breaking out of established boundaries. Direction may be aggressive but temporary.'
        },
        correlation_breakdown: {
            label: 'Pairs that usually move together are diverging',
            technical: 'Correlation Breakdown',
            desc: 'Related currency pairs are moving in unexpected ways. Signals uncertainty in the market.'
        }
    };

    // ----------------------------------------
    // SESSIONS: Simplified multi-select
    // ----------------------------------------
    var SESSIONS = {
        tokyo:  { label: 'Tokyo',  time: '9am \u2013 6pm AEST',  icon: '&#x1F1EF;&#x1F1F5;' },
        london: { label: 'London', time: '5pm \u2013 2am AEST', icon: '&#x1F1EC;&#x1F1E7;' }
    };

    // ----------------------------------------
    // EXECUTION RULES: Plain English
    // ----------------------------------------
    var EXECUTION_RULES = [
        { id: 'pullbacks_only',    label: 'Only enter on pullbacks \u2014 no chasing price',        regimes: ['expansion'] },
        { id: 'reduced_size',      label: 'Smaller position sizes today',                            regimes: [] },
        { id: 'no_new_after',      label: 'No new trades after a set time',                          regimes: [] },
        { id: 'news_window',       label: 'Check calendar before every trade',                       regimes: [] },
        { id: 'breakouts_only',    label: 'Only trade breakouts \u2014 no fading moves',             regimes: ['compression'] },
        { id: 'observation_only',  label: 'Watch only \u2014 no trades at all',                      regimes: ['unclear', 'rotation'] },
        { id: 'expect_sweep',      label: 'Wait for fakeouts to finish before entering',             regimes: [] }
    ];

    // ----------------------------------------
    // PERMISSION LEVELS
    // ----------------------------------------
    var PERMISSION_LEVELS = {
        FULL:        { order: 0, label: 'FULL',        labelPlain: 'All clear \u2014 trade normally',         css: 'permission-full',        desc: 'All playbooks available. Standard risk.' },
        CONDITIONAL: { order: 1, label: 'CONDITIONAL', labelPlain: 'Caution \u2014 reduced options',          css: 'permission-conditional', desc: 'Fewer playbooks. Smaller positions. Extra care required.' },
        STAND_DOWN:  { order: 2, label: 'STAND_DOWN',  labelPlain: 'No trading \u2014 observation only',      css: 'permission-standdown',   desc: 'Do not trade. Watch, take notes, wait for tomorrow.' }
    };

    // ========================================
    // STATE
    // ========================================

    var _data = null;

    // ========================================
    // HELPERS
    // ========================================

    function isToday(dateStr) {
        if (!dateStr) return false;
        var d = new Date(dateStr);
        var now = new Date();
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
    }

    function nowISO() {
        return new Date().toISOString();
    }

    function dateKey() {
        var d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========================================
    // DATA PERSISTENCE
    // ========================================

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && isToday(parsed.lockedAt)) {
                    _data = parsed;
                    return _data;
                }
            }
        } catch (e) {
            console.warn('[DailyContext] Load error:', e);
        }
        _data = null;
        return null;
    }

    // v4.1.2: Load from server (cross-browser persistence)
    function loadFromServer() {
        if (typeof window.ServerStorage !== 'undefined' && window.ServerStorage.loadFromServer) {
            return window.ServerStorage.loadFromServer('daily-context').then(function(result) {
                if (result && result.success && result.data && isToday(result.data.lockedAt)) {
                    _data = result.data;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
                    console.log('[DailyContext] Loaded from server, synced to localStorage');
                    return result.data;
                }
                return null;
            }).catch(function(e) {
                console.warn('[DailyContext] Server load failed:', e);
                return null;
            });
        }
        return Promise.resolve(null);
    }

    function save(data) {
        _data = data;
        // Add timestamp for Daily Refresh Gate
        data.timestamp = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        saveToServer(data);
    }

    function saveToServer(data) {
        if (typeof window.ServerStorage !== 'undefined' && window.ServerStorage.saveToServer) {
            window.ServerStorage.saveToServer('daily-context', data).then(function(result) {
                if (result && result.success) {
                    console.log('[DailyContext] Saved to server');
                } else {
                    console.warn('[DailyContext] Server save failed:', result ? result.error : 'unknown');
                }
            }).catch(function (e) {
                console.warn('[DailyContext] Server save failed:', e);
            });
        }
    }

    // ========================================
    // PERMISSION CALCULATION
    // ========================================

    function calculatePermission(regime, volatility, newsStatus) {
        // Fail-closed: unclear, spike, or imminent news = STAND_DOWN
        if (regime === 'unclear' || volatility === 'spike' || newsStatus === 'imminent') {
            return 'STAND_DOWN';
        }

        // CONDITIONAL conditions
        if (['rotation', 'compression', 'distribution', 'transition'].indexOf(regime) !== -1 ||
            volatility === 'elevated' ||
            newsStatus === 'soon') {
            return 'CONDITIONAL';
        }

        return 'FULL';
    }

    function enforceMonotonic(newPermission) {
        var current = load();
        if (!current || !current.permission) return newPermission;

        var currentOrder = PERMISSION_LEVELS[current.permission].order;
        var newOrder = PERMISSION_LEVELS[newPermission].order;

        return newOrder >= currentOrder ? newPermission : current.permission;
    }

    // ========================================
    // FORM RENDERING
    // ========================================

    function renderForm(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var data = load();

        if (data && data.locked) {
            renderLockedView(container, data);
            return;
        }

        renderEditableForm(container);
    }

    function renderEditableForm(container) {

        // Build regime options
        var regimeOptions = '';
        Object.keys(REGIMES).forEach(function (key) {
            var r = REGIMES[key];
            regimeOptions += '<option value="' + key + '">' + r.label + '</option>';
        });

        // Build volatility options
        var volOptions = '';
        Object.keys(VOLATILITY_STATES).forEach(function (key) {
            var v = VOLATILITY_STATES[key];
            volOptions += '<option value="' + key + '">' + v.label + '</option>';
        });

        // Build news options
        var newsOptions = '';
        Object.keys(NEWS_STATES).forEach(function (key) {
            var n = NEWS_STATES[key];
            newsOptions += '<option value="' + key + '">' + n.label + '</option>';
        });

        // Build risk options
        var riskOptions = '';
        Object.keys(PRIMARY_RISKS).forEach(function (key) {
            var r = PRIMARY_RISKS[key];
            riskOptions += '<option value="' + key + '">' + r.label + '</option>';
        });

        // Build session checkboxes
        var sessionChecks = '';
        Object.keys(SESSIONS).forEach(function (key) {
            var s = SESSIONS[key];
            sessionChecks +=
                '<label class="dc-session-check">' +
                    '<input type="checkbox" id="dc-session-' + key + '" value="' + key + '" onchange="DailyContext.validateForm()">' +
                    '<span class="dc-session-label">' +
                        '<span class="dc-session-flag">' + s.icon + '</span>' +
                        '<span class="dc-session-name">' + s.label + '</span>' +
                        '<span class="dc-session-time">' + s.time + '</span>' +
                    '</span>' +
                '</label>';
        });

        // Build execution rules
        var rulesChecklist = '';
        EXECUTION_RULES.forEach(function (rule) {
            rulesChecklist +=
                '<label class="dc-rule-check">' +
                    '<input type="checkbox" id="dc-rule-' + rule.id + '" value="' + rule.id + '" onchange="DailyContext.validateForm()">' +
                    '<span>' + rule.label + '</span>' +
                '</label>';
        });

        var html =
            '<div class="dc-form">' +

                // Header
                '<div class="dc-form-header">' +
                    '<h3>' + ICONS.clipboard + ' Morning Briefing</h3>' +
                    '<p class="dc-form-subtitle">Answer these questions honestly before you look at any trades. This takes 2 minutes and decides what you\'re allowed to do today.</p>' +
                '</div>' +

                // Question 1: Regime
                '<div class="dc-question">' +
                    '<div class="dc-question-number">1</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">What is the market doing right now? <span class="dc-required">*</span></label>' +
                        '<p class="dc-help">Look at the 4H chart of your main pairs. What\'s the overall picture?</p>' +
                        '<select class="dc-select" id="dc-regime" onchange="DailyContext.onRegimeChange()">' +
                            '<option value="">Pick the best description...</option>' +
                            regimeOptions +
                        '</select>' +
                        '<div class="dc-field-desc" id="dc-regime-desc"></div>' +
                        '<div class="dc-field-hint" id="dc-regime-hint"></div>' +
                    '</div>' +
                '</div>' +

                // Question 2: Volatility
                '<div class="dc-question">' +
                    '<div class="dc-question-number">2</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">How much is the market moving? <span class="dc-required">*</span></label>' +
                        '<p class="dc-help">Look at candle sizes compared to recent days. Are they bigger, smaller, or normal?</p>' +
                        '<select class="dc-select" id="dc-volatility" onchange="DailyContext.onVolChange()">' +
                            '<option value="">Pick what matches...</option>' +
                            volOptions +
                        '</select>' +
                        '<div class="dc-field-desc" id="dc-vol-desc"></div>' +
                    '</div>' +
                '</div>' +

                // Question 3: News
                '<div class="dc-question">' +
                    '<div class="dc-question-number">3</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">Any high-impact news today? <span class="dc-required">*</span></label>' +
                        '<p class="dc-help">Check ForexFactory or the calendar tab. Look for red-flag events (NFP, CPI, rate decisions).</p>' +
                        '<select class="dc-select" id="dc-news" onchange="DailyContext.onNewsChange()">' +
                            '<option value="">Check your calendar...</option>' +
                            newsOptions +
                        '</select>' +
                        '<div class="dc-field-desc" id="dc-news-desc"></div>' +
                    '</div>' +
                '</div>' +

                // Question 4: Primary Risk
                '<div class="dc-question">' +
                    '<div class="dc-question-number">4</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">What\'s the biggest risk today? <span class="dc-required">*</span></label>' +
                        '<p class="dc-help">What could go wrong with your trades today? Pick the most likely problem.</p>' +
                        '<select class="dc-select" id="dc-risk" onchange="DailyContext.validateForm()">' +
                            '<option value="">Pick the most likely risk...</option>' +
                            riskOptions +
                        '</select>' +
                    '</div>' +
                '</div>' +

                // Question 5: Sessions
                '<div class="dc-question">' +
                    '<div class="dc-question-number">5</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">Which session(s) will you trade? <span class="dc-required">*</span></label>' +
                        '<p class="dc-help">Tick the sessions you\'ll be watching. You only need to pick the ones that fit your day.</p>' +
                        '<div class="dc-sessions-row" id="dc-sessions-row">' +
                            sessionChecks +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Permission Display (auto-calculated)
                '<div class="dc-permission-box" id="dc-permission-box">' +
                    '<div class="dc-permission-label">Your trading permission today:</div>' +
                    '<div class="dc-permission-display" id="dc-permission-display">' +
                        '<span class="dc-permission-badge dc-perm-none">Answer questions above</span>' +
                    '</div>' +
                    '<div class="dc-permission-desc" id="dc-permission-desc"></div>' +
                '</div>' +

                // Question 6: Rules for today
                '<div class="dc-question">' +
                    '<div class="dc-question-number">6</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">Rules for today <span class="dc-required">(tick at least 1)</span></label>' +
                        '<p class="dc-help">What constraints are you setting yourself? Some are auto-ticked based on your answers above.</p>' +
                        '<div class="dc-rules-grid" id="dc-rules-grid">' +
                            rulesChecklist +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Quick note (optional)
                '<div class="dc-question">' +
                    '<div class="dc-question-number">' + ICONS.pencil + '</div>' +
                    '<div class="dc-question-content">' +
                        '<label class="dc-label">Quick note <span class="dc-optional">(optional, max 140 chars)</span></label>' +
                        '<div class="dc-macro-warning">' + ICONS.warning + ' This is background context only. It does NOT justify trades.</div>' +
                        '<input type="text" class="dc-input" id="dc-macro" maxlength="140" placeholder="e.g. USD weak after soft CPI, watching AUD strength">' +
                    '</div>' +
                '</div>' +

                // Submit
                '<div class="dc-submit-area">' +
                    '<div class="dc-submit-warning">' +
                        ICONS.warning + ' Once locked, this stays until tomorrow (unless you explicitly unlock it \u2014 which gets logged).' +
                    '</div>' +
                    '<button class="dc-btn-lock" id="dc-submit-btn" onclick="DailyContext.submit()" disabled>' +
                        ICONS.lock + ' Lock My Plan For Today' +
                    '</button>' +
                '</div>' +
            '</div>';

        container.innerHTML = html;
    }

    function renderLockedView(container, data) {
        var permInfo = PERMISSION_LEVELS[data.permission] || {};
        var permCss = permInfo.css || '';
        var regimeInfo = REGIMES[data.regime] || {};
        var volInfo = VOLATILITY_STATES[data.volatility] || {};
        var newsInfo = NEWS_STATES[data.newsStatus] || {};
        var riskInfo = PRIMARY_RISKS[data.primaryRisk] || {};
        var lockTime = data.lockedAt ? new Date(data.lockedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '--:--';

        // Sessions
        var sessionsHtml = '';
        if (data.sessions && data.sessions.length > 0) {
            data.sessions.forEach(function (key) {
                var s = SESSIONS[key];
                if (s) {
                    sessionsHtml += '<span class="dc-session-tag">' + s.icon + ' ' + s.label + '</span>';
                }
            });
        }

        // Rules
        var rulesHtml = '';
        if (data.executionRules && data.executionRules.length > 0) {
            data.executionRules.forEach(function (ruleId) {
                var rule = EXECUTION_RULES.find(function (r) { return r.id === ruleId; });
                if (rule) {
                    rulesHtml += '<span class="dc-rule-tag">' + rule.label + '</span>';
                }
            });
        }

        // Macro note
        var macroHtml = '';
        if (data.macroNote) {
            macroHtml =
                '<div class="dc-locked-macro">' +
                    '<span class="dc-macro-label">Note (no trading weight):</span> ' +
                    '<span class="dc-macro-text">' + escapeHtml(data.macroNote) + '</span>' +
                '</div>';
        }

        // Unlock history
        var unlockHistoryHtml = '';
        if (data.unlockHistory && data.unlockHistory.length > 0) {
            unlockHistoryHtml = '<div class="dc-unlock-history">' +
                '<h4>' + ICONS.warning + ' Unlock History (logged)</h4>';
            data.unlockHistory.forEach(function (entry) {
                var t = new Date(entry.at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
                unlockHistoryHtml += '<div class="dc-unlock-entry">' + t + ' \u2014 ' + escapeHtml(entry.reason) + '</div>';
            });
            unlockHistoryHtml += '</div>';
        }

        var html =
            '<div class="dc-locked-view ' + permCss + '">' +
                '<div class="dc-locked-header">' +
                    '<div class="dc-locked-title">' +
                        ICONS.lock + ' Plan Locked \u2014 ' + lockTime + ' AEST' +
                    '</div>' +
                    '<button class="dc-btn-unlock" onclick="DailyContext.requestUnlock()">' +
                        ICONS.unlock + ' Unlock' +
                    '</button>' +
                '</div>' +

                // Permission banner
                '<div class="dc-locked-permission ' + permCss + '">' +
                    '<span class="dc-perm-badge-' + data.permission.toLowerCase() + '">' +
                        (permInfo.labelPlain || data.permission) +
                    '</span>' +
                '</div>' +

                // Summary grid
                '<div class="dc-locked-grid">' +
                    '<div class="dc-locked-item">' +
                        '<span class="dc-locked-label">Market</span>' +
                        '<span class="dc-locked-value">' + (regimeInfo.label || data.regime) +
                            '<span class="dc-locked-technical">(' + (regimeInfo.technical || '') + ')</span>' +
                        '</span>' +
                    '</div>' +
                    '<div class="dc-locked-item">' +
                        '<span class="dc-locked-label">Movement</span>' +
                        '<span class="dc-locked-value">' + (volInfo.label || data.volatility) + '</span>' +
                    '</div>' +
                    '<div class="dc-locked-item">' +
                        '<span class="dc-locked-label">News</span>' +
                        '<span class="dc-locked-value">' + (newsInfo.label || data.newsStatus || 'Not set') + '</span>' +
                    '</div>' +
                    '<div class="dc-locked-item">' +
                        '<span class="dc-locked-label">Biggest Risk</span>' +
                        '<span class="dc-locked-value">' + (riskInfo.label || data.primaryRisk) + '</span>' +
                    '</div>' +
                '</div>' +

                // Sessions
                '<div class="dc-locked-sessions">' +
                    '<span class="dc-locked-label">Trading:</span> ' +
                    sessionsHtml +
                '</div>' +

                // Rules
                '<div class="dc-locked-rules">' +
                    '<span class="dc-locked-label">Rules:</span>' +
                    '<div class="dc-rule-tags">' + rulesHtml + '</div>' +
                '</div>' +

                macroHtml +
                unlockHistoryHtml +
            '</div>';

        container.innerHTML = html;
    }

    // ========================================
    // BRIEFING CARD (Dashboard)
    // ========================================

    function renderBriefingCard(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var data = load();

        if (!data || !data.locked) {
            container.innerHTML =
                '<div class="dc-briefing-card dc-briefing-not-set">' +
                    '<div class="dc-briefing-alert">' +
                        ICONS.warning + ' MORNING BRIEFING NOT DONE' +
                    '</div>' +
                    '<p>Answer 6 quick questions before you trade.</p>' +
                    '<button class="dc-btn-goto" onclick="showTab(\'daily-context\')">' +
                        'Start Briefing ' + ICONS.arrow +
                    '</button>' +
                '</div>';
            return;
        }

        var permInfo = PERMISSION_LEVELS[data.permission] || {};
        var regimeInfo = REGIMES[data.regime] || {};
        var volInfo = VOLATILITY_STATES[data.volatility] || {};
        var lockTime = new Date(data.lockedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

        var rulesStr = '';
        if (data.executionRules && data.executionRules.length > 0) {
            var ruleLabels = data.executionRules.map(function (ruleId) {
                var rule = EXECUTION_RULES.find(function (r) { return r.id === ruleId; });
                return rule ? rule.label : ruleId;
            });
            rulesStr = ruleLabels.join(' \u00B7 ');
        }

        var macroLine = '';
        if (data.macroNote) {
            macroLine = '<div class="dc-briefing-macro">Note: ' + escapeHtml(data.macroNote) + '  <span class="dc-briefing-no-weight">(no trading weight)</span></div>';
        }

        container.innerHTML =
            '<div class="dc-briefing-card ' + (permInfo.css || '') + '">' +
                '<div class="dc-briefing-header">' +
                    '<span>Plan Locked \u2014 ' + lockTime + ' AEST</span>' +
                    '<span class="dc-perm-badge-' + data.permission.toLowerCase() + '">' + (permInfo.labelPlain || data.permission) + '</span>' +
                '</div>' +
                '<div class="dc-briefing-grid">' +
                    '<div>Market: <strong>' + (regimeInfo.label || data.regime) + '</strong></div>' +
                    '<div>Movement: <strong>' + (volInfo.label || data.volatility) + '</strong></div>' +
                '</div>' +
                '<div class="dc-briefing-rules">Rules: ' + rulesStr + '</div>' +
                macroLine +
            '</div>';
    }

    // ========================================
    // STAND-DOWN BANNER (Dashboard)
    // ========================================

    function renderStandDownBanner(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var data = load();
        if (data && data.locked && data.permission === 'STAND_DOWN') {
            var reason = '';
            if (data.regime === 'unclear') reason = 'You said you can\'t read the market today.';
            else if (data.volatility === 'spike') reason = 'Extreme volatility \u2014 too dangerous.';
            else if (data.newsStatus === 'imminent') reason = 'Major news event imminent.';
            else reason = 'Conditions triggered automatic stand down.';

            container.innerHTML =
                '<div class="dc-standdown-banner">' +
                    ICONS.stop + ' <strong>NO TRADING TODAY</strong> \u2014 ' + reason + ' Watch, take notes, wait for tomorrow.' +
                '</div>';
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    }

    // ========================================
    // WORKFLOW STEPPER
    // ========================================

    function getWorkflowState() {
        var data = load();
        var state = {
            contextLocked: false,
            regimeConfirmed: false,
            playbookLocked: false,
            preTradeCleared: false,
            permission: null
        };

        if (data && data.locked) {
            state.contextLocked = true;
            state.regimeConfirmed = true; // v4.0: Context IS the regime declaration now
            state.permission = data.permission;
        }

        // Check playbook module
        if (window.PlaybookModule) {
            try {
                var pbAccess = PlaybookModule.canAccessPreTrade();
                if (pbAccess && pbAccess.allowed) {
                    state.playbookLocked = true;
                }
            } catch (e) { /* ignore */ }
        }

        return state;
    }

    function renderStepper(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var state = getWorkflowState();

        // v4.0: Simplified flow - Context → Playbook → Pre-Trade → Execute
        // (Regime tab removed from stepper as it's now part of Context)
        var steps = [
            { id: 'daily-context', label: 'Briefing',   done: state.contextLocked },
            { id: 'playbook',      label: 'Game Plan',  done: state.playbookLocked },
            { id: 'validation',    label: 'Pre-Trade',  done: state.preTradeCleared },
            { id: 'execute',       label: 'Execute',    done: false }
        ];

        var html = '<div class="dc-stepper">';
        steps.forEach(function (step, i) {
            var accessible = false;
            if (i === 0) accessible = true;
            else if (i === 1) accessible = state.contextLocked;
            else if (i === 2) accessible = state.contextLocked && state.playbookLocked;
            else if (i === 3) accessible = state.contextLocked && state.playbookLocked && state.preTradeCleared;

            var cls = 'dc-step';
            if (step.done) cls += ' dc-step-done';
            else if (accessible) cls += ' dc-step-active';
            else cls += ' dc-step-locked';

            var icon = step.done ? '&#x2714;' : (accessible ? (i + 1) : '&#x1F512;');
            var clickAttr = accessible ? ' onclick="showTab(\'' + step.id + '\')"' : '';

            html +=
                '<div class="' + cls + '"' + clickAttr + '>' +
                    '<span class="dc-step-icon">' + icon + '</span>' +
                    '<span class="dc-step-label">' + step.label + '</span>' +
                '</div>';

            if (i < steps.length - 1) {
                html += '<div class="dc-step-connector' + (step.done ? ' dc-connector-done' : '') + '"></div>';
            }
        });
        html += '</div>';

        container.innerHTML = html;
    }

    // ========================================
    // FORM INTERACTIONS
    // ========================================

    function onRegimeChange() {
        var sel = document.getElementById('dc-regime');
        var descEl = document.getElementById('dc-regime-desc');
        var hintEl = document.getElementById('dc-regime-hint');
        if (sel && descEl) {
            var r = REGIMES[sel.value];
            descEl.textContent = r ? r.desc : '';
            if (hintEl) {
                hintEl.textContent = r ? r.hint : '';
                hintEl.style.display = r && r.hint ? 'block' : 'none';
            }
        }
        updatePermissionDisplay();
        updateDefaultRules();
        validateForm();
    }

    function onVolChange() {
        var sel = document.getElementById('dc-volatility');
        var descEl = document.getElementById('dc-vol-desc');
        if (sel && descEl) {
            var v = VOLATILITY_STATES[sel.value];
            descEl.textContent = v ? v.desc : '';
        }
        updatePermissionDisplay();
        validateForm();
    }

    function onNewsChange() {
        var sel = document.getElementById('dc-news');
        var descEl = document.getElementById('dc-news-desc');
        if (sel && descEl) {
            var n = NEWS_STATES[sel.value];
            descEl.textContent = n ? n.desc : '';
        }
        updatePermissionDisplay();
        validateForm();
    }

    function updatePermissionDisplay() {
        var regime = document.getElementById('dc-regime');
        var vol = document.getElementById('dc-volatility');
        var news = document.getElementById('dc-news');
        var display = document.getElementById('dc-permission-display');
        var descEl = document.getElementById('dc-permission-desc');
        if (!regime || !vol || !display) return;

        if (!regime.value || !vol.value || !(news && news.value)) {
            display.innerHTML = '<span class="dc-permission-badge dc-perm-none">Answer questions above</span>';
            if (descEl) descEl.textContent = 'Auto-calculated from your answers';
            return;
        }

        var perm = calculatePermission(regime.value, vol.value, news.value);
        var permInfo = PERMISSION_LEVELS[perm];
        display.innerHTML = '<span class="dc-permission-badge dc-perm-badge-' + perm.toLowerCase() + '">' + permInfo.labelPlain + '</span>';
        if (descEl) descEl.textContent = permInfo.desc;
    }

    function updateDefaultRules() {
        var regime = document.getElementById('dc-regime');
        if (!regime || !regime.value) return;

        EXECUTION_RULES.forEach(function (rule) {
            var cb = document.getElementById('dc-rule-' + rule.id);
            if (cb && rule.regimes.indexOf(regime.value) !== -1) {
                cb.checked = true;
            }
        });

        var vol = document.getElementById('dc-volatility');
        var news = document.getElementById('dc-news');
        var perm = calculatePermission(regime.value, (vol || {}).value || '', (news || {}).value || '');
        if (perm === 'STAND_DOWN') {
            var obsCheck = document.getElementById('dc-rule-observation_only');
            if (obsCheck) obsCheck.checked = true;
        }
    }

    function validateForm() {
        var regime = document.getElementById('dc-regime');
        var vol = document.getElementById('dc-volatility');
        var news = document.getElementById('dc-news');
        var risk = document.getElementById('dc-risk');
        var submitBtn = document.getElementById('dc-submit-btn');
        if (!submitBtn) return;

        var valid = true;
        if (!regime || !regime.value) valid = false;
        if (!vol || !vol.value) valid = false;
        if (!news || !news.value) valid = false;
        if (!risk || !risk.value) valid = false;

        // Check at least 1 session selected
        var anySession = false;
        Object.keys(SESSIONS).forEach(function (key) {
            var cb = document.getElementById('dc-session-' + key);
            if (cb && cb.checked) anySession = true;
        });
        if (!anySession) valid = false;

        // Check at least 1 execution rule
        var anyRule = false;
        EXECUTION_RULES.forEach(function (rule) {
            var cb = document.getElementById('dc-rule-' + rule.id);
            if (cb && cb.checked) anyRule = true;
        });
        if (!anyRule) valid = false;

        submitBtn.disabled = !valid;
    }

    // ========================================
    // SUBMIT / LOCK
    // ========================================

    function submit() {
        var regime = document.getElementById('dc-regime').value;
        var volatility = document.getElementById('dc-volatility').value;
        var newsStatus = document.getElementById('dc-news').value;
        var primaryRisk = document.getElementById('dc-risk').value;
        var macroNote = (document.getElementById('dc-macro') || {}).value || '';

        if (!regime || !volatility || !newsStatus || !primaryRisk) {
            alert('All required fields must be completed.');
            return;
        }

        // Collect sessions
        var sessions = [];
        Object.keys(SESSIONS).forEach(function (key) {
            var cb = document.getElementById('dc-session-' + key);
            if (cb && cb.checked) sessions.push(key);
        });
        if (sessions.length === 0) {
            alert('Select at least one session.');
            return;
        }

        // Collect rules
        var rules = [];
        EXECUTION_RULES.forEach(function (rule) {
            var cb = document.getElementById('dc-rule-' + rule.id);
            if (cb && cb.checked) rules.push(rule.id);
        });
        if (rules.length === 0) {
            alert('Select at least one rule.');
            return;
        }

        var permission = calculatePermission(regime, volatility, newsStatus);

        var data = {
            date: dateKey(),
            lockedAt: nowISO(),
            locked: true,
            regime: regime,
            volatility: volatility,
            newsStatus: newsStatus,
            primaryRisk: primaryRisk,
            permission: permission,
            sessions: sessions,
            executionRules: rules,
            macroNote: macroNote.substring(0, 140),
            unlockHistory: []
        };

        save(data);
        syncWithRegimeModule(data);
        
        // v4.1.1: Start circuit breaker session (was triggered by old Regime tab lock)
        if (window.CircuitBreaker && typeof CircuitBreaker.startSession === 'function') {
            CircuitBreaker.startSession(sessions[0]);
            console.log('[DailyContext v4.0] Circuit breaker session started:', sessions[0]);
        }
        
        refreshAll();
        console.log('[DailyContext v4.0] Locked:', data);
    }

    function syncWithRegimeModule(data) {
        // Backward compatibility: keep RegimeModule in sync so old gating works
        if (window.RegimeModule && typeof RegimeModule.loadRegimeData === 'function') {
            try {
                var regData = RegimeModule.loadRegimeData();
                if (!regData.dailyContext) regData.dailyContext = {};
                regData.dailyContext.locked = true;
                regData.dailyContext.timestamp = data.lockedAt;
                regData.dailyContext.marketState = data.regime;
                regData.dailyContext.primaryRisk = data.primaryRisk;
                regData.dailyContext.keyDriver = data.macroNote;
                var regKey = 'ftcc_regime';
                localStorage.setItem(regKey, JSON.stringify(regData));
            } catch (e) {
                console.warn('[DailyContext] RegimeModule sync failed:', e);
            }
        }
    }

    // ========================================
    // UNLOCK
    // ========================================

    function requestUnlock() {
        var reason = prompt('Unlock your plan? Enter a reason (this gets logged):');
        if (!reason || reason.trim().length < 5) {
            alert('A reason of at least 5 characters is required.');
            return;
        }

        var data = load();
        if (!data) return;

        if (!data.unlockHistory) data.unlockHistory = [];
        data.unlockHistory.push({
            at: nowISO(),
            reason: reason.trim(),
            previousRegime: data.regime,
            previousPermission: data.permission
        });

        data.locked = false;
        save(data);

        if (window.RegimeModule && typeof RegimeModule.loadRegimeData === 'function') {
            try {
                var regData = RegimeModule.loadRegimeData();
                if (regData.dailyContext) regData.dailyContext.locked = false;
                localStorage.setItem('ftcc_regime', JSON.stringify(regData));
            } catch (e) { /* ignore */ }
        }

        refreshAll();
    }

    // ========================================
    // GATING (Public API - unchanged contract)
    // ========================================

    function isLocked() {
        var data = load();
        return !!(data && data.locked);
    }

    function getPermission() {
        var data = load();
        if (!data || !data.locked) return null;
        return data.permission;
    }

    function getData() {
        return load();
    }

    function canAccess(tabId) {
        var data = load();
        var locked = !!(data && data.locked);

        switch (tabId) {
            case 'daily-context':
                return { allowed: true, reason: '' };

            case 'regime':
                // v4.0: Regime tab still accessible for reference/tracking
                if (!locked) return { allowed: false, reason: 'Complete your morning briefing first.' };
                return { allowed: true, reason: '' };

            case 'playbook':
                if (!locked) return { allowed: false, reason: 'Complete your morning briefing first.' };
                if (data.permission === 'STAND_DOWN') return { allowed: false, reason: 'No trading today \u2014 you\'re on stand down.' };
                return { allowed: true, reason: '' };

            case 'validation':
                if (!locked) return { allowed: false, reason: 'Complete your morning briefing first.' };
                if (data.permission === 'STAND_DOWN') return { allowed: false, reason: 'No trading today \u2014 you\'re on stand down.' };
                return { allowed: true, reason: '' };

            case 'execute':
                if (!locked) return { allowed: false, reason: 'Complete your morning briefing first.' };
                if (data.permission === 'STAND_DOWN') return { allowed: false, reason: 'No trading today \u2014 no execution permitted.' };
                return { allowed: true, reason: '' };

            default:
                return { allowed: true, reason: '' };
        }
    }

    // ========================================
    // REFRESH
    // ========================================

    function refreshAll() {
        renderForm('dc-form-container');
        renderBriefingCard('dc-briefing-container');
        renderStandDownBanner('dc-standdown-container');
        renderStepper('dc-stepper-container');

        // Re-attach validation listeners
        setTimeout(function () {
            var fields = document.querySelectorAll('#dc-form-container select, #dc-form-container input');
            fields.forEach(function (el) {
                el.addEventListener('change', validateForm);
            });
        }, 50);
    }

    // ========================================
    // INIT
    // ========================================

    function init() {
        load();
        if (!_data) {
            // v4.1.2: No local data — try server (cross-browser)
            loadFromServer().then(function(serverData) {
                if (serverData) {
                    refreshAll();
                    console.log('[DailyContext v4.0] Restored from server');
                }
            });
        }
        refreshAll();
        console.log('[DailyContext v4.0] Initialised. Locked:', isLocked());
    }

    // ========================================
    // PUBLIC API (backward compatible)
    // ========================================

    return {
        init: init,
        renderForm: renderForm,
        renderBriefingCard: renderBriefingCard,
        renderStandDownBanner: renderStandDownBanner,
        renderStepper: renderStepper,
        submit: submit,
        requestUnlock: requestUnlock,
        onRegimeChange: onRegimeChange,
        onVolChange: onVolChange,
        onNewsChange: onNewsChange,
        validateForm: validateForm,
        isLocked: isLocked,
        getPermission: getPermission,
        getData: getData,
        getState: getData,  // Alias for PlaybookModule compatibility
        canAccess: canAccess,
        refreshAll: refreshAll,
        getWorkflowState: getWorkflowState,
        calculatePermission: calculatePermission,
        REGIMES: REGIMES,
        VOLATILITY_STATES: VOLATILITY_STATES,
        NEWS_STATES: NEWS_STATES,
        PRIMARY_RISKS: PRIMARY_RISKS,
        PERMISSION_LEVELS: PERMISSION_LEVELS,
        SESSIONS: SESSIONS
    };

})();

// Auto-init
document.addEventListener('DOMContentLoaded', function() {
    if (window.DailyContext) {
        DailyContext.init();
    }
});
