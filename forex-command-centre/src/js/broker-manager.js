// ============================================
// BROKER MANAGER v1.0
// Unified Multi-Broker Interface
// ============================================
// PURPOSE: Abstract broker APIs behind consistent interface
// INTEGRATES: Circuit Breaker, Trade Journal
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.0';
    const STORAGE_KEY = 'ftcc_broker_config';
    const POLL_INTERVAL = 30000; // 30 seconds

    // ============================================
    // CONFIGURATION
    // ============================================

    const DEFAULT_CONFIG = {
        brokers: {},          // brokerId -> { type, credentials, enabled }
        activeAccountId: null,
        pollingEnabled: false,
        lastSync: null
    };

    // ============================================
    // STATE
    // ============================================

    let adapters = new Map();        // brokerId -> adapter instance
    let accounts = new Map();        // accountId -> { brokerId, account }
    let pollTimer = null;
    let tradeCallbacks = [];         // Subscribers for trade events
    let lastKnownTrades = new Map(); // accountId -> Set of tradeIds

    // ============================================
    // STORAGE
    // ============================================

    function loadConfig() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : { ...DEFAULT_CONFIG };
        } catch (e) {
            console.error('Broker Manager: Config load failed', e);
            return { ...DEFAULT_CONFIG };
        }
    }

    function saveConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.error('Broker Manager: Config save failed', e);
        }
    }

    // ============================================
    // ADAPTER REGISTRY
    // ============================================

    const adapterFactories = new Map();

    /**
     * Register an adapter factory
     * @param {string} type - Broker type (oanda, fxcm, ig)
     * @param {Function} factory - Factory function that creates adapter
     */
    function registerAdapterType(type, factory) {
        adapterFactories.set(type.toLowerCase(), factory);
        console.log(`Broker Manager: Registered adapter type '${type}'`);
    }

    /**
     * Create adapter instance from config
     * @param {string} type - Broker type
     * @param {object} credentials - Auth credentials
     * @returns {object|null} Adapter instance
     */
    function createAdapter(type, credentials) {
        const factory = adapterFactories.get(type.toLowerCase());
        if (!factory) {
            console.error(`Broker Manager: Unknown adapter type '${type}'`);
            return null;
        }
        return factory(credentials);
    }

    // ============================================
    // BROKER MANAGEMENT
    // ============================================

    /**
     * Register a broker connection
     * @param {object} config - { id, type, credentials, enabled }
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async function registerBroker(config) {
        const { id, type, credentials, enabled = true } = config;

        if (!id || !type || !credentials) {
            return { success: false, error: 'Missing required config: id, type, credentials' };
        }

        // Create adapter
        const adapter = createAdapter(type, credentials);
        if (!adapter) {
            return { success: false, error: `Unknown broker type: ${type}` };
        }

        // Test connection
        try {
            const connected = await adapter.connect();
            if (!connected.success) {
                return { success: false, error: connected.error || 'Connection failed' };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }

        // Store adapter
        adapters.set(id, adapter);

        // Fetch and store accounts
        try {
            const brokerAccounts = await adapter.getAccounts();
            brokerAccounts.forEach(acc => {
                accounts.set(acc.id, { brokerId: id, account: acc });
            });
        } catch (e) {
            console.warn(`Broker Manager: Failed to fetch accounts for ${id}`, e);
        }

        // Update config
        const storedConfig = loadConfig();
        storedConfig.brokers[id] = {
            type,
            credentials: encryptCredentials(credentials), // Basic obfuscation
            enabled
        };
        saveConfig(storedConfig);

        console.log(`Broker Manager: Registered broker '${id}' (${type})`);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('broker:registered', {
            detail: { brokerId: id, type }
        }));

        return { success: true };
    }

    /**
     * Unregister a broker
     * @param {string} brokerId
     */
    function unregisterBroker(brokerId) {
        const adapter = adapters.get(brokerId);
        if (adapter && adapter.disconnect) {
            adapter.disconnect();
        }

        adapters.delete(brokerId);

        // Remove associated accounts
        for (const [accId, data] of accounts.entries()) {
            if (data.brokerId === brokerId) {
                accounts.delete(accId);
            }
        }

        // Update config
        const config = loadConfig();
        delete config.brokers[brokerId];
        saveConfig(config);

        console.log(`Broker Manager: Unregistered broker '${brokerId}'`);
    }

    /**
     * Get connection status for all brokers
     * @returns {object} { brokerId: { connected, lastPing, error } }
     */
    function getConnectionStatus() {
        const status = {};
        for (const [id, adapter] of adapters.entries()) {
            status[id] = adapter.getStatus ? adapter.getStatus() : { connected: true };
        }
        return status;
    }

    // ============================================
    // CREDENTIAL HANDLING (Basic Obfuscation)
    // ============================================

    function encryptCredentials(creds) {
        // Basic Base64 encoding - NOT secure, just obscures from casual view
        // In production, use proper encryption
        return btoa(JSON.stringify(creds));
    }

    function decryptCredentials(encoded) {
        try {
            return JSON.parse(atob(encoded));
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // ACCOUNT METHODS
    // ============================================

    /**
     * Get all connected accounts
     * @returns {Array} Array of account objects
     */
    function getAccounts() {
        return Array.from(accounts.values()).map(({ account }) => account);
    }

    /**
     * Get account by ID
     * @param {string} accountId
     * @returns {object|null}
     */
    function getAccount(accountId) {
        const data = accounts.get(accountId);
        return data ? data.account : null;
    }

    /**
     * Get account summary with balance info
     * @param {string} accountId
     * @returns {Promise<object|null>}
     */
    async function getAccountSummary(accountId) {
        const data = accounts.get(accountId);
        if (!data) return null;

        const adapter = adapters.get(data.brokerId);
        if (!adapter) return null;

        try {
            return await adapter.getAccountSummary(accountId);
        } catch (e) {
            console.error(`Broker Manager: Failed to get account summary for ${accountId}`, e);
            return null;
        }
    }

    // ============================================
    // POSITION & TRADE METHODS
    // ============================================

    /**
     * Get open positions for an account
     * @param {string} accountId
     * @returns {Promise<Array>}
     */
    async function getPositions(accountId) {
        const data = accounts.get(accountId);
        if (!data) return [];

        const adapter = adapters.get(data.brokerId);
        if (!adapter) return [];

        try {
            return await adapter.getPositions(accountId);
        } catch (e) {
            console.error(`Broker Manager: Failed to get positions for ${accountId}`, e);
            return [];
        }
    }

    /**
     * Get open trades for an account
     * @param {string} accountId
     * @returns {Promise<Array>}
     */
    async function getOpenTrades(accountId) {
        const data = accounts.get(accountId);
        if (!data) return [];

        const adapter = adapters.get(data.brokerId);
        if (!adapter) return [];

        try {
            return await adapter.getOpenTrades(accountId);
        } catch (e) {
            console.error(`Broker Manager: Failed to get open trades for ${accountId}`, e);
            return [];
        }
    }

    /**
     * Get trade history
     * @param {string} accountId
     * @param {object} options - { from?: Date, to?: Date, count?: number }
     * @returns {Promise<Array>}
     */
    async function getTradeHistory(accountId, options = {}) {
        const data = accounts.get(accountId);
        if (!data) return [];

        const adapter = adapters.get(data.brokerId);
        if (!adapter) return [];

        try {
            return await adapter.getTradeHistory(accountId, options);
        } catch (e) {
            console.error(`Broker Manager: Failed to get trade history for ${accountId}`, e);
            return [];
        }
    }

    /**
     * Get all positions across all accounts
     * @returns {Promise<Array>}
     */
    async function getAllPositions() {
        const allPositions = [];
        for (const [accountId] of accounts.entries()) {
            const positions = await getPositions(accountId);
            allPositions.push(...positions);
        }
        return allPositions;
    }

    // ============================================
    // TRADE EVENT SUBSCRIPTION
    // ============================================

    /**
     * Subscribe to trade close events
     * @param {Function} callback - (trade) => void
     * @returns {Function} Unsubscribe function
     */
    function onTradeClose(callback) {
        tradeCallbacks.push(callback);
        return () => {
            const idx = tradeCallbacks.indexOf(callback);
            if (idx > -1) tradeCallbacks.splice(idx, 1);
        };
    }

    /**
     * Notify subscribers of closed trade
     * @param {object} trade
     */
    function notifyTradeClose(trade) {
        tradeCallbacks.forEach(cb => {
            try {
                cb(trade);
            } catch (e) {
                console.error('Broker Manager: Trade callback error', e);
            }
        });

        // Dispatch DOM event for other modules
        window.dispatchEvent(new CustomEvent('broker:tradeclose', {
            detail: { trade }
        }));
    }

    // ============================================
    // POLLING FOR NEW TRADES
    // ============================================

    /**
     * Start polling for trade updates
     */
    function startPolling() {
        if (pollTimer) return;

        const config = loadConfig();
        config.pollingEnabled = true;
        saveConfig(config);

        pollTimer = setInterval(pollForTrades, POLL_INTERVAL);
        pollForTrades(); // Initial poll

        console.log('Broker Manager: Polling started');
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        const config = loadConfig();
        config.pollingEnabled = false;
        saveConfig(config);

        console.log('Broker Manager: Polling stopped');
    }

    /**
     * Poll all accounts for new closed trades
     */
    async function pollForTrades() {
        for (const [accountId, data] of accounts.entries()) {
            try {
                const adapter = adapters.get(data.brokerId);
                if (!adapter) continue;

                // Get recent closed trades (last 24h)
                const history = await adapter.getTradeHistory(accountId, {
                    from: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    count: 50
                });

                // Check for new trades
                const knownTrades = lastKnownTrades.get(accountId) || new Set();
                const newTrades = history.filter(t => !knownTrades.has(t.id));

                if (newTrades.length > 0) {
                    console.log(`Broker Manager: ${newTrades.length} new closed trade(s) detected`);

                    newTrades.forEach(trade => {
                        knownTrades.add(trade.id);
                        notifyTradeClose(trade);
                    });

                    lastKnownTrades.set(accountId, knownTrades);
                }
            } catch (e) {
                console.warn(`Broker Manager: Poll failed for ${accountId}`, e);
            }
        }

        // Update last sync time
        const config = loadConfig();
        config.lastSync = new Date().toISOString();
        saveConfig(config);
    }

    // ============================================
    // INITIALISATION
    // ============================================

    /**
     * Reconnect stored brokers on load
     */
    async function reconnectStoredBrokers() {
        const config = loadConfig();

        for (const [brokerId, brokerConfig] of Object.entries(config.brokers)) {
            if (!brokerConfig.enabled) continue;

            const credentials = decryptCredentials(brokerConfig.credentials);
            if (!credentials) {
                console.warn(`Broker Manager: Failed to decrypt credentials for ${brokerId}`);
                continue;
            }

            const adapter = createAdapter(brokerConfig.type, credentials);
            if (!adapter) continue;

            try {
                const connected = await adapter.connect();
                if (connected.success) {
                    adapters.set(brokerId, adapter);

                    const brokerAccounts = await adapter.getAccounts();
                    brokerAccounts.forEach(acc => {
                        accounts.set(acc.id, { brokerId, account: acc });
                    });

                    console.log(`Broker Manager: Reconnected '${brokerId}'`);
                }
            } catch (e) {
                console.warn(`Broker Manager: Reconnect failed for ${brokerId}`, e);
            }
        }

        // Resume polling if it was enabled
        if (config.pollingEnabled) {
            startPolling();
        }
    }

    // ============================================
    // INSTRUMENT NORMALISATION
    // ============================================

    /**
     * Normalise instrument to standard format (EUR_USD)
     * @param {string} instrument - Raw instrument from broker
     * @param {string} brokerType - oanda, fxcm, ig
     * @returns {string}
     */
    function normaliseInstrument(instrument, brokerType) {
        if (!instrument) return '';

        switch (brokerType) {
            case 'oanda':
                // Already in EUR_USD format
                return instrument.toUpperCase();

            case 'fxcm':
                // EUR/USD -> EUR_USD
                return instrument.replace('/', '_').toUpperCase();

            case 'ig':
                // CS.D.EURUSD.CFD.IP -> EUR_USD
                const match = instrument.match(/\.([A-Z]{6})\./);
                if (match) {
                    return match[1].substring(0, 3) + '_' + match[1].substring(3);
                }
                return instrument.toUpperCase();

            default:
                return instrument.toUpperCase();
        }
    }

    /**
     * Convert normalised instrument back to broker format
     * @param {string} normalised - EUR_USD
     * @param {string} brokerType
     * @returns {string}
     */
    function denormaliseInstrument(normalised, brokerType) {
        if (!normalised) return '';

        switch (brokerType) {
            case 'oanda':
                return normalised;

            case 'fxcm':
                return normalised.replace('_', '/');

            case 'ig':
                // This needs lookup table - simplified version
                const pair = normalised.replace('_', '');
                return `CS.D.${pair}.CFD.IP`;

            default:
                return normalised;
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.BrokerManager = {
        VERSION: MODULE_VERSION,

        // Adapter registration
        registerAdapterType,

        // Broker management
        registerBroker,
        unregisterBroker,
        getConnectionStatus,

        // Account methods
        getAccounts,
        getAccount,
        getAccountSummary,

        // Trading methods
        getPositions,
        getOpenTrades,
        getTradeHistory,
        getAllPositions,

        // Events
        onTradeClose,

        // Polling
        startPolling,
        stopPolling,

        // Utilities
        normaliseInstrument,
        denormaliseInstrument,

        // Init (call after adapters loaded)
        init: reconnectStoredBrokers
    };

    console.log(`Broker Manager v${MODULE_VERSION} loaded`);

})();
