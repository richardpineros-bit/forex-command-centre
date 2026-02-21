// dashboard-drawdown.js - FCC Phase 3 extraction
// Dashboard & drawdown management

// ============================================
// CHUNK 2: DASHBOARD & DRAWDOWN
// ============================================

function updateDashboard() {
    const settings = getSettings();
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    
    // Update Account Overview
    updateAccountOverview(settings, trades);
    
    // Update Drawdown Status
    updateDrawdownStatus(settings);
    
    // Update Weekly Performance
    updateWeeklyStats(trades);
    
    // Update Active Trades Widget
    updateActiveTradesWidget(trades);
    
    // v2.11.0: Update Discipline Dashboard
    updateDisciplineDashboard(trades);
}

function updateAccountOverview(settings, trades) {
    const balance = settings.accountBalance;
    const peak = settings.peakBalance;
    const drawdown = calculateDrawdown(balance, peak);
    const openPositions = trades.filter(t => t.status === 'open').length;
    
    // Update display elements
    const balanceEl = document.getElementById('dash-balance');
    const peakEl = document.getElementById('dash-peak');
    const drawdownEl = document.getElementById('dash-drawdown');
    const openEl = document.getElementById('dash-open-positions');
    
    if (balanceEl) balanceEl.textContent = formatCurrency(balance);
    if (peakEl) peakEl.textContent = formatCurrency(peak);
    if (drawdownEl) {
        drawdownEl.textContent = formatNumber(drawdown, 1) + '%';
        drawdownEl.className = 'stat-value ' + getDrawdownColourClass(drawdown);
    }
    if (openEl) openEl.textContent = openPositions;
    // v2.11.0: Update badge in discipline dashboard header
    const openBadge = document.getElementById('dash-open-positions-badge');
    if (openBadge) {
        openBadge.textContent = openPositions + ' Open';
        openBadge.style.background = openPositions > 0 ? 'var(--color-info)' : '';
        openBadge.style.color = openPositions > 0 ? '#fff' : '';
    }
}

function calculateDrawdown(currentBalance, peakBalance) {
    if (peakBalance <= 0) return 0;
    const drawdown = ((peakBalance - currentBalance) / peakBalance) * 100;
    return Math.max(0, drawdown);
}

function getDrawdownStatus(drawdownPercent) {
    if (drawdownPercent < 5) return { level: 'normal', text: 'NORMAL', risk: '1.5-2%' };
    if (drawdownPercent < 10) return { level: 'caution', text: 'CAUTION', risk: '1%' };
    if (drawdownPercent < 15) return { level: 'stop', text: 'STOP', risk: '0.5%' };
    return { level: 'emergency', text: 'EMERGENCY', risk: '0%' };
}

function getDrawdownColourClass(drawdownPercent) {
    if (drawdownPercent < 5) return 'text-pass';
    if (drawdownPercent < 10) return 'text-warning';
    if (drawdownPercent < 15) return 'text-fail';
    return 'text-fail';
}

function updateDrawdownStatus(settings) {
    const drawdown = calculateDrawdown(settings.accountBalance, settings.peakBalance);
    const status = getDrawdownStatus(drawdown);
    
    const statusEl = document.getElementById('drawdown-status');
    if (statusEl) {
        statusEl.className = `drawdown-indicator ${status.level}`;
        statusEl.innerHTML = `
            <span class="drawdown-dot"></span>
            <span>${status.text}</span>
        `;
    }
    
    // Update protocol box highlighting
    updateDrawdownProtocolHighlight(status.level);
    
    // Show warning if in danger zone
    if (status.level === 'stop') {
        showToast(' STOP TRADING - Take a 1-week break', 'error', 10000);
    } else if (status.level === 'emergency') {
        showToast(' EMERGENCY - Cease all trading immediately', 'error', 10000);
    }
}

function updateDrawdownProtocolHighlight(level) {
    // Remove all highlights first
    document.querySelectorAll('#drawdown-protocol-box .stat-box').forEach(box => {
        box.style.opacity = '0.5';
        box.style.transform = 'scale(1)';
    });
    
    // Highlight current level
    const levels = ['normal', 'caution', 'stop', 'emergency'];
    const index = levels.indexOf(level);
    const boxes = document.querySelectorAll('#drawdown-protocol-box .stat-box');
    
    if (boxes[index]) {
        boxes[index].style.opacity = '1';
        boxes[index].style.transform = 'scale(1.02)';
    }
}

