// ============================================
// CIRCUIT BREAKER MODULE v1.0
// Supervisory Risk Management Layer
// ============================================
// IMPLEMENTS: circuit-breaker-architecture-v1.1.md (LOCKED)
// AUTHORITY: Veto only - cannot initiate trades
// PRINCIPLE: System assumes trader will act irrationally
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONSTANTS & CONFIGURATION
    // ============================================
    
    const STORAGE_KEY = 'ftcc_circuit_breaker';
    const SPEC_VERSION = '1.1';  // Locked spec version
    const MODULE_VERSION = '1.4';  // Risk single-source-of-truth, complete session reset, precedence hierarchy
    
    // Thresholds (from locked spec)
    const THRESHOLDS = {
        // Playbook
        PLAYBOOK_CONSECUTIVE_FAILURES: 2,
        PLAYBOOK_EXPECTANCY_MIN_TRADES: 10,
        
        // Behavioural
        LEAKAGE_BLOCKS_FOR_LOCKOUT: 2,
        LEAKAGE_WARNINGS_FOR_RISK_REDUCTION: 3,
        CONSECUTIVE_LOSSES_FOR_TREND_DISABLE: 3,
        
        // Daily Loss Tiers (SPEC CLARIFICATION - not stand-down at -3%)
        // -3%: Risk CAPPED at 50% (trading continues with reduced risk)
        // -5%: 24h STAND-DOWN (no trading)
        // -10%: 48h EMERGENCY STAND-DOWN (persists across days)
        DAILY_LOSS_CAP_PERCENT: -3,       // Risk cap only, NOT stand-down
        DAILY_LOSS_STANDDOWN_PERCENT: -5, // 24h stand-down
        DAILY_LOSS_EMERGENCY_PERCENT: -10, // 48h emergency stand-down
        
        // Lockout
        LEAKAGE_LOCKOUT_MINUTES: 90,
        LEAKAGE_LOCKOUT_MAX_EXTENSIONS: 2,
        
        // Pair
        PAIR_CONSECUTIVE_LOSSES_FOR_COOLING: 2,
        PAIR_COOLDOWN_HOURS: 48,
        
        // Execution
        MAX_EXECUTION_ATTEMPTS_PER_PAIR: 3,
        
        // Execution Timeout Rules (bars on 4H timeframe)
        TIMEOUT_LIMIT_PULLBACK: 'session_end',  // Special: ends with session
        TIMEOUT_BREAK_RETEST_4H: 4,             // 4 bars on 4H = 16 hours
        TIMEOUT_BREAK_RETEST_1H: 8,             // 8 bars on 1H = 8 hours
        TIMEOUT_MARKET_CONFIRMATION_4H: 2,     // 2 bars on 4H = 8 hours
        TIMEOUT_MARKET_CONFIRMATION_1H: 4,     // 4 bars on 1H = 4 hours
        
        // Time Decay
        TIME_DECAY_THRESHOLD_1_HOURS: 4,
        TIME_DECAY_THRESHOLD_2_HOURS: 6,
        TIME_DECAY_FACTOR_1: 0.85,
        TIME_DECAY_FACTOR_2: 0.70,
        TIME_DECAY_POST_LONDON: 0.50,
        
        // Risk
        RISK_FLOOR: 0.25,
        RISK_REDUCTION_FIRST_LOSS: 0.75,
        RISK_REDUCTION_SECOND_LOSS: 0.67,
        RISK_REDUCTION_LEAKAGE_WARNING: 0.75,
        RISK_REDUCTION_REVENGE_ATTEMPT: 0.75,
        RISK_CAP_REDUCED_MODE: 0.50
    };

    // Enums
    const STAND_DOWN_REASONS = {
        LOSS_STREAK: 'loss_streak',
        LEAKAGE_LIMIT: 'leakage_limit',
        DAILY_LOSS_CAP: 'daily_loss_cap',
        DAILY_LOSS_STANDDOWN: 'daily_loss_standdown',
        DAILY_LOSS_EMERGENCY: 'daily_loss_emergency',
        DRAWDOWN_PROTOCOL: 'drawdown_protocol'
    };

    const STAND_DOWN_LEVELS = {
        CAP: 'cap',
        STANDDOWN: 'standdown',
        EMERGENCY: 'emergency'
    };

    const PLAYBOOK_DISABLE_REASONS = {
        CONSECUTIVE_FAILURES: 'consecutive_failures',
        EXPECTANCY_NEGATIVE: 'expectancy_negative',
        LOSS_STREAK_TREND: 'loss_streak_trend'
    };

    const PAIR_COOLING_REASONS = {
        CONSECUTIVE_LOSSES: 'consecutive_losses',
        REVENGE_COOLDOWN: 'revenge_cooldown'
    };

    const TRADE_RESULTS = {
        WIN: 'win',
        LOSS: 'loss',
        BREAKEVEN: 'breakeven'
    };

    const EXECUTION_MODELS = {
        LIMIT_PULLBACK: 'limit-pullback',
        BREAK_RETEST: 'break-retest',
        MARKET_CONFIRMATION: 'market-confirmation'
    };

    const EXECUTION_STATUS = {
        PENDING: 'pending',
        TRIGGERED: 'triggered',
        ABANDONED: 'abandoned',
        TIMED_OUT: 'timed_out',
        INVALIDATED: 'invalidated'
    };

    const INVALIDATION_REASONS = {
        TIMEOUT: 'timeout',
        PRICE_BEYOND_EMA: 'price_beyond_ema',           // Limit Pullback
        RETEST_FAILED: 'retest_failed',                 // Break-Retest
        NO_RETEST: 'no_retest_within_timeout',          // Break-Retest
        PATTERN_NEGATED: 'confirmation_pattern_negated', // Market Confirmation
        SESSION_END: 'session_ended',
        MANUAL_ABANDON: 'manual_abandon'
    };

    const NON_TRADE_REASONS = {
        EXECUTION_TIMEOUT: 'execution_timeout',
        STRUCTURAL_INVALIDATION: 'structural_invalidation',
        LEAKAGE_BLOCK: 'leakage_block',
        PLAYBOOK_DISABLED: 'playbook_disabled',
        PAIR_COOLING: 'pair_cooling',
        SESSION_LOCKOUT: 'session_lockout',
        LEAKAGE_LOCKOUT: 'leakage_lockout',
        STAND_DOWN: 'stand_down',
        RISK_CAP_REACHED: 'risk_cap_reached',
        VOLUNTARY_PASS: 'voluntary_pass',
        REGIME_MISMATCH: 'regime_mismatch',
        CRITERIA_INCOMPLETE: 'criteria_incomplete',
        REVENGE_BLOCKED: 'revenge_blocked',
        REVIEW_REQUIRED: 'review_required'
    };

    const TREND_PLAYBOOKS = [
        'trend-pullback',
        'break-and-hold',
        'london-open'
    ];

    // ============================================
    // STATE SCHEMAS
    // ============================================

    function createGlobalState() {
        return {
            // Session
            sessionId: null,
            sessionType: null,
            sessionStartTime: null,
            sessionActive: false,
            
            // Stand-Down
            standDownActive: false,
            standDownReason: null,
            standDownUntil: null,
            standDownLevel: null,
            
            // Risk
            riskMultiplier: 1.0,
            riskFloor: THRESHOLDS.RISK_FLOOR,
            riskReductionReason: null,
            riskCapped: false,
            
            // Tracking
            tradesToday: 0,
            lossesToday: 0,
            winsToday: 0,
            breakevenToday: 0,
            dailyPnLPercent: 0,
            
            // Time Decay
            sessionHoursElapsed: 0,
            timeDecayActive: false,
            timeDecayFactor: 1.0
        };
    }

    function createPlaybookState(playbookId, sessionId) {
        return {
            playbookId: playbookId,
            sessionId: sessionId,
            
            // Failure Tracking
            consecutiveFailures: 0,
            totalFailures: 0,
            totalWins: 0,
            totalBreakeven: 0,
            
            // Disable State
            disabled: false,
            disabledReason: null,
            disabledAt: null,
            reenableAt: null,
            
            // Result Tracking
            lastTradeResult: null,
            lastTradeTime: null,
            
            // Expectancy
            sessionTradeCount: 0,
            sessionExpectancy: null,
            expectancyValid: false,
            sessionTotalR: 0  // Sum of R for expectancy calc
        };
    }

    function createBehaviouralState(sessionId) {
        return {
            sessionId: sessionId,
            
            // Leakage
            leakageWarningsCount: 0,
            leakageBlocksCount: 0,
            leakageTypes: [],
            lastLeakageTime: null,
            lastLeakageType: null,
            
            // Leakage Lockout
            leakageLockoutActive: false,
            leakageLockoutUntil: null,
            leakageLockoutExtensions: 0,
            leakageDuringLockout: false,  // FIX #1: Track leakage during lockout
            
            // Loss Streak
            consecutiveLosses: 0,
            consecutiveLossesMax: 0,
            
            // Risk Mode
            reducedRiskMode: false,
            reducedRiskReason: null,
            reducedRiskSince: null,
            
            // Behavioural Flags
            revengeTradeAttempt: false,
            revengeTradeCount: 0,
            revengeFlaggedForReview: false,
            oversizeAttempt: false,
            ruleNegotiationAttempt: false
        };
    }

    function createPairState(pair, sessionId) {
        return {
            pair: pair,
            sessionId: sessionId,
            
            // Tracking
            tradesToday: 0,
            lossesToday: 0,
            winsToday: 0,
            consecutiveLosses: 0,
            
            // Cooling
            coolingActive: false,
            coolingReason: null,
            coolingUntil: null,
            
            // 48h Cooldown
            lastLossTime: null,
            cooldownActive: false,
            cooldownUntil: null
        };
    }

    function createExecutionState(setupId, playbookId, executionModel, pair, direction) {
        return {
            setupId: setupId,
            playbookId: playbookId,
            executionModel: executionModel,
            pair: pair,
            direction: direction,
            
            setupTime: new Date().toISOString(),
            timeoutRule: null,
            timeoutAt: null,
            
            barsElapsed: 0,
            structurallyValid: true,
            
            status: 'pending',
            abandonReason: null,
            abandonTime: null,
            
            maxAttempts: THRESHOLDS.MAX_EXECUTION_ATTEMPTS_PER_PAIR,
            attemptNumber: 1
        };
    }

    function createNonTradeEntry(type, pair, playbookId, reason, reasonCode, contributingCodes = []) {
        return {
            id: generateId(),
            timestamp: new Date().toISOString(),
            sessionId: getCurrentSessionId(),
            
            type: type,
            pair: pair,
            playbookId: playbookId,
            executionModel: null,
            utccScore: null,
            entryZone: null,
            
            // v1.4: Hierarchical reason tracking
            reason: reason,
            primaryReasonCode: reasonCode,           // Single authoritative block reason
            contributingReasonCodes: contributingCodes, // All factors that contributed
            
            // Legacy field for backwards compatibility
            reasonCode: reasonCode,
            
            whatHappened: null,
            wasCorrectDecision: null
        };
    }

    function createFullState() {
        return {
            version: MODULE_VERSION,
            specVersion: SPEC_VERSION,
            lastUpdated: new Date().toISOString(),
            
            global: createGlobalState(),
            playbooks: {},      // keyed by playbookId
            pairs: {},          // keyed by pair
            behavioural: createBehaviouralState(null),
            execution: null,    // single active execution or null
            nonTrades: [],      // array of non-trade entries
            
            // Review system
            pendingReview: null,
            reviewHistory: []
        };
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    function generateId() {
        return 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function getCurrentSessionId() {
        const state = loadState();
        return state.global.sessionId;
    }

    function isToday(timestamp) {
        if (!timestamp) return false;
        const date = new Date(timestamp);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    function getAESTDate() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    }

    function getAESTHour() {
        return getAESTDate().getHours();
    }

    function isPostLondon() {
        const hour = getAESTHour();
        return hour >= 2 && hour < 9;  // 2am-9am AEST is post-London
    }

    function hoursUntil(timestamp) {
        if (!timestamp) return Infinity;
        const target = new Date(timestamp);
        const now = new Date();
        return (target - now) / (1000 * 60 * 60);
    }

    function minutesUntil(timestamp) {
        if (!timestamp) return Infinity;
        const target = new Date(timestamp);
        const now = new Date();
        return (target - now) / (1000 * 60);
    }

    function addMinutes(date, minutes) {
        return new Date(new Date(date).getTime() + minutes * 60 * 1000);
    }

    function addHours(date, hours) {
        return new Date(new Date(date).getTime() + hours * 60 * 60 * 1000);
    }

    /**
     * Apply risk reduction with monotonic decreasing invariant
     * INVARIANT: riskMultiplier can ONLY decrease intraday, never increase
     * @param {object} state - Full state object
     * @param {number} factor - Reduction factor (e.g., 0.75)
     * @param {string} reason - Reason for reduction
     * @returns {number} New riskMultiplier value
     */
    function applyRiskReduction(state, factor, reason) {
        const previousMultiplier = state.global.riskMultiplier;
        let newMultiplier = previousMultiplier * factor;
        
        // INVARIANT: riskMultiplier is monotonic decreasing intraday
        // This guard prevents future code from accidentally re-inflating risk
        if (newMultiplier > previousMultiplier) {
            console.error('Circuit Breaker: INVARIANT VIOLATION - Attempted to increase riskMultiplier', {
                previous: previousMultiplier,
                attempted: newMultiplier,
                reason: reason
            });
            newMultiplier = previousMultiplier;  // Refuse to increase
        }
        
        // Apply floor
        newMultiplier = Math.max(newMultiplier, THRESHOLDS.RISK_FLOOR);
        
        // Update state
        state.global.riskMultiplier = newMultiplier;
        state.global.riskReductionReason = reason;
        
        return newMultiplier;
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    function loadState() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                
                // Version check
                if (parsed.specVersion !== SPEC_VERSION) {
                    console.warn('Circuit Breaker: Spec version mismatch, resetting state');
                    return createFullState();
                }
                
                // Day rollover check
                if (parsed.lastUpdated && !isToday(parsed.lastUpdated)) {
                    return handleDayRollover(parsed);
                }
                
                return parsed;
            }
        } catch (e) {
            console.error('Circuit Breaker: Error loading state', e);
        }
        return createFullState();
    }

    function saveState(state) {
        try {
            state.lastUpdated = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('Circuit Breaker: Error saving state', e);
            return false;
        }
    }

    function handleDayRollover(oldState) {
        console.log('Circuit Breaker: Day rollover detected');
        
        const newState = createFullState();
        
        // Preserve cross-day items
        
        // 1. Review flag persists
        if (oldState.behavioural && oldState.behavioural.revengeFlaggedForReview) {
            newState.behavioural.revengeFlaggedForReview = true;
            newState.pendingReview = {
                type: 'revenge',
                flaggedAt: oldState.behavioural.lastLeakageTime || new Date().toISOString(),
                reason: 'Revenge trade attempt detected'
            };
        }
        
        // 2. 48h pair cooldowns persist (revenge prevention)
        if (oldState.pairs) {
            Object.keys(oldState.pairs).forEach(pair => {
                const oldPair = oldState.pairs[pair];
                // Only persist explicit cooldowns (not session cooling)
                if (oldPair.cooldownActive && oldPair.cooldownUntil) {
                    if (new Date(oldPair.cooldownUntil) > new Date()) {
                        newState.pairs[pair] = createPairState(pair, null);
                        newState.pairs[pair].cooldownActive = true;
                        newState.pairs[pair].cooldownUntil = oldPair.cooldownUntil;
                        newState.pairs[pair].lastLossTime = oldPair.lastLossTime;
                    }
                }
                // FIX #4: Explicitly clear lastLossTime that's >48h old
                else if (oldPair.lastLossTime) {
                    const hoursSinceLoss = (new Date() - new Date(oldPair.lastLossTime)) / (1000 * 60 * 60);
                    if (hoursSinceLoss >= THRESHOLDS.PAIR_COOLDOWN_HOURS) {
                        // Don't preserve - it's expired
                    } else {
                        // Preserve lastLossTime for revenge detection
                        if (!newState.pairs[pair]) {
                            newState.pairs[pair] = createPairState(pair, null);
                        }
                        newState.pairs[pair].lastLossTime = oldPair.lastLossTime;
                    }
                }
            });
        }
        
        // 3. FIX #4: Stand-down persistence - ONLY emergency survives day rollover
        // -3% CAP: Clears at day rollover (fresh start)
        // -5% STANDDOWN: Clears at day rollover (24h from trigger, not calendar day)
        // -10% EMERGENCY: Persists if time remains (48h from trigger)
        if (oldState.global.standDownActive) {
            if (oldState.global.standDownLevel === STAND_DOWN_LEVELS.EMERGENCY) {
                // Emergency persists if time remains
                if (oldState.global.standDownUntil && new Date(oldState.global.standDownUntil) > new Date()) {
                    newState.global.standDownActive = true;
                    newState.global.standDownReason = oldState.global.standDownReason;
                    newState.global.standDownUntil = oldState.global.standDownUntil;
                    newState.global.standDownLevel = STAND_DOWN_LEVELS.EMERGENCY;
                    console.log('Circuit Breaker: Emergency stand-down persists across day rollover');
                }
            } else {
                // Explicitly log that non-emergency stand-downs are cleared
                console.log(`Circuit Breaker: ${oldState.global.standDownLevel} stand-down cleared at day rollover`);
                // newState already has standDownActive = false from createFullState()
            }
        }
        
        // 4. Non-trade history preserved (last 100)
        if (oldState.nonTrades) {
            newState.nonTrades = oldState.nonTrades.slice(-100);
        }
        
        // 5. Review history preserved
        if (oldState.reviewHistory) {
            newState.reviewHistory = oldState.reviewHistory;
        }
        
        saveState(newState);
        return newState;
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    function startSession(sessionType) {
        const state = loadState();
        const sessionId = `${new Date().toISOString().split('T')[0]}-${sessionType}`;
        
        // ═══════════════════════════════════════════════════════════════
        // GLOBAL STATE RESET
        // ═══════════════════════════════════════════════════════════════
        state.global.sessionId = sessionId;
        state.global.sessionType = sessionType;
        state.global.sessionStartTime = new Date().toISOString();
        state.global.sessionActive = true;
        state.global.sessionHoursElapsed = 0;
        state.global.timeDecayFactor = 1.0;
        
        // FIX v1.4: Reset risk multiplier to 1.0 at session start
        // (Losses from previous session don't degrade new session)
        state.global.riskMultiplier = 1.0;
        state.global.riskReductionReason = null;
        
        // Note: riskCapped and standDownActive are NOT reset here
        // They are day-level controls that persist until day rollover
        
        state.behavioural.sessionId = sessionId;
        
        // ═══════════════════════════════════════════════════════════════
        // BEHAVIOURAL STATE RESET (Session-scoped)
        // ═══════════════════════════════════════════════════════════════
        // FIX v1.4: Reset consecutive losses for new session
        state.behavioural.consecutiveLosses = 0;
        // Note: consecutiveLossesMax is day-level, preserved
        
        // FIX v1.4: Reset reduced risk mode for new session
        // (Fresh session = clean behavioural slate)
        state.behavioural.reducedRiskMode = false;
        state.behavioural.reducedRiskReason = null;
        state.behavioural.reducedRiskSince = null;
        
        // Reset leakage counters for new session
        state.behavioural.leakageWarningsCount = 0;
        state.behavioural.leakageBlocksCount = 0;
        state.behavioural.leakageTypes = [];
        state.behavioural.lastLeakageTime = null;
        state.behavioural.lastLeakageType = null;
        state.behavioural.leakageLockoutActive = false;
        state.behavioural.leakageLockoutUntil = null;
        state.behavioural.leakageLockoutExtensions = 0;
        state.behavioural.leakageDuringLockout = false;
        
        // Reset revenge flags (session-scoped)
        state.behavioural.revengeTradeAttempt = false;
        state.behavioural.revengeTradeCount = 0;
        state.behavioural.oversizeAttempt = false;
        state.behavioural.ruleNegotiationAttempt = false;
        // Note: revengeFlaggedForReview persists (requires explicit review)
        
        // ═══════════════════════════════════════════════════════════════
        // PLAYBOOK STATE RESET (Session-scoped)
        // ═══════════════════════════════════════════════════════════════
        Object.keys(state.playbooks).forEach(pbId => {
            const pb = state.playbooks[pbId];
            
            // Reset failure tracking
            pb.consecutiveFailures = 0;
            pb.disabled = false;
            pb.disabledReason = null;
            pb.disabledAt = null;
            pb.reenableAt = null;
            
            // FIX v1.4: Reset session-level counters
            pb.sessionTradeCount = 0;
            pb.sessionTotalR = 0;
            pb.sessionExpectancy = null;
            pb.expectancyValid = false;
            
            // Note: totalFailures, totalWins, totalBreakeven are DAY-level
            // They reset at day rollover, not session start
            
            pb.sessionId = sessionId;
            pb.lastTradeResult = null;
            pb.lastTradeTime = null;
        });
        
        // ═══════════════════════════════════════════════════════════════
        // PAIR STATE RESET (Session-scoped, preserving 48h cooldowns)
        // ═══════════════════════════════════════════════════════════════
        Object.keys(state.pairs).forEach(pair => {
            const pairState = state.pairs[pair];
            
            // Reset session-level tracking
            pairState.consecutiveLosses = 0;
            pairState.coolingActive = false;
            pairState.coolingReason = null;
            pairState.coolingUntil = null;
            
            // Note: tradesToday, lossesToday, winsToday are DAY-level
            // Note: cooldownActive (48h) persists across sessions
            // Note: lastLossTime persists for revenge detection
            
            pairState.sessionId = sessionId;
        });
        
        // ═══════════════════════════════════════════════════════════════
        // EXECUTION STATE RESET
        // ═══════════════════════════════════════════════════════════════
        state.execution = null;  // Clear any pending execution
        state.executionAttempts = {};  // Reset attempts per pair
        
        saveState(state);
        console.log(`Circuit Breaker: Session started - ${sessionId}`);
        
        return { success: true, sessionId: sessionId };
    }

    function endSession() {
        const state = loadState();
        state.global.sessionActive = false;
        state.execution = null;
        saveState(state);
        
        console.log('Circuit Breaker: Session ended');
        return { success: true };
    }

    function updateSessionTime() {
        const state = loadState();
        
        if (!state.global.sessionStartTime) return;
        
        const startTime = new Date(state.global.sessionStartTime);
        const now = new Date();
        const hoursElapsed = (now - startTime) / (1000 * 60 * 60);
        
        state.global.sessionHoursElapsed = hoursElapsed;
        
        // Calculate time decay
        let timeDecay = 1.0;
        
        if (isPostLondon()) {
            timeDecay = THRESHOLDS.TIME_DECAY_POST_LONDON;
        } else if (hoursElapsed >= THRESHOLDS.TIME_DECAY_THRESHOLD_2_HOURS) {
            timeDecay = THRESHOLDS.TIME_DECAY_FACTOR_2;
        } else if (hoursElapsed >= THRESHOLDS.TIME_DECAY_THRESHOLD_1_HOURS) {
            timeDecay = THRESHOLDS.TIME_DECAY_FACTOR_1;
        }
        
        state.global.timeDecayFactor = timeDecay;
        state.global.timeDecayActive = timeDecay < 1.0;
        
        saveState(state);
    }

    // ============================================
    // CORE GATE FUNCTIONS
    // ============================================

    /**
     * Master gate: Can trading proceed at all?
     * 
     * PRECEDENCE (v1.4):
     * 1. Review required (blocks until review complete)
     * 2. Stand-down (blocks with timer)
     * 3. Leakage lockout (blocks with timer)
     * 4. No session (blocks until regime check)
     * 
     * @returns {{ allowed: boolean, reason: string|null, lockoutType: string|null, reasonCode: string|null }}
     */
    function canTrade() {
        const state = loadState();
        
        // 1. Review required check (highest priority)
        if (state.behavioural.revengeFlaggedForReview || state.pendingReview) {
            return {
                allowed: false,
                reason: 'Post-session review required before trading can resume',
                lockoutType: 'review_required',
                reasonCode: NON_TRADE_REASONS.REVIEW_REQUIRED
            };
        }
        
        // 2. Stand-down check
        if (state.global.standDownActive) {
            const until = state.global.standDownUntil 
                ? new Date(state.global.standDownUntil).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
                : 'unknown';
            return {
                allowed: false,
                reason: `Stand-down active: ${state.global.standDownReason}. Resumes: ${until}`,
                lockoutType: 'stand_down',
                reasonCode: NON_TRADE_REASONS.STAND_DOWN
            };
        }
        
        // 3. Leakage lockout check
        if (state.behavioural.leakageLockoutActive) {
            const until = state.behavioural.leakageLockoutUntil;
            if (until && new Date(until) > new Date()) {
                const minsRemaining = Math.ceil(minutesUntil(until));
                return {
                    allowed: false,
                    reason: `Leakage lockout active. ${minsRemaining} minutes remaining`,
                    lockoutType: 'leakage_lockout',
                    reasonCode: NON_TRADE_REASONS.LEAKAGE_LOCKOUT
                };
            } else {
                // Lockout expired - will be cleared on resume
            }
        }
        
        // 4. Session active check
        if (!state.global.sessionActive) {
            return {
                allowed: false,
                reason: 'No active session. Complete regime check first.',
                lockoutType: 'no_session',
                reasonCode: NON_TRADE_REASONS.SESSION_LOCKOUT
            };
        }
        
        return { allowed: true, reason: null, lockoutType: null, reasonCode: null };
    }

    /**
     * Playbook selection gate
     * @param {string} playbookId 
     * @returns {{ allowed: boolean, reason: string|null }}
     */
    function canSelectPlaybook(playbookId) {
        // First check if trading is allowed at all
        const tradeCheck = canTrade();
        if (!tradeCheck.allowed) {
            return { allowed: false, reason: tradeCheck.reason };
        }
        
        const state = loadState();
        
        // Check if playbook exists in state, create if not
        if (!state.playbooks[playbookId]) {
            state.playbooks[playbookId] = createPlaybookState(playbookId, state.global.sessionId);
            saveState(state);
        }
        
        const pb = state.playbooks[playbookId];
        
        // 1. Direct disable check
        if (pb.disabled) {
            return {
                allowed: false,
                reason: `Playbook disabled: ${pb.disabledReason}. Re-enables: ${pb.reenableAt || 'next session'}`
            };
        }
        
        // 2. Trend playbook check (if loss streak >= 3)
        if (state.behavioural.consecutiveLosses >= THRESHOLDS.CONSECUTIVE_LOSSES_FOR_TREND_DISABLE) {
            if (TREND_PLAYBOOKS.includes(playbookId)) {
                return {
                    allowed: false,
                    reason: `Trend playbooks disabled due to ${state.behavioural.consecutiveLosses} consecutive losses`
                };
            }
        }
        
        return { allowed: true, reason: null };
    }

    /**
     * Pair selection gate
     * @param {string} pair 
     * @returns {{ allowed: boolean, reason: string|null, coolingActive: boolean, cooldownActive: boolean, isRevengeAttempt: boolean }}
     */
    function canSelectPair(pair) {
        // First check if trading is allowed at all
        const tradeCheck = canTrade();
        if (!tradeCheck.allowed) {
            return { allowed: false, reason: tradeCheck.reason, coolingActive: false, cooldownActive: false, isRevengeAttempt: false };
        }
        
        const state = loadState();
        
        // Check if pair exists in state, create if not
        if (!state.pairs[pair]) {
            state.pairs[pair] = createPairState(pair, state.global.sessionId);
            saveState(state);
        }
        
        const pairState = state.pairs[pair];
        
        // 1. Pair cooling check (2 losses same day = cooled until next session)
        if (pairState.coolingActive) {
            return {
                allowed: false,
                reason: `${pair} cooled: 2 losses today. Available next session`,
                coolingActive: true,
                cooldownActive: false,
                isRevengeAttempt: false
            };
        }
        
        // 2. Revenge detection: trading same pair within 48h of loss
        // FIX #2: Only block if attempting to trade within 48h of loss on this pair
        if (pairState.lastLossTime) {
            const hoursSinceLoss = (new Date() - new Date(pairState.lastLossTime)) / (1000 * 60 * 60);
            
            if (hoursSinceLoss < THRESHOLDS.PAIR_COOLDOWN_HOURS) {
                // This IS a revenge attempt - record it and block
                recordRevengeAttempt(pair);
                
                const hoursRemaining = Math.ceil(THRESHOLDS.PAIR_COOLDOWN_HOURS - hoursSinceLoss);
                return {
                    allowed: false,
                    reason: `Revenge prevention: ${pair} had a loss ${Math.floor(hoursSinceLoss)}h ago. ${hoursRemaining}h remaining`,
                    coolingActive: false,
                    cooldownActive: true,
                    isRevengeAttempt: true
                };
            }
        }
        
        // 3. Check if cooldownActive was explicitly set (from previous revenge detection)
        if (pairState.cooldownActive) {
            if (pairState.cooldownUntil && new Date(pairState.cooldownUntil) > new Date()) {
                const hoursRemaining = Math.ceil(hoursUntil(pairState.cooldownUntil));
                return {
                    allowed: false,
                    reason: `48h cooldown active on ${pair}. ${hoursRemaining} hours remaining`,
                    coolingActive: false,
                    cooldownActive: true,
                    isRevengeAttempt: false
                };
            } else {
                // Cooldown expired, clear it
                pairState.cooldownActive = false;
                pairState.cooldownUntil = null;
                saveState(state);
            }
        }
        
        return { allowed: true, reason: null, coolingActive: false, cooldownActive: false, isRevengeAttempt: false };
    }

    /**
     * Pre-trade proceed gate
     * @returns {{ allowed: boolean, reason: string|null }}
     */
    function canProceedToPreTrade() {
        const tradeCheck = canTrade();
        if (!tradeCheck.allowed) {
            return { allowed: false, reason: tradeCheck.reason };
        }
        
        // Additional checks could go here (e.g., playbook locked)
        
        return { allowed: true, reason: null };
    }

    /**
     * Final execution gate with risk calculation
     * 
     * ARCHITECTURE NOTE (v1.4 - Risk Single Source of Truth):
     * This is the ONLY place caps are applied. Precedence hierarchy:
     * 
     * PRECEDENCE (highest to lowest):
     * 1. Stand-down (blocks execution entirely)
     * 2. Leakage lockout (blocks execution entirely)
     * 3. Review-required (blocks execution entirely)
     * 4. Playbook disabled (blocks this playbook)
     * 5. Pair cooling/cooldown (blocks this pair)
     * 6. Hard risk caps (daily loss cap - 50% of base)
     * 7. Reduced risk mode (behavioural - 50% of effective)
     * 8. Multipliers already applied via getEffectiveRisk()
     * 
     * RISK CAP DEFINITIONS (v1.4 Spec Clarification):
     * ───────────────────────────────────────────────────────────────
     * Daily loss cap (-3%): Absolute ceiling of 0.5R of BASE risk
     *   - Applies to requestedRisk, NOT effectiveRisk
     *   - Rationale: Prevents sizing up after drawdown
     *   - Example: 2% base → max 1% regardless of multipliers
     * 
     * Reduced risk mode (behavioural): 50% of CURRENT effective
     *   - Applies to effectiveRisk AFTER daily cap
     *   - Rationale: Compounds with other penalties as deterrent
     *   - Example: 1% (after daily cap) → max 0.5%
     * 
     * These caps compound intentionally. Worst case scenario:
     *   Base 2% → daily cap 1% → reduced mode 0.5% → final 0.5%
     * ───────────────────────────────────────────────────────────────
     * 
     * INVARIANT: effectiveRisk can never INCREASE within a session
     * 
     * @param {{ pair: string, playbookId: string, requestedRisk: number }} tradeData 
     * @returns {{ allowed: boolean, reason: string|null, primaryReasonCode: string|null, contributingReasonCodes: string[], riskCap: number, effectiveRisk: number }}
     */
    function canExecute(tradeData) {
        const { pair, playbookId, requestedRisk } = tradeData;
        const contributingReasonCodes = [];
        
        // ═══════════════════════════════════════════════════════════════
        // PRECEDENCE 1-3: HARD BLOCKS (check canTrade for stand-down, lockout, review)
        // ═══════════════════════════════════════════════════════════════
        const tradeCheck = canTrade();
        if (!tradeCheck.allowed) {
            return { 
                allowed: false, 
                reason: tradeCheck.reason, 
                primaryReasonCode: tradeCheck.reasonCode || 'trade_blocked',
                contributingReasonCodes: [],
                riskCap: 0, 
                effectiveRisk: 0 
            };
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRECEDENCE 4: PLAYBOOK DISABLED
        // ═══════════════════════════════════════════════════════════════
        const playbookCheck = canSelectPlaybook(playbookId);
        if (!playbookCheck.allowed) {
            return { 
                allowed: false, 
                reason: playbookCheck.reason, 
                primaryReasonCode: NON_TRADE_REASONS.PLAYBOOK_DISABLED,
                contributingReasonCodes: [],
                riskCap: 0, 
                effectiveRisk: 0 
            };
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRECEDENCE 5: PAIR COOLING/COOLDOWN
        // ═══════════════════════════════════════════════════════════════
        const pairCheck = canSelectPair(pair);
        if (!pairCheck.allowed) {
            return { 
                allowed: false, 
                reason: pairCheck.reason, 
                primaryReasonCode: NON_TRADE_REASONS.PAIR_COOLING,
                contributingReasonCodes: [],
                riskCap: 0, 
                effectiveRisk: 0 
            };
        }
        
        // ═══════════════════════════════════════════════════════════════
        // RISK CALCULATION (Single Source of Truth)
        // ═══════════════════════════════════════════════════════════════
        const state = loadState();
        
        // Step 1: Get effective risk after multipliers (riskMultiplier × timeDecay)
        let effectiveRisk = getEffectiveRisk(requestedRisk);
        let cappedReason = null;
        
        // ═══════════════════════════════════════════════════════════════
        // PRECEDENCE 6: HARD RISK CAP (daily loss -3%)
        // Cap to 50% of BASE risk (not effective)
        // ═══════════════════════════════════════════════════════════════
        if (state.global.riskCapped) {
            const hardCap = requestedRisk * THRESHOLDS.RISK_CAP_REDUCED_MODE;
            if (effectiveRisk > hardCap) {
                effectiveRisk = hardCap;
                cappedReason = 'Daily loss cap (-3%): max 0.5R';
                contributingReasonCodes.push('daily_loss_cap');
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PRECEDENCE 7: REDUCED RISK MODE (behavioural - leakage)
        // Cap to 50% of CURRENT effective (compounds with above)
        // ═══════════════════════════════════════════════════════════════
        if (state.behavioural.reducedRiskMode) {
            const behaviouralCap = effectiveRisk * THRESHOLDS.RISK_CAP_REDUCED_MODE;
            if (effectiveRisk > behaviouralCap) {
                effectiveRisk = behaviouralCap;
                cappedReason = cappedReason 
                    ? cappedReason + ' + Reduced mode (50%)' 
                    : 'Reduced risk mode: 50% cap';
                contributingReasonCodes.push('reduced_risk_mode');
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // FLOOR: Never below 25% of base
        // ═══════════════════════════════════════════════════════════════
        const floor = requestedRisk * THRESHOLDS.RISK_FLOOR;
        const finalRisk = Math.max(effectiveRisk, floor);
        
        return {
            allowed: true,
            reason: cappedReason,
            primaryReasonCode: cappedReason ? 'risk_capped' : null,
            contributingReasonCodes: contributingReasonCodes,
            riskCap: finalRisk,
            effectiveRisk: finalRisk
        };
    }

    // ============================================
    // RISK CALCULATION
    // ============================================

    /**
     * Calculate effective risk after multipliers (NOT caps)
     * 
     * ARCHITECTURE NOTE (v1.4 - Risk Single Source of Truth):
     * This function applies MULTIPLICATIVE factors only:
     *   - riskMultiplier (loss streak degradation)
     *   - timeDecayFactor (fatigue reduction)
     * 
     * CAPS are applied ONLY in canExecute():
     *   - reducedRiskMode (behavioural cap)
     *   - riskCapped (daily loss cap)
     * 
     * This prevents double-application of risk reductions.
     * 
     * @param {number} baseRisk - Base risk percentage (e.g., 2 for 2%)
     * @returns {number} Effective risk after multipliers (before caps)
     */
    function getEffectiveRisk(baseRisk) {
        const state = loadState();
        
        // Update time decay
        updateSessionTime();
        
        const multiplier = state.global.riskMultiplier;
        const timeDecay = state.global.timeDecayFactor;
        
        // Apply multipliers ONLY (caps are in canExecute)
        let effective = baseRisk * multiplier * timeDecay;
        
        // Apply floor (minimum 25% of base)
        const floor = baseRisk * THRESHOLDS.RISK_FLOOR;
        effective = Math.max(effective, floor);
        
        return Math.round(effective * 1000) / 1000;  // Round to 3 decimal places
    }

    /**
     * Get detailed risk breakdown for UI
     * 
     * ARCHITECTURE NOTE (v1.4):
     * - `effective` = baseRisk × multiplier × timeDecay (NO caps)
     * - Caps (reducedMode, riskCapped) are applied ONLY in canExecute()
     * - Use canExecute() to get final tradeable risk
     * 
     * @param {number} baseRisk 
     * @returns {{ baseRisk: number, multiplier: number, timeDecay: number, reducedMode: boolean, capped: boolean, effective: number, floor: number, reductionReason: string|null, note: string }}
     */
    function getRiskBreakdown(baseRisk) {
        const state = loadState();
        updateSessionTime();
        
        const effectiveBeforeCaps = getEffectiveRisk(baseRisk);
        
        return {
            baseRisk: baseRisk,
            multiplier: state.global.riskMultiplier,
            timeDecay: state.global.timeDecayFactor,
            reducedMode: state.behavioural.reducedRiskMode,
            capped: state.global.riskCapped,
            effective: effectiveBeforeCaps,  // Note: This is BEFORE caps
            floor: baseRisk * THRESHOLDS.RISK_FLOOR,
            reductionReason: state.global.riskReductionReason,
            note: 'Use canExecute() for final risk after caps'
        };
    }

    // ============================================
    // TRADE RESULT RECORDING
    // ============================================

    /**
     * Record a trade result and update all states
     * @param {{ pair: string, playbookId: string, result: string, rValue: number, pnlPercent: number }} tradeResult 
     * @returns {{ success: boolean, triggeredActions: string[] }}
     */
    function recordTradeResult(tradeResult) {
        const { pair, playbookId, result, rValue, pnlPercent } = tradeResult;
        const state = loadState();
        const triggeredActions = [];
        
        // Ensure playbook state exists
        if (!state.playbooks[playbookId]) {
            state.playbooks[playbookId] = createPlaybookState(playbookId, state.global.sessionId);
        }
        
        // Ensure pair state exists
        if (!state.pairs[pair]) {
            state.pairs[pair] = createPairState(pair, state.global.sessionId);
        }
        
        const pb = state.playbooks[playbookId];
        const pairState = state.pairs[pair];
        
        // Update global counters
        state.global.tradesToday++;
        state.global.dailyPnLPercent += pnlPercent;
        
        // Process based on result type
        if (result === TRADE_RESULTS.WIN) {
            // WIN: Reset all loss streaks
            state.global.winsToday++;
            state.behavioural.consecutiveLosses = 0;
            pb.consecutiveFailures = 0;
            pb.totalWins++;
            pairState.winsToday++;
            pairState.consecutiveLosses = 0;
            
            triggeredActions.push('Loss streaks reset');
            
        } else if (result === TRADE_RESULTS.BREAKEVEN) {
            // BREAKEVEN: Neutral - no changes to streaks
            state.global.breakevenToday++;
            pb.totalBreakeven++;
            
            triggeredActions.push('Breakeven recorded (neutral)');
            
        } else if (result === TRADE_RESULTS.LOSS) {
            // LOSS: Increment all loss counters
            state.global.lossesToday++;
            state.behavioural.consecutiveLosses++;
            pb.consecutiveFailures++;
            pb.totalFailures++;
            pairState.lossesToday++;
            pairState.consecutiveLosses++;
            
            // Track max streak
            if (state.behavioural.consecutiveLosses > state.behavioural.consecutiveLossesMax) {
                state.behavioural.consecutiveLossesMax = state.behavioural.consecutiveLosses;
            }
            
            // Apply risk reduction for losses (using invariant-protected helper)
            if (state.behavioural.consecutiveLosses === 1) {
                const newRisk = applyRiskReduction(state, THRESHOLDS.RISK_REDUCTION_FIRST_LOSS, 'First loss of day');
                triggeredActions.push(`Risk reduced to ${Math.round(newRisk * 100)}%`);
            } else if (state.behavioural.consecutiveLosses === 2) {
                const newRisk = applyRiskReduction(state, THRESHOLDS.RISK_REDUCTION_SECOND_LOSS, 'Second consecutive loss');
                triggeredActions.push(`Risk reduced to ${Math.round(newRisk * 100)}%`);
            }
            
            // Check playbook disable threshold
            if (pb.consecutiveFailures >= THRESHOLDS.PLAYBOOK_CONSECUTIVE_FAILURES) {
                pb.disabled = true;
                pb.disabledReason = PLAYBOOK_DISABLE_REASONS.CONSECUTIVE_FAILURES;
                pb.disabledAt = new Date().toISOString();
                pb.reenableAt = 'next_session';
                triggeredActions.push(`Playbook ${playbookId} disabled`);
            }
            
            // Check pair cooling threshold (2 losses same day = cooled until next session)
            if (pairState.consecutiveLosses >= THRESHOLDS.PAIR_CONSECUTIVE_LOSSES_FOR_COOLING) {
                pairState.coolingActive = true;
                pairState.coolingReason = PAIR_COOLING_REASONS.CONSECUTIVE_LOSSES;
                triggeredActions.push(`Pair ${pair} cooled`);
            }
            
            // FIX #2: Track last loss time for revenge detection (NOT automatic 48h block)
            // cooldownActive is only set when revenge attempt is detected
            pairState.lastLossTime = new Date().toISOString();
            
            // Check consecutive losses threshold for trend playbooks
            if (state.behavioural.consecutiveLosses >= THRESHOLDS.CONSECUTIVE_LOSSES_FOR_TREND_DISABLE) {
                TREND_PLAYBOOKS.forEach(tpId => {
                    if (!state.playbooks[tpId]) {
                        state.playbooks[tpId] = createPlaybookState(tpId, state.global.sessionId);
                    }
                    state.playbooks[tpId].disabled = true;
                    state.playbooks[tpId].disabledReason = PLAYBOOK_DISABLE_REASONS.LOSS_STREAK_TREND;
                    state.playbooks[tpId].reenableAt = 'next_day';
                });
                triggeredActions.push('Trend playbooks disabled (loss streak)');
            }
        }
        
        // Update playbook tracking
        pb.lastTradeResult = result;
        pb.lastTradeTime = new Date().toISOString();
        pb.sessionTradeCount++;
        pb.sessionTotalR += rValue;
        
        // Calculate expectancy if we have enough trades
        if (pb.sessionTradeCount >= THRESHOLDS.PLAYBOOK_EXPECTANCY_MIN_TRADES) {
            pb.sessionExpectancy = pb.sessionTotalR / pb.sessionTradeCount;
            pb.expectancyValid = true;
            
            // Check for negative expectancy disable
            if (pb.sessionExpectancy < 0 && !pb.disabled) {
                pb.disabled = true;
                pb.disabledReason = PLAYBOOK_DISABLE_REASONS.EXPECTANCY_NEGATIVE;
                pb.disabledAt = new Date().toISOString();
                pb.reenableAt = 'next_session';
                triggeredActions.push(`Playbook ${playbookId} disabled (negative expectancy)`);
            }
        }
        
        // Check daily loss thresholds
        const dailyPnL = state.global.dailyPnLPercent;
        
        if (dailyPnL <= THRESHOLDS.DAILY_LOSS_EMERGENCY_PERCENT && 
            state.global.standDownLevel !== STAND_DOWN_LEVELS.EMERGENCY) {
            // -10% Emergency
            state.global.standDownActive = true;
            state.global.standDownReason = STAND_DOWN_REASONS.DAILY_LOSS_EMERGENCY;
            state.global.standDownUntil = addHours(new Date(), 48).toISOString();
            state.global.standDownLevel = STAND_DOWN_LEVELS.EMERGENCY;
            state.pendingReview = {
                type: 'emergency_loss',
                flaggedAt: new Date().toISOString(),
                reason: `Daily loss exceeded -10% (${dailyPnL.toFixed(2)}%)`
            };
            triggeredActions.push('EMERGENCY STAND-DOWN: -10% daily loss');
            
        } else if (dailyPnL <= THRESHOLDS.DAILY_LOSS_STANDDOWN_PERCENT && 
                   state.global.standDownLevel !== STAND_DOWN_LEVELS.STANDDOWN &&
                   state.global.standDownLevel !== STAND_DOWN_LEVELS.EMERGENCY) {
            // -5% Stand-down
            state.global.standDownActive = true;
            state.global.standDownReason = STAND_DOWN_REASONS.DAILY_LOSS_STANDDOWN;
            state.global.standDownUntil = addHours(new Date(), 24).toISOString();
            state.global.standDownLevel = STAND_DOWN_LEVELS.STANDDOWN;
            triggeredActions.push('STAND-DOWN: -5% daily loss');
            
        } else if (dailyPnL <= THRESHOLDS.DAILY_LOSS_CAP_PERCENT && 
                   !state.global.riskCapped) {
            // -3% Cap
            state.global.riskCapped = true;
            state.global.standDownLevel = STAND_DOWN_LEVELS.CAP;
            triggeredActions.push('RISK CAPPED: -3% daily loss');
        }
        
        saveState(state);
        
        console.log('Circuit Breaker: Trade result recorded', { result, triggeredActions });
        
        return { success: true, triggeredActions };
    }

    // ============================================
    // LEAKAGE HANDLING
    // ============================================

    /**
     * Record a leakage warning (non-blocking)
     * 
     * SPEC DECISION (v1.4 - Intentional Compounding):
     * ═══════════════════════════════════════════════════════════════
     * Leakage warnings apply BOTH per-warning degradation AND threshold-based caps.
     * This is INTENTIONAL to create escalating consequences for continued violations.
     * 
     * MATH EXAMPLE (worst case):
     * - 3 warnings: 0.75³ = 42.2% via multiplier degradation
     * - Plus reduced mode: × 0.5 = 21.1% of base risk
     * - Plus time decay at 0.7: × 0.7 = 14.8% of base risk
     * - Plus daily loss cap: × 0.5 = 7.4% of base risk (if also at -3%)
     * 
     * This creates a "compounding guillotine" that forces the trader to stop
     * before catastrophic losses accumulate. The alternative (threshold-only)
     * provides less deterrent against repeated small violations.
     * 
     * RISK COMMITTEE APPROVAL: Required. This behaviour must be documented
     * in trader onboarding and acknowledged before system activation.
     * ═══════════════════════════════════════════════════════════════
     * 
     * @param {string} warningType 
     * @returns {{ success: boolean, triggeredActions: string[] }}
     */
    function recordLeakageWarning(warningType) {
        const state = loadState();
        const triggeredActions = [];
        
        // Track if leakage occurs during lockout (extends lockout on resume)
        if (state.behavioural.leakageLockoutActive) {
            state.behavioural.leakageDuringLockout = true;
            triggeredActions.push('Leakage during lockout detected');
        }
        
        state.behavioural.leakageWarningsCount++;
        state.behavioural.leakageTypes.push(warningType);
        state.behavioural.lastLeakageTime = new Date().toISOString();
        state.behavioural.lastLeakageType = warningType;
        
        // INTENTIONAL: Per-warning multiplier degradation (compounds)
        const newRisk = applyRiskReduction(state, THRESHOLDS.RISK_REDUCTION_LEAKAGE_WARNING, `Leakage warning: ${warningType}`);
        triggeredActions.push(`Risk multiplier reduced to ${Math.round(newRisk * 100)}%`);
        
        // INTENTIONAL: Threshold-based 50% cap (additional to multiplier)
        if (state.behavioural.leakageWarningsCount >= THRESHOLDS.LEAKAGE_WARNINGS_FOR_RISK_REDUCTION) {
            state.behavioural.reducedRiskMode = true;
            state.behavioural.reducedRiskReason = 'Multiple leakage warnings';
            state.behavioural.reducedRiskSince = new Date().toISOString();
            triggeredActions.push('Reduced risk mode activated (additional 50% cap in canExecute)');
        }
        
        saveState(state);
        
        return { success: true, triggeredActions };
    }

    /**
     * Record a leakage block (blocking)
     * @param {string} blockType 
     * @returns {{ success: boolean, triggeredActions: string[], lockoutTriggered: boolean }}
     */
    function recordLeakageBlock(blockType) {
        const state = loadState();
        const triggeredActions = [];
        let lockoutTriggered = false;
        
        // FIX #1: Track if leakage occurs during lockout (before incrementing)
        if (state.behavioural.leakageLockoutActive) {
            state.behavioural.leakageDuringLockout = true;
            triggeredActions.push('Leakage during lockout detected');
        }
        
        state.behavioural.leakageBlocksCount++;
        state.behavioural.leakageTypes.push(blockType);
        state.behavioural.lastLeakageTime = new Date().toISOString();
        state.behavioural.lastLeakageType = blockType;
        
        triggeredActions.push(`Leakage block recorded: ${blockType}`);
        
        // Check threshold for timed lockout
        if (state.behavioural.leakageBlocksCount >= THRESHOLDS.LEAKAGE_BLOCKS_FOR_LOCKOUT) {
            if (!state.behavioural.leakageLockoutActive) {
                // First lockout
                state.behavioural.leakageLockoutActive = true;
                state.behavioural.leakageLockoutUntil = addMinutes(new Date(), THRESHOLDS.LEAKAGE_LOCKOUT_MINUTES).toISOString();
                state.behavioural.leakageLockoutExtensions = 0;
                state.behavioural.leakageDuringLockout = false;  // Reset for this lockout period
                lockoutTriggered = true;
                triggeredActions.push(`Timed lockout: ${THRESHOLDS.LEAKAGE_LOCKOUT_MINUTES} minutes`);
            } else if (state.behavioural.leakageLockoutExtensions < THRESHOLDS.LEAKAGE_LOCKOUT_MAX_EXTENSIONS) {
                // Extend lockout
                state.behavioural.leakageLockoutUntil = addMinutes(new Date(), THRESHOLDS.LEAKAGE_LOCKOUT_MINUTES).toISOString();
                state.behavioural.leakageLockoutExtensions++;
                triggeredActions.push(`Lockout extended (${state.behavioural.leakageLockoutExtensions}/${THRESHOLDS.LEAKAGE_LOCKOUT_MAX_EXTENSIONS})`);
            } else {
                // Max extensions reached - full session lockout
                state.global.standDownActive = true;
                state.global.standDownReason = STAND_DOWN_REASONS.LEAKAGE_LIMIT;
                state.global.standDownUntil = null;  // Until next session
                triggeredActions.push('SESSION LOCKOUT: Max leakage extensions exceeded');
            }
        }
        
        // Log as non-trade
        const nonTrade = createNonTradeEntry(
            'blocked',
            null,
            null,
            `Leakage block: ${blockType}`,
            NON_TRADE_REASONS.LEAKAGE_BLOCK
        );
        state.nonTrades.push(nonTrade);
        
        saveState(state);
        
        return { success: true, triggeredActions, lockoutTriggered };
    }

    /**
     * Record a revenge trade attempt
     * @param {string} pair 
     * @returns {{ success: boolean, triggeredActions: string[] }}
     */
    function recordRevengeAttempt(pair) {
        const state = loadState();
        const triggeredActions = [];
        
        state.behavioural.revengeTradeAttempt = true;
        state.behavioural.revengeTradeCount++;
        state.behavioural.revengeFlaggedForReview = true;
        
        // Immediate risk reduction (using invariant-protected helper)
        const newRisk = applyRiskReduction(state, THRESHOLDS.RISK_REDUCTION_REVENGE_ATTEMPT, 'Revenge trade attempt');
        
        // FIX #2: Set explicit 48h cooldown on pair ONLY when revenge detected
        if (state.pairs[pair]) {
            state.pairs[pair].cooldownActive = true;
            state.pairs[pair].cooldownUntil = addHours(new Date(), THRESHOLDS.PAIR_COOLDOWN_HOURS).toISOString();
        }
        
        triggeredActions.push('Revenge attempt blocked');
        triggeredActions.push(`Risk reduced to ${Math.round(newRisk * 100)}%`);
        triggeredActions.push(`${pair} locked for 48h`);
        triggeredActions.push('Post-session review required');
        
        // Log as non-trade
        const nonTrade = createNonTradeEntry(
            'blocked',
            pair,
            null,
            'Revenge trade attempt blocked',
            NON_TRADE_REASONS.REVENGE_BLOCKED
        );
        state.nonTrades.push(nonTrade);
        
        // Set up pending review
        state.pendingReview = {
            type: 'revenge',
            flaggedAt: new Date().toISOString(),
            reason: `Attempted to trade ${pair} within 48h of loss`
        };
        
        saveState(state);
        
        return { success: true, triggeredActions };
    }

    // ============================================
    // LOCKOUT RESUME
    // ============================================

    /**
     * Attempt to resume trading after timed lockout
     * @returns {{ success: boolean, reason: string|null }}
     */
    function attemptLockoutResume() {
        const state = loadState();
        
        if (!state.behavioural.leakageLockoutActive) {
            return { success: false, reason: 'No lockout active' };
        }
        
        // Check if lockout has expired
        if (new Date(state.behavioural.leakageLockoutUntil) > new Date()) {
            const minsRemaining = Math.ceil(minutesUntil(state.behavioural.leakageLockoutUntil));
            return { success: false, reason: `Lockout has ${minsRemaining} minutes remaining` };
        }
        
        // FIX #1: Check if leakage occurred during lockout - extend if so
        if (state.behavioural.leakageDuringLockout) {
            if (state.behavioural.leakageLockoutExtensions < THRESHOLDS.LEAKAGE_LOCKOUT_MAX_EXTENSIONS) {
                // Extend lockout
                state.behavioural.leakageLockoutUntil = addMinutes(new Date(), THRESHOLDS.LEAKAGE_LOCKOUT_MINUTES).toISOString();
                state.behavioural.leakageLockoutExtensions++;
                state.behavioural.leakageDuringLockout = false;  // Reset for new lockout period
                saveState(state);
                return { 
                    success: false, 
                    reason: `Leakage during lockout detected. Extended (${state.behavioural.leakageLockoutExtensions}/${THRESHOLDS.LEAKAGE_LOCKOUT_MAX_EXTENSIONS})` 
                };
            } else {
                // Max extensions reached - full session lockout
                state.global.standDownActive = true;
                state.global.standDownReason = STAND_DOWN_REASONS.LEAKAGE_LIMIT;
                state.global.standDownUntil = null;  // Until next session
                state.behavioural.leakageLockoutActive = false;
                saveState(state);
                return { success: false, reason: 'SESSION LOCKOUT: Leakage during lockout with max extensions exceeded' };
            }
        }
        
        // Lockout expired with clean behaviour - allow resume
        
        // Clear lockout
        state.behavioural.leakageLockoutActive = false;
        state.behavioural.leakageLockoutUntil = null;
        
        // Apply reduced risk mode for rest of session
        state.behavioural.reducedRiskMode = true;
        state.behavioural.reducedRiskReason = 'Post-lockout reduced risk';
        state.behavioural.reducedRiskSince = new Date().toISOString();
        
        saveState(state);
        
        return { success: true, reason: null };
    }

    // ============================================
    // EXECUTION MANAGEMENT (Phase 2)
    // ============================================

    /**
     * Get timeout configuration for an execution model
     * @param {string} executionModel 
     * @param {string} timeframe - '4H' or '1H'
     * @returns {{ bars: number|string, description: string }}
     */
    function getTimeoutRule(executionModel, timeframe = '4H') {
        const is4H = timeframe === '4H';
        
        switch (executionModel) {
            case EXECUTION_MODELS.LIMIT_PULLBACK:
                return {
                    bars: 'session_end',
                    description: 'Until end of session'
                };
            case EXECUTION_MODELS.BREAK_RETEST:
                return {
                    bars: is4H ? THRESHOLDS.TIMEOUT_BREAK_RETEST_4H : THRESHOLDS.TIMEOUT_BREAK_RETEST_1H,
                    description: is4H ? '4 bars (16 hours)' : '8 bars (8 hours)'
                };
            case EXECUTION_MODELS.MARKET_CONFIRMATION:
                return {
                    bars: is4H ? THRESHOLDS.TIMEOUT_MARKET_CONFIRMATION_4H : THRESHOLDS.TIMEOUT_MARKET_CONFIRMATION_1H,
                    description: is4H ? '2 bars (8 hours)' : '4 bars (4 hours)'
                };
            default:
                return {
                    bars: 4,
                    description: 'Default: 4 bars'
                };
        }
    }

    /**
     * Start tracking an execution setup
     * @param {{ playbookId: string, executionModel: string, pair: string, direction: string, timeframe: string }} setupData 
     * @returns {{ success: boolean, setupId: string|null, reason: string|null }}
     */
    function startExecution(setupData) {
        const { playbookId, executionModel, pair, direction, timeframe = '4H' } = setupData;
        
        const state = loadState();
        
        // Check if there's already an active execution for this pair
        if (state.execution && state.execution.pair === pair && state.execution.status === 'pending') {
            return {
                success: false,
                setupId: null,
                reason: `Active execution already exists for ${pair}`
            };
        }
        
        // Check attempt count for this pair/model combination
        const attemptKey = `${pair}_${executionModel}`;
        if (!state.executionAttempts) {
            state.executionAttempts = {};
        }
        
        const currentAttempts = state.executionAttempts[attemptKey] || 0;
        if (currentAttempts >= THRESHOLDS.MAX_EXECUTION_ATTEMPTS_PER_PAIR) {
            return {
                success: false,
                setupId: null,
                reason: `Max attempts (${THRESHOLDS.MAX_EXECUTION_ATTEMPTS_PER_PAIR}) reached for ${executionModel} on ${pair}`
            };
        }
        
        // Create new execution state
        const setupId = generateId();
        const timeoutRule = getTimeoutRule(executionModel, timeframe);
        
        state.execution = createExecutionState(setupId, playbookId, executionModel, pair, direction);
        state.execution.timeoutRule = timeoutRule;
        state.execution.timeframe = timeframe;
        state.execution.attemptNumber = currentAttempts + 1;
        
        // Calculate timeout timestamp (if not session_end)
        if (timeoutRule.bars !== 'session_end') {
            const barsInHours = timeframe === '4H' ? timeoutRule.bars * 4 : timeoutRule.bars;
            state.execution.timeoutAt = addHours(new Date(), barsInHours).toISOString();
        }
        
        // Increment attempt counter
        state.executionAttempts[attemptKey] = currentAttempts + 1;
        
        saveState(state);
        
        console.log(`Circuit Breaker: Execution started - ${setupId}`, {
            pair, executionModel, timeoutRule
        });
        
        return {
            success: true,
            setupId: setupId,
            reason: null
        };
    }

    /**
     * Update bar count for active execution
     * @returns {{ timedOut: boolean, barsRemaining: number|string }}
     */
    function updateExecutionBars() {
        const state = loadState();
        
        if (!state.execution || state.execution.status !== 'pending') {
            return { timedOut: false, barsRemaining: 0 };
        }
        
        state.execution.barsElapsed++;
        
        const timeoutRule = state.execution.timeoutRule;
        let timedOut = false;
        let barsRemaining;
        
        if (timeoutRule.bars === 'session_end') {
            // Check if session has ended
            timedOut = !state.global.sessionActive;
            barsRemaining = timedOut ? 0 : 'session_end';
        } else {
            barsRemaining = timeoutRule.bars - state.execution.barsElapsed;
            timedOut = barsRemaining <= 0;
        }
        
        if (timedOut) {
            // Auto-abandon due to timeout
            abandonExecution(INVALIDATION_REASONS.TIMEOUT, 'Execution timeout reached');
        } else {
            saveState(state);
        }
        
        return { timedOut, barsRemaining };
    }

    /**
     * Check if current execution has timed out (without incrementing)
     * @returns {{ timedOut: boolean, reason: string|null, barsElapsed: number, barsLimit: number|string }}
     */
    function checkExecutionTimeout() {
        const state = loadState();
        
        if (!state.execution || state.execution.status !== 'pending') {
            return { timedOut: false, reason: null, barsElapsed: 0, barsLimit: 0 };
        }
        
        const timeoutRule = state.execution.timeoutRule;
        let timedOut = false;
        let reason = null;
        
        if (timeoutRule.bars === 'session_end') {
            timedOut = !state.global.sessionActive;
            if (timedOut) reason = 'Session ended';
        } else {
            timedOut = state.execution.barsElapsed >= timeoutRule.bars;
            if (timedOut) reason = `Exceeded ${timeoutRule.bars} bar limit`;
        }
        
        // Also check timestamp-based timeout
        if (!timedOut && state.execution.timeoutAt) {
            if (new Date(state.execution.timeoutAt) <= new Date()) {
                timedOut = true;
                reason = 'Time limit exceeded';
            }
        }
        
        return {
            timedOut,
            reason,
            barsElapsed: state.execution.barsElapsed,
            barsLimit: timeoutRule.bars
        };
    }

    /**
     * Check if execution is structurally invalidated
     * @param {{ priceBeyondEMA: boolean, retestFailed: boolean, patternNegated: boolean }} conditions 
     * @returns {{ invalidated: boolean, reason: string|null }}
     */
    function checkStructuralInvalidation(conditions) {
        const state = loadState();
        
        if (!state.execution || state.execution.status !== 'pending') {
            return { invalidated: false, reason: null };
        }
        
        const model = state.execution.executionModel;
        let invalidated = false;
        let reason = null;
        
        switch (model) {
            case EXECUTION_MODELS.LIMIT_PULLBACK:
                if (conditions.priceBeyondEMA) {
                    invalidated = true;
                    reason = INVALIDATION_REASONS.PRICE_BEYOND_EMA;
                }
                break;
                
            case EXECUTION_MODELS.BREAK_RETEST:
                if (conditions.retestFailed) {
                    invalidated = true;
                    reason = INVALIDATION_REASONS.RETEST_FAILED;
                }
                break;
                
            case EXECUTION_MODELS.MARKET_CONFIRMATION:
                if (conditions.patternNegated) {
                    invalidated = true;
                    reason = INVALIDATION_REASONS.PATTERN_NEGATED;
                }
                break;
        }
        
        if (invalidated) {
            state.execution.structurallyValid = false;
            saveState(state);
        }
        
        return { invalidated, reason };
    }

    /**
     * Abandon current execution setup
     * @param {string} reason - From INVALIDATION_REASONS
     * @param {string} description - Human-readable description
     * @returns {{ success: boolean }}
     */
    function abandonExecution(reason, description) {
        const state = loadState();
        
        if (!state.execution) {
            return { success: false };
        }
        
        const execution = state.execution;
        
        // Update execution state
        execution.status = reason === INVALIDATION_REASONS.TIMEOUT 
            ? EXECUTION_STATUS.TIMED_OUT 
            : EXECUTION_STATUS.INVALIDATED;
        execution.abandonReason = reason;
        execution.abandonTime = new Date().toISOString();
        
        // Log as non-trade
        const nonTradeReason = reason === INVALIDATION_REASONS.TIMEOUT
            ? NON_TRADE_REASONS.EXECUTION_TIMEOUT
            : NON_TRADE_REASONS.STRUCTURAL_INVALIDATION;
        
        const nonTrade = createNonTradeEntry(
            'abandoned',
            execution.pair,
            execution.playbookId,
            description || `Execution abandoned: ${reason}`,
            nonTradeReason
        );
        nonTrade.executionModel = execution.executionModel;
        nonTrade.barsElapsed = execution.barsElapsed;
        
        state.nonTrades.push(nonTrade);
        
        // Clear active execution
        state.execution = null;
        
        saveState(state);
        
        console.log(`Circuit Breaker: Execution abandoned - ${execution.setupId}`, {
            reason, description
        });
        
        return { success: true };
    }

    /**
     * Mark execution as triggered (trade entered)
     * @returns {{ success: boolean }}
     */
    function triggerExecution() {
        const state = loadState();
        
        if (!state.execution || state.execution.status !== 'pending') {
            return { success: false };
        }
        
        state.execution.status = EXECUTION_STATUS.TRIGGERED;
        state.execution.triggeredAt = new Date().toISOString();
        
        saveState(state);
        
        console.log(`Circuit Breaker: Execution triggered - ${state.execution.setupId}`);
        
        return { success: true };
    }

    /**
     * Clear execution state after trade is logged
     * @returns {{ success: boolean }}
     */
    function clearExecution() {
        const state = loadState();
        state.execution = null;
        saveState(state);
        return { success: true };
    }

    /**
     * Get current execution state
     * @returns {object|null}
     */
    function getActiveExecution() {
        const state = loadState();
        return state.execution ? { ...state.execution } : null;
    }

    /**
     * Check if there's a pending execution for a pair
     * @param {string} pair 
     * @returns {boolean}
     */
    function hasPendingExecution(pair) {
        const state = loadState();
        return state.execution && 
               state.execution.pair === pair && 
               state.execution.status === EXECUTION_STATUS.PENDING;
    }

    /**
     * Get execution attempts remaining for a pair/model
     * @param {string} pair 
     * @param {string} executionModel 
     * @returns {number}
     */
    function getAttemptsRemaining(pair, executionModel) {
        const state = loadState();
        const attemptKey = `${pair}_${executionModel}`;
        const currentAttempts = state.executionAttempts?.[attemptKey] || 0;
        return Math.max(0, THRESHOLDS.MAX_EXECUTION_ATTEMPTS_PER_PAIR - currentAttempts);
    }

    // ============================================
    // NON-TRADE RECORDING
    // ============================================

    /**
     * Record a non-trade (voluntary pass, timeout, etc.)
     * @param {{ type: string, pair: string, playbookId: string, reason: string, reasonCode: string }} data 
     * @returns {{ success: boolean }}
     */
    /**
     * Record a non-trade event for audit trail
     * v1.4: Enhanced with hierarchical reason tracking
     * 
     * @param {{ type: string, pair: string, playbookId: string, reason: string, reasonCode: string, contributingReasonCodes?: string[], utccScore?: number, entryZone?: string, executionModel?: string }} data
     * @returns {{ success: boolean }}
     */
    function recordNonTrade(data) {
        const state = loadState();
        
        const nonTrade = createNonTradeEntry(
            data.type,
            data.pair,
            data.playbookId,
            data.reason,
            data.reasonCode,
            data.contributingReasonCodes || []
        );
        
        if (data.utccScore) nonTrade.utccScore = data.utccScore;
        if (data.entryZone) nonTrade.entryZone = data.entryZone;
        if (data.executionModel) nonTrade.executionModel = data.executionModel;
        
        state.nonTrades.push(nonTrade);
        
        // Keep last 200 non-trades
        if (state.nonTrades.length > 200) {
            state.nonTrades = state.nonTrades.slice(-200);
        }
        
        saveState(state);
        
        console.log('Circuit Breaker: Non-trade recorded', {
            type: data.type,
            primaryReason: data.reasonCode,
            contributing: data.contributingReasonCodes
        });
        
        return { success: true };
    }

    // ============================================
    // REVIEW SYSTEM
    // ============================================

    /**
     * Check if review is required before trading
     * @returns {boolean}
     */
    function isReviewRequired() {
        const state = loadState();
        return state.behavioural.revengeFlaggedForReview || state.pendingReview !== null;
    }

    /**
     * Get pending review details
     * @returns {{ required: boolean, type: string|null, reason: string|null }}
     */
    function getPendingReview() {
        const state = loadState();
        
        if (!state.pendingReview && !state.behavioural.revengeFlaggedForReview) {
            return { required: false, type: null, reason: null };
        }
        
        return {
            required: true,
            type: state.pendingReview?.type || 'revenge',
            reason: state.pendingReview?.reason || 'Revenge trade attempt detected'
        };
    }

    /**
     * Submit post-session review
     * @param {{ trigger: string, action: string, acknowledged: boolean }} reviewData 
     * @returns {{ success: boolean, reason: string|null }}
     */
    function submitReview(reviewData) {
        const { trigger, action, acknowledged } = reviewData;
        
        if (!trigger || trigger.length < 10) {
            return { success: false, reason: 'Please describe what triggered the behaviour (minimum 10 characters)' };
        }
        
        if (!action || action.length < 10) {
            return { success: false, reason: 'Please describe what you will do differently (minimum 10 characters)' };
        }
        
        if (!acknowledged) {
            return { success: false, reason: 'Please acknowledge the review' };
        }
        
        const state = loadState();
        
        // Record review in history
        const review = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            type: state.pendingReview?.type || 'revenge',
            trigger: trigger,
            action: action,
            originalReason: state.pendingReview?.reason || 'Revenge trade attempt'
        };
        
        state.reviewHistory.push(review);
        
        // Clear flags
        state.behavioural.revengeFlaggedForReview = false;
        state.pendingReview = null;
        
        saveState(state);
        
        console.log('Circuit Breaker: Review submitted', review);
        
        return { success: true, reason: null };
    }

    // ============================================
    // STATE INSPECTION
    // ============================================

    /**
     * Get full state snapshot (read-only)
     * @returns {object}
     */
    function getState() {
        return JSON.parse(JSON.stringify(loadState()));
    }

    /**
     * Get list of disabled playbooks
     * @returns {string[]}
     */
    function getDisabledPlaybooks() {
        const state = loadState();
        const disabled = [];
        
        // Check direct disables
        Object.keys(state.playbooks).forEach(pbId => {
            if (state.playbooks[pbId].disabled) {
                disabled.push(pbId);
            }
        });
        
        // Check trend playbooks if loss streak active
        if (state.behavioural.consecutiveLosses >= THRESHOLDS.CONSECUTIVE_LOSSES_FOR_TREND_DISABLE) {
            TREND_PLAYBOOKS.forEach(pbId => {
                if (!disabled.includes(pbId)) {
                    disabled.push(pbId);
                }
            });
        }
        
        return disabled;
    }

    /**
     * Get list of cooled pairs
     * @returns {string[]}
     */
    function getCooledPairs() {
        const state = loadState();
        const cooled = [];
        
        Object.keys(state.pairs).forEach(pair => {
            const p = state.pairs[pair];
            if (p.coolingActive || p.cooldownActive) {
                cooled.push(pair);
            }
        });
        
        return cooled;
    }

    /**
     * Get session statistics for UI
     * @returns {object}
     */
    function getSessionStats() {
        const state = loadState();
        
        return {
            sessionId: state.global.sessionId,
            sessionActive: state.global.sessionActive,
            tradesToday: state.global.tradesToday,
            winsToday: state.global.winsToday,
            lossesToday: state.global.lossesToday,
            breakevenToday: state.global.breakevenToday,
            dailyPnLPercent: state.global.dailyPnLPercent,
            consecutiveLosses: state.behavioural.consecutiveLosses,
            consecutiveLossesMax: state.behavioural.consecutiveLossesMax,
            riskMultiplier: state.global.riskMultiplier,
            timeDecayFactor: state.global.timeDecayFactor,
            leakageWarnings: state.behavioural.leakageWarningsCount,
            leakageBlocks: state.behavioural.leakageBlocksCount,
            reducedRiskMode: state.behavioural.reducedRiskMode,
            riskCapped: state.global.riskCapped,
            standDownActive: state.global.standDownActive,
            standDownLevel: state.global.standDownLevel,
            disabledPlaybooks: getDisabledPlaybooks(),
            cooledPairs: getCooledPairs()
        };
    }

    /**
     * Get lockout status for UI
     * @returns {{ active: boolean, type: string|null, reason: string|null, until: string|null, minutesRemaining: number|null }}
     */
    /**
     * Get lockout status for UI
     * v1.4: Enhanced with reasonCode and contributingFactors
     * @returns {{ active: boolean, type: string|null, reason: string|null, reasonCode: string|null, contributingFactors: string[], until: string|null, minutesRemaining: number|null }}
     */
    function getLockoutStatus() {
        const state = loadState();
        
        // Collect all contributing factors for display
        const contributingFactors = [];
        
        if (state.global.riskCapped) {
            contributingFactors.push('Daily loss cap active (-3%)');
        }
        if (state.behavioural.reducedRiskMode) {
            contributingFactors.push('Reduced risk mode (leakage)');
        }
        if (state.behavioural.consecutiveLosses >= 2) {
            contributingFactors.push(`${state.behavioural.consecutiveLosses} consecutive losses`);
        }
        if (state.global.timeDecayActive) {
            contributingFactors.push(`Time decay active (${Math.round(state.global.timeDecayFactor * 100)}%)`);
        }
        
        if (state.global.standDownActive) {
            return {
                active: true,
                type: 'stand_down',
                reason: state.global.standDownReason,
                reasonCode: NON_TRADE_REASONS.STAND_DOWN,
                contributingFactors: contributingFactors,
                until: state.global.standDownUntil,
                minutesRemaining: state.global.standDownUntil ? Math.ceil(minutesUntil(state.global.standDownUntil)) : null
            };
        }
        
        if (state.behavioural.leakageLockoutActive) {
            return {
                active: true,
                type: 'leakage_lockout',
                reason: 'Multiple leakage blocks',
                reasonCode: NON_TRADE_REASONS.LEAKAGE_LOCKOUT,
                contributingFactors: contributingFactors,
                until: state.behavioural.leakageLockoutUntil,
                minutesRemaining: Math.ceil(minutesUntil(state.behavioural.leakageLockoutUntil))
            };
        }
        
        if (state.behavioural.revengeFlaggedForReview || state.pendingReview) {
            return {
                active: true,
                type: 'review_required',
                reason: 'Post-session review required',
                reasonCode: NON_TRADE_REASONS.REVIEW_REQUIRED,
                contributingFactors: contributingFactors,
                until: null,
                minutesRemaining: null
            };
        }
        
        return {
            active: false,
            type: null,
            reason: null,
            reasonCode: null,
            contributingFactors: contributingFactors,  // Still useful for risk indicators
            until: null,
            minutesRemaining: null
        };
    }

    // ============================================
    // RESET (FOR TESTING ONLY)
    // ============================================

    function resetState() {
        if (!confirm('RESET ALL CIRCUIT BREAKER STATE?\n\nThis is for testing only and cannot be undone.')) {
            return false;
        }
        
        localStorage.removeItem(STORAGE_KEY);
        console.log('Circuit Breaker: State reset');
        return true;
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.CircuitBreaker = {
        // Version
        VERSION: MODULE_VERSION,
        SPEC_VERSION: SPEC_VERSION,
        
        // Constants (read-only)
        THRESHOLDS: Object.freeze(THRESHOLDS),
        TRADE_RESULTS: Object.freeze(TRADE_RESULTS),
        NON_TRADE_REASONS: Object.freeze(NON_TRADE_REASONS),
        EXECUTION_MODELS: Object.freeze(EXECUTION_MODELS),
        EXECUTION_STATUS: Object.freeze(EXECUTION_STATUS),
        INVALIDATION_REASONS: Object.freeze(INVALIDATION_REASONS),
        
        // Session management
        startSession: startSession,
        endSession: endSession,
        
        // Core gate functions
        canTrade: canTrade,
        canSelectPlaybook: canSelectPlaybook,
        canSelectPair: canSelectPair,
        canProceedToPreTrade: canProceedToPreTrade,
        canExecute: canExecute,
        
        // Risk calculation
        getEffectiveRisk: getEffectiveRisk,
        getRiskBreakdown: getRiskBreakdown,
        
        // Trade recording
        recordTradeResult: recordTradeResult,
        
        // Leakage handling
        recordLeakageWarning: recordLeakageWarning,
        recordLeakageBlock: recordLeakageBlock,
        recordRevengeAttempt: recordRevengeAttempt,
        
        // Lockout
        attemptLockoutResume: attemptLockoutResume,
        
        // Execution management
        getTimeoutRule: getTimeoutRule,
        startExecution: startExecution,
        updateExecutionBars: updateExecutionBars,
        checkExecutionTimeout: checkExecutionTimeout,
        checkStructuralInvalidation: checkStructuralInvalidation,
        abandonExecution: abandonExecution,
        triggerExecution: triggerExecution,
        clearExecution: clearExecution,
        getActiveExecution: getActiveExecution,
        hasPendingExecution: hasPendingExecution,
        getAttemptsRemaining: getAttemptsRemaining,
        
        // Non-trade recording
        recordNonTrade: recordNonTrade,
        
        // Review system
        isReviewRequired: isReviewRequired,
        getPendingReview: getPendingReview,
        submitReview: submitReview,
        
        // State inspection
        getState: getState,
        getDisabledPlaybooks: getDisabledPlaybooks,
        getCooledPairs: getCooledPairs,
        getSessionStats: getSessionStats,
        getLockoutStatus: getLockoutStatus,
        
        // Testing only
        resetState: resetState
    };

    console.log(`Circuit Breaker Module v${MODULE_VERSION} loaded (Spec v${SPEC_VERSION})`);

})();
