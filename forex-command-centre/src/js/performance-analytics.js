// performance-analytics.js - FCC Phase 3 extraction
// Performance analytics & Claude export

// ============================================
// CHUNK 6: PERFORMANCE ANALYTICS
// ============================================

function updatePerformanceStats() {
    const trades = loadFromStorage(STORAGE_KEYS.trades, []);
    const period = document.getElementById('perf-period')?.value || 'all';
    const filteredTrades = filterTradesByPeriod(trades.filter(t => t.status === 'closed'), period);
    
    calculateOverallStats(filteredTrades);
    calculateSessionStats(filteredTrades);
    calculateAlertTypeStats(filteredTrades);
    calculateGradeStats(filteredTrades);
    analyzeLossingTrades(filteredTrades);
    generateInsights(filteredTrades);
}

function filterTradesByPeriod(trades, period) {
    const now = new Date();
    
    switch(period) {
        case 'week':
            const { start: weekStart } = getWeekRange();
            return trades.filter(t => new Date(t.date) >= weekStart);
            
        case 'month':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return trades.filter(t => new Date(t.date) >= monthStart);
            
        case 'quarter':
            const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            return trades.filter(t => new Date(t.date) >= quarterStart);
            
        case 'year':
            const yearStart = new Date(now.getFullYear(), 0, 1);
            return trades.filter(t => new Date(t.date) >= yearStart);
            
        default:
            return trades;
    }
}

function calculateOverallStats(trades) {
    const totalTrades = trades.length;
    
    if (totalTrades === 0) {
        setEmptyOverallStats();
        return;
    }
    
    const winners = trades.filter(t => (t.rMultiple || 0) > 0);
    const losers = trades.filter(t => (t.rMultiple || 0) < 0);
    
    const winRate = (winners.length / totalTrades) * 100;
    
    const allR = trades.map(t => t.rMultiple || 0);
    const avgR = allR.reduce((a, b) => a + b, 0) / totalTrades;
    const totalR = allR.reduce((a, b) => a + b, 0);
    
    const avgWin = winners.length > 0 
        ? winners.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / winners.length 
        : 0;
    const avgLoss = losers.length > 0 
        ? Math.abs(losers.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / losers.length) 
        : 0;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);
    
    const grossProfit = winners.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
    const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.rMultiple || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    
    const largestWin = winners.length > 0 ? Math.max(...winners.map(t => t.rMultiple || 0)) : 0;
    const largestLoss = losers.length > 0 ? Math.min(...losers.map(t => t.rMultiple || 0)) : 0;
    
    const { maxWinStreak, maxLoseStreak } = calculateStreaks(trades);
    
    updateElement('perf-total-trades', totalTrades);
    updateElement('perf-win-rate', `${formatNumber(winRate, 1)}%`, winRate >= 50 ? 'text-pass' : 'text-fail');
    updateElement('perf-avg-r', `${formatNumber(avgR, 2)}R`, avgR >= 0 ? 'text-pass' : 'text-fail');
    updateElement('perf-expectancy', `${formatNumber(expectancy, 2)}R`, expectancy >= 0 ? 'text-pass' : 'text-fail');
    updateElement('perf-profit-factor', formatNumber(profitFactor, 2), profitFactor >= 1 ? 'text-pass' : 'text-fail');
    updateElement('perf-total-r', `${formatNumber(totalR, 2)}R`, totalR >= 0 ? 'text-pass' : 'text-fail');
    updateElement('perf-largest-win', `+${formatNumber(largestWin, 2)}R`, 'text-pass');
    updateElement('perf-largest-loss', `${formatNumber(largestLoss, 2)}R`, 'text-fail');
    updateElement('perf-avg-winner', `+${formatNumber(avgWin, 2)}R`, 'text-pass');
    updateElement('perf-avg-loser', `${formatNumber(-avgLoss, 2)}R`, 'text-fail');
    updateElement('perf-win-streak', maxWinStreak);
    updateElement('perf-lose-streak', maxLoseStreak);
}

function setEmptyOverallStats() {
    const ids = ['perf-total-trades', 'perf-win-rate', 'perf-avg-r', 'perf-expectancy',
        'perf-profit-factor', 'perf-total-r', 'perf-largest-win', 'perf-largest-loss',
        'perf-avg-winner', 'perf-avg-loser', 'perf-win-streak', 'perf-lose-streak'];
    ids.forEach(id => updateElement(id, '-'));
}

function updateElement(id, value, className = '') {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
        if (className) el.className = 'stat-value ' + className;
    }
}

function calculateStreaks(trades) {
    let maxWinStreak = 0, maxLoseStreak = 0, currentWin = 0, currentLose = 0;
    const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(trade => {
        if ((trade.rMultiple || 0) > 0) {
            currentWin++;
            currentLose = 0;
            maxWinStreak = Math.max(maxWinStreak, currentWin);
        } else if ((trade.rMultiple || 0) < 0) {
            currentLose++;
            currentWin = 0;
            maxLoseStreak = Math.max(maxLoseStreak, currentLose);
        }
    });
    
    return { maxWinStreak, maxLoseStreak };
}

