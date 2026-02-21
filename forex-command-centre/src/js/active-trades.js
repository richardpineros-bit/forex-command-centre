// active-trades.js - FCC Phase 3 extraction
// Active trades widget

// ============================================
// ACTIVE TRADES WIDGET
// ============================================

function updateActiveTradesWidget(trades) {
    const openTrades = trades.filter(t => t.status === 'open');
    const grid = document.getElementById('active-trades-grid');
    const noTradesMsg = document.getElementById('no-active-trades-widget');
    const summaryBar = document.getElementById('trade-summary-bar');
    const countBadge = document.getElementById('widget-open-count');
    
    if (countBadge) countBadge.textContent = `${openTrades.length} Open`;
    
    if (openTrades.length === 0) {
        if (grid) grid.style.display = 'none';
        if (noTradesMsg) noTradesMsg.style.display = 'flex';
        if (summaryBar) summaryBar.style.display = 'none';
        return;
    }
    
    if (noTradesMsg) noTradesMsg.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    if (summaryBar) summaryBar.style.display = 'flex';
    
    // Render trade cards
    if (grid) {
        grid.innerHTML = openTrades.map(trade => renderActiveTradeCard(trade)).join('');
    }
    
    // Update summary bar
    updateTradeSummaryBar(openTrades);
}

function renderActiveTradeCard(trade) {
    const isLong = trade.direction === 'long';
    const dirClass = isLong ? 'long' : 'short';
    const tradeAge = getTradeAge(trade.date);
    const ageClass = tradeAge.hours >= 48 ? 'danger' : tradeAge.hours >= 24 ? 'warning' : '';
    const needsAttention = tradeAge.hours >= 24 || !trade.stop;
    
    // Calculate current R if we have the data
    const riskPips = trade.entry && trade.stop ? Math.abs(trade.entry - trade.stop) : 0;
    const rrText = trade.tp && riskPips > 0 
        ? (Math.abs(trade.tp - trade.entry) / riskPips).toFixed(1) 
        : '--';
    
    return `
        <div class="active-trade-card trade-${dirClass} ${needsAttention ? 'needs-attention' : ''}">
            <div class="trade-card-header">
                <span class="trade-card-pair">${trade.pair}</span>
                <span class="trade-card-direction ${dirClass}">${isLong ? '&#x25B2; LONG' : '&#x25BC; SHORT'}</span>
            </div>
            
            <div class="trade-card-stats">
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value">${trade.entry || '--'}</div>
                    <div class="trade-card-stat-label">Entry</div>
                </div>
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value" style="color: var(--color-fail);">${trade.stop || '--'}</div>
                    <div class="trade-card-stat-label">Stop</div>
                </div>
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value" style="color: var(--color-pass);">${trade.tp || '--'}</div>
                    <div class="trade-card-stat-label">TP</div>
                </div>
            </div>
            
            <div class="trade-card-stats">
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value">${rrText}R</div>
                    <div class="trade-card-stat-label">Target R:R</div>
                </div>
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value">${trade.trendScore || '--'}</div>
                    <div class="trade-card-stat-label">Score</div>
                </div>
                <div class="trade-card-stat">
                    <div class="trade-card-stat-value">${getGradeBadge(trade.grade, trade.dismissReason)}</div>
                    <div class="trade-card-stat-label">Grade</div>
                </div>
            </div>
            
            <div class="trade-card-footer">
                <div class="trade-card-age ${ageClass}">
                    &#x23F1; ${tradeAge.text}
                </div>
                <div>
                    ${getAlertBadge(trade.alertType)}
                </div>
            </div>
        </div>
    `;
}

function getTradeAge(dateStr) {
    if (!dateStr) return { hours: 0, text: '--' };
    
    const tradeDate = new Date(dateStr);
    const now = new Date();
    const diffMs = now - tradeDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    let text;
    if (diffDays > 0) {
        text = `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
        text = `${diffHours}h`;
    } else {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        text = `${diffMins}m`;
    }
    
    return { hours: diffHours, text };
}

function updateTradeSummaryBar(openTrades) {
    const settings = getSettings();
    
    // Calculate total exposure
    let totalRisk = 0;
    openTrades.forEach(trade => {
        if (trade.riskAmount && settings.accountBalance > 0) {
            totalRisk += (trade.riskAmount / settings.accountBalance) * 100;
        }
    });
    
    // Find oldest trade
    let oldestAge = { hours: 0, text: '--' };
    openTrades.forEach(trade => {
        const age = getTradeAge(trade.date);
        if (age.hours > oldestAge.hours) {
            oldestAge = age;
        }
    });
    
    // Update elements
    const riskEl = document.getElementById('widget-total-risk');
    const activeRiskEl = document.getElementById('widget-active-risk');
    const oldestEl = document.getElementById('widget-oldest-trade');
    
    if (riskEl) {
        riskEl.textContent = `${totalRisk.toFixed(1)}%`;
        riskEl.style.color = totalRisk > 6 ? 'var(--color-fail)' : 
                            totalRisk > 4 ? 'var(--color-warning)' : 'var(--color-pass)';
    }
    
    if (activeRiskEl) {
        // v2.11.0: Show active risk amount instead of floating P/L
        const totalRiskAmt = openTrades.reduce((sum, t) => sum + (t.riskAmount || 0), 0);
        activeRiskEl.textContent = totalRiskAmt > 0 ? formatCurrency(totalRiskAmt) : '--';
    }
    
    if (oldestEl) {
        oldestEl.textContent = oldestAge.text;
        oldestEl.style.color = oldestAge.hours >= 48 ? 'var(--color-fail)' : 
                               oldestAge.hours >= 24 ? 'var(--color-warning)' : '';
    }
}

