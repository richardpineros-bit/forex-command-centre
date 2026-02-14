// ============================================
// CIRCUIT BREAKER UI v1.1
// Dashboard Panels, Indicators & Visual Feedback
// ============================================
// PURPOSE: Render Circuit Breaker status in the UI
// INJECTION: Self-injects into existing dashboard
// v1.1: Contributing factors display in lockout banner
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    
    const UI_VERSION = '1.1';
    const UPDATE_INTERVAL = 10000;  // 10 seconds
    
    // ============================================
    // CSS STYLES
    // ============================================
    
    const CSS = `
        /* ============================================
           CIRCUIT BREAKER UI STYLES
           ============================================ */
        
        /* Status Panel - Main Dashboard Card */
        .cb-status-panel {
            margin-bottom: var(--spacing-lg, 1.5rem);
        }
        
        .cb-status-panel .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .cb-status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        
        .cb-status-badge.active {
            background: rgba(34, 197, 94, 0.15);
            color: var(--color-pass, #22c55e);
            border: 1px solid var(--color-pass, #22c55e);
        }
        
        .cb-status-badge.warning {
            background: rgba(234, 179, 8, 0.15);
            color: var(--color-warning, #eab308);
            border: 1px solid var(--color-warning, #eab308);
        }
        
        .cb-status-badge.lockout {
            background: rgba(239, 68, 68, 0.15);
            color: var(--color-fail, #ef4444);
            border: 1px solid var(--color-fail, #ef4444);
            animation: cb-pulse 2s ease-in-out infinite;
        }
        
        @keyframes cb-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        .cb-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
        }
        
        /* Stats Grid */
        .cb-stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: var(--spacing-md, 1rem);
            margin-bottom: var(--spacing-md, 1rem);
        }
        
        @media (max-width: 768px) {
            .cb-stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        
        .cb-stat-box {
            background: var(--bg-secondary, #252540);
            border-radius: var(--radius-md, 8px);
            padding: var(--spacing-md, 1rem);
            text-align: center;
        }
        
        .cb-stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            font-family: var(--font-heading, 'JetBrains Mono', monospace);
            color: var(--text-primary, #fff);
            margin-bottom: 4px;
        }
        
        .cb-stat-value.positive { color: var(--color-pass, #22c55e); }
        .cb-stat-value.negative { color: var(--color-fail, #ef4444); }
        .cb-stat-value.warning { color: var(--color-warning, #eab308); }
        .cb-stat-value.neutral { color: var(--text-secondary, #888); }
        
        .cb-stat-label {
            font-size: 0.75rem;
            color: var(--text-secondary, #888);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        /* Risk Indicator Bar */
        .cb-risk-section {
            background: var(--bg-secondary, #252540);
            border-radius: var(--radius-md, 8px);
            padding: var(--spacing-md, 1rem);
        }
        
        .cb-risk-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--spacing-sm, 0.5rem);
        }
        
        .cb-risk-title {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-primary, #fff);
        }
        
        .cb-risk-value {
            font-size: 1.1rem;
            font-weight: 700;
            font-family: var(--font-heading, 'JetBrains Mono', monospace);
        }
        
        .cb-risk-bar-container {
            height: 12px;
            background: var(--bg-tertiary, #333);
            border-radius: 6px;
            overflow: hidden;
            margin-bottom: var(--spacing-sm, 0.5rem);
        }
        
        .cb-risk-bar {
            height: 100%;
            border-radius: 6px;
            transition: width 0.5s ease, background 0.3s ease;
        }
        
        .cb-risk-bar.healthy {
            background: linear-gradient(90deg, var(--color-pass, #22c55e), #16a34a);
        }
        
        .cb-risk-bar.reduced {
            background: linear-gradient(90deg, var(--color-warning, #eab308), #ca8a04);
        }
        
        .cb-risk-bar.critical {
            background: linear-gradient(90deg, var(--color-fail, #ef4444), #dc2626);
        }
        
        .cb-risk-breakdown {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-secondary, #888);
        }
        
        .cb-risk-factor {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .cb-risk-factor.active {
            color: var(--color-warning, #eab308);
        }
        
        /* Disabled Playbooks List */
        .cb-disabled-section {
            margin-top: var(--spacing-md, 1rem);
            padding-top: var(--spacing-md, 1rem);
            border-top: 1px solid var(--border-color, #333);
        }
        
        .cb-disabled-title {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-secondary, #888);
            margin-bottom: var(--spacing-sm, 0.5rem);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .cb-disabled-list {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-xs, 0.25rem);
        }
        
        .cb-disabled-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 4px;
            font-size: 0.75rem;
            color: var(--color-fail, #ef4444);
        }
        
        .cb-disabled-item .icon {
            opacity: 0.7;
        }
        
        /* Cooled Pairs List */
        .cb-cooled-section {
            margin-top: var(--spacing-sm, 0.5rem);
        }
        
        .cb-cooled-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 4px;
            font-size: 0.75rem;
            color: var(--color-info, #3b82f6);
        }
        
        /* Session Timeline */
        .cb-session-info {
            margin-top: var(--spacing-md, 1rem);
            padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
            background: var(--bg-tertiary, #1a1a2e);
            border-radius: var(--radius-sm, 4px);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
        }
        
        .cb-session-id {
            color: var(--text-secondary, #888);
        }
        
        .cb-session-time {
            color: var(--text-primary, #fff);
            font-family: var(--font-heading, 'JetBrains Mono', monospace);
        }
        
        /* Lockout Banner (Top of Page) */
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
            box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
        }
        
        .cb-lockout-banner.visible {
            display: block;
        }
        
        body.cb-lockout-active {
            padding-top: 100px;
        }
        
        .cb-lockout-content {
            display: flex;
            align-items: center;
            gap: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .cb-lockout-icon {
            font-size: 2.5rem;
            flex-shrink: 0;
        }
        
        .cb-lockout-text {
            flex: 1;
        }
        
        .cb-lockout-title {
            font-size: 1.3rem;
            font-weight: 700;
            letter-spacing: 0.1em;
            margin-bottom: 4px;
        }
        
        .cb-lockout-reason {
            font-size: 0.95rem;
            opacity: 0.95;
        }
        
        .cb-lockout-timer {
            font-size: 0.85rem;
            opacity: 0.85;
            margin-top: 4px;
        }
        
        .cb-lockout-progress {
            width: 200px;
            flex-shrink: 0;
        }
        
        .cb-lockout-progress-bar {
            height: 8px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            overflow: hidden;
        }
        
        .cb-lockout-progress-fill {
            height: 100%;
            background: white;
            border-radius: 4px;
            transition: width 1s linear;
        }
        
        .cb-lockout-progress-text {
            font-size: 0.75rem;
            text-align: center;
            margin-top: 4px;
            opacity: 0.8;
        }
        
        /* v1.1: Contributing factors display */
        .cb-lockout-factors {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
            font-size: 0.8rem;
            opacity: 0.85;
        }
        
        .cb-lockout-factors-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .cb-lockout-factors-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .cb-lockout-factor-tag {
            display: inline-block;
            padding: 2px 8px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
            font-size: 0.7rem;
        }
        
        /* Review Modal */
        .cb-review-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            padding: var(--spacing-lg, 1.5rem);
        }
        
        .cb-review-overlay.visible {
            display: flex;
        }
        
        .cb-review-modal {
            background: var(--bg-primary, #1a1a2e);
            border-radius: var(--radius-lg, 12px);
            width: 100%;
            max-width: 520px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border-color, #333);
            overflow: hidden;
        }
        
        .cb-review-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px 24px;
            background: rgba(234, 179, 8, 0.1);
            border-bottom: 1px solid var(--border-color, #333);
        }
        
        .cb-review-header-icon {
            font-size: 1.8rem;
        }
        
        .cb-review-header-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--color-warning, #eab308);
        }
        
        .cb-review-body {
            padding: 24px;
        }
        
        .cb-review-reason {
            margin-bottom: 20px;
            padding: 14px;
            background: rgba(239, 68, 68, 0.1);
            border-radius: var(--radius-md, 8px);
            border-left: 4px solid var(--color-fail, #ef4444);
            color: var(--text-primary, #fff);
            font-size: 0.9rem;
        }
        
        .cb-review-form-group {
            margin-bottom: 18px;
        }
        
        .cb-review-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--text-secondary, #aaa);
            font-size: 0.9rem;
        }
        
        .cb-review-textarea {
            width: 100%;
            padding: 12px;
            border-radius: var(--radius-md, 8px);
            border: 1px solid var(--border-color, #333);
            background: var(--bg-secondary, #252540);
            color: var(--text-primary, #fff);
            font-family: inherit;
            font-size: 0.9rem;
            resize: vertical;
            min-height: 80px;
        }
        
        .cb-review-textarea:focus {
            outline: none;
            border-color: var(--color-info, #3b82f6);
        }
        
        .cb-review-checkbox-group {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-top: 20px;
            padding: 14px;
            background: var(--bg-secondary, #252540);
            border-radius: var(--radius-md, 8px);
        }
        
        .cb-review-checkbox {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .cb-review-checkbox-label {
            font-size: 0.85rem;
            color: var(--text-secondary, #aaa);
            line-height: 1.4;
        }
        
        .cb-review-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--border-color, #333);
            text-align: right;
        }
        
        .cb-review-btn {
            padding: 12px 24px;
            border-radius: var(--radius-md, 8px);
            border: none;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .cb-review-btn-primary {
            background: var(--color-info, #3b82f6);
            color: white;
        }
        
        .cb-review-btn-primary:hover {
            background: #2563eb;
            transform: translateY(-1px);
        }
        
        .cb-review-btn-primary:disabled {
            background: var(--bg-tertiary, #333);
            color: var(--text-secondary, #888);
            cursor: not-allowed;
            transform: none;
        }
        
        /* Playbook Card Disabled State Override */
        .playbook-card.cb-disabled {
            opacity: 0.45;
            pointer-events: none;
            cursor: not-allowed;
            position: relative;
            filter: grayscale(30%);
        }
        
        .playbook-card.cb-disabled::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 10px,
                rgba(239, 68, 68, 0.03) 10px,
                rgba(239, 68, 68, 0.03) 20px
            );
            pointer-events: none;
        }
        
        .cb-playbook-disabled-badge {
            position: absolute;
            bottom: 10px;
            left: 10px;
            right: 10px;
            padding: 8px 12px;
            background: rgba(239, 68, 68, 0.95);
            color: white;
            font-size: 0.7rem;
            font-weight: 600;
            border-radius: 6px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            z-index: 10;
        }
        
        /* Empty State */
        .cb-empty-state {
            text-align: center;
            padding: var(--spacing-md, 1rem);
            color: var(--text-secondary, #888);
            font-size: 0.85rem;
        }
        
        /* Transitions */
        .cb-fade-in {
            animation: cbFadeIn 0.3s ease;
        }
        
        @keyframes cbFadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;

    // ============================================
    // HTML TEMPLATES
    // ============================================
    
    function getStatusPanelHTML() {
        return `
            <div class="cb-status-panel card" id="cb-status-panel">
                <div class="card-header">
                    <h2 class="card-title">Circuit Breaker Status</h2>
                    <div class="cb-status-badge active" id="cb-status-badge">
                        <span class="cb-status-dot"></span>
                        <span id="cb-status-text">Active</span>
                    </div>
                </div>
                
                <div class="cb-stats-grid" id="cb-stats-grid">
                    <div class="cb-stat-box">
                        <div class="cb-stat-value" id="cb-stat-pnl">0.0%</div>
                        <div class="cb-stat-label">Daily P&L</div>
                    </div>
                    <div class="cb-stat-box">
                        <div class="cb-stat-value" id="cb-stat-trades">0</div>
                        <div class="cb-stat-label">Trades Today</div>
                    </div>
                    <div class="cb-stat-box">
                        <div class="cb-stat-value" id="cb-stat-streak">0</div>
                        <div class="cb-stat-label">Loss Streak</div>
                    </div>
                    <div class="cb-stat-box">
                        <div class="cb-stat-value" id="cb-stat-leakage">0</div>
                        <div class="cb-stat-label">Leakage Events</div>
                    </div>
                </div>
                
                <div class="cb-risk-section">
                    <div class="cb-risk-header">
                        <span class="cb-risk-title">Effective Risk</span>
                        <span class="cb-risk-value" id="cb-risk-value">100%</span>
                    </div>
                    <div class="cb-risk-bar-container">
                        <div class="cb-risk-bar healthy" id="cb-risk-bar" style="width: 100%"></div>
                    </div>
                    <div class="cb-risk-breakdown" id="cb-risk-breakdown">
                        <span class="cb-risk-factor" id="cb-factor-loss">Losses: &#xD7;1.0</span>
                        <span class="cb-risk-factor" id="cb-factor-time">Time: &#xD7;1.0</span>
                        <span class="cb-risk-factor" id="cb-factor-mode">Mode: Normal</span>
                    </div>
                </div>
                
                <div class="cb-disabled-section" id="cb-disabled-section" style="display: none;">
                    <div class="cb-disabled-title">Disabled Playbooks</div>
                    <div class="cb-disabled-list" id="cb-disabled-list"></div>
                </div>
                
                <div class="cb-cooled-section" id="cb-cooled-section" style="display: none;">
                    <div class="cb-disabled-title">Cooled Pairs</div>
                    <div class="cb-disabled-list" id="cb-cooled-list"></div>
                </div>
                
                <div class="cb-session-info" id="cb-session-info">
                    <span class="cb-session-id" id="cb-session-id">No active session</span>
                    <span class="cb-session-time" id="cb-session-time">--:--</span>
                </div>
            </div>
        `;
    }
    
    function getLockoutBannerHTML() {
        return `
            <div class="cb-lockout-banner" id="cb-lockout-banner">
                <div class="cb-lockout-content">
                    <div class="cb-lockout-icon">&#x1F6D1;</div>
                    <div class="cb-lockout-text">
                        <div class="cb-lockout-title">TRADING SUSPENDED</div>
                        <div class="cb-lockout-reason" id="cb-lockout-reason">Reason loading...</div>
                        <div class="cb-lockout-timer" id="cb-lockout-timer"></div>
                        <div class="cb-lockout-factors" id="cb-lockout-factors" style="display: none;">
                            <div class="cb-lockout-factors-title">Contributing Factors:</div>
                            <div class="cb-lockout-factors-list" id="cb-lockout-factors-list"></div>
                        </div>
                    </div>
                    <div class="cb-lockout-progress" id="cb-lockout-progress">
                        <div class="cb-lockout-progress-bar">
                            <div class="cb-lockout-progress-fill" id="cb-lockout-progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="cb-lockout-progress-text" id="cb-lockout-progress-text">--</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function getReviewModalHTML() {
        return `
            <div class="cb-review-overlay" id="cb-review-overlay">
                <div class="cb-review-modal">
                    <div class="cb-review-header">
                        <span class="cb-review-header-icon">&#x26A0;&#xFE0F;</span>
                        <span class="cb-review-header-title">Post-Session Review Required</span>
                    </div>
                    <div class="cb-review-body">
                        <div class="cb-review-reason" id="cb-review-reason">
                            Review reason will appear here.
                        </div>
                        
                        <div class="cb-review-form-group">
                            <label class="cb-review-label">1. What triggered this behaviour?</label>
                            <textarea class="cb-review-textarea" id="cb-review-trigger" 
                                placeholder="Describe what led to the rule violation..." rows="3"></textarea>
                        </div>
                        
                        <div class="cb-review-form-group">
                            <label class="cb-review-label">2. What will you do differently next time?</label>
                            <textarea class="cb-review-textarea" id="cb-review-action"
                                placeholder="Describe your plan to avoid this in future..." rows="3"></textarea>
                        </div>
                        
                        <div class="cb-review-checkbox-group">
                            <input type="checkbox" class="cb-review-checkbox" id="cb-review-acknowledge">
                            <label class="cb-review-checkbox-label" for="cb-review-acknowledge">
                                I understand that revenge trading and rule violations destroy accounts. 
                                I commit to following the system as designed.
                            </label>
                        </div>
                    </div>
                    <div class="cb-review-footer">
                        <button class="cb-review-btn cb-review-btn-primary" id="cb-review-submit">
                            Submit Review
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // DOM INJECTION
    // ============================================
    
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'cb-ui-styles';
        style.textContent = CSS;
        document.head.appendChild(style);
    }
    
    function injectStatusPanel() {
        // Find the Account Overview card
        const accountOverview = document.querySelector('#tab-dashboard .card.mb-lg');
        
        if (accountOverview) {
            // Insert after Account Overview
            accountOverview.insertAdjacentHTML('afterend', getStatusPanelHTML());
            console.log('CB UI: Status panel injected after Account Overview');
        } else {
            // Fallback: insert at start of dashboard
            const dashboard = document.getElementById('tab-dashboard');
            if (dashboard) {
                dashboard.insertAdjacentHTML('afterbegin', getStatusPanelHTML());
                console.log('CB UI: Status panel injected at dashboard start');
            }
        }
    }
    
    function injectLockoutBanner() {
        document.body.insertAdjacentHTML('afterbegin', getLockoutBannerHTML());
    }
    
    function injectReviewModal() {
        document.body.insertAdjacentHTML('beforeend', getReviewModalHTML());
        
        // Add submit handler
        const submitBtn = document.getElementById('cb-review-submit');
        if (submitBtn) {
            submitBtn.addEventListener('click', handleReviewSubmit);
        }
        
        // Update button state on input
        ['cb-review-trigger', 'cb-review-action', 'cb-review-acknowledge'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateReviewButtonState);
                el.addEventListener('change', updateReviewButtonState);
            }
        });
    }

    // ============================================
    // UI UPDATE FUNCTIONS
    // ============================================
    
    function updateStatusPanel() {
        if (!window.CircuitBreaker) return;
        
        const stats = window.CircuitBreaker.getSessionStats();
        const lockout = window.CircuitBreaker.getLockoutStatus();
        const risk = window.CircuitBreaker.getRiskBreakdown(2);  // Assume 2% base
        
        // Status badge
        const badge = document.getElementById('cb-status-badge');
        const statusText = document.getElementById('cb-status-text');
        
        if (badge && statusText) {
            badge.className = 'cb-status-badge';
            
            if (lockout.active) {
                badge.classList.add('lockout');
                statusText.textContent = lockout.type === 'review_required' ? 'Review Required' : 'Locked Out';
            } else if (stats.reducedRiskMode || stats.riskCapped) {
                badge.classList.add('warning');
                statusText.textContent = 'Reduced Risk';
            } else if (stats.sessionActive) {
                badge.classList.add('active');
                statusText.textContent = 'Active';
            } else {
                badge.classList.add('warning');
                statusText.textContent = 'No Session';
            }
        }
        
        // Stats
        updateStatValue('cb-stat-pnl', `${stats.dailyPnLPercent >= 0 ? '+' : ''}${stats.dailyPnLPercent.toFixed(2)}%`,
            stats.dailyPnLPercent >= 0 ? 'positive' : 'negative');
        
        updateStatValue('cb-stat-trades', stats.tradesToday.toString(),
            stats.tradesToday > 0 ? 'neutral' : 'neutral');
        
        updateStatValue('cb-stat-streak', stats.consecutiveLosses.toString(),
            stats.consecutiveLosses >= 3 ? 'negative' : stats.consecutiveLosses >= 2 ? 'warning' : 'neutral');
        
        const totalLeakage = stats.leakageWarnings + stats.leakageBlocks;
        updateStatValue('cb-stat-leakage', totalLeakage.toString(),
            totalLeakage >= 2 ? 'negative' : totalLeakage >= 1 ? 'warning' : 'neutral');
        
        // Risk bar
        const riskPercent = Math.round(risk.effective / risk.baseRisk * 100);
        const riskBar = document.getElementById('cb-risk-bar');
        const riskValue = document.getElementById('cb-risk-value');
        
        if (riskBar && riskValue) {
            riskBar.style.width = `${riskPercent}%`;
            riskBar.className = 'cb-risk-bar';
            
            if (riskPercent >= 75) {
                riskBar.classList.add('healthy');
            } else if (riskPercent >= 40) {
                riskBar.classList.add('reduced');
            } else {
                riskBar.classList.add('critical');
            }
            
            riskValue.textContent = `${riskPercent}%`;
            riskValue.style.color = riskPercent >= 75 ? 'var(--color-pass)' : 
                                    riskPercent >= 40 ? 'var(--color-warning)' : 'var(--color-fail)';
        }
        
        // Risk breakdown
        updateRiskFactor('cb-factor-loss', `Losses: \u00D7${risk.multiplier.toFixed(2)}`, risk.multiplier < 1);
        updateRiskFactor('cb-factor-time', `Time: \u00D7${risk.timeDecay.toFixed(2)}`, risk.timeDecay < 1);
        updateRiskFactor('cb-factor-mode', risk.reducedMode ? 'Mode: Reduced' : (risk.capped ? 'Mode: Capped' : 'Mode: Normal'),
            risk.reducedMode || risk.capped);
        
        // Disabled playbooks
        updateDisabledList('cb-disabled-section', 'cb-disabled-list', stats.disabledPlaybooks, 'cb-disabled-item');
        
        // Cooled pairs
        updateDisabledList('cb-cooled-section', 'cb-cooled-list', stats.cooledPairs, 'cb-cooled-item');
        
        // Session info
        const sessionId = document.getElementById('cb-session-id');
        const sessionTime = document.getElementById('cb-session-time');
        
        if (sessionId && sessionTime) {
            sessionId.textContent = stats.sessionId || 'No active session';
            
            if (stats.sessionActive) {
                const now = new Date();
                sessionTime.textContent = now.toLocaleTimeString('en-AU', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZone: 'Australia/Sydney'
                }) + ' AEST';
            } else {
                sessionTime.textContent = '--:--';
            }
        }
    }
    
    function updateStatValue(elementId, value, colorClass) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = value;
            el.className = 'cb-stat-value ' + colorClass;
        }
    }
    
    function updateRiskFactor(elementId, text, isActive) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = text;
            el.className = 'cb-risk-factor' + (isActive ? ' active' : '');
        }
    }
    
    function updateDisabledList(sectionId, listId, items, itemClass) {
        const section = document.getElementById(sectionId);
        const list = document.getElementById(listId);
        
        if (section && list) {
            if (items && items.length > 0) {
                section.style.display = 'block';
                list.innerHTML = items.map(item => 
                    `<span class="${itemClass}"><span class="icon">\u26D4</span>${item}</span>`
                ).join('');
            } else {
                section.style.display = 'none';
            }
        }
    }
    
    function formatLockoutReason(reason) {
        const reasonMap = {
            'daily_loss_cap': 'Daily Loss Exceeded -3% (Risk Capped)',
            'daily_loss_standdown': 'Daily Loss Exceeded -5% (24h Stand-Down)',
            'daily_loss_emergency': 'Daily Loss Exceeded -10% (Emergency Stand-Down)',
            'loss_streak': 'Loss Streak Limit Reached',
            'leakage_limit': 'Leakage Limit Exceeded',
            'drawdown_protocol': 'Drawdown Protocol Triggered'
        };
        return reasonMap[reason] || reason || 'Trading suspended';
    }
    
    function updateLockoutBanner() {
        if (!window.CircuitBreaker) return;
        
        const lockout = window.CircuitBreaker.getLockoutStatus();
        const banner = document.getElementById('cb-lockout-banner');
        
        if (!banner) return;
        
        if (lockout.active && lockout.type !== 'review_required') {
            banner.classList.add('visible');
            document.body.classList.add('cb-lockout-active');
            
            // Human-readable reason
            document.getElementById('cb-lockout-reason').textContent = formatLockoutReason(lockout.reason);
            
            // v1.1: Show contributing factors if any
            const factorsContainer = document.getElementById('cb-lockout-factors');
            const factorsList = document.getElementById('cb-lockout-factors-list');
            
            if (factorsContainer && factorsList && lockout.contributingFactors && lockout.contributingFactors.length > 0) {
                factorsList.innerHTML = lockout.contributingFactors
                    .map(f => `<span class="cb-lockout-factor-tag">${f}</span>`)
                    .join('');
                factorsContainer.style.display = 'block';
            } else if (factorsContainer) {
                factorsContainer.style.display = 'none';
            }
            
            if (lockout.minutesRemaining) {
                // Format time display
                const hours = Math.floor(lockout.minutesRemaining / 60);
                const mins = lockout.minutesRemaining % 60;
                let timeText;
                
                if (hours >= 24) {
                    const days = Math.floor(hours / 24);
                    const remainingHours = hours % 24;
                    timeText = `${days}d ${remainingHours}h remaining`;
                } else if (hours > 0) {
                    timeText = `${hours}h ${mins}m remaining`;
                } else {
                    timeText = `${mins} minutes remaining`;
                }
                
                document.getElementById('cb-lockout-timer').textContent = timeText;
                
                // Calculate progress based on lockout type
                let totalMinutes;
                if (lockout.reason === 'daily_loss_emergency') {
                    totalMinutes = 48 * 60; // 48 hours
                } else if (lockout.reason === 'daily_loss_standdown') {
                    totalMinutes = 24 * 60; // 24 hours
                } else {
                    totalMinutes = 90; // Default leakage lockout
                }
                
                const elapsed = totalMinutes - lockout.minutesRemaining;
                const progress = Math.max(0, Math.min(100, (elapsed / totalMinutes) * 100));
                
                document.getElementById('cb-lockout-progress-fill').style.width = `${progress}%`;
                document.getElementById('cb-lockout-progress-text').textContent = 
                    `${Math.round(progress)}% elapsed`;
                document.getElementById('cb-lockout-progress').style.display = 'block';
            } else if (lockout.until) {
                document.getElementById('cb-lockout-timer').textContent = 
                    `Resumes: ${new Date(lockout.until).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`;
                document.getElementById('cb-lockout-progress').style.display = 'none';
            } else {
                document.getElementById('cb-lockout-timer').textContent = 'Until next session';
                document.getElementById('cb-lockout-progress').style.display = 'none';
            }
        } else {
            banner.classList.remove('visible');
            document.body.classList.remove('cb-lockout-active');
        }
    }
    
    function updateReviewModal() {
        if (!window.CircuitBreaker) return;
        
        const review = window.CircuitBreaker.getPendingReview();
        const overlay = document.getElementById('cb-review-overlay');
        
        if (!overlay) return;
        
        if (review.required) {
            overlay.classList.add('visible');
            document.getElementById('cb-review-reason').textContent = review.reason;
            updateReviewButtonState();
        } else {
            overlay.classList.remove('visible');
        }
    }
    
    function updateReviewButtonState() {
        const trigger = document.getElementById('cb-review-trigger');
        const action = document.getElementById('cb-review-action');
        const acknowledge = document.getElementById('cb-review-acknowledge');
        const submit = document.getElementById('cb-review-submit');
        
        if (trigger && action && acknowledge && submit) {
            const isValid = trigger.value.length >= 10 && 
                           action.value.length >= 10 && 
                           acknowledge.checked;
            submit.disabled = !isValid;
        }
    }
    
    function handleReviewSubmit() {
        if (!window.CircuitBreaker) return;
        
        const trigger = document.getElementById('cb-review-trigger').value;
        const action = document.getElementById('cb-review-action').value;
        const acknowledged = document.getElementById('cb-review-acknowledge').checked;
        
        const result = window.CircuitBreaker.submitReview({
            trigger,
            action,
            acknowledged
        });
        
        if (result.success) {
            document.getElementById('cb-review-overlay').classList.remove('visible');
            
            // Clear form
            document.getElementById('cb-review-trigger').value = '';
            document.getElementById('cb-review-action').value = '';
            document.getElementById('cb-review-acknowledge').checked = false;
            
            // Show success message
            showNotification('Review submitted. Trading unlocked.', 'success');
            
            // Refresh all UI
            updateAll();
        } else {
            showNotification(result.reason, 'error');
        }
    }
    
    function showNotification(message, type) {
        // Simple alert for now - could be enhanced with toast
        if (type === 'error') {
            alert('Error: ' + message);
        } else {
            alert(message);
        }
    }
    
    function updatePlaybookCards() {
        if (!window.CircuitBreaker) return;
        
        const disabled = window.CircuitBreaker.getDisabledPlaybooks();
        
        // Find all playbook cards
        document.querySelectorAll('.playbook-card').forEach(card => {
            const playbookId = card.dataset.playbookId || card.dataset.playbook;
            
            if (playbookId && disabled.includes(playbookId)) {
                card.classList.add('cb-disabled');
                
                // Add or update disabled badge
                let badge = card.querySelector('.cb-playbook-disabled-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'cb-playbook-disabled-badge';
                    card.appendChild(badge);
                }
                
                // Get reason
                const reason = getPlaybookDisableReason(playbookId);
                badge.textContent = `\u26D4 ${reason}`;
            } else {
                card.classList.remove('cb-disabled');
                const badge = card.querySelector('.cb-playbook-disabled-badge');
                if (badge) badge.remove();
            }
        });
    }
    
    function getPlaybookDisableReason(playbookId) {
        if (!window.CircuitBreaker) return 'Disabled';
        
        const state = window.CircuitBreaker.getState();
        const pb = state.playbooks[playbookId];
        
        if (pb?.disabledReason) {
            switch (pb.disabledReason) {
                case 'consecutive_failures':
                    return '2 consecutive failures';
                case 'expectancy_negative':
                    return 'Negative expectancy';
                case 'loss_streak_trend':
                    return 'Loss streak active';
                default:
                    return pb.disabledReason;
            }
        }
        
        // Trend playbook disabled by loss streak
        if (state.behavioural.consecutiveLosses >= 3) {
            return `${state.behavioural.consecutiveLosses} consecutive losses`;
        }
        
        return 'Disabled';
    }
    
    function updateAll() {
        updateStatusPanel();
        updateLockoutBanner();
        updateReviewModal();
        updatePlaybookCards();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    function setupEventListeners() {
        // Listen for CircuitBreaker events
        window.addEventListener('circuitbreaker:statsupdate', updateAll);
        window.addEventListener('circuitbreaker:lockout', updateAll);
        window.addEventListener('circuitbreaker:sessionstart', updateAll);
        window.addEventListener('circuitbreaker:tradeprocessed', updateAll);
        window.addEventListener('circuitbreaker:blocked', updateAll);
        
        // Tab change listener (update playbook cards when tab shown)
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                setTimeout(updatePlaybookCards, 100);
            });
        });
    }

    // ============================================
    // INITIALISATION
    // ============================================
    
    function init() {
        console.log(`Circuit Breaker UI v${UI_VERSION}: Initialising...`);
        
        // Wait for CircuitBreaker module
        if (typeof window.CircuitBreaker === 'undefined') {
            console.log('CB UI: Waiting for CircuitBreaker module...');
            setTimeout(init, 100);
            return;
        }
        
        // Inject styles
        injectStyles();
        
        // Inject UI components
        injectLockoutBanner();
        injectReviewModal();
        
        // Wait for DOM then inject status panel
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                injectStatusPanel();
                setupEventListeners();
                updateAll();
                startPeriodicUpdates();
            });
        } else {
            injectStatusPanel();
            setupEventListeners();
            updateAll();
            startPeriodicUpdates();
        }
        
        console.log(`Circuit Breaker UI v${UI_VERSION}: Loaded`);
    }
    
    function startPeriodicUpdates() {
        // Update every 10 seconds
        setInterval(updateAll, UPDATE_INTERVAL);
    }
    
    // Auto-init
    init();

})();
