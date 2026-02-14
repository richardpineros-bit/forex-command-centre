// ============================================
// PLAYBOOK MODULE v1.0
// Behavioural Architecture for UTCC Trading
// ============================================
// Purpose: UTCC is a FILTER, not a GENERATOR
// Rule: If you cannot name the playbook BEFORE looking at UTCC, you don't trade
// ============================================

(function() {
    'use strict';

    // ============================================
    // STORAGE KEY
    // ============================================
    const PLAYBOOK_STORAGE_KEY = 'ftcc_playbook';

    // ============================================
    // PLAYBOOK DEFINITIONS
    // ============================================
    const PLAYBOOKS = {
        'trend-pullback': {
            id: 'trend-pullback',
            name: 'Trend Pullback Continuation',
            shortName: 'Trend Pullback',
            icon: '\u2197',  // ↗
            description: 'Enter on pullback to EMA in established trend',
            regimes: ['expansion'],
            sessions: ['tokyo', 'london', 'newyork'],
            minScore: 80,
            minTier: 'strong',
            executionModels: ['limit-pullback', 'break-retest'],
            criteria: [
                '4H UTCC Grade A alert fired',
                '1H EMAs stacked in trend direction',
                'Price at 1H EMA edge (not floating)',
                'Entry zone: HOT or OPTIMAL only',
                'R:R >= 1.5:1 from invalidation'
            ],
            forbidden: [
                'Entering at EXTENDED zone',
                'Entering without 1H confirmation',
                'Adding to position if moving against'
            ],
            targets: {
                tp1: '1R (partial 50%, move stop to BE)',
                tp2: 'Next structure or 2R'
            },
            riskProfile: 'standard'
        },

        'break-and-hold': {
            id: 'break-and-hold',
            name: 'Break-and-Hold Continuation',
            shortName: 'Break & Hold',
            icon: '\u2794',  // ➔
            description: 'Enter on retest after key level break',
            regimes: ['expansion'],
            sessions: ['tokyo', 'london', 'newyork'],
            minScore: 85,
            minTier: 'perfect',
            executionModels: ['break-retest'],
            criteria: [
                '4H UTCC Grade A+ alert',
                'Price broke key structure level',
                'Holding above/below broken level (retest)',
                'No immediate S/R ahead',
                'R:R >= 2:1'
            ],
            forbidden: [
                'Entering before retest confirms',
                'Chasing if price extends without retest',
                'Trading if level is ambiguous'
            ],
            targets: {
                tp1: '1.5R (hold 50%)',
                tp2: '2.5R or next major structure'
            },
            riskProfile: 'standard'
        },

        'range-fade': {
            id: 'range-fade',
            name: 'Range Fade',
            shortName: 'Range Fade',
            icon: '\u2194',  // ↔
            description: 'Fade at range extremes during contraction',
            regimes: ['contraction', 'balanced'],
            sessions: ['tokyo', 'london'],
            minScore: 75,
            minTier: 'ready',
            executionModels: ['limit-pullback'],
            criteria: [
                'Clear range (min 3 touches each boundary)',
                'Price at upper/lower 20% of range',
                'RSI showing divergence or extreme',
                'ATR percentile < 50%',
                'R:R >= 1.5:1 (target opposite boundary)'
            ],
            forbidden: [
                'Trading mid-range',
                'Trading if ATR is expanding',
                'Holding through range break'
            ],
            targets: {
                tp1: 'Range midpoint (50% close)',
                tp2: 'Opposite boundary'
            },
            riskProfile: 'reduced'  // 50% position size
        },

        'breakout-anticipation': {
            id: 'breakout-anticipation',
            name: 'Breakout Anticipation',
            shortName: 'Breakout Setup',
            icon: '\u25B3',  // △
            description: 'Position for breakout from compression',
            regimes: ['contraction', 'compression'],
            sessions: ['london', 'newyork'],
            minScore: 80,
            minTier: 'strong',
            executionModels: ['limit-pullback'],
            criteria: [
                'Clear compression pattern (triangle, flag, wedge)',
                'UTCC showing building score',
                'Volume declining into pattern',
                'ATR percentile 20-40% (compressed)',
                'Clear breakout level defined'
            ],
            forbidden: [
                'Market orders anticipating break',
                'Entering before level actually breaks',
                'Trading obvious/crowded breakouts'
            ],
            targets: {
                tp1: 'Measured move from pattern',
                tp2: 'Minimum 2R'
            },
            riskProfile: 'reduced-until-confirmed'
        },

        'london-open': {
            id: 'london-open',
            name: 'London Open Momentum',
            shortName: 'London Open',
            icon: '\u{1F1EC}',  // 🇬 (GB flag part)
            description: 'Capture London session directional move',
            regimes: ['expansion', 'transition'],  // Can catch transition turning to expansion
            sessions: ['london'],
            minScore: 80,
            minTier: 'strong',
            executionModels: ['market-confirmation', 'limit-pullback'],
            criteria: [
                'Asian session ranged or consolidated',
                'UTCC Grade A within first 2 London hours',
                'Clear direction established on 1H',
                '1H EMAs beginning to stack',
                'Not into major news window'
            ],
            forbidden: [
                'Trading if Asian range was already large',
                'Fading the London direction',
                'Entering after first 2 hours of London'
            ],
            targets: {
                tp1: '1R',
                tp2: 'Full London move (often 1.5-2x Asian range)'
            },
            riskProfile: 'standard',
            timeRestriction: {
                startHourAEST: 17,
                endHourAEST: 19
            }
        },

        'asia-range-break': {
            id: 'asia-range-break',
            name: 'Asia Range Break',
            shortName: 'Asia Break',
            icon: '\u{1F1EF}',  // 🇯 (JP flag part)
            description: 'Break of established Asian session range',
            regimes: ['balanced', 'contraction'],
            sessions: ['tokyo'],
            minScore: 75,
            minTier: 'ready',
            executionModels: ['break-retest'],
            criteria: [
                'Clear Asian range established (min 4 hours)',
                'Range boundaries tested at least twice',
                'Break with momentum (not just wick)',
                'Retest of broken level',
                'AUD or JPY pair preferred'
            ],
            forbidden: [
                'Entering on first touch of boundary',
                'Trading before range is established',
                'Chasing extended break without retest'
            ],
            targets: {
                tp1: 'Range height measured move',
                tp2: '1.5x range height'
            },
            riskProfile: 'reduced'
        }
    };

    // ============================================
    // EXECUTION MODELS
    // ============================================
    const EXECUTION_MODELS = {
        'limit-pullback': {
            id: 'limit-pullback',
            name: 'Limit Pullback',
            shortName: 'Limit',
            icon: '\u23F8',  // ⏸ (pause - wait)
            description: 'Place limit order at predetermined level, walk away',
            instructions: [
                'Identify exact entry level',
                'Place limit order',
                'Set stop and TP orders',
                'Walk away - no screen watching',
                'Order lives until filled or cancelled at session end'
            ],
            bestFor: 'Trend Pullback, Range Fade, Break-and-Hold retest'
        },
        'break-retest': {
            id: 'break-retest',
            name: 'Break-Retest',
            shortName: 'B&R',
            icon: '\u21BA',  // ↺ (return)
            description: 'Wait for level break, then retest confirmation',
            instructions: [
                'Identify key level',
                'Wait for clear break (not just wick)',
                'Wait for price to retest broken level',
                'Enter on confirmation candle at retest',
                'Stop below/above retest level'
            ],
            bestFor: 'Breakout Anticipation, London Open Momentum'
        },
        'market-confirmation': {
            id: 'market-confirmation',
            name: 'Market Confirmation',
            shortName: 'Market',
            icon: '\u26A1',  // ⚡ (lightning - fast)
            description: 'Market order on pattern completion',
            instructions: [
                'Wait for setup conditions',
                'Wait for confirmation pattern (engulfing, pin bar, etc.)',
                'Market order on pattern completion',
                'Immediate stop placement',
                'Use only for fast-moving setups'
            ],
            bestFor: 'London Open Momentum, Perfect signals with urgency'
        }
    };

    // ============================================
    // REGIME TO PLAYBOOK PERMISSION MATRIX
    // ============================================
    const REGIME_PLAYBOOK_MATRIX = {
        'expansion': {
            allowed: ['trend-pullback', 'break-and-hold', 'london-open'],
            forbidden: ['range-fade', 'breakout-anticipation'],
            note: 'Trend-following only. No counter-trend or range plays.'
        },
        'balanced': {
            allowed: ['range-fade', 'asia-range-break'],
            forbidden: ['trend-pullback', 'break-and-hold'],
            note: 'Range plays only. No trend continuation.'
        },
        'contraction': {
            allowed: ['range-fade', 'breakout-anticipation', 'asia-range-break'],
            forbidden: ['trend-pullback', 'break-and-hold', 'london-open'],
            note: 'Prepare for expansion. Range fades or breakout setups only.'
        },
        'compression': {
            allowed: ['breakout-anticipation'],
            forbidden: ['trend-pullback', 'break-and-hold', 'range-fade', 'london-open', 'asia-range-break'],
            note: 'Extreme compression. Only breakout anticipation with limit orders.'
        },
        'transition': {
            allowed: [],
            forbidden: ['trend-pullback', 'break-and-hold', 'range-fade', 'breakout-anticipation', 'london-open', 'asia-range-break'],
            note: 'NO TRADES. Wait for regime clarity.'
        }
    };

    // ============================================
    // SESSION RESTRICTIONS
    // ============================================
    const SESSION_PLAYBOOK_RESTRICTIONS = {
        'tokyo': {
            preferred: ['trend-pullback', 'asia-range-break'],
            allowed: ['range-fade', 'breakout-anticipation'],
            restricted: ['london-open'],  // Wrong session
            pairs: ['AUDUSD', 'USDJPY', 'AUDJPY', 'EURJPY', 'GBPJPY', 'NZDJPY', 'CADJPY', 'CHFJPY']
        },
        'london': {
            preferred: ['trend-pullback', 'london-open', 'break-and-hold'],
            allowed: ['range-fade', 'breakout-anticipation'],
            restricted: ['asia-range-break'],  // Wrong session
            pairs: ['EURUSD', 'GBPUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'GBPCHF']
        },
        'newyork': {
            preferred: ['trend-pullback', 'break-and-hold'],
            allowed: ['breakout-anticipation'],
            restricted: ['london-open', 'asia-range-break', 'range-fade'],  // Liquidity concerns
            pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'USDCHF']
        }
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
            trigger: (data) => data.score >= 85 && data.entryZone === 'extended',
            action: 'block'
        },
        'score-size-mismatch': {
            id: 'score-size-mismatch',
            severity: 'warning',
            title: 'POSITION SIZE ALERT',
            message: 'Score 75-79 requires 50% position size. Full size not permitted.',
            trigger: (data) => data.score >= 75 && data.score < 80 && data.positionSize === 'full',
            action: 'warn'
        },
        'regime-mismatch': {
            id: 'regime-mismatch',
            severity: 'critical',
            title: 'REGIME MISMATCH',
            message: 'Selected playbook is not permitted in current regime.',
            trigger: (data) => {
                const matrix = REGIME_PLAYBOOK_MATRIX[data.regime];
                return matrix && matrix.forbidden.includes(data.playbook);
            },
            action: 'block'
        },
        'late-session': {
            id: 'late-session',
            severity: 'warning',
            title: 'LATE SESSION WARNING',
            message: 'After 9:30pm AEST. New entries not recommended. Consider this tomorrow\'s opportunity.',
            trigger: (data) => {
                const now = new Date();
                const aestHour = parseInt(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }));
                const aestMin = parseInt(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', minute: '2-digit' }));
                return (aestHour === 21 && aestMin >= 30) || aestHour >= 22;
            },
            action: 'warn'
        },
        'override-high-conviction': {
            id: 'override-high-conviction',
            severity: 'critical',
            title: 'OVERRIDE ABUSE',
            message: 'Regime override active. Maximum 0.5R position. Full conviction not permitted.',
            trigger: (data) => data.hasOverride && data.conviction === 'high',
            action: 'block'
        },
        'correlation-risk': {
            id: 'correlation-risk',
            severity: 'warning',
            title: 'CORRELATION EXPOSURE',
            message: 'You have correlated positions open. Combined exposure may exceed risk limits.',
            trigger: (data) => data.correlatedPositions && data.correlatedPositions.length > 0,
            action: 'warn'
        },
        'transition-trade': {
            id: 'transition-trade',
            severity: 'critical',
            title: 'TRANSITION REGIME',
            message: 'Regime is TRANSITION. ZERO playbooks permitted. Wait for clarity.',
            trigger: (data) => data.regime === 'transition',
            action: 'block'
        },
        'almost-criteria': {
            id: 'almost-criteria',
            severity: 'warning',
            title: '4/5 IS NOT 5/5',
            message: 'One criterion failed. All criteria must pass. No exceptions.',
            trigger: (data) => data.criteriaPass === 4 && data.criteriaTrial === 5,
            action: 'warn'
        }
    };

    // ============================================
    // RISK PROFILES
    // ============================================
    const RISK_PROFILES = {
        'standard': {
            positionSize: 1.0,  // 100% of normal
            maxRisk: 0.02,      // 2%
            label: 'Standard (1.5-2%)'
        },
        'reduced': {
            positionSize: 0.5,  // 50% of normal
            maxRisk: 0.01,      // 1%
            label: 'Reduced (0.75-1%)'
        },
        'reduced-until-confirmed': {
            positionSize: 0.5,  // 50% until breakout confirms
            maxRisk: 0.01,
            label: 'Reduced until confirmed'
        },
        'override': {
            positionSize: 0.25, // 25% of normal (0.5R max)
            maxRisk: 0.005,     // 0.5%
            label: 'Override (0.5R max)'
        }
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    function getDefaultState() {
        return {
            version: '1.0',
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
            const data = localStorage.getItem(PLAYBOOK_STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                // Reset if from different day
                if (parsed.selectionTimestamp) {
                    const selDate = new Date(parsed.selectionTimestamp).toDateString();
                    const today = new Date().toDateString();
                    if (selDate !== today) {
                        return getDefaultState();
                    }
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
    function getAvailablePlaybooks(regime, session) {
        if (!regime || !session) return [];
        
        const regimeMatrix = REGIME_PLAYBOOK_MATRIX[regime];
        if (!regimeMatrix) return [];
        
        const sessionRestrictions = SESSION_PLAYBOOK_RESTRICTIONS[session];
        if (!sessionRestrictions) return [];
        
        // Get playbooks allowed by regime
        const regimeAllowed = regimeMatrix.allowed;
        
        // Filter by session restrictions
        const available = regimeAllowed.filter(pbId => {
            return !sessionRestrictions.restricted.includes(pbId);
        });
        
        // Sort by preference
        return available.sort((a, b) => {
            const aPreferred = sessionRestrictions.preferred.includes(a) ? 0 : 1;
            const bPreferred = sessionRestrictions.preferred.includes(b) ? 0 : 1;
            return aPreferred - bPreferred;
        });
    }

    function selectPlaybook(playbookId) {
        const state = loadState();
        
        if (!PLAYBOOKS[playbookId]) {
            console.error('Invalid playbook:', playbookId);
            return false;
        }
        
        state.selectedPlaybook = playbookId;
        state.selectedExecutionModel = null;  // Reset execution model
        state.selectionTimestamp = new Date().toISOString();
        state.selectionLocked = false;
        
        // Track usage
        if (!state.sessionStats.playbooksUsed[playbookId]) {
            state.sessionStats.playbooksUsed[playbookId] = 0;
        }
        state.sessionStats.playbooksUsed[playbookId]++;
        
        saveState(state);
        return true;
    }

    function selectExecutionModel(modelId) {
        const state = loadState();
        
        if (!EXECUTION_MODELS[modelId]) {
            console.error('Invalid execution model:', modelId);
            return false;
        }
        
        // Validate model is allowed for selected playbook
        if (state.selectedPlaybook) {
            const playbook = PLAYBOOKS[state.selectedPlaybook];
            if (!playbook.executionModels.includes(modelId)) {
                console.error('Execution model not allowed for this playbook');
                return false;
            }
        }
        
        state.selectedExecutionModel = modelId;
        saveState(state);
        return true;
    }

    function lockSelection() {
        const state = loadState();
        
        if (!state.selectedPlaybook || !state.selectedExecutionModel) {
            return { success: false, reason: 'Playbook and execution model must be selected' };
        }
        
        state.selectionLocked = true;
        saveState(state);
        return { success: true };
    }

    function resetSelection() {
        const state = loadState();
        state.selectedPlaybook = null;
        state.selectedExecutionModel = null;
        state.selectionTimestamp = null;
        state.selectionLocked = false;
        state.leakageWarnings = [];
        saveState(state);
    }

    function getSelectedPlaybook() {
        const state = loadState();
        if (!state.selectedPlaybook) return null;
        return PLAYBOOKS[state.selectedPlaybook];
    }

    function getSelectedExecutionModel() {
        const state = loadState();
        if (!state.selectedExecutionModel) return null;
        return EXECUTION_MODELS[state.selectedExecutionModel];
    }

    function isSelectionComplete() {
        const state = loadState();
        return state.selectedPlaybook && state.selectedExecutionModel && state.selectionLocked;
    }

    // ============================================
    // LEAKAGE DETECTION
    // ============================================
    function checkLeakage(tradeData) {
        const warnings = [];
        
        Object.values(LEAKAGE_WARNINGS).forEach(warning => {
            try {
                if (warning.trigger(tradeData)) {
                    warnings.push({
                        ...warning,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (e) {
                // Trigger function failed, skip this warning
            }
        });
        
        // Save warnings to state
        const state = loadState();
        state.leakageWarnings = warnings;
        
        // Track leakage stats
        warnings.forEach(w => {
            if (!state.sessionStats.leakageTriggered[w.id]) {
                state.sessionStats.leakageTriggered[w.id] = 0;
            }
            state.sessionStats.leakageTriggered[w.id]++;
        });
        
        saveState(state);
        
        return warnings;
    }

    function hasBlockingLeakage(tradeData) {
        const warnings = checkLeakage(tradeData);
        return warnings.some(w => w.action === 'block');
    }

    function getBlockingWarnings(tradeData) {
        const warnings = checkLeakage(tradeData);
        return warnings.filter(w => w.action === 'block');
    }

    // ============================================
    // PRE-TRADE ACCESS GATING
    // ============================================
    function canAccessPreTrade() {
        const state = loadState();
        
        // Must have playbook selected
        if (!state.selectedPlaybook) {
            return { 
                allowed: false, 
                reason: 'Select a playbook first. You must name your playbook BEFORE seeing the setup.',
                step: 'playbook'
            };
        }
        
        // Must have execution model selected
        if (!state.selectedExecutionModel) {
            return { 
                allowed: false, 
                reason: 'Select an execution model for your playbook.',
                step: 'execution'
            };
        }
        
        // Must be locked
        if (!state.selectionLocked) {
            return { 
                allowed: false, 
                reason: 'Lock your playbook selection to proceed.',
                step: 'lock'
            };
        }
        
        return { allowed: true };
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.PlaybookModule = {
        // Data access
        PLAYBOOKS: PLAYBOOKS,
        EXECUTION_MODELS: EXECUTION_MODELS,
        REGIME_PLAYBOOK_MATRIX: REGIME_PLAYBOOK_MATRIX,
        SESSION_PLAYBOOK_RESTRICTIONS: SESSION_PLAYBOOK_RESTRICTIONS,
        LEAKAGE_WARNINGS: LEAKAGE_WARNINGS,
        RISK_PROFILES: RISK_PROFILES,
        
        // Core functions
        getAvailablePlaybooks: getAvailablePlaybooks,
        selectPlaybook: selectPlaybook,
        selectExecutionModel: selectExecutionModel,
        lockSelection: lockSelection,
        resetSelection: resetSelection,
        getSelectedPlaybook: getSelectedPlaybook,
        getSelectedExecutionModel: getSelectedExecutionModel,
        isSelectionComplete: isSelectionComplete,
        
        // Leakage detection
        checkLeakage: checkLeakage,
        hasBlockingLeakage: hasBlockingLeakage,
        getBlockingWarnings: getBlockingWarnings,
        
        // Gating
        canAccessPreTrade: canAccessPreTrade,
        
        // State
        loadState: loadState,
        resetSelection: resetSelection
    };

    console.log('Playbook Module v1.0 loaded');

    // ============================================
    // UI RENDERING FUNCTIONS
    // ============================================

    function renderPlaybookSelection(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const state = loadState();
        
        // Get current regime and session from RegimeModule
        let regime = null;
        let session = null;
        
        if (window.RegimeModule) {
            const regimeData = window.RegimeModule.loadRegimeData();
            if (regimeData.dailyContext) {
                regime = regimeData.dailyContext.marketState;
            }
            session = window.RegimeModule.getActiveSession();
        }

        // If selection is locked, show locked state
        if (state.selectionLocked && state.selectedPlaybook) {
            renderLockedSelection(container, state);
            return;
        }

        // Check if regime is set
        if (!regime) {
            container.innerHTML = `
                <div class="playbook-gate-warning">
                    <span class="gate-icon">\u26A0</span>
                    <div class="gate-content">
                        <div class="gate-title">Complete Regime Assessment First</div>
                        <div class="gate-message">You must set your Daily Context before selecting a playbook.</div>
                        <button class="btn btn-primary" onclick="showTab('regime')">Go to Regime</button>
                    </div>
                </div>
            `;
            return;
        }

        // Check for transition regime
        if (regime === 'transition') {
            container.innerHTML = `
                <div class="playbook-gate-blocked">
                    <span class="gate-icon">&#x1F6D1;</span>
                    <div class="gate-content">
                        <div class="gate-title">REGIME: TRANSITION</div>
                        <div class="gate-message">Zero playbooks permitted. Wait for regime clarity before trading.</div>
                        <div class="gate-note">This is not a limitation - it's protection from low-edge environments.</div>
                    </div>
                </div>
            `;
            return;
        }

        // Get available playbooks
        const availableIds = getAvailablePlaybooks(regime, session);
        
        if (availableIds.length === 0) {
            container.innerHTML = `
                <div class="playbook-gate-warning">
                    <span class="gate-icon">\u26A0</span>
                    <div class="gate-content">
                        <div class="gate-title">No Playbooks Available</div>
                        <div class="gate-message">Current regime (${regime.toUpperCase()}) and session (${session ? session.toUpperCase() : 'unknown'}) combination has no permitted playbooks.</div>
                    </div>
                </div>
            `;
            return;
        }

        // Build playbook cards
        let cardsHtml = '';
        availableIds.forEach(pbId => {
            const pb = PLAYBOOKS[pbId];
            const isSelected = state.selectedPlaybook === pbId;
            const sessionInfo = SESSION_PLAYBOOK_RESTRICTIONS[session];
            const isPreferred = sessionInfo && sessionInfo.preferred.includes(pbId);
            
            cardsHtml += `
                <div class="playbook-card ${isSelected ? 'selected' : ''} ${isPreferred ? 'preferred' : ''}" 
                     onclick="PlaybookModule.handlePlaybookSelect('${pbId}')">
                    <div class="playbook-card-header">
                        <span class="playbook-icon">${pb.icon}</span>
                        <span class="playbook-name">${pb.shortName}</span>
                        ${isPreferred ? '<span class="preferred-badge">PREFERRED</span>' : ''}
                    </div>
                    <div class="playbook-card-desc">${pb.description}</div>
                    <div class="playbook-card-meta">
                        <span class="meta-item">Min: ${pb.minTier.toUpperCase()}</span>
                        <span class="meta-item">${pb.riskProfile === 'standard' ? 'Full Size' : '50% Size'}</span>
                    </div>
                    ${isSelected ? '<div class="selected-indicator">\u2714 SELECTED</div>' : ''}
                </div>
            `;
        });

        // Build execution model cards (only if playbook selected)
        let executionHtml = '';
        if (state.selectedPlaybook) {
            const pb = PLAYBOOKS[state.selectedPlaybook];
            executionHtml = `
                <div class="execution-model-section">
                    <h4 class="section-subtitle">2. Select Execution Model</h4>
                    <div class="execution-cards">
            `;
            
            pb.executionModels.forEach(modelId => {
                const model = EXECUTION_MODELS[modelId];
                const isSelected = state.selectedExecutionModel === modelId;
                
                executionHtml += `
                    <div class="execution-card ${isSelected ? 'selected' : ''}"
                         onclick="PlaybookModule.handleExecutionSelect('${modelId}')">
                        <div class="execution-card-header">
                            <span class="execution-icon">${model.icon}</span>
                            <span class="execution-name">${model.name}</span>
                        </div>
                        <div class="execution-card-desc">${model.description}</div>
                        ${isSelected ? '<div class="selected-indicator">\u2714 SELECTED</div>' : ''}
                    </div>
                `;
            });
            
            executionHtml += `
                    </div>
                </div>
            `;
        }

        // Lock button
        let lockButtonHtml = '';
        if (state.selectedPlaybook && state.selectedExecutionModel) {
            lockButtonHtml = `
                <div class="playbook-lock-section">
                    <button class="btn btn-primary btn-lg" onclick="PlaybookModule.handleLockSelection()">
                        &#x1F512; Lock Selection & Proceed to Pre-Trade
                    </button>
                    <p class="lock-warning">Once locked, you cannot change playbook for this trade.</p>
                </div>
            `;
        }

        // Render full UI
        container.innerHTML = `
            <div class="playbook-selection-header">
                <div class="regime-context">
                    <span class="context-label">Current Regime:</span>
                    <span class="context-value regime-${regime}">${regime.toUpperCase()}</span>
                    <span class="context-label">Session:</span>
                    <span class="context-value">${session ? session.toUpperCase() : 'N/A'}</span>
                </div>
                <div class="selection-rule">
                    <strong>RULE:</strong> Name your playbook BEFORE looking at the setup. UTCC is a filter, not a generator.
                </div>
            </div>
            
            <h4 class="section-subtitle">1. Select Playbook</h4>
            <div class="playbook-cards">
                ${cardsHtml}
            </div>
            
            ${executionHtml}
            ${lockButtonHtml}
            
            <div class="playbook-forbidden-section">
                <h4 class="section-subtitle forbidden-title">\u26D4 Forbidden in ${regime.toUpperCase()} Regime</h4>
                <div class="forbidden-list">
                    ${REGIME_PLAYBOOK_MATRIX[regime].forbidden.map(pbId => {
                        const pb = PLAYBOOKS[pbId];
                        return pb ? `<span class="forbidden-item">${pb.shortName}</span>` : '';
                    }).join('')}
                </div>
                <p class="forbidden-note">${REGIME_PLAYBOOK_MATRIX[regime].note}</p>
            </div>
        `;
    }

    function renderLockedSelection(container, state) {
        const pb = PLAYBOOKS[state.selectedPlaybook];
        const model = EXECUTION_MODELS[state.selectedExecutionModel];
        
        container.innerHTML = `
            <div class="playbook-locked-state">
                <div class="locked-header">
                    <span class="locked-icon">&#x1F512;</span>
                    <span class="locked-title">PLAYBOOK LOCKED</span>
                    <span class="locked-time">${new Date(state.selectionTimestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                
                <div class="locked-selection">
                    <div class="locked-playbook">
                        <span class="locked-label">Playbook:</span>
                        <span class="locked-value">${pb.icon} ${pb.name}</span>
                    </div>
                    <div class="locked-execution">
                        <span class="locked-label">Execution:</span>
                        <span class="locked-value">${model.icon} ${model.name}</span>
                    </div>
                </div>
                
                <div class="locked-criteria">
                    <div class="criteria-title">Required Criteria:</div>
                    <ul class="criteria-list">
                        ${pb.criteria.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="locked-forbidden">
                    <div class="forbidden-title">\u26D4 Forbidden Actions:</div>
                    <ul class="forbidden-list-detail">
                        ${pb.forbidden.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="locked-actions">
                    <button class="btn btn-primary" onclick="showTab('validation')">
                        \u2192 Proceed to Pre-Trade Validation
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="PlaybookModule.handleResetSelection()">
                        Reset Selection
                    </button>
                </div>
            </div>
        `;
    }

    // ============================================
    // UI EVENT HANDLERS
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
        const result = lockSelection();
        if (result.success) {
            renderPlaybookSelection('playbook-selection-container');
        } else {
            alert(result.reason);
        }
    }

    function handleResetSelection() {
        if (confirm('Reset playbook selection? You will need to select again before trading.')) {
            resetSelection();
            renderPlaybookSelection('playbook-selection-container');
        }
    }

    // ============================================
    // LEAKAGE WARNING RENDERING
    // ============================================
    function renderLeakageWarnings(containerId, tradeData) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const warnings = checkLeakage(tradeData);
        
        if (warnings.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        const blockingWarnings = warnings.filter(w => w.action === 'block');
        const nonBlockingWarnings = warnings.filter(w => w.action === 'warn');
        
        let html = '';
        
        // Critical (blocking) warnings
        blockingWarnings.forEach(w => {
            html += `
                <div class="leakage-warning critical">
                    <div class="warning-header">
                        <span class="warning-icon">&#x1F6D1;</span>
                        <span class="warning-title">${w.title}</span>
                        <span class="warning-badge">BLOCKED</span>
                    </div>
                    <div class="warning-message">${w.message}</div>
                </div>
            `;
        });
        
        // Non-blocking warnings
        nonBlockingWarnings.forEach(w => {
            html += `
                <div class="leakage-warning warning">
                    <div class="warning-header">
                        <span class="warning-icon">\u26A0</span>
                        <span class="warning-title">${w.title}</span>
                        <span class="warning-badge">WARNING</span>
                    </div>
                    <div class="warning-message">${w.message}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    // Add to public API
    window.PlaybookModule.renderPlaybookSelection = renderPlaybookSelection;
    window.PlaybookModule.renderLeakageWarnings = renderLeakageWarnings;
    window.PlaybookModule.handlePlaybookSelect = handlePlaybookSelect;
    window.PlaybookModule.handleExecutionSelect = handleExecutionSelect;
    window.PlaybookModule.handleLockSelection = handleLockSelection;
    window.PlaybookModule.handleResetSelection = handleResetSelection;

})();
