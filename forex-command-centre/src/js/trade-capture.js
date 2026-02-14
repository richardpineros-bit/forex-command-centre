// ============================================================================
// TRADE CAPTURE MODULE v1.1.0
// Unified Trade Capture System (UTCS)
// ============================================================================
// PURPOSE: Capture pre-trade state, manage pending trades, auto-populate journal
// DEPENDS: AlertQueue, CircuitBreaker, PlaybookModule, BrokerManager
// ============================================================================
// CHANGELOG v1.2.0:
//   - ADD: capturePreTradeState() now captures entryZone, volState, mtfAlignment, grade
//   - ADD: capturePreTradeState() captures Permission Log fields (regime, structure, etc.)
//   - NOTE: Permission Log data auto-flows from Pre-Trade to auto-journal
//
// CHANGELOG v1.1.0:
//   - FIX: findMatchingPosition() uses pos.direction instead of pos.units > 0
//     pos.units was always positive (Math.abs in broker-oanda getPositions)
//     so every match returned 'long' regardless of actual direction
//   - FIX: linkToOanda() now stores direction + initialUnits from normalised pos
//     journal-autofill deriveDirection() already reads these fields but got undefined
//   - FIX: handleClosed() uses oandaData.direction (broker truth) for R-calc
//     instead of preTradeData.direction (user input)
//   - ADD: dismissTrade() - dismiss single pending trade with reason + audit
//   - ADD: bulkDismissPendingTrades() - dismiss all closed_pending trades
//   - ADD: getDismissReasons() - valid dismiss reason codes
//   - oandaData schema now includes direction + initialUnits fields
// ============================================================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.2.0';
    const STORAGE_KEY = 'ftcc_pending_trades';
    const COMPLETED_KEY = 'ftcc_completed_trades';

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    const CONFIG = {
        OANDA_MATCH_WINDOW_MS: 30 * 60 * 1000,      // 30 minutes
        ALERT_MATCH_WINDOW_MINUTES: 240,            // 4 hours
        OANDA_POLL_INTERVAL_MS: 30000,              // 30 seconds
        MAX_PENDING_TRADES: 20,
        COMPLETED_RETENTION_DAYS: 90,
        PENDING_EXPIRY_HOURS: 24
    };

    const TRADE_STATUS = {
        PENDING: 'pending',
        OPEN: 'open',
        CLOSED_PENDING_REVIEW: 'closed_pending',
        COMPLETE: 'complete',
        EXPIRED: 'expired',
        CANCELLED: 'cancelled'
    };

    const DISMISS_REASONS = ['TEST', 'LEGACY', 'CANNOT_RECALL', 'DUPLICATE'];

    // ========================================================================
    // STATE
    // ========================================================================

    let state = {
        pendingTrades: [],
        openTrades: {},
        pollTimer: null,
        initialised: false
    };

    // ========================================================================
    // STORAGE
    // ========================================================================

    function loadPendingTrades() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('[TradeCapture] Load error:', e);
            return [];
        }
    }

    function savePendingTrades() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pendingTrades));
        } catch (e) {
            console.error('[TradeCapture] Save error:', e);
        }
    }

    function saveCompletedTrade(trade) {
        try {
            const stored = localStorage.getItem(COMPLETED_KEY);
            const completed = stored ? JSON.parse(stored) : [];
            completed.unshift(trade);
            
            // Trim old
            const cutoff = Date.now() - (CONFIG.COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const filtered = completed.filter(t => new Date(t.completedAt || t.createdAt).getTime() > cutoff);
            
            localStorage.setItem(COMPLETED_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error('[TradeCapture] Archive error:', e);
        }
    }

    // ========================================================================
    // PRE-TRADE STATE CAPTURE
    // ========================================================================

    function capturePreTradeState() {
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : null;
        };
        
        const getFloat = (id) => {
            const val = getValue(id);
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
        };
        
        const isChecked = (id) => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };

        // Get session
        const getCurrentSession = () => {
            const hour = new Date().getHours();
            if (hour >= 9 && hour < 17) return 'tokyo';
            if (hour >= 17 && hour < 22) return 'london';
            if (hour >= 22 || hour < 7) return 'newyork';
            return 'off-hours';
        };

        // Get regime from RegimeModule
        let regime = 'unknown';
        if (typeof RegimeModule !== 'undefined' && RegimeModule.getCurrentRegime) {
            const r = RegimeModule.getCurrentRegime();
            regime = r?.regime || r?.type || 'unknown';
        }

        // Get playbook from PlaybookModule
        let playbook = null;
        if (typeof PlaybookModule !== 'undefined' && PlaybookModule.getLockedPlaybook) {
            const pb = PlaybookModule.getLockedPlaybook();
            if (pb) playbook = { id: pb.id || pb.playbookId, name: pb.name || pb.playbookName };
        }

        // Get permission state from CircuitBreaker
        let permissionState = 'unknown';
        let riskMultiplier = 1.0;
        if (typeof CircuitBreaker !== 'undefined') {
            if (CircuitBreaker.canTrade) {
                const ct = CircuitBreaker.canTrade();
                permissionState = ct.allowed ? 'FULL' : 'BLOCKED';
            }
            if (CircuitBreaker.getEffectiveRisk) {
                const er = CircuitBreaker.getEffectiveRisk(1.0);
                riskMultiplier = er?.effectiveRisk || 1.0;
            }
        }

        // Calculate R:R
        const entry = getFloat('val-entry');
        const stop = getFloat('val-stop');
        const tp1 = getFloat('val-tp1');
        const direction = getValue('val-direction');
        let plannedRR = null;
        if (entry && stop && tp1 && direction) {
            const risk = Math.abs(entry - stop);
            const reward = direction === 'long' ? tp1 - entry : entry - tp1;
            plannedRR = risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
        }

        // Get entry type
        let entryType = 'market';
        const marketBtn = document.getElementById('btn-market');
        const limitBtn = document.getElementById('btn-limit');
        if (marketBtn && marketBtn.classList.contains('active')) entryType = 'market';
        if (limitBtn && limitBtn.classList.contains('active')) entryType = 'limit';

        return {
            pair: getValue('val-pair'),
            direction: direction,
            session: getCurrentSession(),
            regime: regime,
            playbook: playbook,
            permissionState: permissionState,
            riskMultiplier: riskMultiplier,
            
            plannedEntry: entry,
            plannedStop: stop,
            plannedTP1: tp1,
            plannedTP2: getFloat('val-tp2'),
            plannedRR: plannedRR,
            entryType: entryType,
            
            utccScore: getFloat('utcc-score-input') || getFloat('val-utcc-score') || getFloat('trade-trend-score'),
            entryZone: getValue('val-entry-zone') || getValue('trade-entry-zone') || '',
            volState: getValue('val-volatility') || getValue('trade-vol-state') || '',
            mtfAlignment: getValue('val-mtf') || getValue('trade-mtf') || '',
            grade: getValue('trade-grade') || '',

            // Permission Log (auto-captured from Regime tab / journal form)
            marketRegime: getValue('trade-market-regime') || regime,
            structureQuality: getValue('trade-structure-quality') || '',
            volContext: getValue('trade-vol-context') || '',
            sessionWindow: getValue('trade-session-window') || '',
            permissionReason: getValue('trade-permission-reason') || '',
            permissionEvidence: getValue('trade-permission-evidence') || '',
            
            criteriaChecks: {
                utcc4H: isChecked('inst-check-1-cb'),
                mtfAlign: isChecked('inst-check-2-cb'),
                htfBias: isChecked('inst-check-3-cb'),
                sessionValid: isChecked('inst-check-4-cb'),
                newsClear: isChecked('inst-check-5-cb')
            },
            
            executionChecks: {
                typeDeclared: isChecked('exec-type-declared'),
                singleTrigger: isChecked('exec-single-trigger'),
                plannedPrice: isChecked('exec-planned-price'),
                stopInvalidation: isChecked('exec-stop-invalidation'),
                spreadOk: isChecked('exec-spread-ok')
            },
            
            structureChecks: {
                slSwingIdentified: isChecked('sl-swing-identified'),
                slBufferAdded: isChecked('sl-buffer-added'),
                tpStructureIdentified: isChecked('tp-structure-identified'),
                tpPathClear: isChecked('tp-path-clear'),
                rrAcceptable: isChecked('rr-acceptable')
            },
            
            capturedAt: new Date().toISOString()
        };
    }

    // ========================================================================
    // PENDING TRADE CREATION
    // ========================================================================

    async function createPendingTrade() {
        const tradeId = 'trade_' + Date.now();
        const preTradeData = capturePreTradeState();
        
        if (!preTradeData.pair || !preTradeData.direction) {
            throw new Error('Missing required fields: pair and direction');
        }
        
        // Try to match TradingView alert
        let alertData = null;
        let alertId = null;
        
        if (typeof AlertQueue !== 'undefined' && AlertQueue.findMatchingAlert) {
            const matched = await AlertQueue.findMatchingAlert(
                preTradeData.pair,
                preTradeData.direction,
                CONFIG.ALERT_MATCH_WINDOW_MINUTES
            );
            
            if (matched) {
                alertId = matched.id;
                alertData = matched.utcc;
                console.log(`[TradeCapture] Matched alert: ${alertId} (Score: ${alertData?.score})`);
            }
        }
        
        const pendingTrade = {
            id: tradeId,
            status: TRADE_STATUS.PENDING,
            
            createdAt: new Date().toISOString(),
            openedAt: null,
            closedAt: null,
            completedAt: null,
            
            alertId: alertId,
            oandaTradeId: null,
            
            alertData: alertData,
            preTradeData: preTradeData,
            
            // v1.1.0: Added direction + initialUnits fields
            oandaData: {
                actualEntry: null,
                actualStop: null,
                actualTP: null,
                units: null,
                direction: null,
                initialUnits: null,
                exitPrice: null,
                realisedPL: null,
                duration: null
            },
            
            review: {
                outcome: null,
                rMultiple: null,
                executionQuality: null,
                lessonsLearned: '',
                whatWentRight: '',
                whatWentWrong: ''
            }
        };
        
        // Mark alert as matched
        if (alertId && typeof AlertQueue !== 'undefined' && AlertQueue.markAlertMatched) {
            await AlertQueue.markAlertMatched(alertId, tradeId);
        }
        
        state.pendingTrades.unshift(pendingTrade);
        
        if (state.pendingTrades.length > CONFIG.MAX_PENDING_TRADES) {
            state.pendingTrades = state.pendingTrades.slice(0, CONFIG.MAX_PENDING_TRADES);
        }
        
        savePendingTrades();
        
        console.log(`[TradeCapture] Created: ${tradeId} | ${preTradeData.pair} ${preTradeData.direction} | Alert: ${alertId ? 'YES' : 'NO'}`);
        
        document.dispatchEvent(new CustomEvent('tradecapture:created', {
            detail: { trade: pendingTrade }
        }));
        
        return pendingTrade;
    }

    // ========================================================================
    // OANDA INTEGRATION
    // ========================================================================

    async function pollOandaPositions() {
        if (typeof BrokerManager === 'undefined') return;
        if (typeof BrokerDashboard !== 'undefined' && !BrokerDashboard.isConnected()) return;
        
        try {
            let positions = [];
            if (BrokerManager.getPositions) {
                positions = await BrokerManager.getPositions();
                if (!Array.isArray(positions)) positions = [];
            }
            
            // Match pending trades to positions
            for (const pending of state.pendingTrades.filter(t => t.status === TRADE_STATUS.PENDING)) {
                const match = findMatchingPosition(pending, positions);
                if (match) await linkToOanda(pending, match);
            }
            
            // Check for closed positions
            for (const oandaId of Object.keys(state.openTrades)) {
                const stillOpen = positions.find(p => p.id === oandaId || p.tradeId === oandaId);
                if (!stillOpen) await handleClosed(state.openTrades[oandaId]);
            }
            
        } catch (e) {
            console.error('[TradeCapture] Poll error:', e);
        }
    }

    // v1.1.0 FIX: Use pos.direction from normalised data instead of pos.units > 0.
    // broker-oanda getPositions() runs Math.abs() on units, so units was always
    // positive and every match returned 'long'.
    function findMatchingPosition(pending, positions) {
        const pair = pending.preTradeData.pair;
        const direction = pending.preTradeData.direction;
        const createdAt = new Date(pending.createdAt).getTime();
        
        for (const pos of positions) {
            const posInstr = (pos.instrument || '').replace('_', '').toUpperCase();
            const pendingPair = pair.replace('_', '').toUpperCase();
            if (posInstr !== pendingPair) continue;
            
            // v1.1.0: Use normalised direction field from broker-oanda
            // Falls back to units sign check only if direction field missing
            const posDir = pos.direction || (pos.units > 0 ? 'long' : 'short');
            if (posDir !== direction) continue;
            
            const posTime = new Date(pos.openTime || pos.time).getTime();
            if (Math.abs(posTime - createdAt) <= CONFIG.OANDA_MATCH_WINDOW_MS) {
                return pos;
            }
        }
        return null;
    }

    // v1.1.0 FIX: Store direction + initialUnits from normalised position.
    // journal-autofill deriveDirection() reads oandaData.initialUnits but
    // previously got undefined because we never stored it.
    async function linkToOanda(pending, pos) {
        pending.status = TRADE_STATUS.OPEN;
        pending.openedAt = pos.openTime || pos.time || new Date().toISOString();
        pending.oandaTradeId = pos.id || pos.tradeId;
        
        pending.oandaData = {
            actualEntry: parseFloat(pos.price || pos.averagePrice || pos.entryPrice),
            actualStop: pos.stopLossOrder?.price ? parseFloat(pos.stopLossOrder.price)
                : (pos.stopLoss ? parseFloat(pos.stopLoss) : null),
            actualTP: pos.takeProfitOrder?.price ? parseFloat(pos.takeProfitOrder.price)
                : (pos.takeProfit ? parseFloat(pos.takeProfit) : null),
            units: Math.abs(parseInt(pos.units || pos.currentUnits)),
            // v1.1.0: Store direction + initialUnits from broker normalisation
            direction: pos.direction || null,
            initialUnits: pos.initialUnits !== undefined ? parseFloat(pos.initialUnits) : null,
            exitPrice: null,
            realisedPL: null,
            duration: null
        };
        
        state.openTrades[pending.oandaTradeId] = pending;
        savePendingTrades();
        
        const dir = pending.oandaData.direction || pending.preTradeData.direction;
        console.log(`[TradeCapture] Linked: ${pending.id} -> Oanda ${pending.oandaTradeId} (${dir.toUpperCase()})`);
        
        document.dispatchEvent(new CustomEvent('tradecapture:linked', { detail: { trade: pending } }));
        showNotification(`Trade linked: ${pending.preTradeData.pair} ${dir.toUpperCase()}`, 'success');
    }

    // v1.1.0 FIX: Use oandaData.direction (broker truth) for R-calc, not preTradeData.direction
    async function handleClosed(trade) {
        trade.status = TRADE_STATUS.CLOSED_PENDING_REVIEW;
        trade.closedAt = new Date().toISOString();
        
        // Calculate duration
        if (trade.openedAt) {
            const ms = new Date(trade.closedAt) - new Date(trade.openedAt);
            const hrs = Math.floor(ms / 3600000);
            const mins = Math.floor((ms % 3600000) / 60000);
            trade.oandaData.duration = hrs >= 24 
                ? `${Math.floor(hrs/24)}d ${hrs%24}h` 
                : `${hrs}h ${mins}m`;
        }
        
        // Calculate R-multiple if possible
        const entry = trade.oandaData.actualEntry;
        const exit = trade.oandaData.exitPrice;
        const stop = trade.preTradeData.plannedStop;
        // v1.1.0: Use Oanda direction (truth), fall back to preTradeData
        const dir = trade.oandaData.direction || trade.preTradeData.direction;
        
        if (entry && exit && stop) {
            const risk = Math.abs(entry - stop);
            const result = dir === 'long' ? exit - entry : entry - exit;
            if (risk > 0) {
                trade.review.rMultiple = Math.round((result / risk) * 100) / 100;
                trade.review.outcome = trade.review.rMultiple > 0.1 ? 'WIN' :
                                       trade.review.rMultiple < -0.1 ? 'LOSS' : 'BREAKEVEN';
            }
        }
        
        delete state.openTrades[trade.oandaTradeId];
        savePendingTrades();
        
        console.log(`[TradeCapture] Closed: ${trade.id} (${trade.review.outcome || 'unknown'}) dir=${dir}`);
        
        document.dispatchEvent(new CustomEvent('tradecapture:closed', { detail: { trade } }));
        showNotification(`Trade closed: ${trade.preTradeData.pair} - Ready for review`, 'info');
    }

    // ========================================================================
    // JOURNAL INTEGRATION
    // ========================================================================

    function populateJournalFromTrade(trade) {
        const pre = trade.preTradeData;
        const oanda = trade.oandaData;
        const alert = trade.alertData;
        
        const setValue = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== null && val !== undefined) {
                el.value = val;
                el.classList.add('auto-filled');
            }
        };
        
        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };
        
        // Metadata
        if (trade.openedAt) {
            setValue('trade-datetime', new Date(trade.openedAt).toISOString().slice(0, 16));
        }
        setValue('trade-pair', pre.pair);
        setValue('trade-session', pre.session);
        // v1.1.0: Use Oanda direction (truth), fall back to preTradeData
        setValue('trade-direction', oanda.direction || pre.direction);
        setValue('trade-market-regime', pre.regime);
        setValue('trade-permission-state', pre.permissionState);
        
        // Prices
        setValue('trade-entry', oanda.actualEntry || pre.plannedEntry);
        setValue('trade-stop', oanda.actualStop || pre.plannedStop);
        setValue('trade-tp', oanda.actualTP || pre.plannedTP1);
        if (oanda.exitPrice) setValue('trade-exit', oanda.exitPrice);
        
        // UTCC
        if (alert?.score) setValue('trade-utcc-score', alert.score);
        else if (pre.utccScore) setValue('trade-utcc-score', pre.utccScore);
        
        // Execution checks
        if (pre.executionChecks) {
            setChecked('exec-type-declared', pre.executionChecks.typeDeclared);
            setChecked('exec-single-trigger', pre.executionChecks.singleTrigger);
            setChecked('exec-planned-price', pre.executionChecks.plannedPrice);
            setChecked('exec-stop-invalidation', pre.executionChecks.stopInvalidation);
            setChecked('exec-spread-ok', pre.executionChecks.spreadOk);
        }
        
        // Store reference
        window._currentEditingTrade = trade;
        
        console.log('[TradeCapture] Populated journal from:', trade.id);
    }

    // ========================================================================
    // TRADE MANAGEMENT
    // ========================================================================

    function completeTrade(tradeId, reviewData) {
        const trade = state.pendingTrades.find(t => t.id === tradeId);
        if (!trade) return false;
        
        trade.status = TRADE_STATUS.COMPLETE;
        trade.completedAt = new Date().toISOString();
        trade.review = { ...trade.review, ...reviewData };
        
        saveCompletedTrade(trade);
        state.pendingTrades = state.pendingTrades.filter(t => t.id !== tradeId);
        savePendingTrades();
        
        // Record in CircuitBreaker
        if (typeof CircuitBreaker !== 'undefined' && CircuitBreaker.recordTradeResult) {
            const result = trade.review.outcome === 'WIN' ? 'win' :
                          trade.review.outcome === 'LOSS' ? 'loss' : 'breakeven';
            CircuitBreaker.recordTradeResult(
                trade.preTradeData.playbook?.id || 'unknown',
                trade.preTradeData.pair,
                result,
                trade.review.rMultiple || 0
            );
        }
        
        console.log('[TradeCapture] Completed:', tradeId);
        document.dispatchEvent(new CustomEvent('tradecapture:completed', { detail: { trade } }));
        return true;
    }

    function cancelPendingTrade(tradeId, reason = 'Manually cancelled') {
        const trade = state.pendingTrades.find(t => t.id === tradeId);
        if (!trade) return false;
        
        trade.status = TRADE_STATUS.CANCELLED;
        trade.cancelledAt = new Date().toISOString();
        trade.cancelReason = reason;
        
        if (trade.oandaTradeId) delete state.openTrades[trade.oandaTradeId];
        savePendingTrades();
        
        console.log('[TradeCapture] Cancelled:', tradeId);
        document.dispatchEvent(new CustomEvent('tradecapture:cancelled', { detail: { trade } }));
        return true;
    }

    // ========================================================================
    // v1.1.0: DISMISS FUNCTIONS
    // Single authority for dismissing pending trades. Both index.html dismiss
    // buttons and journal-autofill banner route through here.
    // ========================================================================

    /**
     * Dismiss a single pending trade by ID.
     * Sets status to COMPLETE with dismiss audit trail.
     * @param {string} tradeId - Trade ID (trade_xxx or matched by oandaTradeId)
     * @param {string} reason - One of DISMISS_REASONS
     * @returns {boolean} success
     */
    function dismissTrade(tradeId, reason) {
        if (!reason || !DISMISS_REASONS.includes(reason)) {
            console.warn('[TradeCapture] Invalid dismiss reason:', reason);
            return false;
        }

        const trade = state.pendingTrades.find(t => t.id === tradeId);
        if (!trade) {
            console.warn('[TradeCapture] Trade not found for dismiss:', tradeId);
            return false;
        }

        const now = new Date().toISOString();

        trade.status = TRADE_STATUS.COMPLETE;
        trade.completedAt = now;
        trade.dismissed = true;
        trade.dismissReason = reason;
        trade.dismissedAt = now;

        // Fill review fields so no gate can ever count this as incomplete
        trade.review = trade.review || {};
        trade.review.outcome = 'DISMISSED';
        trade.review.executionQuality = null;
        trade.review.lessonsLearned = 'Dismissed: ' + reason;

        // Archive then remove from pending
        saveCompletedTrade(trade);
        
        if (trade.oandaTradeId) delete state.openTrades[trade.oandaTradeId];
        state.pendingTrades = state.pendingTrades.filter(t => t.id !== tradeId);
        savePendingTrades();

        console.log(`[TradeCapture] Dismissed: ${tradeId} (${reason})`);
        document.dispatchEvent(new CustomEvent('tradecapture:dismissed', { detail: { trade } }));
        return true;
    }

    /**
     * Bulk dismiss all trades with status closed_pending.
     * @param {string} reason - One of DISMISS_REASONS
     * @returns {number} count of dismissed trades
     */
    function bulkDismissPendingTrades(reason) {
        if (!reason || !DISMISS_REASONS.includes(reason)) {
            console.warn('[TradeCapture] Invalid bulk dismiss reason:', reason);
            return 0;
        }

        const now = new Date().toISOString();
        let count = 0;

        state.pendingTrades.forEach(trade => {
            if (trade.status === TRADE_STATUS.CLOSED_PENDING_REVIEW) {
                trade.status = TRADE_STATUS.COMPLETE;
                trade.completedAt = now;
                trade.dismissed = true;
                trade.dismissReason = reason;
                trade.dismissedAt = now;
                trade.review = trade.review || {};
                trade.review.outcome = 'DISMISSED';
                trade.review.executionQuality = null;
                trade.review.lessonsLearned = 'Bulk dismissed: ' + reason;

                if (trade.oandaTradeId) delete state.openTrades[trade.oandaTradeId];
                saveCompletedTrade(trade);
                count++;
            }
        });

        // Remove all dismissed from pending
        state.pendingTrades = state.pendingTrades.filter(
            t => t.status !== TRADE_STATUS.COMPLETE || !t.dismissed
        );
        savePendingTrades();

        console.log(`[TradeCapture] Bulk dismissed: ${count} trades (${reason})`);
        document.dispatchEvent(new CustomEvent('tradecapture:bulkDismissed', { detail: { count, reason } }));
        return count;
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    function cleanupExpiredTrades() {
        const now = Date.now();
        const expiryMs = CONFIG.PENDING_EXPIRY_HOURS * 60 * 60 * 1000;
        
        state.pendingTrades = state.pendingTrades.filter(t => {
            if (t.status !== TRADE_STATUS.PENDING) return true;
            if (now - new Date(t.createdAt).getTime() > expiryMs) {
                t.status = TRADE_STATUS.EXPIRED;
                console.log('[TradeCapture] Expired:', t.id);
                return false;
            }
            return true;
        });
        savePendingTrades();
    }

    // ========================================================================
    // GETTERS
    // ========================================================================

    function getPendingTrades() {
        return state.pendingTrades.filter(t => t.status === TRADE_STATUS.PENDING);
    }

    function getOpenTrades() {
        return state.pendingTrades.filter(t => t.status === TRADE_STATUS.OPEN);
    }

    function getTradesAwaitingReview() {
        return state.pendingTrades.filter(t => t.status === TRADE_STATUS.CLOSED_PENDING_REVIEW);
    }

    function getTradeById(id) {
        return state.pendingTrades.find(t => t.id === id);
    }

    function getAllPendingTrades() {
        return [...state.pendingTrades];
    }

    function getDismissReasons() {
        return [...DISMISS_REASONS];
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    function showNotification(msg, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${msg}`);
        }
    }

    // ========================================================================
    // POLLING
    // ========================================================================

    function startPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.pollTimer = setInterval(() => {
            pollOandaPositions();
            cleanupExpiredTrades();
        }, CONFIG.OANDA_POLL_INTERVAL_MS);
        console.log('[TradeCapture] Polling started');
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    // ========================================================================
    // INITIALISATION
    // ========================================================================

    function init() {
        if (state.initialised) return;
        
        console.log(`[TradeCapture] v${MODULE_VERSION} initialising...`);
        
        state.pendingTrades = loadPendingTrades();
        
        // Rebuild openTrades index
        state.pendingTrades
            .filter(t => t.status === TRADE_STATUS.OPEN && t.oandaTradeId)
            .forEach(t => { state.openTrades[t.oandaTradeId] = t; });
        
        cleanupExpiredTrades();
        startPolling();
        
        state.initialised = true;
        console.log(`[TradeCapture] Ready (${state.pendingTrades.length} trades)`);
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    window.TradeCapture = {
        VERSION: MODULE_VERSION,
        TRADE_STATUS: Object.freeze(TRADE_STATUS),
        DISMISS_REASONS: Object.freeze(DISMISS_REASONS),
        
        capturePreTradeState,
        createPendingTrade,
        completeTrade,
        cancelPendingTrade,
        populateJournalFromTrade,
        
        // v1.1.0: Dismiss functions
        dismissTrade,
        bulkDismissPendingTrades,
        
        getPendingTrades,
        getOpenTrades,
        getTradesAwaitingReview,
        getTradeById,
        getAllPendingTrades,
        getDismissReasons,
        
        startPolling,
        stopPolling,
        pollOandaPositions,
        
        init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 200);
    }

})();
