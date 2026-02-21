// guide-tab.js - FCC Phase 3 extraction
// Guide tab - goals, milestones, confluence

// ============================================
// CHUNK 8: GUIDE TAB - GOALS, MILESTONES, CONFLUENCE
// ============================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DEFAULT_MONTHLY_TARGETS = {
    trades: 30, // 5-10 per week  4 weeks
    winRate: 50,
    rTarget: 10 // Total R for month
};

function initGoalsTracker() {
    const grid = document.getElementById('monthly-goals-grid');
    if (!grid) return;
    
    const trades = loadFromStorage(STORAGE_KEYS.trades, []).filter(t => t.status === 'closed');
    const goals = loadFromStorage(STORAGE_KEYS.goals, {});
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    let html = '';
    
    MONTHS.forEach((month, index) => {
        const monthTrades = trades.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === currentYear && d.getMonth() === index;
        });
        
        const tradeCount = monthTrades.length;
        const winners = monthTrades.filter(t => (t.rMultiple || 0) > 0);
        const winRate = tradeCount > 0 ? (winners.length / tradeCount * 100) : 0;
        const totalR = monthTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
        
        const isPast = index < currentMonth;
        const isCurrent = index === currentMonth;
        const isFuture = index > currentMonth;
        
        let statusClass = 'month-future';
        let statusIcon = '';
        
        if (isPast || isCurrent) {
            if (tradeCount >= 20 && winRate >= 50 && totalR >= 5) {
                statusClass = 'month-success';
                statusIcon = '';
            } else if (tradeCount >= 10 && winRate >= 45) {
                statusClass = 'month-partial';
                statusIcon = '';
            } else if (tradeCount > 0) {
                statusClass = 'month-active';
                statusIcon = '';
            }
        }
        
        if (isCurrent) statusClass += ' month-current';
        
        html += `
            <div class="month-card ${statusClass}">
                <div class="month-header">
                    <span class="month-name">${month}</span>
                    <span class="month-status">${statusIcon}</span>
                </div>
                <div class="month-stats">
                    <div class="month-stat">
                        <span class="stat-num">${tradeCount}</span>
                        <span class="stat-lbl">trades</span>
                    </div>
                    <div class="month-stat">
                        <span class="stat-num ${winRate >= 50 ? 'text-pass' : winRate > 0 ? 'text-fail' : ''}">${tradeCount > 0 ? formatNumber(winRate, 0) + '%' : '-'}</span>
                        <span class="stat-lbl">win</span>
                    </div>
                    <div class="month-stat">
                        <span class="stat-num ${totalR >= 0 ? 'text-pass' : 'text-fail'}">${tradeCount > 0 ? formatNumber(totalR, 1) + 'R' : '-'}</span>
                        <span class="stat-lbl">total</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
    
    // Update summary
    updateGoalsSummary(trades, currentYear);
    
    // Check milestones
    checkMilestones(trades);
}

function updateGoalsSummary(trades, year) {
    const yearTrades = trades.filter(t => new Date(t.date).getFullYear() === year);
    const currentMonth = new Date().getMonth();
    
    // Count months with activity
    const monthsWithTrades = new Set(yearTrades.map(t => new Date(t.date).getMonth())).size;
    const monthsComplete = Math.min(currentMonth + 1, 12);
    
    const totalTrades = yearTrades.length;
    const winners = yearTrades.filter(t => (t.rMultiple || 0) > 0);
    const avgWinRate = totalTrades > 0 ? (winners.length / totalTrades * 100) : 0;
    const totalR = yearTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
    
    updateElement('goals-months-complete', `${monthsWithTrades}/${monthsComplete}`);
    updateElement('goals-total-trades', totalTrades);
    updateElement('goals-avg-winrate', totalTrades > 0 ? formatNumber(avgWinRate, 0) + '%' : '-%');
    updateElement('goals-total-r', formatNumber(totalR, 1) + 'R', totalR >= 0 ? 'text-pass' : 'text-fail');
}

function checkMilestones(trades) {
    const milestones = {
        'first-trade': trades.length >= 1,
        'ten-trades': trades.length >= 10,
        'hundred-trades': trades.length >= 100,
        'fifty-winrate': false,
        'positive-month': false,
        'consistent-profits': false
    };
    
    // Check 50% win rate with 20+ trades
    if (trades.length >= 20) {
        const winners = trades.filter(t => (t.rMultiple || 0) > 0);
        milestones['fifty-winrate'] = (winners.length / trades.length) >= 0.5;
    }
    
    // Check for positive month
    const monthlyR = {};
    trades.forEach(t => {
        const monthKey = new Date(t.date).toISOString().slice(0, 7);
        monthlyR[monthKey] = (monthlyR[monthKey] || 0) + (t.rMultiple || 0);
    });
    
    const positiveMonths = Object.values(monthlyR).filter(r => r > 0);
    milestones['positive-month'] = positiveMonths.length >= 1;
    
    // Check for 3 consecutive profitable months
    const sortedMonths = Object.entries(monthlyR).sort((a, b) => a[0].localeCompare(b[0]));
    let consecutive = 0;
    let maxConsecutive = 0;
    sortedMonths.forEach(([month, r]) => {
        if (r > 0) {
            consecutive++;
            maxConsecutive = Math.max(maxConsecutive, consecutive);
        } else {
            consecutive = 0;
        }
    });
    milestones['consistent-profits'] = maxConsecutive >= 3;
    
    // Update UI
    Object.entries(milestones).forEach(([key, achieved]) => {
        const el = document.getElementById(`ms-${key}`);
        if (el) {
            el.textContent = achieved ? '' : '';
            el.parentElement.classList.toggle('achieved', achieved);
        }
    });
}

function resetGoals() {
    if (!confirm('Reset all goal tracking data?')) return;
    saveToStorage(STORAGE_KEYS.goals, {});
    initGoalsTracker();
    showToast('Goals reset', 'info');
}

// Add guide-specific styles
const guideStyles = document.createElement('style');
guideStyles.textContent = `
    /* Step-by-Step Guide */
    .guide-steps {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
    }
    .guide-step {
        display: flex;
        gap: var(--spacing-md);
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        border-left: 3px solid var(--border-primary);
    }
    .guide-step.step-execute {
        border-left-color: var(--color-pass);
        background: rgba(34, 197, 94, 0.1);
    }
    .step-number {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
        border-radius: 50%;
        font-weight: 700;
        flex-shrink: 0;
    }
    .step-execute .step-number {
        background: var(--color-pass);
        color: white;
    }
    .step-content h4 {
        margin-bottom: 4px;
        font-size: 1rem;
    }
    .step-content p {
        color: var(--text-secondary);
        font-size: 0.85rem;
        margin: 0;
    }
    
    /* Exit Rules */
    .exit-rule-box, .info-box {
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
    }
    .exit-rule-box h4, .info-box h4 {
        margin-bottom: var(--spacing-sm);
        font-size: 0.95rem;
    }
    .exit-rule-box ul, .info-box ul {
        margin: 0;
        padding-left: var(--spacing-lg);
    }
    .exit-rule-box li, .info-box li {
        font-size: 0.85rem;
        margin-bottom: 4px;
        color: var(--text-secondary);
    }
    
    /* DO's and DON'Ts */
    .rules-box {
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
    }
    .rules-do {
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid var(--color-pass);
    }
    .rules-dont {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid var(--color-fail);
    }
    .rules-box h4 {
        margin-bottom: var(--spacing-sm);
    }
    .rules-box ul {
        margin: 0;
        padding-left: var(--spacing-lg);
    }
    .rules-box li {
        font-size: 0.85rem;
        margin-bottom: 4px;
    }
    
    /* Monthly Goals Grid */
    .goals-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: var(--spacing-sm);
    }
    @media (max-width: 900px) {
        .goals-grid { grid-template-columns: repeat(4, 1fr); }
    }
    @media (max-width: 600px) {
        .goals-grid { grid-template-columns: repeat(3, 1fr); }
    }
    .month-card {
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        border: 2px solid transparent;
        text-align: center;
    }
    .month-card.month-current {
        border-color: var(--color-info);
    }
    .month-card.month-success {
        border-color: var(--color-pass);
        background: rgba(34, 197, 94, 0.1);
    }
    .month-card.month-partial {
        border-color: var(--color-warning);
    }
    .month-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-xs);
    }
    .month-name {
        font-weight: 600;
        font-size: 0.85rem;
    }
    .month-stats {
        display: flex;
        justify-content: space-around;
        gap: 4px;
    }
    .month-stat {
        display: flex;
        flex-direction: column;
        font-size: 0.7rem;
    }
    .month-stat .stat-num {
        font-weight: 600;
        font-size: 0.9rem;
    }
    .month-stat .stat-lbl {
        color: var(--text-muted);
    }
    
    /* Milestones */
    .milestone-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }
    .milestone {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
    }
    .milestone.achieved {
        background: rgba(34, 197, 94, 0.1);
    }
    .milestone-icon {
        font-size: 1.2rem;
    }
    .milestone-status {
        margin-left: auto;
    }
    
    /* Confluence */
    .confluence-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--spacing-sm);
    }
    @media (max-width: 600px) {
        .confluence-grid { grid-template-columns: 1fr; }
    }
    .confluence-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all var(--transition-fast);
    }
    .confluence-item:hover {
        background: var(--bg-hover);
    }
    .confluence-item:has(input:checked) {
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid var(--color-pass);
    }
    .confluence-item input {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }
    .confluence-label {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
    }
    .confluence-icon {
        font-size: 1.1rem;
    }
    .confluence-strength {
        margin-top: var(--spacing-md);
    }
    .strength-bar {
        height: 12px;
        background: var(--bg-tertiary);
        border-radius: 6px;
        overflow: hidden;
    }
    .strength-fill {
        height: 100%;
        background: var(--color-fail);
        transition: all 0.3s ease;
        border-radius: 6px;
    }
    .strength-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        color: var(--text-muted);
        margin-top: 4px;
    }
`;
document.head.appendChild(guideStyles);

// Initialize goals tracker on tab show
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGoalsTracker, 500);
});

// CHUNK 8 COMPLETE - Guide Tab (Goals, Milestones, Confluence)
