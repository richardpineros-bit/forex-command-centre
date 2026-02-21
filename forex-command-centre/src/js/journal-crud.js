// journal-crud.js - FCC Phase 3 extraction
// Trade journal CRUD, exit strategy, grading, re-entry

// ============================================
// CHUNK 5: TRADE JOURNAL CRUD
// ============================================

let currentEditTradeId = null;
let tradeHistoryPage = 1;
const TRADES_PER_PAGE = 15;

function loadTrades() {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    updateOpenPositions(trades);
    updateTradeHistory(trades);
    updateTradeCount(trades);
    // Phase 2: Update active trade management panel
    if (typeof updateActiveTradeManagement === 'function') {
        updateActiveTradeManagement();
    }
}

function saveTrade() {
    const trade = collectTradeFormData();
    
    if (!validateTradeData(trade)) return;
    
    // Calculate R-multiple if closed (Bug Fix #5: protect auto-captured values)
    if (trade.status === 'closed' && trade.exit && trade.entry && trade.stop) {
        // Only recalculate if NOT editing an auto-captured trade with broker data
        const existingTrades = loadFromStorage(STORAGE_KEYS.trades, []);
        const existingTrade = currentEditTradeId ? existingTrades.find(t => t.id === currentEditTradeId) : null;
        const hasAutoData = existingTrade && (existingTrade.realizedPL !== undefined || existingTrade.autoCapture === true || existingTrade.autoJournalled === true);
        
        if (hasAutoData) {
            // Preserve broker pnl, only recalculate R if we have riskAmount
            trade.rMultiple = calculateRMultiple(trade);
            // Keep broker pnl if it exists
            if (existingTrade.realizedPL !== undefined) {
                trade.pnl = existingTrade.netPL || existingTrade.realizedPL;
            } else if (existingTrade.pnl && !trade.riskAmount) {
                trade.pnl = existingTrade.pnl;
            } else {
                trade.pnl = calculatePnL(trade);
            }
        } else {
            trade.rMultiple = calculateRMultiple(trade);
            trade.pnl = calculatePnL(trade);
        }
    }
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    
    if (currentEditTradeId) {
        // Update existing trade (preserve auto-capture metadata)
        const index = trades.findIndex(t => t.id === currentEditTradeId);
        if (index !== -1) {
            const existing = trades[index];
            // Protect auto-capture fields from being clobbered by empty form values
            const protectedFields = [
                'autoCapture', 'oandaTradeId', 'brokerTradeId', 'autoJournalled',
                'autoJournalledAt', '_source', 'cbSessionId', 'cbRiskMultiplier',
                'openTime', 'closeTime', 'exitPrice', 'realizedPL', 'financing',
                'netPL', 'duration', 'rValue', 'outcome', 'accountId', 'broker',
                'utccTier', 'utccCriteriaPass', 'alertId', 'reviewedAt',
                'dismissReason', 'dismissedAt', 'createdAt'
            ];
            // Only overwrite form fields that have actual values
            const merged = { ...existing };
            // Bug Fix #7: normalise exit/exitPrice
            if (!merged.exit && merged.exitPrice) merged.exit = merged.exitPrice;
            for (const [key, val] of Object.entries(trade)) {
                // Skip empty/null form values for protected fields
                if (protectedFields.includes(key) && (val === '' || val === null || val === undefined)) continue;
                // For alertType: don't overwrite AUTO_CAPTURE with MANUAL
                if (key === 'alertType' && existing.alertType === 'AUTO_CAPTURE' && val === 'MANUAL') continue;
                merged[key] = val;
            }
            merged.updatedAt = new Date().toISOString();
            // Bug Fix #4: tag as edit if was already closed
            if (existing.status === 'closed') {
                merged._wasEdit = true;
            }
            trades[index] = merged;
        }
        currentEditTradeId = null;
    } else {
        // Add new trade
        trade.id = generateId();
        trade.createdAt = new Date().toISOString();
        trades.unshift(trade);
    }
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    
    // Update settings if balance changed (Bug Fix #4: only on NEW close, not edits)
    if (trade.status === 'closed' && trade.pnl && !trade._balanceUpdated) {
        // Check if this was an edit of an already-closed trade
        const wasEdit = !!trade._wasEdit;
        if (!wasEdit) {
            updateBalanceFromTrade(trade.pnl);
            // Mark so re-saving won't double-count
            const allTrades = loadFromStorage(STORAGE_KEYS.trades, []);
            const idx = allTrades.findIndex(t => t.id === trade.id);
            if (idx !== -1) {
                allTrades[idx]._balanceUpdated = true;
                saveToStorage(STORAGE_KEYS.trades, allTrades);
            }
        }
    }
    
    clearTradeForm();
    hideEditModeBanner();
    loadTrades();
    updateDashboard();
    showToast('Trade saved successfully', 'success');
    
    // Trigger auto-backup if enabled
    triggerAutoBackup();
}

function collectTradeFormData() {
    return {
        // Section A: Metadata
        date: document.getElementById('trade-datetime')?.value || new Date().toISOString(),
        pair: document.getElementById('trade-pair')?.value || '',
        direction: document.getElementById('trade-direction')?.value || '',
        session: document.getElementById('trade-session')?.value || '',
        tradeType: document.getElementById('trade-type')?.value || '',
        permissionTF: document.getElementById('trade-permission-tf')?.value || '',
        executionTF: document.getElementById('trade-execution-tf')?.value || '',
        
        // Section B: Permission Log
        marketRegime: document.getElementById('trade-market-regime')?.value || '',
        structureQuality: document.getElementById('trade-structure-quality')?.value || '',
        volContext: document.getElementById('trade-vol-context')?.value || '',
        sessionWindow: document.getElementById('trade-session-window')?.value || '',
        permissionState: document.getElementById('trade-permission-state')?.value || '',
        permissionReason: document.getElementById('trade-permission-reason')?.value || '',
        permissionEvidence: document.getElementById('trade-permission-evidence')?.value || '',
        
        // Section C: Execution Quality
        execTypeDeclared: document.getElementById('exec-type-declared')?.checked || false,
        execSingleTrigger: document.getElementById('exec-single-trigger')?.checked || false,
        execPlannedPrice: document.getElementById('exec-planned-price')?.checked || false,
        execStopInvalidation: document.getElementById('exec-stop-invalidation')?.checked || false,
        execSpreadOk: document.getElementById('exec-spread-ok')?.checked || false,
        entryTrigger: document.getElementById('trade-entry-trigger')?.value || '',
        entry: parseFloat(document.getElementById('trade-entry')?.value) || null,
        stop: parseFloat(document.getElementById('trade-stop')?.value) || null,
        tp: parseFloat(document.getElementById('trade-tp')?.value) || null,
        exit: parseFloat(document.getElementById('trade-exit')?.value) || null,
        units: parseInt(document.getElementById('trade-units')?.value) || null,
        riskAmount: parseFloat(document.getElementById('trade-risk-amount')?.value) || null,
        riskPct: parseFloat(document.getElementById('trade-risk-pct')?.value) || 1.5,
        
        // Section D: Management Discipline
        mgmtNoEarlyStop: document.getElementById('mgmt-no-early-stop')?.checked || false,
        mgmtPartialRules: document.getElementById('mgmt-partial-rules')?.checked || false,
        mgmtExitRules: document.getElementById('mgmt-exit-rules')?.checked || false,
        mgmtNoRevenge: document.getElementById('mgmt-no-revenge')?.checked || false,
        exitReason: document.getElementById('trade-exit-reason')?.value || '',
        status: document.getElementById('trade-status')?.value || 'open',
        slippage: parseFloat(document.getElementById('trade-slippage')?.value) || 0,
        
        // Section E: Outcome Metrics
        mae: parseFloat(document.getElementById('trade-mae')?.value) || null,
        mfe: parseFloat(document.getElementById('trade-mfe')?.value) || null,
        trendScore: parseInt(document.getElementById('trade-trend-score')?.value) || null,
        
        // Section F: Post-Trade Review
        classification: document.getElementById('trade-classification')?.value || '',
        notes: document.getElementById('trade-notes')?.value || '',
        lessons: document.getElementById('trade-lessons')?.value || '',
        screenshot: document.getElementById('trade-screenshot')?.value || '',
        
        // Backwards compatibility (hidden fields)
        alertType: document.getElementById('trade-alert-type')?.value || 'MANUAL',
        entryZone: document.getElementById('trade-entry-zone')?.value || '',
        volState: document.getElementById('trade-vol-state')?.value || '',
        mtf: document.getElementById('trade-mtf')?.value || '',
        grade: document.getElementById('trade-grade')?.value || ''
    };
}

function validateTradeData(trade) {
    if (!trade.pair) {
        showToast('Please select a pair', 'warning');
        return false;
    }
    if (!trade.direction) {
        showToast('Please select direction', 'warning');
        return false;
    }
    if (!trade.entry) {
        showToast('Please enter entry price', 'warning');
        return false;
    }
    return true;
}

