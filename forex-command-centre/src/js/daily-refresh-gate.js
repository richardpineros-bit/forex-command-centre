// ============================================
// DAILY REFRESH GATE MODULE v1.0.0
// Staleness Checker for Daily Context & Game Plan
// ============================================
// ROLE: Ensures briefing and playbook are fresh daily
// AUTHORITY: Informational (warns, doesn't block)
// PRINCIPLE: Market conditions change overnight; refresh every morning
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.0.0';
    const STORAGE_KEYS = {
        dailyContext: 'fcc_daily_context',
        playbook: 'ftcc_playbook',
        refreshGate: 'ftcc_refresh_gate_audit'
    };

    // ============================================
    // MODULE INTERFACE
    // ============================================

    window.DailyRefreshGate = {
        init: init,
        checkFreshness: checkFreshness,
        refreshBriefing: refreshBriefing,
        confirmBriefing: confirmBriefing,
        refreshGamePlan: refreshGamePlan,
        confirmGamePlan: confirmGamePlan,
        getAuditLog: getAuditLog
    };

    // ============================================
    // STATE
    // ============================================

    let auditLog = [];

    // ============================================
    // INITIALISATION
    // ============================================

    function init() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.refreshGate);
            if (stored) {
                auditLog = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('DailyRefreshGate: Could not load audit log', e);
            auditLog = [];
        }

        console.log('DailyRefreshGate v' + MODULE_VERSION + ' initialised');
        return true;
    }

    // ============================================
    // FRESHNESS CHECKING
    // ============================================

    /**
     * Check if briefing and game plan are fresh
     * @returns {Object} { briefingFresh: bool, playbookFresh: bool, briefingTimestamp: string, playbookTimestamp: string }
     */
    function checkFreshness() {
        const today = getTodayDateString();

        // Check Daily Context
        const contextRaw = localStorage.getItem(STORAGE_KEYS.dailyContext);
        const contextData = contextRaw ? tryParse(contextRaw) : null;
        const briefingTimestamp = contextData ? contextData.timestamp : null;
        const briefingFresh = briefingTimestamp ? isToday(briefingTimestamp) : false;

        // Check Playbook
        const playbookRaw = localStorage.getItem(STORAGE_KEYS.playbook);
        const playbookData = playbookRaw ? tryParse(playbookRaw) : null;
        const playbookTimestamp = playbookData ? playbookData.timestamp : null;
        const playbookFresh = playbookTimestamp ? isToday(playbookTimestamp) : false;

        const verdict = {
            briefingFresh: briefingFresh,
            playbookFresh: playbookFresh,
            briefingTimestamp: briefingTimestamp,
            playbookTimestamp: playbookTimestamp,
            today: today
        };

        logFreshnessCheck(verdict);
        return verdict;
    }

    /**
     * Update briefing by marking current time
     */
    function refreshBriefing() {
        const contextRaw = localStorage.getItem(STORAGE_KEYS.dailyContext);
        if (!contextRaw) {
            console.warn('DailyRefreshGate: No briefing data to refresh');
            return false;
        }

        const contextData = tryParse(contextRaw);
        if (!contextData) {
            console.warn('DailyRefreshGate: Could not parse briefing data');
            return false;
        }

        // Add timestamp
        contextData.timestamp = new Date().toISOString();
        localStorage.setItem(STORAGE_KEYS.dailyContext, JSON.stringify(contextData));

        console.log('DailyRefreshGate: Briefing refreshed at', contextData.timestamp);
        return true;
    }

    /**
     * Confirm briefing without changing it (just update timestamp)
     */
    function confirmBriefing() {
        return refreshBriefing(); // Same action - just updating timestamp
    }

    /**
     * Update game plan by marking current time
     */
    function refreshGamePlan() {
        const playbookRaw = localStorage.getItem(STORAGE_KEYS.playbook);
        if (!playbookRaw) {
            console.warn('DailyRefreshGate: No game plan data to refresh');
            return false;
        }

        const playbookData = tryParse(playbookRaw);
        if (!playbookData) {
            console.warn('DailyRefreshGate: Could not parse game plan data');
            return false;
        }

        // Add timestamp
        playbookData.timestamp = new Date().toISOString();
        localStorage.setItem(STORAGE_KEYS.playbook, JSON.stringify(playbookData));

        console.log('DailyRefreshGate: Game plan refreshed at', playbookData.timestamp);
        return true;
    }

    /**
     * Confirm game plan without changing it (just update timestamp)
     */
    function confirmGamePlan() {
        return refreshGamePlan(); // Same action - just updating timestamp
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    function getTodayDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function isToday(timestamp) {
        if (!timestamp) return false;
        const today = getTodayDateString();
        const tsDate = timestamp.substring(0, 10); // YYYY-MM-DD from ISO string
        return tsDate === today;
    }

    function tryParse(jsonStr) {
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            console.warn('DailyRefreshGate: JSON parse error', e);
            return null;
        }
    }

    function formatTimestamp(iso) {
        if (!iso) return 'Unknown';
        const date = new Date(iso);
        const timeStr = date.toLocaleString('en-AU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        return timeStr;
    }

    function logFreshnessCheck(verdict) {
        const entry = {
            timestamp: new Date().toISOString(),
            briefingFresh: verdict.briefingFresh,
            playbookFresh: verdict.playbookFresh,
            briefingTimestamp: verdict.briefingTimestamp,
            playbookTimestamp: verdict.playbookTimestamp
        };

        auditLog.push(entry);

        if (auditLog.length > 50) {
            auditLog = auditLog.slice(-50);
        }

        try {
            localStorage.setItem(STORAGE_KEYS.refreshGate, JSON.stringify(auditLog));
        } catch (e) {
            console.warn('DailyRefreshGate: Could not persist audit log', e);
        }
    }

    function getAuditLog() {
        return JSON.parse(JSON.stringify(auditLog));
    }

    // ============================================
    // UI RENDERING
    // ============================================

    /**
     * Render freshness status on Pre-Trade tab
     */
    function updateFreshnessDisplay() {
        const verdict = checkFreshness();
        const briefingContainer = document.getElementById('briefing-freshness-container');
        const gamePlanContainer = document.getElementById('gameplan-freshness-container');

        // Briefing display
        if (briefingContainer) {
            briefingContainer.innerHTML = '';
            briefingContainer.style.display = 'none';

            if (!verdict.briefingFresh && verdict.briefingTimestamp) {
                // Stale briefing - show warning
                const html = `
                    <div style="
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        border-left: 4px solid #ffc107;
                        background-color: #fff3cd;
                        border-radius: 4px;
                        font-size: 0.9rem;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; justify-content: space-between;">
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Briefing is Stale</div>
                                <div style="font-size: 0.85rem; color: #666;">
                                    Last updated: ${formatTimestamp(verdict.briefingTimestamp)}
                                </div>
                                <div style="font-size: 0.8rem; margin-top: 4px; color: #555;">
                                    Market conditions may have changed overnight. Confirm or refresh.
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                                <button class="btn btn-sm btn-secondary" onclick="DailyRefreshGate.confirmBriefing(); DailyRefreshGate.updateFreshnessUI();">
                                    Confirm
                                </button>
                                <button class="btn btn-sm btn-primary" onclick="showTab('context'); setTimeout(function() { DailyRefreshGate.updateFreshnessUI(); }, 500);">
                                    Refresh
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                briefingContainer.innerHTML = html;
                briefingContainer.style.display = 'block';
            } else if (verdict.briefingFresh) {
                // Fresh briefing - show green checkmark
                const html = `
                    <div style="
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        border-left: 4px solid #28a745;
                        background-color: #d4edda;
                        border-radius: 4px;
                        font-size: 0.9rem;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.2rem;">✓</span>
                            <div>
                                <div style="font-weight: 600;">Briefing Fresh</div>
                                <div style="font-size: 0.85rem; color: #666;">
                                    Updated: ${formatTimestamp(verdict.briefingTimestamp)}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                briefingContainer.innerHTML = html;
                briefingContainer.style.display = 'block';
            }
        }

        // Game Plan display
        if (gamePlanContainer) {
            gamePlanContainer.innerHTML = '';
            gamePlanContainer.style.display = 'none';

            if (!verdict.playbookFresh && verdict.playbookTimestamp) {
                // Stale game plan - show warning
                const html = `
                    <div style="
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        border-left: 4px solid #ffc107;
                        background-color: #fff3cd;
                        border-radius: 4px;
                        font-size: 0.9rem;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px; justify-content: space-between;">
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Game Plan is Stale</div>
                                <div style="font-size: 0.85rem; color: #666;">
                                    Last updated: ${formatTimestamp(verdict.playbookTimestamp)}
                                </div>
                                <div style="font-size: 0.8rem; margin-top: 4px; color: #555;">
                                    Confirm it still fits today's regime, or pick a new playbook.
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                                <button class="btn btn-sm btn-secondary" onclick="DailyRefreshGate.confirmGamePlan(); DailyRefreshGate.updateFreshnessUI();">
                                    Confirm
                                </button>
                                <button class="btn btn-sm btn-primary" onclick="showTab('playbook'); setTimeout(function() { DailyRefreshGate.updateFreshnessUI(); }, 500);">
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                gamePlanContainer.innerHTML = html;
                gamePlanContainer.style.display = 'block';
            } else if (verdict.playbookFresh) {
                // Fresh game plan - show green checkmark
                const html = `
                    <div style="
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        border-left: 4px solid #28a745;
                        background-color: #d4edda;
                        border-radius: 4px;
                        font-size: 0.9rem;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.2rem;">✓</span>
                            <div>
                                <div style="font-weight: 600;">Game Plan Fresh</div>
                                <div style="font-size: 0.85rem; color: #666;">
                                    Updated: ${formatTimestamp(verdict.playbookTimestamp)}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                gamePlanContainer.innerHTML = html;
                gamePlanContainer.style.display = 'block';
            }
        }
    }

    // Export UI update function
    window.DailyRefreshGate.updateFreshnessUI = updateFreshnessDisplay;

    // ============================================
    // INITIALISATION
    // ============================================

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            init();
        }, 500);
    });

})();

// MODULE COMPLETE - Daily Refresh Gate v1.0.0
