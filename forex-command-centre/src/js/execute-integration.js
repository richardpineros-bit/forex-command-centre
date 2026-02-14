// ============================================================================
// EXECUTE BUTTON INTEGRATION v1.0.0
// Wire EXECUTE TRADE button to TradeCapture module
// ============================================================================
// Add this to your main index.html after loading trade-capture.js
// ============================================================================

(function() {
    'use strict';

    /**
     * Enhanced execute trade handler
     * Captures trade data before executing
     */
    async function handleExecuteTrade(event) {
        const btn = event.currentTarget;
        
        // Prevent double-click
        if (btn.classList.contains('capturing')) {
            return;
        }
        
        // Visual feedback
        btn.classList.add('capturing');
        const originalText = btn.textContent;
        btn.textContent = 'Capturing...';
        
        try {
            // 1. Run existing validation (if any)
            const validationPassed = runPreTradeValidation();
            if (!validationPassed) {
                showNotification('Validation failed - check all criteria', 'warning');
                return;
            }
            
            // 2. Create pending trade via TradeCapture
            if (typeof TradeCapture !== 'undefined') {
                const trade = await TradeCapture.createPendingTrade();
                
                if (trade) {
                    // Success feedback
                    btn.classList.add('success');
                    btn.textContent = '✓ Trade Logged';
                    
                    showNotification(
                        `Trade captured: ${trade.preTradeData.pair} ${trade.preTradeData.direction.toUpperCase()}` +
                        (trade.alertId ? ' (Alert matched!)' : ''),
                        'success'
                    );
                    
                    // Update pending trades panel
                    renderPendingTradesPanel();
                    
                    // Reset form after short delay
                    setTimeout(() => {
                        resetPreTradeForm();
                    }, 2000);
                }
            } else {
                console.warn('[Execute] TradeCapture module not loaded');
                showNotification('Trade capture module not available', 'warning');
            }
            
        } catch (error) {
            console.error('[Execute] Error:', error);
            showNotification('Error capturing trade: ' + error.message, 'error');
            
        } finally {
            // Reset button after delay
            setTimeout(() => {
                btn.classList.remove('capturing', 'success');
                btn.textContent = originalText;
            }, 2000);
        }
    }

    /**
     * Run pre-trade validation checks
     * Returns true if all required checks pass
     */
    function runPreTradeValidation() {
        // Check required fields
        const pair = document.getElementById('val-pair')?.value;
        const direction = document.getElementById('val-direction')?.value;
        const entry = document.getElementById('val-entry')?.value;
        const stop = document.getElementById('val-stop')?.value;
        
        if (!pair || !direction) {
            console.warn('[Validation] Missing pair or direction');
            return false;
        }
        
        if (!entry || !stop) {
            console.warn('[Validation] Missing entry or stop');
            return false;
        }
        
        // Check Circuit Breaker permission
        if (typeof CircuitBreaker !== 'undefined' && CircuitBreaker.canTrade) {
            const canTrade = CircuitBreaker.canTrade();
            if (!canTrade.allowed) {
                console.warn('[Validation] Circuit breaker blocked:', canTrade.reason);
                showNotification('Trading blocked: ' + canTrade.reason, 'error');
                return false;
            }
        }
        
        // Check minimum R:R
        const tp1 = parseFloat(document.getElementById('val-tp1')?.value);
        const entryPrice = parseFloat(entry);
        const stopPrice = parseFloat(stop);
        
        if (tp1 && entryPrice && stopPrice) {
            const risk = Math.abs(entryPrice - stopPrice);
            const reward = Math.abs(tp1 - entryPrice);
            const rr = risk > 0 ? reward / risk : 0;
            
            if (rr < 1.5) {
                console.warn('[Validation] R:R below minimum:', rr.toFixed(2));
                // Allow but warn
                showNotification(`Warning: R:R is ${rr.toFixed(2)} (below 1.5)`, 'warning');
            }
        }
        
        return true;
    }

    /**
     * Reset pre-trade form after successful capture
     */
    function resetPreTradeForm() {
        // Clear price fields
        ['val-entry', 'val-stop', 'val-tp1', 'val-tp2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // Uncheck execution checkboxes
        ['exec-type-declared', 'exec-single-trigger', 'exec-planned-price', 
         'exec-stop-invalidation', 'exec-spread-ok'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        
        // Uncheck structure checkboxes
        ['sl-swing-identified', 'sl-buffer-added', 'tp-structure-identified',
         'tp-path-clear', 'rr-acceptable'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        
        // Reset grade display
        const gradeBadge = document.getElementById('grade-badge');
        if (gradeBadge) gradeBadge.textContent = '--';
        
        // Don't clear pair/direction - trader may want to take another trade on same pair
    }

    /**
     * Render pending trades panel in Journal tab
     */
    function renderPendingTradesPanel() {
        const panel = document.getElementById('pending-trades-panel');
        const list = document.getElementById('pending-trades-list');
        const countEl = document.getElementById('pending-count');
        
        if (!panel || !list) return;
        
        if (typeof TradeCapture === 'undefined') {
            panel.style.display = 'none';
            return;
        }
        
        const trades = TradeCapture.getAllPendingTrades().filter(t => 
            ['pending', 'open', 'closed_pending'].includes(t.status)
        );
        
        if (trades.length === 0) {
            panel.style.display = 'none';
            return;
        }
        
        panel.style.display = 'block';
        if (countEl) countEl.textContent = trades.length;
        
        list.innerHTML = trades.map(trade => {
            const pre = trade.preTradeData;
            const alert = trade.alertData;
            const oanda = trade.oandaData;
            
            const statusLabels = {
                pending: 'Waiting for Oanda...',
                open: 'Position Open',
                closed_pending: 'Needs Review'
            };
            
            return `
                <div class="pending-trade-card" data-trade-id="${trade.id}" data-status="${trade.status}">
                    <div class="pending-trade-header">
                        <span class="pending-pair">${pre.pair}</span>
                        <span class="pending-direction ${pre.direction}">${pre.direction.toUpperCase()}</span>
                        ${trade.alertId ? '<span class="alert-matched-badge">Alert</span>' : ''}
                        <span class="pending-status status-${trade.status}">${statusLabels[trade.status] || trade.status}</span>
                    </div>
                    <div class="pending-trade-data">
                        <div class="data-row">
                            <span>Score</span>
                            <span>${alert?.score || pre.utccScore || '--'}</span>
                        </div>
                        <div class="data-row">
                            <span>Tier</span>
                            <span>${alert?.tier || 'Manual'}</span>
                        </div>
                        <div class="data-row">
                            <span>Entry</span>
                            <span>${(oanda?.actualEntry || pre.plannedEntry)?.toFixed(5) || '--'}</span>
                        </div>
                        <div class="data-row">
                            <span>R:R</span>
                            <span>${pre.plannedRR || '--'}</span>
                        </div>
                        ${trade.status === 'closed_pending' && oanda?.realisedPL !== null ? `
                        <div class="data-row highlight">
                            <span>P&L</span>
                            <span class="pending-pnl ${oanda.realisedPL >= 0 ? 'positive' : 'negative'}">
                                ${oanda.realisedPL >= 0 ? '+' : ''}$${Math.abs(oanda.realisedPL).toFixed(2)}
                            </span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="pending-trade-actions">
                        ${trade.status === 'pending' ? `
                            <button class="btn btn-sm btn-secondary" onclick="cancelPendingTrade('${trade.id}')">Cancel</button>
                        ` : ''}
                        ${trade.status === 'closed_pending' ? `
                            <button class="btn btn-sm btn-primary" onclick="openQuickJournal('${trade.id}')">Complete Journal</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Cancel a pending trade
     */
    window.cancelPendingTrade = function(tradeId) {
        if (confirm('Cancel this pending trade?')) {
            if (TradeCapture.cancelPendingTrade(tradeId)) {
                showNotification('Trade cancelled', 'info');
                renderPendingTradesPanel();
            }
        }
    };

    /**
     * Open quick journal for a closed trade
     */
    window.openQuickJournal = function(tradeId) {
        const trade = TradeCapture.getTradeById(tradeId);
        if (!trade) return;
        
        // Populate journal form
        TradeCapture.populateJournalFromTrade(trade);
        
        // Switch to journal tab
        if (typeof showTab === 'function') {
            showTab('journal');
        }
        
        // Scroll to form
        const journalForm = document.getElementById('trade-journal-form');
        if (journalForm) {
            journalForm.scrollIntoView({ behavior: 'smooth' });
        }
    };

    /**
     * Show notification (uses existing system or creates basic one)
     */
    function showNotification(message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        
        // Basic fallback toast
        const toast = document.createElement('div');
        toast.className = `trade-capture-toast ${type}`;
        toast.innerHTML = `<span class="toast-message">${message}</span>`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    /**
     * Initialise execute button integration
     */
    function init() {
        // Find execute button
        const executeBtn = document.getElementById('execute-trade-btn');
        
        if (executeBtn) {
            // Remove existing handlers and add new one
            executeBtn.removeEventListener('click', handleExecuteTrade);
            executeBtn.addEventListener('click', handleExecuteTrade);
            console.log('[ExecuteIntegration] Wired execute button');
        }
        
        // Listen for trade capture events
        document.addEventListener('tradecapture:created', () => {
            renderPendingTradesPanel();
        });
        
        document.addEventListener('tradecapture:linked', () => {
            renderPendingTradesPanel();
        });
        
        document.addEventListener('tradecapture:closed', () => {
            renderPendingTradesPanel();
        });
        
        document.addEventListener('tradecapture:completed', () => {
            renderPendingTradesPanel();
        });
        
        // Initial render
        setTimeout(renderPendingTradesPanel, 500);
        
        console.log('[ExecuteIntegration] Ready');
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

    // Export for manual use
    window.ExecuteIntegration = {
        handleExecuteTrade,
        renderPendingTradesPanel,
        resetPreTradeForm,
        init
    };

})();