function calculateRMultiple(trade) {
    const { direction, entry, stop, exit } = trade;
    if (!entry || !stop || !exit) return 0;
    
    const risk = Math.abs(entry - stop);
    if (risk === 0) return 0;
    
    let pnlPips;
    if (direction === 'long') {
        pnlPips = exit - entry;
    } else {
        pnlPips = entry - exit;
    }
    
    return pnlPips / risk;
}

function calculatePnL(trade) {
    if (!trade.rMultiple || !trade.riskAmount) return 0;
    return trade.rMultiple * trade.riskAmount;
}

function updateBalanceFromTrade(pnl) {
    const settings = getSettings();
    settings.accountBalance += pnl;
    
    // Update peak if new high
    if (settings.accountBalance > settings.peakBalance) {
        settings.peakBalance = settings.accountBalance;
    }
    
    saveToStorage(STORAGE_KEYS.settings, settings);
}

function updateOpenPositions(trades) {
    const openTrades = trades.filter(t => t.status === 'open');
    const tbody = document.getElementById('open-positions-body');
    const countEl = document.getElementById('open-positions-count');
    
    if (countEl) countEl.textContent = `${openTrades.length} Open`;
    
    if (!tbody) return;
    
    if (openTrades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No open positions</td></tr>';
        return;
    }
    
    tbody.innerHTML = openTrades.map(trade => `
        <tr>
            <td>${formatDate(trade.date)}</td>
            <td><strong>${trade.pair}</strong></td>
            <td><span class="badge ${trade.direction === 'long' ? 'badge-pass' : 'badge-fail'}">${trade.direction?.toUpperCase()}</span></td>
            <td>${trade.entry || '-'}</td>
            <td>${trade.stop || '-'}</td>
            <td>${trade.tp || '-'}</td>
            <td>${trade.units?.toLocaleString() || '-'}</td>
            <td>${getAlertBadge(trade.alertType)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="editTrade('${trade.id}')">Edit</button>
                <button class="btn btn-primary btn-sm" onclick="closeTrade('${trade.id}')">Close</button>
            </td>
        </tr>
    `).join('');
}

function updateTradeHistory(trades) {
    const closedTrades = trades.filter(t => t.status === 'closed' || t.status === 'closed_pending_review' || t.status === 'complete');
    const filteredTrades = filterTradesForHistory(closedTrades);
    const tbody = document.getElementById('trade-history-body');
    
    if (!tbody) return;
    
    // Paginate
    const totalPages = Math.ceil(filteredTrades.length / TRADES_PER_PAGE);
    const startIndex = (tradeHistoryPage - 1) * TRADES_PER_PAGE;
    const pageTrades = filteredTrades.slice(startIndex, startIndex + TRADES_PER_PAGE);
    
    if (pageTrades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No trades recorded yet</td></tr>';
        updatePaginationButtons(0, 0);
        return;
    }
    
    tbody.innerHTML = pageTrades.map(trade => {
        const rVal = trade.rMultiple || trade.rValue || 0;
        const rClass = rVal > 0 ? 'text-pass' : rVal < 0 ? 'text-fail' : '';
        const isAuto = trade.autoCapture === true || trade.autoJournalled === true || trade.alertType === 'AUTO_CAPTURE';
        const sourceBadge = isAuto 
            ? '<span class="badge badge-info" title="Auto-captured from broker">AUTO</span>'
            : '<span class="badge" title="Manually entered">MAN</span>';
        return `
            <tr>
                <td>${formatDate(trade.date)}</td>
                <td><strong>${trade.pair}</strong></td>
                <td><span class="badge ${trade.direction === 'long' ? 'badge-pass' : 'badge-fail'}">${trade.direction?.toUpperCase()?.charAt(0)}</span></td>
                <td>${sourceBadge}</td>
                <td>${getAlertBadge(trade.alertType)}</td>
                <td><span class="inline-editable" onclick="inlineEditGrade('${trade.id}', this)" title="Click to edit grade">${getGradeBadge(trade.grade, trade.dismissReason)}</span></td>
                <td>${trade.entry || '-'}</td>
                <td>${trade.exit || trade.exitPrice || '-'}</td>
                <td class="${rClass}"><strong>${formatNumber(rVal, 2)}R</strong></td>
                <td><span class="inline-editable" onclick="inlineEditScore('${trade.id}', this, ${trade.trendScore || 0})" title="Click to edit score">${trade.trendScore || '-'}</span></td>
                <td><span class="inline-editable" onclick="inlineEditZone('${trade.id}', this, '${trade.entryZone || ''}')" title="Click to edit zone">${getZoneBadge(trade.entryZone)}</span></td>
                <td style="white-space:nowrap;">
                    ${!trade.grade ? `<button class="btn btn-sm" style="background:#6b7280;color:#fff;font-size:0.65rem;padding:2px 6px;" onclick="dismissTrade('${trade.id}')" title="Dismiss as test/legacy">DIS</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="editTrade('${trade.id}')" title="Edit full trade">&#x270E;</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTrade('${trade.id}')" title="Delete trade">&#x1F5D1;</button>
                </td>
            </tr>
        `;
    }).join('');
    
    updatePaginationButtons(tradeHistoryPage, totalPages);
}

function filterTradesForHistory(trades) {
    const pairFilter = document.getElementById('filter-pair')?.value || '';
    const alertFilter = document.getElementById('filter-alert')?.value || '';
    const gradeFilter = document.getElementById('filter-grade')?.value || '';
    const resultFilter = document.getElementById('filter-result')?.value || '';
    const sourceFilter = document.getElementById('filter-source')?.value || '';
    
    return trades.filter(trade => {
        if (pairFilter && trade.pair !== pairFilter) return false;
        if (alertFilter && trade.alertType !== alertFilter) return false;
        if (gradeFilter) {
            if (gradeFilter === 'none' && trade.grade) return false;
            if (gradeFilter !== 'none' && trade.grade !== gradeFilter) return false;
        }
        if (resultFilter) {
            const r = trade.rMultiple || trade.rValue || 0;
            if (resultFilter === 'win' && r <= 0) return false;
            if (resultFilter === 'loss' && r >= 0) return false;
            if (resultFilter === 'breakeven' && Math.abs(r) > 0.1) return false;
        }
        if (sourceFilter) {
            const isAuto = trade.autoCapture === true || trade.autoJournalled === true || trade.alertType === 'AUTO_CAPTURE';
            if (sourceFilter === 'auto' && !isAuto) return false;
            if (sourceFilter === 'manual' && isAuto) return false;
        }
        return true;
    });
}

function filterTrades() {
    tradeHistoryPage = 1;
    loadTrades();
}

function updateTradeCount(trades) {
    const closedTrades = trades.filter(t => t.status === 'closed' || t.status === 'closed_pending_review' || t.status === 'complete');
    const countEl = document.getElementById('trade-count');
    if (countEl) countEl.textContent = `${closedTrades.length} trades`;
    
    // Update bulk dismiss button visibility and count
    const ungradedCount = closedTrades.filter(t => !t.grade).length;
    const bulkBtn = document.getElementById('bulk-dismiss-btn');
    if (bulkBtn) {
        if (ungradedCount > 0) {
            bulkBtn.style.display = '';
            bulkBtn.innerHTML = `&#x1F5D1; Dismiss Ungraded (${ungradedCount})`;
        } else {
            bulkBtn.style.display = 'none';
        }
    }
}

function updatePaginationButtons(currentPage, totalPages) {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => { tradeHistoryPage--; loadTrades(); };
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => { tradeHistoryPage++; loadTrades(); };
    }
}

function getAlertBadge(alertType) {
    const badges = {
        'TRADE_READY': '<span class="badge badge-pass">READY</span>',
        'STRONG_BULL': '<span class="badge badge-info">AB</span>',
        'STRONG_BEAR': '<span class="badge badge-info">AS</span>',
        'PERFECT_BULL': '<span class="badge badge-perfect">A+B</span>',
        'PERFECT_BEAR': '<span class="badge badge-perfect">A+S</span>',
        'MANUAL': '<span class="badge">MANUAL</span>'
    };
    return badges[alertType] || '<span class="badge">-</span>';
}

function getZoneBadge(zone) {
    const badges = {
        'HOT': '<span class="zone-badge zone-hot">HOT</span>',
        'OPTIMAL': '<span class="zone-badge zone-optimal">OPT</span>',
        'ACCEPTABLE': '<span class="zone-badge zone-acceptable">ACC</span>',
        'EXTENDED': '<span class="zone-badge zone-extended">EXT</span>'
    };
    return badges[zone] || '-';
}

