/**
 * Session Board Module
 * Forex Command Centre v2.1.0
 * 
 * Provides session-level discipline controls:
 * - Auto-popup on app open if no session locked
 * - Lock session commitment (session, max trades, playbooks, context)
 * - Override protocol for mid-session changes
 * - Server-side persistence via session-board-api.php
 */

(function() {
    'use strict';
    
    const SessionBoard = {
        // Configuration
        API_URL: '/session-board-api.php',
        
        // Session definitions (AEST times)
        SESSIONS: {
            tokyo: { name: 'Tokyo', startHour: 9, endHour: 17, tradeable: true },
            london: { name: 'London', startHour: 17, endHour: 1, tradeable: true },
            newyork: { name: 'New York', startHour: 22, endHour: 7, tradeable: false }
        },
        
        // Playbook options
        PLAYBOOKS: [
            { id: 'continuation', name: 'Continuation', description: 'Trend continuation setups' },
            { id: 'deep_pullback', name: 'Deep Pullback', description: 'Deep retracement entries' },
            { id: 'observation', name: 'Observation Only', description: 'No entries allowed' }
        ],
        
        // State
        currentBoard: null,
        initialized: false,
        
        /**
         * Initialize the module
         */
        init: async function() {
            if (this.initialized) return;
            
            console.log('[SessionBoard] Initialising...');
            
            // Check for existing session board
            await this.checkCurrentSession();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Auto-popup if needed
            this.checkAutoPopup();
            
            this.initialized = true;
            console.log('[SessionBoard] Ready');
        },
        
        /**
         * Setup event listeners
         */
        setupEventListeners: function() {
            // Close modal on overlay click
            document.addEventListener('click', (e) => {
                if (e.target.id === 'session-board-modal-overlay') {
                    // Only close if not in edit mode
                    const modal = document.getElementById('session-board-modal');
                    if (modal && !modal.classList.contains('edit-mode')) {
                        this.closeModal();
                    }
                }
            });
            
            // Close on Escape (but not if editing)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const modal = document.getElementById('session-board-modal');
                    if (modal && modal.classList.contains('active') && !modal.classList.contains('edit-mode')) {
                        this.closeModal();
                    }
                }
            });
        },
        
        /**
         * Get current AEST date
         */
        getAESTDate: function() {
            const now = new Date();
            const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
            return aest.toISOString().split('T')[0];
        },
        
        /**
         * Get current AEST hour
         */
        getAESTHour: function() {
            const now = new Date();
            const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
            return aest.getHours();
        },
        
        /**
         * Determine current session based on AEST time
         */
        getCurrentSession: function() {
            const hour = this.getAESTHour();
            
            // Tokyo: 9:00 - 17:00 AEST
            if (hour >= 9 && hour < 17) {
                return 'tokyo';
            }
            // London: 17:00 - 01:00 AEST (next day)
            if (hour >= 17 || hour < 1) {
                return 'london';
            }
            // New York: 22:00 - 07:00 AEST (next day)
            if (hour >= 22 || hour < 7) {
                return 'newyork';
            }
            
            // Off-hours
            return null;
        },
        
        /**
         * Check if we need to auto-popup
         */
        checkAutoPopup: function() {
            const currentSession = this.getCurrentSession();
            
            // Only auto-popup during tradeable sessions
            if (!currentSession) {
                console.log('[SessionBoard] No active session - skipping auto-popup');
                return;
            }
            
            const sessionInfo = this.SESSIONS[currentSession];
            if (!sessionInfo.tradeable) {
                console.log('[SessionBoard] Non-tradeable session - skipping auto-popup');
                return;
            }
            
            // Check if board exists for current session
            const date = this.getAESTDate();
            const key = date + '_' + currentSession;
            
            if (this.currentBoard && this.currentBoard.locked) {
                console.log('[SessionBoard] Session already locked - no auto-popup');
                return;
            }
            
            // Show the popup
            console.log('[SessionBoard] No locked session - showing auto-popup');
            this.showModal('create', currentSession);
        },
        
        /**
         * Check current session from server
         */
        checkCurrentSession: async function() {
            try {
                const currentSession = this.getCurrentSession();
                if (!currentSession) {
                    this.currentBoard = null;
                    return;
                }
                
                const date = this.getAESTDate();
                const response = await fetch(`${this.API_URL}?action=check&session=${currentSession}&date=${date}`);
                const data = await response.json();
                
                if (data.success && data.exists && data.locked) {
                    this.currentBoard = data.board;
                    this.updateUI();
                } else {
                    this.currentBoard = null;
                }
            } catch (error) {
                console.error('[SessionBoard] Failed to check current session:', error);
                this.currentBoard = null;
            }
        },
        
        /**
         * Save session board to server
         */
        saveBoard: async function(boardData, override = false) {
            try {
                const response = await fetch(`${this.API_URL}?action=save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...boardData,
                        override: override,
                        date: this.getAESTDate()
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.currentBoard = data.board;
                    this.updateUI();
                    this.closeModal();
                    this.showToast('Session Board locked', 'success');
                } else {
                    this.showToast(data.error || 'Failed to save', 'error');
                }
                
                return data;
            } catch (error) {
                console.error('[SessionBoard] Save failed:', error);
                this.showToast('Failed to save session board', 'error');
                return { success: false, error: error.message };
            }
        },
        
        /**
         * Decrement trades remaining
         */
        decrementTrade: async function() {
            if (!this.currentBoard) return;
            
            try {
                const response = await fetch(`${this.API_URL}?action=decrement`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session: this.currentBoard.session,
                        date: this.getAESTDate()
                    })
                });
                
                const data = await response.json();
                if (data.success) {
                    this.currentBoard.tradesUsed = data.tradesUsed;
                    this.updateUI();
                }
            } catch (error) {
                console.error('[SessionBoard] Decrement failed:', error);
            }
        },
        
        /**
         * Show the modal
         */
        showModal: function(mode = 'view', preselectedSession = null) {
            // Remove existing modal if any
            const existing = document.getElementById('session-board-modal-overlay');
            if (existing) existing.remove();
            
            const currentSession = preselectedSession || this.getCurrentSession();
            const isLocked = this.currentBoard && this.currentBoard.locked;
            const isEditMode = mode === 'create' || mode === 'override';
            
            const modalHTML = `
                <div class="modal-overlay active" id="session-board-modal-overlay">
                    <div class="modal session-board-modal ${isEditMode ? 'edit-mode' : ''}" id="session-board-modal">
                        <div class="modal-header">
                            <h3 class="modal-title">&#x1F4CB; Session Board</h3>
                            ${!isEditMode ? '<button class="modal-close" onclick="SessionBoard.closeModal()">&times;</button>' : ''}
                        </div>
                        <div class="modal-body">
                            ${isLocked && mode === 'view' ? this.renderLockedView() : this.renderEditForm(mode, currentSession)}
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        },
        
        /**
         * Render locked/view state
         */
        renderLockedView: function() {
            const board = this.currentBoard;
            const tradesUsed = board.tradesUsed || 0;
            const tradesRemaining = Math.max(0, board.maxTrades - tradesUsed);
            const playbooks = board.playbooks || [];
            
            return `
                <div class="session-board-locked">
                    <div class="sb-locked-badge">
                        <span>&#x1F512;</span> LOCKED
                    </div>
                    
                    <div class="sb-summary-grid">
                        <div class="sb-summary-item">
                            <span class="sb-label">Session</span>
                            <span class="sb-value">${this.SESSIONS[board.session]?.name || board.session}</span>
                        </div>
                        <div class="sb-summary-item">
                            <span class="sb-label">Trades Remaining</span>
                            <span class="sb-value ${tradesRemaining === 0 ? 'text-fail' : ''}">${tradesRemaining} / ${board.maxTrades}</span>
                        </div>
                        <div class="sb-summary-item">
                            <span class="sb-label">Permission</span>
                            <span class="sb-value sb-permission-${board.permissionLevel}">${board.permissionLevel.toUpperCase()}</span>
                        </div>
                        <div class="sb-summary-item">
                            <span class="sb-label">Locked At</span>
                            <span class="sb-value">${new Date(board.lockedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                    
                    <div class="sb-playbooks">
                        <span class="sb-label">Allowed Playbooks</span>
                        <div class="sb-playbook-tags">
                            ${playbooks.map(p => `<span class="sb-playbook-tag">${this.PLAYBOOKS.find(pb => pb.id === p)?.name || p}</span>`).join('')}
                        </div>
                    </div>
                    
                    ${board.context ? `
                        <div class="sb-context">
                            <span class="sb-label">Context</span>
                            <p>${board.context}</p>
                        </div>
                    ` : ''}
                    
                    ${board.overrideCount > 0 ? `
                        <div class="sb-override-warning">
                            &#x26A0; Overridden ${board.overrideCount} time(s)
                        </div>
                    ` : ''}
                    
                    <div class="sb-actions">
                        <button class="btn btn-secondary" onclick="SessionBoard.closeModal()">Close</button>
                        <button class="btn btn-warning" onclick="SessionBoard.startOverride()">&#x1F511; Override</button>
                    </div>
                </div>
            `;
        },
        
        /**
         * Render edit/create form
         */
        renderEditForm: function(mode, preselectedSession) {
            const isOverride = mode === 'override';
            const board = isOverride ? this.currentBoard : null;
            
            return `
                <div class="session-board-form">
                    ${!isOverride ? `
                        <div class="sb-prompt">
                            <span>&#x1F3AF;</span>
                            <strong>New Session - Build Your Board</strong>
                            <p>Pre-commit to your session plan before seeing charts.</p>
                        </div>
                    ` : `
                        <div class="sb-override-prompt">
                            <span>&#x26A0;</span>
                            <strong>Override Protocol</strong>
                            <p>You are about to modify a locked session board. This will be logged.</p>
                        </div>
                    `}
                    
                    <form id="session-board-form" onsubmit="SessionBoard.handleSubmit(event, ${isOverride})">
                        <div class="form-group">
                            <label class="form-label">Session to Trade</label>
                            <div class="sb-session-options">
                                ${Object.entries(this.SESSIONS).filter(([k, v]) => v.tradeable).map(([key, session]) => `
                                    <label class="sb-session-option ${key === preselectedSession ? 'selected' : ''} ${!session.tradeable ? 'disabled' : ''}">
                                        <input type="radio" name="session" value="${key}" 
                                            ${key === preselectedSession ? 'checked' : ''} 
                                            ${!session.tradeable ? 'disabled' : ''}
                                            onchange="this.closest('.sb-session-options').querySelectorAll('.sb-session-option').forEach(o => o.classList.remove('selected')); this.closest('.sb-session-option').classList.add('selected');">
                                        <span class="sb-session-name">${session.name}</span>
                                        ${key === this.getCurrentSession() ? '<span class="sb-current-badge">CURRENT</span>' : ''}
                                    </label>
                                `).join('')}
                                <label class="sb-session-option">
                                    <input type="radio" name="session" value="none" onchange="this.closest('.sb-session-options').querySelectorAll('.sb-session-option').forEach(o => o.classList.remove('selected')); this.closest('.sb-session-option').classList.add('selected');">
                                    <span class="sb-session-name">None (Prep Only)</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Max Trades This Session</label>
                            <div class="sb-max-trades">
                                ${[0, 1, 2, 3].map(n => `
                                    <label class="sb-trade-option ${n === (board?.maxTrades || 2) ? 'selected' : ''}">
                                        <input type="radio" name="maxTrades" value="${n}" 
                                            ${n === (board?.maxTrades || 2) ? 'checked' : ''}
                                            onchange="this.closest('.sb-max-trades').querySelectorAll('.sb-trade-option').forEach(o => o.classList.remove('selected')); this.closest('.sb-trade-option').classList.add('selected');">
                                        <span>${n}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Allowed Playbooks</label>
                            <div class="sb-playbook-options">
                                ${this.PLAYBOOKS.map(pb => `
                                    <label class="sb-playbook-option">
                                        <input type="checkbox" name="playbooks" value="${pb.id}"
                                            ${board?.playbooks?.includes(pb.id) ? 'checked' : ''}>
                                        <span class="sb-pb-name">${pb.name}</span>
                                        <span class="sb-pb-desc">${pb.description}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Permission Level</label>
                            <select class="form-select" name="permissionLevel">
                                <option value="full" ${board?.permissionLevel === 'full' ? 'selected' : ''}>Full - Normal trading</option>
                                <option value="conditional" ${board?.permissionLevel === 'conditional' ? 'selected' : ''}>Conditional - Reduced risk, 1 playbook only</option>
                                <option value="standdown" ${board?.permissionLevel === 'standdown' ? 'selected' : ''}>Stand Down - No entries allowed</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Session Context (one sentence)</label>
                            <input type="text" class="form-input" name="context" 
                                placeholder="e.g., Trend continuation; volatility stable; avoid news window."
                                value="${board?.context || ''}"
                                maxlength="150">
                        </div>
                        
                        ${isOverride ? `
                            <div class="form-group sb-override-reason">
                                <label class="form-label">&#x26A0; Why are you overriding? (Required)</label>
                                <textarea class="form-input" name="overrideReason" required
                                    placeholder="What is the model missing? Why does this warrant an override?"
                                    rows="2"></textarea>
                            </div>
                        ` : ''}
                        
                        <div class="sb-form-actions">
                            ${isOverride ? `
                                <button type="button" class="btn btn-secondary" onclick="SessionBoard.cancelOverride()">Cancel</button>
                                <button type="submit" class="btn btn-warning">&#x1F511; Confirm Override</button>
                            ` : `
                                <button type="submit" class="btn btn-primary">&#x1F512; Lock Session Board</button>
                            `}
                        </div>
                    </form>
                </div>
            `;
        },
        
        /**
         * Handle form submission
         */
        handleSubmit: async function(event, isOverride = false) {
            event.preventDefault();
            
            const form = event.target;
            const formData = new FormData(form);
            
            const session = formData.get('session');
            const maxTrades = parseInt(formData.get('maxTrades'), 10);
            const playbooks = formData.getAll('playbooks');
            const permissionLevel = formData.get('permissionLevel');
            const context = formData.get('context');
            const overrideReason = formData.get('overrideReason');
            
            // Validation
            if (!session) {
                this.showToast('Please select a session', 'error');
                return;
            }
            
            if (playbooks.length === 0) {
                this.showToast('Please select at least one playbook', 'error');
                return;
            }
            
            if (isOverride && !overrideReason) {
                this.showToast('Override reason is required', 'error');
                return;
            }
            
            await this.saveBoard({
                session,
                maxTrades,
                playbooks,
                permissionLevel,
                context,
                overrideReason
            }, isOverride);
        },
        
        /**
         * Start override process
         */
        startOverride: function() {
            this.closeModal();
            this.showModal('override', this.currentBoard?.session);
        },
        
        /**
         * Cancel override
         */
        cancelOverride: function() {
            this.closeModal();
            this.showModal('view');
        },
        
        /**
         * Close the modal
         */
        closeModal: function() {
            const modal = document.getElementById('session-board-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 200);
            }
        },
        
        /**
         * Update UI elements
         */
        updateUI: function() {
            // Update any external UI elements that show session board status
            const statusEl = document.getElementById('session-board-status');
            if (statusEl && this.currentBoard) {
                const tradesUsed = this.currentBoard.tradesUsed || 0;
                const remaining = Math.max(0, this.currentBoard.maxTrades - tradesUsed);
                statusEl.innerHTML = `
                    <span class="sb-mini-status locked">
                        &#x1F512; ${this.SESSIONS[this.currentBoard.session]?.name} | ${remaining} trades left
                    </span>
                `;
            } else if (statusEl) {
                statusEl.innerHTML = `
                    <span class="sb-mini-status unlocked" onclick="SessionBoard.showModal('create')">
                        &#x26A0; No Session Board
                    </span>
                `;
            }
        },
        
        /**
         * Check if trade is allowed
         */
        canTrade: function(playbookId) {
            if (!this.currentBoard || !this.currentBoard.locked) {
                return { allowed: false, reason: 'No session board locked' };
            }
            
            if (this.currentBoard.permissionLevel === 'standdown') {
                return { allowed: false, reason: 'Stand-down mode active' };
            }
            
            const tradesUsed = this.currentBoard.tradesUsed || 0;
            if (tradesUsed >= this.currentBoard.maxTrades) {
                return { allowed: false, reason: 'Max trades reached for session' };
            }
            
            if (playbookId && !this.currentBoard.playbooks.includes(playbookId)) {
                return { allowed: false, reason: `Playbook "${playbookId}" not allowed this session` };
            }
            
            if (this.currentBoard.playbooks.includes('observation')) {
                return { allowed: false, reason: 'Observation Only mode - no entries' };
            }
            
            return { allowed: true };
        },
        
        /**
         * Show toast notification
         */
        showToast: function(message, type = 'info') {
            // Use existing toast system if available
            if (typeof showToast === 'function') {
                showToast(message, type);
                return;
            }
            
            // Fallback toast
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
                color: white;
                border-radius: 8px;
                font-weight: 500;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            `;
            
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    };
    
    // Export to window
    window.SessionBoard = SessionBoard;
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => SessionBoard.init());
    } else {
        setTimeout(() => SessionBoard.init(), 100);
    }
    
})();
