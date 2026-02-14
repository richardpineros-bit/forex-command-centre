// ============================================================================
// ALERT QUEUE MODULE v1.0.0
// Client-side interface for UTCC Alert Queue
// ============================================================================
// PURPOSE: Fetch, display, and match TradingView UTCC alerts
// DEPENDS: Server endpoint at /webhook/utcc and /utcc/* routes
// ============================================================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.0.0';
    
    // ========================================================================
    // CONFIGURATION
    // ========================================================================
    
    const CONFIG = {
        // Server endpoint (adjust if using different host/port)
        API_BASE: getApiBase(),
        
        // Polling
        POLL_INTERVAL_MS: 30000,      // Poll every 30 seconds
        POLL_ENABLED: true,
        
        // Matching
        MAX_MATCH_AGE_MINUTES: 240,   // 4 hours - must match server TTL
        
        // UI
        SHOW_MATCHED_ALERTS: false,   // Hide already-matched alerts
        MAX_DISPLAY_ALERTS: 10        // Limit displayed in UI
    };
    
    function getApiBase() {
        // Try to detect from current page or use default
        // Assumes webhook server is accessible via same domain or configured endpoint
        const stored = localStorage.getItem('ftcc_alert_api_base');
        if (stored) return stored;
        
        // Default: assume running on same server or proxied
        // Update this if your webhook server is on a different host
        return window.location.hostname === 'localhost' 
            ? 'http://localhost:3847'
            : 'https://api.pineros.club'; // Adjust to your actual endpoint
    }
    
    // ========================================================================
    // STATE
    // ========================================================================
    
    let state = {
        alerts: [],
        lastFetch: null,
        lastError: null,
        pollTimer: null,
        connected: false
    };
    
    // ========================================================================
    // API FUNCTIONS
    // ========================================================================
    
    /**
     * Fetch all unmatched alerts from server
     * @param {string} [pair] - Optional pair filter
     * @returns {Promise<Array>}
     */
    async function fetchAlerts(pair = null) {
        try {
            let url = `${CONFIG.API_BASE}/utcc/alerts?unmatched=true`;
            if (pair) {
                url += `&pair=${pair.toUpperCase()}`;
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            state.alerts = data.alerts || [];
            state.lastFetch = new Date().toISOString();
            state.lastError = null;
            state.connected = true;
            
            console.log(`[AlertQueue] Fetched ${state.alerts.length} alerts`);
            
            // Dispatch event for UI updates
            document.dispatchEvent(new CustomEvent('alertqueue:updated', {
                detail: { alerts: state.alerts, count: state.alerts.length }
            }));
            
            return state.alerts;
            
        } catch (error) {
            console.error('[AlertQueue] Fetch error:', error.message);
            state.lastError = error.message;
            state.connected = false;
            
            document.dispatchEvent(new CustomEvent('alertqueue:error', {
                detail: { error: error.message }
            }));
            
            return [];
        }
    }
    
    /**
     * Find the best matching alert for a pair and direction
     * @param {string} pair - e.g. "EURUSD"
     * @param {string} direction - "long" or "short"
     * @param {number} [maxAgeMinutes] - Maximum age in minutes
     * @returns {Promise<Object|null>}
     */
    async function findMatchingAlert(pair, direction, maxAgeMinutes = CONFIG.MAX_MATCH_AGE_MINUTES) {
        try {
            const url = `${CONFIG.API_BASE}/utcc/find?pair=${pair.toUpperCase()}&direction=${direction.toLowerCase()}&maxAge=${maxAgeMinutes}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.found && data.alert) {
                console.log(`[AlertQueue] Found match: ${data.alert.id} (${data.alert.age} ago)`);
                return data.alert;
            }
            
            console.log(`[AlertQueue] No match found for ${pair} ${direction}`);
            return null;
            
        } catch (error) {
            console.error('[AlertQueue] Find error:', error.message);
            return null;
        }
    }
    
    /**
     * Mark an alert as matched to a trade
     * @param {string} alertId - The alert ID
     * @param {string} tradeId - The trade ID to link
     * @returns {Promise<boolean>}
     */
    async function markAlertMatched(alertId, tradeId) {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/utcc/match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alertId, tradeId })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.ok) {
                console.log(`[AlertQueue] Matched alert ${alertId} to trade ${tradeId}`);
                
                // Remove from local state
                state.alerts = state.alerts.filter(a => a.id !== alertId);
                
                document.dispatchEvent(new CustomEvent('alertqueue:matched', {
                    detail: { alertId, tradeId }
                }));
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('[AlertQueue] Match error:', error.message);
            return false;
        }
    }
    
    /**
     * Get queue statistics from server
     * @returns {Promise<Object>}
     */
    async function getStats() {
        try {
            const response = await fetch(`${CONFIG.API_BASE}/utcc/stats`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('[AlertQueue] Stats error:', error.message);
            return null;
        }
    }
    
    // ========================================================================
    // POLLING
    // ========================================================================
    
    function startPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
        }
        
        if (CONFIG.POLL_ENABLED) {
            state.pollTimer = setInterval(() => {
                fetchAlerts();
            }, CONFIG.POLL_INTERVAL_MS);
            
            console.log(`[AlertQueue] Polling started (${CONFIG.POLL_INTERVAL_MS}ms)`);
        }
    }
    
    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
            console.log('[AlertQueue] Polling stopped');
        }
    }
    
    // ========================================================================
    // LOCAL HELPERS
    // ========================================================================
    
    /**
     * Get alerts from local cache (doesn't fetch)
     * @param {string} [pair] - Optional pair filter
     * @param {string} [direction] - Optional direction filter
     * @returns {Array}
     */
    function getLocalAlerts(pair = null, direction = null) {
        let alerts = state.alerts;
        
        if (pair) {
            alerts = alerts.filter(a => a.pair === pair.toUpperCase());
        }
        
        if (direction) {
            alerts = alerts.filter(a => a.direction === direction.toLowerCase());
        }
        
        return alerts;
    }
    
    /**
     * Check if we have a recent alert for a pair+direction
     * @param {string} pair
     * @param {string} direction
     * @param {number} [maxAgeMinutes=60]
     * @returns {boolean}
     */
    function hasRecentAlert(pair, direction, maxAgeMinutes = 60) {
        const alerts = getLocalAlerts(pair, direction);
        return alerts.some(a => a.ageMinutes <= maxAgeMinutes);
    }
    
    /**
     * Get the most recent alert for a pair+direction from cache
     * @param {string} pair
     * @param {string} direction
     * @returns {Object|null}
     */
    function getMostRecentAlert(pair, direction) {
        const alerts = getLocalAlerts(pair, direction);
        if (alerts.length === 0) return null;
        
        // Already sorted by timestamp desc from server
        return alerts[0];
    }
    
    // ========================================================================
    // UI RENDERING
    // ========================================================================
    
    /**
     * Render alert match panel in Pre-Trade tab
     * @param {Object|null} alert - The matched alert or null
     * @param {HTMLElement} container - Container element
     */
    function renderAlertMatchPanel(alert, container) {
        if (!container) return;
        
        if (!alert) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        
        container.style.display = 'block';
        container.innerHTML = `
            <div class="alert-match-header">
                <span class="alert-match-icon">&#x1F4E1;</span>
                <span>TradingView Alert Matched</span>
                <span class="alert-match-age">${alert.age} ago</span>
            </div>
            <div class="alert-match-data">
                <span class="match-item">
                    <strong>Score:</strong> 
                    <span class="match-score ${getScoreClass(alert.utcc.score)}">${alert.utcc.score}</span>
                </span>
                <span class="match-item">
                    <strong>Tier:</strong> 
                    <span class="match-tier tier-${alert.utcc.tier.toLowerCase()}">${alert.utcc.tier}</span>
                </span>
                <span class="match-item">
                    <strong>Criteria:</strong> 
                    <span class="match-criteria">${alert.utcc.criteriaPass}/5</span>
                </span>
                <span class="match-item">
                    <strong>Zone:</strong> 
                    <span class="match-zone zone-${alert.utcc.entryZone.toLowerCase()}">${alert.utcc.entryZone}</span>
                </span>
            </div>
            <div class="alert-match-criteria">
                ${renderCriteriaIcons(alert.utcc.criteriaMet)}
            </div>
        `;
    }
    
    function getScoreClass(score) {
        if (score >= 85) return 'score-perfect';
        if (score >= 80) return 'score-strong';
        if (score >= 75) return 'score-ready';
        return 'score-low';
    }
    
    function renderCriteriaIcons(criteriaMet) {
        const labels = ['Trend', 'MTF', 'Vol', 'ATR', 'News'];
        const keys = ['trendScore', 'mtfAlignment', 'volatilityReady', 'atrFilter', 'newsSafety'];
        
        return keys.map((key, i) => {
            const passed = criteriaMet[key];
            const icon = passed ? '&#x2714;' : '&#x2716;';
            const cls = passed ? 'criteria-pass' : 'criteria-fail';
            return `<span class="criteria-icon ${cls}" title="${labels[i]}">${icon}</span>`;
        }).join('');
    }
    
    /**
     * Render alerts list (for dashboard or debug panel)
     * @param {HTMLElement} container
     */
    function renderAlertsList(container) {
        if (!container) return;
        
        const alerts = state.alerts.slice(0, CONFIG.MAX_DISPLAY_ALERTS);
        
        if (alerts.length === 0) {
            container.innerHTML = '<div class="no-alerts">No pending UTCC alerts</div>';
            return;
        }
        
        container.innerHTML = alerts.map(alert => `
            <div class="utcc-alert-item" data-alert-id="${alert.id}">
                <div class="alert-pair-direction">
                    <span class="alert-pair">${alert.pair}</span>
                    <span class="alert-direction ${alert.direction}">${alert.direction.toUpperCase()}</span>
                </div>
                <div class="alert-utcc-data">
                    <span class="alert-score">${alert.utcc.score}</span>
                    <span class="alert-tier tier-${alert.utcc.tier.toLowerCase()}">${alert.utcc.tier}</span>
                </div>
                <div class="alert-age">${alert.age}</div>
            </div>
        `).join('');
    }
    
    // ========================================================================
    // CONFIGURATION
    // ========================================================================
    
    /**
     * Update API base URL
     * @param {string} baseUrl
     */
    function setApiBase(baseUrl) {
        CONFIG.API_BASE = baseUrl;
        localStorage.setItem('ftcc_alert_api_base', baseUrl);
        console.log(`[AlertQueue] API base set to: ${baseUrl}`);
    }
    
    /**
     * Get current configuration
     * @returns {Object}
     */
    function getConfig() {
        return { ...CONFIG };
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    function init() {
        console.log(`[AlertQueue] Module v${MODULE_VERSION} initialising...`);
        
        // Initial fetch
        fetchAlerts().then(() => {
            startPolling();
        });
        
        console.log(`[AlertQueue] Ready (API: ${CONFIG.API_BASE})`);
    }
    
    // ========================================================================
    // PUBLIC API
    // ========================================================================
    
    window.AlertQueue = {
        VERSION: MODULE_VERSION,
        
        // API functions
        fetchAlerts,
        findMatchingAlert,
        markAlertMatched,
        getStats,
        
        // Local helpers
        getLocalAlerts,
        hasRecentAlert,
        getMostRecentAlert,
        
        // Polling
        startPolling,
        stopPolling,
        
        // UI
        renderAlertMatchPanel,
        renderAlertsList,
        
        // Config
        setApiBase,
        getConfig,
        
        // State access (read-only)
        getState: () => ({ ...state }),
        isConnected: () => state.connected,
        
        // Init
        init
    };
    
    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

})();