function editTrade(tradeId) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const trade = trades.find(t => t.id === tradeId);
    
    if (!trade) {
        showToast('Trade not found', 'error');
        return;
    }
    
    currentEditTradeId = tradeId;
    
    // Populate form
    document.getElementById('trade-datetime').value = trade.date?.slice(0, 16) || '';
    document.getElementById('trade-pair').value = trade.pair || '';
    document.getElementById('trade-direction').value = trade.direction || '';
    document.getElementById('trade-entry').value = trade.entry || '';
    document.getElementById('trade-stop').value = trade.stop || '';
    document.getElementById('trade-tp').value = trade.tp || '';
    document.getElementById('trade-exit').value = trade.exit || trade.exitPrice || '';
    document.getElementById('trade-units').value = trade.units || '';
    document.getElementById('trade-risk-amount').value = trade.riskAmount || '';
    document.getElementById('trade-alert-type').value = trade.alertType || 'MANUAL';
    document.getElementById('trade-trend-score').value = trade.trendScore || '';
    document.getElementById('trade-entry-zone').value = trade.entryZone || '';
    document.getElementById('trade-vol-state').value = trade.volState || '';
    document.getElementById('trade-mtf').value = trade.mtf || '';
    document.getElementById('trade-grade').value = trade.grade || '';
    document.getElementById('trade-session').value = trade.session || '';
    document.getElementById('trade-exit-reason').value = trade.exitReason || '';
    document.getElementById('trade-screenshot').value = trade.screenshot || '';
    document.getElementById('trade-status').value = trade.status || 'open';
    document.getElementById('trade-notes').value = trade.notes || '';
    document.getElementById('trade-lessons').value = trade.lessons || '';
    
    // v2.10.0: Populate ALL missing fields (Bug Fix #1,2,3)
    // Checkboxes - Section C: Execution Quality
    const setCheckbox = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    setCheckbox('exec-type-declared', trade.execTypeDeclared);
    setCheckbox('exec-single-trigger', trade.execSingleTrigger);
    setCheckbox('exec-planned-price', trade.execPlannedPrice);
    setCheckbox('exec-stop-invalidation', trade.execStopInvalidation);
    setCheckbox('exec-spread-ok', trade.execSpreadOk);
    // Checkboxes - Section D: Management Discipline
    setCheckbox('mgmt-no-early-stop', trade.mgmtNoEarlyStop);
    setCheckbox('mgmt-partial-rules', trade.mgmtPartialRules);
    setCheckbox('mgmt-exit-rules', trade.mgmtExitRules);
    setCheckbox('mgmt-no-revenge', trade.mgmtNoRevenge);
    // Missing text/select fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null && val !== undefined) el.value = val; };
    setVal('trade-type', trade.tradeType);
    setVal('trade-permission-tf', trade.permissionTF);
    setVal('trade-execution-tf', trade.executionTF);
    setVal('trade-entry-trigger', trade.entryTrigger);
    setVal('trade-risk-pct', trade.riskPct);
    setVal('trade-slippage', trade.slippage);
    setVal('trade-mae', trade.mae);
    setVal('trade-mfe', trade.mfe);
    setVal('trade-classification', trade.classification);
    
    // v2.10.0: Show edit mode banner (Bug Fix #6)
    showEditModeBanner(trade);
    
    // v2.9.0: Populate permission log hidden fields + read-only display
    const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setIfExists('trade-market-regime', trade.marketRegime);
    setIfExists('trade-structure-quality', trade.structureQuality);
    setIfExists('trade-vol-context', trade.volContext);
    setIfExists('trade-session-window', trade.sessionWindow);
    setIfExists('trade-permission-state', trade.permissionState);
    setIfExists('trade-permission-reason', trade.permissionReason);
    setIfExists('trade-permission-evidence', trade.permissionEvidence);
    updatePermissionLogDisplay();
    
    // Scroll to form
    document.querySelector('#tab-journal .card').scrollIntoView({ behavior: 'smooth' });
    showToast('Editing trade - make changes and save', 'info');
}

function closeTrade(tradeId) {
    const exitPrice = prompt('Enter exit price:');
    if (!exitPrice) return;
    
    const exitReason = prompt('Exit reason (TP_HIT, SL_HIT, MANUAL_WIN, MANUAL_LOSS, etc.):');
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) {
        showToast('Trade not found', 'error');
        return;
    }
    
    trades[index].exit = parseFloat(exitPrice);
    trades[index].exitReason = exitReason || 'MANUAL';
    trades[index].status = 'closed';
    trades[index].closedAt = new Date().toISOString();
    
    // Calculate R-multiple
    trades[index].rMultiple = calculateRMultiple(trades[index]);
    trades[index].pnl = calculatePnL(trades[index]);
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    
    // Update balance
    if (trades[index].pnl) {
        updateBalanceFromTrade(trades[index].pnl);
    }
    
    loadTrades();
    updateDashboard();
    showToast('Trade closed', 'success');
}

function deleteTrade(tradeId) {
    if (!confirm('Are you sure you want to delete this trade?')) return;
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const filtered = trades.filter(t => t.id !== tradeId);
    
    saveToStorage(STORAGE_KEYS.trades, filtered);
    loadTrades();
    showToast('Trade deleted', 'info');
}

/**
 * Dismiss a single trade as test/legacy with reason code
 */
function dismissTrade(tradeId) {
    const reasons = ['TEST', 'LEGACY', 'CANNOT_RECALL', 'DUPLICATE'];
    const reason = prompt(
        'Dismiss reason:\n\n' +
        '1 = TEST (test/practice trade)\n' +
        '2 = LEGACY (old trade, no longer relevant)\n' +
        '3 = CANNOT_RECALL (cannot remember reasoning)\n' +
        '4 = DUPLICATE (duplicate entry)\n\n' +
        'Enter 1-4:'
    );
    
    if (!reason) return;
    const reasonIndex = parseInt(reason) - 1;
    if (isNaN(reasonIndex) || reasonIndex < 0 || reasonIndex >= reasons.length) {
        showToast('Invalid selection. Enter 1-4.', 'warning');
        return;
    }
    
    const dismissReason = reasons[reasonIndex];
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const trade = trades.find(t => t.id === tradeId);
    
    if (trade) {
        trade.grade = 'DIS';
        trade.status = 'complete';
        trade.dismissReason = dismissReason;
        trade.dismissedAt = new Date().toISOString();
        trade.notes = (trade.notes || '') + `\n[${new Date().toLocaleString()}] Dismissed: ${dismissReason}`;
        saveToStorage(STORAGE_KEYS.trades, trades);
        // v2.8.1: Also dismiss in TradeCapture (pending trades store)
        if (typeof TradeCapture !== 'undefined' && TradeCapture.dismissTrade) {
            TradeCapture.dismissTrade(tradeId, dismissReason);
        }
        loadTrades();
        // v2.8.2: Refresh review queue banner
        if (typeof BrokerDashboard !== 'undefined' && BrokerDashboard.reviewQueue) {
            BrokerDashboard.reviewQueue.renderBanner();
        }
        showToast(`Trade dismissed: ${dismissReason}`, 'info');
    }
}

/**
 * Bulk dismiss all ungraded closed trades
 */
function bulkDismissTrades() {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const ungraded = trades.filter(t => t.status === 'closed' && !t.grade);
    
    if (ungraded.length === 0) {
        showToast('No ungraded trades to dismiss', 'info');
        return;
    }
    
    const reasons = ['TEST', 'LEGACY', 'CANNOT_RECALL'];
    const reason = prompt(
        `Bulk dismiss ${ungraded.length} ungraded trade(s).\n\n` +
        'Dismiss reason for ALL:\n' +
        '1 = TEST (test/practice trades)\n' +
        '2 = LEGACY (old trades, no longer relevant)\n' +
        '3 = CANNOT_RECALL (cannot remember reasoning)\n\n' +
        'Enter 1-3:'
    );
    
    if (!reason) return;
    const reasonIndex = parseInt(reason) - 1;
    if (isNaN(reasonIndex) || reasonIndex < 0 || reasonIndex >= reasons.length) {
        showToast('Invalid selection. Enter 1-3.', 'warning');
        return;
    }
    
    const dismissReason = reasons[reasonIndex];
    
    if (!confirm(`Dismiss ${ungraded.length} trades as ${dismissReason}? This cannot be easily undone.`)) return;
    
    const now = new Date().toISOString();
    let count = 0;
    trades.forEach(t => {
        if ((t.status === 'closed' || t.status === 'closed_pending_review') && !t.grade) {
            t.grade = 'DIS';
            t.status = 'complete';
            t.dismissReason = dismissReason;
            t.dismissedAt = now;
            t.notes = (t.notes || '') + `\n[${new Date().toLocaleString()}] Bulk dismissed: ${dismissReason}`;
            count++;
        }
    });
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    // v2.8.1: Also bulk dismiss in TradeCapture (pending trades store)
    if (typeof TradeCapture !== 'undefined' && TradeCapture.bulkDismissPendingTrades) {
        TradeCapture.bulkDismissPendingTrades(dismissReason);
    }
    loadTrades();
    // v2.8.2: Refresh review queue banner
    if (typeof BrokerDashboard !== 'undefined' && BrokerDashboard.reviewQueue) {
        BrokerDashboard.reviewQueue.renderBanner();
    }
    showToast(`${count} trades dismissed as ${dismissReason}`, 'success');
}