function updateWeeklyStats(trades) {
    // Filter trades from this week that are closed
    const weekTrades = trades.filter(t => 
        isThisWeek(t.openDate || t.date) && t.status === 'closed'
    );
    
    const totalTrades = weekTrades.length;
    const winners = weekTrades.filter(t => (t.rMultiple || 0) > 0);
    const winRate = totalTrades > 0 ? (winners.length / totalTrades) * 100 : 0;
    
    // Calculate average R-multiple
    const totalR = weekTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
    const avgR = totalTrades > 0 ? totalR / totalTrades : 0;
    
    // v2.11.0: Calculate weekly adherence instead of P&L
    const weekAdherence = calculateAdherenceForTrades(weekTrades);
    
    // Calculate expectancy
    const avgWin = winners.length > 0 
        ? winners.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / winners.length 
        : 0;
    const losers = weekTrades.filter(t => (t.rMultiple || 0) < 0);
    const avgLoss = losers.length > 0 
        ? Math.abs(losers.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / losers.length) 
        : 0;
    const winRateDecimal = winRate / 100;
    const expectancy = (winRateDecimal * avgWin) - ((1 - winRateDecimal) * avgLoss);
    
    // Update UI
    const tradesEl = document.getElementById('week-trades');
    const winrateEl = document.getElementById('week-winrate');
    const avgREl = document.getElementById('week-avg-r');
    const adherenceEl = document.getElementById('week-adherence');
    const expectancyEl = document.getElementById('week-expectancy');
    const targetEl = document.getElementById('week-target');
    const dateRangeEl = document.getElementById('week-date-range');
    
    if (tradesEl) tradesEl.textContent = totalTrades;
    if (winrateEl) {
        winrateEl.textContent = formatNumber(winRate, 0) + '%';
        winrateEl.className = 'stat-value ' + (winRate >= 50 ? 'text-pass' : 'text-fail');
    }
    if (avgREl) {
        avgREl.textContent = formatNumber(avgR, 2) + 'R';
        avgREl.className = 'stat-value ' + (avgR >= 0 ? 'text-pass' : 'text-fail');
    }
    if (adherenceEl) {
        if (weekAdherence.total === 0) {
            adherenceEl.textContent = '--';
            adherenceEl.className = 'stat-value';
        } else {
            adherenceEl.textContent = formatNumber(weekAdherence.pct, 0) + '%';
            adherenceEl.className = 'stat-value ' + (weekAdherence.pct >= 80 ? 'text-pass' : weekAdherence.pct >= 60 ? 'text-warning' : 'text-fail');
        }
    }
    if (expectancyEl) {
        expectancyEl.textContent = formatNumber(expectancy, 2) + 'R';
        expectancyEl.className = 'stat-value ' + (expectancy >= 0 ? 'text-pass' : 'text-fail');
    }
    if (targetEl) {
        const targetClass = totalTrades >= 5 && totalTrades <= 10 ? 'text-pass' : 
                           totalTrades > 10 ? 'text-warning' : '';
        targetEl.textContent = `${totalTrades} / 5-10`;
        targetEl.className = 'stat-value ' + targetClass;
    }
    
    // Update date range display
    if (dateRangeEl) {
        const { start, end } = getWeekRange();
        dateRangeEl.textContent = `${formatDate(start)} - ${formatDate(end)}`;
    }
}

function getRecommendedRisk() {
    const settings = getSettings();
    const drawdown = calculateDrawdown(settings.accountBalance, settings.peakBalance);
    const status = getDrawdownStatus(drawdown);
    
    switch(status.level) {
        case 'normal': return 1.5;
        case 'caution': return 1;
        case 'stop': return 0.5;
        case 'emergency': return 0;
        default: return 1.5;
    }
}

// ============================================
// v2.12.0: NO-TRADE JOURNAL
// ============================================