function calculateSessionStats(trades) {
    const sessions = ['asian', 'london', 'ny', 'overlap'];
    const tbody = document.getElementById('session-stats-body');
    if (!tbody) return;
    
    const rows = sessions.map(session => {
        const sessionTrades = trades.filter(t => t.session === session);
        const count = sessionTrades.length;
        if (count === 0) return `<tr><td>${session.toUpperCase()}</td><td>0</td><td>-</td><td>-</td><td>-</td></tr>`;
        
        const winners = sessionTrades.filter(t => (t.rMultiple || 0) > 0);
        const winRate = (winners.length / count) * 100;
        const avgR = sessionTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / count;
        const totalR = sessionTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
        
        return `
            <tr>
                <td><strong>${session.toUpperCase()}</strong></td>
                <td>${count}</td>
                <td class="${winRate >= 50 ? 'text-pass' : 'text-fail'}">${formatNumber(winRate, 0)}%</td>
                <td class="${avgR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(avgR, 2)}R</td>
                <td class="${totalR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(totalR, 2)}R</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rows.join('');
}

function calculateAlertTypeStats(trades) {
    const alertTypes = ['TRADE_READY', 'STRONG_BULL', 'STRONG_BEAR', 'PERFECT_BULL', 'PERFECT_BEAR', 'MANUAL'];
    const tbody = document.getElementById('alert-stats-body');
    if (!tbody) return;
    
    const rows = alertTypes.map(alert => {
        const alertTrades = trades.filter(t => t.alertType === alert);
        const count = alertTrades.length;
        if (count === 0) return `<tr><td>${getAlertBadge(alert)}</td><td>0</td><td>-</td><td>-</td><td>-</td></tr>`;
        
        const winners = alertTrades.filter(t => (t.rMultiple || 0) > 0);
        const winRate = (winners.length / count) * 100;
        const avgR = alertTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / count;
        const totalR = alertTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
        
        return `
            <tr>
                <td>${getAlertBadge(alert)}</td>
                <td>${count}</td>
                <td class="${winRate >= 50 ? 'text-pass' : 'text-fail'}">${formatNumber(winRate, 0)}%</td>
                <td class="${avgR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(avgR, 2)}R</td>
                <td class="${totalR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(totalR, 2)}R</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rows.join('');
}

function calculateGradeStats(trades) {
    const grades = ['A+', 'A', 'B', 'C', 'D', 'DIS', null];
    const gradeKeys = ['aplus', 'a', 'b', 'c', 'd', 'dis', 'none'];
    const tbody = document.getElementById('grade-stats-body');
    
    if (!tbody) return;
    
    let bestGrade = null;
    let bestAvgR = -999;
    let mostTradedGrade = null;
    let mostTradedCount = 0;
    const gradePerformances = [];
    
    const rows = grades.map((grade, idx) => {
        const key = gradeKeys[idx];
        const gradeTrades = grade === null 
            ? trades.filter(t => !t.grade) 
            : trades.filter(t => t.grade === grade);
        const count = gradeTrades.length;
        
        // Track most traded
        if (count > mostTradedCount && grade !== null) {
            mostTradedCount = count;
            mostTradedGrade = grade;
        }
        
        if (count === 0) {
            return `
                <tr>
                    <td>${getGradeBadge(grade)}</td>
                    <td>0</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
        }
        
        const winners = gradeTrades.filter(t => (t.rMultiple || 0) > 0);
        const losers = gradeTrades.filter(t => (t.rMultiple || 0) < 0);
        const winRate = (winners.length / count) * 100;
        const avgR = gradeTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / count;
        const totalR = gradeTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
        
        const avgWin = winners.length > 0 
            ? winners.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / winners.length 
            : 0;
        const avgLoss = losers.length > 0 
            ? Math.abs(losers.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / losers.length) 
            : 0;
        const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);
        
        const best = gradeTrades.length > 0 
            ? Math.max(...gradeTrades.map(t => t.rMultiple || 0)) 
            : 0;
        const worst = gradeTrades.length > 0 
            ? Math.min(...gradeTrades.map(t => t.rMultiple || 0)) 
            : 0;
        
        // Track best performer (by avg R, min 3 trades)
        if (count >= 3 && avgR > bestAvgR && grade !== null) {
            bestAvgR = avgR;
            bestGrade = grade;
        }
        
        // Track for correlation
        if (grade !== null && count >= 1) {
            gradePerformances.push({ grade, avgR, count });
        }
        
        return `
            <tr>
                <td>${getGradeBadge(grade)}</td>
                <td>${count}</td>
                <td class="${winRate >= 50 ? 'text-pass' : 'text-fail'}">${formatNumber(winRate, 0)}%</td>
                <td class="${avgR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(avgR, 2)}R</td>
                <td class="${totalR >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(totalR, 2)}R</td>
                <td class="${expectancy >= 0 ? 'text-pass' : 'text-fail'}">${formatNumber(expectancy, 2)}R</td>
                <td class="text-pass">${best > 0 ? '+' : ''}${formatNumber(best, 2)}R</td>
                <td class="text-fail">${formatNumber(worst, 2)}R</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rows.join('');
    
    // Update summary stats
    updateElement('grade-best-performer', bestGrade || '--');
    updateElement('grade-most-traded', mostTradedGrade || '--');
    
    // Calculate grade-performance correlation
    const correlation = calculateGradeCorrelation(gradePerformances);
    const corrText = correlation === null ? '--' : 
        correlation > 0.5 ? 'Strong' :
        correlation > 0.2 ? 'Moderate' :
        correlation > -0.2 ? 'Weak' :
        correlation > -0.5 ? 'Inverse' : 'Strong Inverse';
    updateElement('grade-correlation', corrText);
}

function calculateGradeCorrelation(gradePerformances) {
    // Simple correlation: do higher grades = better performance?
    // A+ = 5, A = 4, B = 3, C = 2, D = 1
    if (gradePerformances.length < 3) return null;
    
    const gradeRanks = { 'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0, n = 0;
    
    gradePerformances.forEach(gp => {
        const x = gradeRanks[gp.grade] || 0;
        const y = gp.avgR;
        const weight = Math.min(gp.count, 10); // Cap weight at 10
        
        for (let i = 0; i < weight; i++) {
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
            sumY2 += y * y;
            n++;
        }
    });
    
    if (n < 3) return null;
    
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
}

function analyzeLossingTrades(trades) {
    const losers = trades.filter(t => (t.rMultiple || 0) < 0);
    const container = document.getElementById('losing-analysis');
    if (!container) return;
    
    if (losers.length === 0) {
        container.innerHTML = '<p class="text-muted">No losing trades to analyse.</p>';
        return;
    }
    
    // Analyse patterns
    const patterns = {
        lowScore: losers.filter(t => (t.trendScore || 0) < 80).length,
        badZone: losers.filter(t => ['ACCEPTABLE', 'EXTENDED'].includes(t.entryZone)).length,
        lowMtf: losers.filter(t => t.mtf !== '3/3').length,
        manual: losers.filter(t => t.alertType === 'MANUAL').length
    };
    
    const totalLosses = losers.length;
    const insights = [];
    
    if (patterns.lowScore > totalLosses * 0.3) {
        insights.push(` ${formatNumber(patterns.lowScore / totalLosses * 100, 0)}% of losses had trend score below 80`);
    }
    if (patterns.badZone > totalLosses * 0.3) {
        insights.push(` ${formatNumber(patterns.badZone / totalLosses * 100, 0)}% of losses were from ACCEPTABLE/EXTENDED zones`);
    }
    if (patterns.lowMtf > totalLosses * 0.3) {
        insights.push(` ${formatNumber(patterns.lowMtf / totalLosses * 100, 0)}% of losses didn't have full MTF alignment`);
    }
    if (patterns.manual > totalLosses * 0.4) {
        insights.push(` ${formatNumber(patterns.manual / totalLosses * 100, 0)}% of losses were MANUAL trades (not system alerts)`);
    }
    
    if (insights.length === 0) {
        insights.push(' No clear patterns detected in losing trades');
    }
    
    container.innerHTML = insights.map(i => `<p style="margin-bottom: 8px;">${i}</p>`).join('');
}

function generateInsights(trades) {
    const container = document.getElementById('ai-insights');
    if (!container) return;
    
    // If no trades passed, get closed trades from localStorage
    if (!trades) {
        const allTrades = JSON.parse(localStorage.getItem('forex_trades') || '[]');
        trades = allTrades.filter(t => t.status === 'closed');
    }
    
    if (!trades || trades.length < 5) {
        container.innerHTML = '<p class="text-muted">Need at least 5 closed trades to generate insights.</p>';
        return;
    }
    
    const insights = [];
    const winners = trades.filter(t => (t.rMultiple || 0) > 0);
    const winRate = (winners.length / trades.length) * 100;
    const avgR = trades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / trades.length;
    
    // Win rate insights
    if (winRate >= 60) {
        insights.push(' <strong>Excellent selectivity!</strong> Your win rate exceeds 60%. Keep being selective.');
    } else if (winRate < 45) {
        insights.push(' <strong>Win rate below 45%.</strong> Review your entry criteria. Are you waiting for all 5 conditions?');
    }
    
    // R-multiple insights
    if (avgR >= 0.5) {
        insights.push(' <strong>Strong average R.</strong> Your winners are properly sized against losers.');
    } else if (avgR < 0) {
        insights.push(' <strong>Negative expectancy.</strong> Review exit strategy - are you cutting winners too early?');
    }
    
    // Session insights
    const sessionPerf = {};
    ['asian', 'london', 'ny', 'overlap'].forEach(s => {
        const st = trades.filter(t => t.session === s);
        if (st.length >= 3) {
            sessionPerf[s] = st.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / st.length;
        }
    });
    
    const bestSession = Object.entries(sessionPerf).sort((a, b) => b[1] - a[1])[0];
    const worstSession = Object.entries(sessionPerf).sort((a, b) => a[1] - b[1])[0];
    
    if (bestSession && bestSession[1] > 0.3) {
        insights.push(` <strong>${bestSession[0].toUpperCase()}</strong> is your best session (avg ${formatNumber(bestSession[1], 2)}R)`);
    }
    if (worstSession && worstSession[1] < -0.2) {
        insights.push(` Consider avoiding <strong>${worstSession[0].toUpperCase()}</strong> session (avg ${formatNumber(worstSession[1], 2)}R)`);
    }
    
    // Alert type insights
    const tradeReadyTrades = trades.filter(t => t.alertType === 'TRADE_READY');
    const manualTrades = trades.filter(t => t.alertType === 'MANUAL');
    
    if (tradeReadyTrades.length >= 3 && manualTrades.length >= 3) {
        const trAvg = tradeReadyTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / tradeReadyTrades.length;
        const manAvg = manualTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / manualTrades.length;
        
        if (trAvg > manAvg + 0.3) {
            insights.push(' <strong>System alerts outperform manual trades.</strong> Trust the UTCC signals!');
        }
    }
    
    // Trade frequency
    if (trades.length > 10) {
        const weeklyAvg = trades.length / 4; // Rough estimate
        if (weeklyAvg > 10) {
            insights.push(' <strong>High trade frequency.</strong> Target is 5-10/week. Quality over quantity!');
        }
    }
    
    if (insights.length === 0) {
        insights.push(' Keep trading consistently to generate more insights.');
    }
    
    container.innerHTML = insights.map(i => `<div class="insight-item">${i}</div>`).join('');
}

// Add performance-specific styles
const perfStyles = document.createElement('style');
perfStyles.textContent = `
    .insight-item {
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        font-size: 0.9rem;
    }
    #losing-analysis p, #ai-insights .insight-item {
        border-left: 3px solid var(--border-accent);
        padding-left: var(--spacing-md);
    }
`;
document.head.appendChild(perfStyles);

// ============================================
// CLAUDE EXPORT FUNCTIONS
// ============================================

function generateClaudeExport() {
    const period = document.getElementById('export-period').value;
    const includeTrades = document.getElementById('export-trades').checked;
    const includeLessons = document.getElementById('export-lessons').checked;
    const includeSettings = document.getElementById('export-settings').checked;
    
    const allTrades = loadFromStorage(STORAGE_KEYS.trades, []);
    const settings = loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    const scans = loadFromStorage(STORAGE_KEYS.scans, {});
    
    // Filter trades by period
    const now = new Date();
    let cutoffDate = null;
    let periodLabel = 'All Time';
    if (period === 'week') {
        cutoffDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        periodLabel = 'Last 7 Days';
    } else if (period === 'month') {
        cutoffDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        periodLabel = 'Last 30 Days';
    } else if (period === 'quarter') {
        cutoffDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        periodLabel = 'Last 90 Days';
    }
    
    const trades = cutoffDate 
        ? allTrades.filter(t => new Date(t.date) >= cutoffDate)
        : allTrades;
    
    const closedTrades = trades.filter(t => t.status === 'closed');
    const openTrades = trades.filter(t => t.status === 'open');
    
    let report = [];
    
    // Header
    report.push('# FOREX TRADING REVIEW REQUEST');
    report.push('');
    report.push('I am requesting a coaching review of my forex trading performance. Please analyse the data below and provide:');
    report.push('1. Assessment of my trading performance and patterns');
    report.push('2. Identification of strengths and weaknesses');
    report.push('3. Specific actionable improvements for my trading');
    report.push('4. Suggestions for enhancing my UTCC system or Command Centre tool');
    report.push('5. Analysis of my setup notes vs outcomes - am I reading setups correctly?');
    report.push('');
    report.push('---');
    report.push('');
    
    // Account Overview
    report.push('## ACCOUNT OVERVIEW');
    report.push('');
    const drawdownPct = settings.peakBalance > 0 ? ((1 - settings.accountBalance / settings.peakBalance) * 100) : 0;
    report.push(`- **Export Date:** ${new Date().toLocaleDateString('en-AU')} ${new Date().toLocaleTimeString('en-AU')}`);
    report.push(`- **Period:** ${periodLabel}`);
    report.push(`- **Account Balance:** ${formatCurrency(settings.accountBalance, settings.currency)}`);
    report.push(`- **Peak Balance:** ${formatCurrency(settings.peakBalance, settings.currency)}`);
    report.push(`- **Default Risk:** ${settings.defaultRisk}%`);
    report.push(`- **Current Drawdown:** ${formatNumber(drawdownPct, 1)}%`);
    if (drawdownPct >= 5) {
        report.push(`- **Drawdown Status:** ${drawdownPct >= 15 ? 'EMERGENCY - Should stop trading' : drawdownPct >= 10 ? 'STOP - Max 0.5% risk' : 'CAUTION - Reduce position size'}`);
    }
    report.push('');
    
    // Performance Summary
    if (closedTrades.length > 0) {
        const winners = closedTrades.filter(t => (t.rMultiple || 0) > 0);
        const losers = closedTrades.filter(t => (t.rMultiple || 0) < 0);
        const breakeven = closedTrades.filter(t => (t.rMultiple || 0) === 0);
        const totalR = closedTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
        const avgR = totalR / closedTrades.length;
        const winRate = (winners.length / closedTrades.length) * 100;
        const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / winners.length : 0;
        const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / losers.length) : 0;
        const expectancy = (winRate/100 * avgWin) - ((100-winRate)/100 * avgLoss);
        const profitFactor = (avgLoss * losers.length) > 0 ? (avgWin * winners.length) / (avgLoss * losers.length) : 0;
        
        report.push('## PERFORMANCE SUMMARY');
        report.push('');
        report.push(`- **Total Trades:** ${closedTrades.length} closed, ${openTrades.length} open`);
        report.push(`- **Win/Loss/BE:** ${winners.length}W / ${losers.length}L / ${breakeven.length}BE`);
        report.push(`- **Win Rate:** ${formatNumber(winRate, 1)}%`);
        report.push(`- **Total R:** ${totalR >= 0 ? '+' : ''}${formatNumber(totalR, 2)}R`);
        report.push(`- **Average R per Trade:** ${avgR >= 0 ? '+' : ''}${formatNumber(avgR, 2)}R`);
        report.push(`- **Average Winner:** +${formatNumber(avgWin, 2)}R`);
        report.push(`- **Average Loser:** -${formatNumber(avgLoss, 2)}R`);
        report.push(`- **Expectancy:** ${expectancy >= 0 ? '+' : ''}${formatNumber(expectancy, 3)}R per trade`);
        report.push(`- **Profit Factor:** ${formatNumber(profitFactor, 2)}`);
        report.push('');
        
        // Performance by Session
        report.push('### Performance by Session');
        report.push('');
        const sessions = ['asian', 'london', 'ny', 'overlap'];
        const sessionLabels = { asian: 'Tokyo/Asian', london: 'London', ny: 'New York', overlap: 'London/NY Overlap' };
        sessions.forEach(session => {
            const sessionTrades = closedTrades.filter(t => t.session === session);
            if (sessionTrades.length > 0) {
                const sessionWins = sessionTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const sessionR = sessionTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const sessionAvgR = sessionR / sessionTrades.length;
                report.push(`- **${sessionLabels[session] || session}:** ${sessionTrades.length} trades, ${formatNumber((sessionWins/sessionTrades.length)*100, 0)}% WR, ${sessionR >= 0 ? '+' : ''}${formatNumber(sessionR, 2)}R total, ${sessionAvgR >= 0 ? '+' : ''}${formatNumber(sessionAvgR, 2)}R avg`);
            }
        });
        const noSessionTrades = closedTrades.filter(t => !t.session);
        if (noSessionTrades.length > 0) {
            report.push(`- **Unspecified Session:** ${noSessionTrades.length} trades`);
        }
        report.push('');
        
        // Performance by Grade
        report.push('### Performance by Trade Grade');
        report.push('');
        const grades = ['A+', 'A', 'B', 'C', 'D'];
        grades.forEach(grade => {
            const gradeTrades = closedTrades.filter(t => t.grade === grade);
            if (gradeTrades.length > 0) {
                const gradeWins = gradeTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const gradeR = gradeTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const gradeAvgR = gradeR / gradeTrades.length;
                report.push(`- **Grade ${grade}:** ${gradeTrades.length} trades, ${formatNumber((gradeWins/gradeTrades.length)*100, 0)}% WR, ${gradeR >= 0 ? '+' : ''}${formatNumber(gradeR, 2)}R total, ${gradeAvgR >= 0 ? '+' : ''}${formatNumber(gradeAvgR, 2)}R avg`);
            }
        });
        const ungradedTrades = closedTrades.filter(t => !t.grade);
        if (ungradedTrades.length > 0) {
            const ugWins = ungradedTrades.filter(t => (t.rMultiple || 0) > 0).length;
            const ugR = ungradedTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
            report.push(`- **Ungraded:** ${ungradedTrades.length} trades, ${formatNumber((ugWins/ungradedTrades.length)*100, 0)}% WR, ${ugR >= 0 ? '+' : ''}${formatNumber(ugR, 2)}R total`);
        }
        report.push('');
        
        // Performance by Alert Type
        report.push('### Performance by Alert Type (System vs Manual)');
        report.push('');
        const alertTypes = ['TRADE_READY', 'STRONG', 'WATCH', 'MANUAL'];
        const alertLabels = { TRADE_READY: 'TRADE_READY (All 5 criteria)', STRONG: 'STRONG (4/5 criteria)', WATCH: 'WATCH (Developing)', MANUAL: 'MANUAL (Discretionary)' };
        alertTypes.forEach(alertType => {
            const alertTrades = closedTrades.filter(t => t.alertType === alertType);
            if (alertTrades.length > 0) {
                const alertWins = alertTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const alertR = alertTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const alertAvgR = alertR / alertTrades.length;
                report.push(`- **${alertLabels[alertType] || alertType}:** ${alertTrades.length} trades, ${formatNumber((alertWins/alertTrades.length)*100, 0)}% WR, ${alertR >= 0 ? '+' : ''}${formatNumber(alertR, 2)}R total, ${alertAvgR >= 0 ? '+' : ''}${formatNumber(alertAvgR, 2)}R avg`);
            }
        });
        const noAlertTrades = closedTrades.filter(t => !t.alertType);
        if (noAlertTrades.length > 0) {
            report.push(`- **No Alert Type Logged:** ${noAlertTrades.length} trades`);
        }
        report.push('');
        
        // Performance by Entry Zone
        report.push('### Performance by Entry Zone Quality');
        report.push('');
        const zones = ['hot', 'optimal', 'acceptable', 'extended'];
        const zoneLabels = { hot: 'HOT (Best)', optimal: 'OPTIMAL (Good)', acceptable: 'ACCEPTABLE (OK)', extended: 'EXTENDED (Poor)' };
        zones.forEach(zone => {
            const zoneTrades = closedTrades.filter(t => t.entryZone === zone);
            if (zoneTrades.length > 0) {
                const zoneWins = zoneTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const zoneR = zoneTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const zoneAvgR = zoneR / zoneTrades.length;
                report.push(`- **${zoneLabels[zone] || zone}:** ${zoneTrades.length} trades, ${formatNumber((zoneWins/zoneTrades.length)*100, 0)}% WR, ${zoneR >= 0 ? '+' : ''}${formatNumber(zoneR, 2)}R total, ${zoneAvgR >= 0 ? '+' : ''}${formatNumber(zoneAvgR, 2)}R avg`);
            }
        });
        report.push('');
        
        // Performance by Volatility State
        report.push('### Performance by Volatility State');
        report.push('');
        const volStates = ['TREND', 'EXPLODE', 'QUIET', 'LOW'];
        volStates.forEach(vol => {
            const volTrades = closedTrades.filter(t => t.volState === vol);
            if (volTrades.length > 0) {
                const volWins = volTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const volR = volTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const volAvgR = volR / volTrades.length;
                report.push(`- **${vol}:** ${volTrades.length} trades, ${formatNumber((volWins/volTrades.length)*100, 0)}% WR, ${volR >= 0 ? '+' : ''}${formatNumber(volR, 2)}R total, ${volAvgR >= 0 ? '+' : ''}${formatNumber(volAvgR, 2)}R avg`);
            }
        });
        report.push('');
        
        // Performance by Pair
        report.push('### Performance by Currency Pair');
        report.push('');
        const pairs = [...new Set(closedTrades.map(t => t.pair))].sort();
        pairs.forEach(pair => {
            const pairTrades = closedTrades.filter(t => t.pair === pair);
            const pairWins = pairTrades.filter(t => (t.rMultiple || 0) > 0).length;
            const pairR = pairTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
            const pairAvgR = pairR / pairTrades.length;
            report.push(`- **${pair}:** ${pairTrades.length} trades, ${formatNumber((pairWins/pairTrades.length)*100, 0)}% WR, ${pairR >= 0 ? '+' : ''}${formatNumber(pairR, 2)}R total, ${pairAvgR >= 0 ? '+' : ''}${formatNumber(pairAvgR, 2)}R avg`);
        });
        report.push('');
        
        // Performance by Direction
        report.push('### Performance by Direction');
        report.push('');
        ['long', 'short'].forEach(dir => {
            const dirTrades = closedTrades.filter(t => t.direction === dir);
            if (dirTrades.length > 0) {
                const dirWins = dirTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const dirR = dirTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const dirAvgR = dirR / dirTrades.length;
                report.push(`- **${dir.toUpperCase()}:** ${dirTrades.length} trades, ${formatNumber((dirWins/dirTrades.length)*100, 0)}% WR, ${dirR >= 0 ? '+' : ''}${formatNumber(dirR, 2)}R total, ${dirAvgR >= 0 ? '+' : ''}${formatNumber(dirAvgR, 2)}R avg`);
            }
        });
        report.push('');
        
        // Performance by Day of Week
        report.push('### Performance by Day of Week');
        report.push('');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (let day = 0; day < 7; day++) {
            const dayTrades = closedTrades.filter(t => new Date(t.date).getDay() === day);
            if (dayTrades.length > 0) {
                const dayWins = dayTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const dayR = dayTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                const dayAvgR = dayR / dayTrades.length;
                report.push(`- **${dayNames[day]}:** ${dayTrades.length} trades, ${formatNumber((dayWins/dayTrades.length)*100, 0)}% WR, ${dayR >= 0 ? '+' : ''}${formatNumber(dayR, 2)}R total, ${dayAvgR >= 0 ? '+' : ''}${formatNumber(dayAvgR, 2)}R avg`);
            }
        }
        report.push('');
        
        // Performance by Exit Reason
        report.push('### Performance by Exit Reason');
        report.push('');
        const exitReasons = [...new Set(closedTrades.map(t => t.exitReason).filter(Boolean))];
        if (exitReasons.length > 0) {
            exitReasons.forEach(reason => {
                const reasonTrades = closedTrades.filter(t => t.exitReason === reason);
                const reasonWins = reasonTrades.filter(t => (t.rMultiple || 0) > 0).length;
                const reasonR = reasonTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                report.push(`- **${reason}:** ${reasonTrades.length} trades, ${formatNumber((reasonWins/reasonTrades.length)*100, 0)}% WR, ${reasonR >= 0 ? '+' : ''}${formatNumber(reasonR, 2)}R total`);
            });
        } else {
            report.push('*No exit reasons logged*');
        }
        report.push('');
        
        // Streak Analysis
        let maxWinStreak = 0;
        let maxLoseStreak = 0;
        let tempWinStreak = 0;
        let tempLoseStreak = 0;
        let currentStreak = { type: null, count: 0 };
        
        const sortedTrades = [...closedTrades].sort((a, b) => new Date(a.date) - new Date(b.date));
        sortedTrades.forEach(t => {
            if ((t.rMultiple || 0) > 0) {
                tempWinStreak++;
                tempLoseStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
                currentStreak = { type: 'win', count: tempWinStreak };
            } else if ((t.rMultiple || 0) < 0) {
                tempLoseStreak++;
                tempWinStreak = 0;
                maxLoseStreak = Math.max(maxLoseStreak, tempLoseStreak);
                currentStreak = { type: 'loss', count: tempLoseStreak };
            }
        });
        
        report.push('### Streak Analysis');
        report.push('');
        report.push(`- **Max Win Streak:** ${maxWinStreak} trades`);
        report.push(`- **Max Lose Streak:** ${maxLoseStreak} trades`);
        report.push(`- **Current Streak:** ${currentStreak.count} ${currentStreak.type === 'win' ? 'wins' : currentStreak.type === 'loss' ? 'losses' : 'N/A'}`);
        report.push('');
        
        // Trend Score Analysis
        const tradesWithScore = closedTrades.filter(t => t.trendScore != null);
        if (tradesWithScore.length > 0) {
            report.push('### Trend Score Analysis');
            report.push('');
            const avgScore = tradesWithScore.reduce((sum, t) => sum + t.trendScore, 0) / tradesWithScore.length;
            const winnerScores = tradesWithScore.filter(t => (t.rMultiple || 0) > 0);
            const loserScores = tradesWithScore.filter(t => (t.rMultiple || 0) < 0);
            const avgWinnerScore = winnerScores.length > 0 ? winnerScores.reduce((sum, t) => sum + t.trendScore, 0) / winnerScores.length : 0;
            const avgLoserScore = loserScores.length > 0 ? loserScores.reduce((sum, t) => sum + t.trendScore, 0) / loserScores.length : 0;
            
            report.push(`- **Average Trend Score (all trades):** ${formatNumber(avgScore, 0)}`);
            report.push(`- **Average Trend Score (winners):** ${formatNumber(avgWinnerScore, 0)}`);
            report.push(`- **Average Trend Score (losers):** ${formatNumber(avgLoserScore, 0)}`);
            
            // Score range breakdown
            const highScore = tradesWithScore.filter(t => t.trendScore >= 85);
            const midScore = tradesWithScore.filter(t => t.trendScore >= 75 && t.trendScore < 85);
            const lowScore = tradesWithScore.filter(t => t.trendScore < 75);
            
            if (highScore.length > 0) {
                const hsWins = highScore.filter(t => (t.rMultiple || 0) > 0).length;
                const hsR = highScore.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                report.push(`- **Grade A+:** ${highScore.length} trades, ${formatNumber((hsWins/highScore.length)*100, 0)}% WR, ${hsR >= 0 ? '+' : ''}${formatNumber(hsR, 2)}R`);
            }
            if (midScore.length > 0) {
                const msWins = midScore.filter(t => (t.rMultiple || 0) > 0).length;
                const msR = midScore.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                report.push(`- **Score 75-84:** ${midScore.length} trades, ${formatNumber((msWins/midScore.length)*100, 0)}% WR, ${msR >= 0 ? '+' : ''}${formatNumber(msR, 2)}R`);
            }
            if (lowScore.length > 0) {
                const lsWins = lowScore.filter(t => (t.rMultiple || 0) > 0).length;
                const lsR = lowScore.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
                report.push(`- **Score <75:** ${lowScore.length} trades, ${formatNumber((lsWins/lowScore.length)*100, 0)}% WR, ${lsR >= 0 ? '+' : ''}${formatNumber(lsR, 2)}R`);
            }
            report.push('');
        }
        
    } else {
        report.push('## PERFORMANCE SUMMARY');
        report.push('');
        report.push('*No closed trades in this period.*');
        report.push('');
    }
    
    // Detailed Trade Log with Setup Notes
    if (includeTrades && closedTrades.length > 0) {
        report.push('## DETAILED TRADE LOG');
        report.push('');
        report.push('Each trade with full context for analysis:');
        report.push('');
        
        const sortedClosedTrades = [...closedTrades].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedClosedTrades.forEach((t, idx) => {
            const rClass = (t.rMultiple || 0) >= 0 ? 'WIN' : 'LOSS';
            report.push(`### Trade ${idx + 1}: ${t.pair} ${(t.direction || '').toUpperCase()} - ${rClass} (${t.rMultiple >= 0 ? '+' : ''}${formatNumber(t.rMultiple || 0, 2)}R)`);
            report.push('');
            report.push(`- **Date:** ${new Date(t.date).toLocaleDateString('en-AU')} ${new Date(t.date).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`);
            report.push(`- **Pair:** ${t.pair}`);
            report.push(`- **Direction:** ${(t.direction || 'Unknown').toUpperCase()}`);
            report.push(`- **Alert Type:** ${t.alertType || 'Not logged'}`);
            report.push(`- **Grade:** ${t.grade || 'Ungraded'}`);
            report.push(`- **Session:** ${t.session ? t.session.charAt(0).toUpperCase() + t.session.slice(1) : 'Not logged'}`);
            report.push(`- **Entry:** ${t.entry || '-'} | **Exit:** ${t.exit || '-'} | **SL:** ${t.stop || '-'} | **TP:** ${t.tp || '-'}`);
            report.push(`- **Trend Score:** ${t.trendScore != null ? t.trendScore : 'Not logged'}`);
            report.push(`- **Entry Zone:** ${t.entryZone ? t.entryZone.toUpperCase() : 'Not logged'}`);
            report.push(`- **Volatility State:** ${t.volState || 'Not logged'}`);
            report.push(`- **Exit Reason:** ${t.exitReason || 'Not logged'}`);
            report.push(`- **Risk Amount:** ${t.riskAmount ? formatCurrency(t.riskAmount) : 'Not logged'}`);
            report.push(`- **R-Multiple:** ${t.rMultiple != null ? (t.rMultiple >= 0 ? '+' : '') + formatNumber(t.rMultiple, 2) + 'R' : 'Not calculated'}`);
            report.push(`- **P&L:** ${t.pnl != null ? formatCurrency(t.pnl) : 'Not calculated'}`);
            
            if (t.notes && t.notes.trim()) {
                report.push('');
                report.push('**Setup Notes (Pre-Trade Reasoning):**');
                report.push(`> ${t.notes.replace(/\n/g, '\n> ')}`);
            }
            
            if (t.lessons && t.lessons.trim()) {
                report.push('');
                report.push('**Lessons Learned (Post-Trade Reflection):**');
                report.push(`> ${t.lessons.replace(/\n/g, '\n> ')}`);
            }
            
            report.push('');
            report.push('---');
            report.push('');
        });
    }
    
    // Setup Notes Summary (for pattern recognition)
    if (includeLessons) {
        const tradesWithNotes = allTrades.filter(t => t.notes && t.notes.trim().length > 0);
        const tradesWithLessons = allTrades.filter(t => t.lessons && t.lessons.trim().length > 0);
        
        if (tradesWithNotes.length > 0) {
            report.push('## SETUP NOTES SUMMARY');
            report.push('');
            report.push('Pre-trade reasoning and setup analysis. Look for patterns in how I assess setups:');
            report.push('');
            
            // Group by outcome
            const winningSetups = tradesWithNotes.filter(t => (t.rMultiple || 0) > 0);
            const losingSetups = tradesWithNotes.filter(t => (t.rMultiple || 0) < 0);
            
            if (winningSetups.length > 0) {
                report.push('### Winning Trade Setups');
                report.push('');
                winningSetups.slice(0, 15).forEach(t => {
                    report.push(`**${new Date(t.date).toLocaleDateString('en-AU')} ${t.pair} (+${formatNumber(t.rMultiple || 0, 2)}R):** ${t.notes.replace(/\n/g, ' ').substring(0, 200)}${t.notes.length > 200 ? '...' : ''}`);
                    report.push('');
                });
            }
            
            if (losingSetups.length > 0) {
                report.push('### Losing Trade Setups');
                report.push('');
                losingSetups.slice(0, 15).forEach(t => {
                    report.push(`**${new Date(t.date).toLocaleDateString('en-AU')} ${t.pair} (${formatNumber(t.rMultiple || 0, 2)}R):** ${t.notes.replace(/\n/g, ' ').substring(0, 200)}${t.notes.length > 200 ? '...' : ''}`);
                    report.push('');
                });
            }
        }
        
        if (tradesWithLessons.length > 0) {
            report.push('## LESSONS LEARNED SUMMARY');
            report.push('');
            report.push('Post-trade reflections. Look for recurring themes and whether I am learning from mistakes:');
            report.push('');
            
            tradesWithLessons.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).forEach(t => {
                const outcome = (t.rMultiple || 0) > 0 ? 'WIN' : (t.rMultiple || 0) < 0 ? 'LOSS' : 'BE';
                report.push(`**${new Date(t.date).toLocaleDateString('en-AU')} ${t.pair} (${outcome}, ${t.rMultiple >= 0 ? '+' : ''}${formatNumber(t.rMultiple || 0, 2)}R):**`);
                report.push(`> ${t.lessons.replace(/\n/g, '\n> ')}`);
                report.push('');
            });
        }
    }
    
    // Open Trades
    if (openTrades.length > 0) {
        report.push('## CURRENTLY OPEN TRADES');
        report.push('');
        openTrades.forEach(t => {
            const age = getTradeAge(t.date);
            report.push(`### ${t.pair} ${(t.direction || '').toUpperCase()}`);
            report.push('');
            report.push(`- **Entry:** ${t.entry} | **SL:** ${t.stop || 'NOT SET'} | **TP:** ${t.tp || 'NOT SET'}`);
            report.push(`- **Age:** ${age.text}`);
            report.push(`- **Grade:** ${t.grade || 'Ungraded'} | **Alert:** ${t.alertType || 'Not logged'}`);
            report.push(`- **Trend Score:** ${t.trendScore || '-'} | **Vol State:** ${t.volState || '-'} | **Zone:** ${t.entryZone || '-'}`);
            if (t.notes) report.push(`- **Setup Notes:** ${t.notes.replace(/\n/g, ' ')}`);
            report.push('');
        });
    }
    
    // Daily Scans Summary (if available)
    const scanDates = Object.keys(scans).sort().reverse().slice(0, 7);
    if (scanDates.length > 0) {
        report.push('## RECENT DAILY SCANS');
        report.push('');
        report.push('Summary of recent market scanning activity:');
        report.push('');
        scanDates.forEach(date => {
            const scan = scans[date];
            if (scan && scan.pairs) {
                const pairsScanned = Object.keys(scan.pairs).length;
                const tradeReady = Object.values(scan.pairs).filter(p => p.alertType === 'TRADE_READY').length;
                const strong = Object.values(scan.pairs).filter(p => p.alertType === 'STRONG').length;
                report.push(`- **${date}:** ${pairsScanned} pairs scanned, ${tradeReady} TRADE_READY, ${strong} STRONG`);
            }
        });
        report.push('');
    }
    
    // Settings & System Info
    if (includeSettings) {
        report.push('## MY TRADING SYSTEM CONFIGURATION');
        report.push('');
        report.push('### UTCC (Unified Trading Command Center) - 5 Criteria System');
        report.push('');
        report.push('All 5 criteria must pass before trade execution:');
        report.push('');
        report.push('1. **Trend Score:** >=80 required (0-100 scale based on EMA alignment across timeframes)');
        report.push('2. **MTF Alignment:** Higher timeframes must confirm direction');
        report.push('3. **Volatility State:** TREND or EXPLODE preferred; avoid LOW volatility');
        report.push('4. **Entry Zone:** HOT or OPTIMAL only; EXTENDED zones rejected');
        report.push('5. **News Safety:** 2-hour buffer around high-impact news');
        report.push('');
        report.push('### Alert Types & Meanings');
        report.push('');
        report.push('- **TRADE_READY:** All 5 criteria pass - highest confidence, full position');
        report.push('- **STRONG:** 4/5 criteria pass - needs manual validation of missing criterion');
        report.push('- **WATCH:** Developing setup - not ready, monitor only');
        report.push('- **MANUAL:** Discretionary entry without UTCC signal');
        report.push('');
        report.push('### Trade Grading System');
        report.push('');
        report.push('- **A+:** Perfect setup - all criteria optimal, high confluence, textbook entry');
        report.push('- **A:** Strong setup - all criteria pass, good confluence');
        report.push('- **B:** Acceptable setup - criteria pass but minor concerns');
        report.push('- **C:** Marginal setup - some criteria borderline, reduced conviction');
        report.push('- **D:** Poor setup - should not have traded, rules violated');
        report.push('');
        report.push('### Risk Management Rules');
        report.push('');
        report.push(`- **Standard Risk:** ${settings.defaultRisk}% per trade`);
        report.push('- **A+ Setups:** Can use up to 2% risk');
        report.push('- **B/C Setups:** Reduce to 1% risk or less');
        report.push('- **Drawdown Protocol:**');
        report.push('  - -5% from peak: Reduce position size by 50%');
        report.push('  - -10% from peak: Maximum 0.5% risk per trade');
        report.push('  - -15% from peak: Stop trading, full system review required');
        report.push('');
        report.push('### My Trading Schedule (AEST)');
        report.push('');
        report.push('- **Tokyo Session:** 9:00 AM - 5:00 PM AEST');
        report.push('- **London Session:** 5:00 PM - 2:00 AM AEST');
        report.push('- **New York Session:** 10:00 PM - 7:00 AM AEST');
        report.push('- **Best Windows:** Tokyo open (9-11 AM), London open (5-7 PM), London/NY overlap (10 PM - 12 AM)');
        report.push('');
        report.push('### Core & Rotation Pairs');
        report.push('');
        report.push(`- **Core Pairs (Always Watch):** ${CORE_PAIRS.join(', ')}`);
        report.push(`- **Rotation Pairs (Situational):** ${ROTATION_PAIRS.join(', ')}`);
        report.push('');
    }
    
    // Coaching Questions
    report.push('## QUESTIONS FOR COACHING REVIEW');
    report.push('');
    report.push('Please address these specific areas:');
    report.push('');
    report.push('1. **Pattern Analysis:** What patterns do you see in my winning vs losing trades? Any blind spots?');
    report.push('2. **Setup Quality:** Am I correctly identifying and grading setups based on my notes? Do my losses show setup misreads?');
    report.push('3. **Session/Pair Selection:** Should I avoid any sessions, pairs, or days based on my results?');
    report.push('4. **System Adherence:** Am I following my UTCC rules? Any signs of discipline breakdown or overtrading?');
    report.push('5. **Expectancy Improvement:** What specific changes would most improve my expectancy?');
    report.push('6. **Lessons Integration:** Am I learning from my mistakes? Are the same errors recurring?');
    report.push('7. **Tool Enhancement:** Any features to add to the Command Centre that would help me trade better?');
    report.push('8. **UTCC Refinement:** Any suggested adjustments to my 5-criteria system based on the results?');
    report.push('');
    report.push('---');
    report.push('');
    report.push('*Report generated by Forex Trading Command Centre v' + APP_VERSION + '*');
    
    // Display the report
    const textarea = document.getElementById('claude-export-text');
    const preview = document.getElementById('claude-export-preview');
    const copyBtn = document.getElementById('copy-export-btn');
    
    textarea.value = report.join('\n');
    preview.style.display = 'block';
    copyBtn.disabled = false;
    
    showNotification('Report generated! Review and copy to clipboard.', 'success');
}

function copyExportToClipboard() {
    const textarea = document.getElementById('claude-export-text');
    textarea.select();
    document.execCommand('copy');
    
    // Also try modern clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textarea.value);
    }
    
    showNotification('Report copied to clipboard! Paste into Claude.', 'success');
}

// CHUNK 6 COMPLETE - Performance Analytics
