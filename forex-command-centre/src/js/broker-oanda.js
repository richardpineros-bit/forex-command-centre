// ============================================
// OANDA BROKER ADAPTER v1.2.0
// REST v20 API Implementation
// ============================================
// API Docs: https://developer.oanda.com/rest-live-v20/introduction/
// Rate Limit: 120 requests/second
// ============================================
// CHANGELOG v1.2.0:
//   - FIX: Direction derivation - closed trades had currentUnits="0" (truthy)
//     which meant initialUnits sign was never checked. Now uses initialUnits first.
//   - FIX: initialUnits no longer Math.abs()'d - preserves sign for downstream use
//
// CHANGELOG v1.1.0:
//   - Added getTradeById() for fetching specific trade details
//   - Added calculateTradeMetrics() for R-multiple calculation
//   - Enhanced normaliseOandaTrade() with financing data
// ============================================

(function() {
    'use strict';

    const ADAPTER_VERSION = '1.2.0';
    const BROKER_TYPE = 'oanda';

    // API Endpoints
    const ENDPOINTS = {
        PRACTICE: 'https://api-fxpractice.oanda.com',
        LIVE: 'https://api-fxtrade.oanda.com'
    };

    // Use proxy to avoid CORS issues
    const PROXY_PATH = '/api/oanda-proxy.php';

    // ============================================
    // ADAPTER FACTORY
    // ============================================

    /**
     * Create Oanda adapter instance
     * @param {object} credentials - { apiKey, accountId, environment }
     * @returns {object} Adapter instance
     */
    function createOandaAdapter(credentials) {
        const { apiKey, accountId, environment = 'live' } = credentials;

        // State
        let connected = false;
        let lastError = null;
        let lastPing = null;
        let cachedAccount = null;

        // ----------------------------------------
        // INTERNAL: API Request
        // ----------------------------------------

        async function apiRequest(method, endpoint, body = null) {
            const baseUrl = environment === 'practice' ? ENDPOINTS.PRACTICE : ENDPOINTS.LIVE;
            const url = `${baseUrl}${endpoint}`;

            try {
                // Use proxy to avoid CORS
                const proxyUrl = `${PROXY_PATH}?url=${encodeURIComponent(url)}`;

                const options = {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Oanda-Token': apiKey
                    }
                };

                if (body) {
                    options.body = JSON.stringify(body);
                }

                const response = await fetch(proxyUrl, options);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.errorMessage || `HTTP ${response.status}`);
                }

                lastPing = new Date();
                return data;

            } catch (e) {
                lastError = e.message;
                throw e;
            }
        }

        // ----------------------------------------
        // CONNECTION
        // ----------------------------------------

        async function connect() {
            try {
                // Test connection by fetching account
                const data = await apiRequest('GET', `/v3/accounts/${accountId}`);

                if (data.account) {
                    connected = true;
                    cachedAccount = data.account;
                    lastError = null;
                    console.log(`Oanda Adapter: Connected to account ${accountId}`);
                    return { success: true };
                } else {
                    throw new Error('Invalid response from Oanda API');
                }

            } catch (e) {
                connected = false;
                lastError = e.message;
                console.error('Oanda Adapter: Connection failed', e);
                return { success: false, error: e.message };
            }
        }

        function disconnect() {
            connected = false;
            cachedAccount = null;
            console.log('Oanda Adapter: Disconnected');
        }

        function getStatus() {
            return {
                connected,
                lastPing: lastPing ? lastPing.toISOString() : null,
                error: lastError
            };
        }

        // ----------------------------------------
        // ACCOUNT METHODS
        // ----------------------------------------

        async function getAccounts() {
            // Oanda credentials are per-account, so return single account
            if (!connected) {
                await connect();
            }

            if (cachedAccount) {
                return [{
                    id: accountId,
                    broker: BROKER_TYPE,
                    name: cachedAccount.alias || accountId,
                    currency: cachedAccount.currency,
                    balance: parseFloat(cachedAccount.balance),
                    unrealizedPL: parseFloat(cachedAccount.unrealizedPL),
                    marginUsed: parseFloat(cachedAccount.marginUsed),
                    marginAvailable: parseFloat(cachedAccount.marginAvailable)
                }];
            }

            // Fetch fresh
            const data = await apiRequest('GET', `/v3/accounts/${accountId}`);
            cachedAccount = data.account;

            return [{
                id: accountId,
                broker: BROKER_TYPE,
                name: cachedAccount.alias || accountId,
                currency: cachedAccount.currency,
                balance: parseFloat(cachedAccount.balance),
                unrealizedPL: parseFloat(cachedAccount.unrealizedPL),
                marginUsed: parseFloat(cachedAccount.marginUsed),
                marginAvailable: parseFloat(cachedAccount.marginAvailable)
            }];
        }

        async function getAccountSummary(accId) {
            if (accId !== accountId) return null;

            const data = await apiRequest('GET', `/v3/accounts/${accountId}/summary`);
            const acc = data.account;

            return {
                id: accountId,
                broker: BROKER_TYPE,
                name: acc.alias || accountId,
                currency: acc.currency,
                balance: parseFloat(acc.balance),
                unrealizedPL: parseFloat(acc.unrealizedPL),
                realizedPL: parseFloat(acc.pl),
                marginUsed: parseFloat(acc.marginUsed),
                marginAvailable: parseFloat(acc.marginAvailable),
                marginRate: parseFloat(acc.marginRate),
                openTradeCount: acc.openTradeCount,
                openPositionCount: acc.openPositionCount,
                pendingOrderCount: acc.pendingOrderCount,
                NAV: parseFloat(acc.NAV),
                withdrawalLimit: parseFloat(acc.withdrawalLimit)
            };
        }

        // ----------------------------------------
        // POSITION METHODS
        // ----------------------------------------

        async function getPositions(accId) {
            if (accId !== accountId) return [];

            const data = await apiRequest('GET', `/v3/accounts/${accountId}/openPositions`);

            return (data.positions || []).map(pos => ({
                id: pos.instrument,  // Oanda uses instrument as position ID
                accountId: accountId,
                instrument: pos.instrument,
                direction: parseFloat(pos.long.units) > 0 ? 'long' : 'short',
                units: Math.abs(parseFloat(pos.long.units) || parseFloat(pos.short.units)),
                entryPrice: parseFloat(pos.long.averagePrice || pos.short.averagePrice),
                unrealizedPL: parseFloat(pos.unrealizedPL),
                marginUsed: parseFloat(pos.marginUsed || 0)
            }));
        }

        // ----------------------------------------
        // TRADE METHODS
        // ----------------------------------------

        async function getOpenTrades(accId) {
            if (accId !== accountId) return [];

            const data = await apiRequest('GET', `/v3/accounts/${accountId}/openTrades`);

            return (data.trades || []).map(trade => normaliseOandaTrade(trade, false));
        }

        /**
         * Get a specific trade by ID (open or closed)
         * NEW in v1.1.0 - Required for Phase 4 auto-capture
         * @param {string} accId - Account ID
         * @param {string} tradeId - Oanda trade ID
         * @returns {object|null} Normalised trade data
         */
        async function getTradeById(accId, tradeId) {
            if (accId !== accountId) return null;
            if (!tradeId) return null;

            try {
                const data = await apiRequest('GET', `/v3/accounts/${accountId}/trades/${tradeId}`);

                if (!data.trade) {
                    console.warn(`Oanda Adapter: Trade ${tradeId} not found`);
                    return null;
                }

                const trade = data.trade;
                const isClosed = trade.state === 'CLOSED';

                const normalised = normaliseOandaTrade(trade, isClosed);

                // Add extra details for closed trades
                if (isClosed) {
                    normalised.closingTransactionIDs = trade.closingTransactionIDs || [];
                }

                console.log(`Oanda Adapter: Fetched trade ${tradeId}`, {
                    state: trade.state,
                    isClosed,
                    realizedPL: normalised.realizedPL
                });

                return normalised;

            } catch (e) {
                console.error(`Oanda Adapter: Error fetching trade ${tradeId}`, e);
                return null;
            }
        }

        async function getTradeHistory(accId, options = {}) {
            if (accId !== accountId) return [];

            let endpoint = `/v3/accounts/${accountId}/trades?state=CLOSED`;

            // Add count limit
            const count = options.count || 100;
            endpoint += `&count=${Math.min(count, 500)}`;

            // Oanda doesn't support date filtering on trades endpoint directly
            // Need to use transactions for date-based filtering
            // For now, fetch recent and filter client-side

            const data = await apiRequest('GET', endpoint);

            let trades = (data.trades || []).map(trade => normaliseOandaTrade(trade, true));

            // Client-side date filtering
            if (options.from) {
                const fromDate = new Date(options.from);
                trades = trades.filter(t => new Date(t.closeTime) >= fromDate);
            }

            if (options.to) {
                const toDate = new Date(options.to);
                trades = trades.filter(t => new Date(t.closeTime) <= toDate);
            }

            return trades;
        }

        /**
         * Normalise Oanda trade to unified format
         * Enhanced in v1.1.0 with financing and better R-value calc
         * @param {object} trade - Raw Oanda trade
         * @param {boolean} isClosed - Whether trade is closed
         * @returns {object}
         */
        function normaliseOandaTrade(trade, isClosed) {
            // v1.2.0 FIX: Use initialUnits FIRST for direction.
            // For closed trades, currentUnits is "0" (truthy string),
            // so parseFloat gives 0, and 0 >= 0 always returned 'long'.
            // initialUnits retains the sign from Oanda: positive=LONG, negative=SHORT.
            const directionUnits = parseFloat(trade.initialUnits || trade.currentUnits);
            const displayUnits = parseFloat(trade.currentUnits || trade.initialUnits);

            const normalised = {
                id: trade.id,
                accountId: accountId,
                broker: BROKER_TYPE,
                instrument: trade.instrument,
                direction: directionUnits >= 0 ? 'long' : 'short',
                units: Math.abs(displayUnits),
                initialUnits: parseFloat(trade.initialUnits),
                entryPrice: parseFloat(trade.price),
                openTime: trade.openTime,
                state: trade.state || (isClosed ? 'CLOSED' : 'OPEN')
            };

            // Stop loss info (for R-value calculation)
            if (trade.stopLossOrder) {
                normalised.stopLoss = parseFloat(trade.stopLossOrder.price);
                normalised.stopLossOrderId = trade.stopLossOrder.id;
            }

            // Take profit info
            if (trade.takeProfitOrder) {
                normalised.takeProfit = parseFloat(trade.takeProfitOrder.price);
                normalised.takeProfitOrderId = trade.takeProfitOrder.id;
            }

            // Trailing stop info
            if (trade.trailingStopLossOrder) {
                normalised.trailingStop = parseFloat(trade.trailingStopLossOrder.distance);
            }

            if (isClosed) {
                normalised.exitPrice = parseFloat(trade.averageClosePrice || trade.price);
                normalised.closeTime = trade.closeTime;
                normalised.realizedPL = parseFloat(trade.realizedPL);
                
                // Financing (swap/rollover charges)
                normalised.financing = parseFloat(trade.financing || 0);
                
                // Net P&L (realized + financing)
                normalised.netPL = normalised.realizedPL + normalised.financing;

                // Calculate trade duration
                if (trade.openTime && trade.closeTime) {
                    normalised.duration = calculateDuration(trade.openTime, trade.closeTime);
                    normalised.durationMs = new Date(trade.closeTime) - new Date(trade.openTime);
                }

                // Calculate R-value if we have stop loss info
                if (normalised.stopLoss) {
                    const riskPips = Math.abs(normalised.entryPrice - normalised.stopLoss);
                    const resultPips = normalised.direction === 'long'
                        ? normalised.exitPrice - normalised.entryPrice
                        : normalised.entryPrice - normalised.exitPrice;

                    if (riskPips > 0) {
                        normalised.rValue = parseFloat((resultPips / riskPips).toFixed(2));
                    }
                }

                // Win/Loss classification
                if (normalised.realizedPL > 0.5) {
                    normalised.outcome = 'WIN';
                } else if (normalised.realizedPL < -0.5) {
                    normalised.outcome = 'LOSS';
                } else {
                    normalised.outcome = 'BREAKEVEN';
                }

                // Legacy field for backwards compatibility
                normalised.winLoss = normalised.outcome.toLowerCase();

            } else {
                // Open trade
                normalised.currentPrice = parseFloat(trade.unrealizedPL ? trade.price : trade.price);
                normalised.unrealizedPL = parseFloat(trade.unrealizedPL || 0);
            }

            return normalised;
        }

        /**
         * Calculate human-readable duration
         * @param {string} openTime - ISO timestamp
         * @param {string} closeTime - ISO timestamp
         * @returns {string} Formatted duration
         */
        function calculateDuration(openTime, closeTime) {
            const ms = new Date(closeTime) - new Date(openTime);
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) {
                return `${days}d ${hours % 24}h`;
            } else if (hours > 0) {
                return `${hours}h ${minutes % 60}m`;
            } else if (minutes > 0) {
                return `${minutes}m`;
            } else {
                return `${seconds}s`;
            }
        }

        /**
         * Calculate trade metrics for journaling
         * NEW in v1.1.0
         * @param {object} trade - Normalised trade
         * @param {object} plannedLevels - { entry, stop, target } from pre-trade
         * @returns {object} Calculated metrics
         */
        function calculateTradeMetrics(trade, plannedLevels = {}) {
            const metrics = {
                // Slippage (difference between planned and actual entry)
                entrySlippage: null,
                entrySlippagePips: null,
                
                // Actual R-multiple (from broker data)
                actualRMultiple: trade.rValue || null,
                
                // Planned vs actual comparison
                plannedRR: null,
                actualRR: null,
                
                // Execution quality indicator
                executionScore: null
            };

            // Calculate entry slippage if we have planned entry
            if (plannedLevels.entry && trade.entryPrice) {
                metrics.entrySlippage = trade.entryPrice - plannedLevels.entry;
                
                // Convert to pips (assumes 4/5 decimal places)
                const pipMultiplier = trade.instrument.includes('JPY') ? 100 : 10000;
                metrics.entrySlippagePips = parseFloat((metrics.entrySlippage * pipMultiplier).toFixed(1));
            }

            // Calculate planned R:R if we have all levels
            if (plannedLevels.entry && plannedLevels.stop && plannedLevels.target) {
                const plannedRisk = Math.abs(plannedLevels.entry - plannedLevels.stop);
                const plannedReward = Math.abs(plannedLevels.target - plannedLevels.entry);
                
                if (plannedRisk > 0) {
                    metrics.plannedRR = parseFloat((plannedReward / plannedRisk).toFixed(2));
                }
            }

            // Calculate actual R:R if trade is closed
            if (trade.entryPrice && trade.exitPrice && trade.stopLoss) {
                const actualRisk = Math.abs(trade.entryPrice - trade.stopLoss);
                const actualResult = trade.direction === 'long'
                    ? trade.exitPrice - trade.entryPrice
                    : trade.entryPrice - trade.exitPrice;
                
                if (actualRisk > 0) {
                    metrics.actualRR = parseFloat((actualResult / actualRisk).toFixed(2));
                }
            }

            // Execution score (1-5 based on slippage)
            if (metrics.entrySlippagePips !== null) {
                const absSlippage = Math.abs(metrics.entrySlippagePips);
                if (absSlippage <= 0.5) {
                    metrics.executionScore = 5; // Excellent
                } else if (absSlippage <= 1) {
                    metrics.executionScore = 4; // Good
                } else if (absSlippage <= 2) {
                    metrics.executionScore = 3; // Average
                } else if (absSlippage <= 5) {
                    metrics.executionScore = 2; // Below average
                } else {
                    metrics.executionScore = 1; // Poor
                }
            }

            return metrics;
        }

        // ----------------------------------------
        // TRANSACTION HISTORY (for detailed audit)
        // ----------------------------------------

        async function getTransactions(accId, options = {}) {
            if (accId !== accountId) return [];

            let endpoint = `/v3/accounts/${accountId}/transactions`;

            const params = [];
            if (options.from) {
                params.push(`from=${new Date(options.from).toISOString()}`);
            }
            if (options.to) {
                params.push(`to=${new Date(options.to).toISOString()}`);
            }
            if (options.type) {
                params.push(`type=${options.type}`);
            }

            if (params.length > 0) {
                endpoint += '?' + params.join('&');
            }

            const data = await apiRequest('GET', endpoint);
            return data.transactions || [];
        }

        // ----------------------------------------
        // RETURN ADAPTER INSTANCE
        // ----------------------------------------

        return {
            type: BROKER_TYPE,
            version: ADAPTER_VERSION,

            // Connection
            connect,
            disconnect,
            getStatus,

            // Accounts
            getAccounts,
            getAccountSummary,

            // Positions & Trades
            getPositions,
            getOpenTrades,
            getTradeById,           // NEW in v1.1.0
            getTradeHistory,
            
            // Utilities
            calculateTradeMetrics,  // NEW in v1.1.0

            // Advanced
            getTransactions,

            // Raw API access (for debugging)
            _apiRequest: apiRequest
        };
    }

    // ============================================
    // REGISTER WITH BROKER MANAGER
    // ============================================

    function registerWithManager() {
        if (typeof window.BrokerManager !== 'undefined') {
            window.BrokerManager.registerAdapterType(BROKER_TYPE, createOandaAdapter);
            console.log(`Oanda Adapter v${ADAPTER_VERSION} registered with BrokerManager`);
        } else {
            // Wait for BrokerManager
            setTimeout(registerWithManager, 100);
        }
    }

    // Auto-register on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerWithManager);
    } else {
        registerWithManager();
    }

    // Also expose factory directly for testing
    window.OandaAdapter = {
        VERSION: ADAPTER_VERSION,
        create: createOandaAdapter
    };

    console.log(`Oanda Adapter v${ADAPTER_VERSION} loaded`);

})();
