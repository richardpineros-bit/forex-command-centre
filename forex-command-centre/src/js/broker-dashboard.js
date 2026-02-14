/**
 * Broker Dashboard Integration
 * Links live broker data to Account Overview + Active Trades Panel
 * + Auto-Journal Engine + Review Queue (Phase 3-4)
 * Version: 1.8.0
 * 
 * v1.8.0 Changes:
 *   - ADD: _fetchUTCCState() fetches live UTCC state from Armed Dashboard API
 *   - ADD: processClosedTrade merges state API data as final fallback
 *   - ADD: Priority chain: AlertQueue > TradeCapture > UTCC State API
 *   - ADD: volBehaviour field stored on journal entries
 *   - NOTE: Zone/direction/MTF from state API once API receiver stores them
 *
 * v1.7.0 Changes:
 *   - ADD: _matchTradeCapture() - pulls UTCC + permission data from TradeCapture pending trades
 *   - ADD: processClosedTrade uses TradeCapture as fallback when AlertQueue has no match
 *   - ADD: _createNewEntry + _updateExistingEntry now store permission log fields
 *   - ADD: entryZone, volState, mtf fields populated from TradeCapture snapshot
 *
 * v1.6.0 Changes:
 *   - FIX: Auto-journal now sets 'exit' alongside 'exitPrice' for trade history compat
 *   - FIX: Auto-journal now sets 'rMultiple' alongside 'rValue' for R-multiple display
 *   - FIX: Auto-journal sets alertType='AUTO_CAPTURE' for source badge in trade history
 *   - NOTE: trade-journal.js broker:tradeclose listener disabled; this is now sole auto-journal
 *
 * v1.5.0 Changes:
 *   - FIX: renderBanner() skips innerHTML rebuild when review form is open
 *     (poll every 30s was destroying user input via full DOM rebuild)
 *   - ADD: Dismiss button on each review card + bulk dismiss
 *   - ADD: dismissReviewTrade() / bulkDismissReviewTrades() set status='complete'
 *     on ftcc_trades (the store getUnreviewedTrades actually checks)
 *
 * v1.4.0 Changes:
 *   - FIX: Direction derivation from Oanda initialUnits sign (positive=LONG, negative=SHORT)
 *   - FIX: All 'direction || long' hardcoded fallbacks replaced with _deriveDirection()
 *   - FIX: processClosedTrade now normalises direction before downstream functions
 *   - FIX: units field uses Math.abs() (shorts have negative initialUnits)
 *   - FIX: Review banner dirClass consistent with direction derivation
 *
 * v1.3.0 Changes:
 *   - NEW: Auto-Journal Engine - auto-creates journal entries from closed Oanda trades
 *   - NEW: Historical Backfill - catches trades closed while offline
 *   - NEW: Review Queue UI - persistent banner for trade review workflow
 *   - NEW: CircuitBreaker wiring on review completion
 *   - NEW: Governance gate - hasUnreviewedTrades() for post-session review blocks
 *   - NEW: AlertQueue enrichment - auto-matches UTCC score/grade from TradingView alerts
 *
 * v1.2.0 Changes:
 *   - Fix: Render into Dashboard widget (active-trades-grid) not just Journal tab
 *   - Now updates BOTH Dashboard widget AND Journal tab panel
 *
 * v1.1.1 Changes:
 *   - Fix: Pair display now strips underscores (AUD_CHF -> AUDCHF)
 *   - Fix: Trade card ID mapped correctly for inline renderer
 *
 * v1.1.0 Changes:
 *   - Active Trades panel now populated from Oanda open trades (primary source)
 *   - Journal trades used for enrichment (score, grade, playbook)
 *   - Overrides inline updateActiveTradeManagement() to merge both sources
 *   - Auto-refresh every 30s via existing polling
 * 
 * Dependencies: broker-manager.js, broker-oanda.js must be loaded first
 * Optional: alert-queue.js (for UTCC enrichment), circuit-breaker-module.js
 */

