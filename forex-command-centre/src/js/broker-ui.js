// ============================================
// BROKER UI v1.0
// Connection Status & Account Display
// ============================================

(function() {
    'use strict';

    const UI_VERSION = '1.1.0';

    // ============================================
    // UI INJECTION
    // ============================================

    /**
     * Inject broker status panel into the page
     * Call after DOM is ready
     */
    function injectBrokerPanel() {
        // Find or create container
        let container = document.getElementById('broker-status-panel');
        
        if (!container) {
            // Create panel - append after circuit breaker section or at top of dashboard
            const dashboard = document.querySelector('.dashboard-section') || document.querySelector('.main-content');
            if (!dashboard) {
                console.warn('Broker UI: Could not find container for panel');
                return;
            }

            container = document.createElement('div');
            container.id = 'broker-status-panel';
            container.className = 'broker-panel';
            dashboard.insertBefore(container, dashboard.firstChild);
        }

        container.innerHTML = `
            <div class="broker-panel-header">
                <h3><span class="broker-icon">\u{1F3E6}</span> Broker Connections</h3>
                <button class="broker-settings-btn" onclick="BrokerUI.showSettings()" title="Broker Settings">
                    \u2699
                </button>
            </div>
            <div id="broker-accounts-list" class="broker-accounts-list">
                <div class="broker-loading">Checking connections...</div>
            </div>
            <div id="broker-sync-status" class="broker-sync-status"></div>
        `;

        // Inject styles if not present
        injectStyles();

        // Update display
        setTimeout(updateBrokerDisplay, 500);
    }

    /**
     * Inject CSS styles for broker panel
     */
    function injectStyles() {
        if (document.getElementById('broker-ui-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'broker-ui-styles';
        styles.textContent = `
            .broker-panel {
                background: var(--bg-secondary, #1a1a2e);
                border: 1px solid var(--border-color, #2d2d44);
                border-radius: var(--radius-lg, 12px);
                padding: var(--spacing-md, 1rem);
                margin-bottom: var(--spacing-lg, 1.5rem);
            }

            .broker-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-md, 1rem);
                padding-bottom: var(--spacing-sm, 0.5rem);
                border-bottom: 1px solid var(--border-color, #2d2d44);
            }

            .broker-panel-header h3 {
                margin: 0;
                font-size: 1rem;
                font-weight: 600;
                color: var(--text-primary, #fff);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .broker-icon {
                font-size: 1.2rem;
            }

            .broker-settings-btn {
                background: transparent;
                border: 1px solid var(--border-color, #2d2d44);
                border-radius: var(--radius-sm, 4px);
                color: var(--text-secondary, #888);
                padding: 4px 8px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 150ms ease;
            }

            .broker-settings-btn:hover {
                background: var(--bg-tertiary, #252540);
                color: var(--text-primary, #fff);
            }

            .broker-accounts-list {
                display: flex;
                flex-direction: column;
                gap: var(--spacing-sm, 0.5rem);
            }

            .broker-loading {
                color: var(--text-muted, #666);
                font-size: 0.85rem;
                padding: var(--spacing-sm, 0.5rem);
            }

            .broker-account-card {
                background: var(--bg-tertiary, #252540);
                border-radius: var(--radius-md, 8px);
                padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .broker-account-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .broker-account-name {
                font-weight: 600;
                color: var(--text-primary, #fff);
                font-size: 0.9rem;
            }

            .broker-account-type {
                font-size: 0.75rem;
                color: var(--text-muted, #666);
                text-transform: uppercase;
            }

            .broker-account-balance {
                text-align: right;
            }

            .broker-balance-value {
                font-family: var(--font-heading, 'JetBrains Mono', monospace);
                font-weight: 600;
                font-size: 1rem;
            }

            .broker-balance-value.positive { color: var(--color-pass, #22c55e); }
            .broker-balance-value.negative { color: var(--color-fail, #ef4444); }
            .broker-balance-value.neutral { color: var(--text-primary, #fff); }

            .broker-balance-label {
                font-size: 0.7rem;
                color: var(--text-muted, #666);
            }

            .broker-status-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 4px;
                margin-left: 8px;
            }

            .broker-status-badge.connected {
                background: rgba(34, 197, 94, 0.15);
                color: var(--color-pass, #22c55e);
            }

            .broker-status-badge.disconnected {
                background: rgba(239, 68, 68, 0.15);
                color: var(--color-fail, #ef4444);
            }

            .broker-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: currentColor;
            }

            .broker-sync-status {
                margin-top: var(--spacing-sm, 0.5rem);
                font-size: 0.75rem;
                color: var(--text-muted, #666);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .broker-no-connections {
                padding: var(--spacing-md, 1rem);
                text-align: center;
                color: var(--text-secondary, #888);
            }

            .broker-connect-btn {
                background: var(--color-info, #3b82f6);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: var(--radius-md, 8px);
                cursor: pointer;
                font-size: 0.85rem;
                margin-top: var(--spacing-sm, 0.5rem);
                transition: background 150ms ease;
            }

            .broker-connect-btn:hover {
                background: #2563eb;
            }

            /* Settings Modal */
            .broker-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }

            .broker-modal {
                background: var(--bg-secondary, #1a1a2e);
                border: 1px solid var(--border-color, #2d2d44);
                border-radius: var(--radius-lg, 12px);
                padding: var(--spacing-xl, 2rem);
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
            }

            .broker-modal h2 {
                margin: 0 0 var(--spacing-lg, 1.5rem) 0;
                font-size: 1.25rem;
            }

            .broker-form-group {
                margin-bottom: var(--spacing-md, 1rem);
            }

            .broker-form-group label {
                display: block;
                margin-bottom: 4px;
                font-size: 0.85rem;
                color: var(--text-secondary, #888);
            }

            .broker-form-group input,
            .broker-form-group select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--border-color, #2d2d44);
                border-radius: var(--radius-sm, 4px);
                background: var(--bg-tertiary, #252540);
                color: var(--text-primary, #fff);
                font-size: 0.9rem;
            }

            .broker-form-group input:focus,
            .broker-form-group select:focus {
                outline: none;
                border-color: var(--color-info, #3b82f6);
            }

            .broker-modal-actions {
                display: flex;
                gap: var(--spacing-sm, 0.5rem);
                justify-content: flex-end;
                margin-top: var(--spacing-lg, 1.5rem);
                padding-top: var(--spacing-md, 1rem);
                border-top: 1px solid var(--border-color, #2d2d44);
            }

            .broker-btn {
                padding: 8px 16px;
                border-radius: var(--radius-sm, 4px);
                font-size: 0.85rem;
                cursor: pointer;
                border: none;
                transition: all 150ms ease;
            }

            .broker-btn-primary {
                background: var(--color-info, #3b82f6);
                color: white;
            }

            .broker-btn-primary:hover {
                background: #2563eb;
            }

            .broker-btn-secondary {
                background: var(--bg-tertiary, #252540);
                color: var(--text-primary, #fff);
                border: 1px solid var(--border-color, #2d2d44);
            }

            .broker-btn-secondary:hover {
                background: var(--bg-primary, #0f0f1a);
            }

            .broker-btn-danger {
                background: var(--color-fail, #ef4444);
                color: white;
            }

            .broker-btn-danger:hover {
                background: #dc2626;
            }

            .broker-test-result {
                margin-top: var(--spacing-sm, 0.5rem);
                padding: var(--spacing-sm, 0.5rem);
                border-radius: var(--radius-sm, 4px);
                font-size: 0.85rem;
            }

            .broker-test-result.success {
                background: rgba(34, 197, 94, 0.15);
                color: var(--color-pass, #22c55e);
            }

            .broker-test-result.error {
                background: rgba(239, 68, 68, 0.15);
                color: var(--color-fail, #ef4444);
            }
        `;
        document.head.appendChild(styles);
    }

    // ============================================
    // DISPLAY UPDATES
    // ============================================

    /**
     * Update the broker accounts display
     */
    async function updateBrokerDisplay() {
        const container = document.getElementById('broker-accounts-list');
        const syncStatus = document.getElementById('broker-sync-status');
        
        if (!container) return;

        // Check if BrokerManager is available
        if (typeof window.BrokerManager === 'undefined') {
            container.innerHTML = `
                <div class="broker-loading">BrokerManager not loaded</div>
            `;
            return;
        }

        const accounts = window.BrokerManager.getAccounts();
        const status = window.BrokerManager.getConnectionStatus();

        if (accounts.length === 0) {
            container.innerHTML = `
                <div class="broker-no-connections">
                    <p>No broker connections configured</p>
                    <button class="broker-connect-btn" onclick="BrokerUI.showSettings()">
                        + Add Broker
                    </button>
                </div>
            `;
            // No accounts = disconnected
            var globalDotEmpty = document.getElementById('broker-global-status');
            if (globalDotEmpty) {
                globalDotEmpty.className = 'status-dot disconnected';
                globalDotEmpty.title = 'Broker: Disconnected';
            }
            return;
        }

        // Build account cards
        let html = '';
        for (const account of accounts) {
            const brokerStatus = status[account.broker] || {};
            const isConnected = brokerStatus.connected;
            const balanceClass = account.unrealizedPL >= 0 ? 'positive' : 'negative';

            html += `
                <div class="broker-account-card">
                    <div class="broker-account-info">
                        <div class="broker-account-name">
                            ${account.name}
                            <span class="broker-status-badge ${isConnected ? 'connected' : 'disconnected'}">
                                <span class="broker-status-dot"></span>
                                ${isConnected ? 'Live' : 'Offline'}
                            </span>
                        </div>
                        <div class="broker-account-type">${account.broker.toUpperCase()} - ${account.currency}</div>
                    </div>
                    <div class="broker-account-balance">
                        <div class="broker-balance-value neutral">
                            ${formatCurrency(account.balance, account.currency)}
                        </div>
                        <div class="broker-balance-label">
                            P&L: <span class="${balanceClass}">${formatCurrency(account.unrealizedPL, account.currency)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Update sync status
        if (syncStatus) {
            const config = JSON.parse(localStorage.getItem('ftcc_broker_config') || '{}');
            const lastSync = config.lastSync ? new Date(config.lastSync).toLocaleTimeString() : 'Never';
            syncStatus.innerHTML = `
                <span>Last sync: ${lastSync}</span>
                <button class="broker-btn broker-btn-secondary" onclick="BrokerUI.refreshAccounts()" style="padding: 4px 8px; font-size: 0.75rem;">
                    \u21BB Refresh
                </button>
            `;
        }

        // Sync global status dot in top bar
        var globalDot = document.getElementById('broker-global-status');
        if (globalDot) {
            var anyConnected = false;
            for (var brokerId in status) {
                if (status[brokerId] && status[brokerId].connected) {
                    anyConnected = true;
                    break;
                }
            }
            if (anyConnected) {
                globalDot.className = 'status-dot connected';
                globalDot.title = 'Broker: Connected';
            } else {
                globalDot.className = 'status-dot disconnected';
                globalDot.title = 'Broker: Disconnected';
            }
        }
    }

    /**
     * Format currency value
     */
    function formatCurrency(value, currency = 'AUD') {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    // ============================================
    // SETTINGS MODAL
    // ============================================

    function showSettings() {
        // Remove existing modal
        const existing = document.querySelector('.broker-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'broker-modal-overlay';
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        overlay.innerHTML = `
            <div class="broker-modal">
                <h2>\u{1F3E6} Broker Settings</h2>
                
                <div class="broker-form-group">
                    <label>Broker Type</label>
                    <select id="broker-type">
                        <option value="oanda">Oanda</option>
                        <option value="fxcm" disabled>FXCM (Coming Soon)</option>
                        <option value="ig" disabled>IG (Coming Soon)</option>
                    </select>
                </div>

                <div class="broker-form-group">
                    <label>Environment</label>
                    <select id="broker-environment">
                        <option value="live">Live</option>
                        <option value="practice">Practice</option>
                    </select>
                </div>

                <div class="broker-form-group">
                    <label>API Key / Token</label>
                    <input type="password" id="broker-apikey" placeholder="Enter your API key">
                </div>

                <div class="broker-form-group">
                    <label>Account ID</label>
                    <input type="text" id="broker-accountid" placeholder="e.g. 001-011-12345678-001">
                </div>

                <div id="broker-test-result"></div>

                <div class="broker-modal-actions">
                    <button class="broker-btn broker-btn-secondary" onclick="this.closest('.broker-modal-overlay').remove()">
                        Cancel
                    </button>
                    <button class="broker-btn broker-btn-primary" onclick="BrokerUI.testConnection()">
                        Test Connection
                    </button>
                    <button class="broker-btn broker-btn-primary" onclick="BrokerUI.saveConnection()">
                        Save & Connect
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Pre-fill if we have existing config
        const config = JSON.parse(localStorage.getItem('ftcc_broker_config') || '{}');
        if (config.brokers && config.brokers.oanda) {
            document.getElementById('broker-type').value = 'oanda';
            // Don't pre-fill credentials for security
        }
    }

    async function testConnection() {
        const resultDiv = document.getElementById('broker-test-result');
        const type = document.getElementById('broker-type').value;
        const environment = document.getElementById('broker-environment').value;
        const apiKey = document.getElementById('broker-apikey').value;
        const accountId = document.getElementById('broker-accountid').value;

        if (!apiKey || !accountId) {
            resultDiv.innerHTML = `<div class="broker-test-result error">Please fill in all fields</div>`;
            return;
        }

        resultDiv.innerHTML = `<div class="broker-test-result">Testing connection...</div>`;

        try {
            // Create temporary adapter
            const adapter = window.OandaAdapter.create({
                apiKey,
                accountId,
                environment
            });

            const result = await adapter.connect();

            if (result.success) {
                const accounts = await adapter.getAccounts();
                const account = accounts[0];
                resultDiv.innerHTML = `
                    <div class="broker-test-result success">
                        \u2713 Connected! Account: ${account.name} (${formatCurrency(account.balance, account.currency)})
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="broker-test-result error">
                        \u2717 Connection failed: ${result.error}
                    </div>
                `;
            }
        } catch (e) {
            resultDiv.innerHTML = `
                <div class="broker-test-result error">
                    \u2717 Error: ${e.message}
                </div>
            `;
        }
    }

    async function saveConnection() {
        const type = document.getElementById('broker-type').value;
        const environment = document.getElementById('broker-environment').value;
        const apiKey = document.getElementById('broker-apikey').value;
        const accountId = document.getElementById('broker-accountid').value;

        if (!apiKey || !accountId) {
            alert('Please fill in all fields');
            return;
        }

        try {
            const result = await window.BrokerManager.registerBroker({
                id: type,  // Use broker type as ID for single-broker setup
                type: type,
                credentials: {
                    apiKey,
                    accountId,
                    environment
                },
                enabled: true
            });

            if (result.success) {
                // Close modal
                document.querySelector('.broker-modal-overlay')?.remove();

                // Start polling
                window.BrokerManager.startPolling();

                // Update display
                updateBrokerDisplay();

                console.log('Broker UI: Connection saved and started');
            } else {
                alert(`Failed to save connection: ${result.error}`);
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    }

    async function refreshAccounts() {
        const container = document.getElementById('broker-accounts-list');
        if (container) {
            container.innerHTML = `<div class="broker-loading">Refreshing...</div>`;
        }

        // Re-init broker manager to refresh all connections
        if (window.BrokerManager) {
            await window.BrokerManager.init();
        }

        updateBrokerDisplay();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function setupEventListeners() {
        // Listen for broker events
        window.addEventListener('broker:registered', () => {
            updateBrokerDisplay();
        });

        window.addEventListener('broker:tradeclose', (e) => {
            console.log('Broker UI: Trade closed', e.detail.trade);
            updateBrokerDisplay();

            // Could show notification here
            showTradeNotification(e.detail.trade);
        });
    }

    function showTradeNotification(trade) {
        // Simple notification
        const isWin = trade.realizedPL > 0;
        const msg = `Trade Closed: ${trade.instrument} ${isWin ? 'WIN' : 'LOSS'} ${formatCurrency(trade.realizedPL, 'AUD')}`;

        // Use browser notification if available
        if (Notification.permission === 'granted') {
            new Notification('Trade Closed', {
                body: msg,
                icon: isWin ? '\u2713' : '\u2717'
            });
        }

        console.log(msg);
    }

    // ============================================
    // INITIALISATION
    // ============================================

    function init() {
        // Wait for dependencies
        const checkDeps = () => {
            if (typeof window.BrokerManager !== 'undefined') {
                injectBrokerPanel();
                setupEventListeners();

                // Init broker manager (reconnect stored brokers)
                window.BrokerManager.init();

                console.log(`Broker UI v${UI_VERSION} initialised`);
            } else {
                setTimeout(checkDeps, 100);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkDeps);
        } else {
            checkDeps();
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.BrokerUI = {
        VERSION: UI_VERSION,
        init,
        showSettings,
        testConnection,
        saveConnection,
        refreshAccounts,
        updateDisplay: updateBrokerDisplay
    };

    // Auto-init
    init();

    console.log(`Broker UI v${UI_VERSION} loaded`);

})();