function clearTradeForm() {
    currentEditTradeId = null;
    
    document.querySelectorAll('#tab-journal .card:first-child input').forEach(el => {
        if (el.type === 'datetime-local') {
            el.value = new Date().toISOString().slice(0, 16);
        } else if (el.type === 'checkbox') {
            el.checked = false;
        } else if (el.type !== 'hidden') {
            el.value = '';
        }
    });
    document.querySelectorAll('#tab-journal .card:first-child select').forEach(el => {
        el.selectedIndex = 0;
    });
    document.querySelectorAll('#tab-journal .card:first-child textarea').forEach(el => {
        el.value = '';
    });
    
    // Reset permission read-only display
    ['perm-display-regime', 'perm-display-structure', 'perm-display-vol',
     'perm-display-session', 'perm-display-state', 'perm-display-reason'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = '--'; el.style.color = ''; }
    });
    // Clear hidden permission fields
    ['trade-market-regime', 'trade-structure-quality', 'trade-vol-context',
     'trade-session-window', 'trade-permission-state', 'trade-permission-reason',
     'trade-permission-evidence'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // v2.10.0: Hide edit mode banner
    hideEditModeBanner();
}

// v2.10.0: Edit mode UI (Bug Fix #6)
function showEditModeBanner(trade) {
    const banner = document.getElementById('edit-mode-banner');
    const detail = document.getElementById('edit-mode-detail');
    if (banner) {
        banner.style.display = 'block';
        const isAuto = trade.autoCapture || trade.autoJournalled || trade.alertType === 'AUTO_CAPTURE';
        const source = isAuto ? 'Auto-captured' : 'Manual';
        if (detail) detail.textContent = trade.pair + ' ' + (trade.direction || '').toUpperCase() + ' | ' + source + ' | ID: ' + (trade.id || '').slice(0, 12);
    }
}

function hideEditModeBanner() {
    const banner = document.getElementById('edit-mode-banner');
    if (banner) banner.style.display = 'none';
}

function cancelEditMode() {
    clearTradeForm();
    showToast('Edit cancelled', 'info');
}

// v2.9.0: Update read-only permission log display from hidden fields
function updatePermissionLogDisplay() {
    const get = (id) => document.getElementById(id)?.value || '--';
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    
    set('perm-display-regime', get('trade-market-regime').charAt(0).toUpperCase() + get('trade-market-regime').slice(1));
    set('perm-display-structure', get('trade-structure-quality').charAt(0).toUpperCase() + get('trade-structure-quality').slice(1));
    set('perm-display-vol', get('trade-vol-context').charAt(0).toUpperCase() + get('trade-vol-context').slice(1));
    set('perm-display-session', get('trade-session-window').charAt(0).toUpperCase() + get('trade-session-window').slice(1));
    
    const stateVal = get('trade-permission-state').toUpperCase();
    const stateEl = document.getElementById('perm-display-state');
    if (stateEl) {
        stateEl.textContent = stateVal || '--';
        stateEl.style.color = stateVal === 'FULL' ? 'var(--color-pass)' :
            stateVal === 'CONDITIONAL' ? 'var(--color-warning)' :
            stateVal === 'OVERRIDE' || stateVal === 'VIOLATION' ? 'var(--color-fail)' : '';
        stateEl.style.fontWeight = '600';
    }
    
    set('perm-display-reason', get('trade-permission-reason'));
}

// Permission state change handler
function onPermissionStateChange() {
    var state = document.getElementById('trade-permission-state');
    var stateVal = state ? state.value : '';
    var warning = document.getElementById('permission-violation-warning');
    if (warning) {
        warning.style.display = (stateVal === 'violation' || stateVal === 'override') ? 'block' : 'none';
    }
}

// Auto-resolve permission decision from the 5 context fields
function resolvePermissionDecision() {
    var regime = document.getElementById('trade-market-regime');
    var structure = document.getElementById('trade-structure-quality');
    var vol = document.getElementById('trade-vol-context');
    var session = document.getElementById('trade-session-window');
    var permState = document.getElementById('trade-permission-state');
    
    var regimeVal = regime ? regime.value : '';
    var structVal = structure ? structure.value : '';
    var volVal = vol ? vol.value : '';
    var sessionVal = session ? session.value : '';
    var permVal = permState ? permState.value : '';
    
    var decisionEl = document.getElementById('permission-decision');
    var decisionValEl = document.getElementById('permission-decision-value');
    var blockWarn = document.getElementById('permission-block-warning');
    
    // Need at least one field filled to show anything
    var anyFilled = regimeVal || structVal || volVal || sessionVal;
    if (!anyFilled) {
        if (decisionEl) decisionEl.style.display = 'none';
        if (blockWarn) blockWarn.style.display = 'none';
        return;
    }
    
    // Hard-block conditions
    var blocks = [];
    if (regimeVal === 'transition') blocks.push('Transition regime');
    if (structVal === 'damaged') blocks.push('Damaged structure');
    if (sessionVal === 'dead') blocks.push('Dead zone');
    
    // Conditional conditions
    var conditionals = [];
    if (regimeVal === 'balanced') conditionals.push('Balanced regime');
    if (regimeVal === 'compression') conditionals.push('Compression regime');
    if (structVal === 'overlapping') conditionals.push('Overlapping structure');
    if (volVal === 'divergent') conditionals.push('Divergent volatility');
    if (volVal === 'contracting') conditionals.push('Contracting volatility');
    if (sessionVal === 'sweep') conditionals.push('Sweep window');
    
    var decision = '';
    var cssClass = '';
    
    if (blocks.length > 0) {
        decision = 'BLOCKED \u2014 ' + blocks.join('; ');
        cssClass = 'decision-blocked';
    } else if (conditionals.length > 0) {
        decision = 'CONDITIONAL \u2014 ' + conditionals.join('; ') + ' \u2192 reduced size + stricter filters';
        cssClass = 'decision-conditional';
    } else if (regimeVal && structVal && volVal && sessionVal) {
        decision = 'FULL \u2014 all fields supportive';
        cssClass = 'decision-full';
    } else {
        decision = 'INCOMPLETE \u2014 fill all fields';
        cssClass = 'decision-conditional';
    }
    
    if (decisionEl) {
        decisionEl.style.display = 'flex';
        decisionEl.className = 'permission-decision ' + cssClass;
    }
    if (decisionValEl) {
        decisionValEl.textContent = decision;
    }
    
    // Show block warning if hard-block detected but permission is not OVERRIDE
    if (blockWarn) {
        blockWarn.style.display = (blocks.length > 0 && permVal !== 'override' && permVal !== '') ? 'block' : 'none';
    }
    
    // Also trigger the existing violation warning check
    onPermissionStateChange();
}

// Add event listeners when DOM ready
document.addEventListener('DOMContentLoaded', function() {
    var permSelect = document.getElementById('trade-permission-state');
    if (permSelect) {
        permSelect.addEventListener('change', onPermissionStateChange);
        permSelect.addEventListener('change', resolvePermissionDecision);
    }
    
    // Listen to all 5 permission log dropdowns
    var permFields = [
        'trade-market-regime', 'trade-structure-quality',
        'trade-vol-context', 'trade-session-window',
        'trade-permission-state'
    ];
    for (var i = 0; i < permFields.length; i++) {
        var el = document.getElementById(permFields[i]);
        if (el) {
            el.addEventListener('change', resolvePermissionDecision);
        }
    }
});

// ============================================
// PHASE 2: EXIT STRATEGY ENHANCEMENT
// ============================================

// Check if it's Friday close warning time (Friday after 4pm AEST)
function checkFridayWarning() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 5=Fri
    const hour = now.getHours();
    
    // Friday after 4pm AEST
    if (day === 5 && hour >= 16) {
        const trades = loadFromStorage(STORAGE_KEYS.trades, []);
        const openTrades = trades.filter(t => t.status === 'open');
        
        if (openTrades.length > 0) {
            const banner = document.getElementById('friday-warning-banner');
            if (banner) banner.style.display = 'block';
            return true;
        }
    }
    
    const banner = document.getElementById('friday-warning-banner');
    if (banner) banner.style.display = 'none';
    return false;
}

function dismissFridayWarning() {
    const banner = document.getElementById('friday-warning-banner');
    if (banner) banner.style.display = 'none';
    sessionStorage.setItem('fridayWarningDismissed', 'true');
}

function reviewAllOpenTrades() {
    showTab('journal');
    showToast('Review each open position and decide: Close or Hold', 'warning');
}

// Calculate trade age in hours
function getTradeAgeHours(tradeDate) {
    const now = new Date();
    const opened = new Date(tradeDate);
    return (now - opened) / (1000 * 60 * 60);
}

// Get trade age display string
function formatTradeAge(hours) {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
}

