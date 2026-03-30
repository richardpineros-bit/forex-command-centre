// ============================================================================
// EXECUTE BUTTON INTEGRATION v1.1.0
// Wire EXECUTE TRADE button to TradeCapture module
// ============================================================================
// CHANGELOG v1.1.0:
//   - FEAT: entry/SL/TP fields are now optional
//     - Missing levels show backfill-ack-panel (override tick)
//     - Trader must acknowledge they will back-fill from Oanda immediately
//     - Pair + Direction remain hard required (no override)
//     - EXTENDED zone remains hard blocked (no override)
//     - Server permission gate remains hard blocked (no override)
//     - R:R check skipped when levels are absent (can't calc what isn't there)
//   - FEAT: Smart immediate Oanda link after execute
//     - Polls open trades for 30s (6 attempts x 5s) to grab actual fill
//     - If found open: captures entry, SL, TP, units
//     - If found closed (rare): captures everything including P&L
//   - FEAT: Fetch from Oanda button on pending trade cards
//     - Smart: checks open first, then closed history
//     - Updates oandaData and re-renders panel
// ============================================================================

(function() {
    'use strict';

    // ========================================================================
    // BACKFILL ACK PANEL -- show/hide based on missing levels
    // Called on field input and on init
    // ========================================================================

    function updateBackfillAckPanel() {
        const entry = document.getElementById('val-entry')?.value;
        const stop  = document.getElementById('val-stop')?.value;
        const tp1   = document.getElementById('val-tp1')?.value;
        const panel = document.getElementById('backfill-ack-panel');
        const ack   = document.getElementById('val-backfill-ack');

        if (!panel) return;

        const anyMissing = !entry || !stop || !tp1;
        panel.style.display = anyMissing ? 'block' : 'none';

        // Auto-uncheck when all levels are filled
        if (!anyMissing && ack) ack.checked = false;
    }
    window.updateBackfillAckPanel = updateBackfillAckPanel;

    // ========================================================================
    // EXECUTE HANDLER
    // ========================================================================

    async function handleExecuteTrade(event) {
        const btn = event.currentTarget;

        if (btn.classList.contains('capturing')) return;

        btn.classList.add('capturing');
        const originalText = btn.textContent;
        btn.textContent = 'Checking...';

        try {
            const validationPassed = await runPreTradeValidation();
            if (!validationPassed) return;

            btn.textContent = 'Capturing...';

            if (typeof TradeCapture !== 'undefined') {
                const trade = await TradeCapture.createPendingTrade();

                if (trade) {
                    btn.classList.add('success');
                    btn.textContent = '\u2713 Trade Logged';

                    showNotification(
                        'Trade captured: ' + trade.preTradeData.pair + ' ' + trade.preTradeData.direction.toUpperCase() +
                        (trade.alertId ? ' (Alert matched!)' : ''),
                        'success'
                    );

                    renderPendingTradesPanel();

                    // Start background Oanda link attempt
                    attemptImmediateOandaLink(trade);

                    setTimeout(function() {
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
            setTimeout(function() {
                btn.classList.remove('capturing', 'success');
                btn.textContent = originalText;
            }, 2000);
        }
    }

    // ========================================================================
    // PRE-TRADE VALIDATION
    // Hard blocks:  pair/direction, server gate, EXTENDED zone
    // Override tick: missing entry/SL/TP
    // Skip:         R:R when levels absent
    // ========================================================================

    async function runPreTradeValidation() {
        var pair      = document.getElementById('val-pair') ? document.getElementById('val-pair').value : '';
        var direction = document.getElementById('val-direction') ? document.getElementById('val-direction').value : '';
        var entry     = document.getElementById('val-entry') ? document.getElementById('val-entry').value : '';
        var stop      = document.getElementById('val-stop') ? document.getElementById('val-stop').value : '';
        var tp1       = document.getElementById('val-tp1') ? document.getElementById('val-tp1').value : '';

        // --- HARD BLOCK: pair + direction always required ---
        if (!pair || !direction) {
            showNotification('\u26D4 Select pair and direction before executing.', 'error');
            return false;
        }

        // --- SERVER-SIDE PERMISSION GATE (hard block, no override) ---
        try {
            var permResponse = await fetch('/api/storage-api.php?action=canExecuteTrade');
            if (!permResponse.ok) throw new Error('HTTP ' + permResponse.status);
            var perm = await permResponse.json();
            if (!perm.allowed) {
                showNotification('\u26D4 Trade blocked: ' + perm.reason, 'error');
                return false;
            }
        } catch (e) {
            showNotification('\u26D4 Trade blocked: Cannot verify trading permission \u2014 check connection', 'error');
            return false;
        }

        // --- BACKFILL OVERRIDE TICK (required when any price level is missing) ---
        var anyMissing = !entry || !stop || !tp1;
        if (anyMissing) {
            var ack = document.getElementById('val-backfill-ack');
            if (!ack || !ack.checked) {
                showNotification(
                    '\u26A0 Entry / SL / TP not filled \u2014 tick the backfill acknowledgement before executing.',
                    'warning'
                );
                var backfillPanel = document.getElementById('backfill-ack-panel');
                if (backfillPanel) backfillPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }
        }

        // --- R:R CHECK (skipped when levels are missing) ---
        if (entry && stop && tp1) {
            var entryF = parseFloat(entry);
            var stopF  = parseFloat(stop);
            var tp1F   = parseFloat(tp1);

            if (entryF && stopF && tp1F) {
                var risk   = Math.abs(entryF - stopF);
                var reward = Math.abs(tp1F - entryF);
                var rr     = risk > 0 ? reward / risk : 0;

                if (rr < 1.5) {
                    showNotification(
                        'Trade blocked: R:R is ' + rr.toFixed(2) + ' \u2014 minimum 1.5:1 required. Rework your levels.',
                        'error'
                    );
                    return false;
                }
            }
        }

        // --- ENTRY ZONE ENFORCEMENT ---
        var zoneEl = document.getElementById('val-entry-zone');
        var zone   = zoneEl ? zoneEl.value.toUpperCase() : '';

        if (zone === 'EXTENDED') {
            showNotification('\u26D4 Trade blocked: You are Chasing \u2014 the move has left without you. Wait for a pullback.', 'error');
            return false;
        }
        if (zone === 'ACCEPTABLE') {
            var zoneAck = document.getElementById('val-zone-stretched-ack');
            if (!zoneAck || !zoneAck.checked) {
                showNotification('\u26A0 Stretched location \u2014 tick the acknowledgement checkbox before executing.', 'warning');
                var stretchedPanel = document.getElementById('zone-stretched-ack');
                if (stretchedPanel) stretchedPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }
        }

        return true;
    }

    // ========================================================================
    // SMART IMMEDIATE OANDA LINK
    // Polls open trades after execute to grab actual fill ASAP.
    // Falls back to closed history if trade filled + closed immediately.
    // ========================================================================

    async function attemptImmediateOandaLink(trade) {
        var pair      = trade.preTradeData.pair;
        var direction = trade.preTradeData.direction;
        var MAX_ATTEMPTS = 6;
        var DELAY_MS     = 5000;

        console.log('[ExecuteIntegration] Starting Oanda link poll for ' + pair + ' ' + direction + '...');

        for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            await sleep(attempt === 1 ? 2000 : DELAY_MS);

            try {
                var broker    = getBrokerAdapter();
                var accountId = getBrokerAccountId();
                if (!broker || !accountId) break;

                // Check open trades first
                var openTrades = await broker.getOpenTrades(accountId);
                var match      = findMatchingTrade(openTrades, pair, direction, trade.createdAt);

                if (match) {
                    console.log('[ExecuteIntegration] Linked on attempt ' + attempt + ': Trade ID ' + match.id);
                    await updateOandaData(trade, match, false);
                    showNotification(
                        '\u2713 Oanda fill linked: ' + pair + ' @ ' + (match.entryPrice ? match.entryPrice.toFixed(5) : '--'),
                        'success'
                    );
                    renderPendingTradesPanel();
                    return;
                }

                // Check closed history (trade may have closed almost immediately)
                var closedTrades = await broker.getTradeHistory(accountId, { count: 10 });
                var closedMatch  = findMatchingTrade(closedTrades, pair, direction, trade.createdAt);

                if (closedMatch) {
                    console.log('[ExecuteIntegration] Closed trade linked on attempt ' + attempt + ': ' + closedMatch.id);
                    await updateOandaData(trade, closedMatch, true);
                    showNotification(
                        '\u2713 Closed trade linked: ' + pair + ' ' + (closedMatch.outcome || ''),
                        'info'
                    );
                    renderPendingTradesPanel();
                    return;
                }

            } catch (e) {
                console.warn('[ExecuteIntegration] Poll attempt ' + attempt + ' failed:', e.message);
            }
        }

        console.log('[ExecuteIntegration] Auto-link timed out for ' + pair + '. Use Fetch button to retry.');
        showNotification(
            pair + ': Auto-link timed out \u2014 use \u21BB Fetch on the pending card to retry.',
            'warning'
        );
    }

    // ========================================================================
    // MANUAL FETCH -- Fetch from Oanda button handler
    // ========================================================================

    window.fetchTradeFromOanda = async function(tradeId) {
        var cardEl = document.querySelector('[data-trade-id="' + tradeId + '"]');
        var btn    = cardEl ? cardEl.querySelector('.btn-fetch-oanda') : null;
        if (btn) {
            btn.textContent = 'Fetching...';
            btn.disabled    = true;
        }

        try {
            if (typeof TradeCapture === 'undefined') {
                showNotification('TradeCapture not available', 'warning');
                return;
            }

            var trade = TradeCapture.getTradeById(tradeId);
            if (!trade) {
                showNotification('Trade not found', 'error');
                return;
            }

            var broker    = getBrokerAdapter();
            var accountId = getBrokerAccountId();

            if (!broker || !accountId) {
                showNotification('\u26A0 Broker not connected \u2014 check Oanda settings.', 'warning');
                return;
            }

            var pair      = trade.preTradeData.pair;
            var direction = trade.preTradeData.direction;

            // Check open trades first
            var openTrades = await broker.getOpenTrades(accountId);
            var match      = findMatchingTrade(openTrades, pair, direction, trade.createdAt);

            if (match) {
                await updateOandaData(trade, match, false);
                showNotification(
                    '\u2713 Linked open trade: ' + pair + ' @ ' + (match.entryPrice ? match.entryPrice.toFixed(5) : '--'),
                    'success'
                );
                renderPendingTradesPanel();
                return;
            }

            // Check closed history
            var closedTrades = await broker.getTradeHistory(accountId, { count: 20 });
            var closedMatch  = findMatchingTrade(closedTrades, pair, direction, trade.createdAt);

            if (closedMatch) {
                await updateOandaData(trade, closedMatch, true);
                showNotification(
                    '\u2713 Linked closed trade: ' + pair + ' ' + (closedMatch.outcome || ''),
                    'info'
                );
                renderPendingTradesPanel();
                return;
            }

            showNotification(pair + ': No matching trade found in Oanda. Trade may still be pending.', 'warning');

        } catch (e) {
            console.error('[Execute] Fetch error:', e);
            showNotification('Oanda fetch failed: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.textContent = '\u21BB Fetch';
                btn.disabled    = false;
            }
        }
    };

    // ========================================================================
    // HELPERS
    // ========================================================================

    function sleep(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    // Match by pair, direction, and time (trade must have opened after capture time)
    function findMatchingTrade(trades, pair, direction, createdAt) {
        if (!trades || !trades.length) return null;

        var normPair  = pair.replace('_', '').toUpperCase();
        var createdMs = new Date(createdAt).getTime();

        for (var i = 0; i < trades.length; i++) {
            var t     = trades[i];
            var tPair = (t.instrument || '').replace('_', '').toUpperCase();
            var tDir  = (t.direction || '').toLowerCase();
            var tTime = new Date(t.openTime || 0).getTime();

            var pairMatch = tPair === normPair;
            var dirMatch  = tDir === direction.toLowerCase();
            var timeMatch = tTime >= (createdMs - 30000); // 30s tolerance

            if (pairMatch && dirMatch && timeMatch) return t;
        }
        return null;
    }

    // Update a pending trade's oandaData from a broker trade object
    async function updateOandaData(pendingTrade, brokerTrade, isClosed) {
        if (typeof TradeCapture === 'undefined') return;

        pendingTrade.oandaTradeId = brokerTrade.id;
        pendingTrade.oandaData    = {
            actualEntry:  brokerTrade.entryPrice   || null,
            actualStop:   brokerTrade.stopLoss      || null,
            actualTP:     brokerTrade.takeProfit    || null,
            units:        brokerTrade.units         || null,
            direction:    brokerTrade.direction     || null,
            initialUnits: brokerTrade.initialUnits  || null,
            exitPrice:    isClosed ? (brokerTrade.exitPrice  || null) : null,
            realisedPL:   isClosed ? (brokerTrade.realizedPL != null ? brokerTrade.realizedPL : null) : null,
            duration:     isClosed ? (brokerTrade.duration   || null) : null
        };

        pendingTrade.status = isClosed ? 'closed_pending' : 'open';
        if (!pendingTrade.openedAt) {
            pendingTrade.openedAt = brokerTrade.openTime || new Date().toISOString();
        }

        // R-multiple for closed trades
        if (isClosed && pendingTrade.oandaData.actualEntry && pendingTrade.oandaData.exitPrice) {
            var stop = pendingTrade.oandaData.actualStop || pendingTrade.preTradeData.plannedStop;
            var dir  = pendingTrade.oandaData.direction  || pendingTrade.preTradeData.direction;
            if (stop) {
                var risk   = Math.abs(pendingTrade.oandaData.actualEntry - stop);
                var result = dir === 'long'
                    ? pendingTrade.oandaData.exitPrice - pendingTrade.oandaData.actualEntry
                    : pendingTrade.oandaData.actualEntry - pendingTrade.oandaData.exitPrice;
                if (risk > 0) {
                    pendingTrade.review.rMultiple = Math.round((result / risk) * 100) / 100;
                    pendingTrade.review.outcome   = pendingTrade.review.rMultiple > 0.1 ? 'WIN'
                                                 : pendingTrade.review.rMultiple < -0.1 ? 'LOSS'
                                                 : 'BREAKEVEN';
                }
            }
        }

        // Persist state
        if (TradeCapture._savePendingTrades) {
            TradeCapture._savePendingTrades();
        }

        var eventName = isClosed ? 'tradecapture:closed' : 'tradecapture:linked';
        document.dispatchEvent(new CustomEvent(eventName, { detail: { trade: pendingTrade } }));
    }

    function getBrokerAdapter() {
        if (typeof window.BrokerManager !== 'undefined' && BrokerManager.getActiveAdapter) {
            return BrokerManager.getActiveAdapter();
        }
        return null;
    }

    function getBrokerAccountId() {
        if (typeof window.BrokerManager !== 'undefined' && BrokerManager.getActiveAccountId) {
            return BrokerManager.getActiveAccountId();
        }
        return null;
    }

    // ========================================================================
    // ENTRY ZONE CHANGE
    // ========================================================================

    function onEntryZoneChange() {
        var zoneEl   = document.getElementById('val-entry-zone');
        var zone     = zoneEl ? zoneEl.value.toUpperCase() : '';
        var ackPanel = document.getElementById('zone-stretched-ack');
        var ackBox   = document.getElementById('val-zone-stretched-ack');
        if (ackPanel) ackPanel.style.display = zone === 'ACCEPTABLE' ? 'block' : 'none';
        if (ackBox && zone !== 'ACCEPTABLE') ackBox.checked = false;
        updateBackfillAckPanel();
    }
    window.onEntryZoneChange = onEntryZoneChange;

    // ========================================================================
    // RESET PRE-TRADE FORM
    // ========================================================================

    function resetPreTradeForm() {
        ['val-entry', 'val-stop', 'val-tp1', 'val-tp2'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        var zoneEl = document.getElementById('val-entry-zone');
        if (zoneEl) zoneEl.value = '';
        var ackPanel = document.getElementById('zone-stretched-ack');
        if (ackPanel) ackPanel.style.display = 'none';
        var ackBox = document.getElementById('val-zone-stretched-ack');
        if (ackBox) ackBox.checked = false;
        var backfillAck = document.getElementById('val-backfill-ack');
        if (backfillAck) backfillAck.checked = false;

        ['exec-type-declared', 'exec-single-trigger', 'exec-planned-price',
         'exec-stop-invalidation', 'exec-spread-ok'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.checked = false;
        });

        ['sl-swing-identified', 'sl-buffer-added', 'tp-structure-identified',
         'tp-path-clear', 'rr-acceptable'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.checked = false;
        });

        var gradeBadge = document.getElementById('grade-badge');
        if (gradeBadge) gradeBadge.textContent = '--';

        updateBackfillAckPanel();
    }

    // ========================================================================
    // PENDING TRADES PANEL
    // ========================================================================

    function renderPendingTradesPanel() {
        var panel   = document.getElementById('pending-trades-panel');
        var list    = document.getElementById('pending-trades-list');
        var countEl = document.getElementById('pending-count');

        if (!panel || !list) return;
        if (typeof TradeCapture === 'undefined') { panel.style.display = 'none'; return; }

        var trades = TradeCapture.getAllPendingTrades().filter(function(t) {
            return ['pending', 'open', 'closed_pending'].includes(t.status);
        });

        if (trades.length === 0) { panel.style.display = 'none'; return; }

        panel.style.display = 'block';
        if (countEl) countEl.textContent = trades.length;

        var statusLabels = {
            pending:        'Waiting for Oanda...',
            open:           'Position Open',
            closed_pending: 'Needs Review'
        };

        list.innerHTML = trades.map(function(trade) {
            var pre   = trade.preTradeData;
            var alert = trade.alertData;
            var oanda = trade.oandaData;

            // Slippage
            var slippageHtml = '';
            if (oanda && oanda.actualEntry && pre && pre.plannedEntry) {
                var pipMult = (pre.pair || '').includes('JPY') ? 100 : 10000;
                var slip    = (oanda.actualEntry - pre.plannedEntry) * pipMult;
                var slipStr = (slip >= 0 ? '+' : '') + slip.toFixed(1) + ' pips';
                slippageHtml = '<div class="data-row"><span>Slippage</span><span>' + slipStr + '</span></div>';
            }

            // R-multiple
            var rHtml = '';
            if (trade.review && trade.review.rMultiple !== null && trade.review.rMultiple !== undefined) {
                var r = trade.review.rMultiple;
                rHtml = '<div class="data-row ' + (r >= 0 ? 'positive' : 'negative') + '">' +
                        '<span>R-Multiple</span>' +
                        '<span>' + (r >= 0 ? '+' : '') + r.toFixed(2) + 'R</span>' +
                        '</div>';
            }

            // P&L
            var plHtml = '';
            if (trade.status === 'closed_pending' && oanda && oanda.realisedPL !== null && oanda.realisedPL !== undefined) {
                plHtml = '<div class="data-row highlight">' +
                         '<span>P&amp;L</span>' +
                         '<span class="pending-pnl ' + (oanda.realisedPL >= 0 ? 'positive' : 'negative') + '">' +
                         (oanda.realisedPL >= 0 ? '+' : '') + '$' + Math.abs(oanda.realisedPL).toFixed(2) +
                         '</span></div>';
            }

            // Buttons
            var cancelBtn  = trade.status === 'pending'
                ? '<button class="btn btn-sm btn-secondary" onclick="cancelPendingTrade(\'' + trade.id + '\')">Cancel</button>'
                : '';
            var fetchBtn   = (trade.status === 'pending' || trade.status === 'open')
                ? '<button class="btn btn-sm btn-secondary btn-fetch-oanda" onclick="fetchTradeFromOanda(\'' + trade.id + '\')">\u21BB Fetch</button>'
                : '';
            var journalBtn = trade.status === 'closed_pending'
                ? '<button class="btn btn-sm btn-primary" onclick="openQuickJournal(\'' + trade.id + '\')">Complete Journal</button>'
                : '';

            return '<div class="pending-trade-card" data-trade-id="' + trade.id + '" data-status="' + trade.status + '">' +
                '<div class="pending-trade-header">' +
                    '<span class="pending-pair">' + pre.pair + '</span>' +
                    '<span class="pending-direction ' + pre.direction + '">' + pre.direction.toUpperCase() + '</span>' +
                    (trade.alertId ? '<span class="alert-matched-badge">Alert</span>' : '') +
                    '<span class="pending-status status-' + trade.status + '">' + (statusLabels[trade.status] || trade.status) + '</span>' +
                '</div>' +
                '<div class="pending-trade-data">' +
                    '<div class="data-row"><span>Score</span><span>' + ((alert && alert.score) || (pre && pre.utccScore) || '--') + '</span></div>' +
                    '<div class="data-row"><span>Tier</span><span>' + ((alert && alert.tier) || 'Manual') + '</span></div>' +
                    '<div class="data-row"><span>Entry</span><span>' + (((oanda && oanda.actualEntry) || (pre && pre.plannedEntry)) ? ((oanda && oanda.actualEntry) || (pre && pre.plannedEntry)).toFixed(5) : '--') + '</span></div>' +
                    '<div class="data-row"><span>SL</span><span>' + (((oanda && oanda.actualStop) || (pre && pre.plannedStop)) ? ((oanda && oanda.actualStop) || (pre && pre.plannedStop)).toFixed(5) : '--') + '</span></div>' +
                    '<div class="data-row"><span>TP</span><span>' + (((oanda && oanda.actualTP) || (pre && pre.plannedTP1)) ? ((oanda && oanda.actualTP) || (pre && pre.plannedTP1)).toFixed(5) : '--') + '</span></div>' +
                    '<div class="data-row"><span>R:R</span><span>' + ((pre && pre.plannedRR) || '--') + '</span></div>' +
                    slippageHtml + plHtml + rHtml +
                '</div>' +
                '<div class="pending-trade-actions">' + cancelBtn + fetchBtn + journalBtn + '</div>' +
                '</div>';
        }).join('');
    }

    // ========================================================================
    // CANCEL & JOURNAL
    // ========================================================================

    window.cancelPendingTrade = function(tradeId) {
        if (confirm('Cancel this pending trade?')) {
            if (TradeCapture.cancelPendingTrade(tradeId)) {
                showNotification('Trade cancelled', 'info');
                renderPendingTradesPanel();
            }
        }
    };

    window.openQuickJournal = function(tradeId) {
        var trade = TradeCapture.getTradeById(tradeId);
        if (!trade) return;
        TradeCapture.populateJournalFromTrade(trade);
        if (typeof showTab === 'function') showTab('journal');
        var journalForm = document.getElementById('trade-journal-form');
        if (journalForm) journalForm.scrollIntoView({ behavior: 'smooth' });
    };

    // ========================================================================
    // NOTIFICATION
    // ========================================================================

    function showNotification(message, type) {
        type = type || 'info';
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        var toast = document.createElement('div');
        toast.className = 'trade-capture-toast ' + type;
        toast.innerHTML = '<span class="toast-message">' + message + '</span>';
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 4000);
    }

    // ========================================================================
    // INIT
    // ========================================================================

    function init() {
        var executeBtn = document.getElementById('execute-trade-btn');
        if (executeBtn) {
            executeBtn.removeEventListener('click', handleExecuteTrade);
            executeBtn.addEventListener('click', handleExecuteTrade);
            console.log('[ExecuteIntegration] Wired execute button');
        }

        // Wire backfill panel to level field input
        ['val-entry', 'val-stop', 'val-tp1'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', updateBackfillAckPanel);
        });

        updateBackfillAckPanel();

        document.addEventListener('tradecapture:created',   function() { renderPendingTradesPanel(); });
        document.addEventListener('tradecapture:linked',    function() { renderPendingTradesPanel(); });
        document.addEventListener('tradecapture:closed',    function() { renderPendingTradesPanel(); });
        document.addEventListener('tradecapture:completed', function() { renderPendingTradesPanel(); });

        setTimeout(renderPendingTradesPanel, 500);
        console.log('[ExecuteIntegration] v1.1.0 Ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

    window.ExecuteIntegration = {
        handleExecuteTrade,
        runPreTradeValidation,
        renderPendingTradesPanel,
        resetPreTradeForm,
        updateBackfillAckPanel,
        attemptImmediateOandaLink,
        init
    };

})();