const NO_TRADE_REASONS = {
    'no_setup': 'No Valid Setup',
    'failed_utcc': 'Failed UTCC Criteria',
    'wrong_session': 'Wrong Session Window',
    'atr_exhausted': 'ATR Exhausted',
    'correlation_block': 'Correlation Block',
    'news_risk': 'High-Impact News Risk',
    'drawdown_limit': 'Drawdown Limit Active',
    'discipline_pass': 'Discipline Pass',
    'weekend_close': 'Weekend/Session Close',
    'other': 'Other'
};

function saveNoTrade() {
    const session = document.getElementById('nt-session')?.value || 'tokyo';
    const reason = document.getElementById('nt-reason')?.value || 'no_setup';
    const pairs = document.getElementById('nt-pairs')?.value || '';
    const notes = document.getElementById('nt-notes')?.value || '';
    
    const entry = {
        id: generateId(),
        date: new Date().toISOString(),
        session: session,
        reason: reason,
        pairsReviewed: pairs,
        notes: notes
    };
    
    const entries = loadFromStorage(STORAGE_KEYS.noTrades, []);
    entries.unshift(entry);
    saveToStorage(STORAGE_KEYS.noTrades, entries);
    
    // Clear form
    document.getElementById('nt-pairs').value = '';
    document.getElementById('nt-notes').value = '';
    
    loadNoTrades();
    updateDashboard();
    showToast('Market review logged - discipline acknowledged', 'success');
}