// Update Active Trade Management Panel
function updateActiveTradeManagement() {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const openTrades = trades.filter(t => t.status === 'open');
    
    // Update counts
    const countEl = document.getElementById('open-positions-count');
    if (countEl) countEl.textContent = `${openTrades.length} Open`;
    
    // Update protocol summary
    let awaitingTP1 = 0, atBreakeven = 0, trailing = 0, needReview = 0;
    
    openTrades.forEach(trade => {
        const ageHours = getTradeAgeHours(trade.date);
        
        if (!trade.tp1Hit) awaitingTP1++;
        if (trade.slMovedToBE) atBreakeven++;
        if (trade.trailingActive) trailing++;
        if (ageHours >= 24 && !trade.timeWarningAcknowledged) needReview++;
    });
    
    document.getElementById('trades-awaiting-tp1').textContent = awaitingTP1;
    document.getElementById('trades-at-breakeven').textContent = atBreakeven;
    document.getElementById('trades-trailing').textContent = trailing;
    document.getElementById('trades-needing-review').textContent = needReview;
    
    // Highlight review stat if needed
    const reviewStat = document.getElementById('trades-needing-review-stat');
    if (reviewStat) {
        reviewStat.style.display = needReview > 0 ? 'block' : 'block';
        reviewStat.classList.toggle('protocol-stat-warning', needReview > 0);
    }
    
    // Render active trades list
    const listEl = document.getElementById('active-trades-list');
    const noTradesEl = document.getElementById('no-active-trades');
    const quickActionsEl = document.getElementById('quick-actions-bar');
    
    if (openTrades.length === 0) {
        if (noTradesEl) noTradesEl.style.display = 'block';
        if (quickActionsEl) quickActionsEl.style.display = 'none';
        return;
    }
    
    if (noTradesEl) noTradesEl.style.display = 'none';
    if (quickActionsEl) quickActionsEl.style.display = 'flex';
    
    listEl.innerHTML = openTrades.map(trade => renderActiveTradeCard(trade)).join('');
    
    // Check Friday warning
    checkFridayWarning();
}

// Render a single active trade card
function renderActiveTradeCard(trade) {
    const ageHours = getTradeAgeHours(trade.date);
    const ageStr = formatTradeAge(ageHours);
    
    // Determine card state
    let cardClass = 'active-trade-card';
    let ageClass = 'trade-age';
    
    if (ageHours >= 48) {
        cardClass += ' critical';
        ageClass += ' age-critical';
    } else if (ageHours >= 24) {
        cardClass += ' needs-review';
        ageClass += ' age-warning';
    }
    
    if (trade.slMovedToBE) {
        cardClass += ' at-breakeven';
    }
    
    // Calculate current partial close percentage
    const partialsClosed = (trade.partialCloses || []).reduce((sum, p) => sum + p.percent, 0);
    
    // Volatility-based trail recommendation
    const volState = trade.volState || 'TREND';
    const trailRec = getTrailRecommendation(volState);
    
    return `
        <div class="${cardClass}" data-trade-id="${trade.id}">
            <div class="active-trade-header">
                <div class="trade-pair-dir">
                    <strong>${trade.pair}</strong>
                    <span class="badge ${trade.direction === 'long' ? 'badge-pass' : 'badge-fail'}">${trade.direction?.toUpperCase()}</span>
                </div>
                <div class="${ageClass}">
                    <span>&#x23F1;</span>
                    <span>${ageStr}</span>
                    ${ageHours >= 24 ? '<span class="badge badge-warning">REVIEW</span>' : ''}
                </div>
            </div>
            
            <div class="active-trade-body">
                <div class="trade-levels-row">
                    <div class="trade-level">
                        <span class="trade-level-label">Entry</span>
                        <span class="trade-level-value">${trade.entry || '--'}</span>
                    </div>
                    <div class="trade-level">
                        <span class="trade-level-label">Stop</span>
                        <span class="trade-level-value" style="color: var(--color-fail);">${trade.stop || '--'}</span>
                    </div>
                    <div class="trade-level">
                        <span class="trade-level-label">TP1</span>
                        <span class="trade-level-value" style="color: var(--color-pass);">${trade.tp || '--'}</span>
                    </div>
                    <div class="trade-level">
                        <span class="trade-level-label">Units</span>
                        <span class="trade-level-value">${trade.units?.toLocaleString() || '--'}</span>
                    </div>
                </div>
                
                <!-- Exit Protocol Status -->
                <div class="exit-protocol-row">
                    <div class="protocol-step">
                        <span class="protocol-step-icon ${trade.tp1Hit ? 'complete' : 'pending'}">${trade.tp1Hit ? '&#x2713;' : '1'}</span>
                        <span class="protocol-step-text ${trade.tp1Hit ? 'complete' : ''}">TP1 Hit - Close 50%</span>
                    </div>
                    <div class="protocol-step">
                        <span class="protocol-step-icon ${trade.slMovedToBE ? 'complete' : 'pending'}">${trade.slMovedToBE ? '&#x2713;' : '2'}</span>
                        <span class="protocol-step-text ${trade.slMovedToBE ? 'complete' : ''}">Move SL to BE</span>
                    </div>
                    <div class="protocol-step">
                        <span class="protocol-step-icon ${trade.trailingActive ? 'complete' : 'pending'}">${trade.trailingActive ? '&#x2713;' : '3'}</span>
                        <span class="protocol-step-text ${trade.trailingActive ? 'complete' : ''}">Trail Stop</span>
                    </div>
                </div>
                
                ${!trade.tp1Hit && volState ? `
                <div class="vol-trail-recommendation">
                    <strong>${volState}:</strong> ${trailRec.recommendation}
                </div>
                ` : ''}
                
                ${partialsClosed > 0 ? `
                <div class="partial-close-tracker">
                    <div class="partial-bar">
                        <div class="partial-fill" style="width: ${partialsClosed}%;"></div>
                    </div>
                    <div class="partial-labels">
                        <span>${partialsClosed}% closed</span>
                        <span>${100 - partialsClosed}% remaining</span>
                    </div>
                </div>
                ` : ''}
                
                <!-- Trade Actions -->
                <div class="trade-actions">
                    ${!trade.tp1Hit ? `
                    <button class="btn btn-sm btn-tp1" onclick="recordTP1Hit('${trade.id}')">&#x1F4B0; TP1 Hit - Close 50%</button>
                    ` : ''}
                    ${trade.tp1Hit && !trade.slMovedToBE ? `
                    <button class="btn btn-sm btn-be" onclick="moveToBE('${trade.id}')">&#x1F6E1; Move SL to BE</button>
                    ` : ''}
                    ${trade.slMovedToBE && !trade.trailingActive ? `
                    <button class="btn btn-sm btn-trail" onclick="openTrailModal('${trade.id}')">&#x1F4C8; Set Trail Stop</button>
                    ` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="editTrade('${trade.id}')">&#x270F; Edit</button>
                    <button class="btn btn-sm btn-primary" onclick="closeTrade('${trade.id}')">Close Trade</button>
                    ${ageHours >= 24 ? `
                    <button class="btn btn-sm btn-warning" onclick="acknowledgeTimeWarning('${trade.id}')">Reviewed &#x2713;</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Get volatility-based trail recommendation
function getTrailRecommendation(volState) {
    const recommendations = {
        'TREND': { 
            recommendation: 'Trail behind swing points. Standard trailing.',
            atrMultiple: 1.5
        },
        'EXPLODE': { 
            recommendation: 'Use wider trail (2x ATR) - expect larger swings.',
            atrMultiple: 2.0
        },
        'QUIET': { 
            recommendation: 'Tighter trail (1x ATR) - smaller moves expected.',
            atrMultiple: 1.0
        },
        'NORMAL': { 
            recommendation: 'Standard trail (1.5x ATR).',
            atrMultiple: 1.5
        },
        'LOW': { 
            recommendation: 'Consider manual trail or breakeven only - low follow-through.',
            atrMultiple: 1.0
        }
    };
    return recommendations[volState] || recommendations['TREND'];
}

// Record TP1 hit and partial close
function recordTP1Hit(tradeId) {
    const closePercent = 50; // Standard 50% close at TP1
    const exitPrice = prompt('Enter TP1 exit price:');
    if (!exitPrice) return;
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) {
        showToast('Trade not found', 'error');
        return;
    }
    
    const trade = trades[index];
    
    // Initialize arrays if needed
    if (!trade.partialCloses) trade.partialCloses = [];
    
    // Record partial close
    trade.partialCloses.push({
        percent: closePercent,
        price: parseFloat(exitPrice),
        time: new Date().toISOString(),
        type: 'TP1'
    });
    
    trade.tp1Hit = true;
    trade.tp1HitAt = new Date().toISOString();
    trade.tp1ClosePercent = closePercent;
    
    // Update units remaining
    if (trade.units) {
        trade.unitsRemaining = Math.round(trade.units * (1 - closePercent / 100));
    }
    
    // Auto-suggest moving SL to BE
    trade.notes = (trade.notes || '') + `\n[${new Date().toLocaleString()}] TP1 hit @ ${exitPrice}. Closed ${closePercent}%.`;
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    updateActiveTradeManagement();
    loadTrades();
    
    showToast(`TP1 recorded! ${closePercent}% closed @ ${exitPrice}. Now move SL to breakeven.`, 'success');
}

// Move stop loss to breakeven
function moveToBE(tradeId) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) {
        showToast('Trade not found', 'error');
        return;
    }
    
    const trade = trades[index];
    
    // Move SL to entry (breakeven)
    const originalSL = trade.stop;
    trade.stop = trade.entry;
    trade.slMovedToBE = true;
    trade.slMovedToBEAt = new Date().toISOString();
    
    // Track SL history
    if (!trade.slHistory) trade.slHistory = [];
    trade.slHistory.push({
        from: originalSL,
        to: trade.entry,
        time: new Date().toISOString(),
        reason: 'MOVE_TO_BE'
    });
    
    trade.notes = (trade.notes || '') + `\n[${new Date().toLocaleString()}] SL moved to BE @ ${trade.entry}`;
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    updateActiveTradeManagement();
    loadTrades();
    
    showToast(`Stop loss moved to breakeven @ ${trade.entry}. Risk-free trade!`, 'success');
}

