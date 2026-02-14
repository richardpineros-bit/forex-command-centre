// ============================================
// CIRCUIT BREAKER INTEGRATION v1.1
// Hooks CircuitBreaker into Regime & Playbook Modules
// ============================================
// PURPOSE: Wire the supervisory layer into existing modules
// PRINCIPLE: Non-invasive integration via event hooks and function wrapping
// v1.1: Enhanced blocked events with reasonCode for audit trail
// ============================================

(function() {
    'use strict';

    // ============================================
    // DEPENDENCY CHECK
    // ============================================
    
    function waitForDependencies(callback, maxAttempts = 50) {
        let attempts = 0;
        
        const check = () => {
            attempts++;
            
            const hasCB = typeof window.CircuitBreaker !== 'undefined';
            const hasRegime = typeof window.RegimeModule !== 'undefined';
            const hasPlaybook = typeof window.PlaybookModule !== 'undefined';
            
            if (hasCB && hasRegime && hasPlaybook) {
                console.log('Circuit Breaker Integration: All dependencies loaded');
                callback();
            } else if (attempts < maxAttempts) {
                setTimeout(check, 100);
            } else {
                console.error('Circuit Breaker Integration: Dependencies not loaded after timeout', {
                    CircuitBreaker: hasCB,
                    RegimeModule: hasRegime,
                    PlaybookModule: hasPlaybook
                });
            }
        };
        
        check();
    }

    // ============================================
    // REGIME MODULE INTEGRATION
    // ============================================
    
    function integrateWithRegime() {
        const RegimeModule = window.RegimeModule;
        const CircuitBreaker = window.CircuitBreaker;
        
        // Store original functions
        const originalCheckPreTradeAccess = RegimeModule.checkPreTradeAccess;
        const originalSubmitSessionRegime = RegimeModule.submitSessionRegime;
        
        // ----------------------------------------
        // WRAP: checkPreTradeAccess
        // Add CircuitBreaker gate check
        // ----------------------------------------
        RegimeModule.checkPreTradeAccess = function() {
            // First check CircuitBreaker gates
            const cbCheck = CircuitBreaker.canTrade();
            if (!cbCheck.allowed) {
                return {
                    allowed: false,
                    reason: cbCheck.reason,
                    source: 'circuit_breaker'
                };
            }
            
            // Check for pending review
            if (CircuitBreaker.isReviewRequired()) {
                const review = CircuitBreaker.getPendingReview();
                return {
                    allowed: false,
                    reason: `Post-session review required: ${review.reason}`,
                    source: 'circuit_breaker_review'
                };
            }
            
            // Then check original regime logic
            return originalCheckPreTradeAccess.call(this);
        };
        
        // ----------------------------------------
        // HOOK: Session regime submission
        // Start CircuitBreaker session when regime is locked
        // ----------------------------------------
        const originalSaveSessionRegime = RegimeModule.submitSessionRegime;
        if (originalSaveSessionRegime) {
            // We need to hook into the internal saveSessionRegime instead
            // This is called when a session regime is locked
        }
        
        console.log('Circuit Breaker Integration: Regime module hooked');
    }
    
    // ============================================
    // SESSION START HOOK
    // ============================================
    
    function hookSessionStart() {
        const CircuitBreaker = window.CircuitBreaker;
        
        // Watch for regime lock events via localStorage changes
        // This is a non-invasive way to detect session starts
        
        const REGIME_STORAGE_KEY = 'ftcc_regime';
        let lastRegimeData = localStorage.getItem(REGIME_STORAGE_KEY);
        
        // Check periodically for regime changes
        setInterval(() => {
            const currentData = localStorage.getItem(REGIME_STORAGE_KEY);
            if (currentData !== lastRegimeData) {
                lastRegimeData = currentData;
                
                try {
                    const regime = JSON.parse(currentData);
                    
                    // Detect which session was just locked
                    ['tokyo', 'london', 'newyork'].forEach(session => {
                        const sessionData = regime?.sessions?.[session];
                        if (sessionData?.locked) {
                            // Check if this is a new lock (within last 5 seconds)
                            const lockTime = new Date(sessionData.timestamp);
                            const now = new Date();
                            const secondsSinceLock = (now - lockTime) / 1000;
                            
                            if (secondsSinceLock < 5) {
                                // New session lock detected
                                console.log(`Circuit Breaker Integration: Session lock detected - ${session}`);
                                CircuitBreaker.startSession(session);
                                
                                // Dispatch custom event for UI updates
                                window.dispatchEvent(new CustomEvent('circuitbreaker:sessionstart', {
                                    detail: { session }
                                }));
                            }
                        }
                    });
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }, 1000);
        
        console.log('Circuit Breaker Integration: Session start hook active');
    }

    // ============================================
    // PLAYBOOK MODULE INTEGRATION
    // ============================================
    
    function integrateWithPlaybook() {
        const PlaybookModule = window.PlaybookModule;
        const CircuitBreaker = window.CircuitBreaker;
        
        // Store original functions
        const originalSelectPlaybook = PlaybookModule.selectPlaybook;
        const originalCheckLeakage = PlaybookModule.checkLeakage;
        const originalGetAvailablePlaybooks = PlaybookModule.getAvailablePlaybooks;
        
        // ----------------------------------------
        // WRAP: selectPlaybook
        // Add CircuitBreaker gate check
        // ----------------------------------------
        PlaybookModule.selectPlaybook = function(playbookId) {
            // Check CircuitBreaker first
            const cbCheck = CircuitBreaker.canSelectPlaybook(playbookId);
            if (!cbCheck.allowed) {
                console.warn('Circuit Breaker: Playbook selection blocked', {
                    playbookId: playbookId,
                    reason: cbCheck.reason
                });
                
                // Dispatch event for UI feedback (v1.4: includes reasonCode)
                window.dispatchEvent(new CustomEvent('circuitbreaker:blocked', {
                    detail: {
                        type: 'playbook_selection',
                        playbookId: playbookId,
                        reason: cbCheck.reason,
                        reasonCode: 'playbook_disabled'
                    }
                }));
                
                return false;
            }
            
            // Proceed with original selection
            return originalSelectPlaybook.call(this, playbookId);
        };
        
        // ----------------------------------------
        // WRAP: getAvailablePlaybooks
        // Filter out disabled playbooks
        // ----------------------------------------
        PlaybookModule.getAvailablePlaybooks = function(regime, session) {
            // Get original list
            const available = originalGetAvailablePlaybooks.call(this, regime, session);
            
            // Get disabled list from CircuitBreaker
            const disabled = CircuitBreaker.getDisabledPlaybooks();
            
            // Filter and mark
            return available.map(pbId => ({
                id: pbId,
                disabled: disabled.includes(pbId),
                disableReason: disabled.includes(pbId) ? getPlaybookDisableReason(pbId) : null
            }));
        };
        
        // ----------------------------------------
        // WRAP: checkLeakage
        // Forward leakage events to CircuitBreaker
        // ----------------------------------------
        PlaybookModule.checkLeakage = function(tradeData) {
            // Call original leakage check
            const warnings = originalCheckLeakage.call(this, tradeData);
            
            // Forward to CircuitBreaker
            warnings.forEach(warning => {
                if (warning.action === 'block') {
                    const result = CircuitBreaker.recordLeakageBlock(warning.id);
                    
                    // Dispatch event if lockout triggered
                    if (result.lockoutTriggered) {
                        window.dispatchEvent(new CustomEvent('circuitbreaker:lockout', {
                            detail: {
                                type: 'leakage',
                                reason: warning.title,
                                actions: result.triggeredActions
                            }
                        }));
                    }
                } else if (warning.action === 'warn') {
                    CircuitBreaker.recordLeakageWarning(warning.id);
                }
            });
            
            return warnings;
        };
        
        console.log('Circuit Breaker Integration: Playbook module hooked');
    }
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    function getPlaybookDisableReason(playbookId) {
        const state = window.CircuitBreaker.getState();
        const pb = state.playbooks[playbookId];
        
        if (pb?.disabledReason) {
            switch (pb.disabledReason) {
                case 'consecutive_failures':
                    return `2 consecutive failures`;
                case 'expectancy_negative':
                    return `Negative expectancy after ${pb.sessionTradeCount} trades`;
                case 'loss_streak_trend':
                    return `${state.behavioural.consecutiveLosses} consecutive losses`;
                default:
                    return pb.disabledReason;
            }
        }
        
        // Check if it's a trend playbook disabled by loss streak
        const trendPlaybooks = ['trend-pullback', 'break-and-hold', 'london-open'];
        if (trendPlaybooks.includes(playbookId) && 
            state.behavioural.consecutiveLosses >= 3) {
            return `${state.behavioural.consecutiveLosses} consecutive losses`;
        }
        
        return 'Unknown';
    }

    // ============================================
    // PAIR SELECTION INTEGRATION
    // ============================================
    
    function integratePairSelection() {
        const CircuitBreaker = window.CircuitBreaker;
        
        // Create global pair check function
        window.checkPairAvailability = function(pair) {
            const result = CircuitBreaker.canSelectPair(pair);
            
            if (!result.allowed) {
                console.warn('Circuit Breaker: Pair selection blocked', {
                    pair: pair,
                    reason: result.reason,
                    coolingActive: result.coolingActive,
                    cooldownActive: result.cooldownActive
                });
                
                // v1.4: Enhanced event with reasonCode
                window.dispatchEvent(new CustomEvent('circuitbreaker:blocked', {
                    detail: {
                        type: 'pair_selection',
                        pair: pair,
                        reason: result.reason,
                        reasonCode: result.cooldownActive ? 'pair_cooldown_48h' : 'pair_cooling_session',
                        coolingActive: result.coolingActive,
                        cooldownActive: result.cooldownActive
                    }
                }));
            }
            
            return result;
        };
        
        console.log('Circuit Breaker Integration: Pair selection check available');
    }

    // ============================================
    // TRADE RESULT INTEGRATION
    // ============================================
    
    function integrateTradeResults() {
        const CircuitBreaker = window.CircuitBreaker;
        
        // Watch for trade log updates
        const TRADES_STORAGE_KEY = 'ftcc_trades';
        let lastTradesData = localStorage.getItem(TRADES_STORAGE_KEY);
        let processedTradeIds = new Set();
        
        // Load previously processed IDs
        try {
            const existing = JSON.parse(lastTradesData || '[]');
            existing.forEach(t => {
                if (t.id && t.status !== 'open') {
                    processedTradeIds.add(t.id);
                }
            });
        } catch (e) {}
        
        // Check for new closed trades
        setInterval(() => {
            const currentData = localStorage.getItem(TRADES_STORAGE_KEY);
            if (currentData !== lastTradesData) {
                lastTradesData = currentData;
                
                try {
                    const trades = JSON.parse(currentData || '[]');
                    
                    // Find newly closed trades
                    trades.forEach(trade => {
                        if (trade.id && 
                            trade.status !== 'open' && 
                            !processedTradeIds.has(trade.id)) {
                            
                            // New closed trade detected
                            processedTradeIds.add(trade.id);
                            
                            // Determine result type
                            let resultType;
                            const pnl = parseFloat(trade.pnlPercent || trade.rValue || 0);
                            
                            if (Math.abs(pnl) < 0.1) {
                                resultType = CircuitBreaker.TRADE_RESULTS.BREAKEVEN;
                            } else if (pnl > 0) {
                                resultType = CircuitBreaker.TRADE_RESULTS.WIN;
                            } else {
                                resultType = CircuitBreaker.TRADE_RESULTS.LOSS;
                            }
                            
                            // Record with CircuitBreaker
                            const result = CircuitBreaker.recordTradeResult({
                                pair: trade.pair,
                                playbookId: trade.playbook || trade.playbookId,
                                result: resultType,
                                rValue: parseFloat(trade.rValue || 0),
                                pnlPercent: parseFloat(trade.pnlPercent || 0)
                            });
                            
                            console.log('Circuit Breaker Integration: Trade result recorded', {
                                tradeId: trade.id,
                                result: resultType,
                                triggeredActions: result.triggeredActions
                            });
                            
                            // Dispatch events for triggered actions
                            if (result.triggeredActions.length > 0) {
                                window.dispatchEvent(new CustomEvent('circuitbreaker:tradeprocessed', {
                                    detail: {
                                        tradeId: trade.id,
                                        result: resultType,
                                        actions: result.triggeredActions
                                    }
                                }));
                            }
                        }
                    });
                } catch (e) {
                    console.error('Circuit Breaker Integration: Error processing trades', e);
                }
            }
        }, 2000);
        
        console.log('Circuit Breaker Integration: Trade result monitoring active');
    }

    // ============================================
    // SHOWAB GATING INTEGRATION
    // ============================================
    
    function integrateShowTabGating() {
        const CircuitBreaker = window.CircuitBreaker;
        
        // Wait for showTab to be defined
        const checkShowTab = () => {
            if (typeof window.showTab !== 'function') {
                setTimeout(checkShowTab, 100);
                return;
            }
            
            const originalShowTab = window.showTab;
            
            window.showTab = function(tabId) {
                // Gate certain tabs with CircuitBreaker
                if (tabId === 'validation' || tabId === 'playbook') {
                    // Check if review is required
                    if (CircuitBreaker.isReviewRequired()) {
                        const review = CircuitBreaker.getPendingReview();
                        alert(`Trading blocked: ${review.reason}\n\nComplete the post-session review first.`);
                        
                        // Show review modal or redirect
                        window.dispatchEvent(new CustomEvent('circuitbreaker:reviewrequired', {
                            detail: review
                        }));
                        
                        return;
                    }
                    
                    // Check if trading is allowed
                    const canTrade = CircuitBreaker.canTrade();
                    if (!canTrade.allowed) {
                        alert(`Trading blocked: ${canTrade.reason}`);
                        
                        window.dispatchEvent(new CustomEvent('circuitbreaker:blocked', {
                            detail: {
                                type: 'tab_access',
                                tabId: tabId,
                                reason: canTrade.reason
                            }
                        }));
                        
                        // Allow viewing dashboard even when blocked
                        originalShowTab('dashboard');
                        return;
                    }
                }
                
                // Proceed with original
                originalShowTab(tabId);
            };
            
            console.log('Circuit Breaker Integration: Tab gating active');
        };
        
        checkShowTab();
    }

    // ============================================
    // UI EVENT HANDLERS
    // ============================================
    
    function setupUIEventHandlers() {
        // Listen for CircuitBreaker events and update UI
        
        window.addEventListener('circuitbreaker:lockout', (e) => {
            showLockoutBanner(e.detail);
        });
        
        window.addEventListener('circuitbreaker:blocked', (e) => {
            showBlockedNotification(e.detail);
        });
        
        window.addEventListener('circuitbreaker:tradeprocessed', (e) => {
            updateSessionStatsUI();
            if (e.detail.actions.some(a => a.includes('disabled') || a.includes('STAND-DOWN'))) {
                showLockoutBanner(e.detail);
            }
        });
        
        window.addEventListener('circuitbreaker:sessionstart', (e) => {
            updateSessionStatsUI();
            hideLockoutBanner();
        });
        
        window.addEventListener('circuitbreaker:reviewrequired', (e) => {
            showReviewModal(e.detail);
        });
        
        console.log('Circuit Breaker Integration: UI event handlers registered');
    }
    
    // ============================================
    // UI UPDATE FUNCTIONS
    // ============================================
    
    function showLockoutBanner(detail) {
        // Find or create banner container
        let banner = document.getElementById('circuit-breaker-lockout-banner');
        
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'circuit-breaker-lockout-banner';
            banner.className = 'cb-lockout-banner';
            document.body.insertBefore(banner, document.body.firstChild);
        }
        
        const lockout = window.CircuitBreaker.getLockoutStatus();
        
        if (!lockout.active) {
            banner.style.display = 'none';
            return;
        }
        
        const reasonText = lockout.reason || detail?.reason || 'Unknown';
        const timeText = lockout.minutesRemaining 
            ? `${lockout.minutesRemaining} minutes remaining`
            : lockout.until 
                ? `Until ${new Date(lockout.until).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`
                : 'Until next session';
        
        banner.innerHTML = `
            <div class="cb-lockout-content">
                <div class="cb-lockout-icon">\u{1F6D1}</div>
                <div class="cb-lockout-text">
                    <div class="cb-lockout-title">TRADING SUSPENDED</div>
                    <div class="cb-lockout-reason">${reasonText}</div>
                    <div class="cb-lockout-time">${timeText}</div>
                </div>
            </div>
        `;
        
        banner.style.display = 'block';
        
        // Auto-refresh countdown
        if (lockout.minutesRemaining) {
            setTimeout(() => showLockoutBanner(detail), 60000);
        }
    }
    
    function hideLockoutBanner() {
        const banner = document.getElementById('circuit-breaker-lockout-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
    
    function showBlockedNotification(detail) {
        // Simple notification (could be enhanced with toast library)
        console.warn('Circuit Breaker: Action blocked', detail);
        
        // Dispatch for any UI toast system
        window.dispatchEvent(new CustomEvent('notification', {
            detail: {
                type: 'warning',
                title: 'Action Blocked',
                message: detail.reason
            }
        }));
    }
    
    function updateSessionStatsUI() {
        // Update any session stats displays
        const stats = window.CircuitBreaker.getSessionStats();
        
        // Dispatch event for stats panel updates
        window.dispatchEvent(new CustomEvent('circuitbreaker:statsupdate', {
            detail: stats
        }));
    }
    
    function showReviewModal(detail) {
        // Check if review modal exists
        let modal = document.getElementById('cb-review-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cb-review-modal';
            modal.className = 'cb-modal-overlay';
            modal.innerHTML = `
                <div class="cb-modal">
                    <div class="cb-modal-header">
                        <span class="cb-modal-icon">\u26A0\uFE0F</span>
                        <span class="cb-modal-title">Post-Session Review Required</span>
                    </div>
                    <div class="cb-modal-body">
                        <p class="cb-modal-reason" id="cb-review-reason"></p>
                        
                        <div class="cb-form-group">
                            <label>1. What triggered this behaviour?</label>
                            <textarea id="cb-review-trigger" rows="3" placeholder="Describe what led to the rule violation..."></textarea>
                        </div>
                        
                        <div class="cb-form-group">
                            <label>2. What will you do differently next time?</label>
                            <textarea id="cb-review-action" rows="3" placeholder="Describe your plan to avoid this in future..."></textarea>
                        </div>
                        
                        <div class="cb-form-group cb-checkbox-group">
                            <input type="checkbox" id="cb-review-acknowledge">
                            <label for="cb-review-acknowledge">I understand that this behaviour destroys accounts</label>
                        </div>
                    </div>
                    <div class="cb-modal-footer">
                        <button class="cb-btn cb-btn-primary" id="cb-review-submit">Submit Review</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add submit handler
            document.getElementById('cb-review-submit').addEventListener('click', () => {
                const trigger = document.getElementById('cb-review-trigger').value;
                const action = document.getElementById('cb-review-action').value;
                const acknowledged = document.getElementById('cb-review-acknowledge').checked;
                
                const result = window.CircuitBreaker.submitReview({
                    trigger,
                    action,
                    acknowledged
                });
                
                if (result.success) {
                    modal.style.display = 'none';
                    alert('Review submitted. Trading unlocked.');
                    hideLockoutBanner();
                } else {
                    alert(result.reason);
                }
            });
        }
        
        // Update reason text
        document.getElementById('cb-review-reason').textContent = detail.reason;
        
        // Show modal
        modal.style.display = 'flex';
    }

    // ============================================
    // CSS INJECTION
    // ============================================
    
    function injectStyles() {
        const styles = `
            /* Circuit Breaker Lockout Banner */
            .cb-lockout-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #dc2626, #991b1b);
                color: white;
                padding: 16px 24px;
                z-index: 10000;
                display: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
            
            .cb-lockout-content {
                display: flex;
                align-items: center;
                gap: 16px;
                max-width: 1200px;
                margin: 0 auto;
            }
            
            .cb-lockout-icon {
                font-size: 2rem;
            }
            
            .cb-lockout-title {
                font-size: 1.25rem;
                font-weight: 700;
                letter-spacing: 0.05em;
            }
            
            .cb-lockout-reason {
                font-size: 0.95rem;
                opacity: 0.9;
                margin-top: 4px;
            }
            
            .cb-lockout-time {
                font-size: 0.85rem;
                opacity: 0.8;
                margin-top: 4px;
            }
            
            /* Circuit Breaker Modal */
            .cb-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }
            
            .cb-modal {
                background: var(--bg-primary, #1a1a2e);
                border-radius: 12px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                border: 1px solid var(--border-color, #333);
            }
            
            .cb-modal-header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 20px 24px;
                border-bottom: 1px solid var(--border-color, #333);
                background: rgba(234, 179, 8, 0.1);
            }
            
            .cb-modal-icon {
                font-size: 1.5rem;
            }
            
            .cb-modal-title {
                font-size: 1.1rem;
                font-weight: 600;
                color: var(--color-warning, #eab308);
            }
            
            .cb-modal-body {
                padding: 24px;
            }
            
            .cb-modal-reason {
                margin-bottom: 20px;
                padding: 12px;
                background: rgba(239, 68, 68, 0.1);
                border-radius: 8px;
                border-left: 3px solid var(--color-fail, #ef4444);
                color: var(--text-primary, #fff);
            }
            
            .cb-form-group {
                margin-bottom: 16px;
            }
            
            .cb-form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: var(--text-secondary, #aaa);
            }
            
            .cb-form-group textarea {
                width: 100%;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid var(--border-color, #333);
                background: var(--bg-secondary, #252540);
                color: var(--text-primary, #fff);
                font-family: inherit;
                resize: vertical;
            }
            
            .cb-form-group textarea:focus {
                outline: none;
                border-color: var(--color-info, #3b82f6);
            }
            
            .cb-checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .cb-checkbox-group input {
                width: 18px;
                height: 18px;
            }
            
            .cb-checkbox-group label {
                margin-bottom: 0;
            }
            
            .cb-modal-footer {
                padding: 16px 24px;
                border-top: 1px solid var(--border-color, #333);
                text-align: right;
            }
            
            .cb-btn {
                padding: 10px 20px;
                border-radius: 8px;
                border: none;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .cb-btn-primary {
                background: var(--color-info, #3b82f6);
                color: white;
            }
            
            .cb-btn-primary:hover {
                background: #2563eb;
            }
            
            /* Playbook Card Disabled State */
            .playbook-card.cb-disabled {
                opacity: 0.5;
                pointer-events: none;
                cursor: not-allowed;
                position: relative;
            }
            
            .playbook-card.cb-disabled::after {
                content: attr(data-disable-reason);
                position: absolute;
                bottom: 8px;
                left: 8px;
                right: 8px;
                padding: 6px 10px;
                background: rgba(239, 68, 68, 0.9);
                color: white;
                font-size: 0.75rem;
                border-radius: 4px;
                text-align: center;
            }
            
            /* Risk Indicator */
            .cb-risk-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--bg-secondary, #252540);
                border-radius: 8px;
                font-size: 0.85rem;
            }
            
            .cb-risk-bar {
                flex: 1;
                height: 8px;
                background: var(--bg-tertiary, #333);
                border-radius: 4px;
                overflow: hidden;
            }
            
            .cb-risk-fill {
                height: 100%;
                background: var(--color-pass, #22c55e);
                transition: width 0.3s ease;
            }
            
            .cb-risk-fill.warning {
                background: var(--color-warning, #eab308);
            }
            
            .cb-risk-fill.danger {
                background: var(--color-fail, #ef4444);
            }
            
            /* Adjust body when lockout banner is showing */
            body.cb-lockout-active {
                padding-top: 80px;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        
        console.log('Circuit Breaker Integration: Styles injected');
    }

    // ============================================
    // PERIODIC CHECKS
    // ============================================
    
    function startPeriodicChecks() {
        const CircuitBreaker = window.CircuitBreaker;
        
        // Check lockout status every 30 seconds
        setInterval(() => {
            const lockout = CircuitBreaker.getLockoutStatus();
            
            if (lockout.active) {
                document.body.classList.add('cb-lockout-active');
                showLockoutBanner({ reason: lockout.reason });
            } else {
                document.body.classList.remove('cb-lockout-active');
                hideLockoutBanner();
            }
        }, 30000);
        
        // Check for leakage lockout resume eligibility
        setInterval(() => {
            const state = CircuitBreaker.getState();
            
            if (state.behavioural.leakageLockoutActive) {
                const until = new Date(state.behavioural.leakageLockoutUntil);
                if (until <= new Date()) {
                    // Lockout expired, attempt resume
                    const result = CircuitBreaker.attemptLockoutResume();
                    if (result.success) {
                        alert('Lockout ended. Trading resumes with 50% risk cap.');
                        hideLockoutBanner();
                    }
                }
            }
        }, 60000);
        
        console.log('Circuit Breaker Integration: Periodic checks started');
    }

    // ============================================
    // PUBLIC API FOR INTEGRATION
    // ============================================
    
    window.CircuitBreakerIntegration = {
        // Manual refresh functions
        refreshLockoutBanner: () => showLockoutBanner({}),
        refreshSessionStats: updateSessionStatsUI,
        showReviewModal: showReviewModal,
        
        // Check functions
        checkPairAvailability: (pair) => window.CircuitBreaker.canSelectPair(pair),
        getPlaybookDisableReason: getPlaybookDisableReason
    };

    // ============================================
    // INITIALISATION
    // ============================================
    
    function init() {
        console.log('Circuit Breaker Integration: Initialising...');
        
        // Inject styles first
        injectStyles();
        
        // Wait for dependencies then integrate
        waitForDependencies(() => {
            integrateWithRegime();
            integrateWithPlaybook();
            integratePairSelection();
            hookSessionStart();
            integrateTradeResults();
            integrateShowTabGating();
            setupUIEventHandlers();
            startPeriodicChecks();
            
            // Initial lockout check
            const lockout = window.CircuitBreaker.getLockoutStatus();
            if (lockout.active) {
                showLockoutBanner({ reason: lockout.reason });
            }
            
            // Check for pending review on load
            if (window.CircuitBreaker.isReviewRequired()) {
                const review = window.CircuitBreaker.getPendingReview();
                showReviewModal(review);
            }
            
            console.log('Circuit Breaker Integration: Complete');
        });
    }
    
    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