(function() {
    'use strict';
    
    // ============================================
    // CONSTANTS
    // ============================================

    const VERSION = '1.8.0';
    const STORAGE_KEY = 'ftcc_trades';
    const UTCC_STATE_URL = 'https://api.pineros.club/state';
    const SETTINGS_KEY = 'ftcc_settings';
    const BACKFILL_KEY = 'ftcc_journal_backfill_done';
    const ACCOUNT_ID = '001-011-11140823-001';

    // Trade statuses
    const STATUS = {
        OPEN: 'open',
        PENDING_REVIEW: 'closed_pending_review',
        COMPLETE: 'complete',
        CLOSED: 'closed'
    };

    // Icons (HTML entities for innerHTML, Unicode escapes for textContent)
    const ICONS = {
        clipboard: '&#x1F4CB;',
        warning: '&#x26A0;',
        checkmark: '&#x2714;',
        cross: '&#x2716;',
        hourglass: '&#x23F3;',
        target: '&#x1F3AF;',
        chart: '&#x1F4C8;',
        fire: '&#x1F525;',
        lock: '&#x1F512;'
    };

    // ============================================
    // DIRECTION DERIVATION (v1.4.0)
    // Oanda API has no .direction field on trades.
    // Positive initialUnits = LONG, Negative = SHORT.
    // ============================================

    function _deriveDirection(trade) {
        // 1. Explicit direction if already set (e.g. from mapOandaToCardShape or journal)
        if (trade.direction && trade.direction !== '') {
            return trade.direction.toLowerCase();
        }

        // 2. Derive from initialUnits sign (Oanda primary)
        const initialUnits = trade.initialUnits;
        if (initialUnits !== undefined && initialUnits !== null) {
            const parsed = parseFloat(initialUnits);
            if (!isNaN(parsed) && parsed !== 0) {
                return parsed > 0 ? 'long' : 'short';
            }
        }

        // 3. Fallback: units field
        const units = trade.units || trade.currentUnits;
        if (units !== undefined && units !== null) {
            const parsed = parseFloat(units);
            if (!isNaN(parsed) && parsed !== 0) {
                return parsed > 0 ? 'long' : 'short';
            }
        }

        // 4. Cannot determine - return empty (don't assume long)
        console.warn('[BrokerDashboard] Could not derive direction for trade', trade.id);
        return '';
    }

    // ============================================
    // BROKER DASHBOARD INTEGRATION
    // ============================================
    
    const BrokerDashboard = {
        
        // Cache of last known broker data
        lastBrokerData: null,
        
        // Polling interval (ms)
        pollInterval: 30000,
        
        // Poll timer reference
        pollTimer: null,
        
        // Primary account ID (cached after first fetch)
        primaryAccountId: null,
        
        /**
         * Initialise the broker dashboard integration
         */
        init: function() {
            console.log('[BrokerDashboard] Initialising v' + VERSION + '...');
            
            // Wait for BrokerManager to be available
            if (typeof BrokerManager === 'undefined') {
                console.log('[BrokerDashboard] Waiting for BrokerManager...');
                setTimeout(() => this.init(), 500);
                return;
            }
            
            // Override inline updateActiveTradeManagement
            this.overrideActiveTradeManagement();
            
            // Listen for broker events
            this.setupEventListeners();
            
            // Initial sync if broker already connected
            this.syncFromBroker();
            
            // Start polling for updates
            this.startPolling();

            // ---- Phase 3-4: Auto-Journal ----
            this.autoJournal.init();
            
            console.log('[BrokerDashboard] Initialised v' + VERSION);
        },
        
        /**
         * Override the inline updateActiveTradeManagement function
         */
        overrideActiveTradeManagement: function() {
            const self = this;
            
            if (typeof window.updateActiveTradeManagement === 'function') {
                window._originalUpdateActiveTradeManagement = window.updateActiveTradeManagement;
                console.log('[BrokerDashboard] Captured original updateActiveTradeManagement');
            }
            
            window.updateActiveTradeManagement = function() {
                if (self.isConnected() && self.lastBrokerData) {
                    self.updateActiveTrades(self.lastBrokerData.openTrades || []);
                    return;
                }
                if (typeof window._originalUpdateActiveTradeManagement === 'function') {
                    window._originalUpdateActiveTradeManagement();
                }
            };
            
            if (typeof window.updateActiveTradesWidget === 'function') {
                window._originalUpdateActiveTradesWidget = window.updateActiveTradesWidget;
                console.log('[BrokerDashboard] Captured original updateActiveTradesWidget');
            }
            
            window.updateActiveTradesWidget = function(trades) {
                if (self.isConnected() && self.lastBrokerData) {
                    self.updateActiveTrades(self.lastBrokerData.openTrades || []);
                    return;
                }
                if (typeof window._originalUpdateActiveTradesWidget === 'function') {
                    window._originalUpdateActiveTradesWidget(trades);
                }
            };
        },
        
        /**
         * Setup event listeners for broker events
         */
        setupEventListeners: function() {
            document.addEventListener('broker:connected', (e) => {
                console.log('[BrokerDashboard] Broker connected:', e.detail);
                this.syncFromBroker();
            });
            
            document.addEventListener('broker:disconnected', (e) => {
                console.log('[BrokerDashboard] Broker disconnected');
                this.lastBrokerData = null;
                this.updateActiveTrades([]);
                if (typeof updateDashboard === 'function') {
                    updateDashboard();
                }
            });
            
            document.addEventListener('broker:update', (e) => {
                console.log('[BrokerDashboard] Broker data updated');
                this.syncFromBroker();
            });
            
            // Trade close: refresh dashboard + trigger auto-journal
            window.addEventListener('broker:tradeclose', (e) => {
                console.log('[BrokerDashboard] Trade closed, refreshing + auto-journaling...');
                setTimeout(() => this.syncFromBroker(), 1000);

                // Auto-journal the closed trade
                if (e.detail && e.detail.trade) {
                    this.autoJournal.processClosedTrade(e.detail.trade);
                }
            });
        },
        
        /**
         * Start polling for broker updates
         */
        startPolling: function() {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
            this.pollTimer = setInterval(() => {
                this.syncFromBroker();
            }, this.pollInterval);
        },
        
        /**
         * Stop polling
         */
        stopPolling: function() {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        },
        
        /**
         * Sync dashboard from broker data
         */
        syncFromBroker: async function() {
            try {
                if (typeof BrokerManager === 'undefined') return;
                
                const status = BrokerManager.getConnectionStatus();
                const isConnected = status && status.oanda && status.oanda.connected;
                if (!isConnected) return;
                
                const accounts = BrokerManager.getAccounts();
                if (!accounts || accounts.length === 0) {
                    console.log('[BrokerDashboard] No accounts returned');
                    return;
                }
                
                const account = accounts[0];
                this.primaryAccountId = account.id;
                
                const positions = await BrokerManager.getPositions(account.id);
                const openTrades = await BrokerManager.getOpenTrades(account.id);
                
                this.lastBrokerData = {
                    account: account,
                    positions: positions || [],
                    openTrades: openTrades || [],
                    timestamp: new Date().toISOString()
                };
                
                this.updateAccountOverview(account, positions || []);
                this.updateActiveTrades(openTrades || []);
                
                document.dispatchEvent(new CustomEvent('brokerdashboard:updated', {
                    detail: this.lastBrokerData
                }));
                
            } catch (error) {
                console.error('[BrokerDashboard] Sync error:', error);
            }
        },
        
        // ============================================
        // ACTIVE TRADES PANEL (v1.1.0+)
        // ============================================
        
        normalisePair: function(instrument) {
            return (instrument || '').replace(/_/g, '');
        },
        
        mapOandaToCardShape: function(oandaTrade) {
            return {
                id: 'oanda_' + oandaTrade.id,
                pair: this.normalisePair(oandaTrade.instrument),
                direction: _deriveDirection(oandaTrade),
                entry: parseFloat(oandaTrade.entryPrice) || null,
                stop: parseFloat(oandaTrade.stopLoss) || null,
                tp: parseFloat(oandaTrade.takeProfit) || null,
                date: oandaTrade.openTime,
                status: 'open',
                oandaTradeId: oandaTrade.id,
                units: Math.abs(parseInt(oandaTrade.units || oandaTrade.initialUnits)),
                currentPrice: parseFloat(oandaTrade.currentPrice) || null,
                unrealizedPL: parseFloat(oandaTrade.unrealizedPL) || 0,
                trendScore: null,
                grade: null,
                playbook: null,
                tp1Hit: false,
                slMovedToBE: false,
                trailingActive: false,
                timeWarningAcknowledged: false,
                _source: 'oanda'
            };
        },
        
        findJournalMatch: function(oandaTrade, journalTrades) {
            const pair = this.normalisePair(oandaTrade.instrument);
            const direction = _deriveDirection(oandaTrade);
            
            let match = journalTrades.find(t => t.oandaTradeId === oandaTrade.id);
            if (match) return match;
            
            match = journalTrades.find(t => 
                t.status === 'open' && 
                (t.pair || '').replace(/_/g, '').toUpperCase() === pair.toUpperCase() && 
                t.direction === direction
            );
            
            return match || null;
        },
        
        updateActiveTrades: function(brokerTrades) {
            let journalTrades = [];
            try {
                journalTrades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            } catch (e) {
                console.error('[BrokerDashboard] Error loading journal trades:', e);
            }
            
            const journalOpenTrades = journalTrades.filter(t => t.status === 'open');
            const mergedTrades = [];
            const matchedJournalIds = new Set();
            
            brokerTrades.forEach(bt => {
                const card = this.mapOandaToCardShape(bt);
                const journalMatch = this.findJournalMatch(bt, journalOpenTrades);
                
                if (journalMatch) {
                    card.trendScore = journalMatch.trendScore || journalMatch.score || null;
                    card.grade = journalMatch.grade || null;
                    card.playbook = journalMatch.playbook || null;
                    card.tp1Hit = journalMatch.tp1Hit || false;
                    card.slMovedToBE = journalMatch.slMovedToBE || false;
                    card.trailingActive = journalMatch.trailingActive || false;
                    card.timeWarningAcknowledged = journalMatch.timeWarningAcknowledged || false;
                    if (!card.stop && journalMatch.stop) card.stop = journalMatch.stop;
                    if (!card.tp && journalMatch.tp) card.tp = journalMatch.tp;
                    matchedJournalIds.add(journalMatch.id || journalMatch.date);
                    card._source = 'merged';
                }
                
                mergedTrades.push(card);
            });
            
            journalOpenTrades.forEach(jt => {
                const jtId = jt.id || jt.date;
                if (!matchedJournalIds.has(jtId)) {
                    jt._source = 'journal';
                    mergedTrades.push(jt);
                }
            });
            
            this.renderActiveTrades(mergedTrades);
        },
        
        renderActiveTrades: function(openTrades) {
            // ---- DASHBOARD WIDGET ----
            const dashGrid = document.getElementById('active-trades-grid');
            const dashNoTrades = document.getElementById('no-active-trades-widget');
            const dashSummaryBar = document.getElementById('trade-summary-bar');
            
            if (dashGrid) {
                if (openTrades.length === 0) {
                    dashGrid.innerHTML = '';
                    dashGrid.style.display = 'none';
                    if (dashNoTrades) dashNoTrades.style.display = 'flex';
                    if (dashSummaryBar) dashSummaryBar.style.display = 'none';
                } else {
                    if (dashNoTrades) dashNoTrades.style.display = 'none';
                    dashGrid.style.display = 'grid';
                    if (dashSummaryBar) dashSummaryBar.style.display = 'flex';
                    
                    if (typeof window.renderActiveTradeCard === 'function') {
                        dashGrid.innerHTML = openTrades.map(t => window.renderActiveTradeCard(t)).join('');
                    } else {
                        dashGrid.innerHTML = openTrades.map(t => this.renderTradeCard(t)).join('');
                    }
                }
            }
            
            // ---- JOURNAL TAB PANEL ----
            const listEl = document.getElementById('active-trades-list');
            const noTradesEl = document.getElementById('no-active-trades');
            const quickActionsEl = document.getElementById('quick-actions-bar');
            
            if (listEl) {
                if (openTrades.length === 0) {
                    if (noTradesEl) noTradesEl.style.display = 'block';
                    if (quickActionsEl) quickActionsEl.style.display = 'none';
                } else {
                    if (noTradesEl) noTradesEl.style.display = 'none';
                    if (quickActionsEl) quickActionsEl.style.display = 'flex';
                    
                    if (typeof window.renderActiveTradeCard === 'function') {
                        listEl.innerHTML = openTrades.map(t => window.renderActiveTradeCard(t)).join('');
                    } else {
                        listEl.innerHTML = openTrades.map(t => this.renderTradeCard(t)).join('');
                    }
                }
            }
            
            // ---- SHARED: Update count badges ----
            const countEl = document.getElementById('open-positions-count');
            if (countEl) countEl.textContent = openTrades.length + ' Open';
            
            const widgetCountEl = document.getElementById('widget-open-count');
            if (widgetCountEl) widgetCountEl.textContent = openTrades.length + ' Open';
            
            // ---- SHARED: Protocol summary stats ----
            let awaitingTP1 = 0, atBreakeven = 0, trailing = 0, needReview = 0;
            
            openTrades.forEach(trade => {
                const ageHours = this.getTradeAgeHours(trade.date || trade.openTime);
                if (!trade.tp1Hit) awaitingTP1++;
                if (trade.slMovedToBE) atBreakeven++;
                if (trade.trailingActive) trailing++;
                if (ageHours >= 24 && !trade.timeWarningAcknowledged) needReview++;
            });
            
            const safeSet = function(id, val) {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            
            safeSet('trades-awaiting-tp1', awaitingTP1);
            safeSet('trades-at-breakeven', atBreakeven);
            safeSet('trades-trailing', trailing);
            safeSet('trades-needing-review', needReview);
            
            const reviewStat = document.getElementById('trades-needing-review-stat');
            if (reviewStat) {
                reviewStat.style.display = 'block';
                reviewStat.classList.toggle('protocol-stat-warning', needReview > 0);
            }
            
            if (typeof window.checkFridayWarning === 'function') {
                window.checkFridayWarning();
            }
            
            if (typeof window.updateTradeSummaryBar === 'function' && openTrades.length > 0) {
                window.updateTradeSummaryBar(openTrades);
            }

            // ---- Phase 3-4: Update review queue banner ----
            this.reviewQueue.renderBanner();
        },
        
        getTradeAgeHours: function(dateStr) {
            if (!dateStr) return 0;
            return (new Date() - new Date(dateStr)) / (1000 * 60 * 60);
        },
        
        formatTradeAge: function(hours) {
            if (hours < 1) return Math.round(hours * 60) + 'm';
            if (hours < 24) return Math.round(hours) + 'h';
            const days = Math.floor(hours / 24);
            const rem = Math.round(hours % 24);
            return days + 'd ' + rem + 'h';
        },
        
        renderTradeCard: function(trade) {
            const isLong = trade.direction === 'long';
            const dirClass = isLong ? 'long' : 'short';
            const ageHours = this.getTradeAgeHours(trade.date || trade.openTime);
            const ageStr = this.formatTradeAge(ageHours);
            const needsAttention = ageHours >= 24 || !trade.stop;
            
            const riskPips = trade.entry && trade.stop ? Math.abs(trade.entry - trade.stop) : 0;
            const rrText = trade.tp && riskPips > 0 
                ? (Math.abs(trade.tp - trade.entry) / riskPips).toFixed(1) 
                : '--';
            
            const plText = trade.unrealizedPL !== undefined && trade.unrealizedPL !== null
                ? (trade.unrealizedPL >= 0 ? '+' : '') + parseFloat(trade.unrealizedPL).toFixed(2)
                : '--';
            const plClass = trade.unrealizedPL >= 0 ? 'text-pass' : 'text-fail';
            
            let sourceBadge = '';
            if (trade._source === 'oanda') {
                sourceBadge = '<span class="broker-source-badge" style="font-size:0.65rem;color:var(--color-info,#60a5fa);margin-left:6px;">OANDA</span>';
            } else if (trade._source === 'merged') {
                sourceBadge = '<span class="broker-source-badge" style="font-size:0.65rem;color:var(--color-pass);margin-left:6px;">LINKED</span>';
            }
            
            const gradeBadge = trade.grade 
                ? '<span class="grade-badge">' + trade.grade + '</span>' 
                : '<span style="color:var(--text-muted);">--</span>';
            
            return '<div class="active-trade-card trade-' + dirClass + (needsAttention ? ' needs-attention' : '') + '">' +
                '<div class="trade-card-header">' +
                    '<span class="trade-card-pair">' + (trade.pair || '--') + sourceBadge + '</span>' +
                    '<span class="trade-card-direction ' + dirClass + '">' + (isLong ? '&#x25B2; LONG' : '&#x25BC; SHORT') + '</span>' +
                '</div>' +
                '<div class="trade-card-stats">' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value">' + (trade.entry || '--') + '</div>' +
                        '<div class="trade-card-stat-label">Entry</div>' +
                    '</div>' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value" style="color:var(--color-fail);">' + (trade.stop || '--') + '</div>' +
                        '<div class="trade-card-stat-label">Stop</div>' +
                    '</div>' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value" style="color:var(--color-pass);">' + (trade.tp || '--') + '</div>' +
                        '<div class="trade-card-stat-label">TP</div>' +
                    '</div>' +
                '</div>' +
                '<div class="trade-card-stats">' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value">' + rrText + 'R</div>' +
                        '<div class="trade-card-stat-label">Target R:R</div>' +
                    '</div>' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value">' + (trade.trendScore || '--') + '</div>' +
                        '<div class="trade-card-stat-label">Score</div>' +
                    '</div>' +
                    '<div class="trade-card-stat">' +
                        '<div class="trade-card-stat-value">' + gradeBadge + '</div>' +
                        '<div class="trade-card-stat-label">Grade</div>' +
                    '</div>' +
                '</div>' +
                '<div class="trade-card-footer">' +
                    '<span class="trade-age' + (ageHours >= 48 ? ' age-critical' : ageHours >= 24 ? ' age-warning' : '') + '">' + ageStr + '</span>' +
                    '<span class="trade-pl ' + plClass + '">' + plText + '</span>' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // ACCOUNT OVERVIEW (unchanged from v1.0)
        // ============================================
        
        updateAccountOverview: function(account, positions) {
            const balanceEl = document.getElementById('dash-balance');
            if (balanceEl && account.balance !== undefined) {
                const formattedBalance = this.formatCurrency(account.balance, account.currency);
                balanceEl.textContent = formattedBalance;
                
                if (!balanceEl.querySelector('.live-indicator')) {
                    const indicator = document.createElement('span');
                    indicator.className = 'live-indicator';
                    indicator.style.cssText = 'display: inline-block; width: 8px; height: 8px; background: var(--color-pass); border-radius: 50%; margin-left: 6px; animation: pulse 2s infinite;';
                    indicator.title = 'Live from ' + (account.broker || 'broker').toUpperCase();
                    balanceEl.appendChild(indicator);
                }
            }
            
            const balanceLabel = balanceEl?.parentElement?.querySelector('.stat-label');
            if (balanceLabel) {
                const currency = account.currency || 'AUD';
                balanceLabel.innerHTML = 'Balance (' + currency + ') <span style="font-size: 0.7rem; color: var(--color-pass);">LIVE</span>';
            }
            
            const openEl = document.getElementById('dash-open-positions');
            if (openEl) {
                openEl.textContent = positions.length;
            }
            
            const unrealisedPL = account.unrealizedPL || positions.reduce((sum, p) => sum + (p.unrealizedPL || 0), 0);
            
            this.syncToSettings(account, positions);
            this.updatePeakAndDrawdown(account);
        },
        
        syncToSettings: function(account, positions) {
            try {
                const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
                const currentBalance = settings.accountBalance || 0;
                const brokerBalance = account.balance || 0;
                
                if (Math.abs(currentBalance - brokerBalance) > 1) {
                    settings.accountBalance = brokerBalance;
                    if (brokerBalance > (settings.peakBalance || 0)) {
                        settings.peakBalance = brokerBalance;
                    }
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
                    console.log('[BrokerDashboard] Settings synced with broker balance:', brokerBalance);
                }
            } catch (error) {
                console.error('[BrokerDashboard] Error syncing to settings:', error);
            }
        },
        
        updatePeakAndDrawdown: function(account) {
            try {
                const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
                const balance = account.balance || settings.accountBalance || 0;
                const peak = settings.peakBalance || balance;
                const drawdown = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
                
                const peakEl = document.getElementById('dash-peak');
                if (peakEl) {
                    peakEl.textContent = this.formatCurrency(peak, account.currency);
                }
                
                const drawdownEl = document.getElementById('dash-drawdown');
                if (drawdownEl) {
                    drawdownEl.textContent = drawdown.toFixed(1) + '%';
                    drawdownEl.className = 'stat-value ' + this.getDrawdownClass(drawdown);
                }
                
                this.updateDrawdownIndicator(drawdown);
            } catch (error) {
                console.error('[BrokerDashboard] Error updating peak/drawdown:', error);
            }
        },
        
        updateDrawdownIndicator: function(drawdown) {
            const statusEl = document.getElementById('drawdown-status');
            if (!statusEl) return;
            
            let level, text;
            if (drawdown < 5) {
                level = 'normal'; text = 'NORMAL';
            } else if (drawdown < 10) {
                level = 'caution'; text = 'CAUTION';
            } else if (drawdown < 15) {
                level = 'stop'; text = 'STOP';
            } else {
                level = 'emergency'; text = 'EMERGENCY';
            }
            
            statusEl.className = 'drawdown-indicator ' + level;
            statusEl.innerHTML = '<span class="drawdown-dot"></span><span>' + text + '</span>';
        },
        
        getDrawdownClass: function(drawdown) {
            if (drawdown < 5) return 'text-pass';
            if (drawdown < 10) return 'text-warning';
            return 'text-fail';
        },
        
        formatCurrency: function(value, currency) {
            const curr = currency || 'AUD';
            const symbols = { 'AUD': '$', 'USD': '$', 'EUR': '\u20AC', 'GBP': '\u00A3', 'JPY': '\u00A5' };
            const symbol = symbols[curr] || '$';
            return symbol + value.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        
        isLive: function() {
            return this.lastBrokerData !== null && typeof BrokerManager !== 'undefined';
        },
        
        isConnected: function() {
            const status = typeof BrokerManager !== 'undefined' ? BrokerManager.getConnectionStatus() : null;
            return status && status.oanda && status.oanda.connected;
        },
        
        getLastData: function() {
            return this.lastBrokerData;
        },
        
        refresh: function() {
            return this.syncFromBroker();
        },

        // ============================================
        // PHASE 3: AUTO-JOURNAL ENGINE (NEW in v1.3.0)
        // ============================================

        autoJournal: {

            // Track processed trade IDs to prevent duplicates within session
            _processedIds: new Set(),

            /**
             * Initialise auto-journal: backfill + listen
             */
            init: function() {
                console.log('[AutoJournal] Initialising...');

                // v1.6.0: One-time migration to normalise field names
                this._migrateFields();

                // Run historical backfill (catches trades closed while offline)
                setTimeout(() => this.backfillHistory(), 3000);

                // Listen for trade closure events (backup listener in case
                // the one in setupEventListeners misses due to load order)
                window.addEventListener('broker:tradeclose', (e) => {
                    if (e.detail && e.detail.trade) {
                        this.processClosedTrade(e.detail.trade);
                    }
                });

                console.log('[AutoJournal] Ready');
            },

            /**
             * Process a single closed trade into a journal entry
             * Called on broker:tradeclose event
             * @param {object} trade - Normalised trade from BrokerManager
             */
            processClosedTrade: async function(trade) {
                if (!trade || !trade.id) return;

                // Deduplicate within session
                if (this._processedIds.has(trade.id)) {
                    console.log('[AutoJournal] Trade ' + trade.id + ' already processed this session');
                    return;
                }

                // Check if already in journal
                if (this._findExistingEntry(trade.id)) {
                    console.log('[AutoJournal] Trade ' + trade.id + ' already in journal');
                    this._processedIds.add(trade.id);
                    return;
                }

                console.log('[AutoJournal] Processing closed trade ' + trade.id + '...');

                // Enrich: fetch full trade details if missing key fields
                let enrichedTrade = trade;
                if (!trade.exitPrice || !trade.realizedPL) {
                    enrichedTrade = await this._enrichFromBroker(trade.id);
                    if (!enrichedTrade) {
                        console.warn('[AutoJournal] Could not enrich trade ' + trade.id + ', using raw data');
                        enrichedTrade = trade;
                    }
                }

                // v1.4.0: Normalise direction from initialUnits BEFORE downstream use
                if (!enrichedTrade.direction || enrichedTrade.direction === '') {
                    enrichedTrade.direction = _deriveDirection(enrichedTrade);
                    console.log('[AutoJournal] Derived direction for trade ' + trade.id + ': ' + enrichedTrade.direction);
                }

                // Try to match UTCC alert data
                let alertData = await this._matchAlertQueue(enrichedTrade);

                // v1.7.0: Check TradeCapture for UTCC + permission data (fallback)
                let tradeCaptureData = this._matchTradeCapture(enrichedTrade);
                if (!alertData && tradeCaptureData) {
                    // Promote TradeCapture data to alertData shape for downstream compat
                    alertData = tradeCaptureData;
                }

                // v1.8.0: Fetch live UTCC state from Armed Dashboard API
                var utccState = await this._fetchUTCCState(enrichedTrade.instrument);

                // Merge: AlertQueue/TradeCapture get priority, UTCC state fills gaps
                if (utccState) {
                    if (!alertData) {
                        alertData = {
                            score: utccState.score,
                            tier: utccState.alertType,
                            criteriaPass: utccState.criteria,
                            entryZone: utccState.entryZone,
                            mtfAlignment: utccState.mtf ? (utccState.mtf + '/3') : null
                        };
                    } else {
                        // Fill gaps only
                        if (!alertData.score && utccState.score) alertData.score = utccState.score;
                        if (!alertData.tier && utccState.alertType) alertData.tier = utccState.alertType;
                        if (!alertData.entryZone && utccState.entryZone) alertData.entryZone = utccState.entryZone;
                        if (!alertData.criteriaPass && utccState.criteria) alertData.criteriaPass = utccState.criteria;
                    }

                    // Enrich permission data from state (most current source)
                    if (!tradeCaptureData) tradeCaptureData = {};
                    if (!tradeCaptureData.marketRegime && utccState.regime) tradeCaptureData.marketRegime = utccState.regime;
                    if (!tradeCaptureData.permissionState && utccState.permission) tradeCaptureData.permissionState = utccState.permission;
                    if (!tradeCaptureData.volState && utccState.volState) tradeCaptureData.volState = utccState.volState;
                    if (!tradeCaptureData.volBehaviour && utccState.volBehaviour) tradeCaptureData.volBehaviour = utccState.volBehaviour;
                }

                // Try to match existing open journal entry (pre-logged via EXECUTE flow)
                const existingEntry = this._findLinkedEntry(enrichedTrade);

                // Create or update journal entry
                if (existingEntry) {
                    this._updateExistingEntry(existingEntry, enrichedTrade, alertData, tradeCaptureData);
                } else {
                    this._createNewEntry(enrichedTrade, alertData, tradeCaptureData);
                }

                this._processedIds.add(trade.id);

                // Fire event for ServerStorage to pick up
                window.dispatchEvent(new CustomEvent('journal:entry', {
                    detail: { tradeId: trade.id, action: 'auto_journal' }
                }));

                // Refresh review queue UI
                BrokerDashboard.reviewQueue.renderBanner();

                console.log('[AutoJournal] Trade ' + trade.id + ' journalled');
            },

            /**
             * Historical backfill: fetch recent closed trades and journal any missing
             */
            backfillHistory: async function() {
                try {
                    if (typeof BrokerManager === 'undefined') return;
                    if (!BrokerDashboard.isConnected()) {
                        console.log('[AutoJournal] Not connected, skipping backfill');
                        return;
                    }

                    const accId = BrokerDashboard.primaryAccountId || ACCOUNT_ID;

                    console.log('[AutoJournal] Running historical backfill...');

                    // Fetch last 50 closed trades
                    const history = await BrokerManager.getTradeHistory(accId, { count: 50 });

                    if (!history || history.length === 0) {
                        console.log('[AutoJournal] No trade history found');
                        return;
                    }

                    let created = 0;
                    let skipped = 0;

                    for (const trade of history) {
                        if (this._findExistingEntry(trade.id)) {
                            skipped++;
                            continue;
                        }

                        // Enrich with full details
                        let enriched = trade;
                        if (!trade.exitPrice && trade.id) {
                            const full = await this._enrichFromBroker(trade.id);
                            if (full) enriched = full;
                        }

                        // v1.4.0: Normalise direction from initialUnits
                        if (!enriched.direction || enriched.direction === '') {
                            enriched.direction = _deriveDirection(enriched);
                        }

                        const alertData = null; // Can't match alerts retroactively (expired)
                        this._createNewEntry(enriched, alertData, null);
                        this._processedIds.add(trade.id);
                        created++;
                    }

                    if (created > 0) {
                        // Trigger save
                        window.dispatchEvent(new CustomEvent('journal:entry', {
                            detail: { action: 'backfill', count: created }
                        }));

                        // Refresh review queue
                        BrokerDashboard.reviewQueue.renderBanner();
                    }

                    console.log('[AutoJournal] Backfill complete: ' + created + ' created, ' + skipped + ' already existed');

                } catch (e) {
                    console.error('[AutoJournal] Backfill error:', e);
                }
            },

            // ---- Internal helpers ----

            /**
             * v1.6.0: One-time field normalisation for existing trades
             * Maps exitPrice->exit, rValue->rMultiple, sets alertType
             */
            _migrateFields: function() {
                try {
                    var trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    var changed = 0;

                    trades.forEach(function(t) {
                        if (t.exitPrice && !t.exit) { t.exit = t.exitPrice; changed++; }
                        if (t.rValue && !t.rMultiple) { t.rMultiple = t.rValue; changed++; }
                        if (t.autoJournalled && !t.alertType) { t.alertType = 'AUTO_CAPTURE'; changed++; }
                        if (t.autoJournalled && t.autoCapture === undefined) { t.autoCapture = true; changed++; }
                    });

                    if (changed > 0) {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
                        console.log('[AutoJournal] Migrated ' + changed + ' field(s) across existing trades');
                    }
                } catch (e) {
                    console.warn('[AutoJournal] Migration error:', e);
                }
            },

            /**
             * Fetch full trade details from Oanda via adapter
             */
            _enrichFromBroker: async function(tradeId) {
                try {
                    const accId = BrokerDashboard.primaryAccountId || ACCOUNT_ID;

                    // Try getTradeById on BrokerManager first
                    if (typeof BrokerManager.getTradeById === 'function') {
                        return await BrokerManager.getTradeById(accId, tradeId);
                    }

                    // Fallback: access adapter directly
                    const adapters = BrokerManager._adapters || BrokerManager.adapters;
                    if (adapters) {
                        for (const adapter of (adapters.values ? adapters.values() : Object.values(adapters))) {
                            if (adapter.getTradeById) {
                                return await adapter.getTradeById(accId, tradeId);
                            }
                        }
                    }

                    return null;
                } catch (e) {
                    console.warn('[AutoJournal] Enrich failed for trade ' + tradeId + ':', e.message);
                    return null;
                }
            },

            /**
             * Match against AlertQueue for UTCC score/grade
             */
            _matchAlertQueue: async function(trade) {
                try {
                    if (typeof AlertQueue === 'undefined' || !AlertQueue.findMatchingAlert) {
                        return null;
                    }

                    const pair = (trade.instrument || '').replace(/_/g, '');
                    const direction = _deriveDirection(trade);

                    // Look for alert within 4 hours of trade open time
                    const alert = await AlertQueue.findMatchingAlert(pair, direction, 240);

                    if (alert) {
                        console.log('[AutoJournal] Matched alert for ' + pair + ' ' + direction, alert.id);
                        return {
                            alertId: alert.id,
                            score: alert.utcc ? alert.utcc.score : null,
                            tier: alert.utcc ? alert.utcc.tier : null,
                            criteriaPass: alert.utcc ? alert.utcc.criteriaPass : null,
                            entryZone: alert.utcc ? alert.utcc.entryZone : null,
                            criteriaMet: alert.utcc ? alert.utcc.criteriaMet : null
                        };
                    }

                    return null;
                } catch (e) {
                    console.warn('[AutoJournal] AlertQueue match error:', e.message);
                    return null;
                }
            },

            /**
             * Match against TradeCapture pending trades for UTCC data
             * Fallback when AlertQueue has no match
             */
            _matchTradeCapture: function(trade) {
                try {
                    if (typeof TradeCapture === 'undefined' || !TradeCapture.getAllPendingTrades) {
                        return null;
                    }

                    var pair = (trade.instrument || '').replace(/_/g, '').toUpperCase();
                    var direction = _deriveDirection(trade);
                    var allTrades = TradeCapture.getAllPendingTrades();

                    // Match by oandaTradeId first
                    var match = null;
                    for (var i = 0; i < allTrades.length; i++) {
                        if (allTrades[i].oandaTradeId === String(trade.id)) {
                            match = allTrades[i];
                            break;
                        }
                    }

                    // Fallback: match by pair + direction
                    if (!match) {
                        for (var j = 0; j < allTrades.length; j++) {
                            var pt = allTrades[j];
                            if (pt.preTradeData &&
                                (pt.preTradeData.pair || '').replace(/_/g, '').toUpperCase() === pair &&
                                pt.preTradeData.direction === direction) {
                                match = pt;
                                break;
                            }
                        }
                    }

                    if (match && match.preTradeData) {
                        var pre = match.preTradeData;
                        var alert = match.alertData;
                        console.log('[AutoJournal] Matched TradeCapture for ' + pair + ': score=' + (pre.utccScore || alert?.score || '--'));
                        return {
                            score: alert?.score || pre.utccScore || null,
                            tier: alert?.tier || null,
                            criteriaPass: alert?.criteriaPass || null,
                            entryZone: alert?.entryZone || pre.entryZone || null,
                            volState: pre.volState || null,
                            mtfAlignment: pre.mtfAlignment || null,
                            grade: pre.grade || null,
                            playbook: pre.playbook ? pre.playbook.name : null,
                            // Permission log
                            marketRegime: pre.marketRegime || null,
                            structureQuality: pre.structureQuality || null,
                            volContext: pre.volContext || null,
                            sessionWindow: pre.sessionWindow || null,
                            permissionState: pre.permissionState || null,
                            permissionReason: pre.permissionReason || null,
                            permissionEvidence: pre.permissionEvidence || null
                        };
                    }

                    return null;
                } catch (e) {
                    console.warn('[AutoJournal] TradeCapture match error:', e.message);
                    return null;
                }
            },

            /**
             * v1.8.0: Auto-derive trade grade from UTCC data + outcome
             * A+ = score>=90 + HOT/OPT zone + WIN
             * A  = score>=85 + good zone + WIN, OR score>=90 + LOSS (good setup, bad luck)
             * B  = score>=80 + any zone + any outcome (met minimum standard)
             * C  = score>=75 OR missing UTCC data (marginal or unvalidated)
             * D  = score<75 OR permission was STAND_DOWN/OVERRIDE (should not have traded)
             */
            _deriveGrade: function(score, entryZone, outcome, permission) {
                var s = parseInt(score) || 0;
                var zone = (entryZone || '').toUpperCase();
                var result = (outcome || '').toUpperCase();
                var perm = (permission || '').toUpperCase();
                var goodZone = zone === 'HOT' || zone === 'OPTIMAL';

                // D: violated permission or very low score
                if (perm === 'STAND_DOWN' || perm === 'OVERRIDE' || perm === 'VIOLATION') return 'D';
                if (s > 0 && s < 75) return 'D';

                // A+: exceptional setup + good execution + win
                if (s >= 90 && goodZone && result === 'WIN') return 'A+';

                // A: strong setup + win, or exceptional setup that lost (good process)
                if (s >= 85 && goodZone && result === 'WIN') return 'A';
                if (s >= 90 && result === 'LOSS') return 'A';

                // B: meets standard threshold
                if (s >= 80) return 'B';

                // C: marginal or no UTCC data
                if (s >= 75) return 'C';
                if (s === 0) return 'C';

                return 'C';
            },

            /**
             * v1.8.0: Fetch live UTCC state from Armed Dashboard API
             * Returns state data for a specific pair, or null
             */
            _fetchUTCCState: async function(pair) {
                try {
                    var cleanPair = (pair || '').replace(/_/g, '').toUpperCase();
                    if (!cleanPair) return null;

                    var response = await fetch(UTCC_STATE_URL, { method: 'GET', cache: 'no-cache' });
                    if (!response.ok) return null;

                    var data = await response.json();
                    var allPairs = (data.pairs || []).concat(data.candidates || []);

                    for (var i = 0; i < allPairs.length; i++) {
                        var p = (allPairs[i].pair || '').replace(/_/g, '').toUpperCase();
                        if (p === cleanPair) {
                            console.log('[AutoJournal] UTCC State match for ' + cleanPair + ': score=' + allPairs[i].score + ', regime=' + allPairs[i].primary);
                            return {
                                score: allPairs[i].score || null,
                                regime: allPairs[i].primary || null,
                                permission: allPairs[i].permission || null,
                                alertType: allPairs[i].alertType || null,
                                maxRisk: allPairs[i].maxRisk || null,
                                session: allPairs[i].session || null,
                                riskState: allPairs[i].riskState || null,
                                direction: allPairs[i].direction || null,
                                entryZone: allPairs[i].entryZone || allPairs[i].entry || null,
                                mtf: allPairs[i].mtf || null,
                                criteria: allPairs[i].criteria || null,
                                volState: allPairs[i].volState || allPairs[i].vol_state || null,
                                volBehaviour: allPairs[i].volBehaviour || allPairs[i].vol_behaviour || null,
                                timestamp: allPairs[i].timestamp || null
                            };
                        }
                    }

                    console.log('[AutoJournal] No UTCC state for ' + cleanPair);
                    return null;
                } catch (e) {
                    console.warn('[AutoJournal] UTCC state fetch error:', e.message);
                    return null;
                }
            },

            /**
             * Check if a journal entry already exists for this Oanda trade ID
             */
            _findExistingEntry: function(oandaTradeId) {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    return trades.find(t => t.oandaTradeId === String(oandaTradeId));
                } catch (e) {
                    return null;
                }
            },

            /**
             * Find a linked open journal entry (from EXECUTE flow or manual pre-log)
             */
            _findLinkedEntry: function(trade) {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    const pair = (trade.instrument || '').replace(/_/g, '').toUpperCase();
                    const direction = _deriveDirection(trade);

                    // Match by oandaTradeId
                    let match = trades.find(t =>
                        t.oandaTradeId === String(trade.id) && t.status === 'open'
                    );
                    if (match) return match;

                    // Fuzzy match: same pair + direction + still open
                    match = trades.find(t =>
                        t.status === 'open' &&
                        (t.pair || '').replace(/_/g, '').toUpperCase() === pair &&
                        t.direction === direction
                    );

                    return match || null;
                } catch (e) {
                    return null;
                }
            },

            /**
             * Update an existing journal entry with closed trade data
             */
            _updateExistingEntry: function(entry, trade, alertData, tradeCaptureData) {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    const idx = trades.findIndex(t => (t.id || t.date) === (entry.id || entry.date));
                    if (idx === -1) return;

                    // Update with broker close data
                    trades[idx].status = STATUS.PENDING_REVIEW;
                    trades[idx].oandaTradeId = String(trade.id);
                    trades[idx].exitPrice = trade.exitPrice || null;
                    trades[idx].exit = trade.exitPrice || null;
                    trades[idx].closeTime = trade.closeTime || new Date().toISOString();
                    trades[idx].realizedPL = trade.realizedPL || 0;
                    trades[idx].financing = trade.financing || 0;
                    trades[idx].netPL = trade.netPL || (trade.realizedPL || 0) + (trade.financing || 0);
                    trades[idx].duration = trade.duration || null;
                    trades[idx].rValue = trade.rValue || null;
                    trades[idx].rMultiple = trade.rValue || null;
                    trades[idx].outcome = trade.outcome || this._classifyOutcome(trade.realizedPL);
                    trades[idx].autoJournalled = true;
                    trades[idx].autoJournalledAt = new Date().toISOString();

                    // Enrich with alert data if we have it and entry is missing UTCC
                    if (alertData && !trades[idx].trendScore) {
                        trades[idx].trendScore = alertData.score;
                        trades[idx].utccTier = alertData.tier;
                        trades[idx].utccCriteriaPass = alertData.criteriaPass;
                        trades[idx].entryZone = alertData.entryZone;
                        trades[idx].alertId = alertData.alertId;
                    }

                    // Enrich with TradeCapture permission data if available
                    if (tradeCaptureData) {
                        if (!trades[idx].marketRegime && tradeCaptureData.marketRegime) trades[idx].marketRegime = tradeCaptureData.marketRegime;
                        if (!trades[idx].structureQuality && tradeCaptureData.structureQuality) trades[idx].structureQuality = tradeCaptureData.structureQuality;
                        if (!trades[idx].volContext && tradeCaptureData.volContext) trades[idx].volContext = tradeCaptureData.volContext;
                        if (!trades[idx].sessionWindow && tradeCaptureData.sessionWindow) trades[idx].sessionWindow = tradeCaptureData.sessionWindow;
                        if (!trades[idx].permissionState && tradeCaptureData.permissionState) trades[idx].permissionState = tradeCaptureData.permissionState;
                        if (!trades[idx].permissionReason && tradeCaptureData.permissionReason) trades[idx].permissionReason = tradeCaptureData.permissionReason;
                        if (!trades[idx].permissionEvidence && tradeCaptureData.permissionEvidence) trades[idx].permissionEvidence = tradeCaptureData.permissionEvidence;
                        if (!trades[idx].entryZone && tradeCaptureData.entryZone) trades[idx].entryZone = tradeCaptureData.entryZone;
                        if (!trades[idx].volState && tradeCaptureData.volState) trades[idx].volState = tradeCaptureData.volState;
                        if (!trades[idx].mtf && tradeCaptureData.mtfAlignment) trades[idx].mtf = tradeCaptureData.mtfAlignment;
                    }

                    // v1.8.0: Auto-grade if not already graded
                    if (!trades[idx].grade || trades[idx].grade === 'DIS') {
                        var autoGrade = this._deriveGrade(
                            trades[idx].trendScore,
                            trades[idx].entryZone,
                            trades[idx].outcome,
                            trades[idx].permissionState
                        );
                        if (autoGrade) trades[idx].grade = autoGrade;
                    }

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
                    console.log('[AutoJournal] Updated existing entry for trade ' + trade.id);

                } catch (e) {
                    console.error('[AutoJournal] Update entry error:', e);
                }
            },

            /**
             * Create a new journal entry from broker data
             */
            _createNewEntry: function(trade, alertData, tradeCaptureData) {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    const pair = (trade.instrument || '').replace(/_/g, '').toUpperCase();

                    const entry = {
                        id: 'auto_' + trade.id + '_' + Date.now(),
                        oandaTradeId: String(trade.id),
                        status: STATUS.PENDING_REVIEW,
                        pair: pair,
                        direction: _deriveDirection(trade),
                        entry: trade.entryPrice || null,
                        stop: trade.stopLoss || null,
                        tp: trade.takeProfit || null,
                        exitPrice: trade.exitPrice || null,
                        exit: trade.exitPrice || null,
                        date: trade.openTime || new Date().toISOString(),
                        closeTime: trade.closeTime || new Date().toISOString(),
                        units: Math.abs(parseFloat(trade.units || trade.initialUnits || 0)),
                        realizedPL: trade.realizedPL || 0,
                        financing: trade.financing || 0,
                        netPL: trade.netPL || (trade.realizedPL || 0) + (trade.financing || 0),
                        duration: trade.duration || null,
                        rValue: trade.rValue || null,
                        rMultiple: trade.rValue || null,
                        outcome: trade.outcome || this._classifyOutcome(trade.realizedPL),

                        // UTCC data (from alert match or empty for manual review)
                        trendScore: alertData ? alertData.score : null,
                        grade: this._deriveGrade(
                            alertData ? alertData.score : null,
                            alertData ? alertData.entryZone : null,
                            trade.outcome || this._classifyOutcome(trade.realizedPL),
                            tradeCaptureData ? tradeCaptureData.permissionState : null
                        ),
                        playbook: null,
                        utccTier: alertData ? alertData.tier : null,
                        utccCriteriaPass: alertData ? alertData.criteriaPass : null,
                        entryZone: alertData ? alertData.entryZone : null,
                        volState: alertData ? alertData.volState : null,
                        volBehaviour: (tradeCaptureData ? tradeCaptureData.volBehaviour : null) || null,
                        mtf: alertData ? alertData.mtfAlignment : null,
                        alertId: alertData ? alertData.alertId : null,
                        alertType: 'AUTO_CAPTURE',

                        // Permission Log (from TradeCapture pre-trade snapshot)
                        marketRegime: tradeCaptureData ? tradeCaptureData.marketRegime : null,
                        structureQuality: tradeCaptureData ? tradeCaptureData.structureQuality : null,
                        volContext: tradeCaptureData ? tradeCaptureData.volContext : null,
                        sessionWindow: tradeCaptureData ? tradeCaptureData.sessionWindow : null,
                        permissionState: tradeCaptureData ? tradeCaptureData.permissionState : null,
                        permissionReason: tradeCaptureData ? tradeCaptureData.permissionReason : null,
                        permissionEvidence: tradeCaptureData ? tradeCaptureData.permissionEvidence : null,

                        // Review fields (to be filled by trader)
                        executionQuality: null,
                        lessonsLearned: '',
                        reviewedAt: null,

                        // Management fields
                        tp1Hit: false,
                        slMovedToBE: false,
                        trailingActive: false,
                        timeWarningAcknowledged: false,

                        // Meta
                        autoJournalled: true,
                        autoJournalledAt: new Date().toISOString(),
                        _source: 'auto_journal'
                    };

                    trades.push(entry);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
                    console.log('[AutoJournal] Created entry for trade ' + trade.id + ' (' + pair + ' ' + entry.direction + ')');

                } catch (e) {
                    console.error('[AutoJournal] Create entry error:', e);
                }
            },

            /**
             * Classify outcome from P&L
             */
            _classifyOutcome: function(realizedPL) {
                const pl = parseFloat(realizedPL) || 0;
                if (pl > 0.5) return 'WIN';
                if (pl < -0.5) return 'LOSS';
                return 'BREAKEVEN';
            }
        },

        // ============================================
        // PHASE 4: REVIEW QUEUE UI (NEW in v1.3.0)
        // ============================================

        reviewQueue: {

            // Currently expanded review trade ID
            _activeReviewId: null,

            /**
             * Get all trades pending review
             * @returns {Array}
             */
            getUnreviewedTrades: function() {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    return trades.filter(t => t.status === STATUS.PENDING_REVIEW);
                } catch (e) {
                    return [];
                }
            },

            /**
             * Check if there are unreviewed trades (governance gate)
             * @returns {boolean}
             */
            hasUnreviewedTrades: function() {
                return this.getUnreviewedTrades().length > 0;
            },

            /**
             * Render the persistent review queue banner
             * Injected at top of Journal tab
             */
            renderBanner: function() {
                const pending = this.getUnreviewedTrades();
                let banner = document.getElementById('review-queue-banner');

                // Remove banner if nothing to review
                if (pending.length === 0) {
                    if (banner) banner.style.display = 'none';
                    return;
                }

                // Create banner container if it doesn't exist
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'review-queue-banner';

                    // Insert at top of journal tab content
                    const journalTab = document.getElementById('tab-journal');
                    if (journalTab) {
                        journalTab.insertBefore(banner, journalTab.firstChild);
                    } else {
                        // Fallback: insert before active trades list
                        const activeList = document.getElementById('active-trades-list');
                        if (activeList && activeList.parentNode) {
                            activeList.parentNode.insertBefore(banner, activeList);
                        }
                    }
                }

                banner.style.display = 'block';

                // v1.5.0: If a review form is open, don't rebuild innerHTML
                // (poll every 30s calls renderBanner which destroys user input)
                if (this._activeReviewId && banner.querySelector('.rq-review-form')) {
                    // Only update the count text and dashboard notice
                    var titleEl = banner.querySelector('.rq-banner-title');
                    if (titleEl) {
                        var ct = pending.length === 1 ? '1 trade awaiting review' : pending.length + ' trades awaiting review';
                        titleEl.innerHTML = ICONS.clipboard + ' <strong>' + ct + '</strong>';
                    }
                    this._renderDashboardNotice(pending.length);
                    return;
                }

                // Build banner HTML
                const countText = pending.length === 1
                    ? '1 trade awaiting review'
                    : pending.length + ' trades awaiting review';

                let html = '<div class="rq-banner">' +
                    '<div class="rq-banner-header">' +
                        '<div class="rq-banner-title">' +
                            ICONS.clipboard + ' <strong>' + countText + '</strong>' +
                        '</div>' +
                        '<div class="rq-banner-subtitle">Complete reviews to unlock next session trading</div>' +
                    '</div>' +
                    '<div class="rq-banner-actions">' +
                        '<button class="rq-btn rq-btn-bulk-dismiss" onclick="BrokerDashboard.reviewQueue.bulkDismissReviewTrades()">Dismiss All (' + pending.length + ')</button>' +
                    '</div>' +
                    '<div class="rq-trade-list">';

                pending.forEach((trade, idx) => {
                    const isActive = this._activeReviewId === (trade.id || trade.date);
                    const pair = trade.pair || '--';
                    const dir = (_deriveDirection(trade) || '').toUpperCase();
                    const dirClass = _deriveDirection(trade) === 'short' ? 'short' : 'long';
                    const pl = parseFloat(trade.realizedPL || 0);
                    const plStr = (pl >= 0 ? '+' : '') + pl.toFixed(2);
                    const plClass = pl >= 0 ? 'text-pass' : 'text-fail';
                    const rVal = trade.rValue ? trade.rValue.toFixed(2) + 'R' : '--';
                    const outcome = trade.outcome || '--';
                    const outcomeClass = outcome === 'WIN' ? 'text-pass' : outcome === 'LOSS' ? 'text-fail' : 'text-warning';
                    const duration = trade.duration || '--';
                    // v1.5.0: Format close date for display
                    var tradeDate = '--';
                    var rawDate = trade.closeTime || trade.date;
                    if (rawDate) {
                        var d = new Date(rawDate);
                        tradeDate = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('' + d.getFullYear()).slice(-2);
                    }
                    const hasUtcc = trade.trendScore ? true : false;

                    html += '<div class="rq-trade-item" data-trade-id="' + (trade.id || trade.date) + '">' +
                        '<div class="rq-trade-summary" onclick="BrokerDashboard.reviewQueue.toggleReview(\'' + (trade.id || trade.date) + '\')">' +
                            '<span class="rq-trade-pair">' + pair + '</span>' +
                            '<span class="rq-trade-date">' + tradeDate + '</span>' +
                            '<span class="rq-trade-dir ' + dirClass + '">' + dir + '</span>' +
                            '<span class="rq-trade-outcome ' + outcomeClass + '">' + outcome + '</span>' +
                            '<span class="rq-trade-pl ' + plClass + '">' + plStr + '</span>' +
                            '<span class="rq-trade-r">' + rVal + '</span>' +
                            '<span class="rq-trade-dur">' + duration + '</span>' +
                            (hasUtcc ? '<span class="rq-utcc-badge">' + ICONS.checkmark + ' UTCC</span>' : '<span class="rq-no-utcc-badge">' + ICONS.warning + ' No UTCC</span>') +
                            '<span class="rq-expand-icon">' + (isActive ? '&#x25B2;' : '&#x25BC;') + '</span>' +
                            '<button class="rq-btn-dismiss" onclick="event.stopPropagation(); BrokerDashboard.reviewQueue.dismissReviewTrade(\'' + (trade.id || trade.date) + '\')" title="Dismiss this trade">DIS</button>' +
                        '</div>';

                    // Inline review form (expanded)
                    if (isActive) {
                        html += this._renderReviewForm(trade);
                    }

                    html += '</div>';
                });

                html += '</div></div>';

                // Also render a dashboard banner (compact)
                this._renderDashboardNotice(pending.length);

                banner.innerHTML = html;
            },

            /**
             * Toggle review form expansion
             */
            toggleReview: function(tradeId) {
                if (this._activeReviewId === tradeId) {
                    this._activeReviewId = null;
                } else {
                    this._activeReviewId = tradeId;
                }
                this.renderBanner();
            },

            /**
             * Render inline review form for a trade
             */
            _renderReviewForm: function(trade) {
                const id = trade.id || trade.date;
                const pair = trade.pair || '--';
                const dir = (trade.direction || '').toUpperCase();
                const entry = trade.entry || trade.entryPrice || '--';
                const exit = trade.exitPrice || '--';
                const stop = trade.stop || '--';
                const tp = trade.tp || '--';
                const pl = parseFloat(trade.realizedPL || 0).toFixed(2);
                const financing = parseFloat(trade.financing || 0).toFixed(2);
                const netPL = parseFloat(trade.netPL || 0).toFixed(2);
                const rVal = trade.rValue ? trade.rValue.toFixed(2) : '--';
                const score = trade.trendScore || '';
                const hasUtcc = trade.trendScore ? true : false;

                let html = '<div class="rq-review-form">' +
                    // Auto-filled summary (read-only)
                    '<div class="rq-form-section">' +
                        '<div class="rq-form-section-title">Trade Summary (auto-filled)</div>' +
                        '<div class="rq-summary-grid">' +
                            '<div class="rq-summary-item"><span class="rq-label">Pair</span><span class="rq-value">' + pair + ' ' + dir + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Entry</span><span class="rq-value">' + entry + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Exit</span><span class="rq-value">' + exit + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Stop</span><span class="rq-value" style="color:var(--color-fail);">' + stop + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Target</span><span class="rq-value" style="color:var(--color-pass);">' + tp + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">R-Multiple</span><span class="rq-value">' + rVal + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Realised P&amp;L</span><span class="rq-value">' + pl + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Financing</span><span class="rq-value">' + financing + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Net P&amp;L</span><span class="rq-value" style="font-weight:600;">' + netPL + '</span></div>' +
                        '</div>' +
                    '</div>';

                // UTCC fields (only show if not auto-filled from AlertQueue)
                if (!hasUtcc) {
                    html += '<div class="rq-form-section">' +
                        '<div class="rq-form-section-title">' + ICONS.target + ' UTCC Data <span style="color:var(--color-warn);font-size:0.75rem;">(not auto-matched - fill manually if available)</span></div>' +
                        '<div class="rq-form-row">' +
                            '<div class="rq-form-field">' +
                                '<label>UTCC Score <span style="font-weight:normal;color:var(--text-muted);font-size:0.7rem;">(from UTCC Alert)</span></label>' +
                                '<input type="number" id="rq-score-' + id + '" min="0" max="100" placeholder="0-100"' + (score ? ' value="' + score + '"' : '') + '>' +
                            '</div>' +
                            '<div class="rq-form-field">' +
                                '<label>Grade</label>' +
                                '<select id="rq-grade-' + id + '">' +
                                    '<option value="">-- Select --</option>' +
                                    '<option value="A+">A+</option>' +
                                    '<option value="A">A</option>' +
                                    '<option value="B">B</option>' +
                                    '<option value="C">C</option>' +
                                    '<option value="D">D</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="rq-form-field">' +
                                '<label>Playbook</label>' +
                                '<select id="rq-playbook-' + id + '">' +
                                    '<option value="">-- Select --</option>' +
                                    '<option value="continuation">Continuation</option>' +
                                    '<option value="reversal">Reversal</option>' +
                                    '<option value="breakout">Breakout</option>' +
                                    '<option value="pullback">Pullback</option>' +
                                    '<option value="range">Range</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                } else {
                    html += '<div class="rq-form-section">' +
                        '<div class="rq-form-section-title">' + ICONS.checkmark + ' UTCC Data (auto-matched from AlertQueue)</div>' +
                        '<div class="rq-summary-grid">' +
                            '<div class="rq-summary-item"><span class="rq-label">Score</span><span class="rq-value">' + (trade.trendScore || '--') + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Tier</span><span class="rq-value">' + (trade.utccTier || '--') + '</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Criteria</span><span class="rq-value">' + (trade.utccCriteriaPass || '--') + '/5</span></div>' +
                            '<div class="rq-summary-item"><span class="rq-label">Zone</span><span class="rq-value">' + (trade.entryZone || '--') + '</span></div>' +
                        '</div>' +
                        '<div class="rq-form-row" style="margin-top:8px;">' +
                            '<div class="rq-form-field">' +
                                '<label>Grade</label>' +
                                '<select id="rq-grade-' + id + '">' +
                                    '<option value="">-- Select --</option>' +
                                    '<option value="A+">A+</option>' +
                                    '<option value="A">A</option>' +
                                    '<option value="B">B</option>' +
                                    '<option value="C">C</option>' +
                                    '<option value="D">D</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="rq-form-field">' +
                                '<label>Playbook</label>' +
                                '<select id="rq-playbook-' + id + '">' +
                                    '<option value="">-- Select --</option>' +
                                    '<option value="continuation">Continuation</option>' +
                                    '<option value="reversal">Reversal</option>' +
                                    '<option value="breakout">Breakout</option>' +
                                    '<option value="pullback">Pullback</option>' +
                                    '<option value="range">Range</option>' +
                                '</select>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }

                // Manual review fields (always shown)
                html += '<div class="rq-form-section">' +
                    '<div class="rq-form-section-title">' + ICONS.clipboard + ' Your Review</div>' +
                    '<div class="rq-form-row">' +
                        '<div class="rq-form-field">' +
                            '<label>Execution Quality</label>' +
                            '<div class="rq-rating" id="rq-exec-' + id + '">' +
                                '<button class="rq-rating-btn" data-val="1" onclick="BrokerDashboard.reviewQueue._setRating(\'' + id + '\', 1)">1</button>' +
                                '<button class="rq-rating-btn" data-val="2" onclick="BrokerDashboard.reviewQueue._setRating(\'' + id + '\', 2)">2</button>' +
                                '<button class="rq-rating-btn" data-val="3" onclick="BrokerDashboard.reviewQueue._setRating(\'' + id + '\', 3)">3</button>' +
                                '<button class="rq-rating-btn" data-val="4" onclick="BrokerDashboard.reviewQueue._setRating(\'' + id + '\', 4)">4</button>' +
                                '<button class="rq-rating-btn" data-val="5" onclick="BrokerDashboard.reviewQueue._setRating(\'' + id + '\', 5)">5</button>' +
                            '</div>' +
                            '<div class="rq-rating-labels"><span>Poor</span><span>Excellent</span></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="rq-form-row">' +
                        '<div class="rq-form-field rq-full-width">' +
                            '<label>Lessons Learned</label>' +
                            '<textarea id="rq-lessons-' + id + '" rows="3" placeholder="What did this trade teach you? What would you do differently?"></textarea>' +
                        '</div>' +
                    '</div>' +
                    '<div class="rq-form-actions">' +
                        '<button class="rq-btn rq-btn-submit" onclick="BrokerDashboard.reviewQueue.submitReview(\'' + id + '\')">' +
                            ICONS.checkmark + ' Complete Review' +
                        '</button>' +
                        '<button class="rq-btn rq-btn-dismiss-form" onclick="BrokerDashboard.reviewQueue.dismissReviewTrade(\'' + id + '\')">' +
                            'Dismiss' +
                        '</button>' +
                    '</div>' +
                '</div>';

                html += '</div>';
                return html;
            },

            /**
             * Set execution rating (visual feedback)
             */
            _setRating: function(tradeId, value) {
                const container = document.getElementById('rq-exec-' + tradeId);
                if (!container) return;

                container.dataset.value = value;
                const buttons = container.querySelectorAll('.rq-rating-btn');
                buttons.forEach(btn => {
                    const btnVal = parseInt(btn.dataset.val);
                    btn.classList.toggle('rq-rating-active', btnVal <= value);
                });
            },

            /**
             * Submit a completed review
             */
            submitReview: function(tradeId) {
                try {
                    const trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    const idx = trades.findIndex(t => (t.id || t.date) === tradeId);
                    if (idx === -1) {
                        console.error('[ReviewQueue] Trade not found:', tradeId);
                        return;
                    }

                    const trade = trades[idx];

                    // Collect form values
                    const execContainer = document.getElementById('rq-exec-' + tradeId);
                    const execQuality = execContainer ? parseInt(execContainer.dataset.value || '0') : 0;

                    const lessonsEl = document.getElementById('rq-lessons-' + tradeId);
                    const lessons = lessonsEl ? lessonsEl.value.trim() : '';

                    const gradeEl = document.getElementById('rq-grade-' + tradeId);
                    const grade = gradeEl ? gradeEl.value : '';

                    const playbookEl = document.getElementById('rq-playbook-' + tradeId);
                    const playbook = playbookEl ? playbookEl.value : '';

                    const scoreEl = document.getElementById('rq-score-' + tradeId);
                    const score = scoreEl ? parseInt(scoreEl.value) || null : null;

                    // Validate: execution quality is required
                    if (!execQuality || execQuality < 1) {
                        alert('Please rate your execution quality (1-5) before completing the review.');
                        return;
                    }

                    // Update trade
                    trades[idx].status = STATUS.COMPLETE;
                    trades[idx].executionQuality = execQuality;
                    trades[idx].lessonsLearned = lessons;
                    trades[idx].reviewedAt = new Date().toISOString();

                    if (grade) trades[idx].grade = grade;
                    if (playbook) trades[idx].playbook = playbook;
                    if (score && !trades[idx].trendScore) trades[idx].trendScore = score;

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));

                    // Wire CircuitBreaker
                    this._recordToCircuitBreaker(trades[idx]);

                    // Fire events
                    window.dispatchEvent(new CustomEvent('journal:entry', {
                        detail: { tradeId: tradeId, action: 'review_complete' }
                    }));

                    window.dispatchEvent(new CustomEvent('journal:reviewcomplete', {
                        detail: { trade: trades[idx] }
                    }));

                    // Reset active review and refresh
                    this._activeReviewId = null;
                    this.renderBanner();

                    console.log('[ReviewQueue] Review completed for ' + tradeId);

                } catch (e) {
                    console.error('[ReviewQueue] Submit review error:', e);
                }
            },

            /**
             * Record trade result to CircuitBreaker
             */
            _recordToCircuitBreaker: function(trade) {
                try {
                    if (typeof CircuitBreaker === 'undefined' || !CircuitBreaker.recordTradeResult) {
                        console.log('[ReviewQueue] CircuitBreaker not available, skipping');
                        return;
                    }

                    const playbookId = trade.playbook || 'unknown';
                    const pair = trade.pair || '';
                    const result = (trade.outcome || '').toLowerCase(); // 'win', 'loss', 'breakeven'
                    const rMultiple = trade.rValue || 0;

                    CircuitBreaker.recordTradeResult(playbookId, pair, result, rMultiple);
                    console.log('[ReviewQueue] Recorded to CircuitBreaker: ' + pair + ' ' + result + ' ' + rMultiple + 'R');

                } catch (e) {
                    console.error('[ReviewQueue] CircuitBreaker record error:', e);
                }
            },

            /**
             * Render compact notice on Dashboard tab
             */
            _renderDashboardNotice: function(count) {
                let notice = document.getElementById('review-queue-dashboard-notice');

                if (count === 0) {
                    if (notice) notice.style.display = 'none';
                    return;
                }

                if (!notice) {
                    notice = document.createElement('div');
                    notice.id = 'review-queue-dashboard-notice';

                    // Insert at top of dashboard
                    const dashSection = document.querySelector('.dashboard-section') || document.getElementById('tab-dashboard');
                    if (dashSection) {
                        dashSection.insertBefore(notice, dashSection.firstChild);
                    }
                }

                if (!notice) return;

                notice.style.display = 'block';
                const plural = count === 1 ? '' : 's';
                notice.innerHTML = '<div class="rq-dash-notice">' +
                    ICONS.warning + ' <strong>' + count + ' trade' + plural + ' awaiting review</strong> ' +
                    '&mdash; Go to Journal tab to complete review' + plural + '.' +
                    (count >= 3 ? ' ' + ICONS.lock + ' <em>Next session trading may be blocked.</em>' : '') +
                '</div>';
            },

            // ============================================
            // v1.5.0: DISMISS FUNCTIONS
            // Single authority for dismissing trades in ftcc_trades
            // (the store getUnreviewedTrades actually checks)
            // ============================================

            /**
             * Dismiss a single review trade
             */
            dismissReviewTrade: function(tradeId) {
                var reasons = ['TEST', 'LEGACY', 'CANNOT_RECALL', 'DUPLICATE'];
                var input = prompt(
                    'Dismiss reason:\n\n' +
                    '1 = TEST (test/practice trade)\n' +
                    '2 = LEGACY (old trade, no longer relevant)\n' +
                    '3 = CANNOT_RECALL (cannot remember reasoning)\n' +
                    '4 = DUPLICATE (duplicate entry)\n\n' +
                    'Enter 1-4:'
                );
                if (!input) return;

                var idx = parseInt(input) - 1;
                if (isNaN(idx) || idx < 0 || idx >= reasons.length) return;

                var reason = reasons[idx];

                try {
                    var trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    var tIdx = trades.findIndex(function(t) { return (t.id || t.date) === tradeId; });
                    if (tIdx === -1) {
                        console.error('[ReviewQueue] Trade not found for dismiss:', tradeId);
                        return;
                    }

                    var now = new Date().toISOString();
                    trades[tIdx].status = STATUS.COMPLETE;
                    trades[tIdx].grade = 'DIS';
                    trades[tIdx].dismissReason = reason;
                    trades[tIdx].dismissedAt = now;
                    trades[tIdx].notes = (trades[tIdx].notes || '') + '\n[' + new Date().toLocaleString() + '] Dismissed from review: ' + reason;

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));

                    // Also dismiss in TradeCapture if available
                    if (typeof TradeCapture !== 'undefined' && TradeCapture.dismissTrade) {
                        TradeCapture.dismissTrade(tradeId, reason);
                    }

                    this._activeReviewId = null;
                    this.renderBanner();

                    console.log('[ReviewQueue] Dismissed: ' + tradeId + ' (' + reason + ')');
                } catch (e) {
                    console.error('[ReviewQueue] Dismiss error:', e);
                }
            },

            /**
             * Bulk dismiss all trades awaiting review
             */
            bulkDismissReviewTrades: function() {
                var pending = this.getUnreviewedTrades();
                if (pending.length === 0) return;

                var reasons = ['TEST', 'LEGACY', 'CANNOT_RECALL'];
                var input = prompt(
                    'Bulk dismiss ' + pending.length + ' trade(s).\n\n' +
                    'Dismiss reason for ALL:\n' +
                    '1 = TEST\n2 = LEGACY\n3 = CANNOT_RECALL\n\n' +
                    'Enter 1-3:'
                );
                if (!input) return;

                var idx = parseInt(input) - 1;
                if (isNaN(idx) || idx < 0 || idx >= reasons.length) return;

                var reason = reasons[idx];
                if (!confirm('Dismiss ' + pending.length + ' trades as ' + reason + '?')) return;

                try {
                    var trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                    var now = new Date().toISOString();
                    var count = 0;

                    trades.forEach(function(t) {
                        if (t.status === STATUS.PENDING_REVIEW) {
                            t.status = STATUS.COMPLETE;
                            t.grade = 'DIS';
                            t.dismissReason = reason;
                            t.dismissedAt = now;
                            t.notes = (t.notes || '') + '\n[' + new Date().toLocaleString() + '] Bulk dismissed from review: ' + reason;
                            count++;
                        }
                    });

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));

                    // Also bulk dismiss in TradeCapture if available
                    if (typeof TradeCapture !== 'undefined' && TradeCapture.bulkDismissPendingTrades) {
                        TradeCapture.bulkDismissPendingTrades(reason);
                    }

                    this._activeReviewId = null;
                    this.renderBanner();

                    console.log('[ReviewQueue] Bulk dismissed: ' + count + ' trades (' + reason + ')');
                } catch (e) {
                    console.error('[ReviewQueue] Bulk dismiss error:', e);
                }
            }
        },

        // ============================================
        // GOVERNANCE GATE (NEW in v1.3.0)
        // ============================================

        /**
         * Check if unreviewed trades exist (for CircuitBreaker integration)
         * @returns {boolean}
         */
        hasUnreviewedTrades: function() {
            return this.reviewQueue.hasUnreviewedTrades();
        },

        /**
         * Get count of unreviewed trades
         * @returns {number}
         */
        getUnreviewedCount: function() {
            return this.reviewQueue.getUnreviewedTrades().length;
        }
    };

    // ============================================
    // CSS INJECTION (v1.3.0 - extended)
    // ============================================

    const style = document.createElement('style');
    style.textContent =
        // Existing v1.2.0 styles
        '@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }' +
        '.live-indicator { animation: pulse 2s infinite; }' +
        '.broker-live-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(34, 197, 94, 0.15); border: 1px solid var(--color-pass); border-radius: 4px; font-size: 0.7rem; color: var(--color-pass); margin-left: 8px; }' +
        '.broker-source-badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; background: rgba(96, 165, 250, 0.1); border: 1px solid currentColor; }' +

        // ---- Review Queue Banner (v1.3.0) ----
        '.rq-banner { background: var(--bg-secondary, #1a1a2e); border: 2px solid var(--color-warn, #f59e0b); border-radius: var(--radius-lg, 12px); padding: var(--spacing-md, 1rem); margin-bottom: var(--spacing-lg, 1.5rem); }' +
        '.rq-banner-header { margin-bottom: var(--spacing-md, 1rem); padding-bottom: var(--spacing-sm, 0.5rem); border-bottom: 1px solid var(--border-color, #2d2d44); }' +
        '.rq-banner-title { font-size: 1rem; color: var(--color-warn, #f59e0b); display: flex; align-items: center; gap: 8px; }' +
        '.rq-banner-subtitle { font-size: 0.75rem; color: var(--text-muted, #666); margin-top: 4px; }' +

        // v1.5.0: Date column
        '.rq-trade-date { font-size: 0.75rem; color: var(--text-muted, #888); min-width: 60px; }' +

        // v1.5.0: Dismiss button styles
        '.rq-btn-dismiss { background: #6b7280; color: #fff; border: none; font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; cursor: pointer; margin-left: auto; flex-shrink: 0; }' +
        '.rq-btn-dismiss:hover { background: #9ca3af; }' +
        '.rq-btn-dismiss-form { background: #6b7280; color: #fff; border: none; font-size: 0.8rem; padding: 6px 16px; border-radius: 6px; cursor: pointer; margin-left: 8px; }' +
        '.rq-btn-dismiss-form:hover { background: #9ca3af; }' +
        '.rq-btn-bulk-dismiss { background: #6b7280; color: #fff; border: none; font-size: 0.75rem; padding: 4px 12px; border-radius: 4px; cursor: pointer; }' +
        '.rq-btn-bulk-dismiss:hover { background: #9ca3af; }' +
        '.rq-banner-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }' +

        // Trade list items
        '.rq-trade-list { display: flex; flex-direction: column; gap: 4px; }' +
        '.rq-trade-item { border: 1px solid var(--border-color, #2d2d44); border-radius: var(--radius-sm, 6px); overflow: hidden; }' +
        '.rq-trade-summary { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; transition: background 150ms; font-size: 0.85rem; flex-wrap: wrap; }' +
        '.rq-trade-summary:hover { background: rgba(255,255,255,0.03); }' +
        '.rq-trade-pair { font-weight: 700; min-width: 65px; }' +
        '.rq-trade-dir { font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 3px; }' +
        '.rq-trade-dir.long { background: rgba(34, 197, 94, 0.15); color: var(--color-pass, #22c55e); }' +
        '.rq-trade-dir.short { background: rgba(239, 68, 68, 0.15); color: var(--color-fail, #ef4444); }' +
        '.rq-trade-outcome { font-weight: 600; min-width: 40px; }' +
        '.rq-trade-pl { font-family: var(--font-heading, monospace); font-weight: 600; min-width: 60px; }' +
        '.rq-trade-r { font-family: var(--font-heading, monospace); min-width: 45px; color: var(--text-secondary, #aaa); }' +
        '.rq-trade-dur { color: var(--text-muted, #666); min-width: 40px; }' +
        '.rq-utcc-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; background: rgba(34, 197, 94, 0.1); color: var(--color-pass, #22c55e); }' +
        '.rq-no-utcc-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; background: rgba(245, 158, 11, 0.1); color: var(--color-warn, #f59e0b); }' +
        '.rq-expand-icon { margin-left: auto; color: var(--text-muted); font-size: 0.7rem; }' +

        // Review form
        '.rq-review-form { padding: 16px; border-top: 1px solid var(--border-color, #2d2d44); background: rgba(0,0,0,0.15); }' +
        '.rq-form-section { margin-bottom: 16px; }' +
        '.rq-form-section:last-child { margin-bottom: 0; }' +
        '.rq-form-section-title { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary, #aaa); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }' +
        '.rq-summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }' +
        '.rq-summary-item { display: flex; flex-direction: column; gap: 2px; }' +
        '.rq-label { font-size: 0.7rem; color: var(--text-muted, #666); }' +
        '.rq-value { font-size: 0.85rem; font-family: var(--font-heading, monospace); }' +
        '.rq-form-row { display: flex; gap: 12px; flex-wrap: wrap; }' +
        '.rq-form-field { flex: 1; min-width: 140px; }' +
        '.rq-form-field.rq-full-width { flex: 100%; min-width: 100%; }' +
        '.rq-form-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }' +
        '.rq-form-field input, .rq-form-field select, .rq-form-field textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border-color, #2d2d44); border-radius: var(--radius-sm, 4px); background: var(--bg-primary, #0f0f1a); color: var(--text-primary, #fff); font-size: 0.85rem; font-family: inherit; box-sizing: border-box; }' +
        '.rq-form-field textarea { resize: vertical; }' +

        // Rating buttons
        '.rq-rating { display: flex; gap: 4px; }' +
        '.rq-rating-btn { width: 36px; height: 36px; border: 1px solid var(--border-color, #2d2d44); border-radius: var(--radius-sm, 4px); background: var(--bg-primary, #0f0f1a); color: var(--text-secondary); cursor: pointer; font-weight: 700; font-size: 0.85rem; transition: all 150ms; }' +
        '.rq-rating-btn:hover { border-color: var(--color-info, #3b82f6); }' +
        '.rq-rating-btn.rq-rating-active { background: var(--color-info, #3b82f6); color: white; border-color: var(--color-info, #3b82f6); }' +
        '.rq-rating-labels { display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-top: 2px; width: 188px; }' +

        // Submit button
        '.rq-form-actions { margin-top: 12px; display: flex; justify-content: flex-end; }' +
        '.rq-btn { padding: 10px 20px; border-radius: var(--radius-sm, 4px); font-size: 0.85rem; cursor: pointer; border: none; font-weight: 600; transition: all 150ms; display: inline-flex; align-items: center; gap: 6px; }' +
        '.rq-btn-submit { background: var(--color-pass, #22c55e); color: white; }' +
        '.rq-btn-submit:hover { background: #16a34a; }' +

        // Dashboard compact notice
        '.rq-dash-notice { background: rgba(245, 158, 11, 0.1); border: 1px solid var(--color-warn, #f59e0b); border-radius: var(--radius-lg, 12px); padding: 12px 16px; margin-bottom: var(--spacing-lg, 1.5rem); font-size: 0.85rem; color: var(--color-warn, #f59e0b); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }' +

        // Text utility classes (in case not globally defined)
        '.text-pass { color: var(--color-pass, #22c55e); }' +
        '.text-fail { color: var(--color-fail, #ef4444); }' +
        '.text-warning { color: var(--color-warn, #f59e0b); }';

    document.head.appendChild(style);
    
    // ============================================
    // INITIALISATION
    // ============================================
    
    window.BrokerDashboard = BrokerDashboard;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BrokerDashboard.init());
    } else {
        setTimeout(() => BrokerDashboard.init(), 100);
    }
    
})();