// Open trailing stop modal
function openTrailModal(tradeId) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const trade = trades.find(t => t.id === tradeId);
    
    if (!trade) {
        showToast('Trade not found', 'error');
        return;
    }
    
    const volState = trade.volState || 'TREND';
    const trailRec = getTrailRecommendation(volState);
    
    const modalHtml = `
        <div class="trail-modal-overlay" id="trail-modal-overlay" onclick="closeTrailModal(event)">
            <div class="trail-modal" onclick="event.stopPropagation()">
                <h3>&#x1F4C8; Set Trailing Stop for ${trade.pair}</h3>
                
                <div class="vol-trail-recommendation">
                    <strong>Volatility: ${volState}</strong><br>
                    ${trailRec.recommendation}
                </div>
                
                <div class="trail-option-card" onclick="selectTrailOption(this, 'structure')" data-option="structure">
                    <div class="trail-option-title">&#x1F4CD; Structure Trail</div>
                    <div class="trail-option-desc">Trail behind swing highs/lows (manual updates)</div>
                </div>
                
                <div class="trail-option-card" onclick="selectTrailOption(this, 'atr')" data-option="atr">
                    <div class="trail-option-title">&#x1F4CA; ATR Trail (${trailRec.atrMultiple}x)</div>
                    <div class="trail-option-desc">Volatility-adjusted trail based on ${volState} state</div>
                    <input type="number" class="form-input mt-sm" id="trail-atr-input" value="${trailRec.atrMultiple}" step="0.5" min="0.5" max="3" placeholder="ATR Multiple">
                </div>
                
                <div class="trail-option-card" onclick="selectTrailOption(this, 'fixed')" data-option="fixed">
                    <div class="trail-option-title">&#x1F4CD; Fixed Pips Trail</div>
                    <div class="trail-option-desc">Trail by fixed pip distance</div>
                    <input type="number" class="form-input mt-sm" id="trail-fixed-input" value="20" min="5" max="100" placeholder="Pips">
                </div>
                
                <div class="flex gap-sm mt-md">
                    <button class="btn btn-primary" onclick="applyTrailStop('${tradeId}')">Apply Trail</button>
                    <button class="btn btn-secondary" onclick="closeTrailModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function selectTrailOption(el, option) {
    document.querySelectorAll('.trail-option-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    el.dataset.selected = 'true';
}

function closeTrailModal(event) {
    if (event && event.target.id !== 'trail-modal-overlay') return;
    const modal = document.getElementById('trail-modal-overlay');
    if (modal) modal.remove();
}

function applyTrailStop(tradeId) {
    const selectedOption = document.querySelector('.trail-option-card.selected');
    if (!selectedOption) {
        showToast('Please select a trail method', 'warning');
        return;
    }
    
    const option = selectedOption.dataset.option;
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) {
        showToast('Trade not found', 'error');
        return;
    }
    
    const trade = trades[index];
    trade.trailingActive = true;
    trade.trailMethod = option;
    
    if (option === 'atr') {
        trade.trailAtrMultiple = parseFloat(document.getElementById('trail-atr-input').value) || 1.5;
    } else if (option === 'fixed') {
        trade.trailFixedPips = parseInt(document.getElementById('trail-fixed-input').value) || 20;
    }
    
    if (!trade.trailingStopHistory) trade.trailingStopHistory = [];
    trade.trailingStopHistory.push({
        method: option,
        time: new Date().toISOString(),
        params: option === 'atr' ? trade.trailAtrMultiple : option === 'fixed' ? trade.trailFixedPips : 'structure'
    });
    
    trade.notes = (trade.notes || '') + `\n[${new Date().toLocaleString()}] Trail stop activated: ${option.toUpperCase()}`;
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    closeTrailModal();
    updateActiveTradeManagement();
    loadTrades();
    
    showToast(`Trailing stop activated: ${option.toUpperCase()}`, 'success');
}

// Acknowledge time warning for a trade
function acknowledgeTimeWarning(tradeId) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) return;
    
    trades[index].timeWarningAcknowledged = true;
    trades[index].lastReviewedAt = new Date().toISOString();
    trades[index].notes = (trades[index].notes || '') + `\n[${new Date().toLocaleString()}] Time warning reviewed - trade held.`;
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    updateActiveTradeManagement();
    
    showToast('Trade reviewed and acknowledged', 'info');
}

// Refresh trade ages
function refreshTradeAges() {
    updateActiveTradeManagement();
    showToast('Trade ages refreshed', 'info');
}

// Move all open trades to breakeven
function moveAllToBE() {
    if (!confirm('Move ALL open trades to breakeven? This requires TP1 to be hit first for proper protocol.')) return;
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    let moved = 0;
    
    trades.forEach(trade => {
        if (trade.status === 'open' && trade.tp1Hit && !trade.slMovedToBE) {
            trade.stop = trade.entry;
            trade.slMovedToBE = true;
            trade.slMovedToBEAt = new Date().toISOString();
            moved++;
        }
    });
    
    if (moved > 0) {
        saveToStorage(STORAGE_KEYS.trades, trades);
        updateActiveTradeManagement();
        loadTrades();
        showToast(`${moved} trades moved to breakeven`, 'success');
    } else {
        showToast('No eligible trades (need TP1 hit first)', 'warning');
    }
}

// Close all open trades at market
function closeAllAtMarket() {
    if (!confirm('WARNING: CLOSE ALL OPEN TRADES AT MARKET? This cannot be undone!')) return;
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const openTrades = trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        showToast('No open trades to close', 'info');
        return;
    }
    
    const exitPrice = prompt('Enter current market price (or leave blank for manual entry per trade):');
    
    openTrades.forEach(trade => {
        const idx = trades.findIndex(t => t.id === trade.id);
        if (idx !== -1) {
            if (exitPrice) {
                trades[idx].exit = parseFloat(exitPrice);
            }
            trades[idx].status = 'closed';
            trades[idx].exitReason = 'CLOSE_ALL';
            trades[idx].closedAt = new Date().toISOString();
            trades[idx].rMultiple = calculateRMultiple(trades[idx]);
        }
    });
    
    saveToStorage(STORAGE_KEYS.trades, trades);
    updateActiveTradeManagement();
    loadTrades();
    updateDashboard();
    
    showToast(`${openTrades.length} trades closed`, 'success');
}

// Initialize Phase 2 on load
function initPhase2ExitStrategy() {
    // Run on journal tab shown
    updateActiveTradeManagement();
    
    // Check Friday warning every minute
    setInterval(checkFridayWarning, 60000);
    
    // Initial Friday check
    if (!sessionStorage.getItem('fridayWarningDismissed')) {
        checkFridayWarning();
    }
}

// Hook into tab changes
const originalShowTab = showTab;
showTab = function(tabName) {
    originalShowTab(tabName);
    if (tabName === 'journal') {
        updateActiveTradeManagement();
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPhase2ExitStrategy, 500);
});

// ============================================
// PHASE 3: TRADE GRADING SYSTEM
// ============================================

/**
 * Trade Grading Criteria:
 * - UTCC Score (0-100): Primary factor
 * - Entry Zone (HOT/OPTIMAL/ACCEPTABLE/EXTENDED)
 * - R:R Ratio
 * - MTF Alignment
 * - Volatility State
 * - Session-Pair Match
 * - News Safety
 * 
 * Grades:
 * A+ (90-100): Perfect setup, full position
 * A  (80-89):  Excellent setup, full position
 * B  (70-79):  Good setup, standard position
 * C  (60-69):  Acceptable, reduced position (50%)
 * D  (<60):    Skip trade
 */

const GRADE_THRESHOLDS = {
    APLUS: { min: 90, label: 'A+', cssClass: 'grade-aplus', position: 'FULL (2%)', positionClass: 'rec-full' },
    A: { min: 80, label: 'A', cssClass: 'grade-a', position: 'FULL (1.5-2%)', positionClass: 'rec-full' },
    B: { min: 70, label: 'B', cssClass: 'grade-b', position: 'STANDARD (1.5%)', positionClass: 'rec-full' },
    C: { min: 60, label: 'C', cssClass: 'grade-c', position: 'REDUCED (1%)', positionClass: 'rec-reduced' },
    D: { min: 0, label: 'D', cssClass: 'grade-d', position: 'SKIP TRADE', positionClass: 'rec-skip' },
    DIS: { min: -1, label: 'DIS', cssClass: 'grade-dis', position: 'DISMISSED', positionClass: 'rec-skip' }
};

const ZONE_SCORES = {
    'HOT': 25,
    'OPTIMAL': 20,
    'ACCEPTABLE': 12,
    'EXTENDED': 5,
    '': 0
};

const VOL_STATE_SCORES = {
    'TREND': 15,
    'EXPLODE': 12,
    'QUIET': 8,
    'NORMAL': 10,
    'LOW': 0,
    '': 5
};

/**
 * Calculate trade grade based on all criteria
 */
function calculateTradeGrade(criteria) {
    const {
        utccScore = 0,
        entryZone = '',
        rrRatio = 0,
        mtfAlignment = '0/3',
        volState = '',
        sessionPairMatch = 'NEUTRAL',
        newsClean = false
    } = criteria;
    
    let totalScore = 0;
    let breakdown = [];
    
    // 1. UTCC Score (max 35 points)
    // Score >= 90 = 35pts, 80-89 = 30pts, 70-79 = 20pts, <70 = 10pts
    let utccPoints = 0;
    if (utccScore >= 90) utccPoints = 35;
    else if (utccScore >= 80) utccPoints = 30;
    else if (utccScore >= 70) utccPoints = 20;
    else if (utccScore >= 60) utccPoints = 10;
    else utccPoints = 5;
    
    totalScore += utccPoints;
    breakdown.push({
        label: `Score: ${utccScore}`,
        points: utccPoints,
        status: utccScore >= 75 ? 'pass' : utccScore >= 60 ? 'warn' : 'fail'
    });
    
    // 2. Entry Zone (max 25 points)
    const zonePoints = ZONE_SCORES[entryZone.toUpperCase()] || 0;
    totalScore += zonePoints;
    breakdown.push({
        label: `Zone: ${entryZone || 'N/A'}`,
        points: zonePoints,
        status: zonePoints >= 20 ? 'pass' : zonePoints >= 12 ? 'warn' : 'fail'
    });
    
    // 3. R:R Ratio (max 20 points)
    // R:R >= 2.5 = 20pts, 2.0-2.5 = 18pts, 1.5-2.0 = 12pts, 1.0-1.5 = 5pts, <1.0 = 0pts
    let rrPoints = 0;
    if (rrRatio >= 2.5) rrPoints = 20;
    else if (rrRatio >= 2.0) rrPoints = 18;
    else if (rrRatio >= 1.5) rrPoints = 12;
    else if (rrRatio >= 1.0) rrPoints = 5;
    else rrPoints = 0;
    
    totalScore += rrPoints;
    breakdown.push({
        label: `R:R: ${rrRatio.toFixed(2)}`,
        points: rrPoints,
        status: rrRatio >= 1.5 ? 'pass' : rrRatio >= 1.0 ? 'warn' : 'fail'
    });
    
    // 4. Volatility State (max 15 points)
    const volPoints = VOL_STATE_SCORES[volState.toUpperCase()] || 5;
    totalScore += volPoints;
    breakdown.push({
        label: `Vol: ${volState || 'N/A'}`,
        points: volPoints,
        status: volPoints >= 12 ? 'pass' : volPoints >= 8 ? 'warn' : 'fail'
    });
    
    // 5. News Safety (5 points)
    const newsPoints = newsClean ? 5 : 0;
    totalScore += newsPoints;
    
    // Determine grade
    let grade;
    if (totalScore >= 90) grade = GRADE_THRESHOLDS.APLUS;
    else if (totalScore >= 80) grade = GRADE_THRESHOLDS.A;
    else if (totalScore >= 70) grade = GRADE_THRESHOLDS.B;
    else if (totalScore >= 60) grade = GRADE_THRESHOLDS.C;
    else grade = GRADE_THRESHOLDS.D;
    
    return {
        totalScore,
        grade,
        breakdown
    };
}

/**
 * Update grade display in validation panel
 */
function updateTradeGradeDisplay() {
    const gradeDisplay = document.getElementById('trade-grade-display');
    const gradeBadge = document.getElementById('grade-badge');
    const gradeBreakdown = document.getElementById('grade-breakdown');
    const gradePositionRec = document.getElementById('grade-position-rec');
    const gradePositionValue = document.getElementById('grade-position-value');
    
    if (!gradeDisplay) return;
    
    // Collect current validation data
    const utccScore = parseInt(document.getElementById('val-score')?.value) || 0;
    const entryZone = document.getElementById('val-zone')?.value || '';
    const volState = document.getElementById('val-vol-state')?.value || '';
    
    // Get R:R from structure analysis
    const rrValueEl = document.querySelector('#structure-rr-value');
    let rrRatio = 0;
    if (rrValueEl) {
        const rrText = rrValueEl.textContent;
        const match = rrText.match(/([\d.]+)/);
        if (match) rrRatio = parseFloat(match[1]);
    }
    
    // Check news safety
    const newsCheck = document.getElementById('check-timing-news');
    const newsClean = newsCheck?.checked || false;
    
    // Only show grade if we have minimum data
    if (!utccScore || utccScore < 50) {
        gradeDisplay.style.display = 'none';
        return;
    }
    
    // Calculate grade
    const result = calculateTradeGrade({
        utccScore,
        entryZone,
        rrRatio,
        volState,
        newsClean
    });
    
    // Show grade display
    gradeDisplay.style.display = 'flex';
    
    // Update badge
    gradeBadge.textContent = result.grade.label;
    gradeBadge.className = `grade-badge ${result.grade.cssClass}`;
    
    // Update breakdown
    gradeBreakdown.innerHTML = result.breakdown.map(item => 
        `<span class="breakdown-item item-${item.status}">${item.label}</span>`
    ).join('');
    
    // Update position recommendation
    gradePositionValue.textContent = result.grade.position;
    gradePositionRec.className = `grade-position-rec ${result.grade.positionClass}`;
    
    // Store grade for trade logging
    window.currentTradeGrade = result;
}

/**
 * Get grade badge HTML for trade display
 */
// v2.10.1: Inline editing functions for trade history
function inlineEditGrade(tradeId, el) {
    // Prevent double-click creating multiple dropdowns
    if (el.querySelector('select')) return;
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const trade = trades.find(t => t.id === tradeId);
    const current = trade ? (trade.grade || '') : '';
    
    const options = [
        { value: '', label: '-- None --' },
        { value: 'A+', label: 'A+' },
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
        { value: 'C', label: 'C' },
        { value: 'D', label: 'D' },
        { value: 'DIS', label: 'DIS' }
    ];
    
    const select = document.createElement('select');
    select.className = 'inline-edit-select';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === current) o.selected = true;
        select.appendChild(o);
    });
    
    el.innerHTML = '';
    el.appendChild(select);
    select.focus();
    
    const commit = () => {
        saveInlineField(tradeId, 'grade', select.value);
    };
    select.addEventListener('change', commit);
    select.addEventListener('blur', commit);
}

function inlineEditScore(tradeId, el, currentVal) {
    if (el.querySelector('input')) return;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'inline-edit-input';
    input.value = currentVal || '';
    input.min = '0';
    input.max = '100';
    input.placeholder = '0-100';
    
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
    
    const commit = () => {
        const val = parseInt(input.value) || null;
        saveInlineField(tradeId, 'trendScore', val);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') loadTrades();
    });
}

function inlineEditZone(tradeId, el, currentVal) {
    if (el.querySelector('select')) return;
    
    const options = [
        { value: '', label: '-- None --' },
        { value: 'HOT', label: 'HOT' },
        { value: 'OPTIMAL', label: 'OPTIMAL' },
        { value: 'ACCEPTABLE', label: 'ACCEPTABLE' },
        { value: 'EXTENDED', label: 'EXTENDED' }
    ];
    
    const select = document.createElement('select');
    select.className = 'inline-edit-select';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === currentVal) o.selected = true;
        select.appendChild(o);
    });
    
    el.innerHTML = '';
    el.appendChild(select);
    select.focus();
    
    const commit = () => {
        saveInlineField(tradeId, 'entryZone', select.value);
    };
    select.addEventListener('change', commit);
    select.addEventListener('blur', commit);
}

function saveInlineField(tradeId, field, value) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const idx = trades.findIndex(t => t.id === tradeId);
    if (idx === -1) { showToast('Trade not found', 'error'); return; }
    
    trades[idx][field] = value;
    trades[idx].updatedAt = new Date().toISOString();
    saveToStorage(STORAGE_KEYS.trades, trades);
    loadTrades();
    
    const labels = { grade: 'Grade', trendScore: 'Score', entryZone: 'Zone' };
    showToast((labels[field] || field) + ' updated', 'success');
}

function getGradeBadge(grade, dismissReason) {
    if (!grade) return '<span class="grade-mini-badge grade-d">?</span>';
    if (grade === 'DIS') {
        const reason = dismissReason || 'Dismissed';
        return `<span class="grade-mini-badge grade-dis" title="${reason}">DIS</span>`;
    }
    
    const gradeInfo = Object.values(GRADE_THRESHOLDS).find(g => g.label === grade) || GRADE_THRESHOLDS.D;
    return `<span class="grade-mini-badge ${gradeInfo.cssClass}">${gradeInfo.label}</span>`;
}

/**
 * Hook grade calculation into validation updates
 */
const originalUpdateValidationVerdict = typeof updateValidationVerdict === 'function' ? updateValidationVerdict : null;

function updateValidationVerdictWithGrade() {
    // Call original if exists
    if (originalUpdateValidationVerdict) {
        originalUpdateValidationVerdict();
    }
    
    // Update grade display
    updateTradeGradeDisplay();
}

// Override validation updates to include grade
document.addEventListener('DOMContentLoaded', () => {
    // Hook into input changes
    const validationInputs = [
        'val-score', 'val-zone', 'val-vol-state', 
        'check-timing-news', 'val-entry', 'val-stop', 'val-tp'
    ];
    
    validationInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', updateTradeGradeDisplay);
            el.addEventListener('input', updateTradeGradeDisplay);
        }
    });
    
    // Initial calculation
    setTimeout(updateTradeGradeDisplay, 1000);
});

/**
 * Update executeTradeFromValidation to include grade
 */
const originalExecuteTradeFromValidation = typeof executeTradeFromValidation === 'function' ? executeTradeFromValidation : null;

if (originalExecuteTradeFromValidation) {
    executeTradeFromValidation = function() {
        // Store grade before executing
        if (window.currentTradeGrade) {
            sessionStorage.setItem('lastTradeGrade', JSON.stringify(window.currentTradeGrade));
        }
        originalExecuteTradeFromValidation();
    };
}

// ============================================
// PHASE 4: RE-ENTRY RULES SYSTEM
// ============================================

/**
 * Re-Entry Rules:
 * 1. 4-hour minimum wait after stop loss hit
 * 2. Fresh setup required (not same pattern)
 * 3. Higher score than the stopped trade
 * 4. Different session preferred
 */

const REENTRY_WAIT_HOURS = 4;

/**
 * Check if re-entry rules apply for a pair
 */
function checkReentryRules(pair) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    
    // Find recent stopped trades on this pair
    const recentStops = trades.filter(t => {
        if (t.pair !== pair) return false;
        if (t.status !== 'closed') return false;
        if (!t.exitReason || !t.exitReason.includes('SL')) return false;
        
        // Check if within last 4 hours
        const closedAt = new Date(t.closedAt || t.date);
        const hoursSince = (Date.now() - closedAt.getTime()) / (1000 * 60 * 60);
        return hoursSince < REENTRY_WAIT_HOURS;
    });
    
    if (recentStops.length === 0) {
        return { blocked: false };
    }
    
    // Get the most recent stop
    const lastStop = recentStops.sort((a, b) => 
        new Date(b.closedAt || b.date) - new Date(a.closedAt || a.date)
    )[0];
    
    const closedAt = new Date(lastStop.closedAt || lastStop.date);
    const hoursSince = (Date.now() - closedAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = REENTRY_WAIT_HOURS - hoursSince;
    
    return {
        blocked: true,
        lastStop,
        hoursSince,
        hoursRemaining,
        requiredScore: (lastStop.trendScore || 75) + 5, // Need 5 points higher
        lastSession: lastStop.session
    };
}

/**
 * Update re-entry rules display
 */
function updateReentryRulesDisplay() {
    const pair = document.getElementById('val-pair')?.value;
    const card = document.getElementById('reentry-rules-card');
    const acceptedEl = document.getElementById('reentry-accepted');
    
    if (!pair || !card) {
        if (card) card.style.display = 'none';
        if (acceptedEl) acceptedEl.checked = true;
        return;
    }
    
    const result = checkReentryRules(pair);
    
    if (!result.blocked) {
        card.style.display = 'none';
        if (acceptedEl) acceptedEl.checked = true;
        updateValidationVerdict();
        return;
    }
    
    // Show re-entry block
    card.style.display = 'block';
    if (acceptedEl) acceptedEl.checked = false;
    
    // Update timer
    const timerEl = document.getElementById('reentry-timer');
    if (timerEl) {
        if (result.hoursRemaining > 0) {
            const mins = Math.round(result.hoursRemaining * 60);
            const hrs = Math.floor(mins / 60);
            const remainMins = mins % 60;
            timerEl.textContent = `Time remaining: ${hrs}h ${remainMins}m`;
        } else {
            timerEl.textContent = 'Wait period complete - verify other requirements';
            timerEl.style.color = 'var(--color-pass)';
        }
    }
    
    // Update score requirement
    const scoreReqEl = document.getElementById('reentry-score-req');
    if (scoreReqEl) {
        scoreReqEl.textContent = `Higher score than stopped trade (need: ${result.requiredScore}+)`;
    }
    
    // Check current values against requirements
    const currentScore = parseInt(document.getElementById('val-score')?.value) || 0;
    const currentSession = detectCurrentSession();
    
    // Update check marks
    updateReentryCheck('reentry-check-time', result.hoursRemaining <= 0);
    updateReentryCheck('reentry-check-score', currentScore >= result.requiredScore);
    updateReentryCheck('reentry-check-session', currentSession !== result.lastSession);
    // Fresh setup is manual confirmation via override
    
    updateValidationVerdict();
}

function updateReentryCheck(elementId, satisfied) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (satisfied) {
        el.textContent = '\u2611'; // Checked box
        el.className = 'reentry-check checked';
    } else {
        el.textContent = '\u2610'; // Empty box
        el.className = 'reentry-check unchecked';
    }
}

function detectCurrentSession() {
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 17) return 'asian';
    if (hour >= 17 && hour < 22) return 'london';
    return 'ny';
}

function handleReentryOverride() {
    const overrideEl = document.getElementById('reentry-override');
    const acceptedEl = document.getElementById('reentry-accepted');
    const freshCheckEl = document.getElementById('reentry-check-fresh');
    
    if (overrideEl?.checked) {
        if (acceptedEl) acceptedEl.checked = true;
        if (freshCheckEl) {
            freshCheckEl.textContent = '\u2611';
            freshCheckEl.className = 'reentry-check checked';
        }
        showToast('Re-entry override accepted - trade with caution', 'warning');
    } else {
        if (acceptedEl) acceptedEl.checked = false;
        if (freshCheckEl) {
            freshCheckEl.textContent = '\u2610';
            freshCheckEl.className = 'reentry-check unchecked';
        }
    }
    
    updateValidationVerdict();
}

/**
 * Record stop loss for re-entry tracking
 */
function recordStopLossHit(tradeId) {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const index = trades.findIndex(t => t.id === tradeId);
    
    if (index === -1) return;
    
    trades[index].exitReason = 'SL_HIT';
    trades[index].closedAt = new Date().toISOString();
    
    saveToStorage(STORAGE_KEYS.trades, trades);
}

// Hook into pair selection
document.addEventListener('DOMContentLoaded', () => {
    const pairSelect = document.getElementById('val-pair');
    if (pairSelect) {
        pairSelect.addEventListener('change', updateReentryRulesDisplay);
    }
    
    const scoreInput = document.getElementById('val-score');
    if (scoreInput) {
        scoreInput.addEventListener('input', updateReentryRulesDisplay);
    }
    
    // Periodic timer update
    setInterval(() => {
        const card = document.getElementById('reentry-rules-card');
        if (card && card.style.display !== 'none') {
            updateReentryRulesDisplay();
        }
    }, 60000); // Update every minute
});

function exportTrades() {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const closedTrades = trades.filter(t => t.status === 'closed');
    
    if (closedTrades.length === 0) {
        showToast('No closed trades to export', 'warning');
        return;
    }
    
    // Create CSV
    const headers = ['Date', 'Pair', 'Direction', 'Alert', 'Entry', 'Exit', 'R-Multiple', 'PnL', 'Score', 'Zone', 'Session', 'Exit Reason'];
    const rows = closedTrades.map(t => [
        t.date,
        t.pair,
        t.direction,
        t.alertType,
        t.entry,
        t.exit,
        t.rMultiple?.toFixed(2) || '',
        t.pnl?.toFixed(2) || '',
        t.trendScore || '',
        t.entryZone || '',
        t.session || '',
        t.exitReason || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, `trades_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showToast('Trades exported', 'success');
}

function clearAllTrades() {
    if (!confirm(' This will DELETE ALL TRADES. This cannot be undone. Continue?')) return;
    if (!confirm('Are you ABSOLUTELY sure? Type "DELETE" in the next prompt to confirm.')) return;
    
    const confirmText = prompt('Type DELETE to confirm:');
    if (confirmText !== 'DELETE') {
        showToast('Deletion cancelled', 'info');
        return;
    }
    
    saveToStorage(STORAGE_KEYS.trades, []);
    loadTrades();
    updateDashboard();
    showToast('All trades deleted', 'info');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add journal-specific styles
const journalStyles = document.createElement('style');
journalStyles.textContent = `
    .zone-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
    }
    .zone-hot {
        background: var(--zone-hot);
        color: white;
    }
    .zone-optimal {
        background: var(--zone-optimal);
        color: white;
    }
    .zone-acceptable {
        background: var(--zone-acceptable);
        color: #000;
    }
    .zone-extended {
        background: var(--zone-extended);
        color: white;
    }
    .badge-perfect {
        background: var(--color-perfect);
        color: white;
    }
`;
document.head.appendChild(journalStyles);

// CHUNK 5 COMPLETE - Trade Journal CRUD