function loadNoTrades() {
    const entries = loadFromStorage(STORAGE_KEYS.noTrades, []);
    const container = document.getElementById('no-trade-log-entries');
    const countBadge = document.getElementById('no-trade-count-badge');
    const weekCount = document.getElementById('no-trade-week-count');
    
    if (countBadge) countBadge.textContent = entries.length + ' reviews';
    
    // Count this week
    const thisWeekEntries = entries.filter(e => isThisWeek(e.date));
    if (weekCount) weekCount.textContent = 'This week: ' + thisWeekEntries.length;
    
    if (!container) return;
    
    // Show last 10
    const recent = entries.slice(0, 10);
    
    if (recent.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: var(--spacing-md); color: var(--text-muted); font-size: 0.8rem;">No reviews logged yet. Passing on bad setups is discipline.</div>';
        return;
    }
    
    container.innerHTML = recent.map(e => {
        const reasonLabel = NO_TRADE_REASONS[e.reason] || e.reason;
        const sessionLabel = e.session ? e.session.charAt(0).toUpperCase() + e.session.slice(1).replace('_', ' ') : '--';
        const dateStr = formatDate(e.date);
        const timeStr = new Date(e.date).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="no-trade-card">
                <div class="no-trade-meta">
                    <div class="no-trade-icon">&#x1F6E1;</div>
                    <div>
                        <div class="no-trade-reason">${reasonLabel}</div>
                        <div class="no-trade-detail">${dateStr} ${timeStr} | ${sessionLabel}${e.pairsReviewed ? ' | ' + e.pairsReviewed : ''}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${e.notes ? '<span class="no-trade-notes" title="' + e.notes.replace(/"/g, '&quot;') + '">' + e.notes + '</span>' : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteNoTrade('${e.id}')" title="Delete" style="padding:2px 6px; font-size:0.6rem;">&#x2715;</button>
                </div>
            </div>
        `;
    }).join('');
}

function deleteNoTrade(id) {
    const entries = loadFromStorage(STORAGE_KEYS.noTrades, []);
    const filtered = entries.filter(e => e.id !== id);
    saveToStorage(STORAGE_KEYS.noTrades, filtered);
    loadNoTrades();
    updateDashboard();
    showToast('Review entry removed', 'info');
}

// ============================================
// v2.11.0: RULES ADHERENCE ENGINE
// ============================================

/**
 * Calculate adherence for a set of trades.
 * Each trade has 9 checkboxes (5 exec + 4 mgmt).
 * Returns { pct, avgScore, perfectCount, total, streak }
 */
function calculateAdherenceForTrades(trades) {
    // Only count trades that have at least one checkbox touched
    const CHECKS = [
        'execTypeDeclared', 'execSingleTrigger', 'execPlannedPrice',
        'execStopInvalidation', 'execSpreadOk',
        'mgmtNoEarlyStop', 'mgmtPartialRules', 'mgmtExitRules', 'mgmtNoRevenge'
    ];
    
    const graded = trades.filter(t => {
        // A trade is graded if it has at least one check true
        // OR if it has a grade assigned (meaning user reviewed it)
        return t.grade && t.grade !== 'DIS' && CHECKS.some(c => t[c] === true);
    });
    
    if (graded.length === 0) {
        return { pct: 0, avgScore: 0, perfectCount: 0, total: 0, streak: 0 };
    }
    
    let totalChecks = 0;
    let perfectCount = 0;
    let streak = 0;
    let streakBroken = false;
    
    // Process in reverse chronological order for streak
    const sorted = [...graded].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sorted.forEach(t => {
        const score = CHECKS.filter(c => t[c] === true).length;
        totalChecks += score;
        if (score === 9) {
            perfectCount++;
            if (!streakBroken) streak++;
        } else {
            streakBroken = true;
        }
    });
    
    const avgScore = totalChecks / graded.length;
    const pct = (avgScore / 9) * 100;
    
    return { pct: pct, avgScore: avgScore, perfectCount: perfectCount, total: graded.length, streak: streak };
}

function getAdherenceClass(pct) {
    if (pct >= 90) return 'score-excellent';
    if (pct >= 70) return 'score-good';
    if (pct >= 50) return 'score-fair';
    if (pct > 0) return 'score-poor';
    return 'score-none';
}

function getAdherenceMessage(pct, total) {
    if (total === 0) return 'No graded trades yet';
    if (pct >= 90) return 'Elite discipline - process is king';
    if (pct >= 80) return 'Strong adherence - stay the course';
    if (pct >= 70) return 'Good foundation - tighten execution';
    if (pct >= 50) return 'Room to improve - review your checklist';
    return 'Focus on process, not outcomes';
}

/**
 * Update the Discipline Dashboard on the main dashboard tab
 */
function updateDisciplineDashboard(trades) {
    const closedTrades = trades.filter(t => t.status === 'closed' || t.status === 'complete');
    const adherence = calculateAdherenceForTrades(closedTrades);
    
    // v2.12.0: Include no-trade reviews in discipline count
    const noTrades = loadFromStorage(STORAGE_KEYS.noTrades, []);
    const weekNoTrades = noTrades.filter(e => isThisWeek(e.date)).length;
    
    // Update hero ring
    const ring = document.getElementById('discipline-ring');
    const pctEl = document.getElementById('discipline-pct');
    const subtitleEl = document.getElementById('discipline-subtitle');
    
    if (ring) {
        ring.className = 'discipline-score-ring ' + getAdherenceClass(adherence.pct);
    }
    if (pctEl) {
        pctEl.textContent = adherence.total > 0 ? formatNumber(adherence.pct, 0) + '%' : '--';
        pctEl.style.color = adherence.pct >= 80 ? 'var(--color-pass)' : adherence.pct >= 60 ? 'var(--color-warning)' : adherence.pct > 0 ? 'var(--color-fail)' : '';
    }
    if (subtitleEl) {
        const noTradeMsg = weekNoTrades > 0 ? ' | ' + weekNoTrades + ' pass' + (weekNoTrades > 1 ? 'es' : '') + ' this week' : '';
        subtitleEl.textContent = getAdherenceMessage(adherence.pct, adherence.total) + noTradeMsg;
    }
    
    // Update stat boxes
    const processEl = document.getElementById('discipline-process-score');
    const perfectEl = document.getElementById('discipline-perfect-count');
    const streakEl = document.getElementById('discipline-streak');
    const totalEl = document.getElementById('discipline-total-graded');
    
    if (processEl) processEl.textContent = adherence.total > 0 ? formatNumber(adherence.avgScore, 1) + '/9' : '--';
    if (perfectEl) perfectEl.textContent = adherence.perfectCount;
    if (streakEl) streakEl.textContent = adherence.streak;
    if (totalEl) totalEl.textContent = adherence.total;
}

/**
 * Toggle P&L data visibility
 */
function togglePnlReveal() {
    const data = document.getElementById('pnl-hidden-data');
    const arrow = document.getElementById('pnl-reveal-arrow');
    if (data) {
        const isRevealed = data.classList.toggle('revealed');
        if (arrow) arrow.innerHTML = isRevealed ? '&#x25BC;' : '&#x25B6;';
    }
}

// CHUNK 2 COMPLETE - Dashboard & Drawdown
