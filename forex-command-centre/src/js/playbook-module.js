// ============================================
// PLAYBOOK MODULE v1.1.0
// Institutional Playbook Architecture for UTCC
// ============================================
// Purpose: UTCC is a FILTER, not a GENERATOR
// Rule: If you cannot name the playbook BEFORE looking at UTCC, you don't trade
// v1.1.0: Consolidated from 6 playbooks to 5 institutional-grade playbooks
//         with full execution steps, invalidation rules, and regime gating.
// ============================================

(function() {
    'use strict';

    // ============================================
    // STORAGE KEY
    // ============================================
    const PLAYBOOK_STORAGE_KEY = 'ftcc_playbook';

    // ============================================
    // PLAYBOOK DEFINITIONS (v1.1.0 - Institutional)
    // ============================================
    const PLAYBOOKS = {
        'continuation': {
            id: 'continuation',
            name: 'Continuation',
            shortName: 'Continuation',
            icon: '\u2197',
            tagClass: 'playbook-continuation',
            description: 'Trading in the direction of an established, healthy trend. Price making consistent progress with orderly pullbacks.',
            definition: 'Enter on pullback into EMA ribbon in a confirmed trend. Wait for acceptance or rejection at ribbon. Never chase.',
            whenApplies: 'Regime = Expansion. UTCC Armed in trend direction. ATR state = TREND or STABLE. Structure = Trending.',
            executionSteps: [
                'Wait for pullback into EMA ribbon (9/21/50 zone)',
                'Confirm price is ACCEPTED at ribbon (closes inside, rides it) or REJECTED (sharp displacement back in trend direction)',
                'A simple touch of the ribbon is NOT enough \u2014 you need a reaction',
                'Enter after 1+ candle closes post-UTCC arm (FOMO gate)',
                'Stop: Beyond the pullback swing low/high',
                'Target: Next significant S/R level or 2:1 R:R minimum'
            ],
            invalidation: [
                'MTF alignment breaks (drops below 3/3)',
                'EMA compression (trend direction = 0)',
                'Price breaks below/above the pullback level that formed your entry',
                'UTCC disarms'
            ],
            regimes: ['expansion'],
            permissions: ['FULL', 'CONDITIONAL'],
            minScore: 80,
            riskProfile: 'standard',
            riskMultiplier: 1.0,
            tradeable: true
        },

        'deep-pullback': {
            id: 'deep-pullback',
            name: 'Deep Pullback',
            shortName: 'Deep Pullback',
            icon: '\u21A9',
            tagClass: 'playbook-pullback',
            description: 'Trading a deeper retracement within a still-valid trend. Price pulled back past 50 EMA but higher timeframe trend intact.',
            definition: 'Enter on rejection at significant S/R level during a deep correction. Higher timeframe must still hold. Reduced position size mandatory.',
            whenApplies: 'Regime = Expansion or Distribution. UTCC Armed. Structure = Corrective (deeper than normal pullback).',
            executionSteps: [
                'Wait for price to reach a significant S/R level (not just EMA ribbon \u2014 this is deeper)',
                'Look for rejection candle at that level (pin bar, engulfing, inside bar breakout)',
                'Confirm higher timeframe still holds (Daily trend intact, 4H structure not broken)',
                'Enter after rejection confirmation (1+ candle)',
                'Stop: Beyond the S/R level being tested',
                'Target: Return to prior trend high/low or 2:1 R:R minimum',
                'Reduce position size to 0.75x (volatility is elevated)'
            ],
            invalidation: [
                'Higher timeframe trend breaks',
                'Price closes decisively through the S/R level (not a wick \u2014 a close)',
                'Second consecutive rejection failure (price keeps pushing through)',
                'UTCC disarms'
            ],
            regimes: ['expansion', 'distribution', 'transition'],
            permissions: ['FULL', 'CONDITIONAL'],
            minScore: 80,
            riskProfile: 'reduced',
            riskMultiplier: 0.75,
            tradeable: true
        },

        'range-breakout': {
            id: 'range-breakout',
            name: 'Range Breakout',
            shortName: 'Range Breakout',
            icon: '\u25B3',
            tagClass: 'playbook-breakout',
            description: 'Trading the break of an established range. Price contained between S/R, now breaking with conviction.',
            definition: 'Wait for decisive close beyond range boundary, then enter on retest of broken level. If price re-enters range, breakout failed.',
            whenApplies: 'Regime = Compression (breaking). Structure = Compressing then Breaking Out. ATR = QUIET transitioning to EXPANDING.',
            executionSteps: [
                'Identify the range boundaries clearly (Asian session high/low, or multi-day range)',
                'Wait for a decisive close beyond the boundary \u2014 not just a wick',
                'Wait for a retest of the broken boundary (the breakout pullback)',
                'Enter on successful retest (boundary acts as new support/resistance)',
                'Stop: Back inside the range (if price re-enters, the breakout failed)',
                'Target: Range height projected from breakout point, or next S/R level'
            ],
            invalidation: [
                'Price re-enters the range and closes back inside',
                'False breakout (wick beyond boundary, close back inside)',
                'No retest within 2 sessions (breakout is too extended to chase)'
            ],
            regimes: ['compression', 'transition'],
            permissions: ['FULL'],
            minScore: 80,
            riskProfile: 'standard',
            riskMultiplier: 1.0,
            tradeable: true
        },

        'observation': {
            id: 'observation',
            name: 'Observation Only',
            shortName: 'Observation',
            icon: '\u2609',
            tagClass: 'playbook-observation',
            description: 'Not a tradeable playbook. Conditions exist but not clear enough to act. Watch, analyse, prepare \u2014 but do not execute.',
            definition: 'Monitor armed instruments without trading them. Prepare entry plans for when conditions improve. Log observations.',
            whenApplies: 'Regime = Rotation, Compression (without breakout), Distribution, or Transition. Permission = CONDITIONAL.',
            executionSteps: [
                'Monitor armed instruments without trading them',
                'Prepare entry plans for when conditions improve',
                'Log observations in No-Trade Journal',
                'Review existing positions only'
            ],
            invalidation: [],
            regimes: ['rotation', 'compression', 'distribution', 'transition'],
            permissions: ['CONDITIONAL', 'STAND_DOWN'],
            minScore: 0,
            riskProfile: 'none',
            riskMultiplier: 0,
            tradeable: false,
            blockPreTrade: true,
            blockAllWorkflow: false
        },

        'stand-down': {
            id: 'stand-down',
            name: 'Stand Down',
            shortName: 'Stand Down',
            icon: '\u26D4',
            tagClass: 'playbook-standdown',
            description: 'No trading activity permitted. System is locked. Close charts, complete reviews, wait for reset.',
            definition: 'Zero trading. This is not optional. The system has determined conditions are too dangerous or you have hit a behavioural/risk threshold.',
            whenApplies: 'Permission = STAND_DOWN. Circuit breaker triggered. Drawdown threshold hit. Regime = Unclear.',
            executionSteps: [
                'Close the charts',
                'Complete any required reviews',
                'Wait for conditions to reset'
            ],
            invalidation: [],
            regimes: ['unclear'],
            permissions: ['STAND_DOWN'],
            minScore: 0,
            riskProfile: 'none',
            riskMultiplier: 0,
            tradeable: false,
            blockPreTrade: true,
            blockAllWorkflow: true
        }
    };

    // ============================================
    // REGIME TO PLAYBOOK PERMISSION MATRIX (v1.1.0)
    // ============================================
    const REGIME_PLAYBOOK_MATRIX = {
        'expansion': {
            primary: ['continuation'],
            available: ['deep-pullback'],
            forbidden: ['range-breakout'],
            forced: null,
            note: 'Trend-following playbooks. Continuation is primary. Deep Pullback available for larger retracements.'
        },
        'rotation': {
            primary: [],
            available: [],
            forbidden: ['continuation', 'deep-pullback', 'range-breakout'],
            forced: 'observation',
            note: 'Most dangerous regime. No directional edge. Observation only.'
        },
        'compression': {
            primary: [],
            available: ['range-breakout'],
            forbidden: ['continuation', 'deep-pullback'],
            forced: 'observation',
            note: 'Breakout building but direction unknown. Range Breakout if breaking. Default to Observation.'
        },
        'distribution': {
            primary: [],
            available: ['deep-pullback'],
            forbidden: ['continuation', 'range-breakout'],
            forced: 'observation',
            note: 'Late-stage regime. Deep Pullback with caution only. Default to Observation.'
        },
        'transition': {
            primary: [],
            available: ['deep-pullback', 'range-breakout'],
            forbidden: ['continuation'],
            forced: 'observation',
            note: 'Regime changing. Deep Pullback if direction clear. Range Breakout if breaking. Default to Observation.'
        },
        'unclear': {
            primary: [],
            available: [],
            forbidden: ['continuation', 'deep-pullback', 'range-breakout', 'observation'],
            forced: 'stand-down',
            note: 'Cannot identify regime. Automatic Stand Down. No exceptions.'
        }
    };

    // ============================================
    // EXECUTION MODELS
    // ============================================
    const EXECUTION_MODELS = {
        'limit-pullback': {
            id: 'limit-pullback',
            name: 'Limit Order at Level',
            shortName: 'Limit',
            icon: '\u23F8',
            description: 'Place limit order at predetermined level, set SL/TP, walk away.',
            bestFor: 'Continuation, Deep Pullback, Range Breakout (retest)'
        },
        'break-retest': {
            id: 'break-retest',
            name: 'Break-Retest Entry',
            shortName: 'B&R',
            icon: '\u21BA',
            description: 'Wait for level break, then enter on confirmed retest.',
            bestFor: 'Range Breakout, Continuation (break of structure)'
        },
        'market-confirmation': {
            id: 'market-confirmation',
            name: 'Market on Confirmation',
            shortName: 'Market',
            icon: '\u26A1',
            description: 'Market order after confirmation pattern completes. Immediate stop placement.',
            bestFor: 'Fast-moving setups, session open plays'
        }
    };

    // Playbook to execution model mapping
    const PLAYBOOK_EXECUTION_MAP = {
        'continuation': ['limit-pullback', 'break-retest'],
        'deep-pullback': ['limit-pullback', 'market-confirmation'],
        'range-breakout': ['break-retest', 'limit-pullback'],
        'observation': [],
        'stand-down': []
    };

    // ============================================
    // LEAKAGE WARNING DEFINITIONS
    // ============================================
    const LEAKAGE_WARNINGS = {
        'perfect-extended': {
            id: 'perfect-extended',
            severity: 'critical',
            title: 'LOCATION VIOLATION',
            message: 'High score does NOT override zone quality. EXTENDED zone = NO ENTRY.',
            trigger: function(data) { return data.score >= 85 && data.entryZone === 'extended'; },
            action: 'block'
        },
        'score-size-mismatch': {
            id: 'score-size-mismatch',
            severity: 'warning',
            title: 'POSITION SIZE ALERT',
            message: 'Score 75-79 requires 50% position size. Full size not permitted.',
            trigger: function(data) { return data.score >= 75 && data.score < 80 && data.positionSize === 'full'; },
            action: 'warn'
        },
        'regime-mismatch': {
            id: 'regime-mismatch',
            severity: 'critical',
            title: 'REGIME MISMATCH',
            message: 'Selected playbook is not permitted in current regime.',
            trigger: function(data) {
                var matrix = REGIME_PLAYBOOK_MATRIX[data.regime];
                return matrix && matrix.forbidden && matrix.forbidden.indexOf(data.playbook) !== -1;
            },
            action: 'block'
        },
        'late-session': {
            id: 'late-session',
            severity: 'warning',
            title: 'LATE SESSION WARNING',
            message: 'After 9:30pm AEST. New entries not recommended. Consider tomorrow.',
            trigger: function(data) {
                var now = new Date();
                var aestHour = parseInt(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }));
                var aestMin = parseInt(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }));
                return (aestHour === 21 && aestMin >= 30) || aestHour >= 22;
            },
            action: 'warn'
        },
        'observation-trade-attempt': {
            id: 'observation-trade-attempt',
            severity: 'critical',
            title: 'OBSERVATION MODE ACTIVE',
            message: 'Observation playbook is selected. Pre-Trade tab is blocked. No trades permitted.',
            trigger: function(data) { return data.playbook === 'observation'; },
            action: 'block'
        },
        'stand-down-active': {
            id: 'stand-down-active',
            severity: 'critical',
            title: 'STAND DOWN ACTIVE',
            message: 'All workflow tabs blocked. Complete required reviews before resuming.',
            trigger: function(data) { return data.playbook === 'stand-down'; },
            action: 'block'
        },
        'almost-criteria': {
            id: 'almost-criteria',
            severity: 'warning',
            title: '4/5 IS NOT 5/5',
            message: 'One criterion failed. All criteria must pass. No exceptions.',
            trigger: function(data) { return data.criteriaPass === 4 && data.criteriaTrial === 5; },
            action: 'warn'
        },
        'correlation-risk': {
            id: 'correlation-risk',
            severity: 'warning',
            title: 'CORRELATION EXPOSURE',
            message: 'You have correlated positions open. Combined exposure may exceed risk limits.',
            trigger: function(data) { return data.correlatedPositions && data.correlatedPositions.length > 0; },
            action: 'warn'
        }
    };

    // ============================================
    // RISK PROFILES
    // ============================================
    const RISK_PROFILES = {
        'standard': {
            positionSize: 1.0,
            maxRisk: 0.02,
            label: 'Standard (1.5-2%)'
        },
        'reduced': {
            positionSize: 0.75,
            maxRisk: 0.015,
            label: 'Reduced (0.75x)'
        },
        'none': {
            positionSize: 0,
            maxRisk: 0,
            label: 'No Trading'
        }
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    function getDefaultState() {
        return {
            version: '1.1',
            selectedPlaybook: null,
            selectedExecutionModel: null,
            selectionTimestamp: null,
            selectionLocked: false,
            leakageWarnings: [],
            sessionStats: {
                playbooksUsed: {},
                leakageTriggered: {}
            }
        };
    }

    function loadState() {
        try {
            var data = localStorage.getItem(PLAYBOOK_STORAGE_KEY);
            if (data) {
                var parsed = JSON.parse(data);
                if (parsed.selectionTimestamp) {
                    var selDate = new Date(parsed.selectionTimestamp).toDateString();
                    var today = new Date().toDateString();
                    if (selDate !== today) {
                        return getDefaultState();
                    }
                }
                // Migration: if old playbook IDs, reset
                if (parsed.selectedPlaybook && !PLAYBOOKS[parsed.selectedPlaybook]) {
                    return getDefaultState();
                }
                return parsed;
            }
        } catch (e) {
            console.error('Error loading playbook state:', e);
        }
        return getDefaultState();
    }

    function saveState(state) {
        try {
            localStorage.setItem(PLAYBOOK_STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('Error saving playbook state:', e);
            return false;
        }
    }

    // ============================================
    // CORE FUNCTIONS
    // ============================================
    function getAvailablePlaybooks(regime, permission) {
        if (!regime) return [];
        var regimeKey = regime.toLowerCase();
        var matrix = REGIME_PLAYBOOK_MATRIX[regimeKey];
        if (!matrix) return [];

        // If forced, return only that
        if (matrix.forced) {
            return [matrix.forced];
        }

        var available = [];
        // Primary first
        if (matrix.primary) {
            matrix.primary.forEach(function(pbId) {
                var pb = PLAYBOOKS[pbId];
                if (pb && (!permission || pb.permissions.indexOf(permission) !== -1)) {
                    available.push(pbId);
                }
            });
        }
        // Then available
        if (matrix.available) {
            matrix.available.forEach(function(pbId) {
                var pb = PLAYBOOKS[pbId];
                if (pb && (!permission || pb.permissions.indexOf(permission) !== -1)) {
                    if (available.indexOf(pbId) === -1) {
                        available.push(pbId);
                    }
                }
            });
        }
        return available;
    }

    function getForcedPlaybook(regime) {
        var regimeKey = regime ? regime.toLowerCase() : '';
        var matrix = REGIME_PLAYBOOK_MATRIX[regimeKey];
        if (matrix && matrix.forced) {
            return PLAYBOOKS[matrix.forced] || null;
        }
        return null;
    }

    function isPrimaryPlaybook(playbookId, regime) {
        var regimeKey = regime ? regime.toLowerCase() : '';
        var matrix = REGIME_PLAYBOOK_MATRIX[regimeKey];
        return matrix && matrix.primary && matrix.primary.indexOf(playbookId) !== -1;
    }

    function selectPlaybook(playbookId) {
        var state = loadState();
        if (!PLAYBOOKS[playbookId]) {
            console.error('Invalid playbook:', playbookId);
            return false;
        }
        state.selectedPlaybook = playbookId;
        state.selectedExecutionModel = null;
        state.selectionTimestamp = new Date().toISOString();
        state.selectionLocked = false;
        if (!state.sessionStats.playbooksUsed[playbookId]) {
            state.sessionStats.playbooksUsed[playbookId] = 0;
        }
        state.sessionStats.playbooksUsed[playbookId]++;
        saveState(state);
        return true;
    }

    function selectExecutionModel(modelId) {
        var state = loadState();
        if (!EXECUTION_MODELS[modelId]) {
            console.error('Invalid execution model:', modelId);
            return false;
        }
        if (state.selectedPlaybook) {
            var allowedModels = PLAYBOOK_EXECUTION_MAP[state.selectedPlaybook] || [];
            if (allowedModels.indexOf(modelId) === -1) {
                console.error('Execution model not allowed for this playbook');
                return false;
            }
        }
        state.selectedExecutionModel = modelId;
        saveState(state);
        return true;
    }

    function lockSelection() {
        var state = loadState();
        var pb = PLAYBOOKS[state.selectedPlaybook];
        // Non-tradeable playbooks lock without execution model
        if (pb && !pb.tradeable) {
            state.selectionLocked = true;
            saveState(state);
            return { success: true };
        }
        if (!state.selectedPlaybook || !state.selectedExecutionModel) {
            return { success: false, reason: 'Playbook and execution model must be selected' };
        }
        state.selectionLocked = true;
        saveState(state);
        return { success: true };
    }

    function resetSelection() {
        var state = loadState();
        state.selectedPlaybook = null;
        state.selectedExecutionModel = null;
        state.selectionTimestamp = null;
        state.selectionLocked = false;
        state.leakageWarnings = [];
        saveState(state);
    }

    function getSelectedPlaybook() {
        var state = loadState();
        if (!state.selectedPlaybook) return null;
        return PLAYBOOKS[state.selectedPlaybook] || null;
    }

    function getSelectedExecutionModel() {
        var state = loadState();
        if (!state.selectedExecutionModel) return null;
        return EXECUTION_MODELS[state.selectedExecutionModel] || null;
    }

    function isSelectionComplete() {
        var state = loadState();
        if (!state.selectedPlaybook || !state.selectionLocked) return false;
        var pb = PLAYBOOKS[state.selectedPlaybook];
        if (pb && !pb.tradeable) return true;
        return !!state.selectedExecutionModel;
    }

    // ============================================
    // LEAKAGE DETECTION
    // ============================================
    function checkLeakage(tradeData) {
        var warnings = [];
        Object.keys(LEAKAGE_WARNINGS).forEach(function(key) {
            var warning = LEAKAGE_WARNINGS[key];
            try {
                if (warning.trigger(tradeData)) {
                    warnings.push({
                        id: warning.id,
                        severity: warning.severity,
                        title: warning.title,
                        message: warning.message,
                        action: warning.action,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (e) { /* skip */ }
        });

        var state = loadState();
        state.leakageWarnings = warnings;
        warnings.forEach(function(w) {
            if (!state.sessionStats.leakageTriggered[w.id]) {
                state.sessionStats.leakageTriggered[w.id] = 0;
            }
            state.sessionStats.leakageTriggered[w.id]++;
        });
        saveState(state);
        return warnings;
    }

    function hasBlockingLeakage(tradeData) {
        return checkLeakage(tradeData).some(function(w) { return w.action === 'block'; });
    }

    function getBlockingWarnings(tradeData) {
        return checkLeakage(tradeData).filter(function(w) { return w.action === 'block'; });
    }

    // ============================================
    // PRE-TRADE ACCESS GATING
    // ============================================
    function canAccessPreTrade() {
        var state = loadState();
        if (!state.selectedPlaybook) {
            return { allowed: false, reason: 'Select a playbook first. Name your playbook BEFORE looking at the setup.', step: 'playbook' };
        }
        var pb = PLAYBOOKS[state.selectedPlaybook];
        if (pb && pb.blockPreTrade) {
            return { allowed: false, reason: pb.name + ' is active. Pre-Trade validation is not available.', step: 'blocked' };
        }
        if (pb && pb.tradeable && !state.selectedExecutionModel) {
            return { allowed: false, reason: 'Select an execution model for your playbook.', step: 'execution' };
        }
        if (!state.selectionLocked) {
            return { allowed: false, reason: 'Lock your playbook selection to proceed.', step: 'lock' };
        }
        return { allowed: true };
    }

    // ============================================
    // UI RENDERING
    // ============================================
    function renderPlaybookSelection(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var state = loadState();
        var regime = null;
        var permission = null;

        // Get regime from DailyContext first, then RegimeModule
        if (window.DailyContext) {
            var dcState = window.DailyContext.getState ? window.DailyContext.getState() : null;
            if (dcState && dcState.locked) {
                regime = dcState.regime;
                permission = dcState.permission;
            }
        }
        if (!regime && window.RegimeModule) {
            var regimeData = window.RegimeModule.loadRegimeData();
            if (regimeData.dailyContext) {
                regime = regimeData.dailyContext.marketState;
            }
        }

        // Locked state
        if (state.selectionLocked && state.selectedPlaybook) {
            renderLockedSelection(container, state);
            return;
        }

        // No regime set
        if (!regime) {
            container.innerHTML =
                '<div class="playbook-gate-warning">' +
                    '<span class="gate-icon">&#x26A0;</span>' +
                    '<div class="gate-content">' +
                        '<div class="gate-title">Complete Daily Context First</div>' +
                        '<div class="gate-message">You must lock your Daily Context before selecting a playbook.</div>' +
                        '<button class="btn btn-primary" onclick="showTab(\'daily-context\')">Set Daily Context</button>' +
                    '</div>' +
                '</div>';
            return;
        }

        var regimeKey = regime.toLowerCase();
        var availableIds = getAvailablePlaybooks(regime, permission);

        if (availableIds.length === 0) {
            container.innerHTML =
                '<div class="playbook-gate-warning">' +
                    '<span class="gate-icon">&#x26A0;</span>' +
                    '<div class="gate-content">' +
                        '<div class="gate-title">No Playbooks Available</div>' +
                        '<div class="gate-message">Current regime (' + regime.toUpperCase() + ') has no permitted playbooks.</div>' +
                    '</div>' +
                '</div>';
            return;
        }

        // Build playbook cards
        var cardsHtml = '';
        availableIds.forEach(function(pbId) {
            var pb = PLAYBOOKS[pbId];
            if (!pb) return;
            var isSelected = state.selectedPlaybook === pbId;
            var isPrimary = isPrimaryPlaybook(pbId, regime);
            var matrix = REGIME_PLAYBOOK_MATRIX[regimeKey];
            var isForced = matrix && matrix.forced === pbId;

            // Build steps HTML
            var stepsHtml = '';
            if (pb.tradeable && pb.executionSteps && pb.executionSteps.length > 0) {
                stepsHtml =
                    '<div class="playbook-steps-preview">' +
                        '<div class="steps-title">&#x1F4CB; Execution Steps:</div>' +
                        '<ol class="steps-list">' +
                            pb.executionSteps.map(function(s) { return '<li>' + s + '</li>'; }).join('') +
                        '</ol>' +
                    '</div>';
            }

            // Build invalidation HTML
            var invHtml = '';
            if (pb.invalidation && pb.invalidation.length > 0) {
                invHtml =
                    '<div class="playbook-invalidation-preview">' +
                        '<div class="invalidation-title">&#x26D4; Invalidation:</div>' +
                        '<ul class="invalidation-list">' +
                            pb.invalidation.map(function(inv) { return '<li>' + inv + '</li>'; }).join('') +
                        '</ul>' +
                    '</div>';
            }

            cardsHtml +=
                '<div class="playbook-card ' + (isSelected ? 'selected' : '') + ' ' + (isPrimary ? 'preferred' : '') + ' ' + pb.tagClass + '-card"' +
                     ' onclick="PlaybookModule.handlePlaybookSelect(\'' + pbId + '\')">' +
                    '<div class="playbook-card-header">' +
                        '<span class="playbook-icon">' + pb.icon + '</span>' +
                        '<span class="playbook-name">' + pb.name + '</span>' +
                        (isPrimary ? '<span class="preferred-badge">PRIMARY</span>' : '') +
                        (isForced ? '<span class="preferred-badge forced-badge">FORCED</span>' : '') +
                    '</div>' +
                    '<div class="playbook-card-desc">' + pb.description + '</div>' +
                    '<div class="playbook-when-applies"><strong>When:</strong> ' + pb.whenApplies + '</div>' +
                    '<div class="playbook-card-meta">' +
                        '<span class="meta-item">' + (pb.tradeable ? 'Min Score: ' + pb.minScore : 'Non-Tradeable') + '</span>' +
                        '<span class="meta-item">' + (RISK_PROFILES[pb.riskProfile] ? RISK_PROFILES[pb.riskProfile].label : '') + '</span>' +
                    '</div>' +
                    stepsHtml +
                    invHtml +
                    (isSelected ? '<div class="selected-indicator">&#x2714; SELECTED</div>' : '') +
                '</div>';
        });

        // Execution model cards
        var executionHtml = '';
        if (state.selectedPlaybook && PLAYBOOKS[state.selectedPlaybook] && PLAYBOOKS[state.selectedPlaybook].tradeable) {
            var allowedModels = PLAYBOOK_EXECUTION_MAP[state.selectedPlaybook] || [];
            if (allowedModels.length > 0) {
                executionHtml = '<div class="execution-model-section">' +
                    '<h4 class="section-subtitle">2. Select Execution Model</h4>' +
                    '<div class="execution-cards">';

                allowedModels.forEach(function(modelId) {
                    var model = EXECUTION_MODELS[modelId];
                    if (!model) return;
                    var isSelected = state.selectedExecutionModel === modelId;
                    executionHtml +=
                        '<div class="execution-card ' + (isSelected ? 'selected' : '') + '"' +
                             ' onclick="PlaybookModule.handleExecutionSelect(\'' + modelId + '\')">' +
                            '<div class="execution-card-header">' +
                                '<span class="execution-icon">' + model.icon + '</span>' +
                                '<span class="execution-name">' + model.name + '</span>' +
                            '</div>' +
                            '<div class="execution-card-desc">' + model.description + '</div>' +
                            (isSelected ? '<div class="selected-indicator">&#x2714; SELECTED</div>' : '') +
                        '</div>';
                });
                executionHtml += '</div></div>';
            }
        }

        // Lock button
        var lockButtonHtml = '';
        var canLock = false;
        if (state.selectedPlaybook) {
            var selPb = PLAYBOOKS[state.selectedPlaybook];
            if (selPb && !selPb.tradeable) {
                canLock = true;
            } else if (state.selectedExecutionModel) {
                canLock = true;
            }
        }
        if (canLock) {
            var selPbLock = PLAYBOOKS[state.selectedPlaybook];
            var lockLabel = selPbLock && selPbLock.tradeable
                ? '&#x1F512; Lock Selection &amp; Proceed to Pre-Trade'
                : '&#x1F512; Lock ' + (selPbLock ? selPbLock.name : '') + ' Mode';
            lockButtonHtml =
                '<div class="playbook-lock-section">' +
                    '<button class="btn btn-primary btn-lg" onclick="PlaybookModule.handleLockSelection()">' + lockLabel + '</button>' +
                    '<p class="lock-warning">Once locked, you cannot change playbook for this trade.</p>' +
                '</div>';
        }

        // Forbidden section
        var matrix = REGIME_PLAYBOOK_MATRIX[regimeKey];
        var forbiddenHtml = '';
        if (matrix && matrix.forbidden && matrix.forbidden.length > 0) {
            var forbiddenItems = matrix.forbidden.map(function(pbId) {
                var pb = PLAYBOOKS[pbId];
                return pb ? '<span class="forbidden-item">' + pb.shortName + '</span>' : '';
            }).join('');
            forbiddenHtml =
                '<div class="playbook-forbidden-section">' +
                    '<h4 class="section-subtitle forbidden-title">&#x26D4; Forbidden in ' + regime.toUpperCase() + ' Regime</h4>' +
                    '<div class="forbidden-list">' + forbiddenItems + '</div>' +
                    '<p class="forbidden-note">' + matrix.note + '</p>' +
                '</div>';
        }

        container.innerHTML =
            '<div class="playbook-selection-header">' +
                '<div class="regime-context">' +
                    '<span class="context-label">Regime:</span>' +
                    '<span class="context-value regime-' + regimeKey + '">' + regime.toUpperCase() + '</span>' +
                    '<span class="context-label">Permission:</span>' +
                    '<span class="context-value permission-' + (permission || 'unknown').toLowerCase() + '">' + (permission || 'N/A') + '</span>' +
                '</div>' +
                '<div class="selection-rule">' +
                    '<strong>RULE:</strong> Name your playbook BEFORE looking at the setup. UTCC is a filter, not a generator.' +
                '</div>' +
            '</div>' +
            '<h4 class="section-subtitle">1. Select Playbook</h4>' +
            '<div class="playbook-cards">' + cardsHtml + '</div>' +
            executionHtml +
            lockButtonHtml +
            forbiddenHtml;
    }

    function renderLockedSelection(container, state) {
        var pb = PLAYBOOKS[state.selectedPlaybook];
        if (!pb) return;
        var model = state.selectedExecutionModel ? EXECUTION_MODELS[state.selectedExecutionModel] : null;

        var executionInfo = model
            ? '<div class="locked-execution"><span class="locked-label">Execution:</span><span class="locked-value">' + model.icon + ' ' + model.name + '</span></div>'
            : '';

        var stepsHtml = '';
        if (pb.executionSteps && pb.executionSteps.length > 0) {
            stepsHtml =
                '<div class="locked-criteria">' +
                    '<div class="criteria-title">' + (pb.tradeable ? '&#x1F4CB; Execution Steps:' : 'What You Do:') + '</div>' +
                    '<ol class="criteria-list">' +
                        pb.executionSteps.map(function(s) { return '<li>' + s + '</li>'; }).join('') +
                    '</ol>' +
                '</div>';
        }

        var invHtml = '';
        if (pb.invalidation && pb.invalidation.length > 0) {
            invHtml =
                '<div class="locked-forbidden">' +
                    '<div class="forbidden-title">&#x26D4; Invalidation Rules:</div>' +
                    '<ul class="forbidden-list-detail">' +
                        pb.invalidation.map(function(inv) { return '<li>' + inv + '</li>'; }).join('') +
                    '</ul>' +
                '</div>';
        }

        var actionsHtml = pb.tradeable
            ? '<div class="locked-actions">' +
                '<button class="btn btn-primary" onclick="showTab(\'validation\')">&#x27A1; Proceed to Pre-Trade Validation</button>' +
                '<button class="btn btn-secondary btn-sm" onclick="PlaybookModule.handleResetSelection()">Reset Selection</button>' +
              '</div>'
            : '<div class="locked-actions">' +
                '<button class="btn btn-secondary btn-sm" onclick="PlaybookModule.handleResetSelection()">Reset Selection</button>' +
              '</div>';

        container.innerHTML =
            '<div class="playbook-locked-state">' +
                '<div class="locked-header">' +
                    '<span class="locked-icon">&#x1F512;</span>' +
                    '<span class="locked-title">' + pb.name.toUpperCase() + ' LOCKED</span>' +
                    '<span class="locked-time">' + new Date(state.selectionTimestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
                '</div>' +
                '<div class="locked-selection">' +
                    '<div class="locked-playbook"><span class="locked-label">Playbook:</span><span class="locked-value">' + pb.icon + ' ' + pb.name + '</span></div>' +
                    executionInfo +
                    (pb.riskMultiplier > 0 ? '<div class="locked-risk"><span class="locked-label">Risk:</span><span class="locked-value">' + RISK_PROFILES[pb.riskProfile].label + '</span></div>' : '') +
                '</div>' +
                '<div class="locked-definition"><div class="definition-text">' + pb.definition + '</div></div>' +
                stepsHtml +
                invHtml +
                actionsHtml +
            '</div>';
    }

    /**
     * Render compact playbook briefing card for Dashboard
     */
    function renderPlaybookBriefingCard() {
        var state = loadState();

        if (!state.selectedPlaybook || !state.selectionLocked) {
            return '<div class="dc-playbook-card dc-playbook-not-set">' +
                '<div class="dc-playbook-alert">' +
                    '<span>&#x1F4CB;</span>' +
                    '<div>' +
                        '<strong>No Playbook Selected</strong>' +
                        '<p>Complete Regime &#x27A1; Playbook workflow to activate</p>' +
                    '</div>' +
                    '<button class="btn btn-secondary btn-sm" onclick="showTab(\'playbook\')">Select Playbook &#x27A1;</button>' +
                '</div>' +
            '</div>';
        }

        var pb = PLAYBOOKS[state.selectedPlaybook];
        if (!pb) return '';
        var model = state.selectedExecutionModel ? EXECUTION_MODELS[state.selectedExecutionModel] : null;

        var permClass = pb.tradeable ? 'active' : (pb.blockAllWorkflow ? 'standdown' : 'observation');

        return '<div class="dc-playbook-card dc-playbook-' + permClass + '">' +
            '<div class="dc-playbook-header">' +
                '<span>&#x1F4CB; Active Playbook: ' + pb.name.toUpperCase() + '</span>' +
                (model ? '<span class="dc-playbook-execution">' + model.icon + ' ' + model.shortName + '</span>' : '') +
            '</div>' +
            '<div class="dc-playbook-definition">' + pb.definition + '</div>' +
        '</div>';
    }

    // ============================================
    // LEAKAGE WARNING RENDERING
    // ============================================
    function renderLeakageWarnings(containerId, tradeData) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var warnings = checkLeakage(tradeData);
        if (warnings.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        var html = '';
        warnings.forEach(function(w) {
            var isCrit = w.action === 'block';
            html +=
                '<div class="leakage-warning ' + (isCrit ? 'critical' : 'warning') + '">' +
                    '<div class="warning-header">' +
                        '<span class="warning-icon">' + (isCrit ? '&#x1F6D1;' : '&#x26A0;') + '</span>' +
                        '<span class="warning-title">' + w.title + '</span>' +
                        '<span class="warning-badge">' + (isCrit ? 'BLOCKED' : 'WARNING') + '</span>' +
                    '</div>' +
                    '<div class="warning-message">' + w.message + '</div>' +
                '</div>';
        });
        container.innerHTML = html;
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================
    function handlePlaybookSelect(playbookId) {
        selectPlaybook(playbookId);
        renderPlaybookSelection('playbook-selection-container');
    }

    function handleExecutionSelect(modelId) {
        selectExecutionModel(modelId);
        renderPlaybookSelection('playbook-selection-container');
    }

    function handleLockSelection() {
        var result = lockSelection();
        if (result.success) {
            renderPlaybookSelection('playbook-selection-container');
            if (typeof refreshDashboardBriefing === 'function') {
                refreshDashboardBriefing();
            }
        } else {
            alert(result.reason);
        }
    }

    function handleResetSelection() {
        if (confirm('Reset playbook selection? You will need to select again before trading.')) {
            resetSelection();
            renderPlaybookSelection('playbook-selection-container');
            if (typeof refreshDashboardBriefing === 'function') {
                refreshDashboardBriefing();
            }
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.PlaybookModule = {
        PLAYBOOKS: PLAYBOOKS,
        EXECUTION_MODELS: EXECUTION_MODELS,
        REGIME_PLAYBOOK_MATRIX: REGIME_PLAYBOOK_MATRIX,
        PLAYBOOK_EXECUTION_MAP: PLAYBOOK_EXECUTION_MAP,
        LEAKAGE_WARNINGS: LEAKAGE_WARNINGS,
        RISK_PROFILES: RISK_PROFILES,

        getAvailablePlaybooks: getAvailablePlaybooks,
        getForcedPlaybook: getForcedPlaybook,
        isPrimaryPlaybook: isPrimaryPlaybook,
        selectPlaybook: selectPlaybook,
        selectExecutionModel: selectExecutionModel,
        lockSelection: lockSelection,
        resetSelection: resetSelection,
        getSelectedPlaybook: getSelectedPlaybook,
        getSelectedExecutionModel: getSelectedExecutionModel,
        isSelectionComplete: isSelectionComplete,

        checkLeakage: checkLeakage,
        hasBlockingLeakage: hasBlockingLeakage,
        getBlockingWarnings: getBlockingWarnings,

        canAccessPreTrade: canAccessPreTrade,

        loadState: loadState,

        renderPlaybookSelection: renderPlaybookSelection,
        renderPlaybookBriefingCard: renderPlaybookBriefingCard,
        renderLeakageWarnings: renderLeakageWarnings,
        handlePlaybookSelect: handlePlaybookSelect,
        handleExecutionSelect: handleExecutionSelect,
        handleLockSelection: handleLockSelection,
        handleResetSelection: handleResetSelection
    };

    console.log('Playbook Module v1.1.0 loaded - 5 institutional playbooks');

})();
