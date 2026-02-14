// ============================================
// SERVER STORAGE v1.1.0
// Direct Save/Load to Unraid Server
// ============================================
// PURPOSE: Persist app state on server, accessible from any device
// REPLACES: v1.0 (fixed cross-device sync bugs)
// ============================================
// CHANGELOG v1.1.0:
//   - Periodic server polling (30s) detects remote changes via lastModified
//   - localStorage intercept: mapped key writes trigger immediate debounced save
//   - Per-key change events: storage:updated:<key> for module re-renders
//   - Module refresh registry: modules register callbacks for auto-refresh
//   - Connection status tracking: connected / disconnected / stale
//   - Load guard prevents save-during-load ping-pong
//   - Dirty tracking: only saves keys that actually changed
//   - Health check on init with graceful fallback
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.1.0';
    const API_URL = '/api/storage-api.php';

    // Map localStorage keys to server file keys
    const STORAGE_MAP = {
        'ftcc_trades': 'trades',
        'ftcc_circuit_breaker': 'circuit-breaker',
        'ftcc_broker_config': 'broker-config',
        'ftcc_settings': 'settings',
        'ftcc_regime': 'regime',
        'ftcc_playbook': 'playbook'
    };

    // Reverse map for intercept lookups
    const REVERSE_MAP = {};
    for (const [localKey, serverKey] of Object.entries(STORAGE_MAP)) {
        REVERSE_MAP[serverKey] = localKey;
    }

    // ============================================
    // STATE
    // ============================================

    let isInitialised = false;
    let autoSaveTimer = null;
    let pollTimer = null;
    let lastSyncTime = null;
    let syncEnabled = true;
    let isLoadingFromServer = false; // Guard: suppress intercept during server loads
    let connectionStatus = 'unknown'; // 'connected' | 'disconnected' | 'stale'

    // Track server-side lastModified per key for change detection
    const serverTimestamps = {};

    // Dirty keys needing save (set by localStorage intercept)
    const dirtyKeys = new Set();

    // Debounce timer for intercepted writes
    let debounceSaveTimer = null;
    const DEBOUNCE_MS = 2000;

    // Poll interval for checking server changes
    const POLL_INTERVAL_MS = 30000;

    // Module refresh registry: { serverKey: [callback, callback, ...] }
    const refreshRegistry = {};

    // ============================================
    // CORE API
    // ============================================

    /**
     * Load data from server (single key)
     */
    async function loadFromServer(fileKey) {
        try {
            const response = await fetch(API_URL + '?file=' + encodeURIComponent(fileKey));
            if (!response.ok) {
                connectionStatus = 'disconnected';
                return { success: false, error: 'HTTP ' + response.status };
            }
            const result = await response.json();
            connectionStatus = 'connected';

            if (result.success) {
                return { success: true, data: result.data, lastModified: result.lastModified || null };
            } else {
                return { success: false, error: result.error };
            }
        } catch (e) {
            console.error('[ServerStorage] Load failed:', fileKey, e.message);
            connectionStatus = 'disconnected';
            return { success: false, error: e.message };
        }
    }

    /**
     * Save data to server (single key)
     */
    async function saveToServer(fileKey, data) {
        try {
            const response = await fetch(API_URL + '?file=' + encodeURIComponent(fileKey), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data })
            });
            if (!response.ok) {
                connectionStatus = 'disconnected';
                return { success: false, error: 'HTTP ' + response.status };
            }
            const result = await response.json();
            connectionStatus = 'connected';

            if (result.success) {
                // Update our tracked timestamp
                if (result.lastModified) {
                    serverTimestamps[fileKey] = result.lastModified;
                }
                return { success: true, lastModified: result.lastModified };
            } else {
                return { success: false, error: result.error };
            }
        } catch (e) {
            console.error('[ServerStorage] Save failed:', fileKey, e.message);
            connectionStatus = 'disconnected';
            return { success: false, error: e.message };
        }
    }

    // ============================================
    // SYNC OPERATIONS
    // ============================================

    /**
     * Load all data from server to localStorage.
     * Called on init and on manual "Load from Server".
     */
    async function loadAll() {
        console.log('[ServerStorage] Loading all from server...');
        isLoadingFromServer = true;
        const results = [];

        for (const [localKey, serverKey] of Object.entries(STORAGE_MAP)) {
            const result = await loadFromServer(serverKey);

            if (result.success && result.data !== null) {
                localStorage.setItem(localKey, JSON.stringify(result.data));
                if (result.lastModified) {
                    serverTimestamps[serverKey] = result.lastModified;
                }
                results.push({ key: serverKey, success: true });
                console.log('[ServerStorage] Loaded ' + serverKey);
            } else if (result.success && result.data === null) {
                results.push({ key: serverKey, success: true, empty: true });
            } else {
                results.push({ key: serverKey, success: false, error: result.error });
            }
        }

        isLoadingFromServer = false;
        lastSyncTime = new Date().toISOString();
        dirtyKeys.clear(); // Nothing dirty after full load

        window.dispatchEvent(new CustomEvent('storage:loaded', { detail: { results } }));

        return { success: true, results: results };
    }

    /**
     * Save all localStorage data to server.
     */
    async function saveAll() {
        if (!syncEnabled) return { success: false, error: 'Sync disabled' };

        console.log('[ServerStorage] Saving all to server...');
        const results = [];

        for (const [localKey, serverKey] of Object.entries(STORAGE_MAP)) {
            const localData = localStorage.getItem(localKey);

            if (localData) {
                try {
                    const data = JSON.parse(localData);
                    const result = await saveToServer(serverKey, data);
                    results.push({ key: serverKey, success: result.success, error: result.error });

                    if (result.success) {
                        console.log('[ServerStorage] Saved ' + serverKey);
                    }
                } catch (e) {
                    results.push({ key: serverKey, success: false, error: 'Invalid JSON' });
                }
            }
        }

        lastSyncTime = new Date().toISOString();
        dirtyKeys.clear();

        window.dispatchEvent(new CustomEvent('storage:saved', { detail: { results } }));
        updatePanel();

        return { success: true, results: results };
    }

    /**
     * Save only dirty keys (changed since last save).
     * Called by the debounced intercept handler.
     */
    async function saveDirty() {
        if (!syncEnabled || dirtyKeys.size === 0) return;

        const keysToSave = Array.from(dirtyKeys);
        dirtyKeys.clear();

        for (const serverKey of keysToSave) {
            const localKey = REVERSE_MAP[serverKey];
            if (!localKey) continue;

            const localData = localStorage.getItem(localKey);
            if (!localData) continue;

            try {
                const data = JSON.parse(localData);
                const result = await saveToServer(serverKey, data);
                if (result.success) {
                    console.log('[ServerStorage] Saved ' + serverKey + ' (dirty)');
                } else {
                    console.warn('[ServerStorage] Failed to save ' + serverKey + ':', result.error);
                    // Re-mark as dirty for retry
                    dirtyKeys.add(serverKey);
                }
            } catch (e) {
                console.error('[ServerStorage] Save error for ' + serverKey + ':', e.message);
                dirtyKeys.add(serverKey);
            }
        }

        lastSyncTime = new Date().toISOString();
        updatePanel();
    }

    /**
     * Save specific localStorage key to server.
     */
    async function saveKey(localKey) {
        if (!syncEnabled) return { success: false, error: 'Sync disabled' };

        const serverKey = STORAGE_MAP[localKey];
        if (!serverKey) {
            return { success: false, error: 'Unknown key: ' + localKey };
        }

        const localData = localStorage.getItem(localKey);
        if (!localData) {
            return { success: false, error: 'No local data for: ' + localKey };
        }

        try {
            const data = JSON.parse(localData);
            return await saveToServer(serverKey, data);
        } catch (e) {
            return { success: false, error: 'Invalid JSON' };
        }
    }

    // ============================================
    // POLLING - DETECT REMOTE CHANGES
    // ============================================

    /**
     * Poll server for changes made by other devices.
     * Compares lastModified timestamps and only reloads changed keys.
     * Notifies registered modules to re-render.
     */
    async function pollForChanges() {
        if (!syncEnabled || isLoadingFromServer) return;

        let anyUpdated = false;

        for (const [localKey, serverKey] of Object.entries(STORAGE_MAP)) {
            // Skip keys that are dirty locally (our changes take priority)
            if (dirtyKeys.has(serverKey)) continue;

            try {
                const result = await loadFromServer(serverKey);

                if (!result.success || result.data === null) continue;

                const remoteModified = result.lastModified || '';
                const knownModified = serverTimestamps[serverKey] || '';

                // If server has newer data than what we last saw
                if (remoteModified && remoteModified !== knownModified) {
                    // Compare actual content to avoid unnecessary re-renders
                    const localRaw = localStorage.getItem(localKey);
                    const remoteRaw = JSON.stringify(result.data);

                    if (localRaw !== remoteRaw) {
                        console.log('[ServerStorage] Remote change detected: ' + serverKey);

                        isLoadingFromServer = true;
                        localStorage.setItem(localKey, remoteRaw);
                        isLoadingFromServer = false;

                        serverTimestamps[serverKey] = remoteModified;
                        anyUpdated = true;

                        // Fire per-key event
                        window.dispatchEvent(new CustomEvent('storage:updated:' + serverKey, {
                            detail: { key: serverKey, data: result.data }
                        }));

                        // Call registered refresh callbacks
                        notifyRefreshCallbacks(serverKey, result.data);
                    } else {
                        // Content same, just update timestamp
                        serverTimestamps[serverKey] = remoteModified;
                    }
                }
            } catch (e) {
                // Silently skip - will retry next poll
            }
        }

        if (anyUpdated) {
            window.dispatchEvent(new CustomEvent('storage:remoteUpdate'));
            updatePanel();
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(pollForChanges, POLL_INTERVAL_MS);
        console.log('[ServerStorage] Polling started (every ' + (POLL_INTERVAL_MS / 1000) + 's)');
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ============================================
    // LOCALSTORAGE INTERCEPT
    // ============================================

    /**
     * Monkey-patch localStorage.setItem for mapped keys.
     * When any module writes to a mapped key, we mark it dirty
     * and trigger a debounced save to server.
     */
    function installInterceptor() {
        const originalSetItem = localStorage.setItem.bind(localStorage);

        localStorage.setItem = function(key, value) {
            // Always write to localStorage first
            originalSetItem(key, value);

            // If this is a mapped key and we're not loading from server
            if (STORAGE_MAP[key] && !isLoadingFromServer) {
                const serverKey = STORAGE_MAP[key];
                dirtyKeys.add(serverKey);

                // Debounced save
                if (debounceSaveTimer) clearTimeout(debounceSaveTimer);
                debounceSaveTimer = setTimeout(function() {
                    debounceSaveTimer = null;
                    saveDirty();
                }, DEBOUNCE_MS);
            }
        };

        console.log('[ServerStorage] localStorage interceptor installed');
    }

    // ============================================
    // MODULE REFRESH REGISTRY
    // ============================================

    /**
     * Register a callback to be called when a server key is updated remotely.
     * Usage: ServerStorage.onUpdate('regime', function(data) { RegimeModule.reload(data); });
     */
    function onUpdate(serverKey, callback) {
        if (!refreshRegistry[serverKey]) {
            refreshRegistry[serverKey] = [];
        }
        refreshRegistry[serverKey].push(callback);
    }

    /**
     * Remove a registered callback.
     */
    function offUpdate(serverKey, callback) {
        if (!refreshRegistry[serverKey]) return;
        refreshRegistry[serverKey] = refreshRegistry[serverKey].filter(function(cb) {
            return cb !== callback;
        });
    }

    /**
     * Notify all registered callbacks for a key.
     */
    function notifyRefreshCallbacks(serverKey, data) {
        const callbacks = refreshRegistry[serverKey];
        if (!callbacks || callbacks.length === 0) return;

        for (var i = 0; i < callbacks.length; i++) {
            try {
                callbacks[i](data);
            } catch (e) {
                console.error('[ServerStorage] Refresh callback error for ' + serverKey + ':', e);
            }
        }
    }

    // ============================================
    // AUTO-SAVE (periodic full save as safety net)
    // ============================================

    function startAutoSave(intervalMs) {
        if (typeof intervalMs === 'undefined') intervalMs = 60000;
        stopAutoSave();

        autoSaveTimer = setInterval(function() {
            saveAll();
        }, intervalMs);

        console.log('[ServerStorage] Auto-save started (every ' + (intervalMs / 1000) + 's)');
    }

    function stopAutoSave() {
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
            autoSaveTimer = null;
        }
    }

    // ============================================
    // UI PANEL
    // ============================================

    function injectPanel() {
        var container = document.getElementById('server-storage-panel');

        if (!container) {
            var brokerPanel = document.getElementById('broker-status-panel');
            if (brokerPanel) {
                container = document.createElement('div');
                container.id = 'server-storage-panel';
                brokerPanel.parentNode.insertBefore(container, brokerPanel.nextSibling);
            }
        }

        if (!container) {
            console.warn('[ServerStorage] Could not find panel container');
            return;
        }

        renderPanel(container);
        injectStyles();
    }

    function renderPanel(container) {
        var lastSync = lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never';
        var dirtyCount = dirtyKeys.size;

        // Status badge
        var statusClass = 'enabled';
        var statusText = '\u2713 Connected';
        if (connectionStatus === 'disconnected') {
            statusClass = 'disconnected';
            statusText = '\u2716 Disconnected';
        } else if (connectionStatus === 'stale') {
            statusClass = 'stale';
            statusText = '\u26A0 Stale';
        }

        // Dirty indicator
        var dirtyHtml = '';
        if (dirtyCount > 0) {
            dirtyHtml = '<div class="storage-info-row">' +
                '<span class="storage-label">Unsaved:</span>' +
                '<span class="storage-value storage-dirty">' + dirtyCount + ' key' + (dirtyCount > 1 ? 's' : '') + '</span>' +
                '</div>';
        }

        container.innerHTML =
            '<div class="storage-panel">' +
                '<div class="storage-panel-header">' +
                    '<h3><span class="storage-icon">\uD83D\uDCBE</span> Server Storage</h3>' +
                    '<div class="storage-status-badge ' + statusClass + '">' + statusText + '</div>' +
                '</div>' +
                '<div class="storage-content">' +
                    '<div class="storage-info">' +
                        '<div class="storage-info-row">' +
                            '<span class="storage-label">Last Sync:</span>' +
                            '<span class="storage-value">' + lastSync + '</span>' +
                        '</div>' +
                        '<div class="storage-info-row">' +
                            '<span class="storage-label">Auto-save:</span>' +
                            '<span class="storage-value">' + (autoSaveTimer ? 'On (60s)' : 'Off') + '</span>' +
                        '</div>' +
                        '<div class="storage-info-row">' +
                            '<span class="storage-label">Polling:</span>' +
                            '<span class="storage-value">' + (pollTimer ? 'On (30s)' : 'Off') + '</span>' +
                        '</div>' +
                        dirtyHtml +
                    '</div>' +
                    '<div class="storage-actions">' +
                        '<button class="storage-btn storage-btn-primary" onclick="ServerStorage.saveNow()">\u2B06 Save Now</button>' +
                        '<button class="storage-btn storage-btn-secondary" onclick="ServerStorage.loadNow()">\u2B07 Load from Server</button>' +
                    '</div>' +
                '</div>' +
                '<div id="storage-status-message" class="storage-status-message"></div>' +
            '</div>';
    }

    function updatePanel() {
        var container = document.getElementById('server-storage-panel');
        if (container) renderPanel(container);
    }

    function injectStyles() {
        if (document.getElementById('server-storage-styles')) return;

        var styles = document.createElement('style');
        styles.id = 'server-storage-styles';
        styles.textContent =
            '.storage-panel { background: var(--bg-secondary, #1a1a2e); border: 1px solid var(--border-color, #2d2d44); border-radius: var(--radius-lg, 12px); padding: var(--spacing-md, 1rem); margin-bottom: var(--spacing-lg, 1.5rem); }' +
            '.storage-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md, 1rem); padding-bottom: var(--spacing-sm, 0.5rem); border-bottom: 1px solid var(--border-color, #2d2d44); }' +
            '.storage-panel-header h3 { margin: 0; font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }' +
            '.storage-icon { font-size: 1.2rem; }' +
            '.storage-status-badge { font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: 500; }' +
            '.storage-status-badge.enabled { background: rgba(34, 197, 94, 0.15); color: var(--color-pass, #22c55e); }' +
            '.storage-status-badge.disconnected { background: rgba(239, 68, 68, 0.15); color: var(--color-fail, #ef4444); }' +
            '.storage-status-badge.stale { background: rgba(245, 158, 11, 0.15); color: var(--color-warn, #f59e0b); }' +
            '.storage-info { margin-bottom: var(--spacing-md, 1rem); }' +
            '.storage-info-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.85rem; }' +
            '.storage-label { color: var(--text-secondary, #888); }' +
            '.storage-value { color: var(--text-primary, #fff); font-family: var(--font-heading, monospace); }' +
            '.storage-dirty { color: var(--color-warn, #f59e0b); }' +
            '.storage-actions { display: flex; gap: var(--spacing-sm, 0.5rem); flex-wrap: wrap; }' +
            '.storage-btn { padding: 8px 16px; border-radius: var(--radius-sm, 4px); font-size: 0.85rem; cursor: pointer; border: none; transition: all 150ms ease; display: inline-flex; align-items: center; gap: 4px; }' +
            '.storage-btn-primary { background: var(--color-info, #3b82f6); color: white; }' +
            '.storage-btn-primary:hover { background: #2563eb; }' +
            '.storage-btn-secondary { background: var(--color-pass, #22c55e); color: white; }' +
            '.storage-btn-secondary:hover { background: #16a34a; }' +
            '.storage-status-message { margin-top: var(--spacing-sm, 0.5rem); padding: var(--spacing-sm, 0.5rem); border-radius: var(--radius-sm, 4px); font-size: 0.85rem; display: none; }' +
            '.storage-status-message.show { display: block; }' +
            '.storage-status-message.success { background: rgba(34, 197, 94, 0.15); color: var(--color-pass, #22c55e); }' +
            '.storage-status-message.error { background: rgba(239, 68, 68, 0.15); color: var(--color-fail, #ef4444); }' +
            '.storage-status-message.info { background: rgba(59, 130, 246, 0.15); color: var(--color-info, #3b82f6); }';
        document.head.appendChild(styles);
    }

    function showMessage(msg, type) {
        var el = document.getElementById('storage-status-message');
        if (el) {
            el.textContent = msg;
            el.className = 'storage-status-message show ' + type;
            if (type !== 'info') {
                setTimeout(function() { el.classList.remove('show'); }, 5000);
            }
        }
    }

    // ============================================
    // UI ACTIONS
    // ============================================

    async function saveNow() {
        showMessage('Saving...', 'info');
        var result = await saveAll();

        if (result.success) {
            var failed = result.results.filter(function(r) { return !r.success; });
            if (failed.length === 0) {
                showMessage('\u2713 Saved to server!', 'success');
            } else {
                showMessage('Saved with ' + failed.length + ' errors', 'error');
            }
            updatePanel();
        } else {
            showMessage('\u2716 Save failed: ' + result.error, 'error');
        }
    }

    async function loadNow() {
        if (!confirm('Load from server?\n\nThis will overwrite your current local data.')) return;

        showMessage('Loading...', 'info');
        var result = await loadAll();

        if (result.success) {
            showMessage('\u2713 Loaded from server! Refreshing...', 'success');
            setTimeout(function() { window.location.reload(); }, 1500);
        } else {
            showMessage('\u2716 Load failed: ' + result.error, 'error');
        }
    }

    // ============================================
    // INITIALISATION
    // ============================================

    async function init() {
        if (isInitialised) return;

        console.log('[ServerStorage] v' + MODULE_VERSION + ' initialising...');

        // Install localStorage interceptor BEFORE loading
        installInterceptor();

        // Load from server on startup (server is source of truth)
        await loadAll();

        // Start auto-save (every 60 seconds, full safety net)
        startAutoSave(60000);

        // Start polling for remote changes (every 30 seconds)
        startPolling();

        // Save on important events
        window.addEventListener('broker:tradeclose', function() {
            setTimeout(saveAll, 2000);
        });
        window.addEventListener('journal:entry', function() {
            setTimeout(saveAll, 1000);
        });

        // Save before page unload
        window.addEventListener('beforeunload', function() {
            if (syncEnabled) {
                saveAllBeacon();
            }
        });

        // Inject UI panel
        setTimeout(injectPanel, 500);

        isInitialised = true;
        console.log('[ServerStorage] v' + MODULE_VERSION + ' ready | Status: ' + connectionStatus + ' | Keys: ' + Object.keys(STORAGE_MAP).length);
    }

    // Beacon save for beforeunload (best effort)
    function saveAllBeacon() {
        if (!navigator.sendBeacon) return;

        for (const [localKey, serverKey] of Object.entries(STORAGE_MAP)) {
            var localData = localStorage.getItem(localKey);
            if (localData) {
                try {
                    var data = JSON.parse(localData);
                    var blob = new Blob([JSON.stringify({ data: data })], { type: 'application/json' });
                    navigator.sendBeacon(API_URL + '?file=' + encodeURIComponent(serverKey), blob);
                } catch (e) { /* best effort */ }
            }
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.ServerStorage = {
        VERSION: MODULE_VERSION,

        // Core
        loadFromServer: loadFromServer,
        saveToServer: saveToServer,
        loadAll: loadAll,
        saveAll: saveAll,
        saveDirty: saveDirty,
        saveKey: saveKey,

        // Auto-save
        startAutoSave: startAutoSave,
        stopAutoSave: stopAutoSave,

        // Polling
        startPolling: startPolling,
        stopPolling: stopPolling,
        pollNow: pollForChanges,

        // Module refresh registry
        onUpdate: onUpdate,
        offUpdate: offUpdate,

        // UI
        saveNow: saveNow,
        loadNow: loadNow,
        refresh: updatePanel,

        // Control
        enable: function() { syncEnabled = true; },
        disable: function() { syncEnabled = false; },
        isEnabled: function() { return syncEnabled; },

        // Status
        getStatus: function() {
            return {
                connection: connectionStatus,
                lastSync: lastSyncTime,
                dirtyKeys: Array.from(dirtyKeys),
                polling: !!pollTimer,
                autoSave: !!autoSaveTimer
            };
        },

        // Init
        init: init
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[ServerStorage] v' + MODULE_VERSION + ' loaded');

})();
