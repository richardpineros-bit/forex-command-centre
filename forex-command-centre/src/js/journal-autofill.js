// ============================================
// JOURNAL AUTOFILL MODULE v1.2.0
// Auto-populates existing journal form from captured trade data
// ============================================
// Replaces: quick-journal (panel approach)
// Integrates with: TradeCapture, CircuitBreaker
// ============================================
// v1.2.0 - ADD: Dismiss button on review banner
//   Routes through TradeCapture.dismissTrade() (single authority)
//   Dismiss reason picker matches index.html dismiss UI
//   Banner updates count after dismiss
// v1.1.0 - FIX: Direction derivation from Oanda initialUnits sign
//   Positive initialUnits = LONG, Negative = SHORT
//   Replaces hardcoded 'long' fallbacks throughout
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.2.0';
    const MODULE_NAME = 'JournalAutofill';

    // ============================================
    // FIELD MAPPING
    // ============================================

    // Maps captured trade data to journal form field IDs
    const FIELD_MAP = {
        // Section A: Trade Metadata
        'trade-datetime': (t) => formatDateTimeLocal(t.openedAt || t.oandaData?.openTime),
        'trade-pair': (t) => normalisePair(t.preTradeData?.pair || t.alertData?.pair || t.oandaData?.instrument),
        'trade-session': (t) => t.preTradeData?.session || '',
        'trade-direction': (t) => deriveDirection(t),
        'trade-type': (t) => mapPlaybookToType(t.preTradeData?.playbook),
        
        // Section B: Permission Log
        'trade-market-regime': (t) => (t.preTradeData?.regime || '').toLowerCase(),
        'trade-vol-context': (t) => mapVolatilityContext(t.alertData?.volatilityState),
        'trade-permission-state': (t) => (t.preTradeData?.permissionState || '').toLowerCase(),
        
        // Section C: Execution - Prices
        'trade-entry': (t) => t.oandaData?.actualEntry || t.preTradeData?.plannedEntry || '',
        'trade-stop': (t) => t.oandaData?.actualStop || t.preTradeData?.plannedStop || '',
        'trade-tp': (t) => t.oandaData?.actualTP || t.preTradeData?.plannedTP1 || '',
        'trade-exit': (t) => t.oandaData?.exitPrice || '',
        'trade-units': (t) => {
            const raw = t.oandaData?.units || t.oandaData?.initialUnits || '';
            return raw !== '' ? Math.abs(parseFloat(raw)) : '';
        },
        'trade-risk-amount': (t) => calculateRiskAmount(t),
        
        // Section D: Management
        'trade-exit-reason': (t) => mapExitReason(t),
        'trade-status': (t) => t.oandaData?.exitPrice ? 'closed' : 'open',
        'trade-slippage': (t) => calculateSlippage(t),
        
        // Section E: Outcome
        'trade-r-display': (t) => t.oandaData?.rValue || calculateRMultiple(t) || '',
        
        // Hidden fields (UTCC data)
        'trade-alert-type': (t) => t.alertData?.tier || 'CAPTURED',
        'trade-entry-zone': (t) => t.alertData?.entryZone || t.alertData?.entry_zone || '',
        'trade-vol-state': (t) => t.alertData?.volatilityState || '',
        'trade-mtf': (t) => formatMTF(t.alertData),
        'trade-grade': (t) => t.alertData?.score || t.preTradeData?.grade || ''
    };

    // Fields that remain manual (not auto-filled)
    const MANUAL_FIELDS = [
        // Execution checkboxes
        'exec-type-declared',
        'exec-single-trigger', 
        'exec-planned-price',
        'exec-stop-invalidation',
        'exec-spread-ok',
        'trade-entry-trigger',
        // Management checkboxes
        'mgmt-no-early-stop',
        'mgmt-partial-rules',
        'mgmt-exit-rules',
        'mgmt-no-revenge',
        // Post-trade review
        'trade-classification',
        'trade-notes',
        'trade-lessons',
        'trade-screenshot',
        // Sometimes manual
        'trade-structure-quality',
        'trade-session-window',
        'trade-permission-tf',
        'trade-execution-tf'
    ];

    // ============================================
    // STATE
    // ============================================

    let state = {
        isInitialised: false,
        pollTimer: null,
        currentTrade: null,
        notificationVisible: false
    };

    // ============================================
    // INITIALISATION
    // ============================================

    function init() {
        if (state.isInitialised) {
            console.warn(`${MODULE_NAME}: Already initialised`);
            return;
        }

        console.log(`${MODULE_NAME} v${MODULE_VERSION}: Initialising...`);

        // Inject notification banner styles
        injectStyles();

        // Create notification banner
        createNotificationBanner();

        // Start polling for pending reviews
        startPolling();

        // Listen for trade status changes
        document.addEventListener('tradeStatusChanged', handleTradeStatusChange);

        // v1.2.0: Listen for dismiss events to update banner
        document.addEventListener('tradecapture:dismissed', handleDismissEvent);
        document.addEventListener('tradecapture:bulkDismissed', handleBulkDismissEvent);

        // Hook into save button
        hookSaveButton();

        state.isInitialised = true;
        console.log(`${MODULE_NAME}: Initialised successfully`);
    }

    // ============================================
    // NOTIFICATION BANNER
    // ============================================

    function createNotificationBanner() {
        if (document.getElementById('journal-autofill-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'journal-autofill-banner';
        banner.className = 'journal-autofill-banner hidden';
        // v1.2.0: Added dismiss button + pending count
        banner.innerHTML = `
            <div class="jaf-banner-content">
                <span class="jaf-banner-icon">&#x1F4CB;</span>
                <div class="jaf-banner-text">
                    <strong>Trade Closed - Review Required</strong>
                    <span id="jaf-banner-pair">--</span>
                    <span id="jaf-banner-count" class="jaf-count-badge" style="display:none;"></span>
                </div>
                <div class="jaf-banner-actions">
                    <button class="btn btn-primary btn-sm" id="jaf-review-btn">Review &amp; Complete</button>
                    <button class="btn btn-sm jaf-dismiss-btn" id="jaf-dismiss-btn">Dismiss</button>
                    <button class="btn btn-secondary btn-sm" id="jaf-later-btn">Later</button>
                </div>
            </div>
        `;

        // Insert at top of body or main container
        const mainContainer = document.querySelector('.main-container') || document.body;
        mainContainer.insertBefore(banner, mainContainer.firstChild);

        // Attach events
        document.getElementById('jaf-review-btn').addEventListener('click', () => {
            navigateToJournalAndFill();
        });

        // v1.2.0: Dismiss button routes through TradeCapture
        document.getElementById('jaf-dismiss-btn').addEventListener('click', () => {
            dismissCurrentTrade();
        });

        document.getElementById('jaf-later-btn').addEventListener('click', () => {
            hideBanner();
        });
    }

    function showBanner(trade) {
        const banner = document.getElementById('journal-autofill-banner');
        const pairEl = document.getElementById('jaf-banner-pair');
        const countEl = document.getElementById('jaf-banner-count');
        
        if (banner && pairEl) {
            const pair = trade.preTradeData?.pair || trade.alertData?.pair || 'Unknown';
            // v1.2.0: Use oandaData.direction (truth) with fallback chain
            const direction = deriveDirection(trade).toUpperCase();
            const pnl = trade.oandaData?.realisedPL || trade.oandaData?.realizedPL;
            const pnlText = pnl !== undefined ? ` | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '';
            
            pairEl.textContent = `${pair} ${direction}${pnlText}`;

            // v1.2.0: Show pending count if more than 1
            const pendingCount = getPendingReviewCount();
            if (countEl) {
                if (pendingCount > 1) {
                    countEl.textContent = `+${pendingCount - 1} more`;
                    countEl.style.display = 'inline';
                } else {
                    countEl.style.display = 'none';
                }
            }

            banner.classList.remove('hidden');
            state.notificationVisible = true;
        }
    }

    function hideBanner() {
        const banner = document.getElementById('journal-autofill-banner');
        if (banner) {
            banner.classList.add('hidden');
            state.notificationVisible = false;
        }
    }

    // ============================================
    // v1.2.0: DISMISS FROM BANNER
    // Routes through TradeCapture.dismissTrade() - single authority
    // ============================================

    function dismissCurrentTrade() {
        if (!state.currentTrade) {
            showNotification('No trade to dismiss', 'warning');
            return;
        }

        // Check TradeCapture is available
        if (typeof window.TradeCapture === 'undefined' || !window.TradeCapture.dismissTrade) {
            showNotification('TradeCapture not available - cannot dismiss', 'error');
            return;
        }

        // Get valid reasons from TradeCapture (single source of truth)
        const reasons = window.TradeCapture.getDismissReasons
            ? window.TradeCapture.getDismissReasons()
            : ['TEST', 'LEGACY', 'CANNOT_RECALL', 'DUPLICATE'];

        const reasonPrompt = reasons.map((r, i) => `${i + 1} = ${r}`).join('\n');
        const input = prompt(
            'Dismiss reason:\n\n' + reasonPrompt + '\n\nEnter 1-' + reasons.length + ':'
        );

        if (!input) return;

        const idx = parseInt(input) - 1;
        if (isNaN(idx) || idx < 0 || idx >= reasons.length) {
            showNotification('Invalid selection', 'warning');
            return;
        }

        const reason = reasons[idx];
        const tradeId = state.currentTrade.id;

        // Route through TradeCapture (the authority)
        const success = window.TradeCapture.dismissTrade(tradeId, reason);

        if (success) {
            showNotification(`Dismissed: ${reason}`, 'info');
            state.currentTrade = null;
            hideBanner();
            // Check for more pending
            setTimeout(checkForPendingReviews, 300);
        } else {
            showNotification('Dismiss failed - check console', 'error');
        }
    }

    function getPendingReviewCount() {
        if (typeof window.TradeCapture !== 'undefined' && window.TradeCapture.getTradesAwaitingReview) {
            return window.TradeCapture.getTradesAwaitingReview().length;
        }
        return 0;
    }

    // v1.2.0: Event handlers for dismiss actions (keep banner in sync)
    function handleDismissEvent(e) {
        console.log(`${MODULE_NAME}: Trade dismissed, checking for more`);
        setTimeout(checkForPendingReviews, 300);
    }

    function handleBulkDismissEvent(e) {
        const { count, reason } = e.detail || {};
        console.log(`${MODULE_NAME}: Bulk dismissed ${count} trades (${reason})`);
        state.currentTrade = null;
        hideBanner();
        setTimeout(checkForPendingReviews, 300);
    }

    // ============================================
    // JOURNAL POPULATION
    // ============================================

    function navigateToJournalAndFill() {
        // Switch to journal tab
        if (typeof showTab === 'function') {
            showTab('journal');
        }

        // Small delay to ensure tab is visible
        setTimeout(() => {
            if (state.currentTrade) {
                populateJournalForm(state.currentTrade);
                hideBanner();
                highlightManualFields();
                scrollToJournal();
            }
        }, 100);
    }

    function populateJournalForm(trade) {
        console.log(`${MODULE_NAME}: Populating journal form`, trade.id);

        let filledCount = 0;

        for (const [fieldId, extractor] of Object.entries(FIELD_MAP)) {
            try {
                const value = extractor(trade);
                if (value !== '' && value !== null && value !== undefined) {
                    const filled = setFieldValue(fieldId, value);
                    if (filled) filledCount++;
                }
            } catch (err) {
                console.warn(`${MODULE_NAME}: Error extracting ${fieldId}`, err);
            }
        }

        // Store trade reference for save handler
        window._autofillTradeRef = trade;

        console.log(`${MODULE_NAME}: Filled ${filledCount} fields`);
        
        // Show toast notification
        showNotification(`Journal auto-filled with ${filledCount} fields. Complete the highlighted sections.`, 'success');
    }

    function setFieldValue(fieldId, value) {
        const el = document.getElementById(fieldId);
        if (!el) return false;

        if (el.tagName === 'SELECT') {
            // For selects, find matching option
            const options = Array.from(el.options);
            const match = options.find(opt => 
                opt.value.toLowerCase() === String(value).toLowerCase()
            );
            if (match) {
                el.value = match.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        } else if (el.type === 'checkbox') {
            el.checked = Boolean(value);
            return true;
        } else {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }

        return false;
    }

    function highlightManualFields() {
        // Add visual indicator to fields needing manual input
        MANUAL_FIELDS.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el) {
                const wrapper = el.closest('.form-group') || el.closest('.execution-check') || el.closest('.management-check');
                if (wrapper) {
                    wrapper.classList.add('needs-input');
                }
            }
        });

        // Remove highlights after user interacts
        MANUAL_FIELDS.forEach(fieldId => {
            const el = document.getElementById(fieldId);
            if (el) {
                el.addEventListener('change', () => {
                    const wrapper = el.closest('.form-group') || el.closest('.execution-check') || el.closest('.management-check');
                    if (wrapper) {
                        wrapper.classList.remove('needs-input');
                    }
                }, { once: true });
            }
        });
    }

    function scrollToJournal() {
        const journalCard = document.querySelector('#tab-journal .card');
        if (journalCard) {
            journalCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ============================================
    // SAVE BUTTON HOOK
    // ============================================

    function hookSaveButton() {
        // Intercept save to also record to CircuitBreaker
        const originalSaveTrade = window.saveTrade;
        
        window.saveTrade = function() {
            // Call original save
            if (typeof originalSaveTrade === 'function') {
                originalSaveTrade();
            }

            // If this was an auto-filled trade, update TradeCapture and CircuitBreaker
            const trade = window._autofillTradeRef;
            if (trade) {
                completeAutofilledTrade(trade);
                window._autofillTradeRef = null;
            }
        };
    }

    function completeAutofilledTrade(trade) {
        console.log(`${MODULE_NAME}: Completing autofilled trade`, trade.id);

        // Gather manual review data from form
        const reviewData = {
            executionChecks: {
                typeDeclared: document.getElementById('exec-type-declared')?.checked || false,
                singleTrigger: document.getElementById('exec-single-trigger')?.checked || false,
                plannedPrice: document.getElementById('exec-planned-price')?.checked || false,
                stopInvalidation: document.getElementById('exec-stop-invalidation')?.checked || false,
                spreadOk: document.getElementById('exec-spread-ok')?.checked || false
            },
            managementChecks: {
                noEarlyStop: document.getElementById('mgmt-no-early-stop')?.checked || false,
                partialRules: document.getElementById('mgmt-partial-rules')?.checked || false,
                exitRules: document.getElementById('mgmt-exit-rules')?.checked || false,
                noRevenge: document.getElementById('mgmt-no-revenge')?.checked || false
            },
            classification: document.getElementById('trade-classification')?.value || '',
            notes: document.getElementById('trade-notes')?.value || '',
            lessons: document.getElementById('trade-lessons')?.value || '',
            screenshot: document.getElementById('trade-screenshot')?.value || '',
            reviewedAt: new Date().toISOString()
        };

        // Update TradeCapture
        if (typeof window.TradeCapture !== 'undefined' && window.TradeCapture.completeTrade) {
            window.TradeCapture.completeTrade(trade.id, reviewData);
        }

        // Record to CircuitBreaker
        recordToCircuitBreaker(trade);

        // Clear current trade
        state.currentTrade = null;

        // Check for more pending
        setTimeout(checkForPendingReviews, 500);
    }

    function recordToCircuitBreaker(trade) {
        if (typeof window.CircuitBreaker === 'undefined' || !window.CircuitBreaker.recordTradeResult) {
            console.warn(`${MODULE_NAME}: CircuitBreaker not available`);
            return;
        }

        const outcome = determineOutcome(trade);
        const rMultiple = trade.oandaData?.rValue || calculateRMultiple(trade);
        const playbookId = trade.preTradeData?.playbook?.id || 'unknown';
        const pair = trade.preTradeData?.pair || trade.alertData?.pair || 'UNKNOWN';

        console.log(`${MODULE_NAME}: Recording to CircuitBreaker`, { playbookId, pair, outcome, rMultiple });

        try {
            window.CircuitBreaker.recordTradeResult(playbookId, pair, outcome, rMultiple);
        } catch (err) {
            console.error(`${MODULE_NAME}: Error recording to CircuitBreaker`, err);
        }
    }

    // ============================================
    // POLLING & STATUS
    // ============================================

    function startPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        
        checkForPendingReviews();
        state.pollTimer = setInterval(checkForPendingReviews, 5000);
    }

    function checkForPendingReviews() {
        if (typeof window.TradeCapture === 'undefined' || !window.TradeCapture.getTradesAwaitingReview) {
            return;
        }

        const pendingTrades = window.TradeCapture.getTradesAwaitingReview();

        if (pendingTrades && pendingTrades.length > 0) {
            const trade = pendingTrades[0];
            
            if (!state.currentTrade || state.currentTrade.id !== trade.id) {
                state.currentTrade = trade;
                showBanner(trade);
            }
        } else {
            if (state.notificationVisible) {
                hideBanner();
            }
            state.currentTrade = null;
        }
    }

    function handleTradeStatusChange(e) {
        const { trade, newStatus } = e.detail || {};
        
        if (newStatus === 'CLOSED_PENDING_REVIEW') {
            console.log(`${MODULE_NAME}: Trade closed, needs review`, trade?.id);
            checkForPendingReviews();
        }
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    /**
     * Derive trade direction from all available sources.
     * v1.2.0: Priority updated to check oandaData.direction first (broker truth)
     * Then: preTradeData > alertData > Oanda initialUnits sign
     * Oanda: positive initialUnits = LONG, negative = SHORT
     */
    function deriveDirection(trade) {
        // 1. Oanda direction (broker truth - stored by trade-capture v1.1.0)
        const oandaDir = trade.oandaData?.direction;
        if (oandaDir) return oandaDir.toLowerCase();

        // 2. Explicit direction from pre-trade or alert data
        const explicit = trade.preTradeData?.direction || trade.alertData?.direction || '';
        if (explicit) return explicit.toLowerCase();

        // 3. Derive from Oanda initialUnits sign
        const initialUnits = trade.oandaData?.initialUnits;
        if (initialUnits !== undefined && initialUnits !== null) {
            const units = parseFloat(initialUnits);
            if (!isNaN(units) && units !== 0) {
                return units > 0 ? 'long' : 'short';
            }
        }

        // 4. Fallback: try oandaData.units as secondary
        const units = trade.oandaData?.units;
        if (units !== undefined && units !== null) {
            const parsed = parseFloat(units);
            if (!isNaN(parsed) && parsed !== 0) {
                return parsed > 0 ? 'long' : 'short';
            }
        }

        // 5. Last resort - return empty, let form stay unset
        console.warn(`${MODULE_NAME}: Could not derive direction for trade`, trade.id);
        return '';
    }

    function formatDateTimeLocal(isoString) {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            // Format for datetime-local input: YYYY-MM-DDTHH:mm
            return date.toISOString().slice(0, 16);
        } catch (e) {
            return '';
        }
    }

    function normalisePair(pair) {
        if (!pair) return '';
        // Remove underscores, ensure uppercase
        return pair.replace('_', '').toUpperCase();
    }

    function mapPlaybookToType(playbook) {
        if (!playbook) return '';
        const name = (playbook.name || playbook.id || '').toLowerCase();
        
        if (name.includes('continuation')) return 'continuation';
        if (name.includes('pullback')) return 'pullback';
        if (name.includes('range') || name.includes('expansion')) return 'range-expansion';
        if (name.includes('reversion') || name.includes('mean')) return 'mean-reversion';
        
        return '';
    }

    function mapVolatilityContext(volState) {
        if (!volState) return '';
        const s = volState.toUpperCase();
        
        if (s === 'TREND' || s === 'EXPLODE') return 'expanding';
        if (s === 'QUIET') return 'contracting';
        if (s === 'MIXED') return 'divergent';
        
        return '';
    }

    function mapExitReason(trade) {
        const oanda = trade.oandaData || {};
        
        // Try to determine from realized P&L and how trade closed
        if (oanda.exitPrice && oanda.takeProfit) {
            const direction = deriveDirection(trade);
            const hitTP = direction === 'long' 
                ? oanda.exitPrice >= oanda.takeProfit
                : oanda.exitPrice <= oanda.takeProfit;
            if (hitTP) return 'TP_HIT';
        }
        
        if (oanda.exitPrice && oanda.stopLoss) {
            const direction = deriveDirection(trade);
            const hitSL = direction === 'long'
                ? oanda.exitPrice <= oanda.stopLoss
                : oanda.exitPrice >= oanda.stopLoss;
            if (hitSL) return 'SL_HIT';
        }
        
        // Check outcome
        const outcome = determineOutcome(trade);
        if (outcome === 'BREAKEVEN') return 'BREAKEVEN';
        if (outcome === 'WIN') return 'MANUAL_WIN';
        if (outcome === 'LOSS') return 'MANUAL_LOSS';
        
        return '';
    }

    function calculateRiskAmount(trade) {
        const units = trade.oandaData?.units || 0;
        const entry = trade.oandaData?.actualEntry || trade.preTradeData?.plannedEntry;
        const stop = trade.oandaData?.actualStop || trade.preTradeData?.plannedStop;
        
        if (!units || !entry || !stop) return '';
        
        const pipValue = Math.abs(entry - stop);
        // Rough estimate - this varies by pair
        const riskAmount = units * pipValue;
        
        return riskAmount.toFixed(2);
    }

    function calculateSlippage(trade) {
        const planned = trade.preTradeData?.plannedEntry;
        const actual = trade.oandaData?.actualEntry;
        
        if (!planned || !actual) return '';
        
        const pair = trade.preTradeData?.pair || '';
        const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
        const slippage = (actual - planned) * pipMultiplier;
        
        return slippage.toFixed(1);
    }

    function calculateRMultiple(trade) {
        const entry = trade.oandaData?.actualEntry || trade.preTradeData?.plannedEntry;
        const exit = trade.oandaData?.exitPrice;
        const stop = trade.oandaData?.actualStop || trade.preTradeData?.plannedStop;
        const direction = deriveDirection(trade);

        if (!entry || !exit || !stop) return null;

        const riskPips = Math.abs(entry - stop);
        if (riskPips === 0) return null;

        const resultPips = direction === 'long' 
            ? exit - entry 
            : entry - exit;

        return parseFloat((resultPips / riskPips).toFixed(2));
    }

    function formatMTF(alertData) {
        if (!alertData) return '';
        
        const mtf = alertData.mtfAlignment || alertData.mtf_alignment;
        if (mtf) return mtf;
        
        // Try to construct from individual fields
        const ema = alertData.emaMTF || '';
        const rsi = alertData.rsiMTF || '';
        
        if (ema && rsi) return `EMA: ${ema}, RSI: ${rsi}`;
        if (ema) return ema;
        if (rsi) return rsi;
        
        return '';
    }

    function determineOutcome(trade) {
        const realizedPL = trade.oandaData?.realisedPL || trade.oandaData?.realizedPL || 0;
        
        if (realizedPL > 0.5) return 'WIN';
        if (realizedPL < -0.5) return 'LOSS';
        return 'BREAKEVEN';
    }

    function showNotification(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        console.log(`${MODULE_NAME} [${type}]: ${message}`);
    }

    // ============================================
    // STYLES
    // ============================================

    function injectStyles() {
        if (document.getElementById('journal-autofill-styles')) return;

        const css = `
            /* Notification Banner */
            .journal-autofill-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 1000;
                background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%);
                border-bottom: 3px solid #3b82f6;
                padding: 12px 20px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                animation: slideDown 0.3s ease-out;
            }
            
            .journal-autofill-banner.hidden {
                display: none !important;
            }
            
            @keyframes slideDown {
                from { transform: translateY(-100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            .jaf-banner-content {
                max-width: 1200px;
                margin: 0 auto;
                display: flex;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
            }
            
            .jaf-banner-icon {
                font-size: 1.5rem;
            }
            
            .jaf-banner-text {
                flex: 1;
                min-width: 200px;
            }
            
            .jaf-banner-text strong {
                display: block;
                color: #60a5fa;
                font-size: 0.9rem;
            }
            
            .jaf-banner-text span {
                color: #e5e7eb;
                font-size: 1rem;
                font-weight: 600;
            }
            
            .jaf-banner-actions {
                display: flex;
                gap: 10px;
            }
            
            /* v1.2.0: Dismiss button styling */
            .jaf-dismiss-btn {
                background: #6b7280 !important;
                color: #fff !important;
                font-size: 0.75rem !important;
                padding: 4px 10px !important;
                border: none !important;
            }
            
            .jaf-dismiss-btn:hover {
                background: #9ca3af !important;
            }

            /* v1.2.0: Pending count badge */
            .jaf-count-badge {
                display: inline-block;
                background: #ef4444;
                color: #fff;
                font-size: 0.7rem;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 10px;
                margin-left: 8px;
                vertical-align: middle;
            }
            
            /* Highlight fields needing manual input */
            .needs-input {
                position: relative;
                background: rgba(245, 158, 11, 0.1) !important;
                border-radius: 6px;
                padding: 8px !important;
                border-left: 3px solid #f59e0b !important;
            }
            
            .needs-input::before {
                content: 'Required';
                position: absolute;
                top: -8px;
                right: 8px;
                font-size: 0.65rem;
                background: #f59e0b;
                color: #000;
                padding: 1px 6px;
                border-radius: 3px;
                font-weight: 600;
            }
            
            /* Auto-filled field indicator */
            .form-input:not(:placeholder-shown),
            .form-select:not([value=""]) {
                border-color: rgba(34, 197, 94, 0.4);
            }
        `;

        const style = document.createElement('style');
        style.id = 'journal-autofill-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.JournalAutofill = {
        VERSION: MODULE_VERSION,
        
        // Lifecycle
        init: init,
        
        // Manual controls
        checkForPendingReviews: checkForPendingReviews,
        populateFromTrade: (trade) => {
            state.currentTrade = trade;
            navigateToJournalAndFill();
        },
        
        // v1.2.0: Dismiss from external callers
        dismissCurrentTrade: dismissCurrentTrade,
        
        // Testing
        _getState: () => ({ ...state }),
        _getFieldMap: () => ({ ...FIELD_MAP })
    };

    // ============================================
    // AUTO-INIT
    // ============================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    console.log(`${MODULE_NAME} v${MODULE_VERSION} loaded`);

})();
