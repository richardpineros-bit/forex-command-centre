// ============================================
// TRADE JOURNAL v1.1
// Auto-Capture & Circuit Breaker Integration
// ============================================
// PURPOSE: Automatically capture trades from broker API
// INTEGRATES: BrokerManager, CircuitBreaker, existing Journal form
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.2';
    const STORAGE_KEY = 'ftcc_trades'; // Same as existing journal!

    // ============================================
    // STATE
    // ============================================

    let entries = [];
    let isInitialised = false;

    // ============================================
    // STORAGE
    // ============================================

    function loadEntries() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            entries = stored ? JSON.parse(stored) : [];
            return entries;
        } catch (e) {
            console.error('Trade Journal: Load failed', e);
            entries = [];
            return entries;
        }
    }

    function saveEntries() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        } catch (e) {
            console.error('Trade Journal: Save failed', e);
        }
    }

    // ============================================
    // ENTRY CREATION
    // ============================================

    /**
     * Create journal entry from closed trade (matches existing ftcc_trades format)
     * @param {object} trade - Normalised trade from BrokerManager
     * @returns {object} Journal entry
     */
    function createEntry(trade) {
        const now = new Date().toISOString();
        
        // Get Circuit Breaker state at close time
        let cbState = null;
        if (typeof window.CircuitBreaker !== 'undefined') {
            cbState = window.CircuitBreaker.getState();
        }

        // Calculate R-multiple if we have stop
        let rMultiple = trade.rValue || null;
        
        // Determine win/loss
        const pnl = trade.realizedPL || 0;
        const result = pnl > 0.5 ? 'win' : (pnl < -0.5 ? 'loss' : 'breakeven');

        // Build entry matching existing journal structure
        const entry = {
            // Core identification
            id: generateId(),
            createdAt: now,
            updatedAt: now,
            
            // Section A: Metadata (auto-filled from broker)
            date: trade.closeTime || now,
            pair: normaliseInstrument(trade.instrument),
            direction: trade.direction,
            session: detectSession(trade.closeTime),
            tradeType: '',
            permissionTF: '',
            executionTF: '',
            
            // Section B: Permission Log (manual - left empty)
            marketRegime: '',
            structureQuality: '',
            volContext: '',
            sessionWindow: '',
            permissionState: '',
            
            // Section C: Execution Quality (partial auto-fill)
            execTypeDeclared: false,
            execSingleTrigger: false,
            execPlannedPrice: false,
            execStopInvalidation: false,
            execSpreadOk: false,
            entryTrigger: '',
            entry: trade.entryPrice,
            stop: trade.stopLoss || null,
            tp: trade.takeProfit || null,
            exit: trade.exitPrice,
            units: Math.abs(trade.units),
            riskAmount: null,
            riskPct: null,
            
            // Section D: Management Discipline (manual)
            mgmtNoEarlyStop: false,
            mgmtPartialRules: false,
            mgmtExitRules: false,
            mgmtNoRevenge: false,
            exitReason: '',
            status: 'closed',
            slippage: 0,
            
            // Section E: Outcome Metrics (auto-filled)
            rMultiple: rMultiple,
            pnl: pnl,
            mae: null,
            mfe: null,
            trendScore: null,
            
            // Section F: Post-Trade Review (manual)
            classification: '',
            notes: '',
            lessons: '',
            screenshot: '',
            
            // Backwards compatibility
            alertType: 'AUTO_CAPTURE',
            entryZone: '',
            volState: '',
            mtf: '',
            grade: '',
            
            // Auto-capture metadata
            autoCapture: true,
            broker: trade.broker,
            brokerTradeId: trade.id,
            accountId: trade.accountId,
            openTime: trade.openTime,
            closeTime: trade.closeTime,
            
            // Circuit Breaker state at capture
            cbSessionId: cbState?.global?.sessionId || null,
            cbRiskMultiplier: cbState?.global?.riskMultiplier || 1.0
        };

        return entry;
    }

    /**
     * Normalise instrument format (EUR_USD → EURUSD)
     */
    function normaliseInstrument(instrument) {
        if (!instrument) return '';
        return instrument.replace(/_/g, '').replace(/\//g, '').toUpperCase();
    }

    /**
     * Detect trading session from timestamp
     */
    function detectSession(timestamp) {
        if (!timestamp) return '';
        const hour = new Date(timestamp).getUTCHours();
        
        if (hour >= 0 && hour < 7) return 'tokyo';
        if (hour >= 7 && hour < 12) return 'london';
        if (hour >= 12 && hour < 17) return 'newyork';
        if (hour >= 17 && hour < 21) return 'newyork';
        return 'tokyo';
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return 'tj_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============================================
    // AUTO-CAPTURE
    // ============================================

    /**
     * Handle trade close event from BrokerManager
     */
    function handleTradeClose(event) {
        const trade = event.detail?.trade;
        if (!trade) {
            console.warn('Trade Journal: No trade in event');
            return;
        }

        console.log('Trade Journal: Capturing trade', trade.id);

        // Check if already captured (by brokerTradeId)
        const existing = entries.find(e => e.brokerTradeId === trade.id && e.broker === trade.broker);
        if (existing) {
            console.log('Trade Journal: Trade already captured', trade.id);
            return;
        }

        // Create entry
        const entry = createEntry(trade);
        entries.unshift(entry); // Add to beginning like existing journal
        saveEntries();

        console.log('Trade Journal: Entry created', entry.id);

        // Record in Circuit Breaker
        recordInCircuitBreaker(entry);

        // Pre-fill the journal form
        prefillJournalForm(entry);

        // Dispatch event for UI
        window.dispatchEvent(new CustomEvent('journal:entry', {
            detail: { entry }
        }));

        // Show notification with link to journal
        showCaptureNotification(entry);

        // Trigger Nextcloud backup
        if (typeof window.NextcloudSync !== 'undefined') {
            const config = window.NextcloudSync.getConfig();
            if (config.enabled) {
                setTimeout(() => window.NextcloudSync.backupAll(), 2000);
            }
        }

        // Refresh trade history if function exists
        if (typeof window.loadTrades === 'function') {
            window.loadTrades();
        }
    }

    /**
     * Pre-fill the journal form with trade data
     */
    function prefillJournalForm(entry) {
        try {
            // Section A: Metadata
            const dateInput = document.getElementById('trade-datetime');
            if (dateInput && entry.date) {
                // Format for datetime-local input
                const d = new Date(entry.date);
                const formatted = d.toISOString().slice(0, 16);
                dateInput.value = formatted;
            }

            setSelectValue('trade-pair', entry.pair);
            setSelectValue('trade-direction', entry.direction);
            setSelectValue('trade-session', entry.session);

            // Section C: Execution (prices)
            setInputValue('trade-entry', entry.entry);
            setInputValue('trade-stop', entry.stop);
            setInputValue('trade-tp', entry.tp);
            setInputValue('trade-exit', entry.exit);
            setInputValue('trade-units', entry.units);

            // Section E: Outcome
            setInputValue('trade-r-display', entry.rMultiple?.toFixed(2));

            // Status
            setSelectValue('trade-status', 'closed');

            // Mark as auto-captured
            const alertTypeInput = document.getElementById('trade-alert-type');
            if (alertTypeInput) alertTypeInput.value = 'AUTO_CAPTURE';

            console.log('Trade Journal: Form pre-filled');

        } catch (e) {
            console.warn('Trade Journal: Form pre-fill failed', e);
        }
    }

    function setSelectValue(id, value) {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (el && value !== null && value !== undefined) el.value = value;
    }

    /**
     * Show notification that trade was captured
     */
    function showCaptureNotification(entry) {
        const result = entry.pnl >= 0 ? 'WIN' : 'LOSS';
        const resultClass = entry.pnl >= 0 ? 'success' : 'error';
        const pnlStr = entry.pnl >= 0 ? `+$${entry.pnl.toFixed(2)}` : `-$${Math.abs(entry.pnl).toFixed(2)}`;

        // Use existing showToast if available
        if (typeof window.showToast === 'function') {
            window.showToast(
                `Trade captured: ${entry.pair} ${result} (${pnlStr}) - Complete journal entry`, 
                resultClass
            );
        }

        // Also dispatch for any other listeners
        window.dispatchEvent(new CustomEvent('notification', {
            detail: {
                type: resultClass,
                title: 'Trade Captured',
                message: `${entry.pair} ${entry.direction.toUpperCase()} closed. ${pnlStr}. Journal form pre-filled.`
            }
        }));
    }

    /**
     * Record trade result in Circuit Breaker
     */
    function recordInCircuitBreaker(entry) {
        if (typeof window.CircuitBreaker === 'undefined') return;

        // Only record if we have a session
        const state = window.CircuitBreaker.getState();
        if (!state.global.sessionActive) {
            console.log('Trade Journal: No active CB session, skipping record');
            return;
        }

        // Get account balance for percentage calc
        let accountBalance = 10000; // Default fallback
        if (typeof window.BrokerManager !== 'undefined') {
            const account = window.BrokerManager.getAccount(entry.accountId);
            if (account?.balance) {
                accountBalance = account.balance;
            }
        }

        const pnl = entry.pnl || 0;
        const pnlPercent = (pnl / accountBalance) * 100;
        const result = pnl > 0.5 ? 'win' : (pnl < -0.5 ? 'loss' : 'breakeven');

        try {
            window.CircuitBreaker.recordTradeResult({
                pair: entry.pair,
                playbookId: entry.classification || 'unknown',
                result: result,
                rValue: entry.rMultiple || (result === 'win' ? 1 : -1),
                pnlPercent: pnlPercent
            });

            console.log('Trade Journal: Recorded in Circuit Breaker', {
                pair: entry.pair,
                result: result,
                pnlPercent: pnlPercent.toFixed(2) + '%'
            });

        } catch (e) {
            console.error('Trade Journal: CB record failed', e);
        }
    }

    // ============================================
    // ENTRY MANAGEMENT
    // ============================================

    /**
     * Get all entries
     */
    function getEntries() {
        return [...entries];
    }

    /**
     * Get entries with filters
     */
    function getFilteredEntries(filters = {}) {
        let result = [...entries];

        if (filters.pair) {
            result = result.filter(e => e.pair === filters.pair);
        }

        if (filters.direction) {
            result = result.filter(e => e.direction === filters.direction);
        }

        if (filters.status) {
            result = result.filter(e => e.status === filters.status);
        }

        if (filters.classification) {
            result = result.filter(e => e.classification === filters.classification);
        }

        if (filters.session) {
            result = result.filter(e => e.session === filters.session);
        }

        if (filters.from) {
            const fromDate = new Date(filters.from);
            result = result.filter(e => new Date(e.date) >= fromDate);
        }

        if (filters.to) {
            const toDate = new Date(filters.to);
            result = result.filter(e => new Date(e.date) <= toDate);
        }

        if (filters.autoCapture !== undefined) {
            result = result.filter(e => e.autoCapture === filters.autoCapture);
        }

        // Sort by date descending (most recent first)
        result.sort((a, b) => new Date(b.date) - new Date(a.date));

        return result;
    }

    /**
     * Get entry by ID
     */
    function getEntry(id) {
        return entries.find(e => e.id === id) || null;
    }

    /**
     * Update entry (manual fields)
     */
    function updateEntry(id, updates) {
        const entry = entries.find(e => e.id === id);
        if (!entry) return null;

        // Only allow updating manual fields
        const allowedFields = [
            'utccScore', 'entryZone', 'mtfAlignment', 'volatilityState', 'trendScore',
            'screenshot', 'notes', 'lessonsLearned', 'emotionalState', 'followedPlan',
            'tags', 'playbookId'
        ];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                entry[field] = updates[field];
            }
        });

        entry.updatedAt = new Date().toISOString();
        saveEntries();

        window.dispatchEvent(new CustomEvent('journal:updated', {
            detail: { entry }
        }));

        return entry;
    }

    /**
     * Delete entry
     */
    function deleteEntry(id) {
        const index = entries.findIndex(e => e.id === id);
        if (index === -1) return false;

        entries.splice(index, 1);
        saveEntries();

        window.dispatchEvent(new CustomEvent('journal:deleted', {
            detail: { id }
        }));

        return true;
    }

    /**
     * Add manual entry (for trades not captured automatically)
     * Usually not needed - use the existing Journal form instead
     */
    function addManualEntry(data) {
        const entry = {
            id: generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            autoCapture: false,
            alertType: 'MANUAL',
            status: data.status || 'open',
            ...data
        };

        entries.unshift(entry);
        saveEntries();

        window.dispatchEvent(new CustomEvent('journal:entry', {
            detail: { entry }
        }));

        // Refresh trade history if function exists
        if (typeof window.loadTrades === 'function') {
            window.loadTrades();
        }

        return entry;
    }

    // ============================================
    // STATISTICS
    // ============================================

    /**
     * Calculate statistics from entries
     */
    function getStatistics(filters = {}) {
        // Only closed trades
        const allFiltered = getFilteredEntries(filters);
        const filtered = allFiltered.filter(e => e.status === 'closed');

        if (filtered.length === 0) {
            return {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                breakeven: 0,
                winRate: 0,
                totalPL: 0,
                averagePL: 0,
                averageWin: 0,
                averageLoss: 0,
                largestWin: 0,
                largestLoss: 0,
                expectancy: 0,
                profitFactor: 0,
                averageRMultiple: 0
            };
        }

        const wins = filtered.filter(e => (e.pnl || 0) > 0.5);
        const losses = filtered.filter(e => (e.pnl || 0) < -0.5);
        const breakeven = filtered.filter(e => Math.abs(e.pnl || 0) <= 0.5);

        const totalPL = filtered.reduce((sum, e) => sum + (e.pnl || 0), 0);
        const totalWinPL = wins.reduce((sum, e) => sum + (e.pnl || 0), 0);
        const totalLossPL = Math.abs(losses.reduce((sum, e) => sum + (e.pnl || 0), 0));

        const rValues = filtered.filter(e => e.rMultiple !== null && e.rMultiple !== undefined).map(e => e.rMultiple);
        const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;

        return {
            totalTrades: filtered.length,
            wins: wins.length,
            losses: losses.length,
            breakeven: breakeven.length,
            winRate: (wins.length / filtered.length) * 100,
            totalPL: totalPL,
            averagePL: totalPL / filtered.length,
            averageWin: wins.length > 0 ? totalWinPL / wins.length : 0,
            averageLoss: losses.length > 0 ? totalLossPL / losses.length : 0,
            largestWin: wins.length > 0 ? Math.max(...wins.map(e => e.pnl || 0)) : 0,
            largestLoss: losses.length > 0 ? Math.min(...losses.map(e => e.pnl || 0)) : 0,
            expectancy: avgR,
            profitFactor: totalLossPL > 0 ? totalWinPL / totalLossPL : totalWinPL > 0 ? Infinity : 0,
            averageRMultiple: avgR
        };
    }

    /**
     * Get performance by pair
     */
    function getPerformanceByPair() {
        const pairs = [...new Set(entries.filter(e => e.pair).map(e => e.pair))];
        const result = {};

        pairs.forEach(pair => {
            result[pair] = getStatistics({ pair: pair });
        });

        return result;
    }

    /**
     * Get performance by session
     */
    function getPerformanceBySession() {
        const sessions = [...new Set(entries.filter(e => e.session).map(e => e.session))];
        const result = {};

        sessions.forEach(session => {
            result[session] = getStatistics({ session: session });
        });

        return result;
    }

    // ============================================
    // IMPORT / EXPORT
    // ============================================

    /**
     * Export entries as JSON
     */
    function exportJSON() {
        return JSON.stringify({
            version: MODULE_VERSION,
            exportedAt: new Date().toISOString(),
            entries: entries
        }, null, 2);
    }

    /**
     * Import entries from JSON
     */
    function importJSON(json, merge = true) {
        try {
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error('Invalid journal format');
            }

            if (merge) {
                // Merge, avoiding duplicates by tradeId
                data.entries.forEach(imported => {
                    const exists = entries.find(e => 
                        e.tradeId === imported.tradeId && e.broker === imported.broker
                    );
                    if (!exists) {
                        entries.push(imported);
                    }
                });
            } else {
                // Replace all
                entries = data.entries;
            }

            saveEntries();
            return { success: true, count: data.entries.length };

        } catch (e) {
            console.error('Trade Journal: Import failed', e);
            return { success: false, error: e.message };
        }
    }

    // ============================================
    // INITIALISATION
    // ============================================

    function init() {
        if (isInitialised) return;

        loadEntries();

        // v1.2: broker:tradeclose listener DISABLED
        // Auto-journal is now handled exclusively by broker-dashboard.js autoJournal engine
        // to prevent duplicate entries. TradeJournal is now read/write/stats only.
        // window.addEventListener('broker:tradeclose', handleTradeClose);

        isInitialised = true;
        console.log(`Trade Journal v${MODULE_VERSION} initialised (${entries.length} entries)`);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.TradeJournal = {
        VERSION: MODULE_VERSION,

        // Entry management
        getEntries,
        getFilteredEntries,
        getEntry,
        updateEntry,
        deleteEntry,
        addManualEntry,

        // Statistics
        getStatistics,
        getPerformanceByPair,
        getPerformanceBySession,

        // Import/Export
        exportJSON,
        importJSON,

        // Init
        init
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log(`Trade Journal v${MODULE_VERSION} loaded`);

})();
