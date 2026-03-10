// structure-gate.js - FCC Structure Gate Module v1.0.0
// Fetches ProZones proximity data from alert server and renders
// a hard gate banner in the Pre-Trade tab / Institutional Checklist.
//
// Fail-closed: no data = warning displayed, not silent pass.
//
// Dependencies: Requires the active pair to be set via
//   window.structureGate.checkPair(pair, direction)
//
// Integration points:
//   - Called from updateInstitutionalChecklist() after pair is known
//   - Banner injected into #structure-gate-banner (added to index.html)

(function() {
    'use strict';

    var STRUCTURE_API = 'https://api.pineros.club/structure';
    var CACHE = {};            // { pair: { data, fetchedAt } }
    var CACHE_TTL_MS = 60000;  // Re-fetch every 60 seconds

    // =========================================================================
    // VERDICT LOGIC
    // =========================================================================

    // Given ProZones verdict + trade direction, return gate decision
    // Returns: { status: 'PASS'|'WARN'|'BLOCK', label, colour, detail }
    function evaluateGate(structData, direction) {
        if (!structData || structData.verdict === 'NO_DATA' || structData.verdict === 'EXPIRED' || !structData.found) {
            return {
                status: 'WARN',
                label: 'NO STRUCTURE DATA',
                colour: '#FF9800',
                detail: 'ProZones alert not received for this pair. Check alert is configured in TradingView.',
                icon: '\u26A0'
            };
        }

        var verdict  = structData.verdict;   // "AT RESISTANCE" | "AT SUPPORT" | "APPROACHING RESISTANCE" | etc.
        var strength = structData.strength;  // "STRONG" | "MODERATE" | "WEAK"
        var dist     = structData.dist_atr;
        var tr       = structData.tr;
        var zone     = structData.zone;
        var ageMin   = structData.ageMinutes || 0;

        var distStr  = dist !== null ? dist.toFixed(2) + ' ATR' : '?';
        var detail   = zone + ' | Strength: ' + strength + ' | T/R: ' + tr + ' | Dist: ' + distStr + ' | Data age: ' + ageMin + 'm';

        var dir = (direction || '').toUpperCase();
        var isLong  = dir === 'LONG' || dir === 'BULL' || dir === 'BUY';
        var isShort = dir === 'SHORT' || dir === 'BEAR' || dir === 'SELL';

        // AT RESISTANCE
        if (verdict === 'AT RESISTANCE') {
            if (isLong) {
                return { status: 'BLOCK', label: 'BLOCKED \u2014 BUYING INTO RESISTANCE', colour: '#F44336', detail: detail, icon: '\u2716' };
            }
            if (isShort) {
                return { status: 'PASS', label: 'AT RESISTANCE \u2014 IDEAL SHORT LOCATION', colour: '#4CAF50', detail: detail, icon: '\u2713' };
            }
            return { status: 'WARN', label: 'AT RESISTANCE \u2014 CHECK DIRECTION', colour: '#FF9800', detail: detail, icon: '\u26A0' };
        }

        // AT SUPPORT
        if (verdict === 'AT SUPPORT') {
            if (isShort) {
                return { status: 'BLOCK', label: 'BLOCKED \u2014 SHORTING INTO SUPPORT', colour: '#F44336', detail: detail, icon: '\u2716' };
            }
            if (isLong) {
                return { status: 'PASS', label: 'AT SUPPORT \u2014 IDEAL LONG LOCATION', colour: '#4CAF50', detail: detail, icon: '\u2713' };
            }
            return { status: 'WARN', label: 'AT SUPPORT \u2014 CHECK DIRECTION', colour: '#FF9800', detail: detail, icon: '\u26A0' };
        }

        // APPROACHING RESISTANCE
        if (verdict === 'APPROACHING RESISTANCE') {
            if (isLong && strength === 'STRONG') {
                return { status: 'WARN', label: 'APPROACHING STRONG RESISTANCE', colour: '#FF9800', detail: detail, icon: '\u26A0' };
            }
            if (isShort) {
                return { status: 'PASS', label: 'APPROACHING RESISTANCE \u2014 SHORT ENTRY ZONE', colour: '#4CAF50', detail: detail, icon: '\u2713' };
            }
            return { status: 'WARN', label: 'APPROACHING RESISTANCE', colour: '#FF9800', detail: detail, icon: '\u26A0' };
        }

        // APPROACHING SUPPORT
        if (verdict === 'APPROACHING SUPPORT') {
            if (isShort && strength === 'STRONG') {
                return { status: 'WARN', label: 'APPROACHING STRONG SUPPORT', colour: '#FF9800', detail: detail, icon: '\u26A0' };
            }
            if (isLong) {
                return { status: 'PASS', label: 'APPROACHING SUPPORT \u2014 LONG ENTRY ZONE', colour: '#4CAF50', detail: detail, icon: '\u2713' };
            }
            return { status: 'WARN', label: 'APPROACHING SUPPORT', colour: '#FF9800', detail: detail, icon: '\u26A0' };
        }

        // MID-RANGE
        if (verdict === 'MID-RANGE') {
            return { status: 'WARN', label: 'MID-RANGE \u2014 NO STRUCTURAL EDGE', colour: '#9E9E9E', detail: detail, icon: '\u2014' };
        }

        // Unknown
        return { status: 'WARN', label: 'STRUCTURE: ' + verdict, colour: '#FF9800', detail: detail, icon: '\u26A0' };
    }

    // =========================================================================
    // BANNER RENDERING
    // =========================================================================

    function renderBanner(gate) {
        var banner = document.getElementById('structure-gate-banner');
        if (!banner) return;

        var bgColour  = gate.colour;
        var textCol   = '#FFFFFF';
        var blockMsg  = gate.status === 'BLOCK' ? ' \u2014 EXECUTION BLOCKED' : '';

        banner.style.display = 'block';
        banner.style.background = bgColour;
        banner.style.border = '2px solid ' + bgColour;
        banner.style.borderRadius = '6px';
        banner.style.padding = '10px 14px';
        banner.style.marginBottom = '12px';

        banner.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-size:1.1rem;color:' + textCol + ';">' + gate.icon + '</span>' +
                '<div>' +
                    '<div style="font-weight:700;font-size:0.85rem;color:' + textCol + ';letter-spacing:0.04em;">' +
                        'STRUCTURE GATE' + blockMsg +
                    '</div>' +
                    '<div style="font-size:0.9rem;font-weight:600;color:' + textCol + ';margin-top:2px;">' +
                        gate.label +
                    '</div>' +
                    '<div style="font-size:0.75rem;color:rgba(255,255,255,0.85);margin-top:3px;">' +
                        gate.detail +
                    '</div>' +
                '</div>' +
            '</div>';

        // Block execution button if BLOCK status
        var execBtn = document.getElementById('execute-trade-btn');
        if (execBtn) {
            if (gate.status === 'BLOCK') {
                execBtn.disabled = true;
                execBtn.title = 'Blocked by Structure Gate: ' + gate.label;
            } else {
                execBtn.disabled = false;
                execBtn.title = '';
            }
        }
    }

    function renderLoading() {
        var banner = document.getElementById('structure-gate-banner');
        if (!banner) return;
        banner.style.display = 'block';
        banner.style.background = '#37474F';
        banner.style.border = '2px solid #546E7A';
        banner.style.borderRadius = '6px';
        banner.style.padding = '10px 14px';
        banner.style.marginBottom = '12px';
        banner.innerHTML =
            '<div style="font-size:0.8rem;color:#90A4AE;">' +
                '\u23F3 Checking structure data\u2026' +
            '</div>';
    }

    // =========================================================================
    // API FETCH
    // =========================================================================

    function fetchStructure(pair, callback) {
        // Check cache first
        var cached = CACHE[pair];
        if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
            callback(null, cached.data);
            return;
        }

        var url = STRUCTURE_API + '?pair=' + encodeURIComponent(pair);
        fetch(url)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                CACHE[pair] = { data: data, fetchedAt: Date.now() };
                callback(null, data);
            })
            .catch(function(err) {
                callback(err, null);
            });
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    // Main entry point: call this when pair + direction are known
    // direction: 'LONG' | 'SHORT' | '' (unknown)
    function checkPair(pair, direction) {
        if (!pair) {
            renderBanner({ status: 'WARN', label: 'NO PAIR SELECTED', colour: '#607D8B', detail: 'Select a pair to check structure.', icon: '\u2014' });
            return;
        }

        renderLoading();

        fetchStructure(pair, function(err, data) {
            var gate;
            if (err) {
                gate = {
                    status: 'WARN',
                    label: 'STRUCTURE API UNAVAILABLE',
                    colour: '#FF9800',
                    detail: 'Could not reach api.pineros.club/structure. Check alert server is running.',
                    icon: '\u26A0'
                };
            } else {
                gate = evaluateGate(data, direction);
            }
            renderBanner(gate);
            // Expose last result for external use (e.g. institutional-checklist gate logic)
            window._structureGateResult = gate;
        });
    }

    // Invalidate cache for a pair (call after direction change)
    function clearCache(pair) {
        if (pair) {
            delete CACHE[pair];
        } else {
            CACHE = {};
        }
    }

    // Return last gate result synchronously (for checklist integration)
    function getLastResult() {
        return window._structureGateResult || null;
    }

    // Expose public API
    window.structureGate = {
        checkPair:     checkPair,
        clearCache:    clearCache,
        getLastResult: getLastResult,
        evaluateGate:  evaluateGate  // exposed for testing
    };

})();
